import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getDeterministicProductImageVariantConflict,
  isSafeProductSearchQuery,
  sanitizeProductSearchQueryList,
} from "../lib/productEngineV2.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const route = read("app/api/cron/run-automations/route.js");
const social = read("app/social-channels/page.jsx");

// The exact junk phrases from the latest Köttfabriken run must be removed,
// while normal product vocabulary continues to work.
for (const bad of ["verified", "with", "with usable", "usable", "candidate count"]) {
  assert.equal(isSafeProductSearchQuery(bad), false, `Workflow fragment must be rejected: ${bad}`);
}
for (const good of [
  "hogrev",
  "notkott",
  "farskt kott",
  "grillkorv",
  "verified refurbished iphone",
]) {
  assert.equal(isSafeProductSearchQuery(good), true, `Real product search must survive: ${good}`);
}
assert.deepEqual(
  sanitizeProductSearchQueryList(["hogrev", "with usable", "verified", "with", "grillkorv"]),
  ["hogrev", "grillkorv"]
);

// Strong deterministic image-variant conflicts require at least two explicit
// disagreeing dimensions. This catches the real 5-pack/290 g -> 6-pack/350 g
// reserve-image mismatch without rejecting a filename for one stale number.
const strongConflict = getDeterministicProductImageVariantConflict({
  productTitle: "Grillkorv 5-pack ca 290 gram",
  imageUrl: "https://example.test/carlstroms-grillkorv-6-pack-ca-350-gram.jpg",
});
assert.ok(strongConflict, "Two-dimensional variant conflict must fail closed");
assert.deepEqual(
  strongConflict.conflicts.map((entry) => entry.dimension).sort(),
  ["mass_g", "pack_count"]
);
assert.equal(
  getDeterministicProductImageVariantConflict({
    productTitle: "Grillkorv 5-pack",
    imageUrl: "https://example.test/grillkorv-6-pack.jpg",
  }),
  null,
  "One filename mismatch alone must not hard-reject the product image"
);
assert.equal(
  getDeterministicProductImageVariantConflict({
    productTitle: "Grillkorv 5-pack ca 290 gram",
    imageUrl: "https://example.test/grillkorv-5-pack-ca-290-gram.jpg",
  }),
  null,
  "Matching explicit variant dimensions must remain valid"
);

// Store Map listing nodes must become traversal routes, not repeated failed
// product verification candidates.
for (const marker of [
  "knownListingUrls",
  "knownListingCandidatesSkipped",
  "knownListingExpansionQueued",
  ".filter((candidate) => !isKnownListingUrl(candidate?.url))",
  "knownListingUrlCount",
  "distinctProductShelfCount",
]) {
  assert.ok(route.includes(marker), `Missing listing traversal/diagnostic marker: ${marker}`);
}

// Normal single-product plans inspect broader shelf coverage, while real
// calendar campaigns preserve their existing campaign-first shelf strategy.
assert.ok(
  route.includes("campaignScoped || requiredCount >= CAROUSEL_PRODUCT_SLIDE_TARGET") &&
    route.includes("Math.max(4, agentTargets.shelfSelectionLimit)"),
  "Normal single-product discovery must broaden shelf coverage without widening campaign behavior"
);
assert.ok(
  route.includes("const categoryRotationEnabled = !isCampaignScopedWebsiteRule(rule);"),
  "Generic category rotation must be disabled for real calendar campaigns"
);
assert.ok(
  route.includes('return isExplicitCalendarCampaignRule(rule);'),
  "Explicit queue-source calendar-campaign classification must remain intact"
);

// Local fallbacks share classification work instead of re-verifying the same
// URL repeatedly within one occurrence.
assert.ok(route.includes("const productVerificationCache = new Map();"));
assert.ok(route.includes("verificationCache: productVerificationCache"));

// The deterministic variant guard must run before semantic vision and must be
// able to overrule an earlier semantic true-positive when strong URL/title
// evidence contradicts it.
const imageReviewStart = route.indexOf("async function reviewResolvedProductImageIdentity");
const imageReviewEnd = route.indexOf("async function reviewCarouselProductOnlyImages", imageReviewStart);
const imageReview = route.slice(imageReviewStart, imageReviewEnd);
assert.ok(imageReview.includes("getDeterministicProductImageVariantConflict"));
assert.ok(imageReview.includes("Product image rejected by deterministic variant guard"));
assert.ok(imageReview.includes('product_image_semantic_reason: "deterministic_variant_conflict"'));
assert.ok(
  imageReview.indexOf("deterministicVariantConflicts.has(itemIndex)") < imageReview.indexOf("const imageOptions = []"),
  "Strong deterministic conflicts must be established before semantic image review"
);

// Safety fallbacks and the v144.165 editorial-headline pipeline remain present.
assert.ok(route.includes("Starting bounded product web-research fallback"));
assert.ok(route.includes("Editorial product headline locked before image generation"));
assert.ok(route.includes('process.env.EDITORIAL_HEADLINE_MODEL || "gpt-5.6-sol"'));

// Scope guard: Social Channels remains byte-for-byte unchanged.
const socialDigest = crypto.createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified baseline"
);

console.log("v144.166 product discovery/category diversity regression checks passed.");
