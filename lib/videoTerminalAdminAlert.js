// v144.349: async Kling finalization is not an automation-worker exception;
// it needs its own terminal alert. Use the SAME durable incident deduplication
// RPC as the automation failure path to avoid one email per cron tick.
export async function sendTerminalVideoAdminAlert({supabase,post,stage,code,message}) {
  // Match the primary/team admin env contract without importing auth SDK into cron alert delivery.
  const recipients=[...new Set([process.env.SPREELO_PRIMARY_ADMIN_EMAIL||'johan@foldern.com',
    ...String(process.env.SPREELO_ADMIN_EMAILS||'').split(/[;,\n\r]+/),
    ...String(process.env.ADMIN_ALERT_EMAIL||'').split(/[;,\n\r]+/)]
    .map(v=>String(v).trim().toLowerCase()).filter(Boolean))];
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey || !recipients.length)return {sent:false,reason:'not_configured'};
  const incidentKey=`kling-finalization:${post.id}:${String(stage||'unknown')}`;
  const {data,error}=await supabase.rpc('record_admin_runtime_incident',{
    p_dedupe_key:incidentKey,p_severity:'critical',p_kind:'generation',
    p_title:`Kling AI video requires repair · ${post.id}`,p_failure_code:code||'KLING_FINALIZATION_ERROR',
    p_stage:stage||'kling_video_finalization',p_message:String(message||'Unknown video failure').slice(0,8000),
    p_worker_name:'finalize-kling-videos',p_user_id:post.user_id||null,
    p_brand_profile_id:post.brand_profile_id||null,p_automation_rule_id:post.automation_rule_id||null,
    p_occurrence_id:post.automation_occurrence_id||null,p_post_id:post.id,p_run_log_id:null,
    p_metadata:{source_video_preserved:Boolean(post.video_background_selection?.kling_source_storage_url),
      task_id:post.kling_task_id||null},p_email_cooldown_seconds:86400,
  });
  if(error){console.error('Kling admin failure incident not recorded; manual admin review remains available',{postId:post.id,message:error.message});return {sent:false,reason:'incident_unavailable'};}
  if(data?.should_email===false)return {sent:false,reason:'deduplicated'};
  const appUrl=String(process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||'https://app.spreelo.com').replace(/\/$/,'');
  const subject=`[CRITICAL] Spreelo · AI-video behöver åtgärdas · ${code||'KLING_FINALIZATION_ERROR'}`;
  const body=`Spreelo kunde inte färdigställa AI-videon.\n\nPost: ${post.id}\nSteg: ${stage}\nFelkod: ${code||'KLING_FINALIZATION_ERROR'}\nOrsak: ${String(message||'').slice(0,1800)}\n\nKling-filmen ska återanvändas om den finns sparad. Beställ inte en ny video för ett textdesignfel.\n\nGranska: ${appUrl}/admin`;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||'Spreelo <noreply@spreelo.com>',to:recipients,subject,text:body}),
  });
  if(!response.ok){console.error('Kling admin terminal alert delivery rejected',{postId:post.id,status:response.status});return {sent:false,reason:`resend_${response.status}`};}
  return {sent:true,incidentId:data?.incident_id||null};
}
