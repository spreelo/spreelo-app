import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chooseWebsite429DelayMs,decideWebsite429Action,isCompletedWebsiteHistoryPost} from '../lib/website429RecoveryPolicy.js';
import {hasProtectedVideoJob,deferKlingRenderContinuation} from '../lib/videoJobSafety.js';
import {finishSavedShotstackPost,shotstackContinuationError} from '../lib/shotstackContinuation.js';
import {classifyProductionFailure} from '../lib/videoProductionController.js';
import {automationFailureHandoffError} from '../lib/videoFailureDiagnostics.js';
import {normalizeVideoDurationSeconds} from '../lib/videoDuration.js';

const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const quiet={info(){},warn(){},error(){}};
const domain=v=>new URL(String(v).includes('://')?v:`https://${v}`).hostname.replace(/^www\./,'');
const historyFunction=source.slice(source.indexOf('async function getWebsiteHistoricalDelivery('),source.indexOf('async function releaseHistorical429Rescue('));
function historyDb({history=[],posts=[],historyError=null,postsError=null}={}) {
 return {from(table){return {select(){return this;},not(){return this;},ilike(){return this;},order(){return this;},limit(){return this;},in(){return this;},then(resolve){return Promise.resolve(table==='posts'?{data:posts,error:postsError}:{data:history,error:historyError}).then(resolve);}};}};
}
const ctx=vm.createContext({console:quiet,getWebsiteFetchDomain:domain,getWebsiteProductSourceUrl:()=> 'https://pressit.se',isCompletedWebsiteHistoryPost});
vm.runInContext(historyFunction,ctx);
const readHistory=options=>ctx.getWebsiteHistoricalDelivery({supabase:historyDb(options),rule:{},brandProfile:{},domain:'pressit.se'});
assert.equal((await readHistory({})).known,true);
assert.equal((await readHistory({historyError:{message:'DB unavailable'}})).known,false);
assert.equal((await ctx.getWebsiteHistoricalDelivery({supabase:{from(){throw new Error('Connection reset');}},rule:{},brandProfile:{},domain:'pressit.se'})).known,false);
assert.equal((await readHistory({history:[{post_id:'p',source_url:'https://pressit.se/products/p'}],postsError:{message:'DB unavailable'}})).known,false);
assert.equal((await readHistory({history:[{post_id:'p',source_url:'https://pressit.se.evil.test/products/p'}],posts:[{status:'published'}]})).successful,false);
const capped=Array.from({length:501},(_,n)=>({post_id:`p${n}`,source_url:'https://pressit.se/products/p'}));
assert.equal((await readHistory({history:capped,posts:[{status:'failed'}]})).known,false);
assert.equal((await readHistory({history:capped,posts:[{status:'pending_approval',image_status:'ready',image_url:'saved.png'}]})).successful,true);
assert.equal(isCompletedWebsiteHistoryPost({status:'pending_approval',content_type_id:'ai_product_video',image_status:'ready',image_url:'poster'}),false);
assert.equal(isCompletedWebsiteHistoryPost({status:'pending_approval',video_provider:'kling',image_status:'ready',image_url:'poster'}),false);
assert.equal(isCompletedWebsiteHistoryPost({status:'cancelled',video_status:'ready',video_url:'film'}),false);
assert.equal(chooseWebsite429DelayMs({consecutive429Count:1.8}),15*60_000);

