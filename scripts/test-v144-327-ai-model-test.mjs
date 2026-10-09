import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const cwd = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(cwd,name),'utf8');

function evaluate(source, filename, fakeRequire) {
  const output=ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(output,{module,exports:module.exports,require:fakeRequire,process,console,Set,Date,Response,URL,crypto:globalThis.crypto,AbortSignal}, {filename});
  return module.exports;
}
const modelControl=evaluate(read('lib/aiModelControl.js'),'aiModelControl.js',name=>{
 if(name==='node:async_hooks')return {AsyncLocalStorage};
 if(name==='@supabase/supabase-js')return {createClient:()=>({})};
 throw new Error('Unexpected import '+name);
});
const purpose=modelControl.AI_PURPOSES.find(p=>p.key==='standard_image');
assert.equal(purpose.fallback,'gpt-image-2');
assert.equal(modelControl.isVerifiedForCapability('gpt-4.1-mini','image'),false);
assert.equal(modelControl.isVerifiedForCapability('gpt-image-2.5-flare','image_alpha'),true);

// Even overlapping requests and sequential jobs must remain isolated.
const work=()=>modelControl.withRuntimeAiModels(async()=>{
 assert.equal(modelControl.activeAiModel('standard_image','fallback'),'gpt-image-2');
 modelControl.setRuntimeJobModelOverride('standard_image','gpt-image-2.5-flare');
 await Promise.resolve();
 assert.equal(modelControl.activeAiModel('standard_image','fallback'),'gpt-image-2.5-flare');
 modelControl.setRuntimeJobModelOverride();
 assert.equal(modelControl.activeAiModel('standard_image','fallback'),'gpt-image-2');
});
await Promise.all([work(),work()]);
console.log('PASS: job-scoped model overrides reset and remain isolated across concurrent requests');

const testLib=evaluate(read('lib/aiModelTest.js'),'aiModelTest.js',name=>{
 if(name==='./aiModelControl.js') return modelControl;
 if(name==='./adminAuth.js') return {getConfiguredAdminEmails:()=>['admin@example.com']};
 throw new Error('Unexpected import '+name);
});
assert.equal(testLib.modelAllowedForPurpose(purpose,'gpt-4.1-mini'),false);
assert.equal(testLib.modelAllowedForPurpose(purpose,'gpt-image-2.5-flare'),true);
assert.equal(testLib.AI_MODEL_TEST_RECIPES.standard_image,'website_item_text_ad');
const makeDB = data=>({from:()=>({select:()=>({eq(){return this;},maybeSingle:async()=>({data,error:null})})})});
assert.equal(await testLib.loadVerifiedAiModelTestOverride(makeDB({purpose:'standard_image',model:'gpt-image-2.5-flare',status:'queued',brand_profile_id:'A',brand_owner_id:'U'}),{is_admin_test:true,admin_test_batch_id:'B',admin_test_job_key:'other',brand_profile_id:'A',user_id:'U'}),null);
const verified=await testLib.loadVerifiedAiModelTestOverride(makeDB({purpose:'standard_image',model:'gpt-image-2.5-flare',status:'queued',brand_profile_id:'A',brand_owner_id:'U'}),{is_admin_test:true,admin_test_batch_id:'B',admin_test_job_key:'ai-model-test:123',brand_profile_id:'A',user_id:'U'});
assert.equal(verified.model,'gpt-image-2.5-flare');
await assert.rejects(()=>testLib.loadVerifiedAiModelTestOverride(makeDB({purpose:'standard_image',model:'gpt-image-2.5-flare',status:'queued',brand_profile_id:'B',brand_owner_id:'U'}),{is_admin_test:true,admin_test_batch_id:'B',admin_test_job_key:'ai-model-test:123',brand_profile_id:'A',user_id:'U'}));
console.log('PASS: override requires a matching admin test job and brand ownership');

for(const file of ['app/api/admin/ai-model-tests/route.js','app/api/cron/ai-model-test-results/route.js','app/api/cron/run-automations/route.js']) {
 const source=read(file);
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 assert.equal(sf.parseDiagnostics.length,0,`Parse errors in ${file}`);
}
const jsx=read('app/admin/ai-control/page.jsx');
const parsed=ts.createSourceFile('page.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
assert.equal(parsed.parseDiagnostics.length,0,'AI Control Center JSX syntax');
console.log('PASS: all changed API/worker modules and UI parse without syntax errors');
const worker=read('app/api/cron/run-automations/route.js');
assert.match(worker,/setRuntimeJobModelOverride\(\);/);
assert.match(worker,/if \(isAdminTestRun && rule\?\.admin_test_batch_id\)/);
assert.match(worker,/loadVerifiedAiModelTestOverride\(supabase, rule\)/);
console.log('PASS: worker retains ordinary admin-test generation and resets overrides before every job');
const urlConfig=JSON.parse(read('vercel.json'));
assert(urlConfig.crons.some(x=>x.path==='/api/cron/ai-model-test-results'));
console.log('PASS: automatic result-email cron is registered');
