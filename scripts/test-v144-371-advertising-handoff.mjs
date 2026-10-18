import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as conceptModule from '../lib/videoCommercialConcept.js';
import * as endBrief from '../lib/videoEndCardBrief.js';
import {planAnimatedAdvertisingCopy} from '../lib/animatedAdvertisingCopy.js';
import {VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION} from '../lib/videoArtDirection.js';
import {CREATIVE_DIRECTOR_BRIEF} from '../lib/videoCreativeDirector.js';
import {COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline} from '../lib/videoAdvertisingHierarchy.js';
import sharp from 'sharp';
import {generateIndependentAdvertisingAssets,renderArtDirectedTypography,ensureExactAdvertisingLettering} from '../lib/videoAdvertisingAssetPipeline.js';
import {END_CARD_FRAMING,buildEndCardMasterPrompt,fitEndCardMasterArtwork} from '../lib/videoEndCardMaster.js';
import {closingCommercialContext,commercialConceptDirection,normalizeCommercialConcept} from '../lib/videoCommercialConcept.js';
import {chooseVideoTextBox,choosePlannedVideoTextBox,adaptVideoTextContrast,avoidsProtectedRegions} from '../lib/videoAdaptiveLayout.js';
import {composeVideoEndCardLayers} from '../lib/klingEndCard.js';

