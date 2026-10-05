import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {buildKlingAdvertisingAtlasPrompt,splitKlingAdvertisingAtlas,composeKlingEndCardLogo,buildFallbackKlingEndCard,KLING_END_CARD_SECONDS,KLING_END_CARD_TRANSITION_SECONDS} from '../lib/klingEndCard.js';
import {buildVideoOverlayEdit} from '../lib/shotstack.js';
import {loadVideoMusicDeletedIds,markVideoMusicDeleted,excludeDeletedVideoMusic,isMissingMusicCatalog,VIDEO_MUSIC_DELETION_PREFIX} from '../lib/videoMusicDeletions.js';
import {loadManagedVideoMusicCatalog} from '../lib/videoMusicLibrary.js';

const opaque=await sharp({create:{width:576,height:1024,channels:4,background:'#edc8ce'}}).png().toBuffer();
const letters=Buffer.from('<svg width="400" height="130" xmlns="http://www.w3.org/2000/svg"><text x="10" y="80" font-size="64" fill="white">Comfort</text></svg>');
const atlas=await sharp({create:{width:1536,height:1024,channels:4,background:'#00000000'}}).composite([{input:opaque,left:0,top:0},{input:letters,left:740,top:360}]).png().toBuffer();
const split=await splitKlingAdvertisingAtlas(atlas);assert.equal((await sharp(split.endCard).metadata()).width,1080);assert.equal((await sharp(split.endCard).metadata()).height,1920);
const raw=await sharp(split.headline).raw().toBuffer({resolveWithObject:true});assert.equal(raw.data[3],0);assert(raw.data.some((v,i)=>i%4===3&&v>0));
const logo=await sharp({create:{width:200,height:80,channels:4,background:'#ff0000'}}).png().toBuffer();
const card=await composeKlingEndCardLogo(split.endCard,logo);const pixel=await sharp(card).extract({left:540,top:675,width:1,height:1}).raw().toBuffer();assert.equal(pixel[0],255);assert.equal(pixel[1],0);
assert.equal((await sharp(await buildFallbackKlingEndCard({brand:{business_name:'Pressit'},closingLine:'Din nya vardagsfavorit'})).metadata()).height,1920);
for(const hasLogo of [true,false]){const prompt=buildKlingAdvertisingAtlasPrompt({headline:'Comfort today',closingLine:'Your everyday favorite',brand:{business_name:'Pressit',industry:'apparel'},hasLogo});assert(prompt.includes('1536x1024'));assert(prompt.includes('Company context:'));assert(prompt.includes(hasLogo?'Do NOT draw the logo':'exact company name'));assert(prompt.includes('No website address'));}

const edit=buildVideoOverlayEdit({videoUrl:'motion',textOverlayUrl:'headline',ctaOverlayUrl:'old-cta',logoOverlayUrl:'logo',closingFrameUrl:'old-freeze',endCardUrl:'endcard',durationSeconds:5,trimStartSeconds:0,overlayStartSeconds:1,closingHoldSeconds:KLING_END_CARD_SECONDS,endCardTransitionSeconds:KLING_END_CARD_TRANSITION_SECONDS,musicUrl:'music',musicDurationSeconds:11,musicTrimStartSeconds:0});
const clips=edit.timeline.tracks.flatMap(t=>t.clips);assert(!clips.some(c=>c.asset.src==='old-freeze'||c.asset.src==='old-cta'));
const ending=clips.find(c=>c.asset.src==='endcard'),motion=clips.find(c=>c.asset.src==='motion'),text=clips.find(c=>c.asset.src==='headline'),brand=clips.find(c=>c.asset.src==='logo'),music=clips.find(c=>c.asset.src==='music');
assert.equal(motion.length,5);assert.equal(ending.start,4.7);assert.equal(ending.length,1.6);assert.equal(ending.opacity[0].length,.3);assert(Math.abs(ending.start+ending.length-6.3)<1e-9);assert.equal(brand.length,5);assert.equal(text.start+text.length,ending.start);assert.equal(music.asset.trim,4.7);assert.equal(music.length,6.3);assert.equal(music.asset.effect,'none');
for(const track of edit.timeline.tracks){for(let i=1;i<track.clips.length;i++){assert(track.clips[i].start>=track.clips[i-1].start+track.clips[i-1].length);}}
assert(edit.timeline.tracks.indexOf(edit.timeline.tracks.find(t=>t.clips.includes(ending)))<edit.timeline.tracks.indexOf(edit.timeline.tracks.find(t=>t.clips.includes(brand))));
console.log('End card: fixed crops, transparency, original centered logo, no-logo sender, 0.3s dissolve over moving video, no freeze or duplicate CTA, music end alignment passed.');

