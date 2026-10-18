import * as creativePlanning from '../lib/videoCreativePlanning.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as concept from '../lib/videoCommercialConcept.js';
import * as endBrief from '../lib/videoEndCardBrief.js';
import {buildEndCardMasterPrompt,fitEndCardMasterArtwork} from '../lib/videoEndCardMaster.js';
import {choosePlannedVideoTextBox,avoidsProtectedRegions} from '../lib/videoAdaptiveLayout.js';
import {planAnimatedAdvertisingCopy} from '../lib/animatedAdvertisingCopy.js';
import {VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION} from '../lib/videoArtDirection.js';
import {CREATIVE_DIRECTOR_BRIEF} from '../lib/videoCreativeDirector.js';
import {COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline} from '../lib/videoAdvertisingHierarchy.js';

const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const start=finalizer.indexOf('async function planFinishedKlingAdvertisingCreative(');
const end=finalizer.indexOf('\nasync function ',start+1);
assert(start>0 && end>start);
const ctx=vm.createContext({...creativePlanning,...concept,...endBrief,console,VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,CREATIVE_DIRECTOR_BRIEF,COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline,
 KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'offline',KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},getFallbackKlingCta:()=> 'Se produkten',
 normalizeKlingCreativeLine:v=>String(v||'').trim(),normalizeKlingLayout:v=>v||{},getKlingPlacementBox:()=>({}),klingLayoutSchema:()=>({type:'object'}),truncate:v=>String(v||''),getOpenAiTextOutput:r=>r.output_text});
