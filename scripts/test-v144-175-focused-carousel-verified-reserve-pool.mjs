import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = fs.readFileSync(path.join(root, "app/api/cron/run-automations/route.js"), "utf8");

// The focused ordinary recovery pool must be source-safe and must not use the
// broad hasWebsiteItemAlreadyBeenUsed() helper, because catalog usage itself
// would make every brand-wide used product look like a focused match.
const matchStart = route.indexOf("function websiteCatalogItemMatchesFocusedHistory(");
const matchEnd = route.indexOf("\nfunction websiteCatalogItemBelongsToFocusedSource(", matchStart);
assert.ok(matchStart >= 0 && matchEnd > matchStart, "focused-history identity matcher must exist");
const matchHelper = route.slice(matchStart, matchEnd);
assert.ok(!matchHelper.includes("hasWebsiteItemAlreadyBeenUsed("),
  "focused-history recovery must match exact product identity, not generic used-state");
assert.match(matchHelper, /itemUrl && usedUrl && itemUrl === usedUrl/u,
  "focused-history recovery must support exact product URL identity");
assert.match(matchHelper, /itemTitle && usedTitle && itemTitle === usedTitle/u,
  "focused-history recovery must support exact title identity");
assert.match(matchHelper, /itemImage && usedImage && itemImage === usedImage/u,
  "focused-history recovery must support exact image identity");

const belongsStart = route.indexOf("function websiteCatalogItemBelongsToFocusedSource(");
const belongsEnd = route.indexOf("\nfunction getFocusedOrdinaryVerifiedCatalogPool(", belongsStart);
assert.ok(belongsStart >= 0 && belongsEnd > belongsStart, "focused-source membership helper must exist");
const belongsHelper = route.slice(belongsStart, belongsEnd);
for (const field of ["source_url", "store_map_node_url", "category_urls"]) {
  assert.ok(belongsHelper.includes(field), `focused-source membership must inspect ${field}`);
}
assert.match(belongsHelper, /candidate === focused \|\| candidate\.startsWith\(`\$\{focused\}\/`\)/u,
  "focused-source membership must allow the selected category and its descendants only");

const prepStart = route.indexOf("async function prepareCarouselProductsForRule({");
const prepEnd = route.indexOf("\nasync function ", prepStart + 50);
assert.ok(prepStart >= 0 && prepEnd > prepStart, "carousel preparation function must exist");
const prep = route.slice(prepStart, prepEnd);

assert.match(prep, /const isFocusedOrdinaryCarousel =\s*!isCampaignRule/u,
  "focused reserve recovery must be ordinary-only");
assert.match(prep, /sourceUrl: websiteUrl,\s*contentType: null/u,
  "focused recovery must load history from the exact focused source");