// Exercise the worker's actual 429 routing callback, not just its pure policy.
const route429=source.slice(source.indexOf('      const rescueCurrentOccurrenceForWebsiteRateLimit ='),source.indexOf('      const deferCurrentOccurrenceForWebsiteRateLimit ='));
async function routeCase({success=false,known=true,origin='http_response',fetchState={}}={}) {
 const deferred=[],rescued=[],failed=[];
 const c=vm.createContext({supabase:{},rule:{},automationBrandProfile:{website_url:'https://pressit.se'},summary:{},
  getWebsiteFetchDomain:domain,getWebsiteProductSourceUrl:()=> 'https://pressit.se',
  getWebsiteHistoricalDelivery:async()=>({known,successful:success}),getWebsiteDomainFetchState:async()=>fetchState,
  decideWebsite429Action,chooseWebsite429DelayMs,
  deferCurrentOccurrenceForWebsiteRateLimit:async(...args)=>{deferred.push(args);return {retryCount:20};},
  markBrandFor429Rescue:async args=>{rescued.push(args);return {updated:true};},
  failCurrentOccurrence:async(...args)=>failed.push(args),BRAND_429_RESCUE_INTERNAL_MESSAGE:'Remote HTTP 429'});
 vm.runInContext(route429+'\nglobalThis.route429=rescueCurrentOccurrenceForWebsiteRateLimit;',c);
 const result=await c.route429({origin,message:'Website delayed',url:'https://pressit.se'},'test');
 return {result,deferred,rescued,failed};
}
assert.equal((await routeCase()).result.rescue,true);
const proven=await routeCase({success:true,fetchState:{consecutive429Count:4,waitMs:0}});
assert.equal(proven.result.rescue,false);assert.equal(proven.deferred[0][0].retryAfterMs,120*60_000);
assert.equal(proven.deferred[0][3].continuousRetry,true);assert.equal(proven.failed.length,0);
assert.equal((await routeCase({known:false})).result.rescue,false);
assert.equal((await routeCase({origin:'internal_pacing',fetchState:{cooldownActive:true,lastStatus:429}})).result.rescue,false);
assert.equal((await routeCase({origin:'domain_cooldown',fetchState:{cooldownActive:true,lastStatus:429}})).result.rescue,true);
console.log('PASS: real 429 routing, exact source host, incomplete/failed history, video completion evidence and escalating cooldown');

// Pending renders preserve attempts and the same source/render IDs.
let values;
const selection={shotstack_render_id:'render-1',kling_source_storage_url:'saved-source',finalization_control:{attempts:2,max_attempts:3}};
const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{video_background_selection:selection}};},update(v){values=v;return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};}};
const waiting=Object.assign(new Error('Shotstack still rendering'),{code:'SHOTSTACK_RENDER_PENDING',renderId:'render-1'});
await deferKlingRenderContinuation({supabase:db,post:{id:'p'},error:waiting,nowMs:100000000});
assert.equal(values.video_background_selection.finalization_control.attempts,2);
assert.equal(values.video_background_selection.shotstack_render_id,'render-1');
assert.equal(values.video_background_selection.kling_source_storage_url,'saved-source');
assert.equal(values.video_background_selection.finalization_control.state,'waiting_render');
selection.render_wait_started_at=new Date(1).toISOString();
await assert.rejects(deferKlingRenderContinuation({supabase:db,post:{id:'p'},error:waiting,nowMs:7*3600_000}),e=>e.code==='SHOTSTACK_RENDER_TIMEOUT');
assert.equal(classifyProductionFailure({code:'SHOTSTACK_RENDER_FAILED',message:'Render failed'}).permanent,true);
assert.equal(hasProtectedVideoJob({video_provider:'kling',kling_generation_count:1}),true);
assert.equal(hasProtectedVideoJob({video_provider:'kling',kling_task_id:'paid-task'}),true);
assert.equal(hasProtectedVideoJob({video_provider:'shotstack',video_background_selection:{shotstack_checkpoint:{phase:'submitting'}}}),true);
assert.equal(hasProtectedVideoJob({video_provider:'shotstack',video_status:'generating'}),false);
const deletion=source.slice(source.indexOf('async function deleteIncompleteAnimatedVideoDrafts('),source.indexOf('function isStaleIncompleteCarouselDraft('));
const deleteCtx=vm.createContext({isIncompleteAnimatedVideoDraftPost:()=>true,hasProtectedVideoJob});
vm.runInContext(deletion,deleteCtx);
assert.equal(await deleteCtx.deleteIncompleteAnimatedVideoDrafts({supabase:{from(){throw new Error('Must not delete paid job');}},posts:[{id:'p',kling_task_id:'paid-task'}]}),0);

const rejection=Object.assign(new Error('Visible stray line'),{code:'SHOTSTACK_DESIGN_REVIEW_REJECTED'});
assert.equal(shotstackContinuationError(rejection,'render-1'),rejection);
let uploads=0;
const options={supabase:db,post:{id:'p',user_id:'u',video_render_id:'render-1'},
 waitForRender:async()=>({url:'render.mp4'}),uploadVideo:async()=>{uploads++;return {videoUrl:'saved.mp4',videoStoragePath:'u/p.mp4'};}};
