import * as sceneHeadline from '../lib/videoSceneHeadline.js';
import * as creativePlanning from '../lib/videoCreativePlanning.js';
import assert from 'node:assert/strict';
import * as commercialConcept from '../lib/videoCommercialConcept.js';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import { END_CARD_DESIGN_BRIEF, END_CARD_LAYOUT_POLICY, END_CARD_HOLD_SECONDS, endCardWebsite, normalizeEndCardHook, endCardEmphasis } from '../lib/videoEndCardBrief.js';
import { generateIndependentAdvertisingAssets, buildOfflineAdvertisingBackdrop } from '../lib/videoAdvertisingAssetPipeline.js';
import { composeVideoEndCardLayers } from '../lib/klingEndCard.js';
import { adaptEndCardComposition } from '../lib/videoAdaptiveLayout.js';
import { planAnimatedAdvertisingCopy } from '../lib/animatedAdvertisingCopy.js';
import { measureAdvertisingTypography } from '../lib/videoTypographyPreflight.js';
import { buildProductPushEdit, buildVideoOverlayEdit } from '../lib/shotstack.js';
import { reviewAdvertisingComposition } from '../lib/videoAdvertisingReview.js';
import { VIDEO_ART_DIRECTION, VIDEO_DESIGN_VERSION } from '../lib/videoArtDirection.js';
import { COMMERCIAL_COPY_HIERARCHY, repeatsAdvertisingMessage, isProductLabelHeadline } from '../lib/videoAdvertisingHierarchy.js';

const picture=await sharp({create:{width:1024,height:1536,channels:3,background:'#12213b'}}).png().toBuffer();
let imageCalls=0;
const openai={images:{generate:async(options,request)=>{
  imageCalls++;assert(!('image' in options));assert.equal(options.background,'opaque');
  assert(options.prompt.includes(END_CARD_DESIGN_BRIEF));assert.equal(request.maxRetries,0);
  return {data:[{b64_json:picture.toString('base64')}]};
},edit:async()=>{throw new Error('A generate failure must never submit a second image request');}}};
const fixtures=[
  {headline:'Bär ditt stöd.',closingLine:'Visa vad du står för',emphasisText:'stöd.',designDirection:'Bold sans-serif #FFFFFF #FFD54A',websiteUrl:'https://www.pressit.se/products/one',language:'sv'},
  {headline:'Mer liv hemma',closingLine:'Hitta din gröna favorit',designDirection:'Warm bold sans-serif #FFFFFF #E7D7A5',websiteUrl:'https://green.example/shop',language:'sv'},
  {headline:'Zeit für dich',closingLine:'Buche deine Auszeit',designDirection:'Elegant refined serif #FFFFFF #F1D9A5',websiteUrl:'https://studio.example/booking',language:'de'},
];
let sansPixels,serifPixels;
for(const [index,item] of fixtures.entries()){
  const brand={language:item.language};
  const assets=await generateIndependentAdvertisingAssets({openai,model:'fixture',referenceFiles:[],...item,brand});
  assert.equal(assets.backgroundSource,'generated_background');
  const layers=await composeVideoEndCardLayers({background:assets.endCard,headlineArtwork:assets.headline,closingText:assets.closingText,
    ...item,brand,layoutPolicy:END_CARD_LAYOUT_POLICY,backgroundSource:assets.backgroundSource,includeSender:false});
  assert.equal(layers.layout.eyebrow,null);assert.equal(layers.layout.sender,null);assert.equal(layers.hasSender,false);
  assert(layers.layout.headline.width/1080>=.75 && layers.layout.headline.width/1080<=.88);
  assert(layers.layout.headline.ink>=100,'dominant letters measured at delivery resolution');
  assert(layers.layout.closing.height<layers.layout.headline.height);
  assert(layers.layout.website,'verified domain has a separate visible layer');
  for(const box of [layers.layout.headline,layers.layout.closing,layers.layout.website]){
    assert(box.top>=480 && box.top+box.height<=1480);assert(Math.abs(box.left+box.width/2-540)<1);
  }
  const adapted=await adaptEndCardComposition({layers,inspection:{endVerified:true,endRegions:[]},quietBackground:()=>{throw new Error('good background replaced');}});
  assert.equal(adapted.layout.adaptive.scale,1);assert.equal(adapted.layout.adaptive.backgroundSource,'generated_background');
  assert(adapted.layout.adaptive.contrast.preserved,'safe approved palette survives adaptation');
  assert.deepEqual(adapted.foregroundBuffer,layers.foregroundBuffer);
  const {data,info}=await sharp(adapted.cardBuffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,1080);assert.equal(info.height,1920);
  for(const y of [0,30,1880,1919])assert(data.subarray(y*1080*3,(y+1)*1080*3).some(v=>v>20),'no black letterboxing');
  const measured=await measureAdvertisingTypography(adapted.foregroundBuffer);assert(measured.bands.length>=3);
  if(index===0){
    const pixels=await sharp(adapted.foregroundBuffer).raw().toBuffer();
    assert(pixels.some((value,i)=>i%4===0 && value>220 && pixels[i+1]>150 && pixels[i+2]<140 && pixels[i+3]>230),'semantic emphasis remains yellow');
    sansPixels=layers.foregroundBuffer;
  }
  if(index===2)serifPixels=layers.foregroundBuffer;
  if(process.env.VIDEO_QA_OUTPUT){fs.mkdirSync(process.env.VIDEO_QA_OUTPUT,{recursive:true});fs.writeFileSync(`${process.env.VIDEO_QA_OUTPUT}/end-card-${index}.png`,adapted.cardBuffer);}
  const red=await sharp({create:{width:540,height:960,channels:3,background:'#ff0000'}}).png().toBuffer();
  const replaced=await adaptEndCardComposition({layers,inspection:{endVerified:true,endContainsProduct:true,endRegions:[],sceneVerified:true,sceneRegions:[]},sceneBackground:red,
    quietBackground:()=>buildOfflineAdvertisingBackdrop({brand:{primary_color:'#12213b'}})});
  assert.equal(replaced.layout.adaptive.backgroundSource,'designed_fallback');assert.equal(replaced.layout.adaptive.scale,1);
  const bg=await sharp(replaced.backgroundBuffer).resize(1,1).raw().toBuffer();assert(bg[0]<240,'never reuse the red source frame');
}
assert.equal(imageCalls,3);assert.notDeepEqual(sansPixels,serifPixels);

