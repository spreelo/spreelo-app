import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const automation = fs.readFileSync(path.join(root, "app/api/cron/run-automations/route.js"), "utf8");
const finalizer = fs.readFileSync(path.join(root, "app/api/cron/finalize-kling-videos/route.js"), "utf8");
const kling = fs.readFileSync(path.join(root, "lib/kling.js"), "utf8");
const shotstackSource = fs.readFileSync(path.join(root, "lib/shotstack.js"), "utf8");

assert.match(kling, /const DEFAULT_DURATION_SECONDS = 6;/, "Paid Kling generation must remain six seconds by default.");
assert.match(automation, /main visual payoff BEFORE the final second/, "Fallback direction must move the payoff before the ending.");
assert.match(automation, /final 0\.8-1\.0 second/, "Kling must receive a deliberate closing hero-shot window.");
assert.match(automation, /never end during a hand movement, product movement, camera move, reveal or other unfinished action/, "Safety tail must explicitly forbid mid-action endings.");
assert.doesNotMatch(automation, /deliver a satisfying visual payoff by the final second/, "Old last-second payoff direction must be removed.");

assert.match(finalizer, /KLING_CLOSING_HERO_HOLD_SECONDS = 0\.9/, "Post-process must add the agreed 0.9 second hero hold.");
assert.match(finalizer, /fractions: getKlingTextFrameFractions\(durationSeconds, selection\)/, "Typography must sample the actual display interval.");
assert.match(finalizer, /closing_hero_frame_url/, "Closing hero frame must be persisted for retry-safe finalization.");
assert.match(finalizer, /finalVideo\.durationSeconds/, "Final stored duration must reflect the post-processed video, not only the paid Kling source.");
assert.match(shotstackSource, /closingFrameUrl = null/, "Shotstack compositor must accept an optional closing hero frame.");
assert.match(shotstackSource, /closingHoldSeconds = 0\.9/, "Shotstack compositor must default to the agreed hero-hold length.");

const { buildVideoOverlayEdit } = await import(new URL(`../lib/shotstack.js?test=${Date.now()}`, import.meta.url));
const edit = buildVideoOverlayEdit({
  videoUrl: "https://example.com/kling.mp4",
  textOverlayUrl: "https://example.com/type.png",
  closingFrameUrl: "https://example.com/hero.jpg",
  durationSeconds: 6,
  trimStartSeconds: 0.15,
  overlayStartSeconds: 2,
  closingHoldSeconds: 0.9,
});

assert.equal(edit.timeline.tracks[1].clips.length, 2, "Base track must contain Kling motion followed by the hero hold.");
assert.equal(edit.timeline.tracks[1].clips[0].asset.type, "video");
assert.equal(edit.timeline.tracks[1].clips[0].length, 5.85);
assert.equal(edit.timeline.tracks[1].clips[1].asset.type, "image");
assert.equal(edit.timeline.tracks[1].clips[1].start, 5.85);
assert.equal(edit.timeline.tracks[1].clips[1].length, 0.9);
assert.equal(edit.timeline.tracks[0].clips[0].length, 4.75, "Typography must remain visible through the held closing frame.");

console.log("v144.44 deliberate Kling ending checks passed");
