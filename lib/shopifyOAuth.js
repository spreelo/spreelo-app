import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const REFRESH_SAFETY_MS = 5 * 60 * 1000;

export function getShopifyEnv() {
  return {
    clientId: String(process.env.SHOPIFY_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.SHOPIFY_CLIENT_SECRET || "").trim(),
    redirectUri: String(process.env.SHOPIFY_REDIRECT_URI || "https://app.spreelo.com/api/shopify/callback").trim(),
    scopes: String(process.env.SHOPIFY_SCOPES || "read_products")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    apiVersion: String(process.env.SHOPIFY_API_VERSION || "2026-07").trim(),
  };
}

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase admin environment variables");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizeShopifyShop(value) {
  let raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) raw = new URL(raw).hostname.toLowerCase();
  } catch {}
  raw = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/\.$/, "");
  return SHOPIFY_DOMAIN_RE.test(raw) ? raw : "";
}

export function isValidShopifyShop(value) {
  return Boolean(normalizeShopifyShop(value));
}

function signStatePayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedShopifyState({ userId, brandProfileId, shop, redirectUri, secret }) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    brandProfileId,
    shop: normalizeShopifyShop(shop),
    redirectUri: String(redirectUri || "").trim(),
    nonce: crypto.randomBytes(18).toString("hex"),
    createdAt: Date.now(),
  })).toString("base64url");
  return `${payload}.${signStatePayload(payload, secret)}`;
}

export function verifyAndDecodeShopifyState(state, secret) {
  if (!state || !secret || !String(state).includes(".")) return null;
  const [payload, signature] = String(state).split(".");
  const expected = signStatePayload(payload, secret);
  try {
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded?.createdAt || Date.now() - Number(decoded.createdAt) > 10 * 60 * 1000) return null;
    if (!decoded?.userId || !decoded?.brandProfileId || !normalizeShopifyShop(decoded?.shop)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function buildShopifyAuthorizationUrl({ shop, clientId, scopes, redirectUri, state }) {
  const normalizedShop = normalizeShopifyShop(shop);
  if (!normalizedShop) throw new Error("A valid .myshopify.com store domain is required");
  const params = new URLSearchParams({
    client_id: clientId,
    scope: (scopes || []).join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${normalizedShop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyCallbackHmac(url, clientSecret) {
  if (!clientSecret) return false;
  const parsed = typeof url === "string" ? new URL(url) : url;
  const provided = String(parsed.searchParams.get("hmac") || "").trim();
  if (!provided) return false;

  // Match Shopify's documented standalone-app algorithm: use decoded query
  // values, exclude hmac, sort entries, then join as key=value pairs.
  const params = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    if (key !== "hmac") params[key] = value;
  }
  const message = Object.entries(params)
    .sort()
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  try {
    return Buffer.byteLength(provided) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function createShopifyApiError(response, data, fallback) {
  const message = data?.error_description || data?.error || data?.errors?.[0]?.message || fallback || "Shopify API request failed";
  const error = new Error(typeof message === "string" ? message : fallback || "Shopify API request failed");
  error.status = Number(response?.status || 0);
  error.requiresReconnect = error.status === 401 || /invalid_request|invalid token|unauthorized|reconnect/i.test(error.message);
  return error;
}

export async function exchangeShopifyCode({ shop, code, clientId, clientSecret }) {
  const normalizedShop = normalizeShopifyShop(shop);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    expiring: "1",
  });
  const response = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token || !data?.refresh_token) {
    throw createShopifyApiError(response, data, "Could not exchange Shopify authorization code");
  }
  return data;
}

export async function refreshShopifyAccessToken({ shop, refreshToken, clientId, clientSecret }) {
  const normalizedShop = normalizeShopifyShop(shop);
  if (!normalizedShop || !refreshToken) {
    const error = new Error("Shopify refresh token is missing; reconnect is required");
    error.requiresReconnect = true;
    throw error;
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token || !data?.refresh_token) {
    throw createShopifyApiError(response, data, "Could not refresh Shopify access token");
  }
  return data;
}

function expiresAt(seconds, fallbackSeconds) {
  const safeSeconds = Math.max(60, Number(seconds || fallbackSeconds));
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

export async function verifyBrandBelongsToUser({ supabaseAdmin, userId, brandProfileId }) {
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function saveShopifyConnection({ supabaseAdmin, userId, brandProfileId, shop, token }) {
  const now = new Date().toISOString();
  const normalizedShop = normalizeShopifyShop(shop);
  const row = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    shop_domain: normalizedShop,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    access_token_expires_at: expiresAt(token.expires_in, 3600),
    refresh_token_expires_at: expiresAt(token.refresh_token_expires_in, 7776000),
    scopes: String(token.scope || "").split(",").map((item) => item.trim()).filter(Boolean),
    status: "connected",
    connected_at: now,
    last_refreshed_at: now,
    last_error: null,
    updated_at: now,
  };
  const { data, error } = await supabaseAdmin
    .from("shopify_connections")
    .upsert(row, { onConflict: "brand_profile_id" })
    .select("id,shop_domain,status,scopes,access_token_expires_at,refresh_token_expires_at,connected_at")
    .single();
  if (error) throw error;
  return data;
}

export async function getValidShopifyAccessToken({ supabaseAdmin, brandProfileId }) {
  const { data: connection, error } = await supabaseAdmin
    .from("shopify_connections")
    .select("*")
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw error;
  if (!connection?.access_token) {
    const missing = new Error("Shopify is not connected for this brand");
    missing.requiresReconnect = true;
    throw missing;
  }

  const expiryMs = new Date(connection.access_token_expires_at || 0).getTime();
  if (Number.isFinite(expiryMs) && expiryMs - Date.now() > REFRESH_SAFETY_MS) {
    return { accessToken: connection.access_token, connection };
  }

  const env = getShopifyEnv();
  try {
    const token = await refreshShopifyAccessToken({
      shop: connection.shop_domain,
      refreshToken: connection.refresh_token,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
    });
    const now = new Date().toISOString();
    const updates = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      access_token_expires_at: expiresAt(token.expires_in, 3600),
      refresh_token_expires_at: expiresAt(token.refresh_token_expires_in, 7776000),
      scopes: String(token.scope || connection.scopes || "").split(",").map((item) => item.trim()).filter(Boolean),
      last_refreshed_at: now,
      last_error: null,
      updated_at: now,
    };
    const { data: refreshed, error: updateError } = await supabaseAdmin
      .from("shopify_connections")
      .update(updates)
      .eq("id", connection.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return { accessToken: refreshed.access_token, connection: refreshed };
  } catch (refreshError) {
    if (refreshError?.requiresReconnect) {
      await supabaseAdmin.from("shopify_connections").update({
        status: "reconnect_required",
        last_error: refreshError.message,
        updated_at: new Date().toISOString(),
      }).eq("id", connection.id);
    }
    throw refreshError;
  }
}

export async function shopifyGraphql({ shop, accessToken, apiVersion, query, variables = {} }) {
  const normalizedShop = normalizeShopifyShop(shop);
  const response = await fetch(`https://${normalizedShop}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Array.isArray(data?.errors)) {
    throw createShopifyApiError(response, data, "Shopify GraphQL request failed");
  }
  return data?.data || {};
}
