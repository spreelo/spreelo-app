import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = fs.readFileSync(path.join(root, "app/api/cron/run-automations/route.js"), "utf8");

const helperStart = route.indexOf("async function finalizeOrdinaryCarouselFromVerifiedCatalog({");
const helperEnd = route.indexOf("\nasync function finalizeCarouselFromStoreMapEarlyExit({", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "ordinary verified-catalog helper must exist");
const helper = route.slice(helperStart, helperEnd);

assert.match(helper, /if \(isCampaignScopedWebsiteRule\(rule\)\) \{\s*return null;\s*\}/u,
  "calendar campaigns must remain isolated from the ordinary early-exit helper");
assert.match(helper, /allowReuseWhenExhausted: true/u,
  "ordinary verified catalog must be allowed to reuse products after fresh rotation is exhausted");
assert.match(helper, /rankedCatalogProducts\.length < CAROUSEL_PRODUCT_SLIDE_TARGET/u,
  "catalog early exit must still require all five products before returning");

const prepStart = route.indexOf("async function prepareCarouselProductsForRule({");
const prepEnd = route.indexOf("\nasync function ", prepStart + 50);
assert.ok(prepStart >= 0 && prepEnd > prepStart, "carousel preparation function must exist");
const prep = route.slice(prepStart, prepEnd);

assert.match(prep, /if \(!isCampaignRule\) \{[\s\S]{0,800}finalizeOrdinaryCarouselFromVerifiedCatalog/u,
  "all ordinary source scopes should try their verified catalog before crawling again");
assert.match(prep, /if \(isCampaignRule \|\| contentSourceScope === "whole_website"\) \{/u,
  "brand-wide catalog loading must remain limited to campaigns and whole-site ordinary rules");
assert.match(prep, /contentSourceScope === "product_category" \|\| contentSourceScope === "focus_page"/u,
  "focused source flow must remain present");

const focusedStart = prep.indexOf('if (contentSourceScope === "product_category" || contentSourceScope === "focus_page")');
const focusedEnd = prep.indexOf("\n  let triedStoreSearchForCampaign", focusedStart);
assert.ok(focusedStart >= 0 && focusedEnd > focusedStart, "focused carousel block must exist");
const focused = prep.slice(focusedStart, focusedEnd);
const firstFresh = focused.indexOf("allowReuseWhenExhausted: false");
const secondReuse = focused.indexOf("allowReuseWhenExhausted: true", firstFresh + 1);
assert.ok(firstFresh >= 0 && secondReuse > firstFresh,
  "focused categories must try fresh products first and only then allow reuse");

const ordinaryReuseStart = prep.indexOf("if (!isCampaignRule && selectedProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES)");
assert.ok(ordinaryReuseStart >= 0, "ordinary final completion fallback must exist");
const ordinaryReuseBlock = prep.slice(ordinaryReuseStart, ordinaryReuseStart + 900);
assert.match(ordinaryReuseBlock, /allowReuseWhenExhausted: true/u,
  "ordinary final completion fallback must reuse verified products instead of failing for rotation alone");

// Campaign product relevance remains protected: used products can only enter
// through the existing campaign-aware delivery ladder and senior review.
for (const required of [
  "getSafeCampaignProductCandidates",
  "selectCampaignCarouselProductsWithSeniorFinalReview",
  "allowCampaignReuseAfterExhausted",
  "selectCampaignCarouselProductsByDeliveryLadder",
]) {
  assert.ok(prep.includes(required), `campaign path must retain ${required}`);
}

// Main design/rendering contract is intentionally untouched by v144.173.
for (const required of [
  "generateProductCarouselCreativePlan",
  "saveCarouselSlidesForPost",
  "generateDesignedCarouselProductSlide",
]) {
  assert.ok(route.includes(required), `carousel rendering path must retain ${required}`);
}

console.log("v144.173 carousel fresh-first + safe reuse completion checks passed.");