let outages=0;
const base={model:'fixture',referenceFiles:[],headline:'Ett nytt perspektiv',closingLine:'Hitta din favorit'};
const offline=await generateIndependentAdvertisingAssets({...base,openai:{images:{generate:async()=>{outages++;throw new Error('timeout');},edit:async()=>{throw new Error('duplicate request');}}}});
assert.equal(outages,1);assert.equal(offline.backgroundSource,'designed_fallback');
const cached=await generateIndependentAdvertisingAssets({...base,cachedBackground:picture,openai:{}});
assert.equal(cached.backgroundSource,'cached_background');

let planningCalls=0;
const animation=await planAnimatedAdvertisingCopy({openai:{responses:{create:async(request)=>{
  planningCalls++;assert(request.input[0].content[0].text.includes(END_CARD_DESIGN_BRIEF));
  assert(request.text.format.schema.required.includes('closing_headline'));
  return {output_text:JSON.stringify({headline:'Låt vardagen blomma',printed_text:'',independent_message:true,supported:true,
    closing_line:'Hitta din gröna favorit',closing_supported:true,closing_headline:'Mer liv hemma',end_card_emphasis:'liv',design_direction:'Warm bold sans-serif'})};
}}},model:'fixture',rule:{language:'sv',website_item:{title:'Växt'}},postContent:'Växter för hemmet'});
assert.equal(planningCalls,1);assert.equal(animation.closingHeadline,'Mer liv hemma');assert.equal(animation.emphasisText,'liv');
assert.equal(normalizeEndCardHook('a '.repeat(30),'Approved'),'Approved');
assert.equal(endCardEmphasis('invented','Mer liv hemma'),'');assert.equal(endCardWebsite('https://www.example.com/path'),'example.com');
assert.equal(endCardWebsite('https://user:secret@example.com'),'');

