import { addUtcMonths, getAuthenticatedBillingUser, SPREELO_PLANS } from "./stripeBilling.js";
import { getShopifyEnv, shopifyGraphqlForBrand } from "./shopifyOAuth.js";
import { markFreeTrialUsedForPaidPlan } from "./freeTrial.js";

export const SHOPIFY_PARTNER_API_VERSION = String(process.env.SHOPIFY_PARTNER_API_VERSION || "2026-07").trim();

const SHOP_QUERY = `query SpreeloBillingIdentity {
  shop { id myshopifyDomain }
  currentAppInstallation { app { id handle } }
}`;
const ACTIVE_SUBSCRIPTION_QUERY = `
  query SpreeloActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      shop { id myshopifyDomain }
      billingPeriod
      cancelAtEndOfCycle
      trialEndsAt
      currentBillingCycle { startTime endTime }
      items {
        handle
        description
        price {
          __typename
          active
          currency
          ... on FlatRatePrice { amount }
        }
      }
      pendingUpdate {
        billingPeriod
        items {
          handle
          description
          price {
            __typename
            active
            currency
            ... on FlatRatePrice { amount }
          }
        }
      }
      legacySubscriptionId
    }
  }
`;

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

function normalizeHandle(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function envHandle(planKey) {
  return normalizeHandle(process.env[`SHOPIFY_PLAN_HANDLE_${String(planKey || "").toUpperCase()}`] || planKey);
}

export function getShopifyPlanHandleMap() {
  const map = new Map();
  for (const plan of Object.values(SPREELO_PLANS)) {
    const canonical = envHandle(plan.key);
    const aliases = new Set([
      canonical,
      normalizeHandle(plan.key),
      normalizeHandle(`spreelo_${plan.key}`),
      normalizeHandle(`${plan.key}_plan`),
      normalizeHandle(`spreelo_${plan.key}_plan`),
    ]);
    for (const alias of aliases) if (alias) map.set(alias, plan);
  }
  return map;
}

export function resolveShopifyPlan(value) {
  const normalized = normalizeHandle(value);
  if (!normalized) return null;
  return getShopifyPlanHandleMap().get(normalized) || null;
}

function normalizeActiveAppId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^gid:\/\/shopify\/App\/\d+$/i.test(raw)) return raw.replace(/^gid:\/\/shopify\/App\//i, "gid://shopify/App/");
  if (/^gid:\/\/partners\/App\/\d+$/i.test(raw)) return raw.replace(/^gid:\/\/partners\/App\//i, "gid://shopify/App/");
  if (/^\d+$/.test(raw)) return `gid://shopify/App/${raw}`;
  return raw;
}

export function getShopifyAppPricingEnv() {
  const orgId = String(process.env.SHOPIFY_PARTNER_ORG_ID || "").trim();
  const accessToken = String(process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN || "").trim();
  const appId = normalizeActiveAppId(process.env.SHOPIFY_PARTNER_APP_ID || "");
  const appHandle = String(process.env.SHOPIFY_APP_HANDLE || "").trim();
  const missing = [];
  if (!orgId) missing.push("SHOPIFY_PARTNER_ORG_ID");
  if (!accessToken) missing.push("SHOPIFY_PARTNER_API_ACCESS_TOKEN");
  // The app GID and handle are normally discovered from the authenticated Shopify
  // installation. Environment overrides remain supported for emergency recovery.

  return {
    orgId,
    accessToken,
    appId,
    appHandle,
    apiVersion: SHOPIFY_PARTNER_API_VERSION,
    configured: missing.length === 0,
    missing,
  };
}

export function buildShopifyPlanSelectionUrl(shopDomain, appHandle = getShopifyAppPricingEnv().appHandle) {
  const storeHandle = String(shopDomain || "").trim().toLowerCase().replace(/\.myshopify\.com$/i, "");
  const handle = String(appHandle || "").trim();
  if (!storeHandle || !handle) return "";
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(handle)}/pricing_plans`;
}

export async function shopifyPartnerGraphql({ query, variables = {}, env = getShopifyAppPricingEnv() }) {
  if (!env.configured) {
    const error = new Error(`Shopify App Pricing is not configured: ${env.missing.join(", ")}`);
    error.code = "SHOPIFY_APP_PRICING_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`https://partners.shopify.com/${encodeURIComponent(env.orgId)}/api/${env.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": env.accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload?.errors) && payload.errors.length)) {
    const message = payload?.errors?.map((item) => item?.message).filter(Boolean).join("; ") || `Shopify Partner API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = /only public apps/i.test(message) ? "SHOPIFY_APP_NOT_PUBLIC" : "SHOPIFY_PARTNER_API_ERROR";
    throw error;
  }
  return payload?.data || {};
}

export async function findAppStoreShopifyConnection(admin, userId, { connectedOnly = true } = {}) {
  let query = admin
    .from("shopify_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("install_source", "shopify_app_store")
    .order("connected_at", { ascending: false })
    .limit(3);
  if (connectedOnly) query = query.eq("status", "connected");
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (rows.length > 1) {
    const ambiguity = new Error("More than one Shopify App Store connection is linked to this Spreelo account.");
    ambiguity.code = "SHOPIFY_BILLING_CONNECTION_AMBIGUOUS";
    throw ambiguity;
  }
  return rows[0] || null;
}

async function loadBillingRow(admin, userId) {
  const { data, error } = await admin
    .from("user_credit_balances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function activeStripeSubscription(balance) {
  const status = String(balance?.subscription_status || "").toLowerCase();
  return Boolean(
    balance?.payment_provider === "stripe" &&
    balance?.provider_subscription_id &&
    ["active", "trialing", "past_due", "unpaid", "paused"].includes(status)
  );
}

async function loadShopifyBillingIdentity(admin, connection) {
  const stored = {
    shopId: String(connection?.shopify_shop_id || "").trim(),
    appId: String(connection?.shopify_app_id || "").trim(),
    appHandle: String(connection?.shopify_app_handle || "").trim(),
  };
  if (stored.shopId && stored.appId && stored.appHandle) return stored;

  const shopifyEnv = getShopifyEnv();
  const { data } = await shopifyGraphqlForBrand({
    supabaseAdmin: admin,
    brandProfileId: connection.brand_profile_id,
    apiVersion: shopifyEnv.apiVersion,
    query: SHOP_QUERY,
  });
  const identity = {
    shopId: String(data?.shop?.id || stored.shopId || "").trim(),
    appId: String(data?.currentAppInstallation?.app?.id || stored.appId || "").trim(),
    appHandle: String(data?.currentAppInstallation?.app?.handle || stored.appHandle || "").trim(),
  };
  if (!identity.shopId) throw new Error("Shopify did not return a shop ID for billing.");
  if (!identity.appId) throw new Error("Shopify did not return the installed app ID for billing.");
  if (!identity.appHandle) throw new Error("Shopify did not return the installed app handle for billing.");

  await admin.from("shopify_connections").update({
    shopify_shop_id: identity.shopId,
    shopify_app_id: identity.appId,
    shopify_app_handle: identity.appHandle,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  return identity;
}

export async function fetchActiveShopifySubscription({ shopId, appId, env = getShopifyAppPricingEnv() }) {
  const effectiveAppId = normalizeActiveAppId(appId || env.appId);
  if (!effectiveAppId) throw new Error("Shopify app ID is missing for Active Subscription lookup.");
  const data = await shopifyPartnerGraphql({
    env,
    query: ACTIVE_SUBSCRIPTION_QUERY,
    variables: { appId: effectiveAppId, shopId },
  });
  return data?.activeSubscription || null;
}

function resolvePlanFromSubscription(subscription, planHandleHint = "") {
  // Entitlements must come from the signed Partner API response, never from the
  // redirect query string. plan_handle is only a navigation hint from Shopify.
  for (const item of subscription?.items || []) {
    const plan = resolveShopifyPlan(item?.handle);
    if (plan) {
      const hintPlan = resolveShopifyPlan(planHandleHint);
      return {
        plan,
        handle: normalizeHandle(item.handle),
        redirectHintPlan: hintPlan?.key || null,
        redirectHintMatched: !hintPlan || hintPlan.key === plan.key,
      };
    }
  }
  return { plan: null, handle: "", redirectHintPlan: resolveShopifyPlan(planHandleHint)?.key || null, redirectHintMatched: false };
}

function intervalFromBillingPeriod(value) {
  return String(value || "").toUpperCase() === "ANNUAL" ? "year" : "month";
}

function firstFlatRatePrice(subscription) {
  return (subscription?.items || []).find((item) => item?.price?.__typename === "FlatRatePrice" && item?.price?.active !== false)?.price || null;
}

function moneyToMinorUnits(amount, currency) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;
  const code = String(currency || "").toUpperCase();
  const digits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : THREE_DECIMAL_CURRENCIES.has(code) ? 3 : 2;
  return Math.round(numeric * (10 ** digits));
}

function sourceIdForSubscription({ shopId, planKey, subscription, interval }) {
  const cycleStart = String(subscription?.currentBillingCycle?.startTime || "").trim();
  if (cycleStart) return `shopify_cycle:${shopId}:${planKey}:${interval}:${cycleStart}`;
  const trialEndsAt = String(subscription?.trialEndsAt || "").trim();
  if (trialEndsAt) return `shopify_trial:${shopId}:${planKey}:${trialEndsAt}`;
  return `shopify_active:${shopId}:${planKey}:${interval}`;
}

function resolvePendingPlan(subscription) {
  for (const item of subscription?.pendingUpdate?.items || []) {
    const plan = resolveShopifyPlan(item?.handle);
    if (plan) return { plan, handle: normalizeHandle(item.handle) };
  }
  return { plan: null, handle: "" };
}

export async function syncShopifyBillingForConnection(admin, {
  connection,
  userId = connection?.user_id,
  planHandleHint = "",
  allowInactiveTransition = true,
} = {}) {
  if (!connection?.id || !userId) throw new Error("A Shopify App Store connection is required for billing sync.");
  const pricingEnv = getShopifyAppPricingEnv();
  const storedAppHandle = String(connection?.shopify_app_handle || pricingEnv.appHandle || "").trim();
  if (!pricingEnv.configured) {
    return {
      configured: false,
      provider: "shopify",
      shopDomain: connection.shop_domain,
      selectionUrl: buildShopifyPlanSelectionUrl(connection.shop_domain, storedAppHandle),
      missing: pricingEnv.missing,
    };
  }

  const currentBalance = await loadBillingRow(admin, userId);
  const identity = await loadShopifyBillingIdentity(admin, connection);
  const appId = normalizeActiveAppId(pricingEnv.appId || identity.appId);
  const appHandle = pricingEnv.appHandle || identity.appHandle;
  const shopId = identity.shopId;
  const selectionUrl = buildShopifyPlanSelectionUrl(connection.shop_domain, appHandle);

  let subscription;
  try {
    subscription = await fetchActiveShopifySubscription({ shopId, appId, env: pricingEnv });
  } catch (error) {
    await admin.from("shopify_connections").update({
      shopify_billing_last_synced_at: new Date().toISOString(),
      shopify_billing_last_error: String(error?.message || "Shopify billing sync failed").slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    if (error?.code === "SHOPIFY_APP_NOT_PUBLIC") {
      return {
        configured: true,
        provider: "shopify",
        available: false,
        reason: "app_not_public",
        shopDomain: connection.shop_domain,
        selectionUrl,
        message: error.message,
      };
    }
    throw error;
  }

  if (activeStripeSubscription(currentBalance)) {
    return {
      configured: true,
      provider: "shopify",
      providerConflict: true,
      shopDomain: connection.shop_domain,
      selectionUrl,
      activeShopifySubscription: Boolean(subscription),
      message: subscription
        ? "This Spreelo account has both a direct Stripe subscription and a Shopify subscription. Billing must be reconciled before plan access changes."
        : "An active direct Spreelo subscription already exists. End or migrate it before starting Shopify billing to avoid double billing.",
    };
  }

  if (!subscription) {
    if (allowInactiveTransition && currentBalance?.payment_provider === "shopify" && currentBalance?.subscription_plan !== "free") {
      const { error } = await admin.rpc("deactivate_shopify_subscription_state_v144257", {
        p_user_id: userId,
        p_shop_id: shopId,
      });
      if (error) throw new Error(`Could not deactivate Shopify billing state: ${error.message}`);
    }
    await admin.from("shopify_connections").update({
      shopify_shop_id: shopId,
      shopify_billing_plan_handle: null,
      shopify_billing_last_synced_at: new Date().toISOString(),
      shopify_billing_last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    return {
      configured: true,
      provider: "shopify",
      active: false,
      shopId,
      shopDomain: connection.shop_domain,
      selectionUrl,
      subscription: null,
    };
  }

  const resolved = resolvePlanFromSubscription(subscription, planHandleHint);
  if (!resolved.plan) {
    const handles = (subscription?.items || []).map((item) => item?.handle).filter(Boolean);
    const error = new Error(`Shopify subscription plan is not mapped to Spreelo (${handles.join(", ") || "missing handle"}).`);
    error.code = "SHOPIFY_PLAN_NOT_MAPPED";
    await admin.from("shopify_connections").update({
      shopify_billing_last_synced_at: new Date().toISOString(),
      shopify_billing_last_error: error.message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    throw error;
  }

  const interval = intervalFromBillingPeriod(subscription.billingPeriod);
  const flatPrice = firstFlatRatePrice(subscription);
  const currency = String(flatPrice?.currency || currentBalance?.subscription_currency || "SEK").toUpperCase();
  const amountMinor = moneyToMinorUnits(flatPrice?.amount, currency);
  const cycleStart = subscription?.currentBillingCycle?.startTime || null;
  const cycleEnd = subscription?.currentBillingCycle?.endTime || subscription?.trialEndsAt || null;
  const trialing = Boolean(subscription?.trialEndsAt && !subscription?.currentBillingCycle);
  const status = trialing ? "trialing" : "active";
  const sourceId = sourceIdForSubscription({ shopId, planKey: resolved.plan.key, subscription, interval });
  const nextAnnualRefreshAt = interval === "year" && cycleStart ? addUtcMonths(cycleStart, 1) : null;

  const { error: applyError } = await admin.rpc("apply_shopify_subscription_state_v144257", {
    p_user_id: userId,
    p_plan: resolved.plan.key,
    p_monthly_credits: resolved.plan.credits,
    p_status: status,
    p_shop_id: shopId,
    p_plan_handle: resolved.handle || resolved.plan.key,
    p_interval: interval,
    p_current_period_start: cycleStart,
    p_current_period_end: cycleEnd,
    p_cancel_at_period_end: Boolean(subscription?.cancelAtEndOfCycle),
    p_price_amount: amountMinor,
    p_currency: currency,
    p_source_id: sourceId,
    p_next_credit_refresh_at: nextAnnualRefreshAt,
    p_trial_end: subscription?.trialEndsAt || null,
  });
  if (applyError) throw new Error(`Could not apply Shopify subscription: ${applyError.message}`);

  if (status === "active") await markFreeTrialUsedForPaidPlan(admin, userId);

  const pending = resolvePendingPlan(subscription);
  const pendingInterval = subscription?.pendingUpdate?.billingPeriod
    ? intervalFromBillingPeriod(subscription.pendingUpdate.billingPeriod)
    : null;
  const pendingEffectiveAt = pending.plan ? (subscription?.currentBillingCycle?.endTime || null) : null;
  const { error: pendingError } = await admin.from("user_credit_balances").update({
    pending_subscription_plan: pending.plan?.key || null,
    pending_subscription_lookup_key: pending.handle || null,
    pending_subscription_effective_at: pendingEffectiveAt,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (pendingError) throw pendingError;

  await admin.from("shopify_connections").update({
    shopify_shop_id: shopId,
    shopify_billing_plan_handle: resolved.handle || resolved.plan.key,
    shopify_billing_last_synced_at: new Date().toISOString(),
    shopify_billing_last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);

  return {
    configured: true,
    provider: "shopify",
    active: true,
    shopId,
    shopDomain: connection.shop_domain,
    selectionUrl,
    plan: resolved.plan.key,
    planHandle: resolved.handle || resolved.plan.key,
    redirectHintPlan: resolved.redirectHintPlan || null,
    redirectHintMatched: resolved.redirectHintMatched !== false,
    interval,
    status,
    currentPeriodStart: cycleStart,
    currentPeriodEnd: cycleEnd,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtEndOfCycle),
    pendingPlan: pending.plan?.key || null,
    pendingPlanHandle: pending.handle || null,
    pendingInterval,
    pendingEffectiveAt,
    priceAmount: flatPrice?.amount ?? null,
    currency,
  };
}

export async function getShopifyBillingContextForRequest(request, { sync = true, planHandleHint = "" } = {}) {
  const context = await getAuthenticatedBillingUser(request);
  if (context.error) return context;
  const connection = await findAppStoreShopifyConnection(context.admin, context.user.id).catch((error) => {
    if (error?.code === "SHOPIFY_BILLING_CONNECTION_AMBIGUOUS") throw error;
    return null;
  });
  if (!connection) return { ...context, connection: null, shopifyBilling: null };
  const shopifyBilling = sync
    ? await syncShopifyBillingForConnection(context.admin, { connection, userId: context.user.id, planHandleHint })
    : { provider: "shopify", configured: getShopifyAppPricingEnv().configured, selectionUrl: buildShopifyPlanSelectionUrl(connection.shop_domain) };
  return { ...context, connection, shopifyBilling };
}
