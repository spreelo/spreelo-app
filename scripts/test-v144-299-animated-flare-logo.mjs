import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const source = fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const modelCode = source.slice(source.indexOf('const configuredAnimatedOverlayImageModel'),source.indexOf('const INSTAGRAM_GRAPH_API_VERSION'));
function model(override) {
  return vm.runInNewContext(modelCode+'\nANIMATED_OVERLAY_IMAGE_MODEL', {process:{env:{ANIMATED_OVERLAY_IMAGE_MODEL:override}}});
}
for (const override of [undefined,'','gpt-image-2','gpt-image-2-2026-04-21','other','gpt-image-2.5-flare-invalid']) assert.equal(model(override),'gpt-image-2.5-flare');
assert.equal(model('gpt-image-2.5-flare-2026-09-08'),'gpt-image-2.5-flare-2026-09-08');
function extract(start,end) { return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))); }
const transparentLogo = await sharp({create:{width:80,height:40,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="80" height="40"><rect x="10" y="10" width="60" height="20" fill="#2222dd"/></svg>')}]).png().toBuffer();
const ctx = vm.createContext({sharp,Buffer,console,fetchImageBufferForOverlay:async()=>transparentLogo});
vm.runInContext(extract('async function createAnimatedLogoOverlay','async function createAnimatedPoster'),ctx);
const overlay=await ctx.createAnimatedLogoOverlay({brandProfile:{logo_url:'mock'},includeLogo:true});
const {data,info}=await sharp(overlay).raw().toBuffer({resolveWithObject:true});
assert.equal(info.width,1080); assert.equal(info.height,1920);
const alpha=(x,y)=>data[(y*info.width+x)*4+3];
assert.equal(alpha(60,195),0,'Former plate region must stay transparent');
assert.equal(alpha(79,208),255,'Original logo must remain visible');
assert.equal(await ctx.createAnimatedLogoOverlay({brandProfile:{logo_url:'mock'},includeLogo:false}),null);
let request, fallbackCalls=0;
Object.assign(ctx,{
  ANIMATED_OVERLAY_IMAGE_MODEL:model('gpt-image-2'),
  ANIMATED_TEXT_PANEL_SOURCE_WIDTH:1408, ANIMATED_TEXT_PANEL_SOURCE_HEIGHT:480,
  ANIMATED_TEXT_PANEL_LEFT:128, ANIMATED_TEXT_PANEL_TOP:1280, ANIMATED_TEXT_PANEL_WIDTH:824, ANIMATED_TEXT_PANEL_HEIGHT:281,
  ANIMATED_VIDEO_DURATION_SECONDS:5, sampleRemoteVideoFrames:async()=>[],
  ensureTypographyContrast:async({overlayBuffer})=>({buffer:overlayBuffer,analysis:{}}),
  getAnimatedOverlayBackgroundReference:async()=>null,
  getAnimatedOverlayBackgroundLuminance:async()=>0.7,
  getAnimatedOverlayBrightnessLabel:()=> 'light',
  buildAnimatedTextPanelPrompt:()=> 'Typography only',
  toFile:async buffer=>buffer,
  normalizeGeneratedAnimatedTextPanel:async()=>({textOverlayBuffer:Buffer.from('overlay'),analysis:{}}),
  createProfessionalFallbackAnimatedTextOverlay:async()=>{fallbackCalls++; return sharp({create:{width:1080,height:1920,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();}
});
vm.runInContext(extract('async function createAnimatedTextOverlay','async function createAnimatedProductLayer'),ctx);
const args={rule:{id:'test'},productReferenceBuffer:transparentLogo,openai:{images:{edit:async r=>{request=r; return {data:[{b64_json:transparentLogo.toString('base64')}]};}}}};
const result=await ctx.createAnimatedTextOverlay(args);
assert.equal(request.model,'gpt-image-2.5-flare'); assert.equal(request.background,'transparent'); assert.equal(request.output_format,'png'); assert.equal(request.quality,'medium');
assert.equal(result.provider,'gpt-image-2.5-flare-transparent-typography'); assert.equal(fallbackCalls,0);
args.openai.images.edit=async()=>{throw new Error('provider unavailable');};
await assert.rejects(ctx.createAnimatedTextOverlay(args), error => error.code === 'ANIMATED_AI_TYPOGRAPHY_FAILED');
assert.equal(fallbackCalls,0);
console.log('v144.299 model selection, image request and transparent logo checks passed (AI-only text policy).');
