import {completedVideoSelection} from '../lib/videoJobSafety.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import {isKlingCreativeOnlyReview,resumeKlingCreativeReview} from '../lib/klingCreativeReview.js';
import {completeShotstackDelivery} from '../lib/shotstackDelivery.js';
import {videoFailureDetails,classifyVideoProviderCreationFailure} from '../lib/videoFailureDiagnostics.js';
import {diagnoseFailedPost} from '../lib/adminFailureRecovery.js';
import {assembleKlingPrompt} from '../lib/klingPromptBudget.js';
import {validateKlingCreativeDirection} from '../lib/klingCreativeSafety.js';
import {normalizeVideoDurationSeconds} from '../lib/videoDuration.js';

const image=await sharp({create:{width:540,height:960,channels:3,background:'#29333a'}}).png().toBuffer();
const intel={physical_subject:{kind:'physical_product',name:'Verified physical product'},confidence:.99,verified_actions:[],components:[]};
const plan={strategy:'The supported wearer walks through the established scene, keeping the exact product visible.',mode:'scene_verified_wear',action_id:'',
  camera_mode:'follow_same_view',environment_motion:'none',product_pose:'source_locked',shot_count:1,finish_seconds:5,initial_conditions:[],stationary_objects:[],risk:'low'};
const story={concept:'A purposeful product-specific encounter',setting:'A relevant real-world setting',opening_framing:'The actor, support and clear path are visible',
  beat_0_1:'The action starts',beat_1_4:'The supported actor walks purposefully',beat_4_5:'The product is prominent as the action resolves',motion_plan:plan};
const args={model:'test',intelligence:intel,sourceDataUrl:`data:image/png;base64,${image.toString('base64')}`,context:{fullProductInteractionSafe:true}};
function ai(values,calls=[]) {return {responses:{create:async request=>{calls.push(request);const v=values.shift();assert(v,'unexpected additional planning request');if(v instanceof Error)throw v;return {output_text:JSON.stringify(v)};}}};}
const incorrect={...story,motion_plan:{...plan,action_id:'walk'}};
const calls=[];
const repaired=await motion.planKlingCommercialStory({...args,openai:ai([incorrect,story],calls)});
assert.equal(repaired.status,'planned');assert.equal(calls.length,2);
assert(repaired.validation_attempts[0].problems.includes('scene_verified_wear_action_id_must_be_empty'));
assert.equal(repaired.validation_attempts[0].proposal.action_id,'walk');
assert(calls[1].input[0].content[0].text.includes('scene_verified_wear_action_id_must_be_empty'));
const long={...story,motion_plan:{...plan,strategy:'A complete valid but verbose strategy. '.repeat(6)}};
const lengthFixed=await motion.planKlingCommercialStory({...args,openai:ai([long,story])});
assert.equal(lengthFixed.status,'planned');assert(lengthFixed.validation_attempts[0].problems.some(p=>p.startsWith('strategy_exceeds_160_characters:')));
const rejected=await motion.planKlingCommercialStory({...args,openai:ai([incorrect,incorrect])});
assert.equal(rejected.status,'unavailable');assert.equal(rejected.validation_attempts.length,2);
assert.match(rejected.reason,/scene_verified_wear_action_id_must_be_empty/);
let planningError;
try {motion.assertKlingMotionPlanningReady({story:rejected});}catch(e){planningError=e;}
assert.equal(planningError.code,'KLING_MOTION_PLAN_REVIEW_REQUIRED');
const diagnostic=videoFailureDetails(planningError);
assert.equal(diagnostic.motion_planning.validation_attempts.length,2);assert.equal(diagnostic.retryable,false);
assert.match(diagnostic.action,/Ingen Kling-video har beställts/);
assert.match(classifyVideoProviderCreationFailure(planningError).customerMessage,/No Kling video has been ordered/);
assert.match(diagnoseFailedPost({status:'failed',video_background_selection:{failure_diagnostic:diagnostic}}).instruction,/exakta valideringsfelen/);
const outageCalls=[];
const outage=await motion.planKlingCommercialStory({...args,openai:ai([new Error('planning service timeout')],outageCalls)});
assert.equal(outageCalls.length,1);assert.equal(outage.status,'unavailable');
console.log('PASS: exact planning predicates and rejected proposal retained, one bounded correction, no retries of planning outages');

