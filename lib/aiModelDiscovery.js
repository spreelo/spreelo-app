// Catalog discovery + bounded functional probes. Never writes ai_model_settings.
import {OPENAI_PROBE_LIMIT, OPENAI_IMAGE_PROBE_LIMIT, modelKind, runOpenAiProbe} from './aiModelVerification.js';

export async function discoverOpenAiModels() {
  const key=String(process.env.OPENAI_API_KEY||'').trim();
  if(!key) throw new Error('OPENAI_API_KEY is missing');
  const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`OpenAI models HTTP ${response.status}`);
  const json=await response.json();
  if(!Array.isArray(json.data)) throw new Error('Unexpected OpenAI model response');
  return [...new Set(json.data.map(x=>String(x?.id||'').trim()).filter(id=>/^gpt-[a-z0-9][a-z0-9._-]*$/i.test(id)))].sort();
}

export async function syncDiscoveredModels(db) {
  const ids=await discoverOpenAiModels();
  const now=new Date().toISOString();
  const {data:old,error:readError}=await db.from('ai_model_catalog').select('provider,model,status').eq('provider','openai');
  if(readError) throw readError;
  const known=new Map((old||[]).map(x=>[x.model,x]));
  const fresh=ids.filter(id=>!known.has(id));
  const rows=fresh.map(model=>({provider:'openai',model,last_seen_at:now}));
  for(let i=0;i<rows.length;i+=100){
    const {error}=await db.from('ai_model_catalog').upsert(rows.slice(i,i+100),{onConflict:'provider,model',ignoreDuplicates:true});
    if(error) throw error;
  }
  const existing = ids.filter(id => known.has(id));
  for (let i = 0; i < existing.length; i += 100) {
    const { error } = await db.from('ai_model_catalog').update({ last_seen_at: now })
      .eq('provider', 'openai').in('model', existing.slice(i, i + 100));
    if (error) throw error;
  }
  return {provider:'openai',listed:ids.length,newModels:fresh,requiresReview:fresh.length};
}

// Best-effort discovery from an official Kling documentation page. This is NOT
// an authenticated catalog nor an API compatibility check. Such candidates
// remain pending and can never become selectable from this scan alone.
export function extractKlingModelIds(document) {
  const text=String(document || '');
  return [...new Set((text.match(/\bkling-(?:[0-9]{1,2}\.[0-9])(?:-[a-z0-9]{2,16}){0,2}\b/gi)||[])
    .map(x=>x.toLowerCase()))].slice(0,20);
}

export async function syncKlingDocumentedCandidates(db) {
  const url='https://kling.ai/document-api/quickStart/productIntroduction/overview';
  try {
    const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(9000),
      headers:{'User-Agent':'Spreelo-Model-Watch/1.0'}});
    if(!r.ok)throw new Error(`Kling documentation HTTP ${r.status}`);
    const ids=extractKlingModelIds((await r.text()).slice(0,1000000));
    if(!ids.length)return {provider:'kling',candidates:0,newCandidates:0,source:'official-documentation',note:'No exact API model identifiers were found in the documentation'};
    const {data:old,error}=await db.from('ai_model_catalog').select('model').eq('provider','kling');
    if(error)throw error;
    const known=new Set((old||[]).map(x=>x.model));
    const fresh=ids.filter(id=>!known.has(id));
    if(fresh.length) {
      const {error:writeError}=await db.from('ai_model_catalog').upsert(fresh.map(model=>({provider:'kling',model,
        verification_notes:'Candidate discovered in official Kling docs. Actual image-to-video capability and account access NOT verified.'})),
        {onConflict:'provider,model',ignoreDuplicates:true});
      if(writeError)throw writeError;
    }
    return {provider:'kling',candidates:ids.length,newCandidates:fresh.length,source:'official-documentation',note:'Candidates remain pending: Kling account compatibility requires a real video test'};
  } catch(e) {
    return {provider:'kling',candidates:0,newCandidates:0,source:'official-documentation',note:String(e?.message||e)};
  }
}

export async function saveProbeOutcome(db, model, result, errorText='', probeType='auto') {
  const passed=Boolean(result?.passed && result?.capabilities?.length);
  const notes=(result?.notes||[]).join('; ').slice(0,1200);
  const {error:auditError}=await db.from('ai_model_probe_runs').insert({
    provider:'openai',model,outcome:passed?'passed':'failed',
    capabilities:result?.capabilities||[],notes,probe_type:probeType,error_text:errorText.slice(0,800)||null,
  });
  if(auditError)throw auditError;
  const payload=passed
    ? {status:'approved',verified_capabilities:result.capabilities,verified_at:new Date().toISOString(),verification_notes:notes}
    : {status:'pending_review',verified_capabilities:[],verification_notes:`Automatiskt test misslyckades: ${errorText.slice(0,350)}`};
  const {error:updateError}=await db.from('ai_model_catalog').update(payload)
    .eq('provider','openai').eq('model',model).eq('status','pending_review');
  if(updateError)throw updateError;
}

export async function probePendingModels(db, {maxText=OPENAI_PROBE_LIMIT,maxImage=OPENAI_IMAGE_PROBE_LIMIT}={}) {
  const key=String(process.env.OPENAI_API_KEY||'').trim();
  if(!key)throw new Error('OPENAI_API_KEY is missing');
  const {data:pending,error}=await db.from('ai_model_catalog').select('provider,model,status,first_seen_at')
    .eq('provider','openai').eq('status','pending_review').order('first_seen_at',{ascending:true}).limit(250);
  if(error)throw error;
  const {data:previous,error:auditError}=await db.from('ai_model_probe_runs').select('model')
    .eq('provider','openai').in('model',(pending||[]).map(r=>r.model)).limit(10000);
  if(auditError)throw auditError;
  const previouslyTested=new Set((previous||[]).map(r=>r.model));
  const available=(pending||[]).filter(x=>!previouslyTested.has(x.model));
  const textModels=available.filter(x=>modelKind(x.model)==='text').slice(0,Math.max(0,Math.min(2,maxText)));
  const imageModels=available.filter(x=>modelKind(x.model)==='image').slice(0,Math.max(0,Math.min(1,maxImage)));
  const results=[];
  for(const x of [...textModels,...imageModels]) {
    let outcome=null, message='';
    try {outcome=await runOpenAiProbe(key,x.model);} catch(e){message=String(e?.message||e);}
    await saveProbeOutcome(db,x.model,outcome,message);
    results.push({model:x.model,passed:Boolean(outcome?.passed),capabilities:outcome?.capabilities||[],error:message || null});
  }
  return {attempted:results.length,approved:results.filter(x=>x.passed).length,results};
}

export async function checkMissingActiveModels(db) {
  // This is an alert, never an automatic model swap or retirement verdict.
  const {data:settings,error:settingsError}=await db.from('ai_model_settings').select('purpose,provider,model');
  if(settingsError)throw settingsError;
  const active=new Set((settings||[]).filter(x=>x.provider==='openai').map(x=>x.model));
  if(!active.size)return {missing:[]};
  const {data:catalog,error:catalogError}=await db.from('ai_model_catalog')
    .select('model,first_seen_at,last_seen_at').eq('provider','openai').in('model',[...active]);
  if(catalogError)throw catalogError;
  const now=Date.now();
  const missing=(catalog||[]).filter(x=>x.last_seen_at && now-Date.parse(x.last_seen_at)>=7*24*3600*1000)
    .map(x=>x.model);
  return {missing};
}
