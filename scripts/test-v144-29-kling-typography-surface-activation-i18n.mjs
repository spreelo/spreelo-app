import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(file, "utf8");
const worker = read("app/api/cron/run-automations/route.js");
const finalizer = read("app/api/cron/finalize-kling-videos/route.js");
const automation = read("app/automation/page.jsx");
const translationRoute = read("app/api/ui-translations/route.js");
const uiHook = read("lib/i18n/useUiText.js");
const swedish = read("lib/i18n/builtInLocaleLabels.js");
const compatibility = read("lib/platformContentCompatibility.js");

// Copy comes from the existing post-text generation, then GPT-Image-2 renders exactly once after Kling.
assert(worker.includes("AI product video overlay-copy rule"));
assert(worker.includes("buildKlingAdvertisingOverlayCopy"));
assert(worker.includes('text_overlay_status: "waiting_for_finished_video"'));
assert(!worker.includes("const klingTextOverlay = await createKlingAdvertisingTypographyOverlay({"));
assert(finalizer.includes("createFinishedKlingTypographyOnce"));
assert(finalizer.includes('model: KLING_TYPOGRAPHY_MODEL'));
assert(finalizer.includes('background: "transparent"'));
assert(finalizer.includes('output_format: "png"'));
assert(finalizer.includes('size: "1024x1536"'));
assert(finalizer.includes("real frames from the FINISHED video"));
assert(finalizer.includes("EXACT VISIBLE TEXT"));
assert(finalizer.includes("text_overlay_generation_attempts: 1"));
assert(finalizer.includes("one allowed GPT-Image-2.5 Flare typography generation"));
assert(finalizer.includes("gpt-image-2.5-flare-finished-video-shared-overlay"));
assert(finalizer.includes("fully transparent with alpha = 0"));

// Product view/surface is fail-closed through the entire finished video.
assert(worker.includes("analyzeKlingVerifiedViewLock"));
assert(worker.includes("A back-only retailer image verifies the back only; a later video must never show the front"));
assert(worker.includes("If the retailer image verifies only the BACK"));
assert(finalizer.includes("validateKlingVideoProductView"));
assert(finalizer.includes("ANY frame showing the front is a failure"));
assert(finalizer.includes("unverified_surface_exposed_any_frame"));
assert(finalizer.includes("fractions: [0.08, 0.22, 0.38, 0.54, 0.70, 0.84, 0.95]"));
assert(finalizer.includes('"kling_product_surface_validation"'));

// Plan activation confirmation is explicit and leads directly to the AI calendar.
assert(automation.includes("showPlanActivatedModal && savedPlanSummary"));
assert(automation.includes('window.location.href = "/calendar"'));
assert(automation.includes('t("automation.planActivated.viewCalendar")'));
assert(automation.includes("savedPlanSummary.firstPostLabel"));

// Swedish critical planner flow is deterministic; other locales use validated packs.
for (const key of [
  "layout.nav.admin",
  "layout.planLabel",
  "automation.contentType.mini_guide.label",
  "automation.giveaway.slotRole",
  "automation.planActivated.title",
  "automation.planActivated.viewCalendar",
]) {
  assert(swedish.includes(`"${key}"`), `Missing Swedish critical label ${key}`);
}
assert(uiHook.includes('TRANSLATION_CACHE_VERSION = "v22"'));
assert(translationRoute.includes("One bounded repair pass"));
assert(translationRoute.includes("deferred_keys"));
assert(uiHook.includes("6 * 60 * 60 * 1000"));

// Pinterest/TikTok compatibility from v144.26 remains intact.
assert(compatibility.includes('animated_video: { mode: "native" }'));
assert(worker.includes('source_type: "video_id"'));
assert(worker.includes("transientPinterestFailure || transientTikTokFailure || publishAttempt < MAX_PUBLISH_ATTEMPTS"));

console.log("v144.29 Kling typography + product surface + activation + i18n + platform regression checks passed");
