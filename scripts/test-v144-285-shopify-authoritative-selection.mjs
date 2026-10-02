import fs from 'node:fs';
import assert from 'node:assert/strict';

const cron = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');

assert.ok(
  /function isAcceptableShopifyAdminProductSelection\(item, rule\)[\s\S]*?isShopifyAdminApiLockedProduct\(item\)[\s\S]*?isProductEligibleForPromotion\(item\)[\s\S]*?!isCampaignFitRejectedForRule\(item, rule\)/.test(cron),
  'Shopify Admin API eligibility must rely on locked identity + promotability + no explicit campaign rejection'
);

assert.ok(
  /catalogSelection\?\.item[\s\S]*?hasShopifyPrimaryCatalog[\s\S]*?isAcceptableShopifyAdminProductSelection\(catalogSelection\.item, rule\)[\s\S]*?productDiscoveryPath: "shopify_admin_api_authoritative"[\s\S]*?paidWebResearchUsed: false/.test(cron),
  'A ranked valid Shopify Admin API product must be accepted before storefront fallbacks'
);

assert.ok(
  /acceptableShopifyCampaignItems = sortedCatalogItems\.filter\([\s\S]*?isAcceptableShopifyAdminProductSelection\(item, rule\)[\s\S]*?allowReuseWhenExhausted: true/.test(cron),
  'Shopify rotation reuse must use the authoritative Shopify eligibility rule'
);

assert.ok(
  !/acceptableShopifyCampaignItems = sortedCatalogItems\.filter\([\s\S]{0,300}?isAcceptableWebsiteTextProductSelection\(item, rule\)/.test(cron),
  'Soft generic website campaign-fit threshold must not gate authoritative Shopify rotation'
);

console.log('v144.285 Shopify authoritative selection checks passed (4/4).');
