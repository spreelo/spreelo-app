import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as planning from '../lib/videoCreativePlanning.js';
import * as concept from '../lib/videoCommercialConcept.js';
import * as endBrief from '../lib/videoEndCardBrief.js';
import {generateIndependentAdvertisingAssets} from '../lib/videoAdvertisingAssetPipeline.js';
import {END_CARD_FRAMING} from '../lib/videoEndCardMaster.js';
import {deferKlingRenderContinuation} from '../lib/videoJobSafety.js';
import {repeatsAdvertisingMessage,isProductLabelHeadline} from '../lib/videoAdvertisingHierarchy.js';
const finalizer=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const worker=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+1);assert(a>=0&&b>a);return source.slice(a,b);};
const quiet={warn(){},info(){},log(){}};
const frame=await sharp({create:{width:108,height:192,channels:3,background:'#254535'}}).png().toBuffer();
// An actual pipeline call must EDIT with ONLY the original product, not the wearer frames.
const original=new File([frame],'original-product.png',{type:'image/png'});
const scene=new File([frame],'movie-with-wearer.png',{type:'image/png'});
let imageCalls=0;
const assets=await generateIndependentAdvertisingAssets({openai:{images:{edit:async(body,options)=>{
 imageCalls++;assert.deepEqual(body.image,[original]);assert.equal(body.size,'864x1536');assert.equal(options.maxRetries,0);
 assert(body.prompt.includes('product overlay'));assert(body.prompt.includes('Product, photographic background and exact typography'));
 assert(body.prompt.includes('No buttons'));assert(body.prompt.includes('authoritative')||body.prompt.includes('AUTHORITATIVE'));
 assert(body.prompt.includes('Din egen riktning'));assert(!body.prompt.includes('Include NO people, models, wearers, hands or advertised product'));
 return {data:[{b64_json:frame.toString('base64')}]};
},generate:async()=>{throw Error('Never discard original product reference');}}},
 model:'gpt-image-2.5-flare',referenceFiles:[scene],productReferenceFiles:[original],headline:'Din egen riktning',closingHeadline:'Din egen riktning',closingLine:'Se erbjudandet',
 renderEndCardMaster:true,masterFraming:END_CARD_FRAMING,sceneBackground:frame});
assert.equal(imageCalls,1);assert.equal(assets.backgroundReferenceMode,'original_product_complete_master');assert(assets.endCardMaster);
// Text retry policy is finite, remembers actual failure, never retries auth/quota as a transient timeout.
for(const error of [Error('Request timed out.'),{status:429,message:'Rate limit'},{status:503,message:'Unavailable'}]){
 const c=planning.creativePlanningFailure(error,{attempt:1,model:'configured',nowMs:0});
 assert.equal(c.status,'retry_pending');assert.equal(c.next_retry_at,'1970-01-01T00:00:30.000Z');
 assert.equal(planning.creativePlanningFailure(error,{attempt:2}).status,'fallback');
}
assert.equal(planning.creativePlanningFailure({status:401,message:'Invalid key'}).status,'fallback');
assert.equal(planning.creativePlanningFailure({status:429,code:'insufficient_quota',message:'Quota exhausted'}).status,'fallback');
let animatedCalls=0;
const animatedBody={model:'configured',input:[]};
const recovered=await planning.requestAnimatedCreativeResponse({responses:{create:async(body,options)=>{
 animatedCalls++;assert.equal(body,animatedBody);assert.equal(options.maxRetries,0);
 if(animatedCalls===1){assert.equal(options.timeout,40000);throw Error('Request timed out.');}
 assert(options.timeout<=20000);return {output_text:'recovered'};
}}},animatedBody);
assert.equal(animatedCalls,2);assert.equal(recovered.output_text,'recovered');
let authCalls=0;
await assert.rejects(()=>planning.requestAnimatedCreativeResponse({responses:{create:async()=>{authCalls++;throw {status:401,message:'Invalid key'};}}},animatedBody));
assert.equal(authCalls,1);
const context=vm.createContext({...planning,...concept,...endBrief,console:quiet,VIDEO_DESIGN_VERSION:373,
 KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},getFallbackKlingCta:()=> 'Se erbjudandet',
 normalizeKlingCreativeLine:v=>String(v||'').trim(),normalizeKlingLayout:v=>v||{},getKlingPlacementBox:()=>({}),klingLayoutSchema:()=>({type:'object'}),truncate:v=>String(v||''),getOpenAiTextOutput:r=>r.output_text,repeatsAdvertisingMessage,isProductLabelHeadline});
