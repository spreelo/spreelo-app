import assert from 'node:assert/strict';
import sharp from 'sharp';
import {reviewRenderedAdvertisingVideo,isRecoverableAestheticRejection} from '../lib/videoAdvertisingReview.js';
import {finishSavedShotstackPost} from '../lib/shotstackContinuation.js';
import {renderKlingStructuredMotion, motionPlanIsSupported, passiveKlingMotionPlan} from '../lib/klingVideoIntelligence.js';
import {CREATIVE_DIRECTOR_BRIEF,CREATIVE_DIRECTOR_VERSION} from '../lib/videoCreativeDirector.js';
import fs from 'node:fs';
const jpg=await sharp({create:{width:540,height:960,channels:3,background:'#0f2035'}}).jpeg().toBuffer();
const sampleFrames=async()=>[1,2,3,4].map(()=>({buffer:jpg}));
const reviewer=issue=>({responses:{create:async()=>({output_text:JSON.stringify({approved:false,issue,reason:`test: ${issue}`})})}});
const common={videoUrl:'https://example.com/rendered.mp4',durationSeconds:6,sampleFrames,headline:'EGEN STIL',closingLine:'Hos Pressit.se',typographyPreflightPassed:true,deliveryFirstRender:true,allowReviewServiceOutage:true};
for (const issue of ['too_small','low_contrast','wrong_alignment','poor_hierarchy','other']) {
  const review=await reviewRenderedAdvertisingVideo({...common,openai:reviewer(issue)});
  assert.equal(review.reviewStatus,'creative_advisory',`${issue} must not discard completed render`);
}
for (const issue of ['subject_overlap','stray_graphics','unfinished_end_card']) {
  await assert.rejects(()=>reviewRenderedAdvertisingVideo({...common,openai:reviewer(issue)}),e=>e.code==='VIDEO_ADVERTISING_DESIGN_REJECTED',`${issue} must remain blocker`);
}
const unavailable=await reviewRenderedAdvertisingVideo({...common,openai:reviewer('none'),sampleFrames:async()=>{throw new Error('ffmpeg timeout')}});
assert.equal(unavailable.reviewStatus,'unavailable');
const invalid=await reviewRenderedAdvertisingVideo({...common,openai:{responses:{create:async()=>({output_text:'not json'})}}});
assert.equal(invalid.reviewStatus,'unavailable');
assert(isRecoverableAestheticRejection('Advertising visual quality rejected (too_small): insignificant closing text'));
assert(!isRecoverableAestheticRejection('Advertising visual quality rejected (subject_overlap): item hidden'));
const updates=[];
const supabase={from:(table)=>({update:(values)=>({eq:(key,id)=>({eq:async()=>{updates.push({table,values,key,id});return {error:null}}})})})};
const post={id:'p-1',user_id:'u-1',video_provider:'shotstack',video_render_id:'r-1',video_background_selection:{shotstack_checkpoint:{phase:'design_review_failed',reason:'Advertising visual quality rejected (too_small): copy size'}}};
const ready=await finishSavedShotstackPost({supabase,post,waitForRender:async()=>({url:'https://example.com/render.mp4'}),uploadVideo:async()=>({videoUrl:'https://example.com/stored.mp4',videoStoragePath:'u/p.mp4'}),reviewVideo:async()=>({reviewStatus:'creative_advisory',creativeFeedback:{issue:'low_contrast',reason:'mild'}})});
assert.equal(ready.video_status,'ready');
assert.equal(ready.video_background_selection.shotstack_checkpoint.design_review_status,'creative_advisory');
assert.equal(updates.length,1);
const broken={...post,video_background_selection:{shotstack_checkpoint:{phase:'design_review_failed',reason:'Advertising visual quality rejected (subject_overlap): covers product'}}};
await assert.rejects(()=>finishSavedShotstackPost({supabase,post:broken,waitForRender:async()=>({url:'https://example.com'})}),e=>e.code==='SHOTSTACK_DESIGN_REVIEW_REJECTED');
const contract={strategy:'The original product is used truthfully in an established setting as the camera follows a real existing actor',mode:'scene_verified_wear',action_id:'',camera_mode:'follow_same_view',environment_motion:'none',product_pose:'source_locked',shot_count:1,finish_seconds:5,initial_conditions:[],stationary_objects:[],risk:'low'};
const intel={physical_subject:{kind:'physical_product'},confidence:0.99};
assert(motionPlanIsSupported(contract,intel));
assert.match(renderKlingStructuredMotion(contract,intel),/original product is used truthfully/i,'story concept must reach real prompt');
assert.match(renderKlingStructuredMotion(contract,intel),/seconds 1-4/,'real time-directed action');
assert.match(CREATIVE_DIRECTOR_BRIEF,/actual intended use/i);
assert.equal(CREATIVE_DIRECTOR_VERSION,368);
assert.match(fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url),'utf8'),/CREATIVE DIRECTOR 2\.0 — INDIVIDUAL PRODUCT STORY/);
assert.match(fs.readFileSync(new URL('../app/api/cron/finalize-kling-videos/route.js', import.meta.url),'utf8'),/deliveryFirstRender:true/);
console.log('PASS 144.354: render taste advisory, serious safety review remains blocking, review outages recover, old minor review recoverable, real story strategy in Kling prompt, product-first director');
