import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cron = fs.readFileSync(path.join(root, "app/api/cron/run-automations/route.js"), "utf8");

// A protected product-source error must be terminal, never retry_pending.
assert.match(
  cron,
  /function isTransientAutomationError\(errorOrMessage\)[\s\S]{0,700}if \(isProtectedProductResearchRetryError\(errorOrMessage\)\) return false;/u
);
assert.match(
  cron,
  /if \(isProtectedProductResearchRetryError\(errorOrMessage\)\)[\s\S]{0,300}code: "website_security_blocked"/u
);

// v144.162 supersedes the original single-product fail-fast policy: protected
// whole-site sources may use exactly one bounded indexed rescue path before the
// same terminal Admin Rescue handoff. Cheap fresh catalog/public-feed evidence
// still gets first chance.
assert.match(
  cron,
  /Protected product source will use one bounded indexed web-research fallback before admin rescue/u
);
assert.match(cron, /automaticRetryIfFallbackFails: false/u);
assert.match(
  cron,
  /if \(productIntentScoped && catalogItems\.length && !websiteAccessProtected\)/u
);
assert.match(
  cron,
  /Protected website product selected from fresh locked catalog without paid research/u
);
assert.match(
  cron,
  /allowIndexedSecurityFallback:[\s\S]{0,180}websiteAccessProtected[\s\S]{0,180}rate_limited/u
);

// Carousel protected sources get only the cheap offline verified pool before
// they are handed to rescue; paid web-search branches are disabled.
assert.match(cron, /Protected carousel source stopped before paid indexed\/AI research/u);
assert.match(
  cron,
  /protectedOfflineProducts\.length < CAROUSEL_PRODUCT_SLIDE_TARGET/u
);
assert.match(
  cron,
  /const canUsePrimaryCampaignWebResearch =[\s\S]{0,180}!websiteAccessProtected/u
);
assert.match(
  cron,
  /isCampaignRule &&\n    !websiteAccessProtected &&\n    !resumedAfterWebsiteRateLimit/u
);
assert.match(
  cron,
  /hasProductPreparationBudget\(60_000\) &&\n    !websiteAccessProtected/u
);
assert.match(
  cron,
  /isCampaignRule &&\n    !websiteAccessProtected &&\n    !campaignWebsiteRateLimited &&\n    selectedProducts\.length < CAROUSEL_PRODUCT_SLIDE_TARGET/u
);

// Admin diagnostics/work-item sync receives explicit rescue/fail-fast metadata.
assert.match(cron, /fail_fast_security_block: true/u);
assert.match(cron, /admin_rescue_required: true/u);
assert.match(cron, /protected_product_source: true/u);
assert.match(
  cron,
  /Protected product-source research exhausted this occurrence; stopping for admin rescue instead of starting another paid retry/u
);

console.log("v144.107 rescue-handoff safety checks passed under v144.162 bounded-fallback policy.");
