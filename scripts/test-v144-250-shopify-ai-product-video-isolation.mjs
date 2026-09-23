import fs from "node:fs";

const cron = fs.readFileSync("app/api/cron/run-automations/route.js", "utf8");
const automation = fs.readFileSync("app/automation/page.jsx", "utf8");
const planContent = fs.readFileSync("app/api/plan-content/route.js", "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(`v144.250 failed: ${message}`);
};

const productTypeBlock = cron.match(/function isProductContentTypeRule\(rule\) \{[\s\S]*?\n\}/)?.[0] || "";
assert(productTypeBlock.includes('contentTypeId === "ai_product_video" && rule?.shopify_product_engine_connected === true'), "AI product video must enter Product Engine only after Shopify connection confirmation");
assert(!/\[\s\S]*"ai_product_video"[\s\S]*\]\.includes\(contentTypeId\)/.test(productTypeBlock), "AI product video must not be globally added to ordinary website product types");
assert(cron.includes('function isAiProductVideoRule(rule)'), "dedicated AI product video detector must exist");

const singleProductShopifySync = cron.match(/const shouldProbeShopifyForAiProductVideo =[\s\S]*?const shopifyCatalogItems =/)?.[0] || "";
assert(singleProductShopifySync.includes("isAiProductVideoRule(rule)"), "AI product video must probe Shopify app connection before changing paths");
assert(singleProductShopifySync.includes("syncShopifyCatalogForProductEngine"), "Shopify-connected AI product video must invoke Admin API catalog sync");
assert(singleProductShopifySync.includes("shopifyCatalogSync?.connected === true"), "Product Engine marker must require a confirmed Shopify connection");
assert(singleProductShopifySync.includes("rule.shopify_product_engine_connected = true"), "confirmed Shopify AI video rule must be marked for downstream Product Engine gates");

assert(/id: "ai_product_video"[\s\S]*?usesWebsiteContent: true/.test(automation), "AI product video must remain website/product backed in Content Studio");
assert(/id: "ai_product_video"[\s\S]*?requiresProducts: true/.test(planContent), "AI product video must remain a required-product format in planning");
assert(cron.includes("Shopify Product Engine catalog refreshed from Admin API"), "Shopify API-first logging must remain present");
assert(cron.includes("website discovery remains available as fallback"), "Shopify failure must keep the existing website fallback");

console.log("v144.250 Shopify AI product-video isolation checks passed (11/11).");
