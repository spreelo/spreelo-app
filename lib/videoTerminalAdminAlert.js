import { isDatabaseConnectivityFailure, recordDatabaseRuntimeFailure } from './systemHealth.js';

export function videoAdminAlertContent({post={},stage,code,message,diagnostic=null,workerName='finalize-kling-videos',appUrl='https://app.spreelo.com'}) {
  const batch=!post.id;
  const database=batch && isDatabaseConnectivityFailure({message});
  const severity=database?'warning':batch?'error':'critical';
  const failureCode=database?'SUPABASE_DATABASE_REQUEST_FAILED':code||'KLING_FINALIZATION_ERROR';
  const title=database?'Databasåtkomst avbröt kontrollen av videokön':batch?'Bakgrundskontrollen för videor avbröts':'AI-video behöver åtgärdas';
  const action=database?'Nästa schemalagda kontroll försöker hämta väntande jobb igen. Kontrollera efterföljande körningar och Supabase-anslutningen om felet kvarstår. Detta larm fastställer inte en generell driftstörning hos Supabase. Starta ingen ny videobeställning på grund av detta larm.':batch?'Kontrollera serverloggen för denna bakgrundskörning och efterföljande kontroller. Larmet gäller processen och identifierar ingen enskild misslyckad video.':diagnostic?.action||'Kontrollera inläggets sparade källa och befintliga task/render-ID innan återställning. Återanvänd befintligt material; beställ inte automatiskt en ny video.';
  const body=`${database?'Spreelo kunde inte läsa videokön från databasen. Ingen enskild film har identifierats som misslyckad av detta larm.':batch?'Spreelos bakgrundskontroll för videor avbröts.':'Spreelo kunde inte färdigställa detta videoinlägg.'}\n\n${batch?'Omfattning: bakgrundsprocess, inget specifikt inlägg':`Post: ${post.id}`}\nProcess: ${workerName}\nSteg: ${stage||'unknown'}\nFelkod: ${failureCode}\nOrsak: ${String(message||'Unknown failure').slice(0,1800)}\n${!batch?`Task-ID: ${post.kling_task_id||post.video_render_id||'saknas'}\nRender-ID: ${diagnostic?.render_id||post.video_background_selection?.shotstack_render_id||'saknas'}\n`:''}${diagnostic?.visual_review?.reason?`Granskningsfynd: ${diagnostic.visual_review.reason}\n`:''}\nÅtgärd: ${action}\n\nGranska: ${appUrl}/admin`;
  return {database,batch,severity,code:failureCode,title,action,subject:`[${severity.toUpperCase()}] Spreelo · ${title} · ${failureCode}`,body};
}

// v144.349: async Kling finalization is not an automation-worker exception;
// it needs its own terminal alert. Use the SAME durable incident deduplication
// RPC as the automation failure path to avoid one email per cron tick.
export async function sendTerminalVideoAdminAlert({supabase,post,stage,code,message,diagnostic=null,workerName="finalize-kling-videos"}) {
  // Match the primary/team admin env contract without importing auth SDK into cron alert delivery.
  const recipients=[...new Set([process.env.SPREELO_PRIMARY_ADMIN_EMAIL||'johan@foldern.com',
    ...String(process.env.SPREELO_ADMIN_EMAILS||'').split(/[;,\n\r]+/),
    ...String(process.env.ADMIN_ALERT_EMAIL||'').split(/[;,\n\r]+/)]
    .map(v=>String(v).trim().toLowerCase()).filter(Boolean))];
  const apiKey=process.env.RESEND_API_KEY;

  const appUrl=String(process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||'https://app.spreelo.com').replace(/\/$/,'');
  const alert=videoAdminAlertContent({post,stage,code,message,diagnostic,workerName,appUrl});
  if(alert.database)await recordDatabaseRuntimeFailure({admin:supabase,error:{message},operation:workerName});
  const incidentKey=`video-finalization:${workerName}:${post.id || 'worker'}:${String(stage||'unknown')}`;
  const {data,error}=await supabase.rpc('record_admin_runtime_incident',{
    p_dedupe_key:incidentKey,p_severity:alert.severity,p_kind:alert.database?'database':alert.batch?'runtime':'generation',
    p_title:alert.title,p_failure_code:alert.code,
    p_stage:stage||'kling_video_finalization',p_message:String(message||'Unknown video failure').slice(0,8000),
    p_worker_name:workerName,p_user_id:post.user_id||null,
    p_brand_profile_id:post.brand_profile_id||null,p_automation_rule_id:post.automation_rule_id||null,
    p_occurrence_id:post.automation_occurrence_id||null,p_post_id:post.id||null,p_run_log_id:null,
    p_metadata:{source_video_preserved:Boolean(post.video_background_selection?.kling_source_storage_url),
      task_id:post.kling_task_id||post.video_render_id||null,render_id:diagnostic?.render_id||post.video_background_selection?.shotstack_render_id||null,
      visual_review:diagnostic?.visual_review||null,action:alert.action,scope:alert.batch?'worker':'post',original_failure_code:code||null},p_email_cooldown_seconds:86400,
  });
  if(error){console.error('Kling admin failure incident not recorded; manual admin review remains available',{postId:post.id,message:error.message});return {sent:false,reason:'incident_unavailable'};}
  if(!apiKey || !recipients.length)return {sent:false,reason:'not_configured',incidentId:data?.incident_id||null};
  if(data?.should_email===false)return {sent:false,reason:'deduplicated'};
  const {subject,body}=alert;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||'Spreelo <noreply@spreelo.com>',to:recipients,subject,text:body}),
  });
  if(!response.ok){console.error('Kling admin terminal alert delivery rejected',{postId:post.id,status:response.status});return {sent:false,reason:`resend_${response.status}`};}
  return {sent:true,incidentId:data?.incident_id||null};
}
