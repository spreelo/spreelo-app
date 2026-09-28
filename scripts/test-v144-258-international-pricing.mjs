import fs from "node:fs";
import assert from "node:assert/strict";
import {
  DIRECT_PLAN_MONTHLY_PRICES,
  DIRECT_CREDIT_PACK_PRICES,
  SHOPIFY_PLAN_MONTHLY_USD,
  getPlanPrice,
  resolveCurrencyFromLocale,
  buildStripeCurrencyOptionsForLookup,
} from "../lib/billingPriceCatalog.js";

const billingPanel = fs.readFileSync("components/StripeBillingPanel.jsx", "utf8");
const checkout = fs.readFileSync("app/api/stripe/checkout/route.js", "utf8");
const syncScript = fs.readFileSync("scripts/sync-stripe-local-prices.mjs", "utf8");
const webhook = fs.readFileSync("app/api/stripe/webhook/route.js", "utf8");
const billingStatus = fs.readFileSync("app/api/billing/status/route.js", "utf8");

assert.deepEqual(DIRECT_PLAN_MONTHLY_PRICES.SEK, { starter: 299, growth: 599, pro: 999 });
assert.deepEqual(DIRECT_PLAN_MONTHLY_PRICES.USD, { starter: 29, growth: 59, pro: 99 });
assert.deepEqual(DIRECT_PLAN_MONTHLY_PRICES.EUR, { starter: 27, growth: 53, pro: 89 });
assert.deepEqual(SHOPIFY_PLAN_MONTHLY_USD, { starter: 29, growth: 59, pro: 99 });

for (const [currency, prices] of Object.entries(DIRECT_PLAN_MONTHLY_PRICES)) {
  for (const key of ["starter", "growth", "pro"]) {
    assert(Number.isFinite(prices[key]) && prices[key] > 0, `${currency} ${key} missing`);
    const monthly = getPlanPrice({ planKey: key, interval: "month", currency });
    const yearly = getPlanPrice({ planKey: key, interval: "year", currency });
    assert.equal(yearly.amount, monthly.amount * 10, `${currency} ${key} annual must equal 10 months`);
  }
  assert(DIRECT_CREDIT_PACK_PRICES[currency], `${currency} credit packs missing`);
}

assert.equal(resolveCurrencyFromLocale("sv-SE"), "SEK");
assert.equal(resolveCurrencyFromLocale("en-US"), "USD");
assert.equal(resolveCurrencyFromLocale("en-GB"), "GBP");
assert.equal(resolveCurrencyFromLocale("de-DE"), "EUR");
assert.equal(resolveCurrencyFromLocale("pt-BR"), "BRL");
assert.equal(resolveCurrencyFromLocale("fr-CA"), "CAD");
assert.equal(resolveCurrencyFromLocale("bg-BG"), "EUR");
assert.equal(resolveCurrencyFromLocale("ja-JP"), "JPY");
assert.equal(resolveCurrencyFromLocale("ru-RU"), "RUB");

const starterOptions = buildStripeCurrencyOptionsForLookup("spreelo_starter_monthly");
assert.equal(starterOptions.usd, 2900);
assert.equal(starterOptions.eur, 2700);
assert.equal(starterOptions.jpy, 4790);
assert.equal(starterOptions.vnd, 779000);
assert(!("sek" in starterOptions), "SEK stays the default/base Stripe currency");

assert(billingPanel.includes("formatBillingMoney"), "billing UI must format currency-aware prices");
assert(billingPanel.includes("resolveDirectDisplayCurrency"), "billing UI must resolve local direct currency");
assert(!billingPanel.includes('price.toLocaleString(locale || "en") + " kr"'), "old hardcoded SEK rendering must be gone");
assert(!billingPanel.includes("{pack.price} kr"), "credit packs must not hardcode SEK");
assert(checkout.includes('params["adaptive_pricing[enabled]"] = true'), "Checkout must enable Adaptive Pricing fallback");
assert(syncScript.includes("--allow-live"), "live Stripe sync requires explicit second safety flag");
assert(webhook.includes("subscription?.currency"), "Stripe webhook must persist the actual subscription currency");
assert(webhook.includes("currency_options?.[subscriptionCurrency]"), "Stripe webhook must read the selected multi-currency amount when available");
assert(billingStatus.includes("x-vercel-ip-country"), "billing status should use Vercel country for pre-checkout local price display");

console.log(`v144.258 international pricing checks passed for ${Object.keys(DIRECT_PLAN_MONTHLY_PRICES).length} fixed currencies.`);