// Mock storage with independent deletion objects and a deliberately stale
// shared catalog write. Permanent deletion survives the overwrite.
const objects=new Map();let uploads=0;const storage={upload:async(p,b)=>{uploads++;objects.set(p,Buffer.from(b).toString());return {error:null};},list:async(prefix,{offset=0,limit=1000}={})=>({data:[...objects.keys()].filter(p=>p.startsWith(prefix+'/')).map(p=>({name:p.slice(prefix.length+1)})).sort((a,b)=>a.name.localeCompare(b.name)).slice(offset,offset+limit),error:null}),download:async()=>({data:{text:async()=>objects.get('catalog/library.json')},error:null})};
objects.set('catalog/library.json',JSON.stringify({version:2,tracks:[{id:'a'},{id:'b'},{id:'c'}]}));const stale=JSON.parse(objects.get('catalog/library.json'));
await Promise.all([markVideoMusicDeleted(storage,'a'),markVideoMusicDeleted(storage,'b')]);await storage.upload('catalog/library.json',Buffer.from(JSON.stringify(stale)));
const ids=await loadVideoMusicDeletedIds(storage);assert.deepEqual([...ids].sort(),['a','b']);assert.deepEqual(excludeDeletedVideoMusic(stale,ids).tracks.map(t=>t.id),['c']);await markVideoMusicDeleted(storage,'a');assert.equal((await loadVideoMusicDeletedIds(storage)).size,2);
assert.equal(isMissingMusicCatalog({statusCode:'403',message:'Access denied'}),false);assert.equal(isMissingMusicCatalog({statusCode:'404'}),true);
const failure={storage:{from:()=>({download:async()=>({error:{message:'temporary outage'},data:null})})}};assert.equal((await loadManagedVideoMusicCatalog({supabase:failure})).tracks.length,0);
const unreadable={storage:{from:()=>({...storage,list:async()=>({error:{message:'list failed'},data:null})})}};assert.equal((await loadManagedVideoMusicCatalog({supabase:unreadable})).tracks.length,0);
// Exercise real admin read/write branches: corrupt/denied catalogs never reseed.
const route=fs.readFileSync('app/api/video-music/route.js','utf8');const start=route.indexOf('async function readCatalog'),end=route.indexOf('export async function GET',start);
const ctx=vm.createContext({Buffer,Date,Error,JSON,Number,VIDEO_MUSIC_BUCKET:'music',VIDEO_MUSIC_CATALOG_PATH:'catalog/library.json',VIDEO_MUSIC_CATALOG_VERSION:2,ensureMusicBucket:async()=>{},normalizeVideoMusicCatalog:x=>x,buildDefaultVideoMusicCatalog:()=>({version:2,tracks:[{id:'seed'}]}),isMissingMusicCatalog,loadVideoMusicDeletedIds,excludeDeletedVideoMusic});vm.runInContext(route.slice(start,end),ctx);
const admin={storage:{from:()=>storage}};assert.deepEqual((await ctx.readCatalog(admin)).tracks.map(t=>t.id),['c']);
objects.set('catalog/library.json','broken json');const before=uploads;await assert.rejects(ctx.readCatalog(admin));assert.equal(uploads,before);
const denied={storage:{from:()=>({...storage,download:async()=>({error:{statusCode:403,message:'Access denied'},data:null})})}};await assert.rejects(ctx.readCatalog(denied));assert.equal(uploads,before);
assert(route.includes('await markVideoMusicDeleted'));assert(!route.includes('Replace a corrupt catalog'));
// Run the real DELETE handler concurrently, including durable success when
// shared-catalog compaction fails after the independent marker was saved.
objects.clear();objects.set('catalog/library.json',JSON.stringify(stale));
Object.assign(ctx,{URL,Response,console,markVideoMusicDeleted,getAdminContext:async()=>({admin}),adminContextError:()=>{throw new Error('Unexpected auth failure');}});
vm.runInContext(route.slice(route.indexOf('export async function DELETE')).replace('export async function DELETE','async function DELETE'),ctx);
const deleteResponses=await Promise.all(['a','b'].map(id=>ctx.DELETE({url:`https://example.test/api/video-music?id=${id}`})));
for(const response of deleteResponses){assert.equal(response.status,200);assert.equal((await response.json()).ok,true);}
assert.deepEqual((await ctx.readCatalog(admin)).tracks.map(t=>t.id),['c']);assert.equal((await ctx.DELETE({url:'https://example.test/api/video-music?id=a'})).status,200);
const upload=storage.upload;storage.upload=async(p,b)=>p==='catalog/library.json'?{error:{message:'compaction unavailable'}}:upload(p,b);
assert.equal((await ctx.DELETE({url:'https://example.test/api/video-music?id=c'})).status,200);
assert.equal((await ctx.readCatalog(admin)).tracks.length,0);storage.upload=upload;
console.log('Music: simultaneous deletions survive stale catalog writes and reload; repeated delete safe; corrupt/denied/read/list failures never restore deleted music.');

