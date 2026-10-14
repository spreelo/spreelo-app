import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const source = fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const modelCode = source.slice(source.indexOf('const configuredAnimatedOverlayImageModel'),source.indexOf('const INSTAGRAM_GRAPH_API_VERSION'));
function model(override) {
  return vm.runInNewContext(modelCode+'\nANIMATED_OVERLAY_IMAGE_MODEL', {process:{env:{ANIMATED_OVERLAY_IMAGE_MODEL:override}},PRODUCT_RESEARCH_MODEL_DEFAULT:"offline",IMAGE_MODEL_DEFAULT:"offline"});
}
for (const override of [undefined,'','gpt-image-2','gpt-image-2-2026-04-21','other','gpt-image-2.5-flare-invalid']) assert.equal(model(override),'gpt-image-2.5-flare');
assert.equal(model('gpt-image-2.5-flare-2026-09-08'),'gpt-image-2.5-flare-2026-09-08');
function extract(start,end) { return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))); }
const transparentLogo = await sharp({create:{width:80,height:40,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="80" height="40"><rect x="10" y="10" width="60" height="20" fill="#2222dd"/></svg>')}]).png().toBuffer();
const ctx = vm.createContext({sharp,Buffer,console,fetchBrandLogoBufferForOverlay:async()=>transparentLogo});
vm.runInContext(extract('async function createAnimatedLogoOverlay','async function createAnimatedPoster'),ctx);
const overlay=await ctx.createAnimatedLogoOverlay({brandProfile:{logo_url:'mock'},includeLogo:true});
const {data,info}=await sharp(overlay).raw().toBuffer({resolveWithObject:true});
assert.equal(info.width,1080); assert.equal(info.height,1920);
const alpha=(x,y)=>data[(y*info.width+x)*4+3];
assert.equal(alpha(60,195),0,'Former plate region must stay transparent');
assert.equal(alpha(79,208),255,'Original logo must remain visible');
assert.equal(await ctx.createAnimatedLogoOverlay({brandProfile:{logo_url:'mock'},includeLogo:false}),null);
// Atlas generation, bounded retries, exact readback and failure policy are exercised
// by test-v144-342-video-design.mjs using the actual current orchestrator.
console.log('v144.299 model selection and original transparent corner logo passed.');
