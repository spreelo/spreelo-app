// A paid or uncertain provider job is evidence to preserve, never a stale draft
// that can be deleted to make a queue retry start over.
export function hasProtectedVideoJob(post) {
  const selection = post?.video_background_selection || {};
  return Boolean(post?.kling_task_id || Number(post?.kling_generation_count || 0) > 0 ||
    post?.video_render_id || selection.shotstack_checkpoint || selection.shotstack_render_id ||
    (post?.video_provider === 'kling' && ['submitting','submitted','processing','finalizing','finalization_retry'].includes(post.video_status)));
}

export async function deferKlingRenderContinuation({supabase, post, error, nowMs = Date.now()}) {
  const {data:latest,error:readError} = await supabase.from('posts').select('video_background_selection').eq('id',post.id).maybeSingle();
  if(readError)throw Object.assign(new Error(`Could not load pending render checkpoint: ${readError.message}`),{cause:error});
  if(!latest)throw new Error(`Pending video post ${post.id} disappeared`);
  const selection = latest.video_background_selection || {};
  const prior = selection.finalization_control || {};
  const startedAt = selection.render_wait_started_at || new Date(nowMs).toISOString();
  if(nowMs - new Date(startedAt).getTime() > 6 * 60 * 60_000) {
    throw Object.assign(new Error(`Existing Shotstack render is still pending after six hours: ${error.message}`),
      {code:'SHOTSTACK_RENDER_TIMEOUT',renderId:error.renderId,cause:error});
  }
  const next = {...selection,render_wait_started_at:startedAt,finalization_control:{...prior,
    state:'waiting_render',next_retry_at:new Date(nowMs+5*60_000).toISOString(),
    provider_regeneration_allowed:false}};
  const {error:saveError} = await supabase.from('posts').update({video_status:'finalization_retry',
    video_error:String(error.message).slice(0,1600),video_background_selection:next,
    kling_last_polled_at:new Date(nowMs).toISOString(),updated_at:new Date(nowMs).toISOString()}).eq('id',post.id);
  if(saveError)throw Object.assign(new Error(`Could not save pending render checkpoint: ${saveError.message}`),{cause:error});
  post.video_background_selection = next;
}
