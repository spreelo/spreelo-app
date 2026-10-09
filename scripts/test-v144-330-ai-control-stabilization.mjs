import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function evaluate(f,imports){
  const code=ts.transpileModule(read(f),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:k=>{
    if(k in imports)return imports[k];throw new Error('Unexpected '+k);
  },console,Response,Date,process,Number,Math,Map,Array,Object,String,JSON,Promise,Error,Set}, {filename:f});
  return module.exports;
}
const row={current:null};
const actions=[];
const db={from(table){
  actions.push([table,'from']);
  if(table==='ai_model_settings')return {select:async()=>({data:[{purpose:'content_plan',provider:'openai',model:'gpt-5.5'}],error:null})};
  assert.equal(table,'ai_model_intelligence_runs');
  const query={
    select(){return query}, eq(field,value){assert.equal(field,'day');return query},
    async maybeSingle(){return {data:row.current,error:null}},
    async upsert(value){row.current=structuredClone(value);actions.push([table,'upsert']);return {error:null}},
    update(value){return {eq:async()=>{Object.assign(row.current,structuredClone(value));actions.push([table,'update']);return {error:null}}}},
  };
  return query;
}};
let availabilityCalls=0;
let pricingCalls=0;
let docsCalls=0;
let mailCalls=0;
const deliveredKeys=[];
const controller=evaluate('app/api/cron/ai-model-intelligence/route.js',{
  '@supabase/supabase-js':{createClient:()=>db},
  '../../../../lib/aiAutomationSwitch.js':{blockDisabledAiBackgroundJob:async()=>null},
  'node:crypto':{createHash},
  '../../../../lib/aiModelIntelligenceServer.js':{
    syncOfficialPricing:async()=>{pricingCalls++;return {verified:1,events:[]}},
    scanActiveModelAvailability:async()=>{availabilityCalls++;if(availabilityCalls===1)throw new Error('temporary API outage');return {checkedModels:1,events:[{id:'alert-1',severity:'important',title:'API listing changed',summary:'Demo',url:'https://example.org'}]}},
    scanOfficialDocumentation:async()=>{docsCalls++;return {checked:2,events:[]}},
    sendImportantModelAlerts:async(_events,{idempotencyKey})=>{mailCalls++;deliveredKeys.push(idempotencyKey);return mailCalls===1?'failed_503':'sent'},
  },
});
process.env.CRON_SECRET='v330-test-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='v330-test-key';
const request=secret=>({headers:{get:()=>`Bearer ${secret}`}});
assert.equal((await controller.GET(request('wrong'))).status,401);
assert.equal(row.current,null);
console.log('PASS: unauthenticated cron has no database side effects');
const first=await controller.GET(request('v330-test-secret'));
assert.equal(first.status,503); // one check failed, not a successful day
assert.equal(pricingCalls,1);assert.equal(docsCalls,1);assert.equal(availabilityCalls,1);
assert.equal(row.current.results.availability.error,'temporary API outage');
assert.equal(row.current.mail_status,'not_needed');
console.log('PASS: partial checks persisted for retry rather than marked complete');
const second=await controller.GET(request('v330-test-secret'));
assert.equal(second.status,503); // provider email error
assert.equal(pricingCalls,1);assert.equal(docsCalls,1);assert.equal(availabilityCalls,2);
assert.equal(row.current.results.__pending_mail_events.length,1);
assert.equal(row.current.mail_status,'failed_503');
console.log('PASS: same-day retries run only failed checks and retain failed mail delivery');
const third=await controller.GET(request('v330-test-secret'));
assert.equal(third.status,200);
assert.equal(pricingCalls,1);assert.equal(availabilityCalls,2);assert.equal(docsCalls,1);
assert.equal(mailCalls,2);assert.equal(deliveredKeys[0],deliveredKeys[1]);
assert.equal(row.current.results.__pending_mail_events.length,0);
console.log('PASS: email retry is idempotent and does not repeat paid provider checks');
const fourth=await controller.GET(request('v330-test-secret'));
assert.equal(fourth.status,200);
assert.equal((await fourth.json()).skipped,'already_checked_today');
assert.equal(mailCalls,2);
console.log('PASS: completed day skips redundant network calls and notifications');
assert(actions.every(([name,kind])=>name!=='ai_model_settings'||kind==='from'));
const sql=read('supabase/v144_330_INSTALL_AI_CONTROL_ALL.sql');
for(const name of ['ai_model_settings','ai_model_catalog','ai_model_pricing','ai_model_test_requests','ai_model_intelligence_runs'])assert(sql.includes(`public.${name}`));
assert(!/update\s+public\.ai_model_settings\s+set/i.test(sql));
console.log('PASS: consolidated migration includes all AI Control tables, preserving model selections');
for(const f of ['lib/aiModelIntelligence.js','lib/aiModelIntelligenceServer.js','app/api/cron/ai-model-intelligence/route.js',
  'app/api/admin/ai-control/route.js','app/api/admin/ai-model-tests/route.js','app/api/cron/ai-model-test-results/route.js']){
  const sf=ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  assert.equal(sf.parseDiagnostics.length,0,f);
}
const ui=ts.createSourceFile('page.jsx',read('app/admin/ai-control/page.jsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
assert.equal(ui.parseDiagnostics.length,0);
const crons=JSON.parse(read('vercel.json')).crons;
assert.equal(crons.filter(x=>x.path==='/api/cron/ai-model-intelligence').length,1);
console.log('PASS: admin UI/API, scheduled cron and stabilized route parse and link correctly');
