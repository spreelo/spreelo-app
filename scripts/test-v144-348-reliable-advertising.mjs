import assert from 'node:assert/strict';
import sharp from 'sharp';
import {generateIndependentAdvertisingAssets,renderArtDirectedTypography,inspectIndependentTypography,ensureExactAdvertisingLettering} from '../lib/videoAdvertisingAssetPipeline.js';
import {explicitCollectionScope,restrictToExplicitCollection} from '../lib/storeMapCollectionScope.js';

const opaque=await sharp({create:{width:1536,height:1024,channels:4,background:'#ddddddff'}}).png().toBuffer();
const background=await sharp({create:{width:1024,height:1536,channels:4,background:'#18243cff'}}).png().toBuffer();
const validTypography=await renderArtDirectedTypography({text:'Skapa en känsla',designDirection:'strong contrasted elegant',kind:'headline'});
assert.equal((await inspectIndependentTypography(opaque)).valid,false,'an opaque block is invalid');
assert.equal((await inspectIndependentTypography(validTypography)).valid,true,'actual letterforms pass');
const prompts=[],fakeOpenai={images:{edit:async ({prompt,background:requestedBackground},args)=>{
  assert.equal(args.maxRetries,0,'the SDK must not silently retry paid calls');
  prompts.push(prompt);
  return {data:[{b64_json:(requestedBackground==='opaque'?background:opaque).toString('base64')}]};
}}};
const output=await generateIndependentAdvertisingAssets({
  openai:fakeOpenai,model:'mock-image',referenceFiles:['reference'],
  headline:'Gör ditt rum personligt',closingLine:'Upptäck kollektionen',
  designDirection:'elegant editorial precise centered Swedish sans-serif with lilac and navy palette',
  brand:{business_name:'Testbolaget',primary_color:'#6851A8'},
});
assert.equal(prompts.length,3,'separate background, headline and CTA');
assert.equal(output.typographyMode.headline,'ai_brief_vector_recovery');
assert.equal(output.typographyMode.closing,'ai_brief_vector_recovery');
assert.equal((await inspectIndependentTypography(output.headline)).valid,true,'headline has valid actual transparency');
assert.equal((await inspectIndependentTypography(output.closingText)).valid,true,'CTA has valid actual transparency');
assert.equal((await sharp(output.endCard).metadata()).height,1920);
let reads=0;
const readback=await ensureExactAdvertisingLettering({
  assets:{...output,headline:validTypography,closingText:validTypography},
  headline:'Gör ditt rum personligt',closingLine:'Upptäck kollektionen',
  designDirection:'elegant strong editorial',brand:{business_name:'Testbolaget'},
  verify:async(main,closing)=>{reads++;if(reads===1)throw new Error('Animation typography did not reproduce the exact locked advertising headline; missing, changed or extra wording');return {verified:true};},
});
assert.equal(reads,2,'known misspelling corrected and reviewed, not silently accepted');
assert.equal(readback.assets.typographyMode.headline,'ai_brief_exact_word_recovery');
assert.equal((await inspectIndependentTypography(readback.assets.headline)).valid,true);
let unavailableReviews=0;
await assert.rejects(ensureExactAdvertisingLettering({assets:output,headline:'A',closingLine:'B',verify:async()=>{unavailableReviews++;throw new Error('model service down');}}),/service down/);
assert.equal(unavailableReviews,1,'unavailable reviewer must not be misclassified as creative defect');

assert.match(prompts[0],/BACKGROUND/);
assert.match(prompts[1],/MAIN REEL HEADLINE/);
assert.match(prompts[2],/CLOSING CTA/);
assert.ok((await sharp(output.headline).stats()).channels[3].max>0);
assert.equal(explicitCollectionScope('https://pressit.se/collections/t-shirts'),'https://pressit.se/collections/t-shirts');
assert.deepEqual(restrictToExplicitCollection([
  {url:'https://pressit.se/collections/t-shirts'},
  {url:'https://pressit.se/collections/posters'}
],'https://pressit.se/collections/t-shirts').map(s=>s.url),['https://pressit.se/collections/t-shirts']);
assert.equal(restrictToExplicitCollection([{url:'https://pressit.se/collections/posters'}],'https://pressit.se/').length,1);
let calls=0;
try {await generateIndependentAdvertisingAssets({
 openai:{images:{edit:async()=>{calls++;throw Object.assign(new Error('Unknown transport timeout'),{code:'ETIMEDOUT'});}}},
 model:'mock',referenceFiles:['reference'],headline:'Kort rubrik',closingLine:'Läs mer',
});assert.fail('should fail');}catch(err){assert.match(err.message,/timeout/i);assert.equal(calls,1,'must not re-send an unknown billable request');}
console.log('PASS v144.348: independent art assets, known invalid alpha repaired, exact words, collection scope, no unknown retries');
