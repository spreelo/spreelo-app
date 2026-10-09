import { adminContextError, getAdminContext } from '../../../../lib/adminAuth';
import { AI_PURPOSES, VERIFIED_MODEL_CAPABILITIES, isVerifiedForCapability, isModelVerifiedForPurpose } from '../../../../lib/aiModelControl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchOpenAiModels() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return [];
  try {
    const r = await fetch('https://api.openai.com/v1/models', { headers:{Authorization:`Bearer ${key}`}, cache:'no-store',signal:AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data || []).map(x => String(x.id || '')).filter(Boolean);
  } catch { return []; }
}

export async function GET(request) {
  const context = await getAdminContext(request); if (context.error) return adminContextError(context);
  const [{data,error},catalogResult,pricesResult,liveList] = await Promise.all([
    context.admin.from('ai_model_settings').select('*').order('purpose'),
    context.admin.from('ai_model_catalog').select('provider,model,status,verified_capabilities,last_seen_at,verified_at,verification_notes').order('first_seen_at',{ascending:false}).limit(700),
    context.admin.from('ai_model_pricing').select('provider,model,unit,amount_usd,source_url,verified_at').limit(1000),
    fetchOpenAiModels(),
  ]);
  const rows=error?[]:(data || []);
  const catalog=catalogResult.error?[]:(catalogResult.data||[]);
  const pricing=pricesResult.error?[]:(pricesResult.data||[]);
  const liveOpenAi=new Set(liveList);
  const legacyModelNames=Object.keys(VERIFIED_MODEL_CAPABILITIES);
  const purposes=AI_PURPOSES.map(p=>{
    const row=rows.find(r=>r.purpose===p.key);
    const current=row?.model||p.fallback;
    const baseline=legacyModelNames.filter(m=>m!=='kling-v3' && isVerifiedForCapability(m,p.capability) &&
      (p.provider==='kling'?m.startsWith('kling-'):m.startsWith('gpt-') && (!liveOpenAi.size || liveOpenAi.has(m) || m===current)));
    const approved=catalog.filter(c=>c.model!=='kling-v3' && c.provider===p.provider && c.status==='approved' &&
      Array.isArray(c.verified_capabilities) && c.verified_capabilities.includes(p.capability) &&
      // If an OpenAI listing is available, never offer a model known to be missing.
      (p.provider!=='openai' || !liveOpenAi.size || liveOpenAi.has(c.model) || c.model===current)).map(c=>c.model);
    const pendingKling=p.key==='kling_video'?catalog.filter(c=>c.model!=='kling-v3' && c.provider==='kling' && c.status==='pending_review' && String(c.verification_notes||'').startsWith('Candidate discovered in official Kling docs.')).map(c=>c.model):[];
    const options=[...new Set([current,...baseline,...approved,...pendingKling])];
    return {...p,model:current,default_model:row?.default_model||p.fallback,options,testOnlyModels:pendingKling,approvedModels:approved,
      changed_at:row?.changed_at||null,auto_replaced:Boolean(row?.auto_replaced),replacement_reason:row?.replacement_reason||null,
      active_missing_from_listing:p.provider==='openai' && liveOpenAi.size>0&&!liveOpenAi.has(current)};
  });
  return Response.json({ok:true,purposes,catalog:catalog.slice(0,100),pricing,
    catalogWarning:error?'AI Control SQL has not been applied. Default models are still used.':
      catalogResult.error?'Model register unavailable; run consolidated v328 SQL. Only legacy verified models are selectable.':null,
    klingDiscovery:'Kling 3.0 visas som befintligt standardval. kling-v3 är ett annat tekniskt API-ID och erbjuds inte som ett separat nytt modellval. Nya Kling-kandidater kräver ett verkligt, godkänt videotest.',
    pricingWarning:pricesResult.error?'Price registry not installed.':null});
}

export async function PATCH(request) {
  const context = await getAdminContext(request); if (context.error) return adminContextError(context);
  const body = await request.json().catch(()=>({}));
  const purpose = AI_PURPOSES.find(p=>p.key===String(body.purpose||''));
  if (!purpose) return Response.json({ok:false,error:'Unknown AI purpose.'},{status:400});
  const model=String(body.model||'').trim();
  if(purpose.key==='kling_video' && model==='kling-v3') {
    const {data:existing}=await context.admin.from('ai_model_settings').select('model').eq('purpose','kling_video').maybeSingle();
    if((existing?.model||purpose.fallback)!=='kling-v3')return Response.json({ok:false,error:'kling-v3 är ett tekniskt alias och kan inte aktiveras som ett nytt modellval. Behåll befintlig modell eller välj en verifierad Kling-modell.'},{status:400});
  }
  if (!await isModelVerifiedForPurpose(context.admin,purpose,model))
    return Response.json({ok:false,error:'This model is not verified for the required capability.'},{status:400});
  const payload={purpose:purpose.key,provider:purpose.provider,model,default_model:purpose.fallback,
    capability:purpose.capability,changed_by:context.user.id,changed_at:new Date().toISOString(),auto_replaced:false,replacement_reason:null};
  const {data,error}=await context.admin.from('ai_model_settings').upsert(payload,{onConflict:'purpose'}).select('*').single();
  if(error)return Response.json({ok:false,error:`${error.message}. Check the consolidated AI Control SQL installation.`},{status:500});
  return Response.json({ok:true,setting:data});
}
