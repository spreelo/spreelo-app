import * as sceneHeadline from '../lib/videoSceneHeadline.js';
import * as creativePlanning from '../lib/videoCreativePlanning.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import OpenAI from 'openai';
import {activeAiModel,withRuntimeAiModels,setRuntimeJobModelOverride} from '../lib/aiModelControl.js';
import {END_CARD_FRAMING,END_CARD_NATIVE_SIZE,supportsNativeEndCardSize,fitEndCardMasterArtwork,buildEndCardMasterPrompt} from '../lib/videoEndCardMaster.js';
import {generateIndependentAdvertisingAssets} from '../lib/videoAdvertisingAssetPipeline.js';
import {composeVideoEndCardLayers} from '../lib/klingEndCard.js';
import * as concept from '../lib/videoCommercialConcept.js';
import * as endBrief from '../lib/videoEndCardBrief.js';
import {planAnimatedAdvertisingCopy} from '../lib/animatedAdvertisingCopy.js';
import {VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION} from '../lib/videoArtDirection.js';
import {CREATIVE_DIRECTOR_BRIEF} from '../lib/videoCreativeDirector.js';
import {COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline} from '../lib/videoAdvertisingHierarchy.js';

assert.equal(END_CARD_NATIVE_SIZE,'864x1536');
assert.equal(864%16,0);assert.equal(1536%16,0);assert.equal(864/1536,1080/1920);
for(const model of ['gpt-image-2','gpt-image-2-2026-04-21','gpt-image-2.5-flare','gpt-image-2.5-flare-2026-09-08','gpt-image-2.5-sunburst'])assert(supportsNativeEndCardSize(model));
for(const model of ['gpt-image-1.5','gpt-image-1','chatgpt-image-latest','unverified-image-model'])assert(!supportsNativeEndCardSize(model));

