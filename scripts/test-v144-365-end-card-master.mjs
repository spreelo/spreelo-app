import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { buildEndCardMasterPrompt, END_CARD_MASTER_POLICY } from '../lib/videoEndCardMaster.js';
import { generateIndependentAdvertisingAssets, ensureExactAdvertisingLettering } from '../lib/videoAdvertisingAssetPipeline.js';
import { composeVideoEndCardLayers } from '../lib/klingEndCard.js';
import { adaptEndCardComposition } from '../lib/videoAdaptiveLayout.js';
import { buildVideoOverlayEdit, buildProductPushEdit } from '../lib/shotstack.js';

const art=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="lake"><stop stop-color="#10352E"/><stop offset="1" stop-color="#071519"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#lake)"/><path d="M0 1500Q300 1420 600 1540T1080 1510" fill="none" stroke="#A87E46" stroke-width="9"/><text x="120" y="760" font-family="Noto Sans" font-weight="700" font-size="130" fill="#FAF3DF">Nästa kast.</text><text x="120" y="945" font-family="Noto Sans" font-weight="700" font-size="98" fill="#F28B28">Nästa äventyr.</text><text x="180" y="1220" font-family="Noto Sans" font-size="46" fill="#FAF3DF">Hitta ditt nästa fiskespö</text><text x="345" y="1350" font-family="Noto Sans" font-size="36" fill="#FAF3DF">butik.example</text></svg>`)).png().toBuffer();
const reference=[{name:'actual-finished-scene.png'}];
let calls=0,cache,cacheMaster;
const params={model:'fixture',referenceFiles:reference,headline:'Upplev nästa fisketur',closingHeadline:'Nästa kast. Nästa äventyr.',closingLine:'Hitta ditt nästa fiskespö',websiteUrl:'https://butik.example',renderEndCardMaster:true,
 creativeConcept:{campaign_idea:'The anticipation of the next cast',background_brief:'A real forest lake with tactile ripples and warm edge light',typography:'Confident outdoor letterforms, ivory and copper'},
 designDirection:'Observed water and warm reflected light',brand:{business_name:'Verifierad butik'},
 openai:{images:{generate:async(options,request)=>{calls++;assert.equal(options.image,undefined);assert.equal(request.maxRetries,0);assert.equal(options.size,'1024x1536');
   assert(options.prompt.includes('COMPLETE finished advertising END CARD'));assert(options.prompt.includes('Nästa kast. Nästa äventyr.'));assert(options.prompt.includes('Hitta ditt nästa fiskespö'));
   assert(options.prompt.includes('butik.example'));assert(options.prompt.includes('DO NOT draw a logo'));assert(!options.prompt.includes('NO text, letters'));
   assert(options.prompt.includes('one or two lines'));assert(options.prompt.includes('WITHOUT CROPPING'));return {data:[{b64_json:art.toString('base64')}]};},edit:async()=>{throw new Error('Independent ending must not edit the reference scene');}}},
 onBackground:async(buffer,metadata)=>{cache=buffer;cacheMaster=metadata.isMaster;}};
const assets=await generateIndependentAdvertisingAssets(params);
assert.equal(calls,1);assert(cacheMaster);assert(assets.endCardMaster);assert.equal(assets.typographyMode.endCard,'gpt_image_complete_master_v369');
let readbacks=0;
await ensureExactAdvertisingLettering({assets,headline:params.headline,closingLine:params.closingLine,verify:async()=>{readbacks++;throw new Error('No added reviewer');}});
assert.equal(readbacks,0,'scene lettering retains its existing deterministic flow; no new end-card OCR gate');
const cached=await generateIndependentAdvertisingAssets({...params,cachedBackground:cache,cachedMaster:cacheMaster});
assert.equal(calls,1,'cached complete artwork is reused without another image submission');assert.deepEqual(cached.endCardMaster,assets.endCardMaster);

