import fs from "node:fs";
import assert from "node:assert/strict";

const automation = fs.readFileSync("app/automation/page.jsx", "utf8");
const planner = fs.readFileSync("app/api/plan-content/route.js", "utf8");

const block = automation.match(
  /const platformSignature = activePlatformKeys\.join\("-"\)[\s\S]*?let instantSlots = fallbackSlots;/
)?.[0] || "";

assert.match(
  block,
  /const capabilitySignature = `products-\$\{websiteProductModeAvailable \? 1 : 0\}_services-\$\{verifiedServiceModeAvailable \? 1 : 0\}`;/,
  "plan cache identity must include both verified product and service capability"
);
assert.match(
  block,
  /spreelo_plan_recommendation_\$\{currentBrandId\}_\$\{goalId\}_\$\{safePostCount\}_\$\{platformSignature\}_\$\{capabilitySignature\}/,
  "capability signature must be part of the local recommendation cache key"
);
assert.match(
  automation,
  /getGoalContentTypeIds\(\{[\s\S]*?websiteProductModeAvailable,[\s\S]*?verifiedServiceModeAvailable,/,
  "instant fallback planning must still use the same capability state"
);
assert.match(
  automation,
  /createDynamicRecommendedSlots\(\{[\s\S]*?websiteProductModeAvailable,[\s\S]*?verifiedServiceModeAvailable,/,
  "cached/server plans must still be normalized against the current capability state"
);
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

console.log("v144.252 plan cache capability identity checks passed (7/7).");
