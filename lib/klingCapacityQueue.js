// v144.388: opt-in Kling admission gate. No new provider request/retry is made here.
export function klingCapacityQueueEnabled(env=process.env) {
  return env.SPREELO_KLING_CAPACITY_QUEUE_ENABLED === "true";
}
export function klingRuleCapacityKey(ruleId, scheduledFor) {
  if(!ruleId || !scheduledFor) throw new Error("Kling rule/schedule identity missing");
  return "rule:"+ruleId+":"+new Date(scheduledFor).toISOString();
}
export async function tryAdmitKlingRule(supabase, rule, scheduledFor) {
  const key=klingRuleCapacityKey(rule.id,scheduledFor);
  const {data,error}=await supabase.rpc("try_admit_kling_capacity",{
    p_job_key:key,p_rule_id:rule.id,p_scheduled_for:scheduledFor
  });
  if(error)throw Object.assign(new Error("Kling capacity gate is unavailable: "+error.message),{code:"KLING_CAPACITY_GATE_UNAVAILABLE"});
  return {key,admitted:data===true};
}
export async function releaseUnattemptedKlingSlot(supabase,key) {
  if(!key)return;
  const {error}=await supabase.rpc("release_unattempted_kling_capacity",{p_job_key:key});
  if(error)console.error("Kling unattempted capacity release failed",{message:error.message,key});
}
export async function markKlingSubmissionAttempt(supabase,postId) {
  if(!klingCapacityQueueEnabled())return;
  const {data,error}=await supabase.rpc("mark_kling_capacity_attempt",{p_post_id:postId});
  if(error||data!==true)throw Object.assign(new Error("Kling capacity reservation could not be bound to post: "+(error?.message||"claim rejected")),{code:"KLING_CAPACITY_SLOT_CLAIM_FAILED"});
}
export async function markKlingSubmissionAccepted(supabase,postId,taskId) {
  if(!klingCapacityQueueEnabled())return;
  const {data,error}=await supabase.rpc("mark_kling_capacity_submitted",{p_post_id:postId,p_task_id:taskId});
  if(error||data!==true)console.error("Kling accepted task but capacity checkpoint failed; slot remains reserved",{postId,taskId,error:error?.message});
}
export async function markKlingProviderTaskTerminal(supabase,postId,taskStatus) {
  if(!klingCapacityQueueEnabled())return;
  const {error}=await supabase.rpc("complete_kling_capacity_slot",{p_post_id:postId,p_terminal_status:taskStatus});
  if(error)console.error("Kling terminal capacity checkpoint failed; slot retained",{postId,taskStatus,message:error.message});
}