// Execute the actual opening/rescue path. An invalid story cannot fall through
// to a paid image, generic background or the Kling cost-claim RPC.
const route=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
const openingCode=extract(route,'async function generateKlingDirectSceneOpeningFrame(','async function createKlingProductReferenceFrame(');
const rescueCode=extract(route,'export async function submitAdminRescueAiProductVideo(','function normalizeSlideText(').replace('export async','async');
let images=0,claims=0,backgrounds=0;
const quiet={info(){},warn(){},error(){}};
const context=vm.createContext({...motion,sharp,Buffer,console:quiet,PRODUCT_RESEARCH_FAST_MODEL:'test',toFile:async b=>b,
  truncateText:(s,n)=>String(s).slice(0,n),isEngagementAiVideoRule:()=>false,
  getKlingVerifiedViewInstruction:()=> 'Preserve the verified view.',getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>'',
  fetchImageBufferForOverlay:async()=>image,assessKlingReferenceSafety:async()=>({productIntelligence:intel,fullProductInteractionSafe:true}),
  selectKlingNaturalStartBackground:async()=>{backgrounds++;throw new Error('Must not buy another background');}});
vm.runInContext(openingCode+'\n'+rescueCode,context);
const invalidAi=ai([incorrect,incorrect]);invalidAi.images={edit:async()=>{images++;throw new Error('Must not generate image');}};
await assert.rejects(()=>context.submitAdminRescueAiProductVideo({openai:invalidAi,supabase:{rpc:async()=>{claims++;}},rule:{website_item:{title:'Verified product',image_url:'https://example.com/product.png'}},userId:'u',postId:'p'}),
  e=>e.code==='KLING_MOTION_PLAN_REVIEW_REQUIRED');
assert.equal(images,0);assert.equal(claims,0);assert.equal(backgrounds,0);
const prefix=extract(route,'function getKlingProviderSafetyPrefix(','function getKlingProductPromptFallback(');
const build=extract(route,'async function buildKlingProductVideoPrompt(','function buildKlingEngagementVideoPrompt(');
Object.assign(context,{assembleKlingPrompt,validateKlingCreativeDirection});vm.runInContext(prefix+'\n'+build,context);
const badPreflight={identity_safe:true,source_view_safe:true,functions_supported:true,scene_safe:false,causality_safe:true,confidence:.98,reason:'The actual frame does not support walking'};
await assert.rejects(()=>context.buildKlingProductVideoPrompt({openai:ai([badPreflight]),rule:{},referenceFrameBuffer:image,
  referenceSafety:{productIntelligence:intel,commercialStory:{...story,status:'planned'},fullProductInteractionSafe:true}}),
  e=>e.code==='KLING_MOTION_PLAN_REVIEW_REQUIRED'&&e.motionPlanning.preflight.scene_safe===false);
console.log('PASS: actual rescue path stops before image, fallback background or Kling claim; rejected actual-frame preflight cannot become a paid camera fallback');

