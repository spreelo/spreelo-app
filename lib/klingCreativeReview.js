// Creativity is reviewed separately from product/scene integrity. No provider
// calls, status overrides or tolerance of missing safety evidence live here.
export function isKlingCreativeOnlyReview(validation) {
  return validation?.decision==='admin_review' && Number(validation.confidence)>=.9 &&
    Array.isArray(validation.violation_codes) && validation.violation_codes.length>0 &&
    validation.violation_codes.every(code=>['commercial_motion_inadequate','unfinished_closing_action','script_deviation'].includes(code));
}

export function klingCreativeReviewNote(post) {
  const validation=post?.video_background_selection?.product_video_validation;
  const advisory=validation?.passed===true&&validation?.creative_feedback?.code==='commercial_motion_inadequate';
  if(!isKlingCreativeOnlyReview(validation)&&!advisory)return null;
  const reason=validation.creative_feedback?.reason||validation.reason||'Kreativ rörelsefeedback.';
  return `Kreativ återkoppling, ej leveransspärr. Videon följer kundens vanliga granskningsinställning. ${String(reason).slice(0,1800)}`;
}

// An explicit admin action only. Never clear a rejected design, exhausted
// finalization control or uncertain provider submission to resume a source.
export async function resumeKlingCreativeReview({supabase,post}) {
  const selection=post?.video_background_selection||{};
  if(post?.video_provider!=='kling'||post.video_status!=='failed'||!post.kling_task_id||
    !selection.kling_source_storage_url||!isKlingCreativeOnlyReview(selection.product_video_validation)||
    selection.finalization_control?.state==='needs_repair'||Number(selection.finalization_control?.attempts||0)>=3||
    ['failed','blocked_layout'].includes(selection.text_overlay_status)||selection.shotstack_design_review?.status==='rejected') {
    throw Object.assign(new Error('Only a preserved Kling source with exclusively creative feedback can resume here.'),{httpStatus:409});
  }
  const now=new Date().toISOString();
  let query=supabase.from('posts').update({status:'generating',video_status:'finalizing',kling_task_status:'succeeded',
    kling_last_polled_at:null,video_error:null,admin_review_status:'pending',updated_at:now})
    .eq('id',post.id).eq('video_provider','kling').eq('kling_task_id',post.kling_task_id).eq('video_status','failed');
  query=post.updated_at==null?query.is('updated_at',null):query.eq('updated_at',post.updated_at);
  const {data,error}=await query.select('id').maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error('The saved video state changed. Reload before resuming.'),{httpStatus:409});
  const sync=await Promise.allSettled([
    supabase.from('admin_review_cases').update({status:'creating',needs_review:true,failure_code:null,failure_stage:null,failure_message:null,updated_at:now}).eq('post_id',post.id),
    supabase.from('admin_generation_work_items').update({status:'running',failure_code:null,failure_stage:null,failure_message:null,updated_at:now}).eq('post_id',post.id),
  ]);
  const syncPending=sync.some(r=>r.status==='rejected'||r.value?.error);
  if(syncPending)console.warn('Saved Kling source queued; review-row synchronization awaits final delivery',{postId:post.id});
  // All source/assets/audits/render IDs remain byte-for-byte untouched.
  return {post_id:post.id,task_id:post.kling_task_id,resumed:true,new_kling_generation:false,review_sync_pending:syncPending};
}
