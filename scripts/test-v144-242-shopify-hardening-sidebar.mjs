import fs from 'node:fs';

const helper = fs.readFileSync('lib/shopifyOAuth.js', 'utf8');
const callback = fs.readFileSync('app/api/shopify/callback/route.js', 'utf8');
const products = fs.readFileSync('app/api/shopify/products/route.js', 'utf8');
const styles = fs.readFileSync('app/styles/06-premium-workspace.css', 'utf8');
const layout = fs.readFileSync('components/AppLayout.jsx', 'utf8');
const sql = fs.readFileSync('spreelo-v144.242-SQL.sql', 'utf8');

const checks = [
  ['Manual Shopify callback success preserves the connected brand id', /growBrainUrl\(origin, \{ shopify: "connected", brandId: decoded\.brandProfileId \}\)/.test(callback)],
  ['Manual Shopify callback errors preserve the brand id when available', /shopify: "error", reason, brandId: decoded\?\.brandProfileId/.test(callback)],
  ['Refresh lock fields are added by migration', /refresh_lock_token text[\s\S]*refresh_lock_until timestamptz/.test(sql)],
  ['Token refresh acquires a database-backed optimistic lock', /tryAcquireRefreshLock[\s\S]*refresh_lock_token:[\s\S]*\.eq\("updated_at", connection\.updated_at\)/.test(helper)],
  ['Concurrent refresh waits for another request to persist the rotated token', /waitForConcurrentRefresh[\s\S]*connectionTokenIsFresh/.test(helper)],
  ['Forced refresh can detect that another request already rotated the access token', /staleAccessToken[\s\S]*connection\.access_token !== staleAccessToken/.test(helper)],
  ['GraphQL helper retries exactly through a forced refresh after Shopify 401', /shopifyGraphqlForBrand[\s\S]*status \|\| 0\) !== 401[\s\S]*forceRefresh: true[\s\S]*staleAccessToken: accessToken/.test(helper)],
  ['Product endpoint uses the hardened per-brand GraphQL helper', /shopifyGraphqlForBrand\(\{[\s\S]*brandProfileId/.test(products)],
  ['Sidebar plan label is 13.5px', /\.sidebar-credit-heading\s*\{[\s\S]*font-size: 13\.5px !important/.test(styles)],
  ['Sidebar included-credit text is 13.5px', /\.sidebar-credit-count span\s*\{[\s\S]*font-size: 13\.5px !important/.test(styles)],
  ['Sidebar reset line is 13.5px', /\.sidebar-credit-card small,[\s\S]*font-size: 13\.5px !important/.test(styles)],
  ['Account label is 13.5px', /\.spreelo-user-profile-copy strong\s*\{[\s\S]*font-size: 13\.5px !important/.test(styles)],
  ['Account email uses 13.5px when it fits and shrinks for longer addresses', /--spreelo-account-email-size[\s\S]*Math\.max\(10\.5, Math\.min\(13\.5, 335 \/ Math\.max/.test(layout)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.242 Shopify hardening + sidebar checks passed (${passed}/${checks.length}).`);
