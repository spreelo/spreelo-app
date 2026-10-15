import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {prepareSafeProductCutout} from '../lib/productCutout.js';
import {calculateAnimatedProductLayout} from '../lib/animatedProductLayout.js';
import {buildProductPushEdit,buildVideoOverlayEdit,buildMovingEndCardTracks} from '../lib/shotstack.js';
import {composeVideoEndCardLayers,centerClosingLettering,buildKlingAdvertisingAtlasPrompt,splitKlingAdvertisingAtlas} from '../lib/klingEndCard.js';
import {ensureTypographyContrast,inspectTypographyShape} from '../lib/animatedTypographyQuality.js';
import {sceneSafeKlingLayout,normalizeKlingLayout,klingTypographyGeometry} from '../lib/klingLayout.js';
import {planAnimatedAdvertisingCopy,verifyAnimatedAdvertisingTypography} from '../lib/animatedAdvertisingCopy.js';
import {VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,videoSenderLabel} from '../lib/videoArtDirection.js';
const svg=s=>sharp(Buffer.from(s)).png().toBuffer();
const raw=buffer=>sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const pixel=async(buffer,x,y)=>{const {data,info}=await raw(buffer);return [...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)];};
const source=fs.readFileSync('scripts/fixtures/v144-342-keyboard-source.png');
const prepared=await prepareSafeProductCutout(source);
assert.equal(prepared.analysis.mode,'existing_transparency');
const originalCrop=await sharp(source).extract(prepared.analysis.sourceBounds).ensureAlpha().raw().toBuffer();
assert.deepEqual((await raw(prepared.cutoutBuffer)).data,originalCrop,'Existing opaque product, fine edges and alpha must remain pixel-identical');
for(const buffer of [await sharp(source).flatten({background:'#fff'}).png().toBuffer(),await sharp(source).flatten({background:'#fff'}).jpeg({quality:92}).toBuffer()]){
 const result=await prepareSafeProductCutout(buffer),b=result.analysis.sourceBounds;
 for(const [x,y] of [[130,455],[600,600],[610,745],[1020,650]]) assert.equal((await pixel(result.cutoutBuffer,x-b.left,y-b.top))[3],255,'White keys and silver surfaces cannot be removed');
 assert(result.analysis.protectedProductPixels>100000);
}
// Existing real holes, antialiasing and genuinely translucent material.
const glass=await svg('<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg"><rect x="95" y="70" width="310" height="350" rx="25" fill="#77aacc" fill-opacity=".4" stroke="#183144" stroke-width="8"/><circle cx="250" cy="260" r="40" fill="black"/></svg>');
const transparent=await prepareSafeProductCutout(glass);
assert.deepEqual((await raw(transparent.cutoutBuffer)).data,await sharp(glass).extract(transparent.analysis.sourceBounds).ensureAlpha().raw().toBuffer());
for(const background of ['#ffffff','#edf0f2','#aabbcc']) {
 const item=await svg(`<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="600" fill="${background}"/><rect x="180" y="100" width="240" height="380" rx="24" fill="#181f2a"/><path d="M180 170 L110 160 L80 320" stroke="#181f2a" stroke-width="5" fill="none"/><rect x="220" y="170" width="80" height="120" fill="#ffffff"/></svg>`);
 const r=await prepareSafeProductCutout(item),b=r.analysis.sourceBounds;
 assert.equal((await pixel(r.cutoutBuffer,250-b.left,250-b.top))[3],255);
 assert.equal((await pixel(r.cutoutBuffer,110-b.left,160-b.top))[3],255,'Fine wire must remain');
 assert.equal((await pixel(r.cutoutBuffer,0,0))[3],0);
}
const ring=await svg('<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="600" fill="white"/><circle cx="300" cy="300" r="180" fill="#303030"/><circle cx="300" cy="300" r="130" fill="white"/></svg>');
await assert.rejects(prepareSafeProductCutout(ring),/ambiguous/,'Ambiguous enclosed background must take the existing semantic path, never be guessed');
console.log('PASS: real keyboard alpha/JPEG, opaque white/silver surfaces, exact source-alpha preservation, translucent edges, fine wires and ambiguous apertures');

