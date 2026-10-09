import {adminContextError,getAdminContext} from '../../../../lib/adminAuth.js';
import {AI_BACKGROUND_JOBS_KEY,readAiBackgroundJobsState} from '../../../../lib/aiAutomationSwitch.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const context=await getAdminContext(request);
  if(context.error)return adminContextError(context);
  const state=await readAiBackgroundJobsState(context.admin);
  if(!state.available)return Response.json({ok:false,error:'Installera v331:s samlade SQL innan brytaren kan användas.'},{status:503});
  return Response.json({ok:true,...state});
}

export async function PATCH(request) {
  const context=await getAdminContext(request);
  if(context.error)return adminContextError(context);
  const body=await request.json().catch(()=>null);
  if(!body || typeof body.enabled!=='boolean')
    return Response.json({ok:false,error:'enabled must be true or false.'},{status:400});
  // Refuse a write while the DB safety switch cannot be read.
  const current=await readAiBackgroundJobsState(context.admin);
  if(!current.available)
    return Response.json({ok:false,error:'Installera v331:s samlade SQL först.'},{status:503});
  const now=new Date().toISOString();
  const {data,error}=await context.admin.from('ai_control_job_settings')
    .upsert({key:AI_BACKGROUND_JOBS_KEY,enabled:body.enabled,updated_by:context.user.id,updated_at:now},{onConflict:'key'})
    .select('enabled,updated_at,updated_by').single();
  if(error)return Response.json({ok:false,error:'Kunde inte spara AI-brytaren.'},{status:503});
  return Response.json({ok:true,enabled:data.enabled===true,updated_at:data.updated_at,updated_by:data.updated_by});
}
