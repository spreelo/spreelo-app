import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import {assembleKlingPrompt} from '../lib/klingPromptBudget.js';
import {validateKlingCreativeDirection} from '../lib/klingCreativeSafety.js';

const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const png=await sharp({create:{width:540,height:960,channels:3,background:'#272d37'}}).png().toBuffer();
const review={identity_safe:true,source_view_safe:true,functions_supported:true,scene_safe:true,causality_safe:true,confidence:.98,reason:'Actor, support, path and original product view are established'};
const plan={strategy:'The wearer walks down the existing street, keeping the Halloween shirt print visible as the camera follows.',
  mode:'scene_verified_wear',action_id:'',camera_mode:'follow_same_view',environment_motion:'none',product_pose:'source_locked',
  shot_count:1,finish_seconds:5,initial_conditions:['wearer supported on pavement'],stationary_objects:[],risk:'low'};
const garment={physical_subject:{kind:'physical_product',name:'Halloween T-shirt'},confidence:.99,verified_actions:[],components:[]};
const story={concept:'A confident evening walk showing the exact Halloween print',setting:'An autumn city street',
  opening_framing:'Full supported wearer in mid-stride, legs and feet visible, clear pavement ahead, original shirt front visible',
  beat_0_1:'The wearer is already taking the first step with a natural forward eyeline',
  beat_1_4:'Two purposeful steps along the pavement while the camera follows at the verified front angle',
  beat_4_5:'The wearer settles naturally with the print prominent',motion_plan:plan};
const requests=[],events=[];
const ai={responses:{create:async request=>{
  requests.push(request);events.push(request.text.format.name);
  return {output_text:JSON.stringify(request.text.format.name==='kling_product_commercial_story_358'?story:review)};
}},images:{edit:async request=>{
  events.push('opening_image');
  assert.match(request.prompt,/SHARED COMMERCIAL STORY/);
  assert(request.prompt.includes(story.opening_framing));
  assert(request.prompt.includes(story.setting));
  assert(request.prompt.includes(story.beat_1_4));
  return {data:[{b64_json:png.toString('base64')}]};
}}};
const context=vm.createContext({...motion,sharp,Buffer,console:{info(){},warn(){}},
  PRODUCT_RESEARCH_FAST_MODEL:'test',imageModel:()=> 'test-image',toFile:async b=>b,
  truncateText:(s,n)=>String(s).slice(0,n),isEngagementAiVideoRule:()=>false,
  getKlingVerifiedViewInstruction:()=> 'Preserve exact original print and source-facing surface.',
  getCustomerFacingCampaignTheme:()=> 'Halloween',formatCampaignIdentityLockForPrompt:()=> 'Halloween campaign only',
  reviewKlingOpeningSceneIdentity:async ()=>{throw new Error('The removed opening identity gate must never be called');},
  assembleKlingPrompt,validateKlingCreativeDirection});
vm.runInContext(extract('async function generateKlingDirectSceneOpeningFrame(', 'async function createKlingProductReferenceFrame(')+'\n'+
  extract('function getKlingProviderSafetyPrefix(', 'function getKlingProductPromptFallback(')+'\n'+
  extract('async function buildKlingProductVideoPrompt(', 'function buildKlingEngagementVideoPrompt('),context);
const referenceSafety={productIntelligence:garment,fullProductInteractionSafe:true,verifiedViewLock:{verifiedView:'front'}};
const rule={website_item:{title:'Stabbing Halloween - Herr - T-shirt'},brand_profile:{business_name:'Pressit'}};
const opening=await context.generateKlingDirectSceneOpeningFrame({openai:ai,rule,sourceImageBuffer:png,referenceSafety});
const prompt=await context.buildKlingProductVideoPrompt({openai:ai,rule,referenceSafety,referenceFrameBuffer:opening.buffer});
assert.deepEqual(events,['kling_product_commercial_story_358','opening_image','kling_cinematic_preflight_346']);
assert.equal(opening.identityReviewStatus,'disabled');
assert.equal(opening.identityConfidence,null,'No fake identity approval when the check is disabled');
assert.equal(requests.length,2,'the existing two motion calls are reordered, not duplicated');
assert.equal(referenceSafety.motionPlan.mode,'scene_verified_wear');
assert(prompt.includes(plan.strategy),'the product-specific central story beat reaches Kling');
assert(prompt.endsWith(referenceSafety.motionPlan.motion_prompt),'the reviewed motion arrives in full');
assert.match(prompt,/Natural gait, head\/eye motion and fabric response are allowed/);
assert.match(prompt,/SURFACE PRINT LOCK/);assert.match(prompt,/Never rotate the product/);
assert(prompt.length<=2450);
assert(requests[1].input[0].content[0].text.includes(story.opening_framing));
assert.equal(requests[1].input[0].content[1].image_url,`data:image/png;base64,${opening.buffer.toString('base64')}`);
console.log('PASS: real route plans the story before its image, reuses it for actual-frame preflight and submits the complete action with two planning/review calls and one image');