// Reproduce the reported post through the REAL finalizer and REAL delivery
// logic. Creative criticism follows the customer's configured delivery route.
const creative={status:'failed',decision:'admin_review',confidence:.95,violation_codes:['commercial_motion_inadequate'],reason:'Product and scene intact; camera follows its plan but the interaction is not engaging enough.'};
assert(isKlingCreativeOnlyReview(creative));
for(const invalid of [{...creative,violation_codes:[]},{...creative,confidence:.8},{...creative,violation_codes:['commercial_motion_inadequate','product_identity_changed']},{...creative,decision:'pixel_preserving_animation'}])assert(!isKlingCreativeOnlyReview(invalid));
const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
async function runFinalizer(validation,{reviewRequired=false,isAdminTest=false,origin=null}={}) {
  const post={id:'7e887e31-1d0b-4f29-b289-727a70083264',user_id:'u',video_provider:'kling',video_status:'finalizing',kling_task_id:'939905191372009555',video_background_selection:{}};
  if(origin)post.video_background_selection.shotstack_checkpoint={origin};
  const sourceTask={status:'succeeded',cached:true,videoUrl:'https://example.com/preserved-paid-source.mp4',durationSeconds:6};
  const writes=[],failed=[],rendered=[],downloaded=[],incidents=[];let emailed=0;
  const delivery={lease_token:'lease',history_done:true,credits_done:true};
  const supabase={rpc:async(name)=>{assert.equal(name,'claim_shotstack_delivery');return {data:{claimed:true,delivery},error:null};},
    storage:{from:()=>({upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:'https://example.com/final.mp4'}})})},
    from(table){return {select(){return this;},eq(){return this;},or(){return this;},not(){return this;},order(){return this;},async limit(){return {data:[post],error:null};},
      update(values){writes.push({table,values});if(table==='posts')Object.assign(post,values);return this;},
      upsert(values){writes.push({table,values});return this;},then(resolve){return Promise.resolve({data:[{post_id:post.id}],error:null}).then(resolve);}};}};
  const ctx=vm.createContext({completedVideoSelection,Response,Date,process:{env:{}},console:quiet,isAuthorized:()=>true,createSupabaseAdmin:()=>supabase,getMaxPendingHours:()=>6,
    KLING_PROVIDER_PENDING_STATUSES:['processing'],KLING_FINALIZER_POST_SELECT:'*',finalizationJobGate:()=>({action:'proceed'}),finalizationRetryBackoffIsFresh:()=>false,
    claimKlingFinalization:async()=>true,getCachedKlingSource:()=>sourceTask,isKlingTaskSuccessful:s=>s==='succeeded',isKlingTaskFailed:()=>false,
    createGenerationCostTracker:()=>({recordKling:async()=>{}}),OpenAI:class{},wrapOpenAIForCostTracking:()=>({}),normalizeVideoDurationSeconds,
    preserveKlingSourceVideo:async({task})=>task,restoreKlingLegacyViewLock:async()=>{},
    validateFinishedKlingProductIdentity:async()=>{post.video_background_selection.product_video_validation=validation;return {passed:validation.passed===true,validation};},
    isKlingCreativeOnlyReview,markKlingPostFailed:async(...v)=>failed.push(v),
    getKlingFinalVideoSource:async({task})=>{rendered.push(task.videoUrl);return {videoUrl:'https://example.com/render.mp4',durationSeconds:6,postprocessApplied:true};},
    downloadKlingVideo:async url=>{downloaded.push(url);return Buffer.from('video');},POST_VIDEOS_BUCKET:'post-videos',
    completeShotstackDeliveryForPost:async()=>completeShotstackDelivery({supabase,post,rule:{},reviewRequired,isAdminTest,submissionAlreadySettled:true,
      getRecipient:async()=>({email:'customer@example.com'}),sendEmail:async()=>{emailed++;delivery.mail_sent_at=new Date().toISOString();},saveHistory:async()=>{throw new Error('Kling history must not settle twice');}}),
    sendTerminalVideoAdminAlert:async v=>incidents.push(v)});
  vm.runInContext(finalizer.slice(finalizer.indexOf('async function finalizeReadyTask(')).replace('export async function GET','async function GET'),ctx);
  const response=await ctx.GET({});const result=await response.json();
  return {result,post,writes,failed,rendered,downloaded,incidents,emailed};
}
const finished=await runFinalizer(creative);
assert.equal(finished.result.summary.completed,1);assert.equal(finished.result.summary.failed,0);
assert.equal(finished.result.summary.creative_feedback,1);assert.equal(finished.result.summary.product_identity_rejected,0);
assert.deepEqual(finished.rendered,['https://example.com/preserved-paid-source.mp4']);
assert.deepEqual(finished.downloaded,['https://example.com/render.mp4']);
assert.equal(finished.post.video_status,'ready');assert.equal(finished.post.status,'pending_approval');
assert.equal(finished.post.admin_review_status,'not_required');assert.match(finished.post.admin_review_note,/ej leveransspärr/);
assert.equal(finished.emailed,1);assert.equal(finished.failed.length,0);assert.equal(finished.incidents.length,0);
assert(finished.writes.some(w=>w.table==='admin_review_cases'&&w.values.status==='sent_directly'));
assert(finished.writes.some(w=>w.table==='admin_generation_work_items'&&w.values.status==='history'));
for(const settings of [{reviewRequired:true},{isAdminTest:true},{origin:'admin'}]) {
  const admin=await runFinalizer(creative,settings);
  assert.equal(admin.result.summary.completed,1);assert.equal(admin.post.admin_review_status,'pending');assert.equal(admin.emailed,0);
  assert(admin.writes.some(w=>w.table==='admin_review_cases'&&w.values.status==='awaiting_spreelo'));
  assert(admin.writes.some(w=>w.table==='admin_generation_work_items'&&w.values.status==='approval'));
}
// New audits must no longer call a purely creative opinion a failed/admin-only
// decision. Legacy cached creative failures above still follow normal routing.
const audit=Object.fromEntries(Object.entries(motion.videoQualitySchema.properties).filter(([,v])=>v.type==='boolean')
  .map(([key])=>[key,!['unverified_surface_exposed','invented_or_moved_identity_detail','object_materialized_or_disappeared','commercial_motion_engaging'].includes(key)]));
