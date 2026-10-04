import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const image=await sharp({create:{width:20,height:20,channels:4,background:'red'}}).png().toBuffer();
let rejected=0;
const requests=[];
const ctx=vm.createContext({sharp,Buffer,console:{info(){},warn(){}},
 ANIMATED_OVERLAY_IMAGE_MODEL:'gpt-image-2.5-flare',ANIMATED_TEXT_PANEL_SOURCE_WIDTH:1408,ANIMATED_TEXT_PANEL_SOURCE_HEIGHT:480,
 ANIMATED_VIDEO_DURATION_SECONDS:5,sampleRemoteVideoFrames:async()=>[],ensureTypographyContrast:async({overlayBuffer})=>({buffer:overlayBuffer,analysis:{}}),
 getAnimatedOverlayBackgroundReference:async()=>null,getAnimatedOverlayBackgroundLuminance:async()=>100,
 getAnimatedOverlayBrightnessLabel:()=> 'medium',buildAnimatedTextPanelPrompt:()=> 'Make room',toFile:async b=>b,
 normalizeGeneratedAnimatedTextPanel:async()=>{if(rejected++===0)throw new Error('opaque card');return {textOverlayBuffer:image,analysis:{}};}});
vm.runInContext(extract('async function createAnimatedTextOverlay','async function createAnimatedProductLayer'),ctx);
const args={rule:{id:'test'},productReferenceBuffer:image,openai:{images:{edit:async r=>{requests.push(r);return {data:[{b64_json:image.toString('base64')}]};}}}};
const result=await ctx.createAnimatedTextOverlay(args);
assert.equal(requests.length,2);assert(requests.every(r=>r.model==='gpt-image-2.5-flare'));
assert(requests[1].prompt.includes('opaque card'));assert(requests[1].prompt.includes('genuinely transparent'));
assert.equal(result.provider,'gpt-image-2.5-flare-transparent-typography');
let calls=0;ctx.normalizeGeneratedAnimatedTextPanel=async()=>{throw new Error('opaque card');};
args.openai.images.edit=async()=>{calls++;return {data:[{b64_json:image.toString('base64')}]};};
await assert.rejects(ctx.createAnimatedTextOverlay(args),e=>e.code==='ANIMATED_AI_TYPOGRAPHY_FAILED');assert.equal(calls,2);
calls=0;args.openai.images.edit=async()=>{calls++;throw Object.assign(new Error('no credits remaining'),{status:429});};
await assert.rejects(ctx.createAnimatedTextOverlay(args),e=>e.code==='ANIMATED_AI_TYPOGRAPHY_FAILED');assert.equal(calls,1);
const transientCtx=vm.createContext({isProtectedProductResearchRetryError:()=>false});
vm.runInContext(extract('function isTransientAutomationError','function buildDeterministicDeliveryCopy'),transientCtx);
assert.equal(transientCtx.isTransientAutomationError({code:'ANIMATED_AI_TYPOGRAPHY_FAILED',message:'provider request timed out'}),false);
assert.equal(transientCtx.isTransientAutomationError({message:'Shotstack timeout'}),true);
assert(!source.includes('createProfessionalFallbackAnimatedTextOverlay'));
assert(source.includes('["ANIMATED_AI_TYPOGRAPHY_FAILED","SHOTSTACK_SUBMISSION_UNKNOWN","SHOTSTACK_RENDER_FAILED","SHOTSTACK_CHECKPOINT_SAVE_FAILED"].includes(videoError?.code)'));
assert(source.includes('throw animatedVideoFinalError;'));
console.log('v144.303: same-model corrective retry, two-call limit, billing stop and terminal AI-only text failure passed.');
