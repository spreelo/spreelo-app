import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as motion from '../lib/klingVideoIntelligence.js';
import { validateKlingCreativeDirection } from '../lib/klingCreativeSafety.js';
import { assembleKlingPrompt } from '../lib/klingPromptBudget.js';

const garment={physical_subject:{kind:'physical_product',name:'Print on apron',visible_surfaces:['verified front']},visible_identity:['one unique print'],components:[],confidence:0.97,verified_actions:[]};
const proposed={strategy:'Natural ad for verified worn garment',mode:'scene_verified_wear',action_id:'',camera_mode:'follow_same_view',environment_motion:'none',product_pose:'source_locked',shot_count:1,finish_seconds:5,initial_conditions:[],stationary_objects:[],risk:'low'};
assert(motion.KLING_MOTION_VERSION>=350); // later safe motion contracts retain v350 protections
assert(motion.motionPlanIsSupported(proposed,garment));
const direction=motion.renderKlingStructuredMotion(proposed,garment);
assert.match(direction,/two or three clearly visible natural walking steps/);
assert.match(direction,/precise garment outline, print/);
assert(validateKlingCreativeDirection(direction).ok);
for(const unsafe of [
 {...proposed,camera_mode:'orbit'}, {...proposed,shot_count:2},{...proposed,product_pose:'rotate'},
 {...proposed,action_id:'invented_walk'}, {...proposed,risk:'medium'},
 {...proposed,mode:'camera_environment',camera_mode:'follow_same_view'},
])assert(!motion.motionPlanIsSupported(unsafe,garment),'unsafe creative motion was accepted');
assert(!motion.motionPlanIsSupported(proposed,{...garment,physical_subject:{...garment.physical_subject,kind:'packaging'}}));
assert(!motion.motionPlanIsSupported(proposed,{...garment,confidence:0.2}));
const calls=[];
const mk=responses=>({responses:{create:async req=>{calls.push(req);return {output_text:JSON.stringify(responses.shift())};}}});
const ok={identity_safe:true,source_view_safe:true,functions_supported:true,scene_safe:true,causality_safe:true,confidence:.98,reason:'Worn garment and natural gait are directly visible'};
const plan=await motion.planKlingVerifiedMotion({openai:mk([proposed,ok]),model:'fake',intelligence:garment,firstFrameDataUrl:'data:image/png;base64,AA==',viewLock:{verified:'front'},context:{}});
assert.equal(plan.mode,'scene_verified_wear');
assert.equal(plan.source,'scene_aware_cinematic_plan');
assert.equal(plan.motion_prompt,direction);
const disallowed=await motion.planKlingVerifiedMotion({openai:mk([proposed,{...ok,causality_safe:false}]),model:'fake',intelligence:garment,firstFrameDataUrl:'data:image/png;base64,AA=='});
assert.equal(disallowed.source,'safe_cinematic_fallback');
// A rejected motion MUST fall back rather than inventing a wearer.
const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const from=source.indexOf('function getKlingProviderSafetyPrefix(');
const to=source.indexOf('\nfunction getKlingProductPromptFallback(',from);
const start=source.indexOf('async function buildKlingProductVideoPrompt(');
const end=source.indexOf('\nfunction buildKlingEngagementVideoPrompt(',start);
assert(from>0 && to>from && start>to && end>start);
const ctx={...motion,validateKlingCreativeDirection,assembleKlingPrompt,PRODUCT_RESEARCH_FAST_MODEL:'fake',getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>''};
vm.runInNewContext(source.slice(from,to)+'\n'+source.slice(start,end)+'\nthis.build=buildKlingProductVideoPrompt;',ctx);
const safety={productIntelligence:garment,verifiedViewLock:{},fullProductInteractionSafe:true};
const prompt=await ctx.build({openai:mk([proposed,ok]),rule:{},referenceSafety:safety,referenceFrameBuffer:Buffer.from('scene')});
assert.equal(safety.motionPlan.mode,'scene_verified_wear','approved wearable plan was lost to prompt truncation');
assert(prompt.includes(direction),'provider did not receive the complete approved movement');
assert(prompt.includes('SURFACE PRINT LOCK')&&prompt.includes('COMPONENT ROLE LOCK'));
assert(prompt.length<=2450);
console.log('PASS: scene-verified wearer motion, dual-view locks, unsafe rejection, complete submitted prompt');

const main=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const finalize=fs.readFileSync('app/api/cron/finalize-kling-videos/route.js','utf8');
const typography=fs.readFileSync('lib/videoTypographyPreflight.js','utf8');
const repair=fs.readFileSync('lib/videoAdvertisingReadabilityRepair.js','utf8');
assert.match(main,/const preflight=(?:sceneChoice\s*\?\s*)?await ensurePreflightAdvertisingTypography/);
assert.match(finalize,/const preflight=(?:sceneChoice\s*\?\s*)?await ensurePreflightAdvertisingTypography/);
assert.match(typography,/minInkPx/);
assert.match(repair,/size>=minFontSize/);
assert.match(finalize,/videoBackgrounds,box:creativePlan.main_layout|backgroundFrames:videoBackgrounds/);
assert.match(main,/backgroundFrames:composites/);
console.log('PASS: real-resolution ink size contract runs in both animation and preserved-Kling finalizer before visual review');
