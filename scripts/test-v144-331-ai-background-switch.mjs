import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function evaluate(f,imports={},extras={}){
 const code=ts.transpileModule(read(f),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:k=>{
   if(k in imports)return imports[k];throw new Error('Unexpected import '+k+' in '+f);
 },console,Response,Date,process,Number,Math,Map,Array,Object,String,JSON,Promise,Error,Set,AbortSignal,URL,Buffer,...extras}, {filename:f});
 return module.exports;
}
const key='ai_control_background_jobs';
const traces=[];let enabled=false,fail=false,missing=false;
const db={from(table){traces.push('table:'+table);assert.equal(table,'ai_control_job_settings');return {
  select(columns){traces.push('select:'+columns);return this},
  eq(column,value){assert.equal(column,'key');assert.equal(value,key);return this},
  async maybeSingle(){return fail?{error:{message:'db not ready'}}:{data:missing?null:{enabled,updated_at:null,updated_by:null},error:null}}
}}};
const safety=evaluate('lib/aiAutomationSwitch.js');
assert.equal(safety.AI_BACKGROUND_JOBS_KEY,key);
let state=await safety.readAiBackgroundJobsState(db);
assert.equal(state.enabled,false);assert.equal(state.available,true);
assert.equal((await (await safety.blockDisabledAiBackgroundJob(db)).json()).skipped,'ai_background_jobs_disabled');
missing=true;assert.equal((await safety.readAiBackgroundJobsState(db)).enabled,false);
missing=false;fail=true;
let failure=await safety.blockDisabledAiBackgroundJob(db);
assert.equal(failure.status,503);
fail=false;enabled=true;
assert.equal(await safety.blockDisabledAiBackgroundJob(db),null);
console.log('PASS: switch defaults OFF, fails closed on missing/error, enables ONLY on explicit true');

// Check that all 4 real cron route handlers stop before any service work.
const env=process.env;
env.CRON_SECRET='v331-test-secret';env.RESEND_API_KEY='';
env.NEXT_PUBLIC_SUPABASE_URL='https://fake.supabase.co';env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const nowRequest={headers:{get:(k)=>k==='authorization'?'Bearer v331-test-secret':null}};
const deniedRequest={headers:{get:()=>null}};
for(const name of ['ai-market-watch','ai-model-discovery','ai-model-intelligence','ai-model-test-results']) {
 let serviceCalls=0,guardCalls=0;
 const route=evaluate(`app/api/cron/${name}/route.js`,{
  '@supabase/supabase-js':{createClient:()=>({})},
  'node:crypto':{createHash:()=>{throw Error('not needed')}},
  '../../../../lib/adminAuth.js':{getConfiguredAdminEmails:()=>{serviceCalls++;return []}},
  '../../../../lib/aiMarketWatch':{WATCH_SOURCES:[],fetchFeed:async()=>{serviceCalls++;return []}},
  '../../../../lib/aiModelDiscovery':{syncDiscoveredModels:async()=>{serviceCalls++},probePendingModels:async()=>{serviceCalls++},checkMissingActiveModels:async()=>{serviceCalls++},syncKlingDocumentedCandidates:async()=>{serviceCalls++}},
  '../../../../lib/aiModelIntelligenceServer.js':{syncOfficialPricing:async()=>{serviceCalls++},scanActiveModelAvailability:async()=>{serviceCalls++},scanOfficialDocumentation:async()=>{serviceCalls++},sendImportantModelAlerts:async()=>{serviceCalls++}},
  '../../../../lib/aiAutomationSwitch.js':{blockDisabledAiBackgroundJob:async()=>{guardCalls++;return Response.json({ok:true,skipped:'ai_background_jobs_disabled'})}},
 }, {fetch:async()=>{serviceCalls++;throw Error('cron fetched externally with switch off')}});
 const unauth=await route.GET(deniedRequest);assert.equal(unauth.status,401);assert.equal(guardCalls,0);
 const response=await route.GET(nowRequest);assert.equal(response.status,200,name);
 assert.equal((await response.json()).skipped,'ai_background_jobs_disabled',name);
 assert.equal(guardCalls,1);assert.equal(serviceCalls,0);
 console.log('PASS: '+name+' rejects unauthenticated calls and stops after OFF check');
}

let saved=false;
const dbAdmin={from(table){assert.equal(table,'ai_control_job_settings');return {
  select(){return this},eq(){return this},
  async maybeSingle(){return {data:{enabled:saved},error:null}},
  upsert(payload,options){assert.equal(payload.key,key);assert.equal(typeof payload.enabled,'boolean');assert.equal(options.onConflict,'key');saved=payload.enabled;return this},
  single:async()=>({data:{enabled:saved,updated_at:'2026-10-09T12:00:00Z',updated_by:'admin-id'},error:null})
}}};
const adminApi=evaluate('app/api/admin/ai-automation-settings/route.js',{
 '../../../../lib/adminAuth.js':{getAdminContext:async(req)=>req.denied?{error:'denied',status:401}:{admin:dbAdmin,user:{id:'admin-id'}},adminContextError:()=>Response.json({ok:false},{status:401})},
 '../../../../lib/aiAutomationSwitch.js':safety,
});
const req=(enabled,denied=false)=>({denied,json:async()=>({enabled})});
assert.equal((await adminApi.PATCH(req(true,true))).status,401);
assert.equal((await adminApi.PATCH(req('true'))).status,400);
assert.equal((await adminApi.PATCH(req(true))).status,200);assert.equal(saved,true);
assert.equal((await adminApi.GET(req())).status,200);
assert.equal((await adminApi.PATCH(req(false))).status,200);assert.equal(saved,false);
console.log('PASS: authenticated boolean-only switch toggles work; no other database tables touched');

for(const f of ['lib/aiAutomationSwitch.js','app/api/admin/ai-automation-settings/route.js','app/admin/ai-control/page.jsx',
 ...['ai-market-watch','ai-model-discovery','ai-model-intelligence','ai-model-test-results'].map(s=>`app/api/cron/${s}/route.js`)]) {
 const sf=ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,f.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
 assert.equal(sf.parseDiagnostics.length,0,`${f} syntax error`);
}
const combined=read('supabase/v144_331_INSTALL_AI_CONTROL_ALL.sql');
assert.match(combined,/create table if not exists public\.ai_control_job_settings/);
assert.match(combined,/values \('ai_control_background_jobs', false\)/);
assert.match(combined,/on conflict \(key\) do nothing/);
assert(!/update\s+public\.ai_model_settings\s+set/i.test(combined));
console.log('PASS: UI, API, cron handlers parse; consolidated SQL preserves active model selections');
