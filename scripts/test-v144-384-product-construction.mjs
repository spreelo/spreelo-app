import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import {assembleKlingPrompt} from '../lib/klingPromptBudget.js';
import {validateKlingCreativeDirection} from '../lib/klingCreativeSafety.js';
const source=await sharp({create:{width:80,height:100,channels:3,background:'#547889'}}).png().toBuffer();
const generated=await sharp({create:{width:80,height:100,channels:3,background:'#85976b'}}).png().toBuffer();
const story={concept:'Source-specific useful activity',setting:'Appropriate real-world setting',opening_framing:'Supported actor with product already in use',beat_0_1:'Begin existing movement',beat_1_4:'Move straight with same contact',beat_4_5:'Keep product facing the camera',motion_plan:{strategy:'The established carrier moves straight with the visible handle and unchanged product construction.',mode:'verified_use',action_id:'carry',camera_mode:'follow_same_view',environment_motion:'none',product_pose:'source_locked',shot_count:1,finish_seconds:5,risk:'low',initial_conditions:['Carrier and exact visible handle in contact'],stationary_objects:[]}};
const route=fs.readFileSync(new URL('../app/api/cron/run-automations/route.js',import.meta.url),'utf8');
const extract=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a);return text.slice(a,b);};
function routeContext(text, module=motion){const ctx=vm.createContext({...module,sharp,Buffer,assembleKlingPrompt,validateKlingCreativeDirection,console:{info(){},warn(){}},PRODUCT_RESEARCH_FAST_MODEL:'offline',imageModel:()=> 'offline-image',toFile:async data=>data,truncateText:(s,n)=>String(s||'').slice(0,n),isEngagementAiVideoRule:()=>false,getKlingVerifiedViewInstruction:()=> 'Only the source-evidenced faces.',getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>''});
 vm.runInContext(extract(text,'async function generateKlingDirectSceneOpeningFrame(', 'async function createKlingProductReferenceFrame(')+'\n'+extract(text,'function getKlingProviderSafetyPrefix(', 'function getKlingProductPromptFallback(')+'\n'+extract(text,'async function buildKlingProductVideoPrompt(', 'function buildKlingEngagementVideoPrompt('),ctx);return ctx;}
