import fs from 'node:fs';

const page = fs.readFileSync('app/shopify/onboarding/page.jsx', 'utf8');
const claim = fs.readFileSync('app/api/shopify/onboarding/claim/route.js', 'utf8');
const ready = fs.readFileSync('app/onboarding/ready/page.jsx', 'utf8');

const checks = [
  ['Shopify route uses brand analysis state instead of account-wide first-brand state', /const routeToAnalysisSummary = Boolean\(payload\?\.analysis_required\)/.test(page)],
  ['Consent pending state preserves the analysis-summary route decision', /routeToAnalysisSummary,\s*\}\);\s*setPhase\("consent"\)/s.test(page)],
  ['Accepted consent continues with brand-level analysis-summary routing', /acceptAiConsent\(\)[\s\S]*routeToAnalysisSummary: Boolean\(pending\.routeToAnalysisSummary\)/.test(page)],
  ['Declined consent continues with brand-level analysis-summary routing', /skipAiConsent\(\)[\s\S]*routeToAnalysisSummary: Boolean\(pending\.routeToAnalysisSummary\)/.test(page)],
  ['Analysis-required Shopify brands wait for analysis then open the shared result screen', /if \(routeToAnalysisSummary\)[\s\S]*await pollAnalysisStatus[\s\S]*goToAnalysisSummary\(brand\.id\)/.test(page)],
  ['Already analyzed Shopify brands still have a Grow Brain return path', /goToGrowBrain\(extra\)/.test(page)],
  ['Claim endpoint still marks a brand for analysis when created or missing generated analysis output', /analysis_required: createdBrand \|\| !selectedBrand\.campaign_calendar_generated_at/.test(claim)],
  ['Shared analysis summary still leads to Social channels', /className="is-primary" href="\/social-channels"/.test(ready)],
  ['Old account-wide first_brand_for_user value is not used as the routing decision in the Shopify page', !/routeToSocialChannels = Boolean\(payload\?\.first_brand_for_user\)/.test(page)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.236 Shopify brand-level onboarding checks passed (${passed}/${checks.length}).`);