// Unequal line lengths and asymmetric canvas margins must center individually.
const cta=await svg('<svg width="1000" height="280" xmlns="http://www.w3.org/2000/svg"><text x="50" y="105" font-family="DejaVu Sans" font-size="78" font-weight="600" fill="#bbddff">UPPTÄCK</text><text x="20" y="225" font-family="DejaVu Sans" font-size="68" font-weight="600" fill="#bbddff">GAMINGKRAFTEN NU</text></svg>');
const centered=await centerClosingLettering(cta),c=await raw(centered);
for(const [top,bottom] of [[0,Math.floor(c.info.height/2)],[Math.floor(c.info.height/2),c.info.height]]) {
 let lo=c.info.width,hi=-1;
 for(let y=top;y<bottom;y++)for(let x=0;x<c.info.width;x++)if(c.data[(y*c.info.width+x)*4+3]>180){lo=Math.min(lo,x);hi=Math.max(hi,x);}
 assert(Math.abs((lo+hi)/2-464.5)<=1,'Every CTA line must be centered');
}
const bg=await svg('<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="#071626"/><stop offset="1" stop-color="#252347"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><path d="M0 1600L1080 1300" stroke="#59dbed" stroke-width="4" opacity=".3"/></svg>');
const logo=await svg('<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="80" fill="#e33130"/></svg>');
const noLogo=await composeVideoEndCardLayers({background:bg,closingText:cta,closingLine:'Upptäck gamingkraften nu',brand:{business_name:'POWER'},language:'sv'});
const withLogo=await composeVideoEndCardLayers({background:bg,closingText:cta,brand:{business_name:'POWER'},logoBuffer:logo,language:'sv'});
assert.equal((await pixel(withLogo.foregroundBuffer,100,220))[3],0,'No baked/duplicated logo');
assert.equal((await pixel(withLogo.foregroundBuffer,540,650))[3],0,'No isolated sender above CTA');
assert.equal(videoSenderLabel('POWER','sv'),'Hos POWER');
assert.equal(videoSenderLabel('POWER','en'),'At POWER');
fs.mkdirSync('test-output-v342',{recursive:true});
await sharp(noLogo.cardBuffer).toFile('test-output-v342/end-card-no-logo.png');
await sharp(withLogo.cardBuffer).composite([{input:logo,left:78,top:207}]).toFile('test-output-v342/end-card-logo.png');

for(const builder of [buildProductPushEdit,buildVideoOverlayEdit]){
 const edit=builder({backgroundVideoUrl:'background',productDataUri:'data:image/png;base64,AAAA',videoUrl:'video',textOverlayUrl:'headline',logoOverlayUrl:'logo',durationSeconds:5,
 animationLayout:calculateAnimatedProductLayout(1000,400),closingHoldSeconds:1.5,endCardUrl:'card',endCardBackgroundUrl:'end-bg',endCardTextUrl:'end-text',musicUrl:'music',musicDurationSeconds:30});
 const tracks=edit.timeline.tracks,clips=tracks.flatMap(t=>t.clips),find=src=>clips.find(c=>c.asset.src===src);
 assert.equal(find('logo').length,6.5);
 assert(tracks.indexOf(tracks.find(t=>t.clips.includes(find('logo'))))<tracks.indexOf(tracks.find(t=>t.clips.includes(find('end-bg')))));
 assert.equal(find('end-bg').start,4.6);assert.equal(find('end-bg').start+find('end-bg').length,6.5);
 assert(find('end-bg').scale[0].to>1);assert.equal(find('end-text').scale,undefined,'Centered typography must not move');
 assert.equal(find('headline').start+find('headline').length,4.6);
 if(builder===buildProductPushEdit) assert.equal(clips.find(c=>c.asset.type==='html5').length,5,'Product motion ends inside dissolve, no frozen tail');
 assert(!clips.some(c=>c.asset.src==='card'),'Separate moving background and fixed foreground used');
}
const corrected=await ensureTypographyContrast({overlayBuffer:await svg('<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><text x="100" y="450" font-size="90" fill="white">Readable</text></svg>'),backgroundBuffers:[await sharp({create:{width:1080,height:1920,channels:4,background:'#f3efe9'}}).png().toBuffer()],textBox:{left:64,top:340,width:820,height:240}});
assert.equal(corrected.analysis.outlineColor,null,'Calm scene gets color correction without outline');
const safe=sceneSafeKlingLayout(normalizeKlingLayout({left:64,top:1160,width:720,height:340},null,.99),[{left:290,top:480,width:665,height:1080}]);
assert(safe.top+safe.height<=468,'Dreame text moves to free upper wall');
const layout=calculateAnimatedProductLayout(1056,409);assert(layout.text.top+layout.text.height<layout.product.top);assert(layout.text.top>=350);
console.log('PASS: individually centered CTA lines, cohesive sender group, no central logo, persistent top corner, moving background, stable text, no frozen tail, scene exclusion and clean contrast');

