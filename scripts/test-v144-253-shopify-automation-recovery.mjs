import fs from 'node:fs';
import assert from 'node:assert/strict';

const cron = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');
const planner = fs.readFileSync(new URL('../app/automation/page.jsx', import.meta.url), 'utf8');

const checks = [
  ['AI product-ad image boilerplate is stripped before deriving product intent', /include short readable marketing text in the image\(\?:, but do not include price, discounts or ratings\)\?/.test(cron) && /do not include price, ratings or invented discounts/.test(cron)],
  ['Store Map is skipped when Shopify Admin API already supplied the primary catalog', /STORE_MAP_PRODUCT_AGENT_ENABLED\s*&&\s*!hasShopifyPrimaryCatalog\s*&&\s*!websiteAccessProtected/.test(cron)],
  ['Shopify campaign-fit candidates can rotate/reuse only after recent-history exhaustion', /acceptableShopifyCampaignItems[\s\S]*isShopifyAdminApiLockedProduct\(item\)[\s\S]*isAcceptableWebsiteTextProductSelection\(item, rule\)[\s\S]*allowReuseWhenExhausted: true/.test(cron)],
  ['Shopify rotation reuse stays on the authoritative API path without paid research', /productDiscoveryPath: "shopify_admin_api_rotation_reuse"[\s\S]*paidWebResearchUsed: false/.test(cron)],
  ['Generic public-web fallback still exists when Shopify cannot satisfy the task', /Starting bounded product web-research fallback/.test(cron)],
  ['Plan activation button is not silently disabled just because credits are insufficient', !/disabled=\{saving \|\| !hasEnoughCredits \|\| !slots\.length\}/.test(planner) && !/disabled=\{saving \|\| !hasEnoughCredits \|\| !executableSlots\.length\}/.test(planner)],
  ['Credit limitation still produces an explicit customer-facing message on click', /plannedCredits > creditBalance\.credits_remaining[\s\S]*automation\.errorCredits/.test(planner)],
  ['Plan database limit still opens the existing detailed limit modal', /parsePlanLimitDatabaseError\(error\)[\s\S]*setPlanLimitDetails\(limitDetails\)/.test(planner)],
];

let passed = 0;
for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`✓ ${name}`);
  passed += 1;
}
console.log(`v144.253 Shopify automation recovery checks passed (${passed}/${checks.length}).`);