Object.assign(audit,{confidence:.95,reason:creative.reason,issues:[{code:'insufficient_commercial_motion',time_seconds:2,observation:'Slow camera push instead of stronger interaction'}]});
const decision=motion.decideKlingVideoQuality(audit,{checkCreativeMotion:true});
assert.equal(decision.passed,true);assert.equal(decision.decision,'deliver');assert.deepEqual(decision.violation_codes,[]);
assert.equal(decision.creative_feedback.code,'commercial_motion_inadequate');
for(const code of ['script_deviation','unfinished_closing_action']) {
  const creativeDifference=motion.decideKlingVideoQuality({...audit,commercial_motion_engaging:true,closing_action_resolved:false,
    issues:[{code,time_seconds:5,observation:'Safe action ends differently from the script'}]},{checkCreativeMotion:true});
  assert.equal(creativeDifference.passed,true);assert.equal(creativeDifference.decision,'deliver');assert(creativeDifference.creative_feedback);
  assert(isKlingCreativeOnlyReview({...creative,violation_codes:[code]}),'old purely creative rejections remain recoverable');
}
const newAudit=await runFinalizer({...audit,...decision,status:'passed'});
assert.equal(newAudit.result.summary.completed,1);assert.equal(newAudit.emailed,1);assert.equal(newAudit.post.admin_review_status,'not_required');
assert.match(newAudit.post.admin_review_note,/ej leveransspärr/);
const badAudit=motion.decideKlingVideoQuality({...audit,physical_causality_preserved:false},{checkCreativeMotion:true});
assert.equal(badAudit.passed,false);assert(badAudit.violation_codes.includes('physical_causality_broken'));
const unsafe=await runFinalizer({...creative,violation_codes:['commercial_motion_inadequate','product_identity_changed']});
assert.equal(unsafe.result.summary.failed,1);assert.equal(unsafe.rendered.length,0);assert.equal(unsafe.emailed,0);
assert.equal(unsafe.failed[0][2],'kling_finished_product_identity');
const guide=diagnoseFailedPost({id:'p',status:'failed',video_status:'failed',video_provider:'kling',video_background_selection:{product_video_validation:creative}});
assert.equal(guide.action,'inspect');assert.equal(guide.allowRegenerate,false);assert.match(guide.title,/kreativ återkoppling/);
console.log('PASS: creative-only audits and legacy cached failures follow direct/customer or configured admin/test routing; feedback stays advisory, mixed safety failures block and no paid retry is offered');