// Exercise the actual one-shot typography orchestration with a synthetic atlas.
const source=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');const fstart=source.indexOf('async function createFinishedKlingTypographyOnce'),fend=source.indexOf('async function ensureKlingClosingHeroFrame',fstart);let imageCalls=0,cardUploads=0;
const query={eq:()=>query,then:r=>Promise.resolve({error:null}).then(r)};
const supabase={from:()=>({update:()=>query})};
const funcs=vm.createContext({Buffer,sharp,Date,Math,Number,String,Error,console,KLING_FINALIZATION_LEASE_MS:360000,KLING_TYPOGRAPHY_MODEL:'gpt-image-2.5-flare',KLING_END_CARD_SECONDS,buildKlingAdvertisingAtlasPrompt,splitKlingAdvertisingAtlas,composeKlingEndCardLogo,normalizeVideoDurationSeconds:()=>5,getKlingTextFrameFractions:()=>[.2,.8],sampleRemoteVideoFrames:async()=>[{buffer:opaque}],planFinishedKlingAdvertisingCreative:async()=>({headline:'Comfort',subheadline:'',cta:'Everyday favorite',main_placement:'lower_left',main_layout:{},design_direction:'Fashion editorial'}),toFile:async b=>b,normalizeFinishedKlingTypography:async b=>({buffer:b,visibleRatio:.1,bboxAreaRatio:.2}),placeFinishedKlingTypographyInSafeArea:async b=>({buffer:b,visibleRatio:.1,strongRatio:.1,edgeRatio:0}),uploadKlingTypographyOverlay:async()=>({imageUrl:'text',storagePath:'text'}),uploadKlingEndCardFrame:async()=>{cardUploads++;return{imageUrl:'card',storagePath:'card'}},getFallbackKlingCta:()=> 'Favorite',truncate:s=>s,createDeterministicKlingTypographyFallback:async()=>({text_overlay_url:'fallback',text_overlay_status:'ready'})});
vm.runInContext(source.slice(fstart,fend),funcs);
const openai={images:{edit:async args=>{imageCalls++;assert.equal(args.size,'1536x1024');assert.equal(args.model,'gpt-image-2.5-flare');return {data:[{b64_json:atlas.toString('base64')}]};}}};
const args={supabase,openai,post:{id:'p',user_id:'u'},task:{videoUrl:'motion'},selection:{text_overlay_copy:{headline:'Comfort'}},brand:{business_name:'Pressit'},logoBuffer:logo};
const result=await funcs.createFinishedKlingTypographyOnce(args);assert.equal(result.end_card_url,'card');assert.equal(result.text_overlay_url,'text');assert.equal(imageCalls,1);assert.equal(cardUploads,1);
await funcs.createFinishedKlingTypographyOnce({...args,selection:result});assert.equal(imageCalls,1);
await funcs.createFinishedKlingTypographyOnce({...args,selection:{...args.selection,text_overlay_status:'failed'}});assert.equal(imageCalls,1);
const finalSource=source.slice(source.indexOf('async function getKlingFinalVideoSource'),source.indexOf('async function getKlingFinalVideoSource')+8500);assert(!finalSource.includes('ensureKlingClosingHeroFrame('));assert(finalSource.includes('endCardUrl: postprocess.end_card_url'));
assert(fs.readFileSync('app/api/plan-activation-email/route.js','utf8').includes('/brand/spreelologo-on-dark.png'));
console.log('Single image call yields main overlay and full end card; cached/failed claims never submit a second request; new finalize path never samples a frozen ending; email logo passed.');
