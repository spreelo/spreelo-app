// v144.394: actionable, evidence-led advisory. No active model settings are changed here.
import {compareTextPrices, OFFICIAL_OPENAI_DEPRECATIONS_URL} from './aiModelIntelligence.js';

export const OPENAI_REPLACEMENT_CANDIDATES = Object.freeze({
  text_reasoning: ['gpt-6.1-sol'],
  text: ['gpt-6-luna'],
  text_vision: ['gpt-6-luna'],
});

const MODEL_ID_RE = /^gpt-[a-z0-9][a-z0-9._-]{0,100}$/i;
const UTC_DAY = 86400000;
const DATE_NAMES = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
export function readEnglishShutdownDate(input) {
  const text=String(input||'').trim();
  const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if(iso){const d=`${iso[1]}-${iso[2]}-${iso[3]}`;return !Number.isNaN(Date.parse(`${d}T00:00:00Z`))?d:null;}
  const m=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
  if(!m)return null;
  const month=DATE_NAMES[m[1].toLowerCase()], day=Number(m[2]),year=Number(m[3]);
  const dt=new Date(Date.UTC(year,month-1,day));
  return dt.getUTCFullYear()===year&&dt.getUTCMonth()===month-1&&dt.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
const cleanCell = value=>String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();

// Only interpret an explicit official table row: one shutdown DATE + one model ID + replacement.
// Never infer a shutdown from mere mentions of a model elsewhere on the documentation page.
export function parseOfficialOpenAiShutdownRows(html, sourceUrl=OFFICIAL_OPENAI_DEPRECATIONS_URL) {
  const rows=[];
  const tableRows=String(html||'').match(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi)||[];
  for(const tr of tableRows){
    const cells=[...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(x=>cleanCell(x[1]));
    if(cells.length<3)continue;
    const date=readEnglishShutdownDate(cells[0]);if(!date)continue;
    const ids=[...new Set((cells[1].match(/\bgpt-[a-z0-9][a-z0-9._-]{0,100}\b/gi)||[]).map(x=>x.toLowerCase()))];
    const replacement=(cells[2].match(/\bgpt-[a-z0-9][a-z0-9._-]{0,100}\b/i)||[])[0]||null;
    for(const id of ids){if(!MODEL_ID_RE.test(id))continue;
      rows.push({provider:'openai',model:id,shutdown_date:date,replacement_model:replacement,source_url:sourceUrl,
        evidence:`${cells[0]} · ${cells[1]}`.slice(0,420)});
    }
    // The official document frequently names a family alongside its dated snapshot.
    // Treat the API alias as affected only when the cell explicitly names that family.
    const aliases=[['GPT-4.1 mini','gpt-4.1-mini'],['GPT-4.1','gpt-4.1'],['GPT-4o mini','gpt-4o-mini'],['GPT-4o','gpt-4o']];
    for(const [label,alias] of aliases){
      const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp(`(?:^|\\s)${esc}\\s*\\(`,'i').test(cells[1]) && !ids.includes(alias))
        rows.push({provider:'openai',model:alias,shutdown_date:date,replacement_model:replacement,source_url:sourceUrl,
          evidence:`${cells[0]} · ${cells[1]}`.slice(0,420)});
    }
  }
  return [...new Map(rows.map(row=>[row.model,row])).values()];
}
export function shutdownDaysRemaining(date, asOf=new Date()){
  if(!date||!Number.isFinite(Date.parse(`${date}T00:00:00Z`)))return null;
  const today=Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate());
  return Math.round((Date.parse(`${date}T00:00:00Z`)-today)/UTC_DAY);
}
export function shutdownAlertStage(days){
  if(days===null)return null;
  if(days<0)return 'expired';
  if(days<=7)return '7d';
  if(days<=14)return '14d';
  if(days<=30)return '30d';
  if(days<=90)return '90d';
  return null;
}
export function buildModelAdvice({settings=[],catalog=[],pricing=[],shutdowns=[],purposes=[],now=new Date()}={}){
  const approved=new Map(catalog.filter(x=>x.provider==='openai').map(x=>[x.model,x]));
  const warnings=[];const suggestions=[];
  for(const purpose of purposes.filter(p=>p.provider==='openai')){
    const model=settings.find(s=>s.purpose===purpose.key)?.model||purpose.fallback;
    const notice=shutdowns.find(n=>n.model===model);
    const days=notice?shutdownDaysRemaining(notice.shutdown_date,now):null;
    if(notice&&days!==null){warnings.push({purpose:purpose.key,label:purpose.label,currentModel:model,shutdownDate:notice.shutdown_date,
      daysRemaining:days,replacementModel:notice.replacement_model,sourceUrl:notice.source_url,
      verifiedAt:notice.last_verified_at,urgency:days<0?'expired':days<=14?'critical':days<=30?'warning':'notice'});}
    // For reasoning and high-volume tasks, recommend a fit-for-purpose target, not 'newest for everyone'.
    const preferred=OPENAI_REPLACEMENT_CANDIDATES[purpose.capability]||[];
    // Newly discovered, API-approved, capability-matched models may also be recommended.
    // They must have official, same-unit price evidence and remain suggestions until reviewed.
    const verifiedNew=catalog.filter(c=>c.provider==='openai' && c.model!==model && c.status==='approved' &&
      (c.verified_capabilities||[]).includes(purpose.capability) &&
      (c.last_seen_at||c.verified_at) &&
      now.getTime()-Date.parse(c.last_seen_at||c.verified_at)<30*UTC_DAY)
      .map(c=>c.model).filter(MODEL_ID_RE.test.bind(MODEL_ID_RE));
    const candidates=[...new Set([...preferred,...verifiedNew])].slice(0,5);
    let addedForPurpose=0;
    for(const candidateModel of candidates){
      if(candidateModel===model)continue;
      const c=approved.get(candidateModel);
      const status=c?.status==='approved'&&(c.verified_capabilities||[]).includes(purpose.capability)?'verified_for_purpose':'test_required';
      const comparison=compareTextPrices(pricing,model,candidateModel);
      // Price cannot be described as a saving if the current and new prices are missing.
      const cheaper=Boolean(comparison&&comparison.newCost<comparison.oldCost);
      const shutdown=Boolean(notice);
      if(!cheaper&&!shutdown)continue;
      if(addedForPurpose>=2)break;
      addedForPurpose++;
      suggestions.push({purpose:purpose.key,label:purpose.label,currentModel:model,candidateModel,
        reason:shutdown?'Avveckling planerad – utvärdera en kompatibel ersättare.':
          purpose.capability==='text_reasoning'?'Kandidat för avancerade uppgifter – lägre listpris, men kvalitet och verktygsstöd behöver jämföras.':
          'Kandidat för återkommande textuppgifter – lägre listpris, men kvalitet och kompatibilitet behöver jämföras.',
        comparison,pricesVerified:cheaper,status,sourceUrl:`https://developers.openai.com/api/docs/models/${encodeURIComponent(candidateModel)}`,
        shutdownDate:notice?.shutdown_date||null});
    }
  }
  return {suggestions,warnings};
}
