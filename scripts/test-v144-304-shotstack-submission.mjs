import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {finishSavedShotstackPost,shotstackContinuationError} from '../lib/shotstackContinuation.js';
const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const begin=source.indexOf('export async function generateAnimatedProductVideo');
const code=source.slice(begin,source.indexOf('async function resolveBrandLogoPublicUrl',begin)).replace('export async','async');
let ai=0,submissions=0,updates=[],post={id:'post',user_id:'user',video_render_id:'previous-render'},stage='queued';
const supabase={from(table){return {update(values){
  const query={eq(){return query;},then(resolve,reject){
    if(table==='posts'){updates.push(values);post={...post,...values};}
    return Promise.resolve({error:null}).then(resolve,reject);
  }};return query;
}};}};
const waitForRender=async ({renderId})=>{assert.equal(renderId,'saved-render');if(stage==='queued')throw shotstackContinuationError(new Error('queued'),renderId,'queued');return {url:'video'};};
const ctx=vm.createContext({console:{info(){},warn(){}},Date,Number,String,Boolean,Object,Error,
 ANIMATED_VIDEO_DURATION_SECONDS:5,createAnimatedProductVideoAssets:async()=>{ai++;return {backgroundAsset:{id:'bg'},posterUrl:'poster',posterStoragePath:'poster.png',backgroundSelection:{}};},
 selectBestVideoMusic:async()=>null,getCustomerFacingCampaignTheme:()=>null,buildProductPushEdit:()=>({}),
 queueShotstackRender:async()=>{submissions++;assert.equal(post.video_render_id,null);assert.equal(post.video_background_selection.shotstack_checkpoint.phase,'submitting');return 'saved-render';},
 finishSavedShotstackPost,shotstackContinuationError,waitForShotstackRender:waitForRender,
 uploadRenderedVideoToStorage:async()=>({videoUrl:'stored',videoStoragePath:'user/post.mp4'})});
vm.runInContext(code,ctx);
const args={supabase,rule:{},postContent:'Saved caption',userId:'user',postId:'post',occurrenceId:'occurrence'};
await assert.rejects(ctx.generateAnimatedProductVideo(args),e=>e.code==='SHOTSTACK_RENDER_PENDING');
assert.equal(submissions,1);assert.equal(ai,1);assert.equal(post.video_render_id,'saved-render');assert.equal(post.content,'Saved caption');assert.equal(post.video_provider,'shotstack');assert.equal(post.video_background_selection.shotstack_checkpoint.occurrence_id,'occurrence');
stage='done';const ready=await finishSavedShotstackPost({supabase,post,waitForRender,uploadVideo:ctx.uploadRenderedVideoToStorage});
assert.equal(ready.video_status,'ready');assert.equal(ai,1);assert.equal(submissions,1);
ctx.queueShotstackRender=async()=>{submissions++;throw new Error('connection interrupted after POST');};
await assert.rejects(ctx.generateAnimatedProductVideo(args),e=>e.code==='SHOTSTACK_SUBMISSION_UNKNOWN');
assert.equal(post.video_render_id,null);assert.equal(post.video_background_selection.shotstack_checkpoint.phase,'submitting');
await assert.rejects(finishSavedShotstackPost({supabase,post,waitForRender}),e=>e.code==='SHOTSTACK_SUBMISSION_UNKNOWN');assert.equal(submissions,2);
console.log('v144.304: assets/caption saved before submission, old ID cleared, queued render continued with one AI and one POST, ambiguous submission blocked.');
