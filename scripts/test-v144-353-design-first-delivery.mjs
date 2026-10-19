import assert from 'node:assert/strict';
import sharp from 'sharp';
import {generateIndependentAdvertisingAssets,ensureExactAdvertisingLettering} from '../lib/videoAdvertisingAssetPipeline.js';
import {composeVideoEndCardLayers} from '../lib/klingEndCard.js';
import {composeCommercialHeadline} from '../lib/videoTypographyPreflight.js';
import {reviewAdvertisingComposition} from '../lib/videoAdvertisingReview.js';
import {buildVideoOverlayEdit} from '../lib/shotstack.js';
import {renderKlingStructuredMotion,motionPlanIsSupported} from '../lib/klingVideoIntelligence.js';

const blank=await sharp({create:{width:1024,height:1536,channels:4,background:'#09172a'}}).png().toBuffer();
let paid=0;
const openai={images:{edit:async()=>{paid++;return {data:[{b64_json:blank.toString('base64')}]};}}};
const params={openai,model:'mock',referenceFiles:[],headline:'UPPTÄCK KRAFTEN',closingLine:'Upptäck nu',
  designDirection:'Dramatic modern gaming blue cyan violet dynamic type',brand:{business_name:'POWER',primary_color:'#151837',secondary_color:'#39C9FA'}};
const generated=await generateIndependentAdvertisingAssets(params);
assert.equal(paid,1,'one bespoke background; no additional paid typography requests');
assert(generated.typographyMode.headline.includes('vector'));
assert(generated.typographyMode.closing.includes('vector'));
let audits=0;
const {audit}=await ensureExactAdvertisingLettering({assets:generated,headline:params.headline,closingLine:params.closingLine,
  verify:async()=>{audits++;return {verified:false}}});
assert.equal(audits,0,'deterministic exact typography needs no additional AI readback');
assert.equal(audit.verified,true);
const card=await composeVideoEndCardLayers({background:generated.endCard,headlineArtwork:generated.headline,
  headline:params.headline,closingText:generated.closingText,closingLine:params.closingLine,
  brand:params.brand,productLabel:'Lenovo Legion 5',hasLogo:false,preserveDesign:true});
assert.equal((await sharp(card.cardBuffer).metadata()).height,1920);
assert((await sharp(card.foregroundBuffer).stats()).channels[3].max>=240);
const box={left:72,top:1250,width:936,height:350};
const tiny=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><text x="90" y="1380" font-size="18" font-family="DejaVu Sans" fill="#FFF">UPPTÄCK KRAFTEN</text></svg>')).png().toBuffer();
const fitted=await composeCommercialHeadline({overlay:tiny,box,text:params.headline,backgroundFrames:[generated.endCard]});
assert.equal(fitted.locallyRebuilt,true);
assert(['visible_artwork_proportional_fit','exact_vector_proportional_fit'].includes(fitted.composition.method));
const sample=await sharp({create:{width:1080,height:1920,channels:3,background:'#202020'}}).png().toBuffer();
const reviewer=issue=>({responses:{create:async()=>({output_text:JSON.stringify({approved:false,issue,reason:'mock issue'})})}});
for(const issue of ['too_small','low_contrast','wrong_alignment','poor_hierarchy']) {
  const result=await reviewAdvertisingComposition({openai:reviewer(issue),frames:[sample],endCard:card.cardBuffer,typographyPreflightPassed:true});
  assert.equal(result.reviewStatus,'creative_advisory',`preflighted ${issue} must not fail rendered customer movie`);
}
for(const issue of ['subject_overlap','stray_graphics','unfinished_end_card']) {
  await assert.rejects(()=>reviewAdvertisingComposition({openai:reviewer(issue),frames:[sample],endCard:card.cardBuffer,typographyPreflightPassed:true}),
    e=>e.code==='VIDEO_ADVERTISING_DESIGN_REJECTED');
}
const timeline=buildVideoOverlayEdit({videoUrl:'https://example.com/kling.mp4',textOverlayUrl:'https://example.com/type.png',endCardUrl:'https://example.com/end.png'});
const source=timeline.timeline.tracks.flatMap(t=>t.clips).find(c=>c.asset?.type==='video');
assert(source?.scale?.[0]?.to>1,'a source-preserving editorial camera move is present');
assert(source.scale[0].to<=1.07);
const intel={physical_subject:{motion_material:'deformable_garment',kind:'physical_product'},confidence:.99};
const plan={mode:'scene_verified_wear',strategy:'human movement',action_id:'',camera_mode:'follow_same_view',environment_motion:'none',
  product_pose:'source_locked',shot_count:1,finish_seconds:5,initial_conditions:[],stationary_objects:[],risk:'low'};
assert(motionPlanIsSupported(plan,intel));
assert.match(renderKlingStructuredMotion(plan,intel),/two or three clearly visible natural walking steps/);
// A provider outage uses the brand-directed background without another paid request.
let rejectedCalls=0;
const unavailable=await generateIndependentAdvertisingAssets({...params,openai:{images:{edit:async()=>{rejectedCalls++;throw new Error('503 Service Unavailable');}}}});
assert.equal(rejectedCalls,1);
assert.equal((await sharp(unavailable.endCard).metadata()).width,1080);
if(process.env.SPREELO_WRITE_TEST_ARTIFACT==='1') await sharp(card.cardBuffer).toFile('/mnt/data/spreelo-144.353-master-endcard-preview.png');
console.log('PASS 144.353: one billed background, exact vector copy, master-frame composition, proportional layout, aesthetic-only advisory, hard safety guard, safe movement, offline backdrop');