const requests=[];
let reply={headline:'Frihet och precision',printed_text:'',independent_message:true,supported:true,closing_line:'Upptäck ditt nästa tangentbord',closing_supported:true,design_direction:'Crisp technical lettering, airy main phrase, restrained cyan detail'};
const fakeAi={responses:{create:async request=>{requests.push(request);return {output_text:JSON.stringify(reply)};}}};
const copy=await planAnimatedAdvertisingCopy({openai:fakeAi,model:'offline',rule:{language:'sv',website_item:{title:'TKL keyboard'}},postContent:'Gaming',productReferenceBuffer:source});
assert.equal(copy.closingLine,reply.closing_line);assert(requests[0].input[0].content[0].text.includes(VIDEO_ART_DIRECTION));
reply={...reply,closing_supported:false};await assert.rejects(planAnimatedAdvertisingCopy({openai:fakeAi,model:'offline',rule:{}}),/supported/);
reply={visible_text:'Frihet och precision Upptäck ditt nästa tangentbord',legible:true};
await verifyAnimatedAdvertisingTypography({openai:fakeAi,model:'offline',buffer:cta,headline:copy.headline,closingBuffer:cta,closingLine:copy.closingLine});
assert.equal(requests.at(-1).input[0].content.filter(c=>c.type==='input_image').length,2,'Read headline and CTA independently in same verification call');
reply={visible_text:'Frihet och precision',legible:true};await assert.rejects(verifyAnimatedAdvertisingTypography({openai:fakeAi,model:'offline',buffer:cta,headline:copy.headline,closingBuffer:cta,closingLine:copy.closingLine}),/exact locked/);
console.log('PASS: supported language-locked CTA and copy, unified direction and independent exact readback without another review call');

// Exercise the actual animation atlas orchestration with mocked providers.
const route=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const crop=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const title=await svg('<svg width="840" height="300" xmlns="http://www.w3.org/2000/svg"><text x="40" y="150" font-size="90" font-family="DejaVu Sans" fill="#e5f3ff">Frihet och precision</text></svg>');
const atlas=await sharp({create:{width:1536,height:1024,channels:4,background:'#00000000'}}).composite([{input:await sharp(bg).resize(576,1024).toBuffer(),left:0,top:0},{input:title,left:636,top:90},{input:await sharp(cta).resize({width:840,height:220,fit:'inside'}).toBuffer(),left:636,top:700}]).png().toBuffer();
let imageCalls=0;
const ctx={Buffer,sharp,console,VIDEO_ART_DIRECTION,VIDEO_DESIGN_VERSION,ANIMATED_VIDEO_MOTION_SECONDS:5,PRODUCT_RESEARCH_FAST_MODEL:'offline',ANIMATED_OVERLAY_IMAGE_MODEL:'offline',
 getAnimatedOverlayBackgroundReference:async()=>bg,planAnimatedAdvertisingCopy:async()=>copy,buildKlingAdvertisingAtlasPrompt,splitKlingAdvertisingAtlas,composeVideoEndCardLayers,
 sampleRemoteVideoFrames:async()=>[{buffer:bg}],toFile:async b=>b,animatedOverlayImageModel:()=> 'offline',ensureTypographyContrast,inspectTypographyShape,
 verifyAnimatedAdvertisingTypography:async args=>{assert(args.closingBuffer);assert.equal(args.closingLine,copy.closingLine);return {verified:true};},
 composedAdvertisingSceneFrames:async()=>[bg],reviewAdvertisingComposition:async()=>({approved:true,issue:'none'})};
vm.runInNewContext(crop(route,'async function normalizeGeneratedAnimatedTextPanel(','\nfunction cleanKlingOverlayTextLine(')+'\n'+crop(route,'async function createAnimatedTextOverlay(','\nasync function createAnimatedProductLayer(')+'\nthis.create=createAnimatedTextOverlay;',ctx);
const args={openai:{images:{edit:async request=>{imageCalls++;assert.equal(request.size,'1536x1024');return{data:[{b64_json:atlas.toString('base64')}]};}}},rule:{language:'sv',brand_profile:{business_name:'POWER'}},productReferenceBuffer:prepared.cutoutBuffer,animationLayout:layout};
const result=await ctx.create(args);assert(result.closingTextBuffer&&result.closingCardBuffer);assert.equal(imageCalls,1,'Headline/end card share ONE image generation');
const poster=await sharp(bg).composite([{input:await sharp(prepared.cutoutBuffer).resize(layout.product.width,layout.product.height).toBuffer(),left:layout.product.left,top:layout.product.top},{input:result.textOverlayBuffer}]).png().toBuffer();
await sharp(poster).toFile('test-output-v342/animation-composition.png');
assert.equal(route.match(/KLING_TEXT_OVERLAY_START_SECONDS \|\| ([0-9.]+)/)?.[1],'1.5');
const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');assert(finalizer.includes('protected_regions'));assert(finalizer.includes('endCardBackgroundUrl: postprocess.end_card_background_url'));
console.log('PASS: actual animation orchestration, final-composition references, shared atlas, complete saved end-card assets and retained no-substitute failure behavior');

