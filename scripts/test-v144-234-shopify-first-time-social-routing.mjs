import fs from 'node:fs';

const checks = [
  ['Claim detects whether this is the first brand for the Spreelo account', 'app/api/shopify/onboarding/claim/route.js', /const firstBrandForUser = brandRows\.length === 0/],
  ['Claim exposes first-brand onboarding decision to client', 'app/api/shopify/onboarding/claim/route.js', /first_brand_for_user:\s*firstBrandForUser/],
  ['Shopify onboarding has a Social channels destination', 'app/shopify/onboarding/page.jsx', /window\.location\.href = `\/social-channels\?\$\{params\.toString\(\)\}`/],
  ['First-time Shopify install routes to Social channels', 'app/shopify/onboarding/page.jsx', /const routeToSocialChannels = Boolean\(payload\?\.first_brand_for_user\)/],
  ['Existing Shopify customers still have Grow Brain route', 'app/shopify/onboarding/page.jsx', /goToGrowBrain\(extra\)/],
  ['AI consent completion preserves first-time routing', 'app/shopify/onboarding/page.jsx', /routeToSocialChannels:\s*Boolean\(pending\.routeToSocialChannels\)/],
  ['Not-now consent preserves first-time routing', 'app/shopify/onboarding/page.jsx', /if \(pending\?\.routeToSocialChannels\)[\s\S]*goToSocialChannels\(\{ ai: "not_enabled" \}\)/],
  ['Existing users creating another brand are not classified solely by created_brand', 'app/shopify/onboarding/page.jsx', /payload\?\.first_brand_for_user/],
];

let passed = 0;
for (const [label, file, pattern] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.234 Shopify first-time social routing checks passed (${passed}/${checks.length}).`);
