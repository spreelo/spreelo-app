import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fitEndCardMasterArtwork,buildEndCardMasterPrompt,composeEndCardMaster,END_CARD_MASTER_POLICY} from '../lib/videoEndCardMaster.js';
import {generateIndependentAdvertisingAssets,ensureExactAdvertisingLettering} from '../lib/videoAdvertisingAssetPipeline.js';
import {composeVideoEndCardLayers} from '../lib/klingEndCard.js';
import {adaptEndCardComposition} from '../lib/videoAdaptiveLayout.js';
import {buildVideoOverlayEdit,buildProductPushEdit} from '../lib/shotstack.js';
import {COMMERCIAL_CONCEPT_BRIEF,COMMERCIAL_CONCEPT_SCHEMA,normalizeCommercialConcept} from '../lib/videoCommercialConcept.js';

// Reproduce the actual 1024x1536 provider -> 1080x1920 delivery mismatch.
// Deliberately place colored letter-edge markers at BOTH image edges: the old
// cover resize destroyed them. Their whole pixels must survive BOTH real
// pipeline stages, even when the model ignores its requested safe margins.
const source=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536">
<rect width="1024" height="1536" fill="#254458"/>
<rect x="0" y="420" width="32" height="700" fill="#FF0000"/>
<rect x="992" y="420" width="32" height="700" fill="#00FF00"/>
<text x="40" y="760" font-family="Noto Sans" font-weight="700" font-size="100" fill="#FFFFFF">Bär din stolthet</text>
<text x="40" y="940" font-family="Noto Sans" font-size="48" fill="#FFFFFF">Hitta din favorit</text>
</svg>`)).png().toBuffer();
const fitted=await fitEndCardMasterArtwork(source);
const {data,info}=await sharp(fitted).removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(info.width,1080);assert.equal(info.height,1920);
const pixel=(x,y)=>[...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
assert.deepEqual(pixel(0,960),[255,0,0]);assert.deepEqual(pixel(1079,960),[0,255,0]);
const expected=await sharp(source).resize(1080,1620).removeAlpha().raw().toBuffer();
const recovered=await sharp(fitted).extract({left:0,top:150,width:1080,height:1620}).removeAlpha().raw().toBuffer();
assert.deepEqual(recovered,expected,'entire fitted image and every letter-edge pixel survive; only the outer canvas is extended');
const old=await sharp(source).resize(1080,1920,{fit:'cover'}).removeAlpha().raw().toBuffer();
assert.notDeepEqual(old,data,'fixture must detect the old destructive resize');
assert.deepEqual(await sharp(await fitEndCardMasterArtwork(fitted)).raw().toBuffer(),await sharp(fitted).raw().toBuffer(),'already fitted cached master is pixel-identical, not rescaled repeatedly');

// Every image shape fits without a new AI request or a creative rejection.
for(const [width,height] of [[1080,1920],[1024,1024],[1536,1024]]){
 const image=await sharp({create:{width,height,channels:3,background:'#123456'}}).png().toBuffer();
 const result=await fitEndCardMasterArtwork(image);const metadata=await sharp(result).metadata();
 assert.equal(metadata.width,1080);assert.equal(metadata.height,1920);
}

let calls=0,cache,cacheMetadata;
const params={model:'offline-fixture',referenceFiles:[{name:'actual-wearer-scene.png'},{name:'verified-product.png'}],
 headline:'Stolt Malmöstil',closingHeadline:'Bär Malmö med stolthet',closingLine:'Shoppa din Malmötröja',websiteUrl:'https://pressit.se',renderEndCardMaster:true,
 creativeConcept:{campaign_idea:'Express local pride',background_brief:'An environment-led city poster, no repeated wearer; calm centered words',typography:'Strong white and blue letterforms with high contrast'},
 brand:{business_name:'Verified retailer',content_language:'Swedish'},
 openai:{images:{generate:async(options,request)=>{
  calls++;assert.equal(options.image,undefined,'fresh environment generation is not anchored to the wearer image');assert.equal(request.maxRetries,0);assert.equal(options.size,'1024x1536');
  for(const required of ['INDEPENDENT CLOSING IDEA','person, wearer, pose','distinct persuasive purpose','CENTERED','EVERY line','WITHOUT CROPPING','90 pixels','Shoppa din Malmötröja','DO NOT draw a logo'])assert(options.prompt.includes(required),required);
  assert(!options.prompt.includes('CENTER-CROPPED'));return {data:[{b64_json:source.toString('base64')}]};
 },edit:async()=>{throw new Error('Independent ending must not edit the wearer frame');}}},
 onBackground:async(buffer,metadata)=>{cache=buffer;cacheMetadata=metadata;}};
const assets=await generateIndependentAdvertisingAssets(params);
assert.equal(calls,1);assert(cacheMetadata.isMaster);assert.deepEqual(cache,source,'cache saves the uncropped provider image');
assert.equal(assets.backgroundReferenceMode,'independent_concept_brief');assert.equal(assets.backgroundReferenceCount,0);
assert.deepEqual(await sharp(assets.endCardMaster).raw().toBuffer(),await sharp(fitted).raw().toBuffer(),'first pipeline stage does not crop the complete artwork');
let reviewers=0;await ensureExactAdvertisingLettering({assets,headline:params.headline,closingLine:params.closingLine,verify:async()=>{reviewers++;throw new Error('No new OCR/review');}});assert.equal(reviewers,0);
const layers=await composeVideoEndCardLayers({masterArtwork:assets.endCardMaster,headline:params.closingHeadline,closingLine:params.closingLine,websiteUrl:params.websiteUrl});
assert.equal(layers.layout.policy,END_CARD_MASTER_POLICY);assert.equal(layers.isMaster,true);
assert.deepEqual(await sharp(layers.cardBuffer).raw().toBuffer(),await sharp(fitted).raw().toBuffer(),'second real compositor preserves the entire already-fitted image');
assert.equal((await sharp(layers.foregroundBuffer).stats()).channels[3].max,0,'no duplicate locally typeset text');
assert.equal(await adaptEndCardComposition({layers,inspection:{endVerified:false,endContainsProduct:true},quietBackground:()=>{throw new Error('No replacement backdrop over artwork');}}),layers);
const resumed=await generateIndependentAdvertisingAssets({...params,cachedBackground:cache,cachedMaster:true});assert.equal(calls,1);assert.deepEqual(resumed.endCardMaster,assets.endCardMaster);
const composedRaw=await composeEndCardMaster({artwork:cache,headline:params.closingHeadline,closingLine:params.closingLine});
assert.deepEqual(await sharp(composedRaw.cardBuffer).raw().toBuffer(),await sharp(fitted).raw().toBuffer(),'raw cached masters also fit safely when sent straight to the compositor');

// No category recipe, named city, example slogan or per-language word patch in
// production instructions. Same schema/call handles unrelated real contexts.
for(const item of [
 {headline:'Nästa äventyr väntar',closingLine:'Hitta ditt fiskespö',creativeConcept:{background_brief:'A still forest lake with mist and calm central space'}},
 {headline:'Plats för nya idéer',closingLine:'Se datorerna',creativeConcept:{background_brief:'A precise architectural workspace, no repeated demonstrator'}},
 {headline:'Redo för dagens lek',closingLine:'Hitta barnens favoriter',creativeConcept:{background_brief:'A tactile playful environment, no repeated model'}},
 {headline:'Ein Moment für dich',closingLine:'Buche deinen Termin',creativeConcept:{background_brief:'Warm stone and soft side light for the verified service'}},
]){
 const prompt=buildEndCardMasterPrompt(item);assert(prompt.includes(item.headline));assert(prompt.includes(item.closingLine));assert(prompt.includes(item.creativeConcept.background_brief));
 assert(!prompt.includes('Malmö'));assert(!prompt.includes('pressit'));assert(!prompt.includes('Nästa kast'));
}
assert(COMMERCIAL_CONCEPT_BRIEF.includes('ONE image: product, background and lettering'));
assert(COMMERCIAL_CONCEPT_BRIEF.includes('short product-specific action'));assert(COMMERCIAL_CONCEPT_BRIEF.includes("customer's language"));
assert.deepEqual(Object.keys(COMMERCIAL_CONCEPT_SCHEMA.properties),Object.keys(normalizeCommercialConcept(null)));
assert.equal(normalizeCommercialConcept({campaign_idea:'Legacy six-field concept'}).closing_subject,'environment','old plans use the independent route without a review/error');
assert.equal(normalizeCommercialConcept({closing_subject:'person_or_product'}).closing_subject,'environment','missing reason chooses the default, never rejects a run');
let referenceCalls=0;
const intentional=await generateIndependentAdvertisingAssets({...params,creativeConcept:{...params.creativeConcept,closing_subject:'person_or_product',closing_subject_reason:'The verified service is a meeting with this named professional; their identity is the final invitation'},
 openai:{images:{edit:async(options)=>{referenceCalls++;assert.equal(options.image,params.referenceFiles);assert(options.prompt.includes('named professional'));return {data:[{b64_json:source.toString('base64')}]};},generate:async()=>{throw new Error('Explicit identity reference should be preserved');}}}});
assert.equal(referenceCalls,1);assert.equal(intentional.backgroundReferenceMode,'scene_references');assert.equal(intentional.backgroundReferenceCount,2);
let failedGeneration=0,unwantedEdit=0;
const outage=await generateIndependentAdvertisingAssets({...params,openai:{images:{generate:async()=>{failedGeneration++;throw new Error('provider timeout');},edit:async()=>{unwantedEdit++;throw new Error('No paid fallback');}}}});
assert.equal(failedGeneration,1);assert.equal(unwantedEdit,0);assert.equal(outage.endCardMaster,null);assert.equal(outage.backgroundSource,'designed_fallback');

for(const edit of [buildVideoOverlayEdit({videoUrl:'scene',textOverlayUrl:'headline',endCardUrl:'complete-card',endCardIsMaster:true,logoOverlayUrl:'logo',durationSeconds:5,closingHoldSeconds:2}),
 buildProductPushEdit({backgroundVideoUrl:'scene',productDataUri:'product',endCardUrl:'complete-card',endCardIsMaster:true,logoOverlayUrl:'logo',durationSeconds:5,closingHoldSeconds:2})]){
 const clips=edit.timeline.tracks.flatMap(t=>t.clips),card=clips.filter(c=>c.asset.src==='complete-card');
 assert.equal(card.length,1);assert.equal(card[0].fit,'none');assert.equal(card[0].width,1080);assert.equal(card[0].height,1920);assert(!card[0].scale);
 assert.equal(card[0].start+card[0].length,7,'existing transition plus two-second ending retain the seven-second timeline');assert.equal(clips.filter(c=>c.asset.src==='logo').length,1);
}
console.log('PASS 144.368: real portrait mismatch preserves both letter edges through pipeline/compositor/cache; independent environment-led prompts and natural action copy; one image request, no OCR gate, single corner logo and static full-card delivery in video and animation');
