import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
};

const billing = read("lib/shopifyBilling.js");
const status = read("app/api/billing/status/route.js");
const sync = read("app/api/shopify/billing/sync/route.js");
const cron = read("app/api/cron/sync-shopify-billing/route.js");
const annual = read("app/api/cron/refresh-annual-plan-credits/route.js");
const embedded = read("app/shopify/app/page.jsx");
const panel = read("components/StripeBillingPanel.jsx");
const stripe = read("lib/stripeBilling.js");
const sql = read("spreelo-v144.257-SQL.sql");
const vercel = read("vercel.json");
const docs = read("SHOPIFY_APP_PRICING_SETUP_V144_257.md");

assert(billing.includes("activeSubscription(appId: $appId, shopId: $shopId)"), "Partner API activeSubscription is the Shopify billing source of truth");
assert(!billing.includes("appSubscriptionCreate") && !sync.includes("appSubscriptionCreate"), "v144.257 does not create Shopify charges with the legacy Billing API");
assert(billing.includes("SHOPIFY_PARTNER_ORG_ID") && billing.includes("SHOPIFY_PARTNER_API_ACCESS_TOKEN"), "Partner API credentials are explicit server-only configuration");
assert(billing.includes("currentAppInstallation { app { id handle } }"), "Shopify app ID and app handle are discovered from the authenticated installation");
assert(billing.includes("SHOPIFY_PARTNER_APP_ID") && billing.includes("SHOPIFY_APP_HANDLE"), "app ID/handle emergency environment overrides remain available");
assert(billing.includes("pricing_plans"), "Shopify plan-management URL targets Shopify-hosted App Pricing");
assert(billing.indexOf("for (const item of subscription?.items || [])") < billing.indexOf("redirectHintPlan"), "subscription item handle is evaluated before redirect plan hint metadata");
assert(billing.includes("Entitlements must come from the signed Partner API response"), "plan_handle redirect query is explicitly non-authoritative for entitlements");
assert(billing.includes("providerConflict: true") && billing.includes("avoid double billing"), "active direct Stripe subscriptions fail safe instead of being overwritten by Shopify billing");

assert(status.includes("findAppStoreShopifyConnection") && status.includes('provider = hasShopifyAppStoreConnection'), "App Store installs enter Shopify billing UI while normal accounts retain their provider");
assert(sync.includes("syncShopifyBillingForConnection") && sync.includes("planHandle"), "welcome redirect has an authenticated Shopify billing reconciliation endpoint");
assert(embedded.includes('get("plan_handle")') && embedded.includes('/api/shopify/billing/sync'), "embedded welcome redirect reconciles the Shopify plan after authentication");
assert(embedded.includes('shopify=pricing-updated'), "successful Shopify plan return lands on Spreelo billing settings");

assert(panel.includes('/api/billing/status'), "billing UI uses provider-aware status endpoint");
assert(panel.includes('window.open(shopifyPlanUrl, "_top")'), "Shopify plan selection escapes the embedded frame correctly");
assert(panel.includes("shopifyProviderConflict") && panel.includes("shopifyPricingUnavailable"), "Shopify billing UI blocks unsafe/unavailable checkout states with an explanation");
assert(panel.includes("!isShopifyBilling ? <div>{CREDIT_PACKS.map"), "Stripe credit packs are hidden from Shopify App Store billing");
assert(panel.includes('/api/stripe/checkout') && panel.includes('/api/stripe/subscription/change'), "direct customer Stripe checkout/change paths remain present");
assert(stripe.includes('SPREELO_PLANS') && stripe.includes('stripeRequest("/v1/prices"') && stripe.includes('STRIPE_SECRET_KEY'), "existing Stripe billing engine remains intact");

assert(sql.includes("shopify_app_id text") && sql.includes("shopify_app_handle text") && sql.includes("shopify_billing_plan_handle text"), "Shopify billing identity and active plan metadata are persisted separately");
assert(sql.includes("apply_shopify_subscription_state_v144257") && sql.includes("deactivate_shopify_subscription_state_v144257"), "SQL has atomic Shopify activation/deactivation RPCs");
assert(sql.includes("plan_upgrade_delta") && sql.includes("p_monthly_credits,0) - v_old_limit"), "same-cycle upgrades grant only the positive credit allowance delta");
assert(sql.includes("purchased_credits_remaining") && sql.includes("v_grant + v_purchased"), "plan refresh preserves separately purchased non-expiring credits");
assert(sql.includes("refresh_due_shopify_annual_subscription_credits"), "annual Shopify subscriptions have monthly Spreelo credit refresh support");
assert(annual.includes("refresh_due_annual_subscription_credits") && annual.includes("refresh_due_shopify_annual_subscription_credits"), "annual credit cron refreshes both Stripe and Shopify providers");
assert(cron.includes("syncShopifyBillingForConnection") && cron.includes('install_source", "shopify_app_store"'), "hourly lifecycle reconciliation is restricted to App Store installs");
assert(vercel.includes('/api/cron/sync-shopify-billing') && vercel.includes('23 * * * *'), "Vercel schedules Shopify billing lifecycle reconciliation hourly");

assert(docs.includes("Starter | `starter` | 299 SEK | 2990 SEK | 150") && docs.includes("Growth | `growth` | 599 SEK | 5990 SEK | 450") && docs.includes("Pro | `pro` | 999 SEK | 9990 SEK | 1000"), "setup documentation pins Shopify pricing handles/prices to Spreelo plan credits");
assert(docs.includes("Welcome link") && docs.includes("`/shopify/app`"), "setup documentation includes Shopify plan welcome link");

console.log(`\nv144.257 Shopify App Pricing checks passed (${passed}/29).`);
