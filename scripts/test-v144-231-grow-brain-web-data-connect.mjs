import fs from "node:fs";

const page = fs.readFileSync("app/grow-brain/page.jsx", "utf8");
const css = fs.readFileSync("app/styles/155-v144-231-grow-brain-web-data-connect.css", "utf8");
const route = fs.readFileSync("app/api/grow-brain/web-data/discover/route.js", "utf8");
const sql = fs.readFileSync("spreelo-v144.231-SQL.sql", "utf8");
const labels = fs.readFileSync("lib/i18n/defaultLabels.js", "utf8");

const checks = [
  ["web data table exists", sql.includes("create table if not exists public.brand_web_data_connections")],
  ["dismissal persists per brand", sql.includes("intro_dismissed_at") && page.includes("dismissWebsiteConnectIntro")],
  ["owner RLS exists", sql.includes("brand_web_data_connections_owner_select") && sql.includes("auth.uid() = user_id")],
  ["one-time modal guard exists", page.includes("webIntroCheckedRef") && page.includes("getWebIntroStorageKey")],
  ["permanent connect card exists", page.includes("grow-v231-web-data-card") && page.includes("growBrain.webConnectButton")],
  ["three data statuses exist", page.includes("growBrain.webDataSocial") && page.includes("growBrain.webDataWebsite") && page.includes("growBrain.webDataSales")],
  ["discovery API authenticates brand", route.includes("brand_profile_id") && route.includes("eq(\"user_id\", user.id)")],
  ["safe URL validation is used", route.includes("assertPublicHttpUrl")],
  ["Shopify detection exists", route.includes("shopify-section") && route.includes('provider = "shopify"')],
  ["WooCommerce detection exists", route.includes("woocommerce-product") && route.includes('provider = "woocommerce"')],
  ["GA4 detection exists", route.includes("google_analytics") && route.includes("googletagmanager")],
  ["GTM detection exists", route.includes("google_tag_manager") && route.includes("gtm\\.js")],
  ["provider selection does not claim connected", page.includes('status: "setup_pending"') && !page.includes('status: "connected", provider')],
  ["optional messaging exists", labels.includes('"growBrain.webDataOptional"') && labels.includes('"growBrain.webConnectOptionalText"')],
  ["responsive UI exists", css.includes("@media(max-width:680px)")],
];

let failed = 0;
for (const [name, pass] of checks) {
  if (pass) console.log(`✓ ${name}`);
  else { console.error(`✗ ${name}`); failed += 1; }
}
if (failed) process.exit(1);
console.log(`v144.231 Grow Brain web-data connection checks passed (${checks.length}/${checks.length}).`);
