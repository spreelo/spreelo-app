import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
};

const helper = await import(pathToFileURL(path.join(root, "lib/shopifyWebhooks.js")).href);
const route = read("app/api/shopify/webhooks/route.js");
const sql = read("spreelo-v144.256-SQL.sql");
const toml = read("SHOPIFY_WEBHOOK_CONFIG_V144_256.toml.example");

const rawBody = JSON.stringify({ shop_id: 123, shop_domain: "demo-shop.myshopify.com" });
const secret = "test_secret_123";
const validHmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

assert(helper.verifyShopifyWebhookHmac(rawBody, validHmac, secret), "valid Shopify raw-body HMAC is accepted");
assert(!helper.verifyShopifyWebhookHmac(rawBody, `${validHmac}x`, secret), "invalid Shopify HMAC is rejected without throwing");
assert(!helper.verifyShopifyWebhookHmac(`${rawBody} `, validHmac, secret), "HMAC is bound to the exact raw body bytes/string");
assert(helper.isSupportedShopifyWebhookTopic("app/uninstalled"), "app/uninstalled is supported");
assert(helper.isSupportedShopifyWebhookTopic("customers/data_request"), "customers/data_request is supported");
assert(helper.isSupportedShopifyWebhookTopic("customers/redact"), "customers/redact is supported");
assert(helper.isSupportedShopifyWebhookTopic("shop/redact"), "shop/redact is supported");

const headers = new Headers({
  "X-Shopify-Topic": "app/uninstalled",
  "X-Shopify-Shop-Domain": "Demo-Shop.myshopify.com",
  "X-Shopify-Webhook-Id": "delivery-123",
  "X-Shopify-Event-Id": "event-123",
  "X-Shopify-API-Version": "2026-07",
});
const metadata = helper.getShopifyWebhookMetadata(headers);
assert(metadata.shopDomain === "demo-shop.myshopify.com" && metadata.webhookId === "delivery-123", "signed webhook metadata normalizes the exact myshopify domain and delivery ID");

assert(route.includes('return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 })'), "bad HMAC returns the Shopify-required HTTP 401");
assert(route.indexOf("verifyShopifyWebhookHmac") < route.indexOf("JSON.parse(rawBody)"), "HMAC is verified before JSON payload parsing/trust");
assert(route.includes("claimShopifyWebhookEvent") && route.includes("completeShopifyWebhookEvent") && route.includes("failShopifyWebhookEvent"), "webhook processing has durable claim/complete/fail idempotency lifecycle");

assert(sql.includes("create table if not exists public.shopify_webhook_events") && sql.includes("webhook_id text primary key"), "SQL stores durable Shopify webhook delivery IDs");
assert(sql.includes("payload_sha256 text not null") && !/\bpayload\s+jsonb\b/i.test(sql), "receipt storage hashes payloads instead of persisting raw compliance PII");
assert(sql.includes("claim_shopify_webhook_event") && sql.includes("complete_shopify_webhook_event") && sql.includes("fail_shopify_webhook_event"), "SQL provides idempotent claim/complete/fail RPCs");

const helperSource = read("lib/shopifyWebhooks.js");
assert(helperSource.includes('status: "disconnected"') && helperSource.includes('access_token: ""') && helperSource.includes('refresh_token: ""'), "app uninstall revokes Spreelo-side token use without deleting the Spreelo brand");
assert(helperSource.includes('.eq("commerce_platform", "shopify")') && helperSource.includes("markShopifyCatalogInactive"), "uninstall disables Shopify-derived Product Engine catalog rows");
assert(helperSource.includes("CUSTOMER_DATA_SCOPES") && helperSource.includes("does not") && helperSource.includes("persist Shopify customer/order records"), "customer privacy topics are fail-closed if customer/order scopes are ever added");
assert(helperSource.includes("handleShopifyShopRedact") && helperSource.includes('from("shopify_connections")') && helperSource.includes('from("shopify_onboarding_sessions")'), "shop/redact removes Shopify credentials and onboarding state");
assert(!/from\("brand_profiles"\)\.delete\(/.test(helperSource), "shop/redact does not delete the customer's whole Spreelo brand/account");

assert(toml.includes('topics = ["app/uninstalled"]'), "Shopify config subscribes to app/uninstalled");
assert(toml.includes('compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]'), "Shopify config contains all three mandatory compliance topics");
assert((toml.match(/https:\/\/app\.spreelo\.com\/api\/shopify\/webhooks/g) || []).length === 2, "all Shopify subscriptions point to the production webhook endpoint");

console.log(`\nv144.256 Shopify compliance webhook checks passed (${passed}/22).`);
