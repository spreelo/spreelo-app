import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {videoFailureDetails,classifyVideoProviderCreationFailure} from '../lib/videoFailureDiagnostics.js';
import {classifyProductionFailure} from '../lib/videoProductionController.js';
import {diagnoseFailedPost} from '../lib/adminFailureRecovery.js';
import {persistTerminalVideoFailure} from '../lib/videoFailurePersistence.js';
// The continuation classifier itself has no media dependency.
const continuationSource=fs.readFileSync('lib/shotstackContinuation.js','utf8');
const continuationContext=vm.createContext({});
vm.runInContext(continuationSource.slice(continuationSource.indexOf('export function shotstackContinuationError'),continuationSource.indexOf('export function hasShotstackCheckpoint')).replace('export ',''),continuationContext);
const shotstackContinuationError=continuationContext.shotstackContinuationError;
import {sendTerminalVideoAdminAlert} from '../lib/videoTerminalAdminAlert.js';

const auth=Object.assign(new Error('Kling API unauthorized'),{code:'KLING_STATUS_401',httpStatus:401});
assert.equal(classifyProductionFailure(auth).permanent,true);
assert.equal(classifyVideoProviderCreationFailure(Object.assign(new Error('Too many requests'),{code:'KLING_SUBMIT_429',httpStatus:429})).code,'kling_submit_429');
assert.equal(classifyVideoProviderCreationFailure(Object.assign(new Error('Website returned 429'),{code:'WEBSITE_RATE_LIMITED'})),null);
const wrapped=Object.assign(new Error('Continuation stopped'),{cause:auth});
assert.equal(videoFailureDetails(wrapped).http_status,401);
wrapped.cause=wrapped;
assert.equal(videoFailureDetails(wrapped).causes.length,1);
const guide=diagnoseFailedPost({status:'generating',video_status:'failed',video_provider:'shotstack',video_error:'Shotstack render failed'},'sv');
assert.equal(guide.category,'video');
assert.equal(diagnoseFailedPost({status:'failed',video_error:auth.message},'sv').category,'video');
assert.equal(diagnoseFailedPost({status:'failed',failure:{failure_code:'social_connection_auth_failed',failure_message_internal:'Unauthorized Facebook'}},'sv').category,'publishing');
assert.equal(diagnoseFailedPost({status:'failed',video_error:'Kling rate limit: Too many requests'},'sv').category,'video');
assert.equal(shotstackContinuationError(Object.assign(new Error('Access denied'),{code:'SHOTSTACK_STATUS_403',httpStatus:403}),'render-1').code,'SHOTSTACK_STATUS_403');
assert.equal(shotstackContinuationError(new Error('fetch failed'),'render-1').renderId,'render-1');

// Exercise the actual automation classifier with its external dependencies stubbed.
const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const begin=source.indexOf('function classifyAutomationCreationFailure(');
const end=source.indexOf('\n\nfunction isTransientAutomationError',begin);
const ctx=vm.createContext({isWebsiteRateLimitError:error=>error?.code==='WEBSITE_RATE_LIMITED',classifyVideoProviderCreationFailure,classifyOpenAiServiceError:()=>false,isProtectedProductResearchRetryError:()=>false,isTransientAutomationError:()=>false});
vm.runInContext(source.slice(begin,end),ctx);
ctx.failure=Object.assign(new Error('Kling rate limit: Too many requests'),{code:'KLING_SUBMIT_429',httpStatus:429});
assert.equal(vm.runInContext('classifyAutomationCreationFailure(failure)',ctx).code,'kling_submit_429');
ctx.failure={code:'WEBSITE_RATE_LIMITED',message:'Website returned 429'};
assert.equal(vm.runInContext('classifyAutomationCreationFailure(failure)',ctx).code,'website_rate_limit_rescue');