assert.match(prep, /getFocusedOrdinaryVerifiedCatalogPool\(/u,
  "focused ordinary flow must build the source-proven verified reserve pool");
assert.match(prep, /reuseAvailableBeforeDiscovery: true/u,
  "diagnostics must confirm reuse is available before fresh discovery");

const focusedStart = prep.indexOf('if (contentSourceScope === "product_category" || contentSourceScope === "focus_page")');
const focusedEnd = prep.indexOf("\n  let triedStoreSearchForCampaign", focusedStart);
assert.ok(focusedStart >= 0 && focusedEnd > focusedStart, "focused carousel block must exist");
const focused = prep.slice(focusedStart, focusedEnd);
assert.match(focused, /\.\.\.\(!isCampaignRule \? catalogItems : \[\]\)/u,
  "ordinary focused discovery must merge the verified reserve pool with newly discovered products");
assert.match(focused, /\.\.\.focusedCategoryItems/u,
  "newly discovered focused products must remain in the combined pool");

const freshPos = focused.indexOf("allowReuseWhenExhausted: false");
const reusePos = focused.indexOf("allowReuseWhenExhausted: true", freshPos + 1);
assert.ok(freshPos >= 0 && reusePos > freshPos,
  "fresh products must still be preferred before verified reuse fills missing positions");

// Calendar campaign selection and the rendering pipeline must remain untouched.
for (const required of [
  "selectCampaignCarouselProductsWithSeniorFinalReview",
  "generateProductCarouselCreativePlan",
  "saveCarouselSlidesForPost",
  "generateDesignedCarouselProductSlide",
]) {
  assert.ok(route.includes(required), `existing protected path must retain ${required}`);
}

console.log("v144.175 focused carousel verified reserve-pool checks passed.");

// Execute the new focused-pool helpers in isolation with deterministic stubs.
// This reproduces the Köttfabriken failure shape: source-scoped rows plus
// brand-wide previously used products, with unrelated catalog products present.
const normalizeComparableValueStub = (value) => String(value || "")
  .toLowerCase()
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "")
  .replace(/[?#].*$/, "")
  .replace(/\/$/, "");
const canonicalizeWebsiteProductUrlStub = (value) => value || "";
const dedupeWebsiteItemsByUrlTitleAndImageStub = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${normalizeComparableValueStub(item.url)}|${normalizeComparableValueStub(item.title)}|${normalizeComparableValueStub(item.image_url)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const isValidCarouselProductStub = (item) => Boolean(item?.url && item?.title && item?.image_url);

const helperBundleStart = route.indexOf("function websiteCatalogItemMatchesFocusedHistory(");
const helperBundleEnd = route.indexOf("\nfunction getCarouselProductSelectionKey(", helperBundleStart);
const helperBundle = route.slice(helperBundleStart, helperBundleEnd);
const loadHelpers = new Function(
  "normalizeComparableValue",
  "canonicalizeWebsiteProductUrl",
  "dedupeWebsiteItemsByUrlTitleAndImage",
  "isValidCarouselProduct",
  `${helperBundle}\nreturn { websiteCatalogItemMatchesFocusedHistory, websiteCatalogItemBelongsToFocusedSource, getFocusedOrdinaryVerifiedCatalogPool };`
);
const { getFocusedOrdinaryVerifiedCatalogPool } = loadHelpers(
  normalizeComparableValueStub,
  canonicalizeWebsiteProductUrlStub,
  dedupeWebsiteItemsByUrlTitleAndImageStub,
  isValidCarouselProductStub
);

const focusedUrl = "https://kottfabriken.se/c/farskvaror";
const pool = getFocusedOrdinaryVerifiedCatalogPool({
  sourceScopedItems: [
    { url: "https://kottfabriken.se/p/ryggbiff", title: "Ryggbiff", image_url: "https://img/ryggbiff.jpg", source_url: focusedUrl },
  ],
  brandWideItems: [
    { url: "https://kottfabriken.se/p/entrecote", title: "Entrecôte", image_url: "https://img/entrecote.jpg", source_url: "https://kottfabriken.se/", category_urls: [`${focusedUrl}/notkott`] },
    { url: "https://kottfabriken.se/p/flankstek", title: "Flankstek", image_url: "https://img/flankstek.jpg", source_url: "https://kottfabriken.se/" },
    { url: "https://kottfabriken.se/p/grill", title: "Grill", image_url: "https://img/grill.jpg", source_url: "https://kottfabriken.se/c/grillar", category_urls: ["https://kottfabriken.se/c/grillar"] },
  ],
  focusedHistoryItems: [
    { item_url: "https://kottfabriken.se/p/flankstek", item_title: "Flankstek", item_image_url: "https://img/flankstek.jpg" },
  ],
  focusedUrl,
});
assert.deepEqual(pool.map((item) => item.title).sort(), ["Entrecôte", "Flankstek", "Ryggbiff"].sort(),
  "focused verified pool must recover category descendants and exact focused-history products, while excluding unrelated catalog items");

const recoveryPos = prep.indexOf("getFocusedOrdinaryVerifiedCatalogPool({");
const ordinaryEarlyExitPos = prep.indexOf("finalizeOrdinaryCarouselFromVerifiedCatalog({");
const focusedDiscoveryPos = prep.indexOf("discoverProductsFromFocusedCategory({");
assert.ok(recoveryPos >= 0 && ordinaryEarlyExitPos > recoveryPos && focusedDiscoveryPos > ordinaryEarlyExitPos,
  "focused verified reuse pool must be recovered before the ordinary five-product early exit and before live category discovery");


// Ordinary five-product Store Map discovery must not pre-exclude previously
// used products, because reuse is now an allowed completion path. Campaigns
// retain their existing exclusion so themed fresh discovery remains intact.
const storeMapStart = route.indexOf("async function discoverProductsFromStoreMapAgent({");
const storeMapEnd = route.indexOf("\nasync function ", storeMapStart + 50);
assert.ok(storeMapStart >= 0 && storeMapEnd > storeMapStart, "Store Map product agent must exist");
const storeMap = route.slice(storeMapStart, storeMapEnd);
assert.match(storeMap, /allowOrdinaryCarouselReuseDuringDiscovery =\s*!campaignScoped && requiredCount >= CAROUSEL_PRODUCT_SLIDE_TARGET/u,
  "ordinary five-product carousels must keep used products eligible during Store Map discovery");
assert.match(storeMap, /const recentProductUrls = allowOrdinaryCarouselReuseDuringDiscovery\s*\? \[\]/u,
  "ordinary carousel Store Map discovery must pass an empty used-product exclusion list");
assert.match(storeMap, /: \(recentUsedItems \|\| \[\]\)/u,
  "campaign and non-carousel discovery must retain the previous used-product exclusion branch");

console.log("v144.175 executable focused-pool behavior checks passed.");