// A second physical product gets a different story, without category switches.
const stroller={physical_subject:{kind:'physical_product',name:'Verified stroller'},confidence:.99,components:[],
  verified_actions:[{id:'roll',kind:'roll_straight',target_component:'Verified stroller',physical_motion_supported:true,preserves_source_view:true,
    confidence:.99,evidence_type:'visible_geometry',source_evidence:'Visible wheels on a ground plane'}]};
const rolling={...story,concept:'A parent continues a calm park walk with the verified stroller',setting:'A park path',
  opening_framing:'Existing parent holding the handle, all original wheels in ground contact, clear path ahead',
  beat_1_4:'Parent and stroller move down the established path at matched pace',
  motion_plan:{...plan,mode:'verified_use',action_id:'roll',strategy:'The parent walks along the park path with the verified stroller rolling smoothly at the original view.'}};
function fake(values,saved=[]) {return {responses:{create:async req=>{saved.push(req);const value=values.shift();if(value instanceof Error)throw value;assert(value,'unexpected extra planning call');return {output_text:JSON.stringify(value)};}}};}
const args={model:'test',sourceDataUrl:`data:image/png;base64,${png.toString('base64')}`,context:{fullProductInteractionSafe:true}};
const rollStory=await motion.planKlingCommercialStory({...args,intelligence:stroller,openai:fake([rolling])});
assert.equal(rollStory.status,'planned');assert.notEqual(rollStory.setting,referenceSafety.commercialStory.setting);
const rolled=await motion.planKlingVerifiedMotion({openai:fake([review]),model:'test',intelligence:stroller,firstFrameDataUrl:args.sourceDataUrl,context:{commercialStory:rollStory}});
assert.equal(rolled.mode,'verified_use');assert(rolled.motion_prompt.includes(rolling.motion_plan.strategy));
assert.match(rolled.motion_prompt,/ground contact/);

// A planned action is not authorization when the ACTUAL generated image
// crops off support or otherwise cannot sustain it. Safety still wins.
const cropped=await motion.planKlingVerifiedMotion({openai:fake([{...review,scene_safe:false,reason:'Walking was planned but the actual image crops off the legs and ground support'}]),
  model:'test',intelligence:garment,firstFrameDataUrl:args.sourceDataUrl,context:{commercialStory:{...story,status:'planned'}}});
assert.equal(cropped.source,'safe_cinematic_fallback');assert.match(cropped.rejected_plan_reason,/crops off the legs/);
for(const change of [{camera_mode:'orbit'},{action_id:'invented'},{shot_count:2},{risk:'high'}]) {
  const proposal={...story,motion_plan:{...plan,...change}};
  const bad=await motion.planKlingCommercialStory({...args,intelligence:garment,openai:fake([proposal,proposal])});
  assert.equal(bad.status,'unavailable');
}
const noHandling=await motion.planKlingCommercialStory({...args,context:{fullProductInteractionSafe:false},intelligence:garment,openai:fake([story,story])});
assert.equal(noHandling.status,'unavailable');
const printed=await motion.planKlingCommercialStory({...args,intelligence:{...garment,physical_subject:{kind:'packaging',name:'Box showing a person'}},openai:fake([story,story])});
assert.equal(printed.status,'unavailable');
const outage=await motion.planKlingCommercialStory({...args,intelligence:garment,openai:fake([new Error('planning timeout')])});
assert.equal(outage.status,'unavailable');
const calls=[];
const safe=await motion.planKlingVerifiedMotion({openai:fake([],calls),model:'test',intelligence:garment,firstFrameDataUrl:args.sourceDataUrl,context:{commercialStory:outage}});
assert.equal(calls.length,0);assert.match(safe.rejected_plan_reason,/planning timeout/);
const failedOpening=await motion.planKlingVerifiedMotion({openai:fake([],calls),model:'test',intelligence:garment,firstFrameDataUrl:args.sourceDataUrl,
  context:{commercialStory:{...story,status:'opening_unavailable',reason:'image generation failed'}}});
assert.match(failedOpening.rejected_plan_reason,/image generation failed/);assert.equal(calls.length,0);
console.log('PASS: distinct product stories, unsupported actions/depictions blocked, actual cropped frame rejected, outages and failed image generation do not add planning calls');
