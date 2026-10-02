import fs from 'node:fs';
import assert from 'node:assert/strict';

const route = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');
const finalizer = fs.readFileSync(new URL('../app/api/cron/finalize-kling-videos/route.js', import.meta.url), 'utf8');
const shotstack = fs.readFileSync(new URL('../lib/shotstack.js', import.meta.url), 'utf8');

const must = (source, text, message) => assert(source.includes(text), message);
const mustNot = (source, text, message) => assert(!source.includes(text), message);

must(route, 'full_product_reference', 'Kling must distinguish a sufficiently full reference.');
must(route, 'cropped_or_uncertain_reference', 'Kling must distinguish cropped/uncertain references.');
must(route, 'a fully visible product is NOT the same as a functionally verified product', 'Full references must not be treated as proof of product functionality.');
must(route, 'Apparel may be worn', 'Wearables must remain eligible for obvious natural use instead of floating animation.');
must(route, 'Decorative particles alone are not a concept', 'Particle-only animation must be explicitly rejected.');
must(route, 'never zoom out to complete it', 'Cropped references must not be expanded beyond verified pixels.');
must(route, 'Spreelo adds professional typography after the video is generated', 'Kling itself must not hallucinate readable ad text.');
must(finalizer, 'kling-text-overlay.png', 'Kling must create a durable transparent typography asset after the finished video exists.');
must(finalizer, 'gpt-image-2.5-flare-finished-video-shared-overlay', 'Kling must use GPT-Image-2.5 Flare transparent finished-video typography.');
must(route, 'mode: "kling_professional_advertising_postprocess"', 'Kling posts must persist professional post-process metadata.');
must(route, 'text_overlay_status: "waiting_for_finished_video"', 'The typography generation must wait for the finished video.');
must(route, '? ANIMATED_OVERLAY_IMAGE_MODEL', 'Kling post metadata must report the GPT-Image-2 overlay model.');
must(route, 'Protected retailer direct discovery fetch blocked; continuing with allowed fallback', 'Expected protected-site 403s should no longer be logged as generic red errors.');

must(finalizer, 'buildVideoOverlayEdit', 'Kling finalizer must post-process the generated movie.');
must(finalizer, 'shotstack_render_id', 'Post-process render id must be persisted for idempotent retries.');
must(finalizer, 'Kling professional advertising typography render queued', 'Finalizer must log the professional overlay render.');
must(finalizer, 'Kling professional advertising typography applied', 'Finalizer must log completed typography application.');
must(finalizer, 'recordShotstack', 'Kling post-process render cost must be tracked.');
must(finalizer, 'video_background_selection', 'Finalizer must load persisted Kling post-process state.');
mustNot(finalizer, 'submitKlingImageToVideo', 'Finalizer must never submit a second paid Kling generation.');

must(shotstack, 'export function buildVideoOverlayEdit', 'Shotstack must expose a Kling overlay-only composition.');
must(shotstack, 'overlayStartSeconds = 2.8', 'Professional product typography should enter after the opening hook.');
must(shotstack, 'src: textOverlayUrl', 'Transparent typography must be composited over the Kling movie.');
must(shotstack, 'src: videoUrl', 'The actual Kling movie must remain the base visual.');

const { buildVideoOverlayEdit } = await import(new URL(`../lib/shotstack.js?test=${Date.now()}`, import.meta.url));
const edit = buildVideoOverlayEdit({
  videoUrl: 'https://example.com/kling.mp4',
  textOverlayUrl: 'https://example.com/type.png',
  durationSeconds: 6,
});
assert.equal(edit.output.size.width, 1080);
assert.equal(edit.output.size.height, 1920);
assert.equal(edit.timeline.tracks[0].clips[0].start, 2.8);
assert.equal(edit.timeline.tracks[0].clips[0].asset.src, 'https://example.com/type.png');
assert.equal(edit.timeline.tracks[1].clips[0].asset.src, 'https://example.com/kling.mp4');

console.log('v144.25 professional Kling advertising checks passed');
