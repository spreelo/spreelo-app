import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as concept from '../lib/videoCommercialConcept.js';
import * as endBrief from '../lib/videoEndCardBrief.js';
import { planAnimatedAdvertisingCopy } from '../lib/animatedAdvertisingCopy.js';
import { generateIndependentAdvertisingAssets, renderArtDirectedTypography } from '../lib/videoAdvertisingAssetPipeline.js';
import { composeVideoEndCardLayers } from '../lib/klingEndCard.js';
import { VIDEO_ART_DIRECTION, VIDEO_DESIGN_VERSION } from '../lib/videoArtDirection.js';
import { COMMERCIAL_COPY_HIERARCHY, repeatsAdvertisingMessage, isProductLabelHeadline } from '../lib/videoAdvertisingHierarchy.js';

const canvas=await sharp({create:{width:1080,height:1920,channels:3,background:'#152337'}}).png().toBuffer();
const product=await sharp({create:{width:80,height:100,channels:4,background:'#A94F32'}}).png().toBuffer();
const fixtures=[
 {title:'Gud Förbannat T-shirt',headline:'Låt tröjan säga resten',closing:'Bär din egen attityd',invitation:'Hitta ditt uttryck',
  truth:'Verified monochrome printed motif',motivation:'Express individual humor',idea:'Let the visible motif express the wearer',scene:'Concrete, graffiti and walking rhythm',background:'Charcoal #152337 with plaster texture and restrained abstract ink at the outer edges',type:'Bold sans-serif #FFFFFF #FFD54A',language:'sv'},
 {title:'Robotdammsugare R2',headline:'Låt golvet få sin stund',closing:'Plats för din vardag',invitation:'Se modellen',
  truth:'Verified floor-cleaning product',motivation:'Interest in floor care',idea:'Focus attention on everyday floor care without promising unverified performance',scene:'Pale floor, soft window light, geometric shadows',background:'Deep slate #152337 with translucent architectural planes and floor-inspired grain near edges',type:'Modern sans-serif #FFFFFF #B9DCFF',language:'sv'},
 {title:'Monstera',headline:'Mer grönt omkring dig',closing:'Låt hemmet blomma',invitation:'Hitta din gröna favorit',
  truth:'Verified leaf shape',motivation:'Enjoy greenery at home',idea:'Bring the observed leaf rhythm into the room',scene:'Soft leaf shadows, clay and natural side light',background:'Deep green #152337 with tactile paper and subtle organic shadows, clear center',type:'Refined serif #FFFFFF #E7D7A5',language:'sv'},
 {title:'Studiozeit',headline:'Ein Moment für dich',closing:'Zeit zum Ankommen',invitation:'Buche deinen Termin',
  truth:'Verified appointment-based service',motivation:'A deliberate personal pause',idea:'An invitation to make time for the supplied service',scene:'Quiet stone surfaces and warm side light',background:'Dark stone #152337 with layered matte texture and restrained architectural depth',type:'Elegant serif #FFFFFF #EED7AF',language:'de'},
];
const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const worker=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
function definition(source,name){
 const start=new RegExp(`^(?:export )?(?:async )?function ${name}\\(`,'m').exec(source)?.index;assert(start!==undefined,name);
 const rest=source.slice(start).replace(/^export /,'');const next=/\n(?:export )?(?:async )?function /g.exec(rest);return next?rest.slice(0,next.index):rest;
}
const ctx=vm.createContext({...concept,...endBrief,console,VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline,
 CREATIVE_DIRECTOR_BRIEF:'Verified facts only.',KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'fixture',KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},
 normalizeKlingCreativeLine:value=>String(value||'').trim(),getFallbackKlingCta:()=> 'Upptäck sortimentet',normalizeKlingLayout:value=>value||{},getKlingPlacementBox:()=>({}),
 sceneSafeKlingLayout:value=>value,klingLayoutSchema:()=>({type:'object'}),truncate:value=>String(value||''),getOpenAiTextOutput:response=>response.output_text});
