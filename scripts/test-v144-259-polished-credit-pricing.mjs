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
const pricingCsv = fs.readFileSync("STRIPE_LOCAL_PRICING_V144_259.csv", "utf8");

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

assert.deepEqual(DIRECT_CREDIT_PACK_PRICES.NOK, { spreelo_credits_100: 189, spreelo_credits_250: 379, spreelo_credits_500: 669 });
assert.deepEqual(DIRECT_CREDIT_PACK_PRICES.DKK, { spreelo_credits_100: 129, spreelo_credits_250: 259, spreelo_credits_500: 459 });
assert.deepEqual(DIRECT_CREDIT_PACK_PRICES.TRY, { spreelo_credits_100: 999, spreelo_credits_250: 1999, spreelo_credits_500: 3499 });
assert.deepEqual(DIRECT_CREDIT_PACK_PRICES.INR, { spreelo_credits_100: 1899, spreelo_credits_250: 3899, spreelo_credits_500: 6799 });
assert.deepEqual(DIRECT_CREDIT_PACK_PRICES.CAD, { spreelo_credits_100: 29, spreelo_credits_250: 57, spreelo_credits_500: 99 });
assert.deepEqual(DIRECT_CREDIT_PACK_PRICES.AUD, { spreelo_credits_100: 29, spreelo_credits_250: 57, spreelo_credits_500: 99 });

const nokCreditOptions = buildStripeCurrencyOptionsForLookup("spreelo_credits_100");
assert.equal(nokCreditOptions.nok, 18900);
assert.equal(nokCreditOptions.usd, 2000);
assert.equal(nokCreditOptions.eur, 1800);
assert.equal(nokCreditOptions.jpy, 3190);
assert.equal(nokCreditOptions.vnd, 519000);

const csvLines = pricingCsv.trim().split(/\r?\n/);
assert.equal(csvLines.length, 1 + Object.keys(DIRECT_PLAN_MONTHLY_PRICES).length * 6, "CSV must contain 3 plans + 3 credit packs per currency");
assert(pricingCsv.includes("NOK,credit_pack,credits_100,199,191.0666,189"), "CSV must show exact NOK conversion and polished local credit price");
assert(pricingCsv.includes("EUR,credit_pack,credits_500,699,61.9047,62"), "CSV must include EUR 500-credit comparison");

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

console.log(`v144.259 polished local pricing checks passed for ${Object.keys(DIRECT_PLAN_MONTHLY_PRICES).length} fixed currencies.`);
