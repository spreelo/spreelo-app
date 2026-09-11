import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const route = read("app/api/cron/run-automations/route.js");
const social = read("app/social-channels/page.jsx");

const researchStart = route.indexOf("async function findProductUrlWithWebSearch");
const researchEnd = route.indexOf("async function findWebsiteProductWithWebSearch", researchStart);
const research = route.slice(researchStart, researchEnd);
assert.ok(research.includes('websiteUrl: requestedWebsiteUrl = ""'));
assert.ok(research.includes("requestedWebsiteUrl ||"));
assert.ok(research.includes("rule?.product_market_source_url ||"));
assert.ok(research.includes("Customer website (resolved storefront for this run):"));
assert.ok(research.includes("STRICT MARKET RULE:"));
assert.ok(research.includes("wrongMarketProductCount += 1"));
assert.ok(research.includes("wrongMarketDiscoveryPageCount += 1"));
assert.ok(research.includes("marketMismatchOnly"));

const boundedStart = route.indexOf("async function findWebsiteProductWithWebSearch");
const boundedEnd = route.indexOf("function createSafeWebsiteCampaignFallbackItem", boundedStart);
const bounded = route.slice(boundedStart, boundedEnd);
assert.ok(bounded.includes("await getWebsiteDomainFetchState(websiteUrl)"));
assert.ok(bounded.includes("effectiveIndexedSecurityFallback"));
assert.ok(bounded.includes("websiteUrl,\n      attempt,"), "Resolved market URL must be forwarded to the research call");
assert.ok(bounded.includes("forceFastMarketCorrectionPass"));
assert.ok(bounded.includes("Product researcher returned only wrong-market results"));
assert.ok(bounded.includes("Product researcher stopped repeated wrong-market research attempts"));
assert.ok(bounded.includes("consecutiveMarketMismatchOnlyAttempts >= 2"));
assert.ok(bounded.includes("PRODUCT_RESEARCH_FAST_MODEL"));

assert.ok(route.includes("Website protection detected during local product discovery; upgraded bounded fallback mode"));
assert.ok(route.includes("Product research detected protected/rate-limited domain after caller snapshot; enabling bounded protected-site mode"));
assert.ok(route.includes("isLikelyCommerceStoreMapShelfNode"));
assert.ok(route.includes("Store Map shelf ranking removed non-commerce navigation nodes"));
assert.ok(route.includes("club boozt"));
assert.ok(route.includes("customer-service"));

// Existing safety/quality rails from the two previous releases must remain.
assert.ok(route.includes("Editorial product headline locked before image generation"));
assert.ok(route.includes("getDeterministicProductImageVariantConflict"));
assert.ok(route.includes("knownListingExpansionQueued"));
assert.ok(route.includes('return isExplicitCalendarCampaignRule(rule);'));
assert.ok(route.includes("Starting bounded product web-research fallback"));

const socialDigest = crypto.createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified baseline"
);

console.log("v144.167 market-aware protected-research regression checks passed.");
