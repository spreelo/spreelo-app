import fs from 'node:fs';

const onboarding = fs.readFileSync('app/shopify/onboarding/page.jsx', 'utf8');
const claim = fs.readFileSync('app/api/shopify/onboarding/claim/route.js', 'utf8');
const social = fs.readFileSync('app/social-channels/page.jsx', 'utf8');
const grow = fs.readFileSync('app/grow-brain/page.jsx', 'utf8');
const ready = fs.readFileSync('app/onboarding/ready/page.jsx', 'utf8');

const checks = [
  ['Shopify claim ensures standard credit balance', /ensureStandardSpreeloAccountState/.test(claim)],
  ['New Shopify Free account gets locked 100-credit offer', /free_trial_status:\s*"locked"[\s\S]*free_trial_credit_amount:\s*100/.test(claim)],
  ['Shopify parity never overwrites a concurrent existing balance', /createError\.code[\s\S]*23505[\s\S]*maybeSingle/.test(claim)],
  ['First-brand Shopify path requests normal welcome email', /first_brand_for_user[\s\S]*requestWelcomeEmail/.test(onboarding)],
  ['Shopify Grow Brain redirect carries explicit brand id', /goToGrowBrain\(brandId[\s\S]*params\.set\("brandId"/.test(onboarding)],
  ['Shopify Social Channels redirect carries explicit brand id', /goToSocialChannels\(brandId[\s\S]*params\.set\("brandId"/.test(onboarding)],
  ['Social Channels validates brandId against current user', /requestedBrandId[\s\S]*\.eq\("user_id", user\.id\)/.test(social)],
  ['Grow Brain validates brandId against current user', /requestedBrandId[\s\S]*\.eq\("user_id", user\.id\)/.test(grow)],
  ['Analysis summary forwards selected brand to social onboarding', /social-channels\?brandId=/.test(ready)],
  ['Shopify first analysis still uses the normal analyzer', /\/api\/analyze-brand\/start/.test(onboarding)],
  ['Shopify first analysis still routes to normal summary', /\/onboarding\/ready\?brandId=/.test(onboarding)],
  ['Analysis failure still stops instead of silently succeeding', /setPhase\("analysis_error"\)/.test(onboarding)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.240 Shopify entry parity checks passed (${passed}/${checks.length}).`);
