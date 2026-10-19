import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import {validateKlingCreativeDirection as check} from '../lib/klingCreativeSafety.js';
import {assembleKlingPrompt} from '../lib/klingPromptBudget.js';
import {run} from './test-v144-366-kling-direct-execution.mjs';
const logged=JSON.parse(fs.readFileSync('scripts/fixtures/v144379-logged-garment-plans.json','utf8'));
assert.equal(logged.length,2);
const intel=material=>({physical_subject:{kind:'physical_product',name:'Verified physical subject',motion_material:material},confidence:.95,verified_actions:[],components:[]});
const garment=intel('deformable_garment');
const savedSafety=r=>r.writes.find(w=>w.values.video_background_selection)?.values.video_background_selection.reference_safety;
const story=p=>({concept:'Present the exact product in its relevant context',setting:'Calm beach',opening_framing:'Complete supported actor, original product view prominent, movement space established',beat_0_1:'The supported action begins',beat_1_4:p.strategy,beat_4_5:'Settle with the original visible product view',motion_plan:p});
for(const original of logged){
 const copy=JSON.stringify(original);
 const result=await run({storyProposals:[story(original)],intelligence:garment});
 assert.ifError(result.error);
 assert.deepEqual(result.events,['kling_product_commercial_story_358','opening_image','claim','verify_references','kling']);
 assert.equal(result.requests.length,1,'exact logged proposal must reach exactly one paid submission boundary');
 assert.equal(result.safety.commercialStory.motion_plan.mode,'scene_verified_wear');
 assert.equal(result.safety.commercialStory.motion_plan.environment_motion,'none');
 assert.equal(result.safety.commercialStory.motion_plan.strategy,original.strategy,'preserve the actual garment story');
 assert.equal(savedSafety(result).motionPlan.mode,'scene_verified_wear');
 assert(result.safety.commercialStory.instruction_repairs.includes('garment_environment_motion_removed'));
 assert(result.requests[0].prompt.includes(original.strategy));
 assert(result.requests[0].prompt.includes('Natural head/eye movement and fabric drape are allowed'));
 assert(result.requests[0].prompt.includes('Never rotate the product'));
 assert(result.requests[0].prompt.length<=2450);
 assert.equal(JSON.stringify(original),copy,'never mutate logged input');
}
for(const negative of [
 'Never reveal hidden surfaces.', 'Do not show the back side.', 'The product must not rotate to show its rear.',
 'Avoid flipping the device to display the back side.', 'Keep the original product fixed. Never rotate the product or reveal hidden surfaces.',
 'Carry it without exposing hidden surfaces.', 'No camera orbit around the product.',
])assert(check(negative).ok,negative);
for(const positive of [
 'Show the back side of the product.', 'Rotate the product to show its rear.', 'Orbit around the product to show its reverse.',
 'Flip the phone to display the back.', 'Introduce another phone and hold both devices.',
 'Never rotate the product, but show the back side.', 'Do not orbit. Then rotate the product.',
])assert(!check(positive).ok,positive);
const base={...logged[0],strategy:'The original product stays source-facing as the established scene continues.',environment_motion:'none'};
const changes=[{camera_mode:'orbit'},{mode:'unknown'},{risk:'high'},{shot_count:2},{finish_seconds:10},{product_pose:'rotate'},{action_id:'made-up'},
 {initial_conditions:null},{stationary_objects:null},{strategy:''},{motion_prompt:'Rotate the product.'},{mode:'verified_use',action_id:'invented'},
 {strategy:'Rotate the product to show its back side.'}];
for(const evidence of [garment,intel('rigid_object'),intel('unknown'),{physical_subject:{kind:'packaging',name:'Verified box'},confidence:.95},motion.passiveProductIntelligence()]){
 for(const change of changes){
  const repaired=motion.repairKlingCommercialStory(story({...base,...change}),evidence);
  assert.deepEqual(motion.motionPlanSupportProblems(repaired.motion_plan,evidence),[]);
  assert(check(motion.renderKlingStructuredMotion(repaired.motion_plan,evidence)).ok);
  if(evidence.physical_subject.kind!=='physical_product'||evidence.physical_subject.motion_material!=='deformable_garment')assert.notEqual(repaired.motion_plan.mode,'scene_verified_wear');
 }
}
const unsafe=await run({storyProposals:[story({...base,strategy:'Rotate the product to show its back side.'})],intelligence:intel('rigid_object'),assertOriginalStrategy:false});
assert.ifError(unsafe.error);assert.equal(unsafe.requests.length,1);assert.equal(unsafe.events.filter(x=>x==='opening_image').length,1);
assert(!unsafe.requests[0].prompt.includes('Rotate the product to show its back side.'));
assert(unsafe.requests[0].prompt.includes('Never rotate the product'));
// Reproduce the known false-positive class with a synthetic watch contract.
// The actual Power log did not contain its original direction; do not claim
// this synthetic prompt is the exact provider instruction from that incident.
const negated=await run({storyProposals:[story({...base,mode:'camera_environment',camera_mode:'digital_push',strategy:'Keep the watch in its original view. Never reveal hidden surfaces.'})],intelligence:intel('rigid_object')});
assert.ifError(negated.error);assert.equal(negated.requests.length,1);assert.equal(savedSafety(negated).motionPlan.mode,'camera_environment');
const src=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const crop=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const image=await sharp({create:{width:540,height:960,channels:3,background:'#222222'}}).png().toBuffer();
for(const direction of ['Rotate the product to show its back side.','Keep the original product fixed. Never reveal hidden surfaces.','A complete permitted sentence. '.repeat(200)]){
 let requests=0;
 const ctx=vm.createContext({...motion,Buffer,console:{info(){}},assembleKlingPrompt,validateKlingCreativeDirection:check,
  planKlingVerifiedMotion:async()=>{requests++;return {mode:'camera_environment',motion_prompt:direction,source:'scene_aware_cinematic_plan'};},
  PRODUCT_RESEARCH_FAST_MODEL:'test',getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>''});
 vm.runInContext(crop('function getKlingProviderSafetyPrefix(','function getKlingProductPromptFallback(')+'\n'+crop('async function buildKlingProductVideoPrompt(','function buildKlingEngagementVideoPrompt('),ctx);
 const safety={commercialStory:{...story(base),status:'planned'}};
 const prompt=await ctx.buildKlingProductVideoPrompt({openai:{},rule:{},referenceSafety:safety,referenceFrameBuffer:image});
 assert.equal(requests,1);assert(prompt.length<=2450);assert(prompt.includes('SURFACE PRINT LOCK'));assert(prompt.includes('Never rotate the product'));
 if(direction.startsWith('Keep'))assert(prompt.includes(direction),'valid prohibitions pass unchanged');
 else {assert.equal(safety.motionPlan.source,'source_preserving_instruction_repair');assert(check(safety.motionPlan.motion_prompt).ok);assert(!prompt.includes(direction));}
 assert.doesNotThrow(()=>motion.assertKlingMotionPlanningReady({story:safety.commercialStory,motionPlan:safety.motionPlan}));
}
console.log('PASS 144.379: both exact logged garment plans reach one Kling order; negated locks accepted; positive unsafe actions locally replaced; 65 property/contract cases repaired; same prepared image retained; prompt budget repaired; no extra AI calls or creative stops');