// The three end-card assets must have distinct storage identities: otherwise
// later uploads overwrite the full card/background with the transparent text.
const stored=[];
const storageDb={storage:{from:()=>({upload:async(path,buffer)=>{stored.push({path,buffer});return{};},getPublicUrl:path=>({data:{publicUrl:`https://fixture.test/${path}`}})})}};
const uploadCtx={POST_IMAGES_BUCKET:'post-images',Error};
vm.runInNewContext(crop(finalizer,'async function uploadKlingEndCardFrame(','\nasync function uploadRejectedKlingTypographyOverlay(')+'\nthis.upload=uploadKlingEndCardFrame;',uploadCtx);
const post={id:'post',user_id:'user'};
for(const [suffix,buffer] of [['kling-end-card',noLogo.cardBuffer],['kling-end-background',noLogo.backgroundBuffer],['kling-end-text',noLogo.foregroundBuffer]]) await uploadCtx.upload({supabase:storageDb,post,buffer,suffix});
assert.equal(new Set(stored.map(s=>s.path)).size,3);
assert(stored.every(s=>s.path.endsWith('-v342.png')));

// Actual finished-Kling single-image orchestration persists all three assets
// once, then reuses them during finalizer continuation.
let klingCalls=0;
const writes=[];
const db={...storageDb,from:()=>{const q={update:d=>{writes.push(d);return q;},eq:()=>q,then:resolve=>resolve({})};return q;}};
const kc={Buffer,sharp,console,Date,Math,Number,String,Error,VIDEO_DESIGN_VERSION,KLING_FINALIZATION_LEASE_MS:360000,KLING_TYPOGRAPHY_MODEL:'offline',KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'offline',KLING_END_CARD_SECONDS:1.5,
 normalizeVideoDurationSeconds:()=>5,getKlingTextFrameFractions:()=>[.3,.8],sampleRemoteVideoFrames:async()=>[{buffer:bg}],
 planFinishedKlingAdvertisingCreative:async()=>({headline:'Frihet och precision',subheadline:'',cta:'Upptäck gamingkraften nu',main_placement:'top_left',main_layout:{left:80,top:340,width:820,height:240,preferredScale:.96,alignment:'center'},design_direction:'Gaming, cool light'}),
 buildKlingAdvertisingAtlasPrompt,splitKlingAdvertisingAtlas,composeVideoEndCardLayers,ensureTypographyContrast,normalizeKlingLayout,klingTypographyGeometry,
 composedAdvertisingSceneFrames:async()=>[bg],reviewAdvertisingComposition:async()=>({approved:true,issue:'none'}),verifyAnimatedAdvertisingTypography:async()=>({verified:true}),
 normalizeFinishedKlingTypography:async b=>({buffer:b,visibleRatio:.1,strongRatio:.1,edgeRatio:0}),uploadKlingEndCardFrame:uploadCtx.upload,toFile:async b=>b,
 uploadKlingTypographyOverlay:async()=>({imageUrl:'https://fixture.test/headline',storagePath:'headline'}),getFallbackKlingCta:()=> 'Upptäck gamingkraften nu',truncate:s=>s,
 createDeterministicKlingTypographyFallback:async()=>{throw new Error('Unexpected fallback during valid Kling atlas test');}};
vm.runInNewContext(crop(finalizer,'async function placeFinishedKlingTypographyInSafeArea(','\nasync function extractVisibleTypographyBand(')+'\n'+crop(finalizer,'async function createFinishedKlingTypographyOnce(','\nasync function ensureKlingClosingHeroFrame(')+'\nthis.create=createFinishedKlingTypographyOnce;',kc);
const klingArgs={openai:{images:{edit:async()=>{klingCalls++;return{data:[{b64_json:atlas.toString('base64')}]};}}},supabase:db,post:{...post,language:'sv'},task:{durationSeconds:5},selection:{text_overlay_copy:{headline:'Frihet och precision'}}};
const ready=await kc.create(klingArgs);assert(ready.end_card_url&&ready.end_card_background_url&&ready.end_card_text_url);
assert.equal(new Set([ready.end_card_url,ready.end_card_background_url,ready.end_card_text_url]).size,3);
assert.equal(klingCalls,1);await kc.create({...klingArgs,selection:ready});assert.equal(klingCalls,1);
console.log('PASS: distinct card/background/text uploads, actual Kling one-image pass, persisted assets and retry reuse without paid resubmission');