vm.runInContext(extract(finalizer,'async function planFinishedKlingAdvertisingCreative(','\nasync function '),context);
const request={post:{id:'saved',content:'Existing caption'},selection:{verified_product_title:'Verified product',verified_product_description:'Only verified facts',text_overlay_copy:{headline:'Existing caption'}},frames:[{buffer:frame}],productReferenceBuffer:frame};
let textCalls=0;
const timeout={responses:{create:async(body,options)=>{textCalls++;assert.equal(options.timeout,60000);assert.equal(options.maxRetries,0);throw Error('Request timed out.');}}};
let pending;
await assert.rejects(()=>context.planFinishedKlingAdvertisingCreative({...request,openai:timeout}),e=>{pending=e;return e.code==='KLING_CREATIVE_PLAN_PENDING';});
assert.equal(textCalls,1,'one text request per durable pass, not an internal paid retry loop');
const fallback=await context.planFinishedKlingAdvertisingCreative({...request,openai:timeout,selection:{...request.selection,creative_planning_control:pending.planningControl}});
assert.equal(textCalls,2);assert.equal(fallback.source,'deterministic_fallback');assert.equal(fallback.creative_planning_control.attempts,2);
assert.equal(fallback.creative_concept.product_anchor,'Verified product');assert(fallback.creative_concept.background_brief);assert.equal(fallback.creative_planning_control.last_error.message,'Request timed out.');
const proposed={creative_concept:{product_anchor:'Verified message',campaign_idea:'A specific human idea'},headline:'Din egen riktning',closing_headline:'Gör plats för din idé',cta:'Se erbjudandet',protected_regions:[{left:100,top:400,width:800,height:1000}]};
const success=await context.planFinishedKlingAdvertisingCreative({...request,openai:{responses:{create:async()=>({output_text:JSON.stringify(proposed)})}}});
assert.equal(success.source,'finished-video-creative-plan-v373');assert.equal(success.headline,proposed.headline);assert.equal(success.creative_concept.campaign_idea,'A specific human idea');
assert(finalizer.includes("if(error?.code==='KLING_CREATIVE_PLAN_PENDING')"));assert(finalizer.includes("text_overlay_status:'pending'"));assert(finalizer.includes("state:'waiting_creative'"));
// Waiting renders and creative requests respect their own next poll time; genuine failures keep five-minute backoff.
vm.runInContext(extract(finalizer,'function finalizationRetryBackoffIsFresh(','\nasync function claimKlingFinalization('),context);
context.KLING_FINALIZATION_RETRY_BACKOFF_MS=300000;
for(const state of ['waiting_render','waiting_creative']) {
 assert.equal(context.finalizationRetryBackoffIsFresh({video_status:'finalization_retry',kling_last_polled_at:new Date(0).toISOString(),video_background_selection:{finalization_control:{state,next_retry_at:new Date(30000).toISOString()}}},60000),false);
}
let persisted;
const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{video_background_selection:{shotstack_render_id:'paid-id'}}})})}),
 update:body=>({eq:async()=>{persisted=body;return {};}})})};
