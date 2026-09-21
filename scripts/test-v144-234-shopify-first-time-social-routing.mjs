import fs from 'node:fs';

const checks = [
  ['Claim still knows whether this is the first brand for account lifecycle setup', 'app/api/shopify/onboarding/claim/route.js', /const firstBrandForUser = brandRows\.length === 0/],
  ['Claim exposes first-brand lifecycle decision to client', 'app/api/shopify/onboarding/claim/route.js', /first_brand_for_user:\s*firstBrandForUser/],
  ['Shopify onboarding has a Social channels destination with explicit brand id', 'app/shopify/onboarding/page.jsx', /function goToSocialChannels\(brandId[\s\S]*params\.set\("brandId", brandId\)[\s\S]*\/social-channels\?/],
  ['New or unanalyzed Shopify brands route through the shared analysis summary first', 'app/shopify/onboarding/page.jsx', /const routeToAnalysisSummary = Boolean\(payload\?\.analysis_required\)/],
  ['Shared analysis summary continues to Social channels with the selected brand', 'app/onboarding/ready/page.jsx', /className="is-primary" href=\{`\/social-channels\?brandId=\$\{encodeURIComponent\(brand\.id\)\}`\}/],
  ['Already analyzed Shopify customers retain a Grow Brain route with explicit brand id', 'app/shopify/onboarding/page.jsx', /goToGrowBrain\(brand\?\.id \|\| ""\)/],
  ['AI consent completion preserves analysis-summary routing', 'app/shopify/onboarding/page.jsx', /routeToAnalysisSummary:\s*Boolean\(pending\.routeToAnalysisSummary\)/],
  ['First-brand signal is now lifecycle-only rather than the navigation decision', 'app/shopify/onboarding/page.jsx', /if \(payload\?\.first_brand_for_user\)\s*\{\s*requestWelcomeEmail/],
];

let passed = 0;
for (const [label, file, pattern] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.234 Shopify first-time routing regression checks passed (${passed}/${checks.length}).`);