function fakeDb(failTable=null) {
 const writes=[];
 const db={from(table){return {select(){return this;},update(values){this.values=values;return this;},eq(){return this;},async maybeSingle(){return {data:{video_background_selection:{kling_source_storage_url:'saved-film',shotstack_checkpoint:{render_id:'existing-render'}}},error:failTable==='read'?new Error('read unavailable'):null};},then(resolve,reject){if(this.values)writes.push({table,values:this.values});return Promise.resolve({error:table===failTable?new Error('database unavailable'):null}).then(resolve,reject);}};}};
 return {db,writes};
}
const {db,writes}=fakeDb();
await persistTerminalVideoFailure({supabase:db,post:{id:'p',video_render_id:'render-1'},error:auth,stage:'shotstack_finalization',provider:'shotstack'});
assert.equal(writes[0].values.status,'failed');
assert.equal(writes[0].values.admin_review_status,'needs_repair');
assert.equal(writes[0].values.video_background_selection.kling_source_storage_url,'saved-film');
assert.equal(writes[0].values.video_background_selection.shotstack_checkpoint.render_id,'existing-render');
assert.equal(writes[0].values.video_background_selection.failure_diagnostic.http_status,401);
assert.equal(writes.length,3);
for(const table of ['read','posts','admin_review_cases','admin_generation_work_items']) {
 await assert.rejects(persistTerminalVideoFailure({supabase:fakeDb(table).db,post:{id:'p'},error:auth,stage:'finalization',provider:'kling'}));
}
// Incidents remain durable when email is not configured. No email/network requests.
const old=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
let incidentCalls=0;
try {
 const result=await sendTerminalVideoAdminAlert({supabase:{rpc:async()=>{incidentCalls++;return {data:{incident_id:'i',should_email:true}};}},post:{id:'p'},stage:'test',code:'KLING_STATUS_401',message:'Denied'});
 assert.equal(incidentCalls,1);assert.equal(result.reason,'not_configured');assert.equal(result.incidentId,'i');
} finally {if(old!==undefined)process.env.RESEND_API_KEY=old;}
console.log('PASS: provider classification, admin explanations, original causes, terminal status/checkpoints, DB rejection and incidents without email');

