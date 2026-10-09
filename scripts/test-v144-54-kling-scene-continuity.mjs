import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const cron = read("app/api/cron/run-automations/route.js");
const kling = read("lib/kling.js");
const finalizer = read("app/api/cron/finalize-kling-videos/route.js");
const retry = read("app/api/admin/post-approvals/retry-kling/route.js");
const admin = read("app/admin/post-approvals/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");

// Paid Kling generation gets a fixed-world continuity lock before any creative prose,
// so Kling's own 2500-character provider limit cannot cut off the safety rules.
assert.match(cron, /function getKlingProviderSafetyPrefix/);
assert.match(cron, /HARD PRODUCT LOCK: frame 0 is authoritative/);
assert.match(cron, /SCENE CONTINUITY LOCK: frame 0 is one fixed physical set filmed by a real camera/);
assert.match(cron, /never add anything to an area already shown empty/);
assert.match(cron, /People, animals, vehicles and moving props enter\/leave only through continuous motion/);
assert.match(cron, /return assembleKlingPrompt\(\{ safety: providerSafety, closing: closingDirection, direction: creativePrompt, maxCreative: 950 \}\)/);
assert.match(cron, /return assembleKlingPrompt\(\{ safety: providerSafety, direction, maxCreative: 950 \}\)/);
assert.match(kling, /KLING_PROMPT_TOO_LONG/);
assert.doesNotMatch(cron, /return truncateText\(`\$\{creativePrompt\} \$\{safetyTail\}`/);

// The creative-director call itself is also told to design one persistent physical world.
assert.match(cron, /SCENE CONTINUITY SAFETY:/);
assert.match(cron, /treat frame 0 as a fixed real-world set/);
assert.match(cron, /never create a new object in a region that the camera already showed as empty/);
assert.match(cron, /if a creative idea conflicts with scene continuity, simplify the action rather than regenerate the world/);

// Manual retry must put the retry locks before the original prompt, including for older rejected posts.
assert.match(retry, /ADMIN RETRY SCENE CONTINUITY LOCK/);
assert.match(retry, /Never add anything to an area already shown empty/);
assert.match(retry, /No pop-in, pop-out, teleporting, duplication or unexplained disappearance/);
assert.match(retry, /assembleKlingPrompt\(\{ safety: retryLock, direction: creative, maxCreative: 1200 \}\)/);

// Finished-video audit reuses the same AI call and now checks temporal scene continuity too.
assert.match(finalizer, /scene_continuity_preserved/);
assert.match(finalizer, /static_environment_geometry_preserved/);
assert.match(finalizer, /object_materialized_or_disappeared/);
assert.match(finalizer, /scene_continuity_broken/);
assert.match(finalizer, /environment_geometry_changed/);
assert.match(finalizer, /object_appeared_or_disappeared/);
assert.match(finalizer, /reject a bench\/object that materializes in a region previously visible and empty/);
assert.match(finalizer, /parsed\?\.scene_continuity_preserved === true/);
assert.match(finalizer, /parsed\?\.object_materialized_or_disappeared !== true/);

// Admin explains scene failures with human-readable reasons and keeps the Kling-only retry flow.
assert.match(admin, /klingViolationSceneContinuity/);
assert.match(admin, /klingViolationEnvironmentGeometry/);
assert.match(admin, /klingViolationObjectAppeared/);
assert.match(labels, /physical scene changed in a way that breaks real-world continuity/);
assert.match(labels, /object appeared or disappeared without a physically continuous explanation/);

console.log("v144.54 Kling scene-continuity + provider-priority regression checks passed");
