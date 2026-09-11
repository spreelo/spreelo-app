import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostRescueProductCount, POST_RESCUE_TYPES, resolvePostRescueType } from "../lib/postRescueFormat.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const types = read("lib/postRescueFormat.js");
const page = read("app/admin/post-approvals/page.jsx");
const rescueImport = read("app/api/admin/post-approvals/rescue-import/route.js");
const regenerateAny = read("app/api/admin/post-approvals/regenerate-any/route.js");
const regenerateCarousel = read("app/api/admin/post-approvals/regenerate/route.js");
const regenerateProduct = read("app/api/admin/post-approvals/regenerate-product/route.js");
const automations = read("app/api/cron/run-automations/route.js");
const klingFinalizer = read("app/api/cron/finalize-kling-videos/route.js");
const labels = read("lib/i18n/defaultLabels.js");

// Rescue is format aware instead of forcing every failed item into products[].
for (const rescueType of [
  "single_product",
  "product_carousel",
  "product_reel",
  "ai_product_video",
  "source_research",
]) {
  assert.match(types, new RegExp(`"${rescueType}"`, "u"));
}
assert.match(types, /PRODUCT_CAROUSEL\) return 5/u);
assert.match(types, /SOURCE_RESEARCH/u);
assert.equal(resolvePostRescueType({ content_type_id: "website_item" }), POST_RESCUE_TYPES.SINGLE_PRODUCT);
assert.equal(resolvePostRescueType({ content_type_id: "website_item_text_ad" }), POST_RESCUE_TYPES.SINGLE_PRODUCT);
assert.equal(resolvePostRescueType({ content_type_id: "carousel_website_item" }), POST_RESCUE_TYPES.PRODUCT_CAROUSEL);
assert.equal(resolvePostRescueType({ content_type_id: "animated_website_item" }), POST_RESCUE_TYPES.PRODUCT_REEL);
assert.equal(resolvePostRescueType({ content_type_id: "ai_product_video" }), POST_RESCUE_TYPES.AI_PRODUCT_VIDEO);
assert.equal(resolvePostRescueType({ content_type_id: "faq" }), POST_RESCUE_TYPES.SOURCE_RESEARCH);
assert.equal(getPostRescueProductCount({ content_type_id: "carousel_website_item" }), 5);
assert.equal(getPostRescueProductCount({ content_type_id: "ai_product_video" }), 1);
assert.equal(getPostRescueProductCount({ content_type_id: "faq" }), 0);
assert.match(page, /"version": 3/u);
assert.match(page, /"rescue_type": "source_research"/u);
assert.match(page, /PRODUCT_CONTENT_TYPE_IDS[\s\S]{0,300}"ai_product_video"/u);
assert.match(page, /verified_context/u);
assert.match(page, /This is NOT a product rescue/u);
assert.match(rescueImport, /rescueType === POST_RESCUE_TYPES\.SOURCE_RESEARCH/u);
assert.match(rescueImport, /verified_context:/u);
assert.match(rescueImport, /sources:/u);
assert.match(rescueImport, /parsedUrl\.protocol !== "https:"/u);
assert.match(rescueImport, /products: \[\]/u);
assert.match(regenerateAny, /buildRescueFocusedPageContext/u);
assert.match(regenerateAny, /rescueData\?\.verified_context/u);

// A carousel is now five verified product slides, planned once by Sol, with no sixth outro.
assert.doesNotMatch(automations, /generateCarouselOutroSlideImage/u);
assert.match(automations, /CAROUSEL_CREATIVE_MODEL[\s\S]{0,120}"gpt-5\.6-sol"/u);
assert.match(automations, /export async function generateProductCarouselCreativePlan/u);
assert.match(automations, /There is NO sixth\/outro slide/u);
assert.match(automations, /caption:[\s\S]{0,800}design_brief:[\s\S]{0,1600}slides:/u);
assert.match(automations, /normalized\.slides\.length !== CAROUSEL_PRODUCT_SLIDE_TARGET/u);
assert.match(automations, /export async function generateDesignedCarouselProductSlide/u);
assert.match(automations, /openai\.images\.edit/u);
assert.match(automations, /LOCKED CUSTOMER-FACING TEXT/u);
assert.match(automations, /reviewKlingOpeningSceneIdentity/u);
assert.match(automations, /preserving verified source image instead of risking product identity/u);
assert.match(automations, /The carousel itself owns all five GPT-Image-2 calls/u);
assert.match(automations, /no extra AI cover image is generated/u);
assert.match(regenerateCarousel, /generateProductCarouselCreativePlan/u);
assert.match(regenerateCarousel, /generateDesignedCarouselProductSlide/u);
assert.doesNotMatch(regenerateCarousel, /generateCarouselOutroSlideImage/u);
assert.doesNotMatch(regenerateCarousel, /preserveOutro/u);
assert.match(labels, /There is no separate sixth outro slide/u);

// AI product-video Rescue never retries the failed post: it creates a fresh post and submits one fresh Kling task.
assert.match(regenerateProduct, /workItemRescueType === "ai_product_video"/u);
assert.match(regenerateProduct, /isAiProductVideoRescue/u);
assert.match(regenerateProduct, /AI_PRODUCT_VIDEO_RESCUE_ALREADY_USED/u);
assert.match(regenerateProduct, /\.eq\("rescue_status", "ready"\)/u);
assert.match(regenerateProduct, /ai_product_video_rescue_claim/u);
assert.match(regenerateProduct, /post = null;/u);
assert.match(regenerateProduct, /automation_admin_rescue_new_video_run/u);
assert.match(regenerateProduct, /submitAdminRescueAiProductVideo/u);
assert.match(regenerateProduct, /format: "ai_product_video_rescue"/u);
assert.match(automations, /export async function submitAdminRescueAiProductVideo/u);
assert.match(automations, /claim_kling_video_generation/u);
const helperStart = automations.indexOf("export async function submitAdminRescueAiProductVideo({");
const helperEnd = automations.indexOf("\nfunction normalizeSlideText", helperStart);
const rescueVideoFn = helperStart >= 0 && helperEnd > helperStart ? automations.slice(helperStart, helperEnd) : "";
assert.ok(rescueVideoFn, "AI product-video Rescue helper should be present");
assert.equal((rescueVideoFn.match(/submitKlingImageToVideo\(/gu) || []).length, 1, "Rescue must submit Kling exactly once");
assert.match(klingFinalizer, /admin_generation_work_items/u);
assert.match(klingFinalizer, /rescue_status: "used"/u);

console.log("v144.168 format-aware Rescue + five-slide Sol/GPT-Image carousel checks passed.");
