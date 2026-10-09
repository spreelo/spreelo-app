import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function evaluate(f,imports={},globals={}){
 const code=ts.transpileModule(read(f),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:k=>{
  if(k==='node:crypto')return {createHash};if(imports[k])return imports[k];throw new Error('Unexpected import '+k)},
  console,Buffer,Date,Promise,Number,Math,String,Array,Object,Map,Set,Error,JSON,process,URL,Response,AbortSignal,fetch:globalThis.fetch,...globals},{filename:f});
 return module.exports;
}
const logic=evaluate('lib/aiModelIntelligence.js');
const fixture=`<html><head><script>{"price":"$999.00"}</script></head><body><h1>gpt-5.6-sol</h1><h3>Text tokens</h3><p>Per 1M tokens</p><div>Input</div><div>$4.00</div><div>Cached input</div><div>$0.40</div><div>Output</div><div>$20.00</div><h3>Quick comparison</h3><div>Input</div><div>$5.00</div><div>gpt-5.5 $5.00</div></body></html>`;
const prices=logic.parseOfficialOpenAiTextPrices(fixture,'gpt-5.6-sol');
assert.equal(prices.length,3);assert.equal(prices[0].amount_usd,4);assert.equal(prices[2].amount_usd,20);
assert.equal(logic.parseOfficialOpenAiTextPrices(fixture,'gpt-5.5').length,0);
assert.equal(logic.parseOfficialOpenAiTextPrices('<script>Text tokens Per 1M tokens Input $4 Cached input $0.4 Output $20</script>','gpt-5.6-sol').length,0);
assert.equal(logic.allowedOfficialModelUrl('https://evil.example'),null);
assert.equal(logic.allowedOfficialModelUrl('gpt-image-2'),null);
assert.equal(logic.allowedOfficialModelUrl('gpt-5.6-sol'),'https://developers.openai.com/api/docs/models/gpt-5.6-sol');
console.log('PASS: pricing only from exact official model pages; no scripts, missing or ambiguous prices');
const p=[...prices,{provider:'openai',model:'gpt-5.5',unit:'input_1m_tokens',amount_usd:5},{provider:'openai',model:'gpt-5.5',unit:'output_1m_tokens',amount_usd:30}];
const comparison=logic.compareTextPrices(p,'gpt-5.5','gpt-5.6-sol');
assert.equal(comparison.oldCost,35);assert.equal(comparison.newCost,24);assert.equal(comparison.percentDifference,-31.4);
assert.equal(logic.compareTextPrices(p,'gpt-5.5','gpt-image-2'),null);
console.log('PASS: comparable USD text units only; never treats missing price as free');
const day1=logic.updateAvailabilitySignal(null,{present:false,day:'2026-10-09'});
const repeat=logic.updateAvailabilitySignal(day1,{present:false,day:'2026-10-09'});
assert.equal(repeat.changed,false);assert.equal(repeat.consecutive_missing,1);
const day2=logic.updateAvailabilitySignal(day1,{present:false,day:'2026-10-10'});
const day3=logic.updateAvailabilitySignal(day2,{present:false,day:'2026-10-11'});
assert.equal(day2.alert_status,'observing');assert.equal(day3.alert_status,'warning');
const recovered=logic.updateAvailabilitySignal(day3,{present:true,day:'2026-10-12'});
assert.equal(recovered.alert_status,'observing');assert.equal(recovered.consecutive_missing,0);
console.log('PASS: repeated successful daily missing observations; no alert for one missing scan or retry');
const approved=[{provider:'openai',model:'gpt-5.6-sol',status:'approved',verified_capabilities:['text_reasoning'],verified_at:'2026-10-05'},
  {provider:'openai',model:'gpt-bad',status:'pending_review',verified_capabilities:['text_reasoning'],verified_at:'2026-10-07'}];
const suggestion=logic.recommendedReplacement({purpose:{provider:'openai',capability:'text_reasoning'},active:'gpt-5.5',approved,availableModels:['gpt-5.6-sol','gpt-bad'],priceRows:p});
assert.equal(suggestion.model,'gpt-5.6-sol');
assert.equal(logic.recommendedReplacement({purpose:{provider:'openai',capability:'image_alpha'},active:'gpt-image-old',approved,availableModels:['gpt-5.6-sol'],priceRows:p}),null);
assert.equal(logic.recommendedReplacement({purpose:{provider:'kling',capability:'image_to_video'},active:'kling-3.0',approved,availableModels:[],priceRows:p}),null);
console.log('PASS: replacement suggestions require verified matching capability and recent availability');
const server=evaluate('lib/aiModelIntelligenceServer.js',{'./aiModelIntelligence.js':logic,'./aiModelDiscovery.js':{discoverOpenAiModels:async()=>['gpt-5.6-sol']},'./adminAuth.js':{getConfiguredAdminEmails:()=>[]}});
// DB simulation records all writes. The intelligence process must NEVER update ai_model_settings.
const writes=[];const rows={ai_model_availability_signals:[],ai_model_settings:[{purpose:'content_plan',provider:'openai',model:'gpt-5.5'}],ai_market_news:[]};
const db={from(table){const q={eq(){return q},in(){return q},select(){return q},then(ok){return Promise.resolve({data:rows[table]||[],error:null}).then(ok)},upsert:async r=>{writes.push(table);rows[table]=[...(rows[table]||[]),...r];return {error:null}}};return q}};
const scan=await server.scanActiveModelAvailability(db,'2026-10-09');
assert.equal(scan.warnings,0);assert(writes.includes('ai_model_availability_signals'));
assert(!writes.includes('ai_model_settings'));
console.log('PASS: mock availability scan does not write to any active model settings');
for(const f of ['lib/aiModelIntelligence.js','lib/aiModelIntelligenceServer.js','app/api/cron/ai-model-intelligence/route.js',
  'app/api/admin/ai-model-intelligence/route.js','app/api/admin/ai-control/route.js','lib/aiModelDiscovery.js']){
 const ast=ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 assert.equal(ast.parseDiagnostics.length,0,`${f}: ${ast.parseDiagnostics.map(d=>d.messageText).join(', ')}`);
}
const jsx='app/admin/ai-control/page.jsx';
const ast=ts.createSourceFile(jsx,read(jsx),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
assert.equal(ast.parseDiagnostics.length,0,`UI invalid: ${ast.parseDiagnostics.map(d=>d.messageText).join(', ')}`);
const sql=read('supabase/v144_329_INSTALL_AI_CONTROL_ALL.sql');
for(const name of ['ai_model_settings','ai_model_catalog','ai_model_pricing','ai_model_test_requests',
 'ai_model_availability_signals','ai_provider_source_snapshots','ai_model_intelligence_runs'])
 assert(sql.includes(`public.${name}`));
const cron=JSON.parse(read('vercel.json')).crons;
assert.equal(cron.filter(x=>x.path==='/api/cron/ai-model-intelligence').length,1);
console.log('PASS: v329 JS, admin UI, cron configuration and complete SQL syntax checks');
