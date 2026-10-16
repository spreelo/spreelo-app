import { videoFailureDetails } from './videoFailureDiagnostics.js';

// Keep the original job IDs and all successful checkpoints. No provider submissions.
export async function persistTerminalVideoFailure({supabase, post, error, stage, provider}) {
  const {data:latest,error:readError}=await supabase.from('posts')
    .select('video_background_selection').eq('id',post.id).maybeSingle();
  if(readError)throw readError;
  if(!latest)throw new Error(`Cannot record failure: post ${post.id} missing`);
  const diagnostic=videoFailureDetails(error,{provider,stage,taskId:post.video_render_id||post.kling_task_id});
  const values={status:'failed',admin_review_status:'needs_repair',video_status:'failed',
    video_error:diagnostic.message,
    video_background_selection:{...latest.video_background_selection,failure_diagnostic:diagnostic},
    updated_at:new Date().toISOString()};
  const {error:postError}=await supabase.from('posts').update(values).eq('id',post.id);
  if(postError)throw postError;
  // Check every write: do not report a successful failure handoff on DB rejection.
  const related={failure_code:diagnostic.code,failure_stage:stage,failure_message:diagnostic.message,updated_at:values.updated_at};
  const outcomes=await Promise.allSettled([
    supabase.from('admin_review_cases').update({...related,status:'needs_repair',needs_review:true}).eq('post_id',post.id),
    supabase.from('admin_generation_work_items').update({...related,status:'failed'}).eq('post_id',post.id),
  ]);
  const rejected=outcomes.find(r=>r.status==='rejected'||r.value?.error);
  if(rejected)throw (rejected.reason||rejected.value.error);
  return diagnostic;
}
