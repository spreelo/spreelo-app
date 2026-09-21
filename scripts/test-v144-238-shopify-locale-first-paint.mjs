import fs from 'node:fs';

const page = fs.readFileSync('app/shopify/onboarding/page.jsx', 'utf8');
const callback = fs.readFileSync('app/api/shopify/callback/route.js', 'utf8');
const css = fs.readFileSync('app/shopify/onboarding/page.module.css', 'utf8');

const checks = [
  ['Callback no longer forces Shopify Admin locale into URL', !/onboardingUrl\(origin, \{ lang: onboardingSession\.installer_locale/.test(callback)],
  ['Browser locale is primed before useUiText', /primeShopifyOnboardingLocale\(\)[\s\S]*useUiText\(\["shopifyOnboarding", "onboarding"\]\)/.test(page)],
  ['Explicit Spreelo language remains sticky', /\["manual", "suggestion"\]\.includes\(savedSource\)/.test(page)],
  ['Supported browser language wins for Shopify onboarding', /getBrowserMatchedOfficialLocale\(\)[\s\S]*APP_LANGUAGE_SOURCE_STORAGE_KEY, "browser"/.test(page)],
  ['Shopify locale is fallback only', /bootstrap\?\.locale && shouldApplyShopifyLocaleFallback\(\)/.test(page)],
  ['Non-English first paint is gated while translations load', /translationsLoading[\s\S]*languageLoadingDots/.test(page)],
  ['Language-neutral loader styling exists', /\.languageLoadingDots/.test(css)],
  ['Existing translated Shopify namespace remains used', /useUiText\(\["shopifyOnboarding", "onboarding"\]\)/.test(page)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.238 Shopify locale first-paint checks passed (${passed}/${checks.length}).`);
