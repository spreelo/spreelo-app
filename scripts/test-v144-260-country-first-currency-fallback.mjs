import fs from "node:fs";
import assert from "node:assert/strict";
import {
  DIRECT_PLAN_MONTHLY_PRICES,
  resolveCurrencyFromCountry,
  resolveCurrencyFromLocale,
  resolveFixedCurrencyFromCountry,
  resolveDirectDisplayCurrency,
  normalizeBillingCurrency,
} from "../lib/billingPriceCatalog.js";
import { PRIMARY_CURRENCY_BY_COUNTRY } from "../lib/countryCurrency.js";

const billingPanel = fs.readFileSync("components/StripeBillingPanel.jsx", "utf8");
const billingStatus = fs.readFileSync("app/api/billing/status/route.js", "utf8");
const checkout = fs.readFileSync("app/api/stripe/checkout/route.js", "utf8");
const labels = fs.readFileSync("lib/i18n/defaultLabels.js", "utf8");

assert(Object.keys(PRIMARY_CURRENCY_BY_COUNTRY).length >= 240, "country currency map must cover the global long tail");
assert.equal(resolveCurrencyFromCountry("AW"), "AWG");
assert.equal(resolveCurrencyFromCountry("ZA"), "ZAR");
assert.equal(resolveCurrencyFromCountry("NZ"), "NZD");
assert.equal(resolveCurrencyFromCountry("CW"), "XCG");
assert.equal(resolveCurrencyFromCountry("BG"), "EUR");
assert.equal(resolveCurrencyFromCountry("DK"), "DKK");

assert.equal(resolveFixedCurrencyFromCountry("DK"), "DKK");
assert.equal(resolveFixedCurrencyFromCountry("IT"), "EUR");
assert.equal(resolveFixedCurrencyFromCountry("AW"), "");
assert.equal(resolveFixedCurrencyFromCountry("ZA"), "");
assert.equal(normalizeBillingCurrency("AWG"), "");
assert.equal(normalizeBillingCurrency("DKK"), "DKK");

// Locale language alone must never pick a billing currency. A region subtag may
// identify a market, but plain language-only locales fall back safely.
assert.equal(resolveCurrencyFromLocale("da", "SEK"), "SEK");
assert.equal(resolveCurrencyFromLocale("nl", "SEK"), "SEK");
assert.equal(resolveCurrencyFromLocale("nl-AW", "SEK"), "AWG");
assert.equal(resolveCurrencyFromLocale("da-DK", "SEK"), "DKK");

assert.equal(resolveDirectDisplayCurrency({ countryCode: "DK" }), "DKK");
assert.equal(resolveDirectDisplayCurrency({ countryCode: "AW" }), "SEK");
assert.equal(resolveDirectDisplayCurrency({ countryCode: "AW", subscriptionCurrency: "USD" }), "USD");
assert.deepEqual(DIRECT_PLAN_MONTHLY_PRICES.DKK, { starter: 199, growth: 399, pro: 659 });

assert(billingStatus.includes('request.headers.get("x-vercel-ip-country")'), "server country detection must remain primary");
assert(billingStatus.includes("localCurrency"), "billing status must expose detected market currency");
assert(billingStatus.includes('pricingMode = provider === "shopify"'), "billing status must expose pricing mode");
assert(billingStatus.includes('localCurrency && !fixedLocalCurrency ? "adaptive"'), "non-fixed market currencies must use adaptive fallback mode");
assert(billingPanel.includes("billing.localCurrencyCheckoutText"), "long-tail markets must get a clear checkout currency explanation");
assert(!billingPanel.includes("navigator.language"), "browser language must not decide billing currency");
assert(!billingPanel.includes("browserLocale"), "browser locale fallback must be removed from billing UI");
assert(labels.includes('"billing.localCurrencyCheckoutTitle"'), "adaptive fallback title must be translatable");
assert(labels.includes('"billing.localCurrencyCheckoutText"'), "adaptive fallback explanation must be translatable");
assert(checkout.includes('params["adaptive_pricing[enabled]"] = true'), "Stripe Adaptive Pricing must remain enabled for long-tail checkout");

console.log(`v144.260 country-first currency fallback checks passed for ${Object.keys(PRIMARY_CURRENCY_BY_COUNTRY).length} countries/territories and ${Object.keys(DIRECT_PLAN_MONTHLY_PRICES).length} fixed currencies.`);
