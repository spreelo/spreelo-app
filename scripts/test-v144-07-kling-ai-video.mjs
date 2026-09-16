import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const kling = read("lib/kling.js");
const cron = read("app/api/cron/run-automations/route.js");
const finalizer = read("app/api/cron/finalize-kling-videos/route.js");
const migration = read("supabase/v144_07_kling_ai_video.sql");
const automation = read("app/automation/page.jsx");
const formats = read("lib/contentFormatLibrary.js");
const compatibility = read("lib/platformContentCompatibility.js");
const economics = read("lib/contentEconomics.js");
const vercel = read("vercel.json");
const labels = read("lib/i18n/defaultLabels.js");
const adminRegenerate = read("app/api/admin/post-approvals/regenerate-product/route.js");

// Provider adapter supports both Kling credential generations without embedding secrets.
assert(kling.includes("KLING_API_KEY"), "Current Kling API-key configuration missing");
assert(kling.includes("KLING_ACCESS_KEY") && kling.includes("KLING_SECRET_KEY"), "Legacy Kling AK/SK fallback missing");
assert(kling.includes("/image-to-video/"), "Current Kling image-to-video endpoint missing");
assert(kling.includes("/v1/videos/image2video"), "Legacy Kling image-to-video endpoint missing");
assert(kling.includes("NO retry loop"), "Kling submit no-retry invariant is not documented in provider adapter");

