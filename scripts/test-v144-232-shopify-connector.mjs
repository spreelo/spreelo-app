import fs from 'node:fs';

const checks = [
  ['OAuth helper exists', 'lib/shopifyOAuth.js', /createSignedShopifyState/],
  ['expiring offline token requested', 'lib/shopifyOAuth.js', /expiring:\s*"1"/],
  ['refresh token flow exists', 'lib/shopifyOAuth.js', /grant_type:\s*"refresh_token"/],
  ['strict myshopify validation exists', 'lib/shopifyOAuth.js', /myshopify\\\.com/],
  ['callback HMAC verification exists', 'lib/shopifyOAuth.js', /verifyShopifyCallbackHmac/],
  ['connect route exists', 'app/api/shopify/connect/route.js', /buildShopifyAuthorizationUrl/],
  ['callback route exists', 'app/api/shopify/callback/route.js', /exchangeShopifyCode/],
  ['products route exists', 'app/api/shopify/products/route.js', /X-Shopify-Access-Token|shopifyGraphql/],
  ['disconnect route exists', 'app/api/shopify/disconnect/route.js', /shopify_connections/],
  ['Shopify server-only SQL exists', 'spreelo-v144.232-SQL.sql', /revoke all on public\.shopify_connections from anon, authenticated/],
  ['Grow Brain starts real Shopify auth', 'app/grow-brain/page.jsx', /fetch\("\/api\/shopify\/connect"/],
  ['Grow Brain has connected state', 'app/grow-brain/page.jsx', /websiteConnectView === "connected"/],
  ['Discovery extracts myshopify domain', 'app/api/grow-brain/web-data/discover/route.js', /extractShopifyShopDomain/],
];

let passed = 0;
for (const [label, file, pattern] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.232 Shopify connector checks passed (${passed}/${checks.length}).`);