vm.runInContext(definition(finalizer,'planFinishedKlingAdvertisingCreative'),ctx);
let planningCalls=0,backgroundCalls=0;
for(const [index,f] of fixtures.entries()){
 const creative={product_truth:f.truth,audience_motivation:f.motivation,campaign_idea:f.idea,scene_connection:f.scene,background_brief:f.background,typography:f.type};
 let seenImages=0;
 const api={responses:{create:async request=>{
   planningCalls++;assert(request.input[0].content[0].text.includes(concept.COMMERCIAL_CONCEPT_BRIEF));
   assert(request.text.format.schema.properties.creative_concept);assert(request.max_output_tokens>=1800);
   seenImages=request.input[0].content.filter(c=>c.type==='input_image').length;
   return {output_text:JSON.stringify({creative_concept:creative,headline:f.headline,closing_headline:f.closing,closing_line:f.invitation+' på store.example',cta:f.invitation+' på store.example',
     printed_text:'',independent_message:true,supported:true,closing_supported:true,end_card_emphasis:'',design_direction:'Retain the observed scene',
     subheadline:'',main_placement:'lower_left',cta_placement:'lower_left',main_layout:{},cta_layout:{},protected_regions:[],placement_confidence:.96})};
 }}};
 const animated=await planAnimatedAdvertisingCopy({openai:api,model:'fixture',rule:{language:f.language,brand_profile:{website_url:'https://store.example'},website_item:{title:f.title}},
   postContent:f.truth,productReferenceBuffer:product,backgroundReferenceBuffer:canvas,sceneFrames:[canvas,canvas,canvas]});
 assert.equal(seenImages,4,'one product plus three actual composition frames; no duplicate poster');
 assert.equal(animated.creativeConcept.campaign_idea,f.idea);assert.equal(animated.closingLine,f.invitation);assert.equal(animated.conceptVersion,364);
 const kling=await ctx.planFinishedKlingAdvertisingCreative({openai:api,post:{content:f.truth,language:f.language},
   selection:{verified_product_title:f.title,end_card_brand_context:{website_url:'https://store.example'}},frames:[{buffer:canvas}]});
 assert.equal(kling.creative_concept.campaign_idea,f.idea);assert.equal(kling.cta,f.invitation);assert.equal(kling.concept_version,364);
 assert.equal(kling.design_direction,animated.designDirection,'both flows preserve the same production decisions');
 const refs=[{name:`actual-scene-${index}.png`},{name:`verified-product-${index}.png`}];
 const assets=await generateIndependentAdvertisingAssets({openai:{images:{edit:async(options,request)=>{
   backgroundCalls++;assert.equal(options.image,refs,'actual reference files reach the image provider');
   assert(options.prompt.includes(f.idea));assert(options.prompt.includes(f.background));assert(options.prompt.includes(f.scene));
   assert(options.prompt.includes(f.closing));assert(options.prompt.includes('STYLE AND COLOR REFERENCES ONLY'));
   assert.equal(request.maxRetries,0);return {data:[{b64_json:canvas.toString('base64')}]};
 },generate:async()=>{throw new Error('reference images must not be discarded');}}},
 model:'fixture',referenceFiles:refs,headline:animated.headline,closingHeadline:animated.closingHeadline,closingLine:animated.closingLine,
 creativeConcept:animated.creativeConcept,designDirection:animated.designDirection});
 assert.equal(assets.backgroundReferenceMode,'scene_references');assert.equal(assets.backgroundReferenceCount,2);
}
assert.equal(planningCalls,8,'one existing planner per format and fixture; no new review call');assert.equal(backgroundCalls,4);

// Missing or unexpected concept fields do not become new failure conditions.
for(const value of [undefined,null,[],false,'legacy',{campaign_idea:12}])assert.doesNotThrow(()=>concept.normalizeCommercialConcept(value));
assert.equal(concept.commercialConceptDirection(null,'Original style'),'Original style');
const detailed={...concept.normalizeCommercialConcept(null),typography:'Elegant serif #FFFFFF #FFD54A',background_brief:'x'.repeat(640)+' COMPLETE_PLAN_END',campaign_idea:'A complete campaign'};
assert(concept.commercialConceptDirection(detailed).includes('COMPLETE_PLAN_END'),'background is not lost at the old 600-character direction cut');
const standalone=await renderArtDirectedTypography({text:'Tid för dig',designDirection:detailed.typography,backgroundBuffer:canvas});
const combined=await renderArtDirectedTypography({text:'Tid för dig',designDirection:concept.commercialConceptDirection({...detailed,background_brief:'Bold black shapes #000000 #222222'}),backgroundBuffer:canvas});
assert.deepEqual(standalone,combined,'background words/colors do not override the chosen type personality or foreground palette');

