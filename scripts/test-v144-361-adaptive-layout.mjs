import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {inspectVideoComposition,chooseVideoTextBox,avoidsProtectedRegions,normalizeProtectedRegions,adaptVideoTextContrast,adaptEndCardComposition} from '../lib/videoAdaptiveLayout.js';
import {renderArtDirectedTypography,buildOfflineAdvertisingBackdrop} from '../lib/videoAdvertisingAssetPipeline.js';
import {composeVideoEndCardLayers} from '../lib/klingEndCard.js';
import {buildVideoOverlayEdit,buildProductPushEdit} from '../lib/shotstack.js';

const canvas=await sharp({create:{width:1080,height:1920,channels:3,background:'#c0dff2'}}).png().toBuffer();
const regions=[{kind:'product',left:350,top:350,width:410,height:750},{kind:'hand',left:310,top:1120,width:120,height:160}];
const crossing=[...regions,{kind:'hand',left:700,top:1260,width:250,height:380}];
const inspection=await inspectVideoComposition({sceneFrames:[canvas,canvas],endCard:canvas,
  openai:{responses:{create:async()=>({output_text:JSON.stringify({images:[{index:0,confidence:.95,regions},{index:1,confidence:.95,regions:crossing},{index:2,confidence:.95,has_embedded_branding:false,regions:[]}]})})}}});
assert(inspection.sceneVerified && inspection.endVerified);
assert.equal(inspection.sceneRegions.length,5,'protect the union, including a moving hand in a later frame');
const picked=await chooseVideoTextBox({frames:[canvas,canvas],protectedRegions:inspection.sceneRegions,preferred:{left:64,top:400,width:900,height:300}});
assert(picked && avoidsProtectedRegions(picked.box,crossing));
assert.equal(normalizeProtectedRegions([{left:.2,top:.3,width:.4,height:.2}])[0].width,432);
assert.equal(await chooseVideoTextBox({frames:[canvas],protectedRegions:[{left:0,top:0,width:1080,height:1920}]}),null);
const unavailable=await inspectVideoComposition({sceneFrames:[canvas],endCard:canvas,openai:{responses:{create:async()=>{throw new Error('timeout');}}}});
assert.equal(unavailable.sceneVerified,false,'unknown scene geometry never permits unverified product overlap');

