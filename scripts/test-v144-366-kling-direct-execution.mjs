import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import {assembleKlingPrompt} from '../lib/klingPromptBudget.js';
import {validateKlingCreativeDirection} from '../lib/klingCreativeSafety.js';

// Reproduce occurrence 84526670-de2f-4b18-b99b-eaf469424120. These are
// the two actual logged proposals, with the same physical-product evidence.
const intel={physical_subject:{kind:'physical_product',name:'Heja Eslöv T-shirt'},confidence:.95,verified_actions:[],components:[]};
const base={action_id:'',camera_mode:'locked',product_pose:'source_locked',shot_count:1,finish_seconds:5,risk:'low',
  mode:'scene_verified_wear',stationary_objects:[]};
const first={...base,strategy:'A person walks naturally forward along a paved city park path to reveal and highlight the front view of the yellow Heja Eslöv T-shirt with clear text visibility.',
  environment_motion:'existing_foliage_sways',initial_conditions:['Person wearing the shirt mid-stride on a paved park path']};
const second={...base,strategy:'A person stands front-facing stationary to present the yellow Heja Eslöv T-shirt front view with clear text visibility and natural fabric movement only.',
  environment_motion:'none',initial_conditions:['Person wearing the shirt front-facing, with support and room for motion']};
const story=plan=>({concept:'Show support for Eslöv',setting:'A real city park',opening_framing:'A complete supported wearer, exact front print visible',
  beat_0_1:'The wearer presents the shirt',beat_1_4:'Continue the product presentation',beat_4_5:'The exact shirt front remains prominent',motion_plan:plan});
const png=await sharp({create:{width:540,height:960,channels:3,background:'#29333a'}}).png().toBuffer();
const route=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(start,end)=>route.slice(route.indexOf(start),route.indexOf(end,route.indexOf(start)));

async function run({claim=true,providerError=null,imageError=null,checkpointError=false,storyProposals=null}={}) {
  const proposals=storyProposals||[story(first),story(second)],events=[],writes=[],requests=[];
  const expectedStrategy=proposals.at(-1).motion_plan.strategy;
  const ai={responses:{create:async req=>{
    events.push(req.text.format.name);assert.equal(req.text.format.name,'kling_product_commercial_story_358','no extra motion-review model');
    const text=req.input[0].content[0].text;
    assert(!text.includes('When fullProductInteractionSafe is false do not stage'));
    const proposal=proposals.shift();assert(proposal,'unexpected planning retry');return {output_text:JSON.stringify(proposal)};
  }},images:{edit:async req=>{
    events.push('opening_image');if(imageError)throw imageError;
    assert(req.prompt.includes(expectedStrategy));assert.match(req.prompt,/Stage ordinary wearing, carrying or ground contact/);
    assert(!req.prompt.includes('establish no handling or operational state'));
    assert.match(req.prompt,/Preserve the exact verified product identity/);
    return {data:[{b64_json:png.toString('base64')}]};
  }}};
  const safety={fullProductInteractionSafe:false,interactionMode:'cropped_or_uncertain_reference',edgeVisibleRatio:.08,boundsAreaRatio:.96,
    productIntelligence:intel,verifiedViewLock:{verifiedView:'front'}};
  const db={rpc:async(name,args)=>{events.push('claim');assert.equal(name,'claim_kling_video_generation');assert.equal(args.p_post_id,'fresh-post');return {data:claim,error:null};},
    from(table){return {update(values){writes.push({table,values});return this;},async eq(){
      return {error:checkpointError&&writes.at(-1).values.kling_task_id?{message:'database unavailable'}:null};
    }};}};
  const ctx=vm.createContext({...motion,sharp,Buffer,Date,console:{info(){},warn(){}},
    PRODUCT_RESEARCH_FAST_MODEL:'test',KLING_AI_VIDEO_DURATION_SECONDS:5,KLING_TEXT_OVERLAY_START_SECONDS:1,
    imageModel:()=> 'test-image',toFile:async b=>b,truncateText:(s,n)=>String(s).slice(0,n),isEngagementAiVideoRule:()=>false,
    getKlingVerifiedViewInstruction:()=> 'Preserve exact print and original front-facing product surface.',
    getCustomerFacingCampaignTheme:()=> 'Support Eslöv',formatCampaignIdentityLockForPrompt:()=> 'Eslöv campaign',
    fetchImageBufferForOverlay:async()=>png,assessKlingReferenceSafety:async()=>safety,
    // A real image-service failure is retained, without ordering a paid video.
    selectKlingNaturalStartBackground:async()=>{throw imageError||new Error('unexpected fallback');},
    uploadGeneratedImageToStorage:async({fileSuffix})=>({imageUrl:`https://example.com/${fileSuffix}.png`,imageStoragePath:fileSuffix}),
    persistKlingOpeningAssets:async()=>({}),buildKlingAdvertisingOverlayCopy:()=>({headline:'Heja Eslöv'}),
    verifyPreparedKlingAuditReferences:async()=>events.push('verify_references'),assembleKlingPrompt,validateKlingCreativeDirection,
    submitKlingImageToVideo:async request=>{requests.push(request);events.push('kling');if(providerError)throw providerError;
      return {taskId:'one-kling-task',status:'submitted',durationSeconds:5};}});
  vm.runInContext(extract('async function generateKlingDirectSceneOpeningFrame(','async function createKlingProductReferenceFrame(')+'\n'+
    extract('function getKlingProviderSafetyPrefix(','function getKlingProductPromptFallback(')+'\n'+
    extract('async function buildKlingProductVideoPrompt(','function buildKlingEngagementVideoPrompt(')+'\n'+
    extract('export async function submitAdminRescueAiProductVideo(','function normalizeSlideText(').replace('export async','async'),ctx);
  let result,error;
  try {result=await ctx.submitAdminRescueAiProductVideo({openai:ai,supabase:db,userId:'customer',postId:'fresh-post',
    rule:{website_item:{title:'>>Special<< - Heja Eslöv - Herr & Dam',image_url:'https://example.com/gul2.png'},brand_profile:{business_name:'Pressit'}},postContent:'Heja Eslöv'});}
  catch(e){error=e;}
  return {result,error,events,writes,requests,safety};
}