await assert.rejects(finishSavedShotstackPost(options),e=>e.code==='SHOTSTACK_REVIEW_REQUIRED');
assert.equal(uploads,0);
await assert.rejects(finishSavedShotstackPost({...options,reviewVideo:async()=>{throw Object.assign(new Error('Visible corruption'),{code:'VIDEO_ADVERTISING_DESIGN_REJECTED'});}}),e=>e.code==='SHOTSTACK_DESIGN_REVIEW_REJECTED');
assert.equal(uploads,0);
await assert.rejects(finishSavedShotstackPost({...options,reviewVideo:async()=>{throw new Error('Review connection timed out');}}),e=>e.code==='SHOTSTACK_RENDER_PENDING'&&e.cause.message==='Review connection timed out');
console.log('PASS: pending render does not consume failures, paid jobs cannot be deleted, quality rejects stay terminal and missing reviews cannot auto-approve');

// Execute the actual Kling ready handoff with delivery failing after persistence.
const klingSource=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const readyCode=klingSource.slice(klingSource.indexOf('async function finalizeReadyTask('),klingSource.indexOf('export async function GET'));
const readyWrites=[];
const readyDb={storage:{from:()=>({upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:'saved.mp4'}})})},from(){return {update(v){readyWrites.push(v);return this;},eq(){return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};}};
const readyCtx=vm.createContext({console:quiet,Date,normalizeVideoDurationSeconds,POST_VIDEOS_BUCKET:'post-videos',downloadKlingVideo:async()=>Buffer.from('video'),completeShotstackDeliveryForPost:async()=>{throw new Error('Delivery DB unavailable');}});
vm.runInContext(readyCode,readyCtx);
assert.equal(await readyCtx.finalizeReadyTask(readyDb,{id:'p',user_id:'u',kling_task_id:'t',video_background_selection:{}},{status:'succeeded',durationSeconds:6,videoUrl:'original'}),'saved.mp4');
assert.equal(readyWrites.length,1);assert.equal(readyWrites[0].video_status,'ready');
console.log('PASS: actual Kling ready handoff retains completed video when delivery fails');


const original=Object.assign(new Error('Original video failure'),{code:'KLING_STATUS_403'});
const handoff=automationFailureHandoffError({error:original,handoffError:new Error('Supabase handoff unavailable'),ruleId:'r',postId:'p',stage:'kling_submit'});
assert.equal(handoff.cause,original);assert.equal(handoff.originalFailure.code,'KLING_STATUS_403');
assert.match(handoff.message,/Original video failure/);assert.match(handoff.message,/Supabase handoff unavailable/);
const incidentCode=source.slice(source.indexOf('async function sendImmediateAdminFailureAlertEmail('),source.indexOf('async function sendAutomationCreationFailureEmail('));
let recorded=0;
const incidentCtx=vm.createContext({console:quiet,process:{env:{}},getImmediateAdminAlertRecipients:()=>[],
 buildAdminIncidentDedupeKey:()=> 'test',recordAdminRuntimeIncident:async()=>{recorded++;return {incidentId:'incident',shouldEmail:true};},releaseAdminIncidentEmailReservation:async()=>{}});
vm.runInContext(incidentCode,incidentCtx);
const alert=await incidentCtx.sendImmediateAdminFailureAlertEmail({supabase:{},message:handoff.message});
assert.equal(recorded,1);assert.equal(alert.sent,false);assert.equal(alert.incidentId,'incident');

// Execute real Chromium initialization logic with mocked imports: a transient
// extraction failure must not cache a rejected promise for the warm worker.
const sampler=fs.readFileSync('lib/videoFrameSampler.js','utf8');
let initializations=0;
const samplerCtx=vm.createContext({process:{env:{}},fakeImport:async name=>name==='puppeteer-core'?{default:{}}:{default:{args:[],executablePath:async()=>{initializations++;if(initializations===1)throw new Error('temporary extraction failed');return '/test/chromium';}}}});
vm.runInContext(sampler.slice(0,sampler.indexOf('export async function sampleRemoteVideoFrames')).replaceAll('import(', 'fakeImport('),samplerCtx);
await assert.rejects(samplerCtx.getBrowserLaunchOptions(),e=>e.code==='VIDEO_FRAME_SAMPLER_UNAVAILABLE');
const recovered=await samplerCtx.getBrowserLaunchOptions();assert.equal(recovered.launchOptions.executablePath,'/test/chromium');assert.equal(initializations,2);
console.log('PASS: worker handoff retains original cause, incidents persist without email and Chromium initialization recovers after transient failure');
