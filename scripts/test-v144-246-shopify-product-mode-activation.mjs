import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`v144.246 failed: ${message}`);
};

const helper = read("lib/effectiveProductMode.js");
const shopifyCatalog = read("lib/shopifyProductCatalog.js");
const endpoint = read("app/api/shopify/product-mode/route.js");
const automation = read("app/automation/page.jsx");
const planContent = read("app/api/plan-content/route.js");
const planCampaign = read("app/api/plan-campaign/route.js");
const onboardingPlan = read("app/api/onboarding-plan/route.js");

const checks = [
  ["activation reuses the real Shopify Product Engine catalog", helper.includes("fetchShopifyProductEngineCatalog")],
  ["Shopify eligibility itself remains strict", /status \|\| ""\)\.toUpperCase\(\) !== "ACTIVE"/.test(shopifyCatalog) && /availableForSale === true/.test(shopifyCatalog) && /if \(!image\?\.url\) return null/.test(shopifyCatalog)],
  ["verification probe is bounded", helper.includes("SHOPIFY_PRODUCT_MODE_PROBE_LIMIT = 40")],
  ["at least one eligible connected Shopify product is required", helper.includes("catalog?.connected === true && items.length > 0")],
  ["positive Shopify verification persists product mode", helper.includes("website_product_mode_available: true")],
  ["positive Shopify verification saves a traceable reason", helper.includes("website_product_mode_reason: reason")],
  ["failed Shopify verification never writes product mode false", !helper.includes("website_product_mode_available: false")],
  ["endpoint authorizes brand ownership", endpoint.includes('.eq("user_id", user.id)')],
  ["endpoint uses the shared effective product-mode resolver", endpoint.includes("enrichBrandProfileWithEffectiveProductMode")],
  ["endpoint exposes eligible-product diagnostics without tokens", endpoint.includes("eligibleProductCount") && !endpoint.includes("access_token") && !endpoint.includes("refresh_token")],
  ["AI Content Studio calls Shopify product-mode verification when needed", automation.includes("/api/shopify/product-mode?brand_profile_id=")],
  ["AI Content Studio applies the effective profile before filtering formats", automation.includes("const effectiveBrandProfileData = await resolveProductModeForBrand") && automation.includes("effectiveBrandProfileData?.website_product_mode_available")],
  ["weekly planner understands Shopify-backed product mode", planContent.includes("enrichBrandProfileWithEffectiveProductMode") && planContent.includes("Object.assign(brandProfile, effectiveBrandProfile)")],
  ["campaign planner understands Shopify-backed product mode", planCampaign.includes("enrichBrandProfileWithEffectiveProductMode") && planCampaign.includes("Object.assign(brandProfile, effectiveBrandProfile)")],
  ["smart onboarding understands Shopify-backed product mode", onboardingPlan.includes("enrichBrandProfileWithEffectiveProductMode") && onboardingPlan.includes("Object.assign(brandProfile, effectiveBrandProfile)")],
];

let passed = 0;
for (const [label, ok] of checks) {
  assert(ok, label);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.246 Shopify product-mode activation checks passed (${passed}/${checks.length}).`);
