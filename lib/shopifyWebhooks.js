import crypto from "node:crypto";
const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function normalizeWebhookShop(value) {
  let raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) raw = new URL(raw).hostname.toLowerCase();
  } catch {}
  raw = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/\.$/, "");
  return SHOPIFY_DOMAIN_RE.test(raw) ? raw : "";
}

export const SHOPIFY_WEBHOOK_TOPICS = Object.freeze({
  APP_UNINSTALLED: "app/uninstalled",
  CUSTOMERS_DATA_REQUEST: "customers/data_request",
  CUSTOMERS_REDACT: "customers/redact",
  SHOP_REDACT: "shop/redact",
});

const SUPPORTED_TOPICS = new Set(Object.values(SHOPIFY_WEBHOOK_TOPICS));
const CUSTOMER_DATA_SCOPES = new Set([
  "read_customers",
  "write_customers",
  "read_orders",
  "write_orders",
  "read_all_orders",
  "read_draft_orders",
  "write_draft_orders",
]);

export function normalizeShopifyWebhookTopic(value) {
  return String(value || "").trim().toLowerCase();
}

export function isSupportedShopifyWebhookTopic(value) {
  return SUPPORTED_TOPICS.has(normalizeShopifyWebhookTopic(value));
}

function rawBodyBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
  return Buffer.from(String(rawBody ?? ""), "utf8");
}