const exact=await renderArtDirectedTypography({text:'Katten som skjuter skarpt',backgroundBuffer:canvas});
const trimmed=await sharp(exact).trim({background:'#00000000'}).resize({width:800,height:240,fit:'inside'}).png().toBuffer();
const box={left:80,top:1400,width:920,height:280};
const overlay=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}}).composite([{input:trimmed,left:140,top:1430}]).png().toBuffer();
const dark=await sharp({create:{width:1080,height:1920,channels:3,background:'#102030'}}).png().toBuffer();
const scene=await adaptVideoTextContrast({overlay,frames:[dark],box});
const end=await adaptVideoTextContrast({overlay,frames:[canvas],box});
assert.equal(scene.analysis.tone,'light');assert.equal(end.analysis.tone,'dark','same words adapt independently to actual backgrounds');
const mixed=await adaptVideoTextContrast({overlay,frames:[dark,canvas],box});
assert(mixed.analysis.featheredBacking,'mixed moving backgrounds get local contrast support');
const {data}=await sharp(mixed.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(data[(600*1080+400)*4+3],0,'contrast support cannot spill into the protected garment');

const closing=await renderArtDirectedTypography({text:'Upptäck stilen',kind:'cta',backgroundBuffer:canvas});
const layers=await composeVideoEndCardLayers({background:canvas,headlineArtwork:exact,headline:'Katten som skjuter skarpt',closingText:closing,closingLine:'Upptäck stilen',productLabel:'Pew Pew Madafakas',brand:{business_name:'Spreelo'},includeSender:false,preserveDesign:true});
assert.equal(layers.hasSender,false);assert.equal(layers.layout.sender,null);
const corrected=await adaptEndCardComposition({layers,inspection:{endVerified:true,endRegions:[{left:630,top:570,width:450,height:1300}]},quietBackground:()=>buildOfflineAdvertisingBackdrop({brand:{primary_color:'#132237'}})});
assert(avoidsProtectedRegions(corrected.layout.adaptive.box,[{left:630,top:570,width:450,height:1300}]) || corrected.layout.adaptive.backgroundReplaced);
const recovered=await adaptEndCardComposition({layers,inspection:unavailable,quietBackground:()=>buildOfflineAdvertisingBackdrop({brand:{primary_color:'#132237'}})});
assert(recovered.layout.adaptive.backgroundReplaced,'unknown/crowded end card gets a quiet background, no new paid attempt or admin hold');
const safeFrame=await adaptEndCardComposition({layers,inspection:{endVerified:true,endContainsProduct:true,sceneVerified:true,endRegions:regions,sceneRegions:regions},sceneBackground:await sharp(canvas).resize(540,960).png().toBuffer(),quietBackground:()=>buildOfflineAdvertisingBackdrop()});
assert.equal(safeFrame.layout.adaptive.backgroundSource,'quiet_fallback','a generated product on the end card is replaced with a separate designed background');
assert.equal((await sharp(safeFrame.cardBuffer).metadata()).width,1080);

for(const edit of [buildVideoOverlayEdit({videoUrl:'v',textOverlayUrl:'t',logoOverlayUrl:'logo',endCardUrl:'c',endCardIncludesSender:layers.hasSender,durationSeconds:5,closingHoldSeconds:1.5}),buildProductPushEdit({backgroundVideoUrl:'v',productDataUri:'p',logoOverlayUrl:'logo',endCardUrl:'c',endCardIncludesSender:layers.hasSender,durationSeconds:5,closingHoldSeconds:1.5})]){
  const logos=edit.timeline.tracks.flatMap(x=>x.clips).filter(x=>x.asset.src==='logo');assert.equal(logos.length,1);assert.equal(logos[0].length,6.5,'single corner logo remains visible through the closing card');
}

// Optional real-frame QA uses manually identified regions, not a paid provider.
if(process.env.VIDEO_QA_FRAMES){
  const folder=process.env.VIDEO_QA_FRAMES,out=process.env.VIDEO_QA_OUTPUT||folder;
  await fs.mkdir(out,{recursive:true});
  const scenePhoto=await fs.readFile(`${folder}/source-3.50.png`),endPhoto=await fs.readFile(`${folder}/end-background.png`);
  const protectedScene=[{left:350,top:100,width:390,height:340},{left:270,top:410,width:560,height:620},{left:170,top:920,width:150,height:250},{left:700,top:900,width:170,height:240}];
  const candidate=await chooseVideoTextBox({frames:[scenePhoto],protectedRegions:protectedScene});assert(candidate);
  const art=await sharp(exact).trim({background:'#00000000'}).resize({width:candidate.box.width-72,height:candidate.box.height-56,fit:'inside'}).png().toBuffer();
  const am=await sharp(art).metadata();
  const placed=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}}).composite([{input:art,left:Math.round(candidate.box.left+(candidate.box.width-am.width)/2),top:Math.round(candidate.box.top+(candidate.box.height-am.height)/2)}]).png().toBuffer();
  const adjusted=await adaptVideoTextContrast({overlay:placed,frames:[scenePhoto],box:candidate.box});
  await sharp(scenePhoto).resize(1080,1920).composite([{input:adjusted.buffer}]).png().toFile(`${out}/scene.png`);
  const realLayers=await composeVideoEndCardLayers({background:endPhoto,headlineArtwork:exact,headline:'Katten som skjuter skarpt',closingText:closing,closingLine:'Upptäck stilen',productLabel:'Pew Pew Madafakas',brand:{business_name:'Spreelo'},includeSender:false,preserveDesign:true});
  const realCard=await adaptEndCardComposition({layers:realLayers,inspection:{endVerified:true,endRegions:[{left:735,top:515,width:195,height:220},{left:615,top:720,width:465,height:520},{left:570,top:960,width:170,height:300}]},quietBackground:()=>buildOfflineAdvertisingBackdrop({brand:{primary_color:'#132237'}})});
  await fs.writeFile(`${out}/end-card.png`,realCard.cardBuffer);
  console.log('REAL FRAME LAYOUT',JSON.stringify({scene:candidate.box,end:realCard.layout.adaptive}));
}
console.log('PASS 144.361: moving protected regions, actual-background contrast, safe omission/fallback, end-card geometry and single corner logo in both renderers');
