import { getPrimaryCurrencyForCountry } from "./countryCurrency.js";

// Spreelo v144.260 — one source of truth for customer-facing billing prices.
// SEK remains the accounting/base price for direct Stripe billing.
// Local prices are deliberately fixed/rounded so important markets get clean,
// stable prices. Country decides currency; UI language never decides billing currency.
// Stripe Adaptive Pricing is used as the long-tail fallback.

export const DIRECT_PLAN_MONTHLY_PRICES = Object.freeze({
  SEK: Object.freeze({ starter: 299, growth: 599, pro: 999 }),
  USD: Object.freeze({ starter: 29, growth: 59, pro: 99 }),
  EUR: Object.freeze({ starter: 27, growth: 53, pro: 89 }),
  GBP: Object.freeze({ starter: 23, growth: 46, pro: 76 }),
  NOK: Object.freeze({ starter: 289, growth: 579, pro: 959 }),
  DKK: Object.freeze({ starter: 199, growth: 399, pro: 659 }),
  PLN: Object.freeze({ starter: 119, growth: 229, pro: 389 }),
  TRY: Object.freeze({ starter: 1499, growth: 2999, pro: 4999 }),
  INR: Object.freeze({ starter: 2899, growth: 5799, pro: 9699 }),
  IDR: Object.freeze({ starter: 539000, growth: 1079000, pro: 1799000 }),
  JPY: Object.freeze({ starter: 4790, growth: 9590, pro: 15900 }),
  KRW: Object.freeze({ starter: 40900, growth: 81900, pro: 136900 }),
  CNY: Object.freeze({ starter: 199, growth: 399, pro: 679 }),
  THB: Object.freeze({ starter: 999, growth: 1999, pro: 3399 }),
  CZK: Object.freeze({ starter: 649, growth: 1299, pro: 2149 }),
  RON: Object.freeze({ starter: 139, growth: 279, pro: 469 }),
  HUF: Object.freeze({ starter: 9690, growth: 19390, pro: 32390 }),
  MYR: Object.freeze({ starter: 123, growth: 246, pro: 411 }),
  PHP: Object.freeze({ starter: 1889, growth: 3779, pro: 6299 }),
  CAD: Object.freeze({ starter: 43, growth: 86, pro: 143 }),
  AUD: Object.freeze({ starter: 43, growth: 86, pro: 144 }),
  BRL: Object.freeze({ starter: 157, growth: 314, pro: 523 }),
  MXN: Object.freeze({ starter: 539, growth: 1069, pro: 1789 }),
  CHF: Object.freeze({ starter: 25, growth: 50, pro: 84 }),
  AED: Object.freeze({ starter: 109, growth: 219, pro: 369 }),
  SAR: Object.freeze({ starter: 113, growth: 225, pro: 379 }),
  UAH: Object.freeze({ starter: 1349, growth: 2699, pro: 4499 }),
  VND: Object.freeze({ starter: 779000, growth: 1569000, pro: 2619000 }),
  RUB: Object.freeze({ starter: 2549, growth: 5099, pro: 8499 }),
});

