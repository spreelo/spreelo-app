// These errors retain the provider job and must never enter generation retries.
export function shotstackContinuationError(error,renderId,lastStatus=null) {
  if(error?.code==='SHOTSTACK_RENDER_FAILED')return error;
  const pending=new Error(`Shotstack job ${renderId} continues or requires a status check: ${error?.message || 'pending'}`);
  pending.code='SHOTSTACK_RENDER_PENDING';pending.renderId=renderId;pending.lastStatus=lastStatus||error?.lastStatus||null;pending.cause=error;
  return pending;
}
export function hasShotstackCheckpoint(post) {
  return ['','shotstack'].includes(String(post?.video_provider || '').toLowerCase()) &&
    (Boolean(post?.video_render_id) || Boolean(post?.video_background_selection?.shotstack_checkpoint));
}
export async function finishSavedShotstackPost({supabase,post,waitForRender,uploadVideo,costTracker=null}) {
  if(!post?.video_render_id){const error=new Error('Shotstack submission outcome is unknown. The saved post must be reconciled before any new submission.');error.code='SHOTSTACK_SUBMISSION_UNKNOWN';throw error;}
  let render;
  try{render=await waitForRender({renderId:post.video_render_id,maxAttempts:5,delayMs:3000});}
  catch(error){throw shotstackContinuationError(error,post.video_render_id);}
  try {
    const video=await uploadVideo({supabase,videoUrl:render.url,userId:post.user_id,postId:post.id});
    const checkpoint=post.video_background_selection?.shotstack_checkpoint || {};
    const values={video_url:video.videoUrl,video_storage_path:video.videoStoragePath,video_status:'ready',video_error:null,
      image_url:post.image_url||checkpoint.poster_url||render.posterUrl||null,
      image_storage_path:post.image_storage_path||checkpoint.poster_storage_path||null,image_status:'ready',
      status:'pending_approval',updated_at:new Date().toISOString(),
      video_background_selection:{...(post.video_background_selection||{}),shotstack_checkpoint:{...checkpoint,phase:'ready',completed_at:new Date().toISOString()}}};
    const {error}=await supabase.from('posts').update(values).eq('id',post.id).eq('video_render_id',post.video_render_id);
    if(error)throw error;
    if(costTracker?.recordShotstack){try{await costTracker.recordShotstack({renderId:post.video_render_id,billableSeconds:render.billableSeconds,plan:render.plan,environment:render.environment});}catch(error){console.warn('Could not record completed Shotstack cost', {renderId:post.video_render_id,message:error.message});}}
    return {...post,...values};
  }catch(error){throw shotstackContinuationError(error,post.video_render_id,'done');}
}
