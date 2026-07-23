import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildImageBackgroundProfile,
  chooseImageBackground,
} from "../lib/imageBackgroundSelection.js";

const route = fs.readFileSync(
  new URL("../app/api/cron/run-automations/route.js", import.meta.url),
  "utf8"
);

assert.match(route, /export const maxDuration = 600;/);
assert.match(route, /CAROUSEL_PREPARATION_SOFT_DEADLINE_MS[\s\S]*300_000/);
assert.match(route, /const CAROUSEL_PRODUCT_RENDER_CONCURRENCY = 3;/);
assert.match(route, /const productVerificationCache = new Map\(\);/);
assert.match(route, /verification_cache_hit/);
assert.match(route, /Campaign product search queries prepared/);
assert.match(route, /Campaign store-search verified product details/);
assert.match(route, /searchDiagnostics/);
assert.match(route, /found_by_query/);
assert.match(route, /Product researcher stopped before deadline/);
assert.ok(route.includes("png|jpe?g|webp|gif|svg|avif|ico|pdf|mp4|webm"));
assert.match(route, /%7b%7burl%7d%7d/i);
assert.match(route, /mapWithConcurrency\(/);
assert.match(route, /generateCarouselOutroSlideImage\(/);
assert.match(route, /The campaign outro remains AI-generated exactly as before/);

const prepareStart = route.indexOf("async function prepareCarouselProductsForRule");
const storeSearchStart = route.indexOf("await buildLockedCampaignSearchPool", prepareStart);
const earlyWebSearchStart = route.indexOf(
  "Campaign carousel domain web search completed before Store Map",
  storeSearchStart
);
const storeMapStart = route.indexOf("discoverProductsFromStoreMapAgent", earlyWebSearchStart);
assert.ok(prepareStart >= 0 && storeSearchStart > prepareStart);
assert.ok(earlyWebSearchStart > storeSearchStart);
assert.ok(storeMapStart > earlyWebSearchStart);

const discoverySearchStart = route.indexOf("function buildCampaignDiscoverySearches");
const discoverySearchEnd = route.indexOf("function buildLikelyDiscoveryUrls", discoverySearchStart);
const discoverySearchBlock = route.slice(discoverySearchStart, discoverySearchEnd);
assert.ok(
  discoverySearchBlock.indexOf("for (const term of coreThemeTerms)") <
    discoverySearchBlock.indexOf("for (const query of dedicatedQueries)"),
  "Core campaign theme searches must run before broader dedicated queries"
);

const rule = {
  prompt: "Christmas campaign for premium apparel",
  brand_profile: { industry: "fashion" },
};
const profile = buildImageBackgroundProfile({
  rule,
  dominantColor: "dark",
  productBrightness: "dark",
});
const assets = [
  {
    id: "best-dark-product",
    public_url: "https://example.com/light-christmas.webp",
    active: true,
    crop_safe_1x1: true,
    campaigns: ["christmas"],
    industries: ["fashion"],
    moods: ["premium"],
    colors: ["beige"],
    brightness: "light",
    season: "christmas",
    label_safe: true,
    text_safe: true,
    priority: 20,
  },
  {
    id: "alternative",
    public_url: "https://example.com/alternative.webp",
    active: true,
    crop_safe_1x1: true,
    campaigns: ["christmas"],
    industries: ["fashion"],
    moods: ["premium"],
    colors: ["neutral"],
    brightness: "medium",
    season: "christmas",
    label_safe: true,
    text_safe: true,
    priority: 18,
  },
];

const first = chooseImageBackground({ assets, profile, usageCounts: new Map() });
assert.equal(first?.asset?.id, "best-dark-product");
const second = chooseImageBackground({
  assets,
  profile,
  usageCounts: new Map([["best-dark-product", 2]]),
  variationPenalty: 18,
});
assert.equal(second?.asset?.id, "alternative");

console.log("Campaign search, timeout and per-product background optimization invariants passed.");