// Credit packs use the same SEK-relative conversion principle and are rounded
// to practical whole local amounts. They are only used for direct Stripe billing.
export const DIRECT_CREDIT_PACK_PRICES = Object.freeze({
  SEK: Object.freeze({ spreelo_credits_100: 199, spreelo_credits_250: 399, spreelo_credits_500: 699 }),
  USD: Object.freeze({ spreelo_credits_100: 20, spreelo_credits_250: 40, spreelo_credits_500: 70 }),
  EUR: Object.freeze({ spreelo_credits_100: 18, spreelo_credits_250: 35, spreelo_credits_500: 62 }),
  GBP: Object.freeze({ spreelo_credits_100: 15, spreelo_credits_250: 30, spreelo_credits_500: 53 }),
  NOK: Object.freeze({ spreelo_credits_100: 189, spreelo_credits_250: 379, spreelo_credits_500: 669 }),
  DKK: Object.freeze({ spreelo_credits_100: 129, spreelo_credits_250: 259, spreelo_credits_500: 459 }),
  PLN: Object.freeze({ spreelo_credits_100: 79, spreelo_credits_250: 155, spreelo_credits_500: 269 }),
  TRY: Object.freeze({ spreelo_credits_100: 999, spreelo_credits_250: 1999, spreelo_credits_500: 3499 }),
  INR: Object.freeze({ spreelo_credits_100: 1899, spreelo_credits_250: 3899, spreelo_credits_500: 6799 }),
  IDR: Object.freeze({ spreelo_credits_100: 359000, spreelo_credits_250: 719000, spreelo_credits_500: 1259000 }),
  JPY: Object.freeze({ spreelo_credits_100: 3190, spreelo_credits_250: 6390, spreelo_credits_500: 11190 }),
  KRW: Object.freeze({ spreelo_credits_100: 26900, spreelo_credits_250: 54900, spreelo_credits_500: 95900 }),
  CNY: Object.freeze({ spreelo_credits_100: 135, spreelo_credits_250: 269, spreelo_credits_500: 475 }),
  THB: Object.freeze({ spreelo_credits_100: 669, spreelo_credits_250: 1349, spreelo_credits_500: 2349 }),
  CZK: Object.freeze({ spreelo_credits_100: 429, spreelo_credits_250: 859, spreelo_credits_500: 1499 }),
  RON: Object.freeze({ spreelo_credits_100: 93, spreelo_credits_250: 185, spreelo_credits_500: 329 }),
  HUF: Object.freeze({ spreelo_credits_100: 6390, spreelo_credits_250: 12900, spreelo_credits_500: 22590 }),
  MYR: Object.freeze({ spreelo_credits_100: 82, spreelo_credits_250: 165, spreelo_credits_500: 289 }),
  PHP: Object.freeze({ spreelo_credits_100: 1259, spreelo_credits_250: 2519, spreelo_credits_500: 4399 }),
  CAD: Object.freeze({ spreelo_credits_100: 29, spreelo_credits_250: 57, spreelo_credits_500: 99 }),
  AUD: Object.freeze({ spreelo_credits_100: 29, spreelo_credits_250: 57, spreelo_credits_500: 99 }),
  BRL: Object.freeze({ spreelo_credits_100: 105, spreelo_credits_250: 209, spreelo_credits_500: 365 }),
  MXN: Object.freeze({ spreelo_credits_100: 359, spreelo_credits_250: 709, spreelo_credits_500: 1249 }),
  CHF: Object.freeze({ spreelo_credits_100: 17, spreelo_credits_250: 33, spreelo_credits_500: 59 }),
  AED: Object.freeze({ spreelo_credits_100: 74, spreelo_credits_250: 149, spreelo_credits_500: 259 }),
  SAR: Object.freeze({ spreelo_credits_100: 75, spreelo_credits_250: 149, spreelo_credits_500: 265 }),
  UAH: Object.freeze({ spreelo_credits_100: 899, spreelo_credits_250: 1799, spreelo_credits_500: 3149 }),
  VND: Object.freeze({ spreelo_credits_100: 519000, spreelo_credits_250: 1049000, spreelo_credits_500: 1829000 }),
  RUB: Object.freeze({ spreelo_credits_100: 1699, spreelo_credits_250: 3399, spreelo_credits_500: 5949 }),
});

export const SHOPIFY_PLAN_MONTHLY_USD = Object.freeze({ starter: 29, growth: 59, pro: 99 });

export function normalizeCurrencyCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

export const ZERO_DECIMAL_STRIPE_CURRENCIES = new Set(["JPY", "KRW", "VND"]);

export function normalizeBillingCurrency(value) {
  const code = normalizeCurrencyCode(value);
  return code && DIRECT_PLAN_MONTHLY_PRICES[code] ? code : "";
}

export function hasFixedDirectPriceCurrency(value) {
  return Boolean(normalizeBillingCurrency(value));
}

