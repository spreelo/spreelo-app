import fs from "node:fs";
import assert from "node:assert/strict";

const automation = fs.readFileSync("app/automation/page.jsx", "utf8");
const planner = fs.readFileSync("app/api/plan-content/route.js", "utf8");

// v144.393 retires browser recommendation caching entirely: changes to
// brand capability immediately recompute a no-cost, capability-safe draft.
const block = automation.slice(automation.indexOf('async function applyDynamicAutoPlan('), automation.indexOf('async function changeAutoPlanGoal('));
assert.match(block, /createRecommendedSlots\(\{/);
assert.match(block, /websiteProductModeAvailable/);
assert.match(block, /verifiedServiceModeAvailable/);
assert.doesNotMatch(block, /fetch\(/);
assert.doesNotMatch(block, /localStorage/);
assert.match(
  automation,
  /getGoalContentTypeIds\(\{[\s\S]*?websiteProductModeAvailable,[\s\S]*?verifiedServiceModeAvailable,/,
  "instant fallback planning must still use the same capability state"
);
const legacyNormalizer = automation.slice(automation.indexOf('function createDynamicRecommendedSlots('),automation.indexOf('function createDynamicRecommendedSlots(')+900);
assert.match(legacyNormalizer,/websiteProductModeAvailable/);
assert.match(legacyNormalizer,/verifiedServiceModeAvailable/);
assert.match(
  planner,
  /enrichBrandProfileWithEffectiveProductMode/,
  "server planner must continue resolving effective Shopify-backed product mode"
);
assert.match(
  planner,
  /const hasProducts = Boolean\(brandProfile\?\.website_product_mode_available\);/,
  "server planner must continue filtering product formats by verified product mode"
);
assert.match(
  planner,
  /const hasServices = hasVerifiedServiceEvidence\(brandProfile\);/,
  "server planner must continue filtering service formats by verified service evidence"
);

console.log("v144.393 capability-safe no-cost planning checks passed.");