// Explicit recovery of an ALREADY PAID source must keep the same post/task,
// every asset/audit and any existing render. Unknown/unsafe states stay blocked.
const oldPost={id:'paid-post',video_provider:'kling',video_status:'failed',kling_task_id:'paid-task',updated_at:'2026-10-16T02:58:48Z',
  video_background_selection:{kling_source_storage_url:'https://example.com/source.mp4',shotstack_render_id:'existing-render',
    end_card_url:'https://example.com/card.png',product_video_validation:creative}};
function resumeDb({race=false,error=null}={}) {
  const writes=[],filters=[];
  return {writes,filters,from(table){const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},
    update(values){writes.push({table,values});return q;},async maybeSingle(){return {data:race?null:{id:oldPost.id},error};},
    then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
}
const recover=resumeDb(),saved=JSON.stringify(oldPost.video_background_selection);
const resumed=await resumeKlingCreativeReview({supabase:recover,post:oldPost});
assert.equal(resumed.post_id,'paid-post');assert.equal(resumed.task_id,'paid-task');assert.equal(resumed.new_kling_generation,false);
assert.equal(JSON.stringify(oldPost.video_background_selection),saved);
assert(!('video_background_selection' in recover.writes[0].values));
assert(!('kling_task_id' in recover.writes[0].values));
assert(recover.filters.some(([k,v])=>k==='updated_at'&&v===oldPost.updated_at));
assert.equal(recover.writes[0].values.video_status,'finalizing');assert.equal(recover.writes.length,3);
for(const change of [
  {video_background_selection:{...oldPost.video_background_selection,product_video_validation:{...creative,violation_codes:['product_identity_changed']}}},
  {video_background_selection:{...oldPost.video_background_selection,shotstack_design_review:{status:'rejected'}}},
  {video_background_selection:{...oldPost.video_background_selection,finalization_control:{state:'needs_repair'}}},
  {video_background_selection:{...oldPost.video_background_selection,kling_source_storage_url:null}},
  {video_status:'finalizing'}, {kling_task_id:null},
])await assert.rejects(resumeKlingCreativeReview({supabase:resumeDb(),post:{...oldPost,...change}}),e=>e.httpStatus===409);
await assert.rejects(resumeKlingCreativeReview({supabase:resumeDb({race:true}),post:oldPost}),e=>e.httpStatus===409);
await assert.rejects(resumeKlingCreativeReview({supabase:resumeDb({error:new Error('DB unavailable')}),post:oldPost}),/DB unavailable/);

// The existing paid-retry API must reject a stale client's attempt to buy a
// replacement for creative feedback, even if the client UI has not refreshed.
const retrySource=fs.readFileSync('app/api/admin/post-approvals/retry-kling/route.js','utf8');
let forbiddenCalls=0;
const retryDb=resumeDb();
const realFrom=retryDb.from;
retryDb.from=table=>{const q=realFrom(table);q.maybeSingle=async()=>({data:oldPost,error:null});return q;};
const retryContext=vm.createContext({Response,isKlingCreativeOnlyReview,resumeKlingCreativeReview,
  getAdminContext:async()=>({admin:retryDb}),submitKlingImageToVideo:async()=>{forbiddenCalls++;throw new Error('Must not buy another Kling film');}});
vm.runInContext(retrySource.slice(retrySource.indexOf('export async function POST')).replace('export async','async'),retryContext);
const denied=await retryContext.POST({json:async()=>({post_id:oldPost.id})});
assert.equal(denied.status,409);assert.equal(forbiddenCalls,0);assert.equal(retryDb.writes.length,0);
const restored=await retryContext.POST({json:async()=>({post_id:oldPost.id,resume_existing:true})});
assert.equal(restored.status,200);assert.equal((await restored.json()).new_kling_generation,false);assert.equal(forbiddenCalls,0);
retryContext.getAdminContext=async()=>({error:'unauthorized'});retryContext.adminContextError=()=>Response.json({error:'unauthorized'},{status:401});
assert.equal((await retryContext.POST({json:async()=>({post_id:oldPost.id,resume_existing:true})})).status,401);
console.log('PASS: explicit same-post/source/render recovery, optimistic-lock race and DB checks, unsafe resume blocked, server refuses creative paid retry and requires admin authorization');