vm.runInContext(finalizer.slice(start,end),ctx);
const scene=await sharp({create:{width:1080,height:1920,channels:3,background:'#334455'}}).png().toBuffer();
const original=await sharp({create:{width:80,height:120,channels:3,background:'#BB1222'}}).png().toBuffer();
let calls=0;
// Test the production boundary, not an assertion that mocked copy is creative.
// Distracting scene/legacy directions must not reach the image prompt, while a
// verified place motif must survive. Same contract for unrelated offers.
const fixtures=[
 {title:'Bakis & Skakis',anchor:'Verified humorous printed wording: Bakis & Skakis',idea:'Playful self-recognition through the printed humor',background:'Tactile playful paper with deliberate red and warm white light',relation:'An expressive paper-poster composition supports the verified humor',noise:'DISTRACTION_ROOFTOP_SKYLINE',headline:'Låt humorn synas',closing:'Bär ditt humör',cta:'Hitta din humortröja'},
 {title:'Fiskespö',anchor:'Verified fishing rod for angling',idea:'Anticipation of time spent fishing',background:'Photographic forest lake at dawn, calm central light',relation:'The water evokes the verified fishing use',noise:'DISTRACTION_STUDIO_WALL',headline:'Dags för nästa kast',closing:'Längtan till vattnet',cta:'Hitta ditt fiskespö'},
 {title:'Arbetsdator',anchor:'Verified computer intended for work',idea:'A deliberate place for focused work',background:'Precise architectural work environment with side light',relation:'Workspace relates directly to the verified intended use',noise:'DISTRACTION_PARK_BENCH',headline:'Plats för dina idéer',closing:'Ge idéerna utrymme',cta:'Se datorn'},
 {title:'Malmömotiv',anchor:'Verified Malmö city motif printed on the product',idea:'Express belonging to Malmö',background:'Photographic Malmö skyline with clear central text space',relation:'Malmö is the verified motif, not an incidental filming location',noise:'DISTRACTION_RETAIL_COUNTER',headline:'Staden nära hjärtat',closing:'Bär Malmö med stolthet',cta:'Se Malmömotivet'},
];
for(const f of fixtures){
 const planning={product_anchor:f.anchor,product_truth:f.anchor,audience_motivation:f.idea,campaign_idea:f.idea,background_brief:f.background,background_relation:f.relation,
  scene_connection:f.noise,incidental_scene:f.noise,typography:'Confident individual letterforms #FFFFFF #FFCC44',closing_subject:'environment',closing_subject_reason:''};
 const client={responses:{create:async request=>{
  calls++;
  const content=request.input[0].content,images=content.filter(c=>c.type==='input_image');
  const first=await sharp(Buffer.from(images[0].image_url.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
  assert.equal(first.info.width,80);assert.equal(first.info.height,120);assert(first.data[0]>150 && first.data[1]<40,'first image contains original product pixels rather than the scene');
  if(request.text.format.name==='kling_finished_ad_creative_plan'){
   assert.equal(images.length,3,'original product plus both actual video frames');
   assert(content.some(c=>c.type==='input_text'&&c.text.startsWith('FINISHED VIDEO FRAMES')),'layout evidence is clearly separated');
  } else assert.equal(images.length,3,'animation also sees authoritative product and actual compositions');
  assert.deepEqual(request.text.format.schema.properties.creative_concept.required,concept.COMMERCIAL_CONCEPT_SCHEMA.required);
  return {output_text:JSON.stringify({creative_concept:planning,headline:f.headline,closing_headline:f.closing,cta:f.cta,closing_line:f.cta,
   printed_text:'',independent_message:true,supported:true,closing_supported:true,end_card_emphasis:'',design_direction:f.noise,
   subheadline:'',main_placement:'lower_left',cta_placement:'lower_left',main_layout:{},cta_layout:{},protected_regions:[],placement_confidence:.95})};
 }}};
 const kling=await ctx.planFinishedKlingAdvertisingCreative({openai:client,post:{content:'Factual sales caption'},selection:{verified_product_title:f.title},frames:[{buffer:scene},{buffer:scene}],productReferenceBuffer:original});
 const animation=await planAnimatedAdvertisingCopy({openai:client,model:'offline',rule:{language:'sv',website_item:{title:f.title}},productReferenceBuffer:original,sceneFrames:[scene,scene]});
 for(const plan of [{creativeConcept:kling.creative_concept,direction:kling.design_direction},{creativeConcept:animation.creativeConcept,direction:animation.designDirection}]){
  const prompt=buildEndCardMasterPrompt({headline:f.closing,closingLine:f.cta,creativeConcept:plan.creativeConcept,designDirection:plan.direction});
  assert(prompt.includes(f.anchor));assert(prompt.includes(f.background));assert(prompt.includes(f.relation));
  assert(!prompt.includes(f.noise),'observations and mixed legacy direction cannot leak incidental scenery into closing image generation');
 }
}
assert.equal(calls,8,'one existing planning call per format/context, no added reviewer or retries');
assert.deepEqual(concept.closingCommercialContext(null,'Legacy direction').agreedDirection,'Legacy direction');
assert.doesNotThrow(()=>buildEndCardMasterPrompt({headline:'Older saved copy',creativeConcept:{campaign_idea:'Old saved plan'}}));
const noOriginal=await ctx.planFinishedKlingAdvertisingCreative({openai:{responses:{create:async request=>{
 assert.equal(request.input[0].content.filter(c=>c.type==='input_image').length,1);
 throw new Error('offline planner');
}}},post:{},selection:{verified_product_title:'Saved product'},frames:[{buffer:scene}]});
assert.equal(noOriginal.source,'deterministic_fallback','missing reference/legacy/provider outage do not introduce a new failure gate');

// Reproduce the ignored planner rectangles: a later pass missed the shirt.
const productRegion={left:180,top:650,width:720,height:800};
const inspection={sceneVerified:true,sceneRegions:[{left:400,top:60,width:280,height:260}]};
const plan={main_layout:{left:64,top:850,width:900,height:300},protected_regions:[productRegion]};
const layout=await choosePlannedVideoTextBox({frames:[scene,scene],plan,inspection});
assert(layout);assert(avoidsProtectedRegions(layout.box,[productRegion,...inspection.sceneRegions]));
assert.equal(await choosePlannedVideoTextBox({frames:[scene],plan:{protected_regions:[{left:0,top:0,width:1080,height:1920}]},inspection}),null,'a busy scene omits its headline and keeps the movie deliverable');
assert.equal(await choosePlannedVideoTextBox({frames:[scene],plan,inspection:{sceneVerified:false}}),null);
assert.equal(await choosePlannedVideoTextBox({frames:[scene],plan}),null,'missing inspection does not imply verified subject geometry');
assert(finalizer.includes('choosePlannedVideoTextBox({frames:frames.map(frame=>frame.buffer),plan:creativePlan,inspection:compositionInspection})'),'actual worker consumes both sources of geometry');
assert(finalizer.indexOf('let productReferenceBuffer = null;')<finalizer.indexOf('const creativePlan = workingSelection.ad_creative_plan'),'original is fetched before the production planning call');

// Edge-rich raster fixture exposes the real .368 repeated-row stripe defect.
const art=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><defs><linearGradient id="bg" x2=".3" y2="1"><stop stop-color="#25495F"/><stop offset=".8" stop-color="#527556"/><stop offset="1" stop-color="#D6B692"/></linearGradient></defs><rect width="1024" height="1536" fill="url(#bg)"/><path d="M0 1480L150 1300L250 1536L380 1390L570 1536L790 1280L900 1510L1024 1440V1536H0" fill="#334435"/><text x="35" y="800" font-family="Noto Sans" font-size="110" fill="white">Hela budskapet</text><rect x="0" y="700" width="22" height="180" fill="red"/><rect x="1002" y="700" width="22" height="180" fill="lime"/></svg>`)).png().toBuffer();
const fitted=await fitEndCardMasterArtwork(art);
const fittedRaw=await sharp(fitted).removeAlpha().raw().toBuffer();
const row=y=>fittedRaw.subarray(y*1080*3,(y+1)*1080*3);
assert.notDeepEqual(row(1810),row(1910),'outside rows are not copies of the bottom row');
const bottomColor=[...row(1900).subarray(540*3,540*3+3)];
assert(bottomColor[0]<230 && bottomColor[1]<190 && bottomColor[2]<190,'continuation preserves source colors rather than interpreting RGB as premultiplied alpha');
const old=await sharp(art).resize(1080,1620).extend({top:150,bottom:150,left:0,right:0,extendWith:'copy'}).png().toBuffer();
const oldRaw=await sharp(old).removeAlpha().raw().toBuffer();
assert.deepEqual(oldRaw.subarray(1810*1080*3,1811*1080*3),oldRaw.subarray(1910*1080*3,1911*1080*3),'fixture reproduces the old stripe mechanism');
const expected=await sharp(art).resize(1080,1620).removeAlpha().raw().toBuffer();
const recovered=await sharp(fitted).extract({left:0,top:150,width:1080,height:1620}).removeAlpha().raw().toBuffer();
assert.deepEqual(recovered,expected,'every fitted artwork and edge-letter pixel is unchanged');
assert.deepEqual(await fitEndCardMasterArtwork(fitted),fitted,'already fitted master remains identical');
if(process.env.VIDEO_QA_OUTPUT){fs.mkdirSync(process.env.VIDEO_QA_OUTPUT,{recursive:true});await sharp(old).resize({width:540}).toFile(`${process.env.VIDEO_QA_OUTPUT}/old-edge-fill.png`);await sharp(fitted).resize({width:540}).toFile(`${process.env.VIDEO_QA_OUTPUT}/new-edge-fill.png`);}
console.log('PASS 144.369: both planners receive product evidence; incidental scenery excluded but verified place meaning retained; both geometry sources used without blocking delivery; striped-row regression fixed with exact whole-artwork preservation');
