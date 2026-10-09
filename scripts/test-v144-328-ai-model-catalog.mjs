import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript');}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const evaluate=(source,filename,imports={},extras={})=>{
 const output=ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,require:n=>{if(n in imports)return imports[n];throw Error('Unexpected '+n);},Date,Promise,Set,Map,JSON,Math,String,Array,Object,Number,Buffer,Error,console,process,Response,AbortSignal,fetch:extras.fetch||globalThis.fetch,...extras}, {filename});
 return module.exports;
};
const control=evaluate(read('lib/aiModelControl.js'),'model-control.js',{'node:async_hooks':{AsyncLocalStorage},'@supabase/supabase-js':{createClient:()=>({})}});
assert.equal(control.isVerifiedForCapability('gpt-image-2.5-flare','image_alpha'),true);
assert.equal(control.isVerifiedForCapability('gpt-image-new','image_alpha'),false);
const approved={status:'approved',verified_capabilities:['text','text_reasoning']};
assert.equal(control.isCatalogCapabilityApproved(approved,'text'),true);
assert.equal(control.isCatalogCapabilityApproved(approved,'text_vision'),false);
assert.equal(control.isCatalogCapabilityApproved({status:'pending_review',verified_capabilities:['text']},'text'),false);
const fakeDb = result => ({from:name=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:result,error:null})})})});
const textPurpose=control.AI_PURPOSES.find(x=>x.key==='content_plan');
const alphaPurpose=control.AI_PURPOSES.find(x=>x.key==='transparent_typography');
assert.equal(await control.isModelVerifiedForPurpose(fakeDb(approved),textPurpose,'gpt-new'),true);
assert.equal(await control.isModelVerifiedForPurpose(fakeDb({...approved,status:'pending_review'}),textPurpose,'gpt-new'),false);
assert.equal(await control.isModelVerifiedForPurpose(fakeDb(approved),alphaPurpose,'gpt-new'),false);
assert.equal(await control.isModelVerifiedForPurpose(fakeDb(null),alphaPurpose,'gpt-image-2.5-flare'),true);
console.log('PASS: API capability authorization, pending exclusion, alpha protection, legacy defaults');

const settingsDb={from:table=>({select:()=>({
 eq(){return this},limit(){return this},
 then(resolve){return Promise.resolve({data:table==='ai_model_settings'?[{purpose:'content_plan',model:'gpt-new'},{purpose:'transparent_typography',model:'gpt-new'}]:[{provider:'openai',model:'gpt-new',...approved}],error:null}).then(resolve)}
 })})};
const loaded=await control.loadAiModelSettings(settingsDb);
assert.equal(loaded.content_plan,'gpt-new');
assert.equal(loaded.transparent_typography,'gpt-image-2.5-flare');
console.log('PASS: verified dynamic model resolves at runtime; unverified image falls back');

const probe=evaluate(read('lib/aiModelVerification.js'),'ai-verification.js');
assert.equal(probe.modelKind('gpt-image-2.5-flare'),'image');
assert.equal(probe.modelKind('gpt-5.6-sol'),'text');
assert.equal(probe.modelKind('gpt-audio-test'),null);
assert.equal(probe.modelKind('http://malicious'),null);
const allOpaque = new Uint8Array(4*16).fill(255);
const alphaGood = new Uint8Array(4*16).fill(255);
for(let i=0;i<8;i++)alphaGood[i*4+3]=0;
assert.equal(probe.inspectAlphaPixels({channels:4,hasAlpha:false,data:alphaGood}),false);
assert.equal(probe.inspectAlphaPixels({channels:4,hasAlpha:true,data:allOpaque}),false);
assert.equal(probe.inspectAlphaPixels({channels:4,hasAlpha:true,data:alphaGood}),true);
console.log('PASS: alpha verification requires actual transparent + opaque pixels');

for(const f of ['lib/aiModelVerification.js','lib/aiModelDiscovery.js','lib/aiModelControl.js','lib/aiModelTest.js',
 'app/api/admin/ai-control/route.js','app/api/admin/ai-model-tests/route.js','app/api/admin/ai-model-review/route.js','app/api/cron/ai-model-discovery/route.js',
 'app/api/cron/ai-model-test-results/route.js','app/api/cron/run-automations/route.js']) {
 const sf=ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 assert.equal(sf.parseDiagnostics.length,0,`${f}: ${sf.parseDiagnostics.map(x=>x.messageText).join(',')}`);
}
const page='app/admin/ai-control/page.jsx';
const parsed=ts.createSourceFile(page,read(page),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
assert.equal(parsed.parseDiagnostics.length,0,`UI parse error`);
assert.match(read('supabase/v144_328_INSTALL_AI_CONTROL_ALL.sql'),/create table if not exists public.ai_model_probe_runs/);
assert.match(read('app/api/admin/ai-model-tests/route.js'),/modelAllowedForPurposeAsync/);
assert.match(read('lib/aiModelDiscovery.js'),/await saveProbeOutcome/);
console.log('PASS: v328 endpoints, UI and SQL static regression checks');
const fakeCalls=[];
const verifiedProbe=evaluate(read('lib/aiModelVerification.js'),'ai-probe-fake.js',{}, {
 fetch:async (_url,opts)=>{fakeCalls.push(JSON.parse(opts.body));return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'SPREELO_OK'}]}]})};}
});
const smoke=await verifiedProbe.probeTextModel('test-no-real-key','gpt-synthetic');
assert(smoke.capabilities.includes('text'));
assert(smoke.capabilities.includes('text_reasoning'));
assert(fakeCalls.length>=2);
console.log('PASS: mocked paid OpenAI text probe verifies actual response and reasoning parameter');

const discovery=evaluate(read('lib/aiModelDiscovery.js'),'ai-discovery.js',{'./aiModelVerification.js':verifiedProbe});
const found=discovery.extractKlingModelIds('kling-3.0 and kling-3.0-turbo, kling-3.0');
assert.equal(JSON.stringify(found),JSON.stringify(['kling-3.0','kling-3.0-turbo']));
console.log('PASS: Kling discovery accepts only literal candidates from source text');