// Generation path: product-safe reference, product-specific creative prompt, and an atomic one-shot claim.
assert(cron.includes('content_type_id || "").trim().toLowerCase() === "ai_product_video"'), "AI product-video rule detector missing");
assert(cron.includes("createKlingProductReferenceFrame"), "Product-safe 9:16 Kling reference frame missing");
assert(cron.includes('source: "kling_verified_product_image"'), "Kling path is not using the exact verified source image directly");
assert(cron.includes("buildKlingProductVideoPrompt"), "Product-specific Kling creative prompt builder missing");
assert(cron.includes('supabase.rpc(\n              "claim_kling_video_generation"'), "Atomic Kling generation claim missing");
assert(cron.includes("submitKlingImageToVideo"), "Kling provider submission missing");
const klingSubmitCallCount = (cron.match(/await submitKlingImageToVideo\(/g) || []).length;
const klingClaimCallCount = (cron.match(/"claim_kling_video_generation"/g) || []).length;
assert(klingSubmitCallCount === 3, "Only the normal product-video, admin-rescue product-video and v144.181 engagement-video paths may submit Kling");
assert(klingClaimCallCount === klingSubmitCallCount, "Every Kling provider submission path must have its own atomic one-shot claim");
assert(cron.includes("kling_no_retry: true"), "Terminal no-auto-retry metadata missing");
assert(cron.includes("isShotstackAnimatedVideoRule"), "Shotstack and Kling video paths are not isolated");
assert(cron.includes('String(post?.video_provider || "").trim().toLowerCase() === "kling"'), "Kling drafts are not protected from old Shotstack stale cleanup");
assert(cron.includes('effectivePostStatus = "generating"'), "Async Kling post does not remain generating while task is pending");

// Database-level hard guarantee: 0 -> 1 only, regardless of concurrent workers.
assert(migration.includes("kling_generation_count integer not null default 0"), "Kling generation counter missing");
assert(migration.includes("kling_generation_count >= 0 and kling_generation_count <= 1"), "One-generation database constraint missing");
assert(migration.includes("create or replace function public.claim_kling_video_generation"), "Atomic generation RPC missing");
assert(migration.includes("coalesce(kling_generation_count, 0) = 0"), "Atomic RPC does not guard prior generation");
assert(migration.includes("kling_task_id is null"), "Atomic RPC does not guard existing Kling task id");

// Finalizer may poll/copy the existing provider task, but must never submit a new generation.
assert(finalizer.includes("getKlingImageToVideoTask"), "Kling task polling missing");
assert(!finalizer.includes("submitKlingImageToVideo"), "Finalizer must never submit a Kling generation");
assert(finalizer.includes("No automatic retry was made"), "Failure path does not state no generation retry");
assert(finalizer.includes("post-videos"), "Completed Kling videos are not copied to Spreelo storage");
assert(finalizer.includes('status: "pending_approval"'), "Completed Kling video is not released to normal approval flow");
assert(adminRegenerate.includes("KLING_SINGLE_GENERATION_PER_POST"), "Admin repair can still regenerate a Kling video on the same post");
assert(vercel.includes('"/api/cron/finalize-kling-videos"'), "Kling finalizer cron is missing from Vercel config");

// New content type is visible/selectable and has normal platform/economics metadata.
assert(automation.includes('id: "ai_product_video"'), "AI product video is missing from AI Content Studio");
assert(automation.includes('animationStyle: "kling_product_video"'), "Kling animation style marker missing");
assert(formats.includes('content_type_id: "ai_product_video"'), "AI product video missing from content catalog defaults");
assert(compatibility.includes('ai_product_video: "animated_video"'), "AI product video platform compatibility missing");
assert(economics.includes("ai_product_video: 50"), "AI product video default credit cost missing");
assert(labels.includes('"automation.contentType.ai_product_video.shortLabel": "AI video"'), "AI product-video content label translation missing");
assert(labels.includes('"automation.formatCard.ai_product_video.howItWorks"'), "AI product-video format-card guidance missing");

// v144.07 intentionally leaves paid Kling generation out of automatic plan recipes.
const autoPlanStart = automation.indexOf("const autoPlanStrategies =");
const autoPlanEnd = automation.indexOf("const goalMarketingSequences", autoPlanStart);
const autoPlanSection = automation.slice(autoPlanStart, autoPlanEnd > autoPlanStart ? autoPlanEnd : autoPlanStart + 5000);
assert(!autoPlanSection.includes("ai_product_video"), "AI product video was accidentally added to automatic plan recipes");

// Existing Shotstack product Reel remains available and unchanged as a separate type.
assert(automation.includes('id: "animated_website_item"'), "Existing Animated product Reel disappeared");
assert(cron.includes("generateAnimatedProductVideo"), "Existing Shotstack renderer disappeared");
assert(cron.includes('video_provider: "shotstack"'), "Existing Shotstack provider persistence disappeared");

console.log("v144.07 Kling AI product video + one-generation guard checks passed");

// Provider adapter smoke test with mocked fetch: no network and exactly one POST per submit.
const originalFetch = globalThis.fetch;
const originalEnv = {
  KLING_API_KEY: process.env.KLING_API_KEY,
  KLING_ACCESS_KEY: process.env.KLING_ACCESS_KEY,
  KLING_SECRET_KEY: process.env.KLING_SECRET_KEY,
  KLING_API_FAMILY: process.env.KLING_API_FAMILY,
  KLING_API_BASE_URL: process.env.KLING_API_BASE_URL,
};

try {
  const provider = await import(`../lib/kling.js?smoke=${Date.now()}`);
  process.env.KLING_API_BASE_URL = "https://example.invalid";
  process.env.KLING_API_KEY = "fake-current-key";
  delete process.env.KLING_ACCESS_KEY;
  delete process.env.KLING_SECRET_KEY;
  process.env.KLING_API_FAMILY = "current";

  const currentCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    currentCalls.push({ url: String(url), options });
    if (String(url).includes("/tasks?task_ids=")) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: [{ id: "task-current-1", status: "succeeded", outputs: [{ url: "https://cdn.invalid/video.mp4", duration: 6 }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ code: 0, data: { id: "task-current-1", status: "submitted" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const submitted = await provider.submitKlingImageToVideo({
    imageUrl: "https://images.invalid/product.png",
    prompt: "Keep the product locked.",
    externalTaskId: "post-1",
  });
  assert.equal(submitted.taskId, "task-current-1");
  assert.equal(currentCalls.filter((call) => call.options?.method === "POST").length, 1, "Current Kling submit made more than one POST");
  const currentBody = JSON.parse(currentCalls[0].options.body);
  assert.equal(currentBody.settings.duration, 6);
  assert.equal(currentBody.settings.resolution, "720p");
  assert.equal(currentBody.settings.audio, "off");
  assert.equal(currentBody.settings.multi_shot, false);
  const currentTask = await provider.getKlingImageToVideoTask("task-current-1");
  assert.equal(currentTask.videoUrl, "https://cdn.invalid/video.mp4");
  assert(provider.isKlingTaskSuccessful(currentTask.status));

  delete process.env.KLING_API_KEY;
  process.env.KLING_ACCESS_KEY = "fake-access";
  process.env.KLING_SECRET_KEY = "fake-secret";
  process.env.KLING_API_FAMILY = "legacy";
  const legacyCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    legacyCalls.push({ url: String(url), options });
    if ((options?.method || "GET") === "GET") {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            task_id: "task-legacy-1",
            task_status: "succeed",
            task_result: { videos: [{ url: "https://cdn.invalid/legacy.mp4", duration: 6 }] },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ code: 0, data: { task_id: "task-legacy-1", task_status: "submitted" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const legacySubmitted = await provider.submitKlingImageToVideo({
    imageUrl: "https://images.invalid/product.png",
    prompt: "Keep the product locked.",
    externalTaskId: "post-legacy-1",
  });
  assert.equal(legacySubmitted.taskId, "task-legacy-1");
  assert.equal(legacyCalls.filter((call) => call.options?.method === "POST").length, 1, "Legacy Kling submit made more than one POST");
  assert.match(legacyCalls[0].options.headers.Authorization, /^Bearer /);
  const legacyBody = JSON.parse(legacyCalls[0].options.body);
  assert.equal(legacyBody.model_name, "kling-v3");
  assert.equal(legacyBody.duration, "6");
  assert.equal(legacyBody.sound, "off");
  const legacyTask = await provider.getKlingImageToVideoTask("task-legacy-1");
  assert.equal(legacyTask.videoUrl, "https://cdn.invalid/legacy.mp4");
  assert(provider.isKlingTaskSuccessful(legacyTask.status));
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("v144.07 Kling provider adapter smoke checks passed");
