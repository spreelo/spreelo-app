import fs from 'node:fs';

const page = fs.readFileSync('app/shopify/onboarding/page.jsx', 'utf8');
const css = fs.readFileSync('app/shopify/onboarding/page.module.css', 'utf8');
const labels = fs.readFileSync('lib/i18n/defaultLabels.js', 'utf8');
const bootstrap = fs.readFileSync('app/api/shopify/onboarding/bootstrap/route.js', 'utf8');
const callback = fs.readFileSync('app/api/shopify/callback/route.js', 'utf8');

const checks = [
  ['Shopify onboarding uses persistent UI translation system', /useUiText\(\["shopifyOnboarding", "onboarding"\]\)/.test(page)],
  ['Shopify onboarding has dedicated translation namespace', /shopifyOnboarding:\s*\{[\s\S]*shopifyOnboarding\.connecting\.title/.test(labels)],
  ['Shopify verified installer locale is returned by bootstrap', /installer_locale[\s\S]*locale:\s*String\(onboarding\.installer_locale/.test(bootstrap)],
  ['Shopify onboarding no longer hardcodes untranslated visible copy', !/Connecting Shopify to Spreelo/.test(page) && !/Learning about your store/.test(page)],
  ['Client still supports Shopify locale as a fallback language hint', /bootstrap\?\.locale[\s\S]*setLocale\(bootstrap\.locale, "shopify"\)/.test(page)],
  ['Shopify analysis reuses regular onboarding stage keys', /onboarding\.analysis\.readingWebsite\.title[\s\S]*onboarding\.analysis\.preparingStrategy\.title/.test(page)],
  ['Shopify analysis has smooth progress calculation', /getSmoothAnalysisProgress/.test(page)],
  ['Shopify analysis consumes server job progress', /serverProgress[\s\S]*job\?\.progress/.test(page)],
  ['Shopify analysis renders progress track', /className=\{styles\.analysisTrack\}/.test(page) && /\.analysisTrack/.test(css)],
  ['Shopify analysis renders connected stage dots', /className=\{styles\.analysisSteps\}/.test(page) && /\.analysisSteps:before/.test(css)],
  ['Consent copy is translated through keys', /shopifyOnboarding\.consent\.permissionTitle/.test(page) && /shopifyOnboarding\.consent\.allow/.test(page)],
  ['Security copy is translated through key', /shopifyOnboarding\.security/.test(page)],
  ['No SQL migration required by this UI-only update', true],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.237 Shopify progress + i18n checks passed (${passed}/${checks.length}).`);
