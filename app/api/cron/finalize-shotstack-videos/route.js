import {createClient} from '@supabase/supabase-js';
import {waitForShotstackRender} from '../../../../lib/shotstack.js';
import {finishSavedShotstackPost} from '../../../../lib/shotstackContinuation.js';
import {createGenerationCostTracker} from '../../../../lib/generationCostTracking.js';
import {uploadRenderedVideoToStorage} from '../run-automations/route.js';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

// Automated occurrences are owned by the existing atomic queue lanes. This
// finalizer covers admin repair jobs, which have no resumable occurrence.
export async function GET(request){
  const secret=String(process.env.CRON_SECRET||'');
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:posts,error}=await supabase.from('posts').select('id,user_id,status,video_render_id,video_status,video_provider,video_background_selection,image_url,image_storage_path,updated_at')
    .eq('video_provider','shotstack').eq('status','generating')
    .eq('video_background_selection->shotstack_checkpoint->>origin','admin')
    .in('video_status',['rendering','finalizing']).order('updated_at',{ascending:true}).limit(2);
  if(error)return Response.json({error:error.message},{status:500});
  const summary={ready:0,pending:0,failed:0};
  const startedAt=Date.now();
  for(const post of posts||[]){
    if(Date.now()-startedAt>120_000)break;
    if(post.video_status==='finalizing'&&Date.now()-new Date(post.updated_at).getTime()<6*60_000)continue;
    const {data:claimed,error:claimError}=await supabase.from('posts').update({video_status:'finalizing',updated_at:new Date().toISOString()})
      .eq('id',post.id).eq('video_status',post.video_status).eq('updated_at',post.updated_at).select('id');
    if(claimError||!claimed?.length)continue;
    try{
      const tracker=createGenerationCostTracker({supabase});await tracker.bindPost(post.id);
      await finishSavedShotstackPost({supabase,post,waitForRender:waitForShotstackRender,uploadVideo:uploadRenderedVideoToStorage,costTracker:tracker});
      await supabase.from('admin_review_cases').update({status:'awaiting_spreelo',failure_message:null,needs_review:true,updated_at:new Date().toISOString()}).eq('post_id',post.id);
      await supabase.from('admin_generation_work_items').update({status:'approval',failure_message:null,updated_at:new Date().toISOString()}).eq('post_id',post.id);
      summary.ready++;
    }catch(failure){
      if(failure?.code==='SHOTSTACK_RENDER_PENDING'){
        await supabase.from('posts').update({video_status:'rendering',updated_at:new Date().toISOString()}).eq('id',post.id);summary.pending++;
      }else{
        await supabase.from('posts').update({video_status:'failed',video_error:failure.message,updated_at:new Date().toISOString()}).eq('id',post.id);
        await supabase.from('admin_review_cases').update({status:'needs_repair',failure_message:failure.message,needs_review:true,updated_at:new Date().toISOString()}).eq('post_id',post.id);
        await supabase.from('admin_generation_work_items').update({status:'failed',failure_message:failure.message,updated_at:new Date().toISOString()}).eq('post_id',post.id);summary.failed++;
      }
    }
  }
  return Response.json({ok:true,...summary});
}
