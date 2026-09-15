import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const STRIPE_API_VERSION =
  process.env.STRIPE_API_VERSION || "2026-03-04.preview";

export const SPREELO_PLANS = Object.freeze({
  starter: Object.freeze({
    key: "starter",
    name: "Starter",
    credits: 150,
    monthlyLookupKey: "spreelo_starter_monthly",
    yearlyLookupKey: "spreelo_starter_yearly",
  }),
  growth: Object.freeze({
    key: "growth",
    name: "Growth",
    credits: 450,
    monthlyLookupKey: "spreelo_growth_monthly",
    yearlyLookupKey: "spreelo_growth_yearly",
  }),
  pro: Object.freeze({
    key: "pro",
    name: "Pro",
    credits: 1000,
    monthlyLookupKey: "spreelo_pro_monthly",
    yearlyLookupKey: "spreelo_pro_yearly",
  }),
});

export const SPREELO_CREDIT_PACKS = Object.freeze({
  spreelo_credits_100: Object.freeze({ credits: 100, label: "100 credits" }),
  spreelo_credits_250: Object.freeze({ credits: 250, label: "250 credits" }),
  spreelo_credits_500: Object.freeze({ credits: 500, label: "500 credits" }),
});


const SHARED_HOST_ROOTS = new Set([
  "myshopify.com", "wixsite.com", "wordpress.com", "webflow.io", "square.site",
  "notion.site", "carrd.co", "github.io", "blogspot.com", "tumblr.com"
]);

const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz",
  "com.br", "com.mx", "co.jp", "co.kr", "com.sg", "com.tr", "co.za", "com.cn",
  "com.hk", "com.tw", "co.in"
]);

function normalizeHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return String(url.hostname || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function getRegistrableBusinessDomain(value) {
  const host = normalizeHost(value);
  if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  for (const sharedRoot of SHARED_HOST_ROOTS) {
    if (host === sharedRoot || host.endsWith(`.${sharedRoot}`)) return host;
  }
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return host;
  const suffix2 = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(suffix2) && labels.length >= 3) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

export function normalizeBusinessNameKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

export function comparePlanLevel(currentKey, targetKey) {
  const rank = { free: 0, starter: 1, growth: 2, pro: 3 };
  return (rank[targetKey] || 0) - (rank[currentKey] || 0);
}

const PLAN_BY_LOOKUP = Object.freeze(
  Object.values(SPREELO_PLANS).reduce((map, plan) => {
    map[plan.monthlyLookupKey] = { ...plan, interval: "month" };
    map[plan.yearlyLookupKey] = { ...plan, interval: "year" };
    return map;
  }, {})
);

export function getPlanByLookupKey(lookupKey) {
  return PLAN_BY_LOOKUP[String(lookupKey || "").trim()] || null;
}

export function getCreditPackByLookupKey(lookupKey) {
  return SPREELO_CREDIT_PACKS[String(lookupKey || "").trim()] || null;
}

export function getAllowedCheckoutLookup(lookupKey) {
  const normalized = String(lookupKey || "").trim();
  const plan = getPlanByLookupKey(normalized);
  if (plan) return { kind: "subscription", lookupKey: normalized, plan };
  const pack = getCreditPackByLookupKey(normalized);
  if (pack) return { kind: "credits", lookupKey: normalized, pack };
  return null;
}

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server configuration is missing.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedBillingUser(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!url || !anonKey) return { error: "Supabase authentication is not configured.", status: 500 };
  if (!token) return { error: "You must be logged in.", status: 401 };

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return { error: "Your login session is not valid.", status: 401 };
  return { user, admin: getServerSupabase() };
}

function appendParam(params, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "boolean") params.append(key, value ? "true" : "false");
  else params.append(key, String(value));
}

export async function stripeRequest(path, { method = "GET", params = null, apiVersion = STRIPE_API_VERSION } = {}) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is missing.");

  const url = new URL(`https://api.stripe.com${path}`);
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": apiVersion,
    },
    cache: "no-store",
  };

  if (params && method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach((item) => appendParam(url.searchParams, key, item));
      else appendParam(url.searchParams, key, value);
    }
  } else if (params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach((item) => appendParam(body, key, item));
      else appendParam(body, key, value);
    }
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body.toString();
  }

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Stripe request failed (${response.status}).`);
    error.status = response.status;
    error.stripeCode = payload?.error?.code || null;
    error.stripeType = payload?.error?.type || null;
    throw error;
  }
  return payload;
}

export async function findStripePriceByLookupKey(lookupKey) {
  const payload = await stripeRequest("/v1/prices", {
    params: {
      "lookup_keys[]": lookupKey,
      active: true,
      limit: 10,
      "expand[]": "data.product",
    },
  });
  const price = (payload?.data || []).find((item) => item?.lookup_key === lookupKey) || null;
  if (!price) throw new Error(`Stripe price not found for lookup key ${lookupKey}.`);
  return price;
}

export async function createStripeCustomer({ userId, email }) {
  return stripeRequest("/v1/customers", {
    method: "POST",
    params: {
      email: email || undefined,
      "metadata[spreelo_user_id]": userId,
      "metadata[source]": "spreelo",
    },
  });
}

export async function getOrCreateStripeCustomer({ admin, user }) {
  const { data: balance } = await admin
    .from("user_credit_balances")
    .select("provider_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (balance?.provider_customer_id) return balance.provider_customer_id;

  const customer = await createStripeCustomer({ userId: user.id, email: user.email || null });
  const { data: updated, error } = await admin
    .from("user_credit_balances")
    .update({
      payment_provider: "stripe",
      provider_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error(`Could not save Stripe customer: ${error.message}`);
  if (!updated?.user_id) throw new Error("No Spreelo credit balance exists for this account yet.");
  return customer.id;
}

export function getCheckoutOrigin(request) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (!host) throw new Error("Could not determine application URL.");
  return `${proto}://${host}`;
}

export function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is missing.");
  if (!signatureHeader) throw new Error("Stripe-Signature header is missing.");

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error("Stripe signature header is invalid.");

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    try {
      const actualBuffer = Buffer.from(signature, "hex");
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  });
  if (!valid) throw new Error("Stripe webhook signature verification failed.");
  return true;
}

export function unixToIso(value) {
  const seconds = Number(value || 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

export function addUtcMonths(isoValue, months = 1) {
  const date = isoValue ? new Date(isoValue) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

export function extractSubscriptionId(invoice) {
  return (
    invoice?.subscription ||
    invoice?.parent?.subscription_details?.subscription ||
    invoice?.lines?.data?.find((line) => line?.parent?.subscription_item_details?.subscription)?.parent?.subscription_item_details?.subscription ||
    null
  );
}

export function extractSubscriptionLookupKey(subscription) {
  return subscription?.items?.data?.[0]?.price?.lookup_key || null;
}
