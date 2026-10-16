import OpenAI from 'openai';
import {reviewRenderedAdvertisingVideo} from '../../../../lib/videoAdvertisingReview.js';
import {sampleRemoteVideoFrames} from '../../../../lib/videoFrameSampler.js';
import {persistTerminalVideoFailure} from '../../../../lib/videoFailurePersistence.js';
import {sendTerminalVideoAdminAlert} from '../../../../lib/videoTerminalAdminAlert.js';
import {videoFailureDetails} from '../../../../lib/videoFailureDiagnostics.js';
import {createClient} from '@supabase/supabase-js';
import {waitForShotstackRender} from '../../../../lib/shotstack.js';
import {finishSavedShotstackPost} from '../../../../lib/shotstackContinuation.js';
import {createGenerationCostTracker,wrapOpenAIForCostTracking} from '../../../../lib/generationCostTracking.js';
import {completeShotstackDeliveryForPost,uploadRenderedVideoToStorage} from '../run-automations/route.js';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

// Automated occurrences are owned by the existing atomic queue lanes. This
// finalizer also completes saved delivery steps, including ready v304 posts.
export async function GET(request){
  const secret=String(process.env.CRON_SECRET||'');
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
  const {data:posts,error}=await supabase.from('posts').select('id,user_id,status,video_render_id,video_status,video_provider,video_background_selection,image_url,image_storage_path,video_duration_seconds,updated_at')
    .eq('video_provider','shotstack').eq('status','generating')
    .eq('video_background_selection->shotstack_checkpoint->>origin','admin')
    .in('video_status',['rendering','finalizing']).order('updated_at',{ascending:true}).limit(2);
  if(error)throw error;
  const startedAt=Date.now();
  const summary={ready:0,pending:0,failed:0,delivered:0,delivery_pending:0};
  const {data:deliveryIds,error:deliveryListError}=await supabase.rpc('list_pending_shotstack_deliveries');
  if(deliveryListError)throw deliveryListError;
  for(const postId of deliveryIds||[]){
    if(Date.now()-startedAt>100_000)break;
    try{
      const result=await completeShotstackDeliveryForPost({supabase,postId});
      if(result.completed)summary.delivered++;else summary.delivery_pending++;
      console.info('Saved Shotstack delivery recovery',{postId,...result});
    }catch(error){summary.delivery_pending++;console.error('Saved Shotstack delivery recovery interrupted',{postId,message:error.message});}
  }
  for(const post of posts||[]){
    if(Date.now()-startedAt>120_000)break;
    if(post.video_status==='finalizing'&&Date.now()-new Date(post.updated_at).getTime()<6*60_000)continue;
    const {data:claimed,error:claimError}=await supabase.from('posts').update({video_status:'finalizing',updated_at:new Date().toISOString()})
      .eq('id',post.id).eq('video_status',post.video_status).eq('updated_at',post.updated_at).select('id');
    if(claimError||!claimed?.length)continue;
    try{
      const tracker=createGenerationCostTracker({supabase});await tracker.bindPost(post.id);
      await finishSavedShotstackPost({supabase,post,waitForRender:waitForShotstackRender,uploadVideo:uploadRenderedVideoToStorage,costTracker:tracker,
        reviewVideo:async({post:reviewPost,render})=>{
          const openai=wrapOpenAIForCostTracking(new OpenAI({apiKey:process.env.OPENAI_API_KEY}),()=>tracker);
          return reviewRenderedAdvertisingVideo({openai,videoUrl:render.url,
            durationSeconds:reviewPost.video_duration_seconds||7,sampleFrames:sampleRemoteVideoFrames,
            headline:reviewPost.video_background_selection?.advertising_headline,
            closingLine:reviewPost.video_background_selection?.advertising_closing_line,
            allowReviewServiceOutage:true,typographyPreflightPassed:true,deliveryFirstRender:true});
        }});
      summary.ready++;
      // A finished render stays ready if only delivery fails. The delivery
      // recovery above will reuse it; never send it into generation failure.
      try {
        const delivery=await completeShotstackDeliveryForPost({supabase,postId:post.id});
        if(delivery.completed)summary.delivered++;else summary.delivery_pending++;
      } catch(deliveryError) {
        summary.delivery_pending++;
        console.error('Completed Shotstack video awaiting delivery',{postId:post.id,message:deliveryError.message});
      }
    }catch(failure){
      try {
        if(failure?.code==='SHOTSTACK_RENDER_PENDING'){
          const diagnostic=videoFailureDetails(failure,{provider:'shotstack',stage:'shotstack_status_poll',taskId:post.video_render_id});
          const {error:pendingError}=await supabase.from('posts').update({video_status:'rendering',
            video_error:diagnostic.message,updated_at:new Date().toISOString()}).eq('id',post.id);
          if(pendingError)throw pendingError;
          summary.pending++;
        }else{
          await persistTerminalVideoFailure({supabase,post,error:failure,provider:'shotstack',stage:'shotstack_finalization'});
          summary.failed++;
          await sendTerminalVideoAdminAlert({supabase,post,stage:'shotstack_finalization',code:failure.code||'SHOTSTACK_FINALIZATION_ERROR',message:failure.message,workerName:'finalize-shotstack-videos'});
        }
      } catch (handoffError) {
        summary.handoff_errors=Number(summary.handoff_errors||0)+1;
        console.error('Shotstack failure handoff interrupted',{postId:post.id,originalError:failure.message,message:handoffError.message});
        try { await sendTerminalVideoAdminAlert({supabase,post,stage:'shotstack_failure_handoff',code:'SHOTSTACK_HANDOFF_ERROR',message:`${failure.message}; failure persistence: ${handoffError.message}`,workerName:'finalize-shotstack-videos'}); }
        catch(alertError){console.error('Shotstack incident unavailable',{postId:post.id,message:alertError.message});}
      }
    }
  }
  return Response.json({ok:true,...summary});
  } catch(error) {
    console.error('Shotstack finalizer batch interrupted',{message:error.message});
    try {await sendTerminalVideoAdminAlert({supabase,post:{},stage:'shotstack_batch',code:error.code||'SHOTSTACK_FINALIZER_CRON_FAILED',message:error.message,workerName:'finalize-shotstack-videos'});}
    catch(alertError){console.error('Shotstack batch incident unavailable',{message:alertError.message});}
    return Response.json({ok:false,error:error.message},{status:500});
  }
}