// A transport error is one attempted request, never a new creative admin gate.
let outages=0;
const fallback=await ctx.planFinishedKlingAdvertisingCreative({openai:{responses:{create:async()=>{outages++;throw new Error('timeout');}}},post:{content:'Svensk kampanj'},selection:{verified_product_title:'Produkt'},frames:[{buffer:canvas}]});
assert.equal(outages,1);assert.equal(fallback.source,'deterministic_fallback');
let edits=0,generates=0;
const offline=await generateIndependentAdvertisingAssets({openai:{images:{edit:async()=>{edits++;throw new Error('timeout');},generate:async()=>{generates++;throw new Error('duplicate request');}}},
 model:'fixture',referenceFiles:[{name:'actual.png'}],headline:'Mer plats hemma',closingLine:'Hitta din favorit'});
assert.equal(edits,1);assert.equal(generates,0);assert.equal(offline.backgroundSource,'designed_fallback');

for(const text of ['Upptäck på pressit.se','Upptäck på https://www.pressit.se/products/one.','Shop at PRESSIT.SE.']){
 const result=concept.separateCommercialWebsite(text,'https://pressit.se');assert.equal(result.domain,'pressit.se');assert(!result.invitation.toLowerCase().includes('pressit'));
}
assert.deepEqual(concept.separateCommercialWebsite('pressit.se','https://pressit.se'),{invitation:'pressit.se',domain:''});
assert.equal(concept.separateCommercialWebsite('Hitta din stil!','https://pressit.se').invitation,'Hitta din stil!');
for(const text of ['notpressit.se','pressit.se.evil','info@pressit.se'])assert.equal(concept.separateCommercialWebsite(text,'https://pressit.se').invitation,text);
const cardParams={background:canvas,headline:'Låt motivet tala',layoutPolicy:endBrief.END_CARD_LAYOUT_POLICY,websiteUrl:'https://pressit.se',designDirection:'Bold sans-serif #FFFFFF #FFD54A',includeSender:false};
const duplicate=await composeVideoEndCardLayers({...cardParams,closingLine:'Upptäck på pressit.se'});
const clean=await composeVideoEndCardLayers({...cardParams,closingLine:'Upptäck'});
assert.deepEqual(duplicate.foregroundBuffer,clean.foregroundBuffer,'actual raster output contains one domain, with no dangling preposition');
assert.equal(duplicate.layout.copy.website,'pressit.se');assert.equal(duplicate.layout.copy.invitation,'Upptäck');assert.equal(duplicate.hasSender,false);

// Exercise the actual worker up to planning: it must first composite the real
// product into the actual sampled moving background, not plan from a poster.
let workerFrames;
const reached=new Error('PLANNER_REACHED_WITH_ACTUAL_COMPOSITION');
const workerContext=vm.createContext({sharp,console,ANIMATED_VIDEO_MOTION_SECONDS:5,PRODUCT_RESEARCH_FAST_MODEL:'fixture',
 getAnimatedOverlayBackgroundReference:async()=>canvas,sampleRemoteVideoFrames:async()=>[{buffer:canvas},{buffer:canvas},{buffer:canvas}],
 planAnimatedAdvertisingCopy:async options=>{workerFrames=options.sceneFrames;throw reached;}});
vm.runInContext(definition(worker,'createAnimatedTextOverlay'),workerContext);
await assert.rejects(workerContext.createAnimatedTextOverlay({openai:{},rule:{},productReferenceBuffer:product,backgroundAsset:{public_url:'existing.mp4'},animationLayout:{product:{left:200,top:400,width:80,height:100}}}),e=>e.cause===reached);
assert.equal(workerFrames.length,3);
const pixel=await sharp(workerFrames[0]).extract({left:210,top:410,width:1,height:1}).removeAlpha().raw().toBuffer();
assert.deepEqual(Array.from(pixel),[169,79,50],'planner sees the actual composed product pixels');
console.log('PASS 144.364: both real planners share one concept for four product/service contexts, actual scene references reach image provider, domain appears once, typography survives background direction, worker plans from actual compositions, legacy fields/outages stay nonblocking, no extra review or paid retry');
