import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  isSafeProductSearchQuery,
  sanitizeProductSearchQueryList,
} from "../lib/productEngineV2.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const cron = read("app/api/cron/run-automations/route.js");
const engine = read("lib/productEngineV2.js");
const social = read("app/social-channels/page.jsx");

// The malformed Köttfabriken queries from the real expensive run must never
// reach a retailer search box again.
for (const bad of [
  "one verified with",
  "one verified",
  "verified with usable",
  "verified with",
  "two candidates count",
  "minimum strong products",
  "product search queries",
]) {
  assert.equal(isSafeProductSearchQuery(bad), false, `Internal workflow phrase must be rejected: ${bad}`);
}
for (const good of [
  "entrecote",
  "notkott",
  "grillkott",
  "farskt kott",
  "certified refurbished iphone",
]) {
  assert.equal(isSafeProductSearchQuery(good), true, `Real product query must remain valid: ${good}`);
}
assert.deepEqual(
  sanitizeProductSearchQueryList([
    "entrecote",
    "one verified with",
    "verified with usable",
    "notkott",
    "entrecote",
  ]),
  ["entrecote", "notkott"],
  "Query sanitizer must remove workflow leakage and duplicates without losing real product terms"
);
assert.ok(engine.includes("INTERNAL_WORKFLOW_QUERY_PATTERNS"), "Product Engine must keep an explicit workflow-query guard");

// Generated/persisted website-text intent queries must pass through the same
// sanitizer instead of bypassing it with collectUniqueTerms().
const normalizedIntentIndex = cron.indexOf("function normalizeWebsiteTextIntentMetadata");
const deterministicIntentIndex = cron.indexOf("function buildDeterministicWebsiteTextProductIntent");
assert.ok(normalizedIntentIndex >= 0 && deterministicIntentIndex > normalizedIntentIndex, "Website text intent helpers must exist");
const normalizedIntentBlock = cron.slice(normalizedIntentIndex, deterministicIntentIndex);
assert.ok(
  normalizedIntentBlock.includes("productSearchQueries: normalizeStoreSearchQueries("),
  "Normalized intent metadata must sanitize product search queries"
);
const deterministicIntentEnd = cron.indexOf("\n}\n", deterministicIntentIndex) + 3;
const deterministicIntentBlock = cron.slice(deterministicIntentIndex, deterministicIntentEnd);
assert.ok(
  deterministicIntentBlock.includes("const productSearchQueries = normalizeStoreSearchQueries("),
  "Deterministic product-intent queries must use the shared sanitizer"
);

// Cost guard: a ranked local product must be locked and returned before the
// paid web-research fallback is even reached.
const rankedCatalogIndex = cron.indexOf("Website product selected from ranked verified catalog before paid web research");
const paidFallbackIndex = cron.indexOf("Starting bounded product web-research fallback");
assert.ok(rankedCatalogIndex >= 0, "Ranked local catalog early-success path must exist");
assert.ok(paidFallbackIndex > rankedCatalogIndex, "Paid web research must occur after the ranked local-product success path");
const rankedCatalogRegion = cron.slice(Math.max(0, rankedCatalogIndex - 1800), paidFallbackIndex);
assert.ok(rankedCatalogRegion.includes("{ allowAiRepair: false }"), "Local ranked candidate must be locked deterministically before paying for research");
assert.ok(rankedCatalogRegion.includes("return preparedCatalogItem;"), "Successful local ranked selection must return immediately");
assert.ok(!cron.includes("will still run focused product research before final selection"), "A valid catalog match must no longer force paid research by policy");

// Web research remains a rescue path for the cases Johan explicitly wants to
// preserve: security blocks, rate limits and missing/exhausted local products.
assert.ok(cron.includes('let productResearchFallbackReason = websiteAccessProtected\n    ? "security_blocked"'), "Security-blocked domains must enter the fallback decision with an explicit reason");
assert.ok(cron.includes('productResearchFallbackReason = "rate_limited"'), "429/rate-limit state must be able to trigger the web-research fallback");
assert.ok(cron.includes('"no_verified_local_product"'), "Missing local products must retain web-research fallback");
assert.ok(cron.includes("Protected product source will use one bounded indexed web-research fallback before admin rescue"), "Protected sources must receive one bounded indexed rescue attempt");
assert.ok(cron.includes("automaticRetryIfFallbackFails: false"), "Protected fallback must not turn into an uncontrolled paid retry loop");
assert.ok(cron.includes("allowIndexedSecurityFallback:\n        websiteAccessProtected ||\n        resolvedWebResearchFallbackReason === \"rate_limited\""), "403/security and 429 fallback paths must opt into indexed recovery");

// Single-image fallback should preserve a real shortlist, but no longer pay to
// collect 8 products when only one final product is needed.
assert.ok(cron.includes("desiredVerifiedCount: 2"), "Single-product fallback must keep a two-product verified shortlist for resilience");
assert.ok(cron.includes("if (verifiedItems.length >= targetVerifiedCount)"), "Research must stop at the requested verified-product target");
assert.ok(!cron.includes("if (verifiedItems.length >= MAX_VERIFIED_ITEMS)"), "Single-product research must not always continue to the historical max pool");
assert.ok(cron.includes("desiredProductCount: targetVerifiedCount"), "Discovery breadth must inherit the bounded verification target");
assert.ok(cron.includes("This is a single-product task. A small ranked shortlist is enough"), "Research prompt must explicitly request a small single-product shortlist");
assert.ok(!cron.includes("Return 5 to 8 real product pages if possible."), "Research prompt must not force a 5-8 product sweep for every task");

// Observability: future cost spikes must say which path ran and why.
for (const marker of [
  'productDiscoveryPath: "product_engine_store_map"',
  'productDiscoveryPath: "product_engine_ranked_catalog"',
  'productDiscoveryPath: "product_engine_store_search"',
  'productDiscoveryPath: "web_research_fallback"',
  "fallbackReason:",
  "paidWebResearchUsed: true",
  "paidWebResearchUsed: false",
]) {
  assert.ok(cron.includes(marker), `Missing product-discovery observability marker: ${marker}`);
}

// Social Channels remains outside this patch's scope.
const socialDigest = crypto.createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified baseline"
);

console.log("v144.162 product-research cost guard regression checks passed.");