// A damaged/missing CTA must fail, never silently use substitute animation text.
const savedVerify=ctx.verifyAnimatedAdvertisingTypography;
let rejectedCalls=0;
ctx.verifyAnimatedAdvertisingTypography=async()=>{throw new Error('missing locked word');};
await assert.rejects(ctx.create({...args,openai:{images:{edit:async()=>{rejectedCalls++;return{data:[{b64_json:atlas.toString('base64')}]};}}}}),e=>e.code==='ANIMATED_AI_TYPOGRAPHY_FAILED');
assert.equal(rejectedCalls,2,'Exactly one bounded correction, no unbounded retries');
ctx.verifyAnimatedAdvertisingTypography=savedVerify;
let quotaCalls=0;
await assert.rejects(ctx.create({...args,openai:{images:{edit:async()=>{quotaCalls++;throw Object.assign(new Error('insufficient_quota'),{status:429});}}}}),e=>e.code==='ANIMATED_AI_TYPOGRAPHY_FAILED');
assert.equal(quotaCalls,1,'Quota/auth failure is terminal');
const savedPlan=ctx.planAnimatedAdvertisingCopy;
ctx.planAnimatedAdvertisingCopy=async()=>{throw new Error('unsupported claim');};
let copyImageCalls=0;
await assert.rejects(ctx.create({...args,openai:{images:{edit:async()=>{copyImageCalls++;}}}}),e=>e.code==='ANIMATED_AI_TYPOGRAPHY_FAILED');
assert.equal(copyImageCalls,0,'Unsupported copy rejected before image generation');ctx.planAnimatedAdvertisingCopy=savedPlan;

// Inspect the real serialized motion asset, not only the cutout PNG.
const productCtx={sharp,Buffer,Math,Number,Error};
vm.runInNewContext(crop(route,'async function createAnimatedProductLayer(','\nasync function createAnimatedLogoOverlay(')+'\nthis.create=createAnimatedProductLayer;',productCtx);
const layer=await productCtx.create({sourceImageBuffer:source,preparedCutoutBuffer:prepared.cutoutBuffer,animationLayout:layout});
const motion=await sharp(layer.productMotionBuffer).metadata();
const sourceBounds=prepared.analysis.sourceBounds;
const mx=Math.round((610-sourceBounds.left)*motion.width/sourceBounds.width),my=Math.round((745-sourceBounds.top)*motion.height/sourceBounds.height);
assert.equal((await pixel(layer.productMotionBuffer,mx,my))[3],255,'Spacebar remains opaque after WebP serialization');
assert(layer.productDataUri.length<=175000);
assert(Buffer.byteLength(JSON.stringify(buildProductPushEdit({...args,backgroundVideoUrl:'bg',productDataUri:layer.productDataUri,textOverlayUrl:'text',durationSeconds:5,closingHoldSeconds:2,endCardUrl:'card',endCardBackgroundUrl:'bg-card',endCardTextUrl:'cta'})))<300000);

// An unsafe layout stays blocked through continuation, rather than becoming
// the old overlapping deterministic fallback when its lease gets stale.
const blocked={text_overlay_status:'blocked_layout',text_overlay_error:'No sufficiently clear region'};
await assert.rejects(kc.create({...klingArgs,selection:blocked}),e=>e.code==='KLING_TYPOGRAPHY_LAYOUT_UNSAFE');
assert.equal(klingCalls,1);
console.log('PASS: bounded failure paths, zero image requests on bad copy, terminal quota, opaque serialized product and blocked-layout continuation');

const {getKlingTextFrameFractions}=await import('../lib/klingLayout.js');
const fractions=getKlingTextFrameFractions(6,{scene_trim_start_seconds:.7,overlay_start_seconds:1.5,reference_safety:{motionPlan:{finish_seconds:5}}});
assert(Math.abs(fractions[0]-2.2/6)<1e-8);assert(Math.abs(fractions.at(-1)-4.6/6)<1e-8,'Sample only the actual pre-card headline interval');
// The paid provider direction is deliberately unchanged, including its safe
// final hold; only the advertising edit omits that hold from customer delivery.
const source341=fs.readFileSync('lib/klingVideoIntelligence.js','utf8');assert(source341.includes('Settle all motion by 5 seconds and hold the final second.'));
assert(finalizer.includes('durationSeconds: motionEndSeconds'));
console.log('PASS: earlier text interval and end-card handoff before the bounded Kling hold, with unchanged provider motion');
