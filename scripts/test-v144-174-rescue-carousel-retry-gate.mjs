import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const rescueRoute = read("app/api/admin/post-approvals/regenerate/route.js");
const automationRoute = read("app/api/cron/run-automations/route.js");

assert.match(rescueRoute, /const ADMIN_CAROUSEL_SLIDE_RENDER_ATTEMPTS = 2;/u,
  "Rescue carousel should make exactly one second render attempt for a failed slide");
assert.match(rescueRoute, /for \(let attempt = 1; attempt <= ADMIN_CAROUSEL_SLIDE_RENDER_ATTEMPTS; attempt \+= 1\)/u,
  "each failed Rescue slide should retry through the same render path");
assert.match(rescueRoute, /sourceImageUrl: product\.image_url,[\s\S]{0,250}websiteItem: product,[\s\S]{0,250}slidePlan,[\s\S]{0,250}designBrief: creativePlan\?\.design_brief \|\| ""/u,
  "retry must keep the same verified product, locked slide plan and shared design brief");
assert.match(rescueRoute, /status: "generating",[\s\S]{0,250}image_status: "generating"/u,
  "a Rescue carousel must stay generating before all five slides are complete");
assert.match(rescueRoute, /rendered_slide: renderedBy !== "source_image_identity_safe_fallback" && !renderError/u,
  "raw source-image fallback must never count as a completed designed slide");
assert.match(rescueRoute, /const renderedSlides = slides\.filter\(\(slide\) => slide\?\.metadata\?\.rendered_slide === true\);/u,
  "completion gate must count truly rendered slides");
assert.match(rescueRoute, /if \(renderedSlides\.length !== 5\)/u,
  "all five slides must be designed before Rescue can resolve");
assert.match(rescueRoute, /slide_generation_status: "failed",[\s\S]{0,150}slide_render_status: renderedSlides\.length > 0 \? "partial" : "none"/u,
  "partial Rescue output must be explicitly marked incomplete");
assert.match(rescueRoute, /status: "needs_repair",[\s\S]{0,350}failure_code: ADMIN_CAROUSEL_RENDER_FAILURE_CODE/u,
  "partial Rescue output must remain in the repair flow");
assert.match(rescueRoute, /rescue_status: "needed"/u,
  "partial Rescue output must remain rescueable rather than being resolved");
assert.match(rescueRoute, /status: "pending_approval",[\s\S]{0,250}slide_generation_status: "ready",[\s\S]{0,150}slide_render_status: "ready"/u,
  "approval-ready status should only exist after the five-of-five gate");

// v144.174 must not alter the normal automatic carousel rendering engine.
for (const required of [
  "generateProductCarouselCreativePlan",
  "generateDesignedCarouselProductSlide",
  "saveCarouselSlidesForPost",
  "SHARED FIVE-SLIDE DESIGN BRIEF",
]) {
  assert.ok(automationRoute.includes(required), `normal carousel engine must retain ${required}`);
}

console.log("v144.174 Rescue carousel retry + strict five-of-five completion gate checks passed.");
