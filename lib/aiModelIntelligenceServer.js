// v329: separate admin-only intelligence. No writes to ai_model_settings, prompts or generation engines.
import {allowedOfficialModelUrl,parseOfficialOpenAiTextPrices,updateAvailabilitySignal,
  deterministicEventId,visiblePageText,OFFICIAL_OPENAI_DEPRECATIONS_URL,OFFICIAL_OPENAI_CHANGELOG_URL,
  OFFICIAL_KLING_DOCS_URL} from './aiModelIntelligence.js';
import {discoverOpenAiModels} from './aiModelDiscovery.js';
import {createHash} from 'node:crypto';
import {getConfiguredAdminEmails} from './adminAuth.js';

async function retrieveOfficialPage(url){
  const r=await fetch(url,{headers:{'User-Agent':'Spreelo-Model-Intelligence/1.0','Accept':'text/html'},
    cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error(`Official source HTTP ${r.status}`);
  const type=r.headers.get('content-type')||'';
  if(!type.includes('text/html'))throw Error('Official source did not return HTML');
  const body=await r.text();
  if(body.length>2500000)throw Error('Official source exceeded size limit');
  return body;
}

async function insertNews(db, news) {
  if(!news.length)return;
  const {error}=await db.from('ai_market_news').upsert(news,{onConflict:'id',ignoreDuplicates:true});
  if(error)throw error;
}

export async function syncOfficialPricing(db, activeModels, day) {
  const {data:existing,error:readError}=await db.from('ai_model_pricing')
    .select('provider,model,unit,amount_usd,source_url,verified_at').eq('provider','openai').limit(1000);
  if(readError)throw readError;
  const known=new Map((existing||[]).map(x=>[`${x.model}:${x.unit}`,x]));
  const selected=[...new Set(activeModels)].filter(allowedOfficialModelUrl).slice(0,12);
  let checked=0,updated=0,failed=0;const changes=[];
  for(const model of selected) {
    const url=allowedOfficialModelUrl(model);
    try {
      const prices=parseOfficialOpenAiTextPrices(await retrieveOfficialPage(url),model);
      if(prices.length!==3){failed++;continue;}
      checked++;
      const rows=prices.map(x=>({...x,source_url:url,verified_at:new Date().toISOString()}));
      const {error}=await db.from('ai_model_pricing').upsert(rows,{onConflict:'provider,model,unit'});
      if(error)throw error;
      for(const row of rows){
        const old=known.get(`${row.model}:${row.unit}`);
        if(old && Number(old.amount_usd)!==Number(row.amount_usd)){
          updated++;
          changes.push({id:deterministicEventId('price',`${day}:${model}:${row.unit}:${row.amount_usd}`),
            provider:'OpenAI',title:`Prisändring för ${model}: ${row.unit}`,url,category:'api_or_price',severity:'important',
            summary:`Tidigare ${Number(old.amount_usd)} USD, nytt ${row.amount_usd} USD för ${row.unit}. Officiellt modellpris; gäller inte en komplett Spreelo-generering.`});
        }
      }
    }catch{failed++;}
  }
  await insertNews(db,changes);
  return {attempted:selected.length,verified:checked,unavailable:failed,priceChanges:updated,events:changes};
}

export async function scanActiveModelAvailability(db, day) {
  // Only a *successful* authenticated complete OpenAI listing counts as absence evidence.
  const listed=await discoverOpenAiModels();
  const live=new Set(listed);
  const {data:settings,error:readError}=await db.from('ai_model_settings')
    .select('purpose,provider,model').eq('provider','openai');
  if(readError)throw readError;
  const models=[...new Set((settings||[]).map(x=>x.model))];
  const {data:prior,error:priorError}=await db.from('ai_model_availability_signals')
    .select('*').eq('provider','openai').in('model',models.length?models:['__none__']);
  if(priorError)throw priorError;
  const map=new Map((prior||[]).map(x=>[x.model,x]));
  const events=[],rows=[];
  for(const model of models){
    const old=map.get(model);
    const next=updateAvailabilitySignal(old,{present:live.has(model),day});
    if(!next.changed)continue;
    rows.push({provider:'openai',model,last_checked_day:next.last_checked_day,
      consecutive_missing:next.consecutive_missing,first_missing_at:next.first_missing_at,
      last_present_at:next.last_present_at,alert_status:next.alert_status});
    if(next.alert_status==='warning' && old?.alert_status!=='warning'){
      events.push({id:deterministicEventId('missing',`${model}:${next.first_missing_at}`),provider:'OpenAI',
        title:`Aktiv modell saknas i API-listan: ${model}`,url:OFFICIAL_OPENAI_DEPRECATIONS_URL,
        severity:'important',category:'availability_warning',
        summary:`Modellen saknades vid ${next.consecutive_missing} separata dagliga API-listningar. Detta bevisar INTE att modellen har avvecklats. Ingen automatisk ändring har gjorts.`});
    }
  }
  if(rows.length){const {error}=await db.from('ai_model_availability_signals').upsert(rows,{onConflict:'provider,model'});if(error)throw error;}
  await insertNews(db,events);
  return {checkedModels:models.length,missingModels:rows.filter(x=>x.consecutive_missing>0).length,warnings:events.length,events};
}

const OFFICIAL_SOURCES=[
  {key:'openai_deprecations',provider:'OpenAI',url:OFFICIAL_OPENAI_DEPRECATIONS_URL,severity:'important',title:'OpenAI har uppdaterat sidan för avvecklingar'},
  {key:'openai_changelog',provider:'OpenAI',url:OFFICIAL_OPENAI_CHANGELOG_URL,severity:'info',title:'OpenAI har uppdaterat API-ändringsloggen'},
  {key:'kling_documentation',provider:'Kling',url:OFFICIAL_KLING_DOCS_URL,severity:'info',title:'Kling har uppdaterat modellöversikten'},
];
export async function scanOfficialDocumentation(db,day){
  const {data:old,error}=await db.from('ai_provider_source_snapshots').select('key,content_hash');
  if(error)throw error;
  const previous=new Map((old||[]).map(x=>[x.key,x.content_hash]));
  let checked=0,failed=0;const events=[];
  for(const source of OFFICIAL_SOURCES){
    try {
      const page=await retrieveOfficialPage(source.url);
      // Stable content fingerprints: ignore scripts and markup but retain published text.
      const visible=visiblePageText(page).replace(/\s+/g,' ').slice(0,200000);
      if(visible.length<100)throw Error('Official page missing readable content');
      const hash=createHash('sha256').update(visible).digest('hex');
      const {error:upsertError}=await db.from('ai_provider_source_snapshots').upsert({key:source.key,
        provider:source.provider,url:source.url,content_hash:hash,last_checked_at:new Date().toISOString()},{onConflict:'key'});
      if(upsertError)throw upsertError;
      checked++;
      if(previous.has(source.key) && previous.get(source.key)!==hash){
        events.push({id:deterministicEventId('source',`${source.key}:${hash}`),provider:source.provider,
          title:source.title,url:source.url,severity:source.severity,category:'official_source_changed',
          summary:'En officiell dokumentationssida har ändrats. Kontrollera innehållet; ingen modellavveckling eller prisändring har automatiskt antagits.'});
      }
    }catch{failed++;}
  }
  await insertNews(db,events);
  return {checked,failed,events};
}

export async function sendImportantModelAlerts(events,{idempotencyKey=null}={}){
  const important=events.filter(x=>x.severity==='important'||x.severity==='critical');
  if(!important.length)return 'not_needed';
  const recipients=[...new Set([...getConfiguredAdminEmails(),...String(process.env.ADMIN_ALERT_EMAIL||'').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean),'contact@spreelo.com'])];
  if(!process.env.RESEND_API_KEY)return 'no_resend_key';
  const lines=important.slice(0,12).map(x=>`${x.title}\n${x.summary}\n${x.url}`).join('\n\n');
  try {
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.RESEND_API_KEY}`,
      ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
      body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||'Spreelo <noreply@spreelo.com>',to:recipients,
        subject:`Spreelo AI Control: ${important.length} viktiga förändringar`,
        text:`Automatisk modellbevakning (inga produktionsmodeller har ändrats):\n\n${lines}\n\nGranska i AI Control Center.`})});
    return r.ok?'sent':`failed_${r.status}`;
  }catch{return 'failed';}
}
