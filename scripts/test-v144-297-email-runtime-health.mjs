import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const quiet = { warn() {}, info() {} };
const runtimeSource = fs.readFileSync('lib/openAiRuntimeHealth.js','utf8').replace(/^import .*;\n/,'').replace(/export /g,'');
const writes=[];
const admin={from(table){assert.equal(table,'system_health_status');return {async upsert(row){writes.push(row);return {error:null};}};}};
const runtime=vm.createContext({console:quiet,process:{env:{}},Date});
vm.runInContext(runtimeSource,runtime);
const quota=Object.assign(new Error('No credits remaining'),{status:429,code:'credit_balance_exhausted'});
assert.equal(runtime.classifyOpenAiServiceError(quota),'insufficient_quota');
assert.equal(runtime.classifyOpenAiServiceError({status:429,message:'website throttled'}),null);
assert.equal(runtime.classifyOpenAiServiceError({status:429},true),'rate_limit');
await runtime.recordOpenAiRuntimeResult({admin});
await runtime.recordOpenAiRuntimeResult({admin});
assert.equal(writes.length,1,'successful observations throttled');
await runtime.recordOpenAiRuntimeResult({admin,error:quota});
assert.equal(writes.at(-1).details.issue,'insufficient_quota');
await runtime.recordOpenAiRuntimeResult({admin});
assert.equal(writes.at(-1).status,'up','next success confirms recovery');
await runtime.recordOpenAiRuntimeResult({admin:{from(){throw new Error('database unavailable');}},error:quota});

const emailSource=fs.readFileSync('lib/i18n/serverUiText.js','utf8');
const defaults={common:{'common.continue':'Continue'},emails:{'emails.subject':'Hello {name}'}};
let cached={};
const email=vm.createContext({console:quiet,DEFAULT_UI_LOCALE:'en',normalizeUiLocale:v=>v,
 getDefaultNamespaceLabels:n=>defaults[n]||{},getDefaultLabelByKey:k=>Object.values(defaults).find(x=>k in x)?.[k],
 interpolateUiText:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]??''),stripTranslationMetadata:x=>x,
 getOrCreateServerNamespaceLabels:async()=>{throw quota;},readServerTranslationPack:async({namespace})=>({labels:cached[namespace]||{}})});
vm.runInContext(emailSource.slice(emailSource.indexOf('export async function getServerTranslations')).replace('export ',''),email);
let labels=await email.getServerTranslations({supabaseAdmin:{},locale:'sv',namespaces:['emails']});
assert.equal(labels.t('emails.subject',{name:'North Peak'}),'Hello North Peak');
assert.equal(labels.t('common.continue'),'Continue');
cached={emails:{'emails.subject':'Hej {name}'}};
labels=await email.getServerTranslations({supabaseAdmin:{},locale:'sv',namespaces:['emails']});
assert.equal(labels.t('emails.subject',{name:'North Peak'}),'Hej North Peak');
await assert.rejects(email.getServerTranslations({locale:'sv',namespaces:['automation']}),/credits/i);

const healthSource=fs.readFileSync('lib/systemHealth.js','utf8');
let observed=null;let httpStatus=200;const urls=[];
const health=vm.createContext({Date,process:{env:{OPENAI_API_KEY:'test'}},
 result:(key,label,status,latencyMs,message,details={})=>({key,status,details}),normalizeError:e=>e.message,
 timedFetch:async url=>{urls.push(url);return {response:{ok:httpStatus===200,status:httpStatus,text:async()=>''},latencyMs:1};}});
vm.runInContext(healthSource.slice(healthSource.indexOf('async function checkOpenAI('),healthSource.indexOf('async function checkResend(')),health);
const healthAdmin={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:observed,error:null};}};}};
assert.equal((await health.checkOpenAI(healthAdmin)).details.generationState,'unverified');
observed={status:'down',checked_at:new Date().toISOString(),details:{issue:'insufficient_quota'}};
assert.equal((await health.checkOpenAI(healthAdmin)).status,'down','models 200 cannot hide exhausted quota');
observed={status:'up',checked_at:new Date().toISOString()};
assert.equal((await health.checkOpenAI(healthAdmin)).status,'up');
observed.checked_at=new Date(Date.now()-25*3600000).toISOString();
assert.equal((await health.checkOpenAI(healthAdmin)).details.generationState,'unverified');
httpStatus=401;assert.equal((await health.checkOpenAI(healthAdmin)).status,'degraded');
assert.ok(urls.every(url=>url==='https://api.openai.com/v1/models'),'no paid AI health probes');

const route=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const image=vm.createContext({console:quiet,Buffer,
 recordOpenAiRuntimeResult:async()=>{},classifyOpenAiServiceError:runtime.classifyOpenAiServiceError,
 normalizeComparableValue:v=>String(v||'').toLowerCase().trim(),getDeterministicProductImageVariantConflict:()=>null,
 getProductImageResolverPageUrl:item=>item.product_url,truncateText:(s,n)=>s.slice(0,n),
 mapWithConcurrency:async(items,limit,fn)=>Promise.all(items.map(fn)),fetchPublicImageForResolution:async()=>({buffer:Buffer.from('image')}),
 getSharpRuntime:()=>()=>({rotate(){return this;},resize(){return this;},png(){return this;},async toBuffer(){return Buffer.from('image');}}),
 PRODUCT_RESEARCH_FAST_MODEL:'test',safeJsonParse:JSON.parse,getOpenAiResponseOutputText:r=>r.output_text});
const start=route.indexOf('function normalizeProductBrandIdentity');
vm.runInContext(route.slice(start,route.indexOf('async function reviewCarouselProductOnlyImages',start)),image);
const item={title:'Snowboard',product_url:'https://example.test/snowboard',image_url:'https://example.test/image.png',locked_product_source:'locked_product_page_object',product_image_identity_verified:true};
const openai={responses:{async create(){throw quota;}}};
await assert.rejects(image.reviewResolvedProductImageIdentity({openai,items:[item],ruleId:'quota'}),e=>e.code==='AI_SERVICE_UNAVAILABLE');
const preserved=await image.reviewResolvedProductImageIdentity({openai,items:[{...item,product_image_semantic_verified:true}],ruleId:'verified'});
assert.equal(preserved[0].image_url,item.image_url);
const classifierStart=route.indexOf('function classifyAutomationCreationFailure');
const classifierEnd=route.indexOf('\nasync function ',classifierStart);
vm.runInContext(route.slice(classifierStart,classifierEnd),image);
assert.equal(image.classifyAutomationCreationFailure(quota).code,'ai_service_unavailable');
assert.equal(image.classifyAutomationCreationFailure({code:'AI_SERVICE_UNAVAILABLE',message:'verification unavailable'}).code,'ai_service_unavailable');
assert.equal(image.classifyAutomationCreationFailure({code:'WEBSITE_RATE_LIMITED',message:'HTTP 429'}).code,'website_rate_limit_rescue');
console.log('PASS v144.297: English/cached email fallback, non-email failure preserved, quota vs website errors, safe telemetry, success throttling/recovery, real-request health, stale verification, no paid health probes, product quota gate and verified reuse.');
