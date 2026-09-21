import fs from 'node:fs';

const checks = [
  ['Shopify onboarding reuses the durable analysis session refresh helper', 'app/shopify/onboarding/page.jsx', /getValidAnalysisAccessToken/],
  ['Shopify onboarding polls the same brand-analysis status endpoint', 'app/shopify/onboarding/page.jsx', /\/api\/analyze-brand\/status\?jobId=/],
  ['Shopify onboarding starts analysis through the same start endpoint', 'app/shopify/onboarding/page.jsx', /fetch\("\/api\/analyze-brand\/start"/],
  ['First-time Shopify onboarding routes to the existing analysis result screen', 'app/shopify/onboarding/page.jsx', /\/onboarding\/ready\?brandId=\$\{encodeURIComponent\(brandId\)\}&source=shopify/],
  ['Regular onboarding already uses the same analysis result screen', 'app/onboarding/page.jsx', /\/onboarding\/ready\?brandId=\$\{encodeURIComponent\(createdBrand\.id\)\}/],
  ['First-time Shopify onboarding waits for analysis completion before showing the result', 'app/shopify/onboarding/page.jsx', /await pollAnalysisStatus\([\s\S]*goToAnalysisSummary\(brand\.id\)/],
  ['The shared analysis result screen keeps Social channels as primary next step with brand id', 'app/onboarding/ready/page.jsx', /className="is-primary" href=\{`\/social-channels\?brandId=\$\{encodeURIComponent\(brand\.id\)\}`\}/],
  ['Declining store-data AI consent still allows the normal public brand analysis flow', 'app/shopify/onboarding/page.jsx', /async function skipAiConsent\(\)[\s\S]*continueAfterConsent/],
  ['Existing analyzed Spreelo customers still return to Grow Brain with their brand', 'app/shopify/onboarding/page.jsx', /goToGrowBrain\(brand\?\.id \|\| ""\)/],
];

let passed = 0;
for (const [label, file, pattern] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.235 Shopify analysis-summary regression checks passed (${passed}/${checks.length}).`);
