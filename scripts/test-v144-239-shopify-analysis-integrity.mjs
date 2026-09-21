import fs from 'node:fs';
const page = fs.readFileSync('app/shopify/onboarding/page.jsx','utf8');
const labels = fs.readFileSync('lib/i18n/defaultLabels.js','utf8');
const css = fs.readFileSync('app/shopify/onboarding/page.module.css','utf8');
const checks = [
 ['Analysis start preserves error code and limit payload', /errorCode: String\(payload\?\.error/.test(page) && /analysisLimit: payload\?\.analysisLimit/.test(page)],
 ['First-time analysis failure no longer auto-redirects to social channels', /stopOnAnalysisFailure\(\{ failure: analysis/.test(page)],
 ['Completed job still routes to analysis summary', /goToAnalysisSummary\(brand\.id\)/.test(page)],
 ['Dedicated analysis error phase exists', /phase === "analysis_error"/.test(page)],
 ['Quota and cooldown have explicit customer copy', /shopifyOnboarding\.analysisError\.quota/.test(labels) && /shopifyOnboarding\.analysisError\.cooldown/.test(labels)],
 ['Retry action exists', /async function retryAnalysis/.test(page) && /shopifyOnboarding\.analysisError\.retry/.test(page)],
 ['Continue-without-summary is explicit rather than silent', /shopifyOnboarding\.analysisError\.continue/.test(page) && /analysis: "retry_available"/.test(page)],
 ['Analysis error styles exist', /\.analysisError\{/.test(css)],
];
let passed=0; for (const [label,ok] of checks){ if(!ok) throw new Error(`FAILED: ${label}`); console.log(`✓ ${label}`); passed++; }
console.log(`v144.239 Shopify analysis integrity checks passed (${passed}/${checks.length}).`);