// Production decision -> image request -> raw cache -> exact final composite.
// A deterministic fixture proves transport/layout behavior, NOT AI creativity.
const rawArt=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536">
<defs><linearGradient id="sky" x2=".6" y2="1"><stop stop-color="#284955"/><stop offset=".5" stop-color="#132628"/><stop offset="1" stop-color="#637B52"/></linearGradient></defs>
<rect width="1024" height="1536" fill="url(#sky)"/>
<path d="M0 0L90 700L150 0M870 0L960 800L1024 0" fill="#203D24"/>
<rect x="0" width="75" height="1536" fill="#FF00FF"/><rect x="949" width="75" height="1536" fill="#00FFFF"/>
<text x="512" y="660" text-anchor="middle" font-family="Noto Sans" font-size="104" font-weight="700" fill="#FFFFFF">Ge plats</text>
<text x="512" y="805" text-anchor="middle" font-family="Noto Sans" font-size="104" font-weight="700" fill="#FFD24A">åt din idé</text>
<text x="512" y="1010" text-anchor="middle" font-family="Noto Sans" font-size="45" fill="#FFFFFF">Se erbjudandet</text>
<text x="512" y="1100" text-anchor="middle" font-family="Noto Sans" font-size="30" fill="#FFFFFF">butik.example</text>
</svg>`)).png().toBuffer();
const concept={product_anchor:'Verified offer and distinguishing visual motif',product_truth:'Verified facts only',campaign_idea:'Make room for individual expression',background_relation:'Material and light support the verified visual character',background_brief:'A tactile dark environment with calm central light',
 scene_connection:'INCIDENTAL_PARK_DO_NOT_FORWARD',incidental_scene:'INCIDENTAL_PARK_DO_NOT_FORWARD',typography:'Shared confident character',scene_typography:'Bold sans-serif #102030 #854100',closing_typography:'Heavy poster lettering #FFFFFF #FFD24A',scene_emphasis:'din idé',closing_subject:'environment'};
assert.equal(commercialConceptDirection(concept).split('\n')[0],concept.scene_typography);
const context=closingCommercialContext(concept,'LEGACY_MIXED_DIRECTION');
assert.equal(context.agreedDirection,concept.closing_typography);
assert.equal(context.concept.typography,concept.closing_typography);
assert(!JSON.stringify(context).includes('INCIDENTAL_PARK'));
assert(!JSON.stringify(context).includes('#102030'));
assert.equal(normalizeCommercialConcept({typography:'Legacy serif'}).scene_typography,'','old plans need no migration or new validation');

const black=await sharp({create:{width:1080,height:1920,channels:3,background:'#111111'}}).png().toBuffer();
let providerCalls=0,reviewCalls=0,cache,metadata;
const params={model:'gpt-image-2.5-flare',headline:'Ge plats åt din idé',closingHeadline:'Ge plats åt din idé',closingLine:'Se erbjudandet',closingEmphasis:'din idé',websiteUrl:'https://butik.example',creativeConcept:concept,renderEndCardMaster:true,masterFraming:END_CARD_FRAMING,sceneBackground:black,
 openai:{images:{generate:async(options,request)=>{
  providerCalls++;assert.equal(request.maxRetries,0);assert.equal(options.size,'864x1536');
  assert(options.prompt.includes('Planned semantic emphasis: "din idé"'));
  assert(options.prompt.includes(concept.closing_typography));assert(!options.prompt.includes(concept.scene_typography));
  assert(!options.prompt.includes('INCIDENTAL_PARK'));assert(options.prompt.includes('true 9:16'));
  assert(options.prompt.includes('x=64..800'));assert(options.prompt.includes('flat button rectangle'));
  return {data:[{b64_json:rawArt.toString('base64')}]};
 }}},onBackground:async(buffer,info)=>{cache=buffer;metadata=info;}};
const generated=await generateIndependentAdvertisingAssets(params);
assert.equal(providerCalls,1);assert.equal(metadata.framing,END_CARD_FRAMING);assert(metadata.isMaster);
assert.deepEqual(cache,rawArt,'raw paid provider output remains intact, separate from delivery framing');
assert.equal(generated.endCardFraming,END_CARD_FRAMING);
// This fixture deliberately violates the requested 9:16 shape and contains
// edge lettering markers. Never reintroduce v371's crop on such a response.
const expected=await sharp(await fitEndCardMasterArtwork(rawArt)).removeAlpha().raw().toBuffer();
assert.deepEqual(await sharp(generated.endCardMaster).raw().toBuffer(),expected,'unexpected provider shape preserves every edge instead of trusting prompt margins');
const cached=await generateIndependentAdvertisingAssets({...params,cachedBackground:cache,cachedMaster:metadata.isMaster,cachedMasterFraming:metadata.framing});
assert.equal(providerCalls,1);assert.deepEqual(cached.endCardMaster,generated.endCardMaster,'resuming preserves the exact planned viewport');
const layers=await composeVideoEndCardLayers({masterArtwork:generated.endCardMaster,headline:params.closingHeadline,closingLine:params.closingLine,websiteUrl:params.websiteUrl});
assert.deepEqual(await sharp(layers.cardBuffer).raw().toBuffer(),expected,'final compositor cannot erase/retype the designed master');
await ensureExactAdvertisingLettering({assets:generated,headline:params.headline,closingLine:params.closingLine,verify:async()=>{reviewCalls++;throw Error('No added review');}});
assert.equal(reviewCalls,0);
// Legacy cached 2:3 masters may have lettering at the edge: they MUST NOT use
// a newly assumed crop contract, even after this deployment.
const legacy=await generateIndependentAdvertisingAssets({...params,cachedBackground:rawArt,cachedMaster:true});
assert.equal(providerCalls,1);assert.deepEqual(legacy.endCardMaster,await fitEndCardMasterArtwork(rawArt));
const legacyCenter=await sharp(legacy.endCardMaster).extract({left:0,top:150,width:1080,height:1620}).raw().toBuffer();
assert.deepEqual(legacyCenter,await sharp(rawArt).resize(1080,1620).removeAlpha().raw().toBuffer());
const unexpected=await sharp({create:{width:800,height:800,channels:3,background:'#254458'}}).png().toBuffer();
assert.deepEqual(await fitEndCardMasterArtwork(unexpected,{framing:END_CARD_FRAMING}),await fitEndCardMasterArtwork(unexpected),'unexpected provider dimensions keep all artwork, no retry/rejection');

// The real last color pass previously erased even a perfectly legible accent.
const ink=await renderArtDirectedTypography({text:'Ge plats åt din idé',emphasisText:'din idé',designDirection:'Heavy sans-serif #FFFFFF #FFD24A',backgroundBuffer:black});
const trimmed=await sharp(ink).trim().resize(840,300,{fit:'inside'}).png().toBuffer();
const overlay=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}}).composite([{input:trimmed,left:90,top:550}]).png().toBuffer();
const box={left:64,top:500,width:920,height:380};
const colorCount=async buffer=>{
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});let white=0,accent=0;
 for(let at=0;at<data.length;at+=info.channels)if(data[at+3]>230){if(data[at]>240&&data[at+1]>240&&data[at+2]>240)white++;if(data[at]>240&&data[at+1]>190&&data[at+1]<225&&data[at+2]<100)accent++;}
 return {white,accent};
};
const count=await colorCount(overlay);assert(count.white>100);assert(count.accent>100,'partial-line semantic phrase really has separate accent pixels');
const oldPass=await adaptVideoTextContrast({overlay,frames:[black],box});assert.equal((await colorCount(oldPass.buffer)).accent,0,'fixture reproduces the monochrome override');
const finalPass=await adaptVideoTextContrast({overlay,frames:[black,black],box,preservePalette:true});
assert(finalPass.analysis.preserved);assert.deepEqual(finalPass.buffer,overlay);assert.deepEqual(await colorCount(finalPass.buffer),count);
const invalid=await renderArtDirectedTypography({text:'Ge plats åt din idé',emphasisText:'<script>not an actual phrase</script>',designDirection:'Bold #FFFFFF #FFD24A'});
assert.equal((await colorCount(invalid)).accent,0,'invalid legacy emphasis does not rewrite or reject copy');
const lowContrast=await renderArtDirectedTypography({text:'Ge plats åt din idé',emphasisText:'din idé',designDirection:'Bold #111111 #121212'});
const lowOverlay=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}}).composite([{input:await sharp(lowContrast).trim().resize(840,300,{fit:'inside'}).png().toBuffer(),left:90,top:550}]).png().toBuffer();
const recovered=await adaptVideoTextContrast({overlay:lowOverlay,frames:[black],box,preservePalette:true});assert(!recovered.analysis.preserved);assert((await colorCount(recovered.buffer)).white>100,'readability recovery still works; preserving color is not blind');

// A box that was formerly accepted in the bottom 20% now relocates safely.
const preferred={left:64,top:1540,width:920,height:160};
const choice=await chooseVideoTextBox({frames:[black],preferred,minHeight:140});assert(choice);assert(choice.box.top+choice.box.height<=1536);
const protectedRegions=[{left:0,top:0,width:1080,height:1450}];
assert.equal(await choosePlannedVideoTextBox({frames:[black],plan:{main_layout:preferred,protected_regions:protectedRegions},inspection:{sceneVerified:true,sceneRegions:[]}}),null,'when only unsafe bottom space remains, omit scene headline and deliver movie');
assert(avoidsProtectedRegions(choice.box,[{left:78,top:207,width:220,height:100}]));
for(const path of ['app/api/cron/finalize-kling-videos/route.js','app/api/cron/run-automations/route.js']){
 const source=fs.readFileSync(path,'utf8');
 assert(source.includes('closingEmphasis:'));assert(source.includes('masterFraming:END_CARD_FRAMING')); assert(source.includes('cachedMasterFraming:cachedIndependentFraming'));
 assert(source.includes('cachedIndependentFraming=metadata?.framing||null'));
 assert(/adaptVideoTextContrast\(\{overlay:preflight\.buffer,[^\n]*preservePalette:true/.test(source),'both real worker final color passes preserve legible palette');
 assert(source.includes('end_card_framing:'));
}
// Execute both real planners with provenance markers. Creative scene ideas
// must not be presented as verified facts; company/audience/product facts must
// actually reach their one existing planning request.
const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const begin=finalizer.indexOf('async function planFinishedKlingAdvertisingCreative('),end=finalizer.indexOf('\nasync function ',begin+1);
const ctx=vm.createContext({...conceptModule,...endBrief,console,VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,CREATIVE_DIRECTOR_BRIEF,COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline,
 KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'offline',KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},getFallbackKlingCta:()=> 'Se erbjudandet',normalizeKlingCreativeLine:v=>String(v||'').trim(),normalizeKlingLayout:v=>v||{},getKlingPlacementBox:()=>({}),klingLayoutSchema:()=>({type:'object'}),truncate:v=>String(v||''),getOpenAiTextOutput:r=>r.output_text});
vm.runInContext(finalizer.slice(begin,end),ctx);
let planningCalls=0;
const planner={responses:{create:async request=>{
 planningCalls++;
 const text=request.input[0].content.filter(c=>c.type==='input_text').map(c=>c.text).join(' ');
 assert(text.includes('VERIFIED_DESCRIPTION_MARKER'));assert(text.includes('COMPANY_AUDIENCE_MARKER'));assert(text.includes('COMPANY_IDENTITY_MARKER'));
 assert(!text.includes('UNVERIFIED_STORY_MARKER'));
 return {output_text:JSON.stringify({creative_concept:concept,headline:'Ge plats åt din idé',closing_headline:'Ge plats åt din idé',cta:'Se erbjudandet',closing_line:'Se erbjudandet',end_card_emphasis:'din idé',printed_text:'',independent_message:true,supported:true,closing_supported:true,design_direction:'Shared character',subheadline:'',main_placement:'lower_left',cta_placement:'lower_left',main_layout:{},cta_layout:{},protected_regions:[],placement_confidence:.9})};
}}};
const plannedVideo=await ctx.planFinishedKlingAdvertisingCreative({openai:planner,post:{content:'Factual caption'},frames:[{buffer:black}],selection:{verified_product_title:'Verified item',verified_product_description:'VERIFIED_DESCRIPTION_MARKER',end_card_brand_context:{name:'COMPANY_IDENTITY_MARKER',audience:'COMPANY_AUDIENCE_MARKER'},reference_safety:{commercialStory:{concept:'UNVERIFIED_STORY_MARKER'}}}});
const plannedAnimation=await planAnimatedAdvertisingCopy({openai:planner,model:'offline',rule:{language:'sv',website_item:{title:'Verified item',description:'VERIFIED_DESCRIPTION_MARKER'},brand_profile:{business_name:'COMPANY_IDENTITY_MARKER',target_audience:'COMPANY_AUDIENCE_MARKER'}},sceneFrames:[black]});
assert.equal(planningCalls,2);assert.equal(plannedVideo.end_card_emphasis,'din idé');assert.equal(plannedAnimation.emphasisText,'din idé');
assert.equal(plannedVideo.creative_concept.scene_emphasis,'din idé');assert.equal(plannedAnimation.creativeConcept.closing_typography,concept.closing_typography);
assert.equal((fs.readFileSync('app/api/cron/run-automations/route.js','utf8').match(/verified_product_description:/g)||[]).length,2,'both video preparation paths retain the existing verified description');
// No new product/category slogans embedded into the general production brief.
for(const word of ['HELIKOPTER','Malmö','pressit.se'])assert(!buildEndCardMasterPrompt({headline:'A complete thought'}).includes(word));
if(process.env.VIDEO_QA_OUTPUT){
 fs.mkdirSync(process.env.VIDEO_QA_OUTPUT,{recursive:true});
 await sharp(generated.endCardMaster).resize({width:540}).toFile(`${process.env.VIDEO_QA_OUTPUT}/planned-viewport-fixture.png`);
 const preview=await sharp(black).composite([{input:overlay}]).png().toBuffer();
 await sharp(preview).resize({width:540}).toFile(`${process.env.VIDEO_QA_OUTPUT}/preserved-accent-fixture.png`);
}
console.log('PASS 144.371: explicit closing emphasis/direction reaches existing image call; native request selected, unexpected shapes and raw/legacy caches preserved; meaningful partial-line accents survive actual final contrast pass; bottom control zone excluded; both workers connected; no added paid call/reviewer');