const success=await run();assert.ifError(success.error);
assert.equal(success.result.taskId,'one-kling-task');assert.equal(success.requests.length,1);
assert.deepEqual(success.events,['kling_product_commercial_story_358','kling_product_commercial_story_358','opening_image','claim','verify_references','kling']);
assert.equal(success.safety.commercialStory.status,'planned');
assert.deepEqual(success.safety.commercialStory.validation_attempts[1].problems,[]);
assert(!success.safety.commercialStory.validation_attempts.flatMap(a=>a.problems).includes('first_frame_handling_not_supported'));
const request=success.requests[0];assert(request.prompt.includes(second.strategy));
assert.match(request.prompt,/SURFACE PRINT LOCK/);assert.match(request.prompt,/COMPONENT ROLE LOCK/);assert.match(request.prompt,/Never rotate the product/);
assert(request.prompt.length<=2450);assert.equal(request.externalTaskId,'fresh-post');
const saved=success.writes.find(w=>w.values.video_background_selection)?.values.video_background_selection;
assert.equal(saved.reference_safety.motionPlan.execution_policy,'direct_kling_execution_v366');
assert.equal(saved.reference_safety.motionPlan.preflight,null);
assert(success.writes.some(w=>w.values.kling_task_id==='one-kling-task'));

// No provider retries: a consumed claim, API error, missing opening image or
// checkpoint failure must not be disguised as success or buy another video.
// Reported 169/164-character proposals must pass the actual opening, cost
// claim and submission path once each, without a length repair or new review.
for(const strategy of [
 'Man stands naturally next to picnic table wearing the dark blue diver T-shirt fully visible front, picks up diving mask to connect theme, camera zooms in on shirt print.',
 'Man wearing dark blue diver T-shirt stands naturally by picnic table, picks up diving mask to link theme, camera zooms in on shirt print front visible and readable.'
]){
 const reported=await run({storyProposals:[story({...second,strategy})]});assert.ifError(reported.error);
 assert.equal(reported.requests.length,1);assert(reported.requests[0].prompt.includes(strategy));
 assert.deepEqual(reported.events,['kling_product_commercial_story_358','opening_image','claim','verify_references','kling']);
}
const consumed=await run({claim:false});assert.match(consumed.error.message,/already consumed/);assert.equal(consumed.requests.length,0);
const providerError=Object.assign(new Error('Kling HTTP 429: rate limit'),{status:429});
const failed=await run({providerError});assert.equal(failed.error,providerError);assert.equal(failed.requests.length,1);
assert.equal(failed.error.status,429);assert.match(failed.error.message,/Kling HTTP 429: rate limit/);
const noImage=await run({imageError:new Error('Image API unavailable')});assert.match(noImage.error.message,/Image API unavailable/);assert.equal(noImage.requests.length,0);
const checkpoint=await run({checkpointError:true});assert.match(checkpoint.error.message,/could not persist its task id/);assert.equal(checkpoint.requests.length,1);

// Typical valid walking and rolling stories bypass a second reviewer entirely.
const walking={...first,strategy:'The wearer walks along the park path, keeping the exact yellow Heja Eslöv shirt print facing the camera.',environment_motion:'none'};
const planned=await motion.planKlingCommercialStory({openai:{responses:{create:async()=>({output_text:JSON.stringify(story(walking))})}},
  model:'test',intelligence:intel,sourceDataUrl:`data:image/png;base64,${png.toString('base64')}`,context:{fullProductInteractionSafe:false}});
assert.equal(planned.status,'planned');
const direct=await motion.planKlingVerifiedMotion({openai:{responses:{create:async()=>{throw new Error('Must not review a prepared story');}}},
  model:'test',intelligence:intel,firstFrameDataUrl:`data:image/png;base64,${png.toString('base64')}`,context:{commercialStory:planned,fullProductInteractionSafe:false}});
assert.equal(direct.mode,'scene_verified_wear');assert(direct.motion_prompt.includes(walking.strategy));assert.equal(direct.preflight,null);
console.log('PASS: exact reported proposals reach one Kling submission despite cutout flag; identity instructions preserved; no speculative motion review; claim/API/image/checkpoint failures remain visible without paid retry');
