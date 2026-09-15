import fs from 'node:fs';
import assert from 'node:assert/strict';

const helper = fs.readFileSync(new URL('../lib/brandWebsiteRescue.js', import.meta.url), 'utf8');
const cron = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');
const customerApi = fs.readFileSync(new URL('../app/api/admin/customers/[id]/route.js', import.meta.url), 'utf8');
const customersApi = fs.readFileSync(new URL('../app/api/admin/customers/route.js', import.meta.url), 'utf8');
const customersPage = fs.readFileSync(new URL('../app/admin/customers/page.jsx', import.meta.url), 'utf8');
const customerPage = fs.readFileSync(new URL('../app/admin/customers/[id]/page.jsx', import.meta.url), 'utf8');
const mass = fs.readFileSync(new URL('../lib/adminMassTest.js', import.meta.url), 'utf8');
const massPage = fs.readFileSync(new URL('../app/admin/mass-tests/page.jsx', import.meta.url), 'utf8');
const labels = fs.readFileSync(new URL('../lib/i18n/defaultLabels.js', import.meta.url), 'utf8');
const analyzeRoute = fs.readFileSync(new URL('../app/api/analyze-brand/route.js', import.meta.url), 'utf8');
const analyzeEngine = fs.readFileSync(new URL('../app/api/analyze-brand/brandAnalysisEngine.js', import.meta.url), 'utf8');
const analysisCron = fs.readFileSync(new URL('../app/api/cron/run-brand-analysis-jobs/route.js', import.meta.url), 'utf8');

assert.match(helper, /BRAND_429_RESCUE_STATUS = "rate_limited_rescue"/);
assert.match(helper, /website_access_status_code: 429/);
assert.match(helper, /website_access_status: "not_checked"/);

assert.match(cron, /brand_429_rescue_gate/);
assert.match(cron, /rule\.uses_website_content && isBrand429RescueActive\(automationBrandProfile\)/);
assert.match(cron, /suppress_immediate_admin_alert: true/);
assert.match(cron, /suppress_customer_notification: true/);
assert.match(cron, /rescueCurrentOccurrenceForWebsiteRateLimit\(error, failureStage/);
assert.match(cron, /rescueCurrentOccurrenceForWebsiteRateLimit\([\s\S]*?"carousel_product_prepare"/);
assert.match(cron, /website_rate_limit_rescue_prevented_paid_generation/);

const campaignFallbackStart = cron.indexOf('const canUseCampaignDeliveryFallback');
assert.ok(campaignFallbackStart >= 0, 'campaign carousel fallback guard must exist');
const campaignFallback = cron.slice(campaignFallbackStart, campaignFallbackStart + 1200);
assert.doesNotMatch(campaignFallback, /isWebsiteRateLimitError\(carouselError\)/, 'campaign 429 must go to Rescue instead of visual fallback');

assert.match(customerApi, /set_brand_429_rescue/);
assert.match(customerApi, /buildBrand429RescueUpdate\(\{ enabled \}\)/);
assert.match(customersApi, /filter === "rescue429"/);
assert.match(customersApi, /rescue429BrandCount/);
assert.match(customersPage, /admin\.customers\.webStatus/);
assert.match(customersPage, /admin\.customers\.filter\.rescue429/);
assert.match(customerPage, /setBrand429Rescue/);
assert.match(customerPage, /admin\.customer\.rescue429Title/);
assert.match(customerPage, /aria-pressed=\{rescue429Active\}/);

for (const source of [analyzeRoute, analyzeEngine, analysisCron]) {
  assert.match(source, /isBrand429RescueActive/, 'brand analysis paths must preserve manual 429 Rescue state');
}

assert.match(mass, /labelKey: item\.content_type_id === "carousel_website_item"/);
assert.doesNotMatch(mass, /\? "AI-designed carousel – 5 products"/, 'mass-test carousel label must not be hardcoded in the selector');
assert.match(massPage, /useUiText\(\["adminMassTests", "automation"\]\)/);
assert.match(massPage, /formatLabel\(f\)/);

for (const key of [
  'admin.customers.filter.rescue429',
  'admin.customers.webStatus',
  'admin.customer.rescue429Title',
  'admin.customer.rescue429Active',
  'admin.customer.rescue429Normal',
  'admin.customer.rescue429Message',
]) {
  assert.ok(labels.includes(`"${key}"`), `missing i18n source key ${key}`);
}

console.log('v144.179 brand 429 Rescue + cost guard regression checks passed');