// Execute the actual cron entry point without paid services. A broken first post
// must not prevent processing a second post; 429 must preserve ID and back off.
const cronSource=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
async function runCron({firstClaimFails=false,pollFailure=null,posts:givenPosts=null}={}) {
 const posts=givenPosts||[{id:'p1',kling_task_id:'task-1',video_status:'processing',video_background_selection:{}},{id:'p2',kling_task_id:'task-2',video_status:'processing',video_background_selection:{}}];
 const updates=[],marked=[],alerts=[],polled=[];
 const supabase={from(){return {select(){return this;},eq(){return this;},or(){return this;},not(){return this;},order(){return this;},limit(){return Promise.resolve({data:posts});},update(value){updates.push(value);return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};}};
 const cronContext=vm.createContext({Response,Date,withRuntimeAiModels:callback=>callback(),console:{info(){},warn(){},error(){}},
  isAuthorized:()=>true,createSupabaseAdmin:()=>supabase,getMaxPendingHours:()=>6,
  KLING_PROVIDER_PENDING_STATUSES:['processing'],KLING_FINALIZER_POST_SELECT:'id',
  recoverableKlingReferenceFailure:()=>false,finalizationJobGate:()=>({action:'proceed'}),finalizationRetryBackoffIsFresh:()=>false,
  claimKlingFinalization:async(_db,post)=>{if(firstClaimFails&&post.id==='p1')throw new Error('DB claim unavailable');return true;},
  getCachedKlingSource:()=>null,
  getKlingImageToVideoTask:async id=>{polled.push(id);if(pollFailure)throw pollFailure;return {status:'failed',message:'Provider rejected source'};},
  isKlingTaskFailed:s=>s==='failed',isKlingTaskSuccessful:()=>false,
  markKlingPostFailed:async(...args)=>marked.push(args),sendTerminalVideoAdminAlert:async args=>alerts.push(args),
  videoFailureDetails,truncate:s=>s});
 vm.runInContext(cronSource.slice(cronSource.indexOf('export async function GET')).replace('export ',''),cronContext);
 const response=await cronContext.GET({});
 return {summary:(await response.json()).summary,updates,marked,alerts,polled};
}
const isolated=await runCron({firstClaimFails:true});
assert.equal(isolated.summary.job_errors,1);assert.equal(isolated.marked.length,1);
assert.equal(isolated.marked[0][1].id,'p2');assert.equal(isolated.alerts.length,1);
const rate=await runCron({pollFailure:Object.assign(new Error('Too many requests'),{code:'KLING_STATUS_429',httpStatus:429})});
assert.equal(rate.summary.poll_errors,2);assert.equal(rate.marked.length,0);
assert.equal(rate.updates[0].video_background_selection.provider_poll_control.last_error.http_status,429);
assert(Date.parse(rate.updates[0].video_background_selection.provider_poll_control.next_retry_at)>Date.now());
assert.deepEqual(rate.polled,['task-1','task-2']);
const blocked=await runCron({pollFailure:auth});
assert.equal(blocked.summary.failed,2);assert.equal(blocked.marked[0][4],'KLING_STATUS_401');
const waiting=await runCron({posts:[{id:'p',video_status:'processing',video_background_selection:{provider_poll_control:{next_retry_at:new Date(Date.now()+60000).toISOString()}}}]});
assert.equal(waiting.summary.deferred,1);assert.equal(waiting.polled.length,0);
console.log('PASS: actual Kling cron isolates jobs, persists 429/backoff, stops auth failures and respects next check time');

// Shotstack: a finished video's delivery failure must not turn it back into a
// failed generation. Real terminal render failures must use the durable handoff.
const shotSource=fs.readFileSync('app/api/cron/finalize-shotstack-videos/route.js','utf8');
async function runShotstack({renderError=null,deliveryError=null}={}) {
 let failures=0;const updates=[];
 const database={from(){return {select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(){return Promise.resolve({data:[{id:'p',video_status:'rendering',video_render_id:'render-1'}]});},update(value){updates.push(value);return this;},then(resolve){return Promise.resolve({data:[{id:'p'}]}).then(resolve);}};},rpc:async()=>({data:[]})};
 const ctx=vm.createContext({Response,Date,console:{info(){},warn(){},error(){}},process:{env:{CRON_SECRET:'test'}},
 createClient:()=>database,createGenerationCostTracker:()=>({bindPost:async()=>{}}),
 finishSavedShotstackPost:async()=>{if(renderError)throw renderError;},
 completeShotstackDeliveryForPost:async()=>{if(deliveryError)throw deliveryError;return {completed:true};},
 persistTerminalVideoFailure:async()=>{failures++;},sendTerminalVideoAdminAlert:async()=>{},
 videoFailureDetails,waitForShotstackRender:()=>{},uploadRenderedVideoToStorage:()=>{}});
 vm.runInContext(shotSource.slice(shotSource.indexOf('export async function GET')).replace('export ',''),ctx);
 const response=await ctx.GET({headers:{get:()=> 'Bearer test'}});
 return {summary:await response.json(),failures,updates};
}
const deliveredLater=await runShotstack({deliveryError:new Error('Delivery temporarily unavailable')});
assert.equal(deliveredLater.summary.ready,1);assert.equal(deliveredLater.summary.delivery_pending,1);assert.equal(deliveredLater.failures,0);
const renderFailed=await runShotstack({renderError:Object.assign(new Error('Shotstack render failed'),{code:'SHOTSTACK_RENDER_FAILED'})});
assert.equal(renderFailed.summary.failed,1);assert.equal(renderFailed.failures,1);
const pending=await runShotstack({renderError:Object.assign(new Error('Render still processing'),{code:'SHOTSTACK_RENDER_PENDING'})});
assert.equal(pending.summary.pending,1);assert.equal(pending.failures,0);
console.log('PASS: actual Shotstack cron preserves finished results on delivery errors and separates pending/terminal renders');

const websiteGuardContext=vm.createContext({});
const websiteGuardStart=source.indexOf('function isWebsiteRateLimitError(');
vm.runInContext(source.slice(websiteGuardStart,source.indexOf('function isWebsiteAccessProtectedStatus',websiteGuardStart)),websiteGuardContext);
assert.equal(websiteGuardContext.isWebsiteRateLimitError({code:'KLING_SUBMIT_429',status:429,message:'Too many requests'}),false);
assert.equal(websiteGuardContext.isWebsiteRateLimitError({code:'SHOTSTACK_STATUS_429',message:'Rate limit'}),false);
assert.equal(websiteGuardContext.isWebsiteRateLimitError({code:'WEBSITE_RATE_LIMITED',status:429,message:'Website returned 429'}),true);
console.log('PASS: provider 429 cannot enter website Rescue in the worker catch boundary');

assert.equal(websiteGuardContext.isWebsiteRateLimitError({code:'insufficient_quota',status:429,message:'OpenAI too many requests'}),false);
assert.equal(websiteGuardContext.isWebsiteRateLimitError({status:429,message:'Too many requests'}),false);
assert.equal(websiteGuardContext.isWebsiteRateLimitError({status:429,url:'https://pressit.se',message:'Too many requests'}),true);
console.log('PASS: provider quotas and unattributed HTTP 429 never become website Rescue');