const ctx=routeContext(route);
const profiles=[
 {name:'Wrist instrument',silhouette:'Rounded rectangular housing with two opposing band attachments',proportions:'Housing long axis joins the upper and lower band attachments',component_relationships:['Display long axis follows the housing long axis between both band attachments'],orientation_anchors:['Crown remains on the right housing edge; display stays upright relative to band'],supported_contacts:['Visible band wraps around wrist without changing the housing']},
 {name:'Equipment carrier',silhouette:'Tall soft-sided carrier with one short handle',proportions:'Handle is narrower than the bag body',component_relationships:['One short handle joins the two visible top attachment points'],orientation_anchors:['Opening remains above the broad front panel'],supported_contacts:['Hand can hold the one visible short handle']},
 {name:'Optical instrument',silhouette:'Wide rigid housing with two front apertures',proportions:'Apertures have equal diameter',component_relationships:['Both apertures share the same horizontal axis'],orientation_anchors:['Visible controls stay above the apertures'],supported_contacts:['One visible central support bears the housing']},
];
for(const profile of profiles){
 const {name,...construction}=profile;
 const evidence={physical_subject:{kind:'physical_product',name,motion_material:'rigid_object',visible_surfaces:['front and one side']},visible_identity:['Original source material'],construction,components:[],verified_actions:[{id:'carry',kind:'carry_straight',action:'Carry straight',target_component:name,evidence_type:'visible_geometry',source_evidence:'Visible load-bearing support',physical_motion_supported:true,preserves_source_view:true,confidence:.99}],unknowns:['Unseen reverse'],confidence:.99};
 const calls=[];let planning='',opening='',imageReference;
 const ai={responses:{create:async(req,options)=>{const schema=req.text.format.name;calls.push(schema);assert.equal(options.maxRetries,0);if(schema==='kling_product_evidence'){assert(req.text.format.schema.required.includes('construction'));assert(req.input[0].content[0].text.includes('which axes align'));return {output_text:JSON.stringify(evidence)};}planning=req.input[0].content[0].text;return {output_text:JSON.stringify(story)};}},images:{edit:async(req,options)=>{calls.push('image');opening=req.prompt;imageReference=req.image;assert.equal(options.maxRetries,0);return {data:[{b64_json:generated.toString('base64')}]};}}};
 const intelligence=await motion.analyzeKlingProductIntelligence({openai:ai,model:'offline',websiteItem:{title:name},sourceDataUrl:`data:image/png;base64,${source.toString('base64')}`});
 assert.deepEqual(intelligence.construction,construction);
 const safety={productIntelligence:intelligence,verifiedViewLock:{verifiedView:'front and one side'}};
 const rule={website_item:{title:name},brand_profile:{business_name:'Fixture'}};
 const frame=await ctx.generateKlingDirectSceneOpeningFrame({openai:ai,rule,sourceImageBuffer:source,referenceSafety:safety});
 assert(Buffer.isBuffer(imageReference));assert(!imageReference.equals(generated),'actual retailer reference is supplied to the image edit');
 for(const observation of [...construction.component_relationships,...construction.orientation_anchors]){assert(planning.includes(observation));assert(opening.includes(observation),'specific product anatomy reaches the actual image request');}
 assert(opening.includes('RELATIVE TO'));assert(opening.includes('not the catalog composition'));assert(opening.includes('A wearer need not be present'));
 const prompt=await ctx.buildKlingProductVideoPrompt({openai:ai,rule,referenceSafety:safety,referenceFrameBuffer:frame.buffer});
 assert.deepEqual(calls,['kling_product_evidence','kling_product_commercial_story_358','image'],'existing three calls only, no review/retry/new inference');
 assert.equal(safety.motionPlan.mode,'verified_use');assert.equal(safety.motionPlan.preflight,null);assert.equal(frame.identityReviewStatus,'disabled');
 assert(prompt.length<=2450);assert(prompt.includes(safety.motionPlan.motion_prompt),'whole verified action fits');
 assert(prompt.includes('established frame-0 angle'));assert(prompt.includes('never invent straps'));assert(prompt.includes('carrier carries'));
 const legacy={...evidence};delete legacy.construction;
 assert.equal(motion.sanitizeKlingProductIntelligence(legacy).construction,null);
 assert.equal(motion.klingProductConstructionInstruction(legacy),'');
 assert.equal(motion.repairKlingCommercialStory(story,legacy).motion_plan.mode,'verified_use');
 for(const invalid of [null,'bad',[],{silhouette:123,component_relationships:[null,{}]}]){
  assert.equal(motion.sanitizeKlingProductIntelligence({...evidence,construction:invalid}).construction,null);
  assert.equal(motion.repairKlingCommercialStory(story,{...evidence,construction:invalid}).motion_plan.mode,'verified_use');
 }
 const bounded=motion.sanitizeKlingProductIntelligence({...evidence,construction:{...construction,silhouette:'x'.repeat(900),component_relationships:Array(300).fill('y'.repeat(900))}}).construction;
 assert.equal(bounded.silhouette.length,160);assert.equal(bounded.component_relationships.length,3);assert(bounded.component_relationships.every(x=>x.length<=160));
}
// Compare actual old/new garment image and planner prompts, not only helper strings.
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/v144384-garment-opening-144383.json',import.meta.url),'utf8'));
const garment={physical_subject:{kind:'physical_product',name:'Fixture garment',motion_material:'deformable_garment'},confidence:.99,components:[],verified_actions:[]};
const garmentStory={...story,motion_plan:{...story.motion_plan,mode:'scene_verified_wear',action_id:'',camera_mode:'locked'}};
const outputs=[];
for(const context of [ctx]){let imagePrompt='',plannerPrompt='';const ai={responses:{create:async req=>{plannerPrompt=req.input[0].content[0].text;return {output_text:JSON.stringify(garmentStory)};}},images:{edit:async req=>{imagePrompt=req.prompt;return {data:[{b64_json:generated.toString('base64')}]};}}};await context.generateKlingDirectSceneOpeningFrame({openai:ai,rule:{website_item:{title:'Fixture garment'}},sourceImageBuffer:source,referenceSafety:{productIntelligence:garment}});outputs.push({imagePrompt,plannerPrompt});}
assert.deepEqual(outputs[0],{imagePrompt:baseline.imagePrompt,plannerPrompt:baseline.plannerPrompt},'garment planner and opening image prompts remain byte-identical with unchanged evidence');
assert.equal(motion.klingProductConstructionInstruction({...garment,construction:profiles[0]}),'');
console.log('PASS 144.384: actual analysis→story→image→Kling path carries distinct construction observations, bounded/backward-compatible data, existing call counts and action budget; unchanged garment prompts.');