await deferKlingRenderContinuation({supabase:db,post:{id:'post'},error:{message:'rendering',renderId:'paid-id'},nowMs:0});
assert.equal(persisted.video_background_selection.shotstack_render_id,'paid-id');
assert.equal(persisted.video_background_selection.finalization_control.next_retry_at,'1970-01-01T00:00:30.000Z');
// Exercise actual catalog branch: reject unsuitable top item BEFORE selection, preserve diversity/stock/campaign rules, try next after lock failure.
const branch=extract(worker,'  const eligibleCatalogItems =','  // v144.285: for a connected');
const pool=Array.from({length:250},(_,i)=>({url:'product-'+i,title:'Product '+i,eligible:i>0}));
let selectedPools=[],locked=[];
const catalogCtx=vm.createContext({productIntentScoped:true,hasShopifyPrimaryCatalog:false,websiteAccessProtected:false,sortedCatalogItems:pool,
 isAcceptableWebsiteTextProductSelection:i=>i.eligible,isProductKnownUnavailableForPromotion:i=>i.unavailable===true,isCampaignFitRejectedForRule:i=>i.campaignRejected===true,console:quiet,supabase:{},rule:{id:'rule'},websiteUrl:'collection',contentType:'product',usedWebsiteImageUrlsThisRun:new Set(),recentUsedItems:[],productResearchFallbackReason:null,summary:{website_items_found:0,website_content_success:0},
 chooseUnusedWebsiteItem:async({items,allowReuseWhenExhausted})=>{assert.equal(allowReuseWhenExhausted,false);selectedPools.push(items.length);return {item:items[0],cycleNumber:1};},
 finalizePreparedWebsiteItem:async(item,cycle,options)=>{locked.push(item.url);assert.equal(options.allowAiRepair,false);if(locked.length===1)throw Error('stale page');return {websiteItem:item};},
 isWebsiteRateLimitError:e=>e.status===429,areSameWebsiteItem:(a,b)=>a.url===b.url});
vm.runInContext('async function selectFromExistingCollection(){'+branch+'return null;}',catalogCtx);
assert.equal((await catalogCtx.selectFromExistingCollection()).websiteItem.url,'product-2');assert.deepEqual(selectedPools,[249,248]);assert.deepEqual(locked,['product-1','product-2']);
// Unverified collection-feed records remain leads until exact-page stock/fit verification.
pool[0].collection_feed_verified=true;
locked=[];selectedPools=[];
catalogCtx.finalizePreparedWebsiteItem=async(item)=>{
 locked.push(item.url);return {websiteItem:{...item,eligible:item.url!=='product-0'}};
};
assert.equal((await catalogCtx.selectFromExistingCollection()).websiteItem.url,'product-1');
assert.deepEqual(selectedPools,[250,249]);assert.deepEqual(locked,['product-0','product-1']);
locked=[];
catalogCtx.finalizePreparedWebsiteItem=async(item)=>{locked.push(item.url);throw Error('stale product');};
assert.equal(await catalogCtx.selectFromExistingCollection(),null);
assert.equal(locked.length,6,'candidate lock attempts are bounded without dropping the full source pool');
assert.equal(catalogCtx.productResearchFallbackReason,'local_catalog_lock_budget_reached');
locked=[];
catalogCtx.finalizePreparedWebsiteItem=async(item)=>{locked.push(item.url);throw {status:429,message:'Website returned 429'};};
await assert.rejects(()=>catalogCtx.selectFromExistingCollection(),error=>error.status===429);
assert.equal(locked.length,1,'real remote rate limit immediately leaves the local pass for existing cooldown policy');
assert.equal(endBrief.END_CARD_HOLD_SECONDS,4);
for(const product of ['FLABBEN','FUBBICK','fiskespö','barnvagn'])assert(!concept.COMMERCIAL_CONCEPT_BRIEF.includes(product));
console.log('PASS 144.373: single product-reference master image; bounded durable text recovery with actual cause; same render retained and next-minute polling; full collection ranked with unchanged eligibility and next candidate on stale lock; four-second end card, no additional creative review.');