export function verifyShopifyWebhookHmac(rawBody, providedHmac, clientSecret) {
  const provided = String(providedHmac || "").trim();
  const secret = String(clientSecret || "").trim();
  if (!provided || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBodyBuffer(rawBody))
    .digest("base64");

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return false;
  try {
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function getShopifyWebhookMetadata(headers) {
  const topic = normalizeShopifyWebhookTopic(headers?.get?.("x-shopify-topic"));
  const shopDomain = normalizeWebhookShop(headers?.get?.("x-shopify-shop-domain"));
  return {
    topic,
    shopDomain,
    webhookId: String(headers?.get?.("x-shopify-webhook-id") || "").trim(),
    eventId: String(headers?.get?.("x-shopify-event-id") || "").trim(),
    apiVersion: String(headers?.get?.("x-shopify-api-version") || "").trim(),
    triggeredAt: String(headers?.get?.("x-shopify-triggered-at") || "").trim(),
  };
}

export function makeShopifyWebhookFallbackId({ rawBody, topic, shopDomain }) {
  return `fallback_${crypto
    .createHash("sha256")
    .update(`${String(topic || "")}\n${String(shopDomain || "")}\n${String(rawBody || "")}`, "utf8")
    .digest("hex")}`;
}

export function hashShopifyWebhookPayload(rawBody) {
  return crypto.createHash("sha256").update(rawBodyBuffer(rawBody)).digest("hex");
}

function isMissingWebhookSql(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    text.includes("claim_shopify_webhook_event") ||
    text.includes("complete_shopify_webhook_event") ||
    text.includes("fail_shopify_webhook_event") ||
    text.includes("shopify_webhook_events") ||
    text.includes("pgrst202") ||
    text.includes("42p01") ||
    text.includes("42883")
  );
}

export async function claimShopifyWebhookEvent(admin, metadata, rawBody) {
  const webhookId = metadata.webhookId || makeShopifyWebhookFallbackId({
    rawBody,
    topic: metadata.topic,
    shopDomain: metadata.shopDomain,
  });
  const payloadSha256 = hashShopifyWebhookPayload(rawBody);
  const { data, error } = await admin.rpc("claim_shopify_webhook_event", {
    p_webhook_id: webhookId,
    p_topic: metadata.topic,
    p_shop_domain: metadata.shopDomain,
    p_event_id: metadata.eventId || null,
    p_api_version: metadata.apiVersion || null,
    p_triggered_at: metadata.triggeredAt || null,
    p_payload_sha256: payloadSha256,
  });
  if (error) {
    if (isMissingWebhookSql(error)) {
      throw new Error("Shopify webhook SQL migration v144.256 has not been applied.");
    }
    throw error;
  }
  return { webhookId, ...(data || {}) };
}

export async function completeShopifyWebhookEvent(admin, webhookId) {
  const { error } = await admin.rpc("complete_shopify_webhook_event", { p_webhook_id: webhookId });
  if (error) console.error("Could not mark Shopify webhook complete", { webhookId, message: error.message });
}

export async function failShopifyWebhookEvent(admin, webhookId, errorMessage) {
  if (!webhookId) return;
  const { error } = await admin.rpc("fail_shopify_webhook_event", {
    p_webhook_id: webhookId,
    p_error: String(errorMessage || "Unknown Shopify webhook error").slice(0, 1000),
  });
  if (error) console.error("Could not mark Shopify webhook failed", { webhookId, message: error.message });
}

async function loadConnectionsForShop(admin, shopDomain) {
  const { data, error } = await admin
    .from("shopify_connections")
    .select("id,user_id,brand_profile_id,shop_domain,status,scopes,install_source")
    .eq("shop_domain", shopDomain);
  if (error) throw error;
  return data || [];
}

function uniqueBrandIds(connections) {
  return [...new Set((connections || []).map((row) => String(row?.brand_profile_id || "").trim()).filter(Boolean))];
}

function hasCustomerDataScopes(connections) {
  for (const connection of connections || []) {
    const scopes = Array.isArray(connection?.scopes)
      ? connection.scopes
      : String(connection?.scopes || "").split(/[\s,]+/).filter(Boolean);
    if (scopes.some((scope) => CUSTOMER_DATA_SCOPES.has(String(scope || "").trim()))) return true;
  }
  return false;
}

async function markShopifyCatalogInactive(admin, brandIds) {
  if (!brandIds.length) return;
  const { error } = await admin
    .from("website_product_catalog")
    .update({ is_active: false })
    .in("brand_profile_id", brandIds)
    .eq("commerce_platform", "shopify");
  if (error) throw error;
}

async function disconnectWebDataRows(admin, brandIds) {
  if (!brandIds.length) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("brand_web_data_connections")
    .update({
      status: "discovered",
      connected_at: null,
      last_error: null,
      updated_at: now,
    })
    .in("brand_profile_id", brandIds)
    .eq("provider", "shopify");
  if (error) throw error;
}

export async function handleShopifyAppUninstalled(admin, shopDomain) {
  const connections = await loadConnectionsForShop(admin, shopDomain);
  const brandIds = uniqueBrandIds(connections);
  const now = new Date().toISOString();

  if (connections.length) {
    const { error } = await admin
      .from("shopify_connections")
      .update({
        status: "disconnected",
        access_token: "",
        refresh_token: "",
        access_token_expires_at: now,
        refresh_token_expires_at: now,
        scopes: [],
        ai_store_data_consent_at: null,
        ai_store_data_consent_version: null,
        last_error: "Shopify app uninstalled",
        updated_at: now,
      })
      .eq("shop_domain", shopDomain);
    if (error) throw error;
  }

  await disconnectWebDataRows(admin, brandIds);
  await markShopifyCatalogInactive(admin, brandIds);

  return { connectionCount: connections.length, brandIds };
}

export async function handleShopifyCustomerPrivacyWebhook(admin, shopDomain, topic) {
  const connections = await loadConnectionsForShop(admin, shopDomain);

  // Spreelo's current Shopify app only asks for read_products and does not
  // persist Shopify customer/order records. Fail closed if that ever changes so
  // a future scope expansion cannot silently acknowledge an incomplete privacy flow.
  if (hasCustomerDataScopes(connections)) {
    throw new Error(`Shopify customer privacy handler must be extended before acknowledging ${topic} with customer/order scopes.`);
  }

  return {
    connectionCount: connections.length,
    customerDataStored: false,
  };
}

async function deleteShopifyCatalogData(admin, brandIds) {
  if (!brandIds.length) return;

  const catalogDelete = await admin
    .from("website_product_catalog")
    .delete()
    .in("brand_profile_id", brandIds)
    .eq("commerce_platform", "shopify");
  if (catalogDelete.error) throw catalogDelete.error;

  const runsDelete = await admin
    .from("website_product_catalog_runs")
    .delete()
    .in("brand_profile_id", brandIds)
    .eq("commerce_platform", "shopify");
  if (runsDelete.error) throw runsDelete.error;
}

async function stripExactShopifyWebsiteIdentity(admin, connections, shopDomain) {
  const appStoreBrandIds = uniqueBrandIds(
    (connections || []).filter((row) => String(row?.install_source || "") === "shopify_app_store")
  );
  if (!appStoreBrandIds.length) return;

  const { data: brands, error: brandError } = await admin
    .from("brand_profiles")
    .select("id,website_url,website_product_source_url")
    .in("id", appStoreBrandIds);
  if (brandError) throw brandError;

  for (const brand of brands || []) {
    const websiteHost = normalizeWebhookShop(brand?.website_url);
    const sourceHost = normalizeWebhookShop(brand?.website_product_source_url);
    const updates = {};
    if (websiteHost === shopDomain) updates.website_url = null;
    if (sourceHost === shopDomain) {
      updates.website_product_source_url = null;
      updates.website_product_mode_available = false;
      updates.website_product_mode_reason = null;
    }
    if (!Object.keys(updates).length) continue;
    updates.updated_at = new Date().toISOString();
    const { error } = await admin.from("brand_profiles").update(updates).eq("id", brand.id);
    if (error) throw error;
  }
}

export async function handleShopifyShopRedact(admin, shopDomain) {
  const connections = await loadConnectionsForShop(admin, shopDomain);
  const brandIds = uniqueBrandIds(connections);

  await deleteShopifyCatalogData(admin, brandIds);

  if (brandIds.length) {
    const { error: webDeleteError } = await admin
      .from("brand_web_data_connections")
      .delete()
      .in("brand_profile_id", brandIds)
      .eq("provider", "shopify");
    if (webDeleteError) throw webDeleteError;
  }

  await stripExactShopifyWebsiteIdentity(admin, connections, shopDomain);

  const { error: onboardingDeleteError } = await admin
    .from("shopify_onboarding_sessions")
    .delete()
    .eq("shop_domain", shopDomain);
  if (onboardingDeleteError) throw onboardingDeleteError;

  const { error: connectionDeleteError } = await admin
    .from("shopify_connections")
    .delete()
    .eq("shop_domain", shopDomain);
  if (connectionDeleteError) throw connectionDeleteError;

  return { connectionCount: connections.length, brandIds };
}

export async function processShopifyWebhook(admin, { topic, shopDomain }) {
  switch (topic) {
    case SHOPIFY_WEBHOOK_TOPICS.APP_UNINSTALLED:
      return handleShopifyAppUninstalled(admin, shopDomain);
    case SHOPIFY_WEBHOOK_TOPICS.CUSTOMERS_DATA_REQUEST:
    case SHOPIFY_WEBHOOK_TOPICS.CUSTOMERS_REDACT:
      return handleShopifyCustomerPrivacyWebhook(admin, shopDomain, topic);
    case SHOPIFY_WEBHOOK_TOPICS.SHOP_REDACT:
      return handleShopifyShopRedact(admin, shopDomain);
    default:
      return { ignored: true };
  }
}
