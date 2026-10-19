import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import { assembleKlingPrompt } from '../lib/klingPromptBudget.js';
import { validateKlingCreativeDirection } from '../lib/klingCreativeSafety.js';

const route=fs.readFileSync(new URL('../app/api/cron/run-automations/route.js',import.meta.url),'utf8');
const extract=(start,end)=>{const a=route.indexOf(start),b=route.indexOf(end,a);assert(a>=0&&b>a);return route.slice(a,b);};
const garmentBaseline=JSON.parse(fs.readFileSync(new URL('./fixtures/v144382-garment-instructions-144381.json',import.meta.url),'utf8'));
const image=await sharp({create:{width:64,height:96,channels:3,background:'#54636e'}}).png().toBuffer();
const story={concept:'Meaningful activity around the exact source-facing product',setting:'An individual real-world setting',
  opening_framing:'The exact photographed faces remain visible beside an already-active person',
  beat_0_1:'The existing action begins',beat_1_4:'The person continues the established independent action',beat_4_5:'Finish with the same product faces visible',
  motion_plan:{strategy:'The established carrier carries the product using its visible handle, retaining the photographed angle throughout the scene. ',
    mode:'verified_use',camera_mode:'follow_same_view',environment_motion:'none',action_id:'carry',
    product_pose:'source_locked',shot_count:1,finish_seconds:5,risk:'low',
    initial_conditions:['Source-facing product and supported actor already visible'],stationary_objects:[]}};
const ctx=vm.createContext({...motion,sharp,Buffer,assembleKlingPrompt,validateKlingCreativeDirection,
  console:{info(){},warn(){}},PRODUCT_RESEARCH_FAST_MODEL:'offline',imageModel:()=> 'offline',toFile:async data=>data,
  truncateText:(s,n)=>String(s||'').slice(0,n),isEngagementAiVideoRule:()=>false,
  getKlingVerifiedViewInstruction:()=> 'Keep the original retailer view.',getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>''});
vm.runInContext(extract('async function generateKlingDirectSceneOpeningFrame(', 'async function createKlingProductReferenceFrame(')+'\n'+
  extract('function getKlingProviderSafetyPrefix(', 'function getKlingProductPromptFallback(')+'\n'+
  extract('async function buildKlingProductVideoPrompt(', 'function buildKlingEngagementVideoPrompt('),ctx);

for(const [material,name] of [['rigid_object','Source object A'],['rigid_object','Unrelated source object B'],['unknown','Source object C']]){
  const intelligence={physical_subject:{kind:'physical_product',motion_material:material,name,visible_surfaces:['front and one side']},confidence:.99,components:[],verified_actions:[{id:'carry',kind:'carry_straight',target_component:name,evidence_type:'visible_geometry',source_evidence:'Visible load-bearing handle on the original product',physical_motion_supported:true,preserves_source_view:true,confidence:.99}]};
  const staging=motion.klingSourceViewStagingInstruction(intelligence);
  const events=[];let planning='',opening='';
  const ai={responses:{create:async request=>{events.push('plan');planning=request.input[0].content[0].text;return {output_text:JSON.stringify(story)};}},
    images:{edit:async request=>{events.push('image');opening=request.prompt;return {data:[{b64_json:image.toString('base64')}]};}}};
  const safety={productIntelligence:intelligence,verifiedViewLock:{verifiedView:'front and one side'}};
  const rule={website_item:{title:name},brand_profile:{business_name:'Fixture'}};
  const frame=await ctx.generateKlingDirectSceneOpeningFrame({openai:ai,rule,sourceImageBuffer:image,referenceSafety:safety});
  assert(planning.includes(staging),'story must be planned around the original view before the image');
  assert(opening.includes(staging),'same staging rule reaches the actual image request');
  assert(staging.includes('do not choose a rear-facing wearer'));
  assert(staging.includes('do not solve') || staging.includes('Do not invent markings'));
  assert(staging.includes('meaningful activity beside it'));
  assert.equal(frame.identityReviewStatus,'disabled');
  const submitted=await ctx.buildKlingProductVideoPrompt({openai:ai,rule,referenceSafety:safety,referenceFrameBuffer:frame.buffer});
  assert.deepEqual(events,['plan','image'],'no added model, image correction, retry or creative reviewer');
  assert(submitted.includes('retailer image defines product identity/view'));
  assert(submitted.includes('including when worn/carried'));
  assert(submitted.includes('SURFACE PRINT LOCK:'));
  assert(submitted.includes('Never rotate the product'));
  assert(submitted.length<=2450);
  assert.equal(safety.motionPlan.mode,'verified_use');
  assert.equal(safety.motionPlan.action_id,'carry');
  assert.equal(safety.motionPlan.camera_mode,'follow_same_view');
  assert(submitted.includes('carrier carries the product'));
  assert(submitted.includes('EVERY instant'));
  assert(submitted.includes('No yaw, pitch, roll'));
  assert(submitted.includes('never invent straps'));
  assert(opening.includes('unchanged grip from frame zero'));
  const verbosePlan={...story.motion_plan,strategy:'Harmless scene context. '.repeat(50)};
  const compiled=motion.renderKlingStructuredMotion(verbosePlan,intelligence);
  assert.equal(compiled,motion.renderKlingStructuredMotion(story.motion_plan,intelligence));
  const assembled=assembleKlingPrompt({safety:ctx.getKlingProviderSafetyPrefix(safety),direction:compiled,maxCreative:2450});
  assert(assembled.endsWith(compiled),'complete action survives provider budget');
  assert(validateKlingCreativeDirection(compiled).ok);
  assert.equal(safety.motionPlan.execution_policy,'direct_kling_execution_v366');
  assert.equal(safety.motionPlan.preflight,null);
}
const garment={physical_subject:{kind:'physical_product',motion_material:'deformable_garment'}};
assert.equal(motion.klingSourceViewStagingInstruction(garment),'');
assert.equal(motion.klingProductGeometryInstruction(garment),garmentBaseline.geometry,'garment opening instructions byte-identical to 144.381');
assert.equal(ctx.getKlingProviderSafetyPrefix({productIntelligence:garment}),garmentBaseline.providerSafety,'garment Kling locks byte-identical to 144.381');
assert(garmentBaseline.geometry.includes('purposeful steps and fabric drape'));
console.log('PASS 144.383: actual planner→opening→provider retains evidenced carrying, full source-view direction fits with long story prose, no added calls or reviewers, garment instructions unchanged.');