const wrongBackground=await sharp({create:{width:1080,height:1920,channels:3,background:'#FF00FF'}}).png().toBuffer();
const layers=await composeVideoEndCardLayers({background:wrongBackground,masterArtwork:assets.endCardMaster,headline:params.closingHeadline,closingLine:params.closingLine,websiteUrl:params.websiteUrl,brand:params.brand});
assert.equal(layers.layout.policy,END_CARD_MASTER_POLICY);assert(layers.isMaster);assert.equal(layers.hasSender,false);
const before=await sharp(assets.endCardMaster).removeAlpha().raw().toBuffer(),after=await sharp(layers.cardBuffer).removeAlpha().raw().toBuffer();
assert.deepEqual(after,before,'entire background, letterforms and all colors survive composition pixel-for-pixel');
assert.equal((await sharp(layers.foregroundBuffer).stats()).channels[3].max,0,'no duplicate locally typeset text');
const preserved=await adaptEndCardComposition({layers,inspection:{endVerified:false,endContainsProduct:true},quietBackground:()=>{throw new Error('Must not erase lettering with a replacement background');}});
assert.equal(preserved,layers,'complete art is neither recolored nor geometrically rearranged');
for(const edit of [buildVideoOverlayEdit({videoUrl:'video',textOverlayUrl:'scene-text',logoOverlayUrl:'logo',endCardUrl:'complete-card',endCardBackgroundUrl:'legacy-background',endCardTextUrl:'empty-layer',endCardIsMaster:true,endCardIncludesSender:false,durationSeconds:5,closingHoldSeconds:2}),
 buildProductPushEdit({backgroundVideoUrl:'video',productDataUri:'product',logoOverlayUrl:'logo',endCardUrl:'complete-card',endCardBackgroundUrl:'legacy-background',endCardTextUrl:'empty-layer',endCardIsMaster:true,endCardIncludesSender:false,durationSeconds:5,closingHoldSeconds:2})]){
 const clips=edit.timeline.tracks.flatMap(t=>t.clips),card=clips.filter(c=>c.asset.src==='complete-card'),logo=clips.filter(c=>c.asset.src==='logo');
 assert.equal(card.length,1);assert.equal(card[0].fit,'none');assert.equal(card[0].width,1080);assert.equal(card[0].height,1920);assert(!card[0].scale,'lettering remains still with the complete image');
 assert(!clips.some(c=>['legacy-background','empty-layer'].includes(c.asset.src)),'never overlay old layers on the finished artwork');
 assert.equal(logo.length,1);assert.equal(logo[0].length,7);assert.equal(card[0].start+card[0].length,7);
}

// A completed image still uses the existing safe outcome when the provider is
// unavailable; the cached plain fallback must never be mistaken for lettered art.
let outages=0,fallbackCache,fallbackIsMaster;
const failed=await generateIndependentAdvertisingAssets({...params,openai:{images:{generate:async()=>{outages++;throw new Error('timeout');},edit:async()=>{throw new Error('duplicate request');}}},
 onBackground:async(buffer,metadata)=>{fallbackCache=buffer;fallbackIsMaster=metadata.isMaster;}});
assert.equal(outages,1);assert.equal(fallbackIsMaster,false);assert.equal(failed.endCardMaster,null);
const resumed=await generateIndependentAdvertisingAssets({...params,cachedBackground:fallbackCache,cachedMaster:fallbackIsMaster});
assert.equal(resumed.endCardMaster,null);assert.equal(calls,1);
const legacy=await composeVideoEndCardLayers({background:failed.endCard,headline:params.closingHeadline,closingLine:params.closingLine,layoutPolicy:'dominant_v363',websiteUrl:params.websiteUrl});
assert.equal(legacy.layout.policy,'dominant_v363');assert((await sharp(legacy.foregroundBuffer).stats()).channels[3].max>200);

// Existing unmarked saved artwork remains a legacy composition, not an empty
// new-style card. No extra API call or creative failure is introduced.
const old=await generateIndependentAdvertisingAssets({...params,cachedBackground:art,cachedMaster:false});assert.equal(old.endCardMaster,null);assert.equal(calls,1);
for(const item of [{headline:'Lek med uttrycket',closingLine:'Hitta din favorit',creativeConcept:{audience_motivation:'Playful personal expression'}},{headline:'Plats för nästa idé',closingLine:'Se modellen',creativeConcept:{audience_motivation:'Focused professional work'}}]){
 const prompt=buildEndCardMasterPrompt({...item,websiteUrl:'https://butik.example'});assert(prompt.includes(item.headline));assert(prompt.includes(item.closingLine));assert(prompt.includes('letterforms freely'));assert(!prompt.includes('Nästa kast'));
}
if(process.env.VIDEO_QA_OUTPUT){fs.mkdirSync(process.env.VIDEO_QA_OUTPUT,{recursive:true});fs.writeFileSync(`${process.env.VIDEO_QA_OUTPUT}/complete-card.png`,layers.cardBuffer);}
console.log('PASS 144.365: one complete GPT Image end card, exact artwork/color preservation, no duplicate type/logo or new OCR, static final image in both timelines, cached complete/legacy/fallback assets and no billable retry');
