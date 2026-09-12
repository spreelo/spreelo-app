import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = fs.readFileSync(path.join(root, "app/api/cron/run-automations/route.js"), "utf8");

const helperStart = route.indexOf("async function finalizeOrdinaryCarouselFromVerifiedCatalog({");
const helperEnd = route.indexOf("\nasync function finalizeCarouselFromStoreMapEarlyExit({", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Ordinary carousel verified-catalog helper must exist");
const helper = route.slice(helperStart, helperEnd);
assert.match(helper, /if \(isCampaignScopedWebsiteRule\(rule\)\) \{\s*return null;\s*\}/u,
  "Calendar campaigns must be blocked from ordinary catalog early-exit helper");
assert.match(helper, /selectCarouselProductsFromPool\(/u);
assert.match(helper, /rankedCatalogProducts\.length < CAROUSEL_PRODUCT_SLIDE_TARGET/u);
assert.match(helper, /selectedProducts = rankedCatalogProducts\.slice\(0, CAROUSEL_PRODUCT_SLIDE_TARGET\)/u);
assert.match(helper, /markWebsiteProductCatalogItemUsed/u);
assert.match(helper, /ordinary_carousel_catalog_early_exit/u);

const prepStart = route.indexOf("async function prepareCarouselProductsForRule({");
const prepEnd = route.indexOf("\nasync function ", prepStart + 50);
assert.ok(prepStart >= 0 && prepEnd > prepStart, "Carousel preparation function must exist");
const prep = route.slice(prepStart, prepEnd);

assert.match(prep, /if \(isCampaignRule \|\| contentSourceScope === "whole_website"\) \{/u,
  "Whole-site ordinary carousels must load brand-wide verified catalog rows before discovery");
assert.match(prep, /if \(!isCampaignRule\) \{[\s\S]{0,700}finalizeOrdinaryCarouselFromVerifiedCatalog/u,
  "Ordinary carousels may use their verified catalog before discovery; focused scopes remain source-scoped");

const earlyExitPos = prep.indexOf("finalizeOrdinaryCarouselFromVerifiedCatalog({");
const storeMapPos = prep.indexOf("await runStoreMapProductAgentOnce();");
assert.ok(earlyExitPos >= 0 && storeMapPos > earlyExitPos,
  "Verified ordinary catalog selection must run before expensive Store Map discovery");

// Calendar campaign product selection must remain campaign-first and theme-aware.
for (const requiredCampaignSignal of [
  "Campaign product search queries prepared",
  "productSearchQueries:",
  "productMatchTerms:",
  "getCampaignThemeContract(rule)",
  "getSafeCampaignProductCandidates",
  "selectCampaignCarouselProductsWithSeniorFinalReview",
  'reviewPass: "initial"',
]) {
  assert.ok(prep.includes(requiredCampaignSignal), `Campaign path must retain ${requiredCampaignSignal}`);
}
assert.match(prep, /if \(isCampaignRule\) \{[\s\S]{0,1000}Campaign product search queries prepared/u);
assert.ok(!helper.includes("product_search_queries"), "Ordinary helper must not reinterpret campaign search metadata");
assert.ok(!helper.includes("product_match_terms"), "Ordinary helper must not reinterpret campaign match metadata");

console.log("v144.169 ordinary carousel shared-catalog + campaign-isolation checks passed.");
