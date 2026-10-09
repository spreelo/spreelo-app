import {adminContextError,getAdminContext} from '../../../../lib/adminAuth.js';
import {modelKind,runOpenAiProbe} from '../../../../lib/aiModelVerification.js';
import {saveProbeOutcome} from '../../../../lib/aiModelDiscovery.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

// An explicit admin retry for a candidate left pending after a failed automatic probe.
// Bounded to one model per request, with a cooldown; never changes production settings.
export async function POST(request) {
  const context=await getAdminContext(request);
  if(context.error)return adminContextError(context);
  const body=await request.json().catch(()=>({}));
  const model=String(body.model||'').trim();
  if(!modelKind(model))return Response.json({ok:false,error:'Unsupported model for automatic OpenAI verification'},{status:400});
  const {data:candidate,error}=await context.admin.from('ai_model_catalog')
    .select('status').eq('provider','openai').eq('model',model).maybeSingle();
  if(error)return Response.json({ok:false,error:error.message},{status:500});
  if(candidate?.status!=='pending_review')return Response.json({ok:false,error:'Only pending OpenAI candidates may be retried'},{status:409});
  const {data:last,error:lastError}=await context.admin.from('ai_model_probe_runs')
    .select('checked_at').eq('provider','openai').eq('model',model)
    .order('checked_at',{ascending:false}).limit(1).maybeSingle();
  if(lastError)return Response.json({ok:false,error:lastError.message},{status:500});
  if(last?.checked_at && Date.now()-Date.parse(last.checked_at)<10*60*1000)
    return Response.json({ok:false,error:'Wait 10 minutes between model probes'},{status:429});
  if(!process.env.OPENAI_API_KEY)return Response.json({ok:false,error:'OPENAI_API_KEY is not configured'},{status:503});
  let result=null,message='';
  try {result=await runOpenAiProbe(process.env.OPENAI_API_KEY,model);}
  catch(e){message=String(e?.message||e);}
  try {await saveProbeOutcome(context.admin,model,result,message,'manual');}
  catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:500});}
  return Response.json({ok:true,approved:Boolean(result?.passed),capabilities:result?.capabilities||[],error:message||null,
    note:'This is a paid provider probe; the active Spreelo model was not changed.'});
}
