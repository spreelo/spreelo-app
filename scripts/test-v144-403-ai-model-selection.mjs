import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {AsyncLocalStorage} from 'node:async_hooks';
const src=fs.readFileSync(new URL('../lib/aiModelControl.js',import.meta.url),'utf8');
const rows=[
 {purpose:'product_research',model:'gpt-6.1-sol',reasoning_effort:'medium'},
 {purpose:'manual_post',model:'gpt-6.1-sol',reasoning_effort:'medium'},
 {purpose:'product_research_fast',model:'gpt-4.1-mini'},
 {purpose:'onboarding_plan',model:'gpt-6.1-sol',reasoning_effort:'medium'},
];
const db={from(table){
 if(table==='ai_model_settings')return{select:async()=>({data:rows,error:null})};
 if(table==='ai_model_catalog')return{select:()=>({eq:()=>({limit:async()=>({data:[],error:null})})})};
 throw Error('unexpected table '+table);
}};
const source=src.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+ '\n globalThis.__exports={loadAiModelSettings,activeAiModel,requireLoadedAiModel,AI_PURPOSES,withRuntimeAiModels};';
const sandbox={AsyncLocalStorage,createClient:()=>db,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'stub',SUPABASE_SERVICE_ROLE_KEY:'stub'}},
 supportedReasoningEfforts:(m)=>m==='gpt-6.1-sol'?['low','medium','high','xhigh','max']:[], initialReasoningEffort:()=>null,normalizeReasoningEffort:(m,e)=>e};
vm.runInNewContext(source,sandbox,{filename:'lib/aiModelControl.js'});
const {loadAiModelSettings,requireLoadedAiModel,withRuntimeAiModels,activeAiModel,AI_PURPOSES}=sandbox.__exports;
assert.equal(AI_PURPOSES.length,22);
const settings=await loadAiModelSettings(db);
assert.equal(requireLoadedAiModel(settings,'product_research'),'gpt-6.1-sol');
assert.equal(requireLoadedAiModel(settings,'onboarding_plan'),'gpt-6.1-sol');
assert.equal(requireLoadedAiModel(settings,'product_research_fast'),'gpt-4.1-mini');
assert.throws(()=>requireLoadedAiModel(settings,'campaign_plan'),/Missing saved selection/);
assert.equal(await withRuntimeAiModels(()=>activeAiModel('product_research','gpt-5.5')),'gpt-6.1-sol');
assert.equal(await withRuntimeAiModels(()=>activeAiModel('product_research_fast','gpt-5.5')),'gpt-4.1-mini');
await assert.rejects(withRuntimeAiModels(()=>activeAiModel('campaign_plan','gpt-5.5')),/Missing saved selection/);
assert.equal(requireLoadedAiModel({onboarding_plan:'gpt-5.6-sol'},'onboarding_plan'),'gpt-5.6-sol');
assert.throws(()=>requireLoadedAiModel({__modelSettingsError:'offline'},'product_research'),/offline/);
const onb=fs.readFileSync(new URL('../app/api/onboarding-plan/route.js',import.meta.url),'utf8');
assert.match(onb,/model: activeAiModel\("onboarding_plan", model\)/);
assert.match(onb,/withRuntimeAiModels\(\(\) => onboardingPost\(request\)\)/);
const run=fs.readFileSync(new URL('../app/api/cron/run-automations/route.js',import.meta.url),'utf8');
assert.match(run,/const productResearchModel = \(\) => activeAiModel\("product_research",/);
assert.doesNotMatch(run,/(?<![\w.])PRODUCT_RESEARCH_MODEL\b/);
assert.doesNotMatch(run,/(?<![\w.])PRODUCT_RESEARCH_FAST_MODEL\b/);
assert.match(run,/productResearchFastModel = \(\) => activeAiModel\("product_research_fast",/);
const sql=fs.readFileSync(new URL('../supabase/v144_403_model_selection_only.sql',import.meta.url),'utf8');
assert.doesNotMatch(sql, /ON CONFLICT[\s\S]*DO UPDATE/i);
assert.match(sql,/ON CONFLICT \(purpose\) DO NOTHING/);
console.log('PASS: request-scoped model routing, onboarding, independent errors, unchanged fallback outside request, additive SQL');
