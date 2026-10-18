import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import * as motion from '../lib/klingVideoIntelligence.js';
import {assembleKlingPrompt,KLING_SAFE_PROMPT_LIMIT} from '../lib/klingPromptBudget.js';
import {validateKlingCreativeDirection} from '../lib/klingCreativeSafety.js';
const actual=[
 'Man stands naturally next to picnic table wearing the dark blue diver T-shirt fully visible front, picks up diving mask to connect theme, camera zooms in on shirt print.',
 'Man wearing dark blue diver T-shirt stands naturally by picnic table, picks up diving mask to link theme, camera zooms in on shirt print front visible and readable.'
];
assert.deepEqual(actual.map(s=>s.length),[169,164]);
const intelligence={physical_subject:{kind:'physical_product',name:'Verified product'},confidence:.95,verified_actions:[],components:[]};
const plan=strategy=>({strategy,mode:'scene_verified_wear',action_id:'',camera_mode:'locked',environment_motion:'none',product_pose:'source_locked',shot_count:1,finish_seconds:5,initial_conditions:['The supported wearer and props are established from frame zero'],stationary_objects:['table'],risk:'low'});
const story=p=>({concept:'Product-specific movement',setting:'An established setting',opening_framing:'Supported wearer and exact product front visible',beat_0_1:'Action starts',beat_1_4:'Continuous action',beat_4_5:'Product remains prominent',motion_plan:p});
const route=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(start,end)=>{const a=route.indexOf(start),b=route.indexOf(end,a);assert(a>=0&&b>a);return route.slice(a,b);};
const ctx=vm.createContext({...motion,assembleKlingPrompt,validateKlingCreativeDirection,console:{info(){}},PRODUCT_RESEARCH_FAST_MODEL:'offline',getCustomerFacingCampaignTheme:()=>'',formatCampaignIdentityLockForPrompt:()=>''});
vm.runInContext(extract('function getKlingProviderSafetyPrefix(','function getKlingProductPromptFallback(')+'\n'+extract('async function buildKlingProductVideoPrompt(','function buildKlingEngagementVideoPrompt('),ctx);
const safety=ctx.getKlingProviderSafetyPrefix({});
const frame=await sharp({create:{width:32,height:32,channels:3,background:'#223344'}}).png().toBuffer();
const longer='The supported wearer takes purposeful steps along the established path, keeping the same verified product front visible to the camera and its exact printed design unobscured as the camera follows at the same viewing angle, with natural weight transfer, realistic fabric response through the middle of the shot before settling into a clear product-focused finish.';
let planningCalls=0;
for(const strategy of [...actual,longer]){
 const openai={responses:{create:async()=>{planningCalls++;return {output_text:JSON.stringify(story(plan(strategy)))};}}};
 const prepared=await motion.planKlingCommercialStory({openai,model:'offline',intelligence,sourceDataUrl:'data:image/png;base64,fixture'});
 assert.equal(prepared.status,'planned');assert.equal(prepared.validation_attempts.length,1);assert.deepEqual(prepared.validation_attempts[0].problems,[]);
 const referenceSafety={productIntelligence:intelligence,commercialStory:prepared};
 const prompt=await ctx.buildKlingProductVideoPrompt({openai:{responses:{create:async()=>{throw Error('No new motion reviewer');}}},rule:{website_item:{title:'Verified product'}},referenceFrameBuffer:frame,referenceSafety});
 assert(prompt.includes(strategy),'full approved action reaches the actual worker prompt');
 assert(prompt.length<=KLING_SAFE_PROMPT_LIMIT);
 assert.equal(referenceSafety.motionPlan.execution_policy,'direct_kling_execution_v366');
 assert.equal(referenceSafety.motionPlan.submitted_prompt,referenceSafety.motionPlan.motion_prompt);
 for(const lock of ['HARD PRODUCT LOCK','SURFACE PRINT LOCK','COMPONENT ROLE LOCK','FUNCTION LOCK'])assert(prompt.includes(lock));
}
assert.equal(planningCalls,3,'one existing planning request for each valid story; no retry for length');
// The legacy 1200-character creative allocation must not reject a complete
// prepared story when the entire request still fits the existing safe limit.
let extended='The supported wearer moves along the established path';
while(motion.renderKlingStructuredMotion(plan(extended+'.'),intelligence).length<=1200)extended+=' with the same front visible';
extended+='.';
const complete=motion.renderKlingStructuredMotion(plan(extended),intelligence);
assert(complete.length>1200);assert(`${safety} CREATIVE DIRECTION: ${complete}`.length<=KLING_SAFE_PROMPT_LIMIT);
const prompt=await ctx.buildKlingProductVideoPrompt({openai:{},rule:{},referenceFrameBuffer:frame,referenceSafety:{productIntelligence:intelligence,commercialStory:{...story(plan(extended)),status:'planned'}}});assert(prompt.includes(extended));
const tooLong={...story(plan('The supported wearer moves. '.repeat(120))),status:'planned'};
await assert.rejects(()=>ctx.buildKlingProductVideoPrompt({openai:{},rule:{},referenceFrameBuffer:frame,referenceSafety:{productIntelligence:intelligence,commercialStory:tooLong}}),e=>e.code==='KLING_PROMPT_TOO_LONG'&&/2450/.test(e.message),'genuine full-request overflow is explicit, not a creative-review failure');
console.log('PASS 144.370: reported 169/164-character stories accepted once; complete >180-character actions and >1200-character directions preserved through real worker; existing whole-request limit and identity locks retained, no new review or paid retries');
