import fs from 'node:fs';

const checks = [
  ['App URL GET starts Shopify identity OAuth', 'app/api/shopify/connect/route.js', /flow:\s*"app_store_identity"/],
  ['App Store identity OAuth uses per-user token', 'app/api/shopify/connect/route.js', /online:\s*true/],
  ['OAuth state supports App Store flow', 'lib/shopifyOAuth.js', /app_store_identity[\s\S]*app_store_offline/],
  ['Online token exchange accepts associated user', 'lib/shopifyOAuth.js', /data\?\.associated_user/],
  ['Callback verifies Shopify staff email', 'app/api/shopify/callback/route.js', /email_verified/],
  ['Callback runs second offline OAuth before UI', 'app/api/shopify/callback/route.js', /flow:\s*"app_store_offline"[\s\S]*online:\s*false/],
  ['Pending token handoff is server-only', 'spreelo-v144.233-SQL.sql', /revoke all on public\.shopify_onboarding_sessions from anon, authenticated/],
  ['Pending session expires', 'spreelo-v144.233-SQL.sql', /expires_at timestamptz not null default \(now\(\) \+ interval '30 minutes'\)/],
  ['Bootstrap creates seamless Supabase session', 'app/api/shopify/onboarding/bootstrap/route.js', /auth\.admin\.generateLink/],
  ['Client verifies one-time token hash', 'app/shopify/onboarding/page.jsx', /supabase\.auth\.verifyOtp/],
  ['Existing multi-brand users get brand selection', 'app/api/shopify/onboarding/claim/route.js', /needs_brand_selection:\s*true/],
  ['New Shopify merchants get auto-created brand', 'app/api/shopify/onboarding/claim/route.js', /create_new[\s\S]*brand_profiles/],
  ['Claim persists Shopify connection', 'app/api/shopify/onboarding/claim/route.js', /saveShopifyConnection/],
  ['Claim records App Store acquisition source', 'app/api/shopify/onboarding/claim/route.js', /install_source:\s*"shopify_app_store"/],
  ['Shopify pending secrets are wiped after claim', 'app/api/shopify/onboarding/claim/route.js', /access_token:\s*null[\s\S]*refresh_token:\s*null/],
  ['Brand analysis can start after consent', 'app/shopify/onboarding/page.jsx', /\/api\/analyze-brand\/start/],
  ['No manual myshopify entry in App Store page', 'app/shopify/onboarding/page.jsx', /don't need to type a store address/],
  ['AI store-data consent is persisted', 'spreelo-v144.233-SQL.sql', /ai_store_data_consent_at/],
  ['AI consent has a version marker', 'lib/shopifyOAuth.js', /SHOPIFY_AI_CONSENT_VERSION/],
  ['App Store onboarding asks before AI analysis', 'app/shopify/onboarding/page.jsx', /Store-specific AI permission[\s\S]*Allow and continue/],
  ['App Store onboarding supports Not now', 'app/shopify/onboarding/page.jsx', /Not now/],
  ['Consent API verifies explicit acceptance', 'app/api/shopify/consent/route.js', /accepted !== true/],
  ['Manual Grow Brain Shopify flow passes explicit consent', 'app/grow-brain/page.jsx', /ai_consent:\s*true/],
  ['Manual OAuth stores signed consent decision', 'app/api/shopify/callback/route.js', /decoded\.aiConsent[\s\S]*ai_store_data_consent_at/],
  ['Nested onboarding routes import root Shopify helper correctly', 'app/api/shopify/onboarding/bootstrap/route.js', /from \"\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/shopifyOAuth\.js\"/],
];

let passed = 0;
for (const [label, file, pattern] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.233 Shopify App Store onboarding checks passed (${passed}/${checks.length}).`);
