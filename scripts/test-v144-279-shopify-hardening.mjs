import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(`v144.279 failed: ${message}`); };

const deleteAccount = read("app/api/delete-account/route.js");
const disconnect = read("app/api/shopify/disconnect/route.js");
const billing = read("lib/shopifyBilling.js");
const labels = read("lib/i18n/defaultLabels.js");
const setup = read("SHOPIFY_APP_PRICING_SETUP_V144_257.md");

assert(deleteAccount.includes('payment_provider, provider_subscription_id'), "account deletion must load payment_provider");
assert(deleteAccount.includes('paymentProvider === "shopify"'), "Shopify account deletion branch missing");
assert(deleteAccount.includes('paymentProvider === "stripe"'), "Stripe account deletion branch missing");
assert(deleteAccount.includes('cancelShopifyAppPricingSubscriptionForConnection'), "Shopify cancellation helper not used on account deletion");
assert(billing.includes('appSubscriptionCancel('), "Partner API appSubscriptionCancel mutation missing");
assert(billing.includes('deferCancellation: Boolean(deferCancellation)'), "Shopify cancellation timing is not explicit");
assert(billing.includes('userErrors'), "Shopify cancellation userErrors are not handled");
assert(disconnect.includes('status: "disconnected"') && disconnect.includes('access_token: ""'), "manual disconnect must revoke Shopify token access");
assert(disconnect.includes('.eq("commerce_platform", "shopify")'), "manual disconnect must target Shopify catalog only");
assert(disconnect.includes('update({ is_active: false })'), "manual disconnect must inactivate Shopify catalog");
assert(disconnect.includes('.eq("provider", "shopify")'), "manual disconnect must target Shopify web-data row only");
assert(disconnect.includes('SHOPIFY_PRODUCT_MODE_REASON_PREFIX'), "manual disconnect must distinguish Shopify-derived product mode");
assert(disconnect.includes('website_product_mode_available: false'), "Shopify-derived product mode must be disabled on disconnect");
assert(!disconnect.includes('.from("shopify_connections").delete()'), "manual disconnect must retain Shopify installation identity for billing cleanup");
assert(!labels.includes('Any active Stripe subscription is canceled first.'), "delete-account copy must be provider-neutral");
assert(setup.includes('View financials'), "Partner API setup must document cancellation permission");

console.log("v144.279 Shopify hardening checks passed (16/16).");
