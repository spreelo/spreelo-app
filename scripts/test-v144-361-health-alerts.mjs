import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {updateHealthSampling,summarizeHealthSampling,formatMeasuredUptime} from '../lib/systemHealthCoverage.js';
import {videoAdminAlertContent,sendTerminalVideoAdminAlert} from '../lib/videoTerminalAdminAlert.js';
import {completedVideoSelection} from '../lib/videoJobSafety.js';

const t='2026-10-16T13:00:00Z',five='2026-10-16T13:05:00Z';
assert.equal(summarizeHealthSampling(null,t).uptime,null);
let sampling=updateHealthSampling({},'up',t);
assert.equal(summarizeHealthSampling(sampling,t).uptime,null,'a single sample is not 30 days of uptime');
sampling=updateHealthSampling({status:'up',checked_at:t,details:{sampling}},'down',five);
assert.equal(summarizeHealthSampling(sampling,five).uptime,100);
sampling=updateHealthSampling({status:'down',checked_at:five,details:{sampling}},'up','2026-10-16T13:06:00Z');
assert(Math.abs(summarizeHealthSampling(sampling,'2026-10-16T13:06:00Z').uptime-100*5/6)<.001);
const before=summarizeHealthSampling(sampling,'2026-10-16T13:06:00Z').observedMs;
sampling=updateHealthSampling({status:'up',checked_at:'2026-10-16T13:06:00Z',details:{sampling}},'up','2026-10-16T14:06:00Z');
assert.equal(summarizeHealthSampling(sampling,'2026-10-16T14:06:00Z').observedMs,before,'unobserved hour never becomes healthy time');
assert.equal(formatMeasuredUptime(null),'—');assert.equal(formatMeasuredUptime(99.977),'99.977%');assert.notEqual(formatMeasuredUptime(99.99999),'100.000%');

const alert=videoAdminAlertContent({post:{},stage:'kling_batch',code:'KLING_FINALIZER_CRON_FAILED',message:'Project not specified.'});
assert.equal(alert.severity,'warning');assert.equal(alert.code,'SUPABASE_DATABASE_REQUEST_FAILED');
assert(!/undefined|textdesignfel|Render-ID|Post:/.test(alert.body),'batch outage must not pretend to identify a broken film');
assert(alert.body.includes('Nästa schemalagda kontroll'));
const concrete=videoAdminAlertContent({post:{id:'post',kling_task_id:'paid-task'},stage:'render',code:'REAL_FAILURE',message:'Corrupt final render',diagnostic:{action:'Reuse saved source',render_id:'existing-render'}});
assert.equal(concrete.severity,'critical');assert(concrete.body.includes('existing-render') && concrete.body.includes('Reuse saved source'));
const unknown=videoAdminAlertContent({post:{},message:'Unexpected code defect'});assert.equal(unknown.severity,'error');assert(!unknown.database);

// Execute the actual health persistence path: first failed observation creates
// history immediately, recovery closes it, and rejected writes are surfaced.
const healthSource=fs.readFileSync('lib/systemHealth.js','utf8');
const healthCtx=vm.createContext({Date,updateHealthSampling});
vm.runInContext(healthSource.slice(healthSource.indexOf('async function persistStatus('),healthSource.indexOf('export function isDatabaseConnectivityFailure')),healthCtx);
let current=null,incident=null;let inserted=0,rejectIncident=false;
const healthDb={from(table){return {select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},
  async maybeSingle(){return {data:table==='system_health_status'?current:incident,error:null};},
  upsert(value){current=value;return Promise.resolve({error:null});},
  insert(value){if(rejectIncident)return Promise.resolve({error:new Error('history write denied')});inserted++;incident={...value,id:'incident'};return Promise.resolve({error:null});},
  update(value){if(incident)Object.assign(incident,value);return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};}};
await healthCtx.persistStatus(healthDb,{key:'supabase_database',label:'Supabase',status:'down',checkedAt:t,message:'Project not specified.'});
assert.equal(inserted,1,'a short actual failure is recorded on the first observation');
await healthCtx.persistStatus(healthDb,{key:'supabase_database',label:'Supabase',status:'up',checkedAt:five});
assert.equal(incident.resolved_at,five);assert.equal(incident.duration_seconds,300);
incident=null;rejectIncident=true;
await assert.rejects(healthCtx.persistStatus(healthDb,{key:'supabase_database',label:'Supabase',status:'down',checkedAt:'2026-10-16T13:06:00Z'}),/history write denied/);
const old=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
try {
  let rpc;
  const out=await sendTerminalVideoAdminAlert({supabase:{from(){throw new Error('database still unreachable');},rpc:async(_name,args)=>{rpc=args;return{data:{incident_id:'id',should_email:true}};}},post:{},stage:'kling_batch',code:'KLING_FINALIZER_CRON_FAILED',message:'Project not specified.'});
  assert.equal(out.reason,'not_configured');assert.equal(rpc.p_kind,'database');assert.equal(rpc.p_post_id,null);assert.equal(rpc.p_severity,'warning');
}finally{if(old!==undefined)process.env.RESEND_API_KEY=old;}
const saved=completedVideoSelection({kling_source_storage_url:'paid-source',shotstack_render_id:'paid-render',render_wait_started_at:t,finalization_control:{state:'waiting_render',attempts:2,next_retry_at:five}},five);
assert.equal(saved.finalization_control.state,'completed');assert.equal(saved.finalization_control.next_retry_at,null);assert.equal(saved.shotstack_render_id,'paid-render');assert.equal(saved.finalization_control.attempts,2);

// Execute the production readiness writer: cleared control must reach the DB,
// not just a unit helper, and delivery failure must retain the ready video.
const source=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const code=source.slice(source.indexOf('async function finalizeReadyTask('),source.indexOf('export async function GET'));
const writes=[];const db={storage:{from(){return{upload:async()=>({}),getPublicUrl:()=>({data:{publicUrl:'saved-video'}})}}},from(){return{update(value){writes.push(value);return this;},eq(){return this;},then(resolve){return Promise.resolve({}).then(resolve);}}}};
const ctx=vm.createContext({completedVideoSelection,downloadKlingVideo:async()=>Buffer.from('video'),POST_VIDEOS_BUCKET:'videos',normalizeVideoDurationSeconds:()=>6,completeShotstackDeliveryForPost:async()=>{throw new Error('email unavailable');},console:{error(){},info(){}}});
vm.runInContext(code,ctx);await ctx.finalizeReadyTask(db,{id:'p',user_id:'u',kling_task_id:'paid',video_background_selection:saved},{videoUrl:'source',status:'succeeded'});
assert.equal(writes[0].video_status,'ready');assert.equal(writes[0].video_background_selection.finalization_control.state,'completed');
console.log('PASS 144.361: missing coverage is unknown, short failures are visible, truthful worker/post alerts, persisted completed controls and ready-video preservation');