function definition(source,name){
 const at=new RegExp(`^(?:export )?(?:async )?function ${name}\\(`,'m').exec(source)?.index;assert(at!==undefined,name);
 const rest=source.slice(at).replace(/^export /,'');const next=/\n(?:export )?(?:async )?function /g.exec(rest);return next?rest.slice(0,next.index):rest;
}
const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const context=vm.createContext({...sceneHeadline,...creativePlanning,...commercialConcept,console,VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,END_CARD_DESIGN_BRIEF,normalizeEndCardHook,endCardEmphasis,
 COMMERCIAL_COPY_HIERARCHY,repeatsAdvertisingMessage,isProductLabelHeadline,CREATIVE_DIRECTOR_BRIEF:'Verified facts only.',
 KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'fixture',KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},
 normalizeKlingCreativeLine:value=>String(value||'').trim(),getFallbackKlingCta:()=>fixtures[0].closingLine,
 normalizeKlingLayout:value=>value||{},getKlingPlacementBox:()=>({}),sceneSafeKlingLayout:value=>value,klingLayoutSchema:()=>({type:'object'}),
 truncate:value=>String(value||''),getOpenAiTextOutput:response=>response.output_text});
vm.runInContext(definition(finalizer,'planFinishedKlingAdvertisingCreative'),context);
const planned=await context.planFinishedKlingAdvertisingCreative({post:{content:'Verifierad kampanj'},selection:{verified_product_title:'En produkt'},frames:[{buffer:picture}],
 openai:{responses:{create:async(request)=>{planningCalls++;assert(request.input[0].content[0].text.includes(commercialConcept.COMMERCIAL_CONCEPT_BRIEF));return {output_text:JSON.stringify({headline:'Ett nytt perspektiv',subheadline:'',cta:fixtures[0].closingLine,closing_headline:fixtures[0].headline,end_card_emphasis:'stöd.',main_placement:'lower_left',cta_placement:'lower_left',main_layout:{},cta_layout:{},protected_regions:[],placement_confidence:.95,design_direction:fixtures[0].designDirection})};}}}});
assert.equal(planningCalls,2);assert.equal(planned.closing_headline,fixtures[0].headline);
vm.runInContext(definition(finalizer,'createFinishedKlingTypographyOnce'),context);
const previous={text_overlay_url:'already-created.png',end_card_url:'old-card.png',shotstack_render_id:'existing-render'};
const saved=await context.createFinishedKlingTypographyOnce({selection:previous});
assert.equal(saved,previous,'cached artwork returns before any new provider operation');

for(const edit of [buildVideoOverlayEdit({videoUrl:'video',textOverlayUrl:'text',logoOverlayUrl:'logo',endCardUrl:'card',endCardBackgroundUrl:'background',endCardTextUrl:'closing',endCardIncludesSender:false,durationSeconds:5,closingHoldSeconds:END_CARD_HOLD_SECONDS}),
 buildProductPushEdit({backgroundVideoUrl:'video',productDataUri:'product',logoOverlayUrl:'logo',endCardUrl:'card',endCardBackgroundUrl:'background',endCardTextUrl:'closing',endCardIncludesSender:false,durationSeconds:5,closingHoldSeconds:END_CARD_HOLD_SECONDS})]){
 const clips=edit.timeline.tracks.flatMap(track=>track.clips),logos=clips.filter(c=>c.asset.src==='logo');assert.equal(logos.length,1);assert.equal(logos[0].length,5+END_CARD_HOLD_SECONDS);
 const bg=clips.find(c=>c.asset.src==='background'),text=clips.find(c=>c.asset.src==='closing');
 assert.equal(bg.width,1080);assert.equal(bg.height,1920);assert.equal(bg.fit,'none');assert(bg.scale);assert(!text.scale);
 assert.equal(bg.start+bg.length,5+END_CARD_HOLD_SECONDS);
}
let auditPrompt='';
await reviewAdvertisingComposition({openai:{responses:{create:async(request)=>{auditPrompt=request.input[0].content[0].text;return {output_text:JSON.stringify({approved:true,issue:'none',reason:'Complete',confidence:.99,end_card_defect:'none'})};}}},frames:[picture],endCard:picture,headline:'Scenrubrik',endCardHeadline:'Separat slutrubrik',closingLine:'Hitta din favorit',sceneHeadlineOmitted:true});
assert(auditPrompt.includes('Separat slutrubrik'));assert(auditPrompt.includes('do not require the omitted scene headline'));
console.log('PASS 144.363: actual dominant composition, general design, semantic palette, no letterboxing or scene replacement, provider outage/cache, both planners, cached artwork, two-second timelines and one corner logo');
