// Spreelo v329: pure, conservative price and availability analysis.
// Official published prices are not interchangeable across modalities or units.
import { createHash } from 'node:crypto';

export const OFFICIAL_OPENAI_MODELS_URL = 'https://developers.openai.com/api/docs/models/';
export const OFFICIAL_OPENAI_DEPRECATIONS_URL = 'https://developers.openai.com/api/docs/deprecations';
export const OFFICIAL_OPENAI_CHANGELOG_URL = 'https://developers.openai.com/api/docs/changelog';
export const OFFICIAL_KLING_DOCS_URL = 'https://kling.ai/document-api/quickStart/productIntroduction/overview';
const MODEL_ID = /^gpt-[a-z0-9][a-z0-9._-]{0,100}$/;

export function allowedOfficialModelUrl(model) {
  return MODEL_ID.test(String(model || '')) && !/\b(?:ft|audio|realtime|tts|transcribe|image)\b/i.test(model)
    ? `${OFFICIAL_OPENAI_MODELS_URL}${encodeURIComponent(model)}` : null;
}

// Extract human-visible text only, not JSON-LD/scripts or embedded prices for unrelated products.
export function visiblePageText(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi,'')
    .replace(/<(?:br|\/p|\/div|\/tr|\/td|\/th|\/li|\/h[1-6]|\/section)\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/g,"'")
    .replace(/[\t\r ]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
}

function dollar(value) {
  const s=String(value||'').replace(/,/g,'');
  if(!/^\$\d+(?:\.\d{1,8})?$/.test(s))return null;
  const n=Number(s.slice(1));
  return Number.isFinite(n) && n>=0 && n<10000 ? n : null;
}

// Only accept the standard text token prices from an individual official model page.
// Any ambiguous page yields [] rather than guessing a number or charging tier.
export function parseOfficialOpenAiTextPrices(html, model) {
  if(!allowedOfficialModelUrl(model))return [];
  const lines=visiblePageText(html).split('\n').map(x=>x.trim()).filter(Boolean);
  // Confirm the page's actual h1 model identity; comparison sections mention other models.
  const title=String(html||'').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'';
  const identity=title.replace(/<[^>]*>/g,' ').replace(/[^a-z0-9]+/gi,'').toLowerCase();
  // Official headings use display names (e.g. 'GPT-5.6 Sol'), not API IDs.
  if(!lines.length || identity!==String(model).replace(/[^a-z0-9]+/gi,'').toLowerCase())return [];
  const anchor=lines.findIndex((s,i)=>/^Text tokens$/i.test(s) && lines.slice(i+1,i+8).some(x=>/^Per 1M tokens$/i.test(x)));
  if(anchor<0)return [];
  const nextSection=lines.findIndex((line,i)=>i>anchor && /^(?:Quick comparison|Image tokens|Image output|Video output|Audio tokens|Pricing examples)$/i.test(line));
  const end=Math.min(lines.length,anchor+35,nextSection>anchor?nextSection:lines.length);
  const rows=[];
  const units=[['Input','input_1m_tokens'],['Cached input','cached_input_1m_tokens'],['Output','output_1m_tokens']];
  for(const [label,unit] of units){
    const indexes=[];
    for(let i=anchor+1;i<end;i++)if(lines[i].toLowerCase()===label.toLowerCase())indexes.push(i);
    if(indexes.length!==1)return [];
    const i=indexes[0], n=dollar(lines[i+1]);
    if(n===null)return [];
    rows.push({provider:'openai',model,unit,amount_usd:n});
  }
  return rows;
}

export function compareTextPrices(priceRows,modelA,modelB) {
  const row=(model,unit)=>priceRows.find(x=>x.provider==='openai' && x.model===model && x.unit===unit);
  const a=[row(modelA,'input_1m_tokens'),row(modelA,'output_1m_tokens')];
  const b=[row(modelB,'input_1m_tokens'),row(modelB,'output_1m_tokens')];
  if([...a,...b].some(x=>!x || !Number.isFinite(Number(x.amount_usd))))return null;
  const oldCost=Number(a[0].amount_usd)+Number(a[1].amount_usd);
  const newCost=Number(b[0].amount_usd)+Number(b[1].amount_usd);
  return {oldCost,newCost,percentDifference:oldCost>0?Math.round((newCost/oldCost-1)*1000)/10:null,
    description:'Exempel: 1 miljon indata- och 1 miljon utdata-tokens, standardpris i USD. Ej total kostnad för en Spreelo-körning.'};
}

export function updateAvailabilitySignal(previous, {present, day}) {
  const prior=previous||{};
  // Never count the same calendar day twice, even on cron retries.
  if(prior.last_checked_day===day)return {...prior,changed:false};
  const n=present?0:Math.max(0,Number(prior.consecutive_missing)||0)+1;
  const firstMissing=present?null:(prior.first_missing_at || `${day}T00:00:00.000Z`);
  const daysSinceFirst=firstMissing?Date.parse(`${day}T00:00:00Z`)-Date.parse(firstMissing):0;
  return {changed:true,last_checked_day:day,consecutive_missing:n,first_missing_at:firstMissing,
    last_present_at:present?`${day}T00:00:00.000Z`:(prior.last_present_at||null),
    alert_status:!present && n>=3 && daysSinceFirst>=2*86400000?'warning':'observing'};
}

export function recommendedReplacement({purpose,active,approved=[],availableModels=[],priceRows=[]}) {
  if(!purpose || !active || purpose.provider!=='openai')return null;
  const live=new Set(availableModels);
  const candidates=approved.filter(x=>x.provider==='openai' && x.model!==active && x.status==='approved' &&
    (x.verified_capabilities||[]).includes(purpose.capability) && live.has(x.model));
  if(!candidates.length)return null;
  // Prefer candidates with demonstrable same-unit price comparisons, otherwise recent verification.
  candidates.sort((a,b)=>{
    const aCost=compareTextPrices(priceRows,active,a.model);
    const bCost=compareTextPrices(priceRows,active,b.model);
    if(Boolean(aCost)!==Boolean(bCost))return aCost?-1:1;
    if(aCost && bCost && aCost.newCost!==bCost.newCost)return aCost.newCost-bCost.newCost;
    return String(b.verified_at||'').localeCompare(String(a.verified_at||''));
  });
  const selected=candidates[0];
  return {model:selected.model,verifiedAt:selected.verified_at,comparison:compareTextPrices(priceRows,active,selected.model),
    note:'Tekniskt verifierad kandidat – kvalitet, resultat och eventuell publiceringspåverkan måste testas före byte.'};
}

export function deterministicEventId(kind,value) {
  return createHash('sha256').update(`spreelo:v329:${kind}:${value}`).digest('hex');
}