// Provider artwork intentionally touches BOTH horizontal edges and top/bottom.
// No assumption about compliance with prompt margins is allowed in the fitter.
const native=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="864" height="1536">
<defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="#354A52"/><stop offset=".6" stop-color="#152A32"/><stop offset="1" stop-color="#9B7651"/></linearGradient></defs>
<rect width="864" height="1536" fill="url(#bg)"/>
<rect x="0" y="450" width="20" height="640" fill="#FF0000"/><rect x="844" y="450" width="20" height="640" fill="#00FF00"/>
<rect width="864" height="12" fill="#234567"/><rect y="1524" width="864" height="12" fill="#654321"/>
<text x="432" y="675" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="110" fill="white">Din egen</text>
<text x="432" y="825" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="110" fill="#FFD34D">riktning</text>
<text x="432" y="1000" text-anchor="middle" font-family="Noto Sans" font-size="44" fill="white">Se erbjudandet</text>
</svg>`)).png().toBuffer();
const frames=await sharp({create:{width:1080,height:1920,channels:3,background:'#223344'}}).png().toBuffer();
const calls=[];
// Use the REAL installed OpenAI SDK, replacing only fetch. This checks its
// outgoing HTTP JSON, not just an imitation of images.generate's arguments.
const client=new OpenAI({apiKey:'offline-test-key-not-a-real-key',fetch:async(url,init)=>{
 const body=JSON.parse(init.body);calls.push({url:String(url),body});
 assert(String(url).endsWith('/images/generations'));assert.equal(body.model,'gpt-image-2.5-flare');
 assert.equal(body.size,END_CARD_NATIVE_SIZE);assert.equal(body.background,'opaque');
 assert(body.prompt.includes('true 9:16'));assert(body.prompt.includes('WITHOUT CROPPING'));assert(!body.prompt.includes('will be discarded'));
 return new Response(JSON.stringify({created:0,data:[{b64_json:native.toString('base64')}]}),{status:200,headers:{'content-type':'application/json'}});
}});
let cache,metadata;
const args={openai:client,model:'gpt-image-2.5-flare',headline:'Din egen riktning',closingHeadline:'Din egen riktning',closingEmphasis:'riktning',closingLine:'Se erbjudandet',renderEndCardMaster:true,masterFraming:END_CARD_FRAMING,sceneBackground:frames,
 creativeConcept:{product_anchor:'The verified distinguishing message',campaign_idea:'Individual expression',closing_typography:'Bold white #FFFFFF and warm accent #FFD34D',background_brief:'A conceptually relevant setting, not scenery selected from the film'},
 onBackground:async(buffer,info)=>{cache=buffer;metadata=info;}};
const assets=await generateIndependentAdvertisingAssets(args);
assert.equal(calls.length,1);assert.deepEqual(cache,native);assert.equal(metadata.framing,END_CARD_FRAMING);
const expected=await sharp(native).resize(1080,1920).removeAlpha().raw().toBuffer();
assert.deepEqual(await sharp(assets.endCardMaster).raw().toBuffer(),expected,'whole native artwork fills delivery canvas; no crop, distortion or artificial row');
const layers=await composeVideoEndCardLayers({masterArtwork:assets.endCardMaster,headline:args.closingHeadline,closingLine:args.closingLine});
assert.deepEqual(await sharp(layers.cardBuffer).raw().toBuffer(),expected,'every letter, accent and edge survives final composition');
const resumed=await generateIndependentAdvertisingAssets({...args,cachedBackground:cache,cachedMaster:metadata.isMaster,cachedMasterFraming:metadata.framing});
assert.equal(calls.length,1);assert.deepEqual(resumed.endCardMaster,assets.endCardMaster);

// Reproduce the exact .371 fault: a 2:3 response with meaningful edge pixels
// was cropped under its planned-margin flag. ALL flags now preserve its edges.
const portrait=await sharp(native).resize(1024,1536,{fit:'fill'}).png().toBuffer();
const oldCover=await sharp(portrait).resize(1080,1920,{fit:'cover'}).removeAlpha().raw().toBuffer();
for(const framing of ['preserve','planned_9_16_v371',END_CARD_FRAMING]){
 const fitted=await fitEndCardMasterArtwork(portrait,{framing});
 const center=await sharp(fitted).extract({left:0,top:150,width:1080,height:1620}).removeAlpha().raw().toBuffer();
 assert.deepEqual(center,await sharp(portrait).resize(1080,1620).removeAlpha().raw().toBuffer(),'all original letter-edge pixels preserved, regardless of saved framing version');
 assert.notDeepEqual(await sharp(fitted).raw().toBuffer(),oldCover,'fixture detects the destructive .371 crop');
}
let unsupportedCalls=0;
const older=await generateIndependentAdvertisingAssets({...args,model:'gpt-image-1.5',openai:{images:{generate:async options=>{
 unsupportedCalls++;assert.equal(options.size,'1024x1536');assert(!options.prompt.includes('864x1536'));
 return {data:[{b64_json:portrait.toString('base64')}]};
}}}});
assert.equal(unsupportedCalls,1);assert.equal(older.endCardFraming,'preserve');
assert.deepEqual(older.endCardMaster,await fitEndCardMasterArtwork(portrait));
let referenceCalls=0;
const references=[new File([native],'verified-reference.png',{type:'image/png'})];
const withSubject=await generateIndependentAdvertisingAssets({...args,referenceFiles:references,
 creativeConcept:{...args.creativeConcept,closing_subject:'person_or_product',closing_subject_reason:'This verified professional is essential to the service invitation'},
 openai:{images:{edit:async(options,request)=>{
  referenceCalls++;assert.equal(options.size,END_CARD_NATIVE_SIZE);assert.equal(options.image,references);assert.equal(request.maxRetries,0);
  return {data:[{b64_json:native.toString('base64')}]};
 },generate:async()=>{throw Error('Explicit subject must use its references');}}}});
assert.equal(referenceCalls,1);assert.equal(withSubject.backgroundReferenceMode,'scene_references');
assert.deepEqual(await sharp(withSubject.endCardMaster).raw().toBuffer(),expected);
let failedCalls=0;
const unavailable=await generateIndependentAdvertisingAssets({...args,openai:new OpenAI({apiKey:'offline-test-key-not-a-real-key',fetch:async()=>{
 failedCalls++;throw new TypeError('Simulated lost provider response');
}})});
assert.equal(failedCalls,1,'SDK maxRetries=0: lost response never makes another billable image request');
assert.equal(unavailable.backgroundSource,'designed_fallback');assert.equal(unavailable.endCardMaster,null);

const source=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const start=source.indexOf('async function planFinishedKlingAdvertisingCreative('),end=source.indexOf('\nasync function ',start+1);
const ctx=vm.createContext({...sceneHeadline,...creativePlanning,...concept,...endBrief,console,VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,CREATIVE_DIRECTOR_BRIEF,COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline,
 KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'gpt-4.1-mini',KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},getFallbackKlingCta:()=> 'Se erbjudandet',normalizeKlingCreativeLine:v=>String(v||'').trim(),normalizeKlingLayout:v=>v||{},getKlingPlacementBox:()=>({}),klingLayoutSchema:()=>({type:'object'}),truncate:v=>String(v||''),getOpenAiTextOutput:r=>r.output_text});
vm.runInContext(source.slice(start,end),ctx);
const requests=[];
const planned={creative_concept:{product_anchor:'Verified Fubbick wording',campaign_idea:'The meaning of the visible message, not generic garment construction',scene_typography:'Bold #FFFFFF #FFD34D',closing_typography:'Heavy #FFFFFF #FFD34D'},headline:'Din egen riktning',subheadline:'',cta:'Se tröjan',closing_line:'Se tröjan',closing_headline:'Din egen riktning',end_card_emphasis:'riktning',main_placement:'lower_left',cta_placement:'lower_left',main_layout:{},cta_layout:{},protected_regions:[],placement_confidence:.9,printed_text:'FUBBICK',supported:true,independent_message:true,closing_supported:true};
const api={responses:{create:async(body,options)=>{requests.push({body,options});return {output_text:JSON.stringify(planned)};}}};
// This is a contract test. Mocked slogans do not prove the model is creative.
const data={verified_product_title:'Fubbick - Herr - T-shirt',verified_product_description:'Retailer facts: cotton and double seams',end_card_brand_context:{name:'Verified retailer',audience:'Verified audience'}};
const video=await ctx.planFinishedKlingAdvertisingCreative({openai:api,selection:data,post:{content:'Generic base garment caption'},frames:[{buffer:frames}]});
assert.equal(video.model,'gpt-5.6-sol');assert.equal(video.model_purpose,'editorial_headline');
assert.equal(requests[0].body.model,'gpt-5.6-sol');assert.equal(requests[0].body.reasoning.effort,'medium');assert.equal(requests[0].options.maxRetries,0);assert.equal(requests[0].options.timeout,60000);
assert(requests[0].body.max_output_tokens>=4000,'leave room for reasoning AND complete structured design');
assert(requests[0].body.input[0].content[0].text.includes('cultural register'));assert(requests[0].body.input[0].content[0].text.includes('Retailer facts'));
assert(requests[0].body.input[0].content[0].text.includes('specific human reason to care'));
const animation=await planAnimatedAdvertisingCopy({openai:api,model:'gpt-5.6-sol',rule:{language:'sv',website_item:{title:data.verified_product_title,description:data.verified_product_description}},sceneFrames:[frames]});
assert.equal(animation.model,'gpt-5.6-sol');assert.equal(requests[1].body.reasoning.effort,'medium');assert.equal(requests[1].options.maxRetries,0);
await planAnimatedAdvertisingCopy({openai:api,model:'gpt-4.1-mini',rule:{language:'sv',website_item:{title:'Saved product'}},sceneFrames:[frames]});
assert.equal(requests[2].body.reasoning,undefined,'admin-selected non-reasoning models keep compatible arguments');
const configured=await ctx.planFinishedKlingAdvertisingCreative({openai:api,model:'gpt-5.5',selection:data,post:{},frames:[{buffer:frames}]});assert.equal(configured.model,'gpt-5.5');
assert.equal(requests.length,4,'one existing call per plan; no added creative reviewer');
let outageCalls=0;
const fallback=await ctx.planFinishedKlingAdvertisingCreative({openai:{responses:{create:async()=>{outageCalls++;throw Error('offline');}}},selection:data,post:{},frames:[{buffer:frames}]});
assert.equal(outageCalls,1);assert.equal(fallback.source,'deterministic_fallback');assert.equal(fallback.model,'gpt-5.6-sol');
const worker=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
assert(worker.includes('planAnimatedAdvertisingCopy({openai,model:editorialHeadlineModel()'));
assert(source.includes('model:activeAiModel("editorial_headline",process.env.EDITORIAL_HEADLINE_MODEL||"gpt-5.6-sol")'));
assert(source.includes('return withRuntimeAiModels(async () => {'));
assert(source.indexOf('if (!isAuthorized(request))')<source.indexOf('return withRuntimeAiModels(async () => {'),'unauthorized calls never load model settings');
assert(source.includes('const KLING_PRODUCT_IDENTITY_AUDIT_MODEL = "gpt-4.1-mini"'),'identity reviews keep their existing model and behavior');
// Exercise the actual request-local settings container without credentials or
// network. Model overrides must not leak across concurrent jobs or requests.
const oldEnv={NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
try {
 delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 await Promise.all(['gpt-5.5','gpt-4.1-mini'].map(selected=>withRuntimeAiModels(async()=>{
  assert.equal(activeAiModel('editorial_headline','missing'),'gpt-5.6-sol');
  setRuntimeJobModelOverride('editorial_headline',selected);
  await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(activeAiModel('editorial_headline','missing'),selected);
 })));
 assert.equal(activeAiModel('editorial_headline','outside'),'outside');
} finally {
 for(const [key,value] of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
let unauthorizedSettingsReads=0;
const authCtx=vm.createContext({...sceneHeadline,...creativePlanning,Response,isAuthorized:()=>false,withRuntimeAiModels:()=>{unauthorizedSettingsReads++;throw Error('Must not load settings');}});
vm.runInContext(source.slice(source.indexOf('export async function GET(')).replace('export ',''),authCtx);
assert.equal((await authCtx.GET({})).status,401);assert.equal(unauthorizedSettingsReads,0);
for(const word of ['FUBBICK','Fubbick','Renodlad bas','basgarderob'])assert(!concept.COMMERCIAL_CONCEPT_BRIEF.includes(word),'general instructions contain no per-product/language patch');
if(process.env.VIDEO_QA_OUTPUT){
 fs.mkdirSync(process.env.VIDEO_QA_OUTPUT,{recursive:true});
 await sharp(assets.endCardMaster).resize({width:540}).toFile(`${process.env.VIDEO_QA_OUTPUT}/native-9-16-whole-artwork.png`);
 const legacy=await fitEndCardMasterArtwork(portrait,{framing:'planned_9_16_v371'});
 await sharp(legacy).resize({width:540}).toFile(`${process.env.VIDEO_QA_OUTPUT}/legacy-edges-preserved.png`);
}
console.log('PASS 144.372: real SDK sends documented native 9:16 size; all image edges preserved through cache/compositor even on unexpected or legacy dimensions; older models remain compatible; no paid retries; creative purpose/model separated from identity checks; both planners use bounded medium reasoning and existing calls');