// Returns the market's primary ISO currency even when Spreelo does not maintain
// a hand-rounded fixed Stripe price for that currency.
export function resolveCurrencyFromCountry(countryCode, fallback = "") {
  return getPrimaryCurrencyForCountry(countryCode) || normalizeCurrencyCode(fallback);
}

export function resolveFixedCurrencyFromCountry(countryCode, fallback = "") {
  return normalizeBillingCurrency(resolveCurrencyFromCountry(countryCode)) || normalizeBillingCurrency(fallback);
}

// Kept for compatibility with older callers/tests. Only a locale REGION may
// influence currency (for example en-GB -> GBP). The language itself never does.
export function resolveCurrencyFromLocale(locale, fallback = "SEK") {
  const raw = String(locale || "").trim().replace(/_/g, "-");
  const parts = raw.split("-").filter(Boolean);
  const region = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part))?.toUpperCase() || "";
  return (region ? resolveCurrencyFromCountry(region) : "") || normalizeCurrencyCode(fallback) || "SEK";
}

export function resolveDirectDisplayCurrency({ countryCode, subscriptionCurrency, fallback = "SEK" } = {}) {
  return (
    normalizeBillingCurrency(subscriptionCurrency) ||
    resolveFixedCurrencyFromCountry(countryCode, fallback) ||
    normalizeBillingCurrency(fallback) ||
    "SEK"
  );
}

export function getPlanPrice({ planKey, interval = "month", currency = "SEK", shopify = false } = {}) {
  const key = String(planKey || "").toLowerCase();
  if (!key) return null;
  if (shopify) {
    const monthly = SHOPIFY_PLAN_MONTHLY_USD[key];
    if (!Number.isFinite(monthly)) return null;
    return { amount: interval === "year" ? monthly * 10 : monthly, currency: "USD" };
  }
  const code = normalizeBillingCurrency(currency) || "SEK";
  const monthly = DIRECT_PLAN_MONTHLY_PRICES[code]?.[key];
  if (!Number.isFinite(monthly)) return null;
  return { amount: interval === "year" ? monthly * 10 : monthly, currency: code };
}

export function getCreditPackPrice({ lookupKey, currency = "SEK" } = {}) {
  const code = normalizeBillingCurrency(currency) || "SEK";
  const amount = DIRECT_CREDIT_PACK_PRICES[code]?.[lookupKey];
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: code };
}

export function formatBillingMoney(amount, currency, locale = "en") {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "—";
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: String(currency || "SEK").toUpperCase(),
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString(locale || "en")} ${String(currency || "SEK").toUpperCase()}`;
  }
}

export function toStripeMinorUnits(amount, currency) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) throw new Error(`Invalid amount for ${currency}.`);
  const code = String(currency || "").toUpperCase();
  return ZERO_DECIMAL_STRIPE_CURRENCIES.has(code) ? Math.round(numeric) : Math.round(numeric * 100);
}

export function buildStripeCurrencyOptionsForLookup(lookupKey) {
  const normalized = String(lookupKey || "").trim();
  const match = normalized.match(/^spreelo_(starter|growth|pro)_(monthly|yearly)$/);
  const options = {};
  if (match) {
    const [, planKey, cadence] = match;
    for (const currency of Object.keys(DIRECT_PLAN_MONTHLY_PRICES)) {
      if (currency === "SEK") continue;
      const monthly = DIRECT_PLAN_MONTHLY_PRICES[currency][planKey];
      const amount = cadence === "yearly" ? monthly * 10 : monthly;
      options[currency.toLowerCase()] = toStripeMinorUnits(amount, currency);
    }
    return options;
  }
  if (/^spreelo_credits_(100|250|500)$/.test(normalized)) {
    for (const currency of Object.keys(DIRECT_CREDIT_PACK_PRICES)) {
      if (currency === "SEK") continue;
      const amount = DIRECT_CREDIT_PACK_PRICES[currency][normalized];
      options[currency.toLowerCase()] = toStripeMinorUnits(amount, currency);
    }
  }
  return options;
}
