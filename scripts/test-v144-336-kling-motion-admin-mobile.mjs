import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const read = file => fs.readFileSync(file, 'utf8');
const text = read('lib/klingCreativeSafety.js');
const { validateKlingCreativeDirection: validate } = await import(`data:text/javascript,${encodeURIComponent(text)}`);
for (const candidate of [
  'A woman walks in the verified front-facing T-shirt; keep the print unchanged. The camera eases in slowly and the shot settles.',
  'A stroller rolls directly forward without turning or showing a new product side. The parent walks naturally behind it.',
  'A person holds the same verified phone upright and gently taps nothing. The camera tracks alongside without orbiting or exposing the back.',
]) assert.equal(validate(candidate).ok, true, `Expected valid ordinary movement: ${candidate}`);
for (const candidate of [
  'Gradually rotate the camera horizontally around the phone within the permitted angle to reveal the front display, then continue to reveal the disblå back.',
  'Orbit around the product to show its reverse. End on the hero shot.',
  'Flip the phone to display the Apple logo. Finish on a static shot.',
  'Introduce another phone and hold both devices in the two hands. End with a camera push.',
]) assert.equal(validate(candidate).ok, false, `Unsafe creative direction was accepted: ${candidate}`);
const prompt = read('app/api/cron/run-automations/route.js');
assert.match(prompt, /validateKlingCreativeDirection\(creativePrompt\)/);
assert.match(prompt, /natural, ordinary product use and modest physical motion are encouraged/);
assert.match(prompt, /NEVER reveal or interpolate a side\/surface not visible/);
assert.match(prompt, /stroller may roll straight forward/);
assert.doesNotMatch(prompt, /Keep rigid products stationary and mechanically passive/);
assert.match(read('app/api/admin/post-approvals/retry-kling/route.js'), /validateKlingCreativeDirection\(originalCreative\)/);
console.log('PASS: normal shirt/stroller/phone handling allowed; unsafe phone flip/orbit/duplicates rejected before paid generation and on retries');
const page = read('app/admin/post-approvals/page.jsx');
const head=page.slice(page.indexOf('function adminPostFormatLabel('),page.indexOf('function isProductDrivenPost('));
const ctx = {};
vm.runInNewContext(`${head}\nthis.label=adminPostFormatLabel;`,ctx);
const lab=ctx.label;
assert.equal(lab({content_format:'animated_video',video_provider:'shotstack'}),'Animerad video');
assert.equal(lab({content_format:'animated_video',video_provider:'kling'}),'AI-video');
assert.equal(lab({content_format:'animated_video',content_type_id:'ai_product_video'}),'AI-video');
assert.equal(lab({content_format:'single_image'}),'single_image');
assert.match(page,/posts\.map\(\(post\) => adminPostFormatLabel\(post\)\)/);
assert.match(page,/const format = adminPostFormatLabel\(post\);/);
assert.match(page,/adminPostFormatLabel\(selectedPost\)/);
console.log('PASS: admin format labels and filtering separate AI-video vs animated without altering storage types');
const css = read('app/styles/166-v144-336-admin-review-mobile.css');
const nodes = postcss.parse(css).nodes.filter(node=>node.type==='atrule'&&node.name==='media');
assert(nodes.some(node=>node.params.includes('760px')));
assert(nodes.some(node=>node.params.includes('380px')));
assert.match(css,/admin-v74-detail-body/);
assert.match(css,/admin-review-product-grid/);
assert.match(css,/admin-review-actionbar/);
assert.match(css,/grid-template-columns:\s*minmax\(0,1fr\)/);
assert(read('app/globals.css').includes('@import "./styles/166-v144-336-admin-review-mobile.css";'));
console.log('PASS: parsed responsive CSS covers modal, scrolling, product editor, action bar and narrow screens');
