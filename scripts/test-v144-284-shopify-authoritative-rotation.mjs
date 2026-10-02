import fs from 'node:fs';
import assert from 'node:assert/strict';

const cron = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');

assert.ok(
  /if \(hasShopifyPrimaryCatalog && productIntentScoped\) \{[\s\S]*?acceptableShopifyCampaignItems[\s\S]*?isShopifyAdminApiLockedProduct\(item\)[\s\S]*?isAcceptableWebsiteTextProductSelection\(item, rule\)[\s\S]*?allowReuseWhenExhausted: true/.test(cron),
  'Shopify authoritative rotation reuse must run regardless of storefront protection while remaining campaign-fit gated'
);

assert.ok(
  !/if \(hasShopifyPrimaryCatalog && productIntentScoped && !websiteAccessProtected\)/.test(cron),
  'Shopify rotation reuse must not be disabled by password-protected storefronts'
);

assert.ok(
  /productDiscoveryPath: "shopify_admin_api_rotation_reuse"[\s\S]*?paidWebResearchUsed: false/.test(cron),
  'Shopify rotation reuse must stay on the Admin API path without paid web research'
);

assert.ok(
  /Starting bounded product web-research fallback/.test(cron),
  'Generic web fallback must remain available when Shopify truly cannot satisfy the product task'
);

console.log('v144.284 Shopify authoritative rotation checks passed (4/4).');
