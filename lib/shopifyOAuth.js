import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const REFRESH_SAFETY_MS = 5 * 60 * 1000;
const REFRESH_LOCK_MS = 20 * 1000;
const REFRESH_WAIT_MAX_MS = 25 * 1000;
const REFRESH_POLL_MS = 250;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const OFFLINE_TOKEN_PARAMS = { expiring: "1" };
export const SHOPIFY_AI_CONSENT_VERSION = "shopify-grow-brain-v1";

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

export function normalizeHostname(value) {
  let raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    return String(url.hostname || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./, "").replace(/\.$/, "");
  }
}

export function isValidShopifyShop(value) {
  return Boolean(normalizeShopifyShop(value));
}

function signStatePayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedShopifyState({
  flow = "brand_connect",
  userId = "",
  brandProfileId = "",
  onboardingSessionId = "",
  aiConsent = false,
  shop,
  redirectUri,
  secret,
}) {
  const normalizedShop = normalizeShopifyShop(shop);
  if (!normalizedShop) throw new Error("A valid .myshopify.com store domain is required");
  const payload = Buffer.from(JSON.stringify({
    flow: String(flow || "brand_connect"),
    userId: String(userId || ""),
    brandProfileId: String(brandProfileId || ""),
    onboardingSessionId: String(onboardingSessionId || ""),
    aiConsent: Boolean(aiConsent),
    shop: normalizedShop,
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
    if (!decoded?.createdAt || Date.now() - Number(decoded.createdAt) > STATE_MAX_AGE_MS) return null;
    if (!normalizeShopifyShop(decoded?.shop)) return null;
    const flow = String(decoded?.flow || "brand_connect");
    if (flow === "brand_connect" && (!decoded?.userId || !decoded?.brandProfileId)) return null;
    if (flow === "app_store_offline" && !decoded?.onboardingSessionId) return null;
    if (!["brand_connect", "app_store_identity", "app_store_offline"].includes(flow)) return null;
    return { ...decoded, flow };
  } catch {
    return null;
  }
}

export function buildShopifyAuthorizationUrl({ shop, clientId, scopes, redirectUri, state, online = false }) {
  const normalizedShop = normalizeShopifyShop(shop);
  if (!normalizedShop) throw new Error("A valid .myshopify.com store domain is required");
  const params = new URLSearchParams({
    client_id: clientId,
    scope: (scopes || []).join(","),
    redirect_uri: redirectUri,
    state,
  });
  if (online) params.append("grant_options[]", "per-user");
  return `https://${normalizedShop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyCallbackHmac(url, clientSecret) {
  if (!clientSecret) return false;
  const parsed = typeof url === "string" ? new URL(url) : url;
  const provided = String(parsed.searchParams.get("hmac") || "").trim();
  if (!provided) return false;

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

export async function exchangeShopifyCode({ shop, code, clientId, clientSecret, tokenType = "offline" }) {
  const normalizedShop = normalizeShopifyShop(shop);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  if (tokenType === "offline") body.set("expiring", OFFLINE_TOKEN_PARAMS.expiring);
  const response = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  const missingRequiredToken = tokenType === "offline"
    ? (!data?.access_token || !data?.refresh_token)
    : (!data?.access_token || !data?.associated_user);
  if (!response.ok || missingRequiredToken) {
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

export function expiresAt(seconds, fallbackSeconds) {
  const safeSeconds = Math.max(60, Number(seconds || fallbackSeconds));
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

export function secondsUntil(isoValue, fallbackSeconds) {
  const expiryMs = new Date(isoValue || 0).getTime();
  if (!Number.isFinite(expiryMs)) return fallbackSeconds;
  return Math.max(60, Math.floor((expiryMs - Date.now()) / 1000));
}

export function grantedScopesFromToken(token) {
  return String(token?.scope || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasRequiredShopifyScopes(token, requiredScopes = []) {
  const grantedScopes = grantedScopesFromToken(token);
  return requiredScopes.every((scope) =>
    grantedScopes.includes(scope) ||
    (scope.startsWith("read_") && grantedScopes.includes(`write_${scope.slice(5)}`))
  );
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
    access_token_expires_at: token.access_token_expires_at || expiresAt(token.expires_in, 3600),
    refresh_token_expires_at: token.refresh_token_expires_at || expiresAt(token.refresh_token_expires_in, 7776000),
    scopes: Array.isArray(token.scopes) ? token.scopes : grantedScopesFromToken(token),
    status: "connected",
    connected_at: now,
    last_refreshed_at: now,
    last_error: null,
    updated_at: now,
  };

  const { data: sameShop, error: sameShopError } = await supabaseAdmin
    .from("shopify_connections")
    .select("id,brand_profile_id")
    .eq("user_id", userId)
    .eq("shop_domain", normalizedShop)
    .maybeSingle();
  if (sameShopError) throw sameShopError;

  if (sameShop?.id) {
    const { data, error } = await supabaseAdmin
      .from("shopify_connections")
      .update(row)
      .eq("id", sameShop.id)
      .select("id,shop_domain,status,scopes,access_token_expires_at,refresh_token_expires_at,connected_at")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("shopify_connections")
    .upsert(row, { onConflict: "brand_profile_id" })
    .select("id,shop_domain,status,scopes,access_token_expires_at,refresh_token_expires_at,connected_at")
    .single();
  if (error) throw error;
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectionTokenIsFresh(connection, safetyMs = REFRESH_SAFETY_MS) {
  const expiryMs = new Date(connection?.access_token_expires_at || 0).getTime();
  return Boolean(connection?.access_token) && Number.isFinite(expiryMs) && expiryMs - Date.now() > safetyMs;
}

function isRefreshLockSchemaMissing(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes("refresh_lock_token") || text.includes("refresh_lock_until") || text.includes("42703");
}

async function loadShopifyConnection({ supabaseAdmin, brandProfileId }) {
  const { data, error } = await supabaseAdmin
    .from("shopify_connections")
    .select("*")
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token) {
    const missing = new Error("Shopify is not connected for this brand");
    missing.requiresReconnect = true;
    throw missing;
  }
  return data;
}

async function persistRefreshedShopifyToken({ supabaseAdmin, connection, token, lockToken = "" }) {
  const now = new Date().toISOString();
  const updates = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    access_token_expires_at: expiresAt(token.expires_in, 3600),
    refresh_token_expires_at: expiresAt(token.refresh_token_expires_in, 7776000),
    scopes: grantedScopesFromToken(token).length ? grantedScopesFromToken(token) : connection.scopes,
    last_refreshed_at: now,
    last_error: null,
    updated_at: now,
  };
  if (lockToken) {
    updates.refresh_lock_token = null;
    updates.refresh_lock_until = null;
  }

  let query = supabaseAdmin.from("shopify_connections").update(updates).eq("id", connection.id);
  if (lockToken) query = query.eq("refresh_lock_token", lockToken);
  else if (connection.refresh_token) query = query.eq("refresh_token", connection.refresh_token);

  const { data: refreshed, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (refreshed?.access_token) return refreshed;

  // Another request may have completed the same refresh first. Never overwrite
  // its newly rotated refresh token; just use the latest persisted pair.
  const latest = await loadShopifyConnection({ supabaseAdmin, brandProfileId: connection.brand_profile_id });
  if (connectionTokenIsFresh(latest, 30 * 1000)) return latest;
  throw new Error("Shopify token refresh could not be persisted safely");
}

async function clearRefreshLock({ supabaseAdmin, connectionId, lockToken, errorMessage = null }) {
  if (!lockToken) return;
  const updates = {
    refresh_lock_token: null,
    refresh_lock_until: null,
    updated_at: new Date().toISOString(),
  };
  if (errorMessage) updates.last_error = String(errorMessage).slice(0, 1000);
  await supabaseAdmin
    .from("shopify_connections")
    .update(updates)
    .eq("id", connectionId)
    .eq("refresh_lock_token", lockToken);
}

async function tryAcquireRefreshLock({ supabaseAdmin, connection }) {
  const existingUntil = new Date(connection?.refresh_lock_until || 0).getTime();
  if (Number.isFinite(existingUntil) && existingUntil > Date.now()) {
    return { acquired: false, lockToken: "", schemaSupported: true };
  }

  const lockToken = crypto.randomUUID();
  const lockAt = new Date().toISOString();
  const lockUntil = new Date(Date.now() + REFRESH_LOCK_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("shopify_connections")
    .update({
      refresh_lock_token: lockToken,
      refresh_lock_until: lockUntil,
      updated_at: lockAt,
    })
    .eq("id", connection.id)
    .eq("updated_at", connection.updated_at)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isRefreshLockSchemaMissing(error)) return { acquired: false, lockToken: "", schemaSupported: false };
    throw error;
  }
  return { acquired: Boolean(data?.id), lockToken: data?.id ? lockToken : "", schemaSupported: true, connection: data || null };
}

async function waitForConcurrentRefresh({ supabaseAdmin, brandProfileId, staleAccessToken = "" }) {
  const deadline = Date.now() + REFRESH_WAIT_MAX_MS;
  while (Date.now() < deadline) {
    await sleep(REFRESH_POLL_MS);
    const latest = await loadShopifyConnection({ supabaseAdmin, brandProfileId });
    const tokenRotated = staleAccessToken && latest.access_token && latest.access_token !== staleAccessToken;
    if ((tokenRotated || !staleAccessToken) && connectionTokenIsFresh(latest, 30 * 1000)) return latest;
    const lockUntil = new Date(latest.refresh_lock_until || 0).getTime();
    if (!Number.isFinite(lockUntil) || lockUntil <= Date.now()) return null;
  }
  return null;
}

async function refreshWithoutDbLock({ supabaseAdmin, connection, env }) {
  try {
    const token = await refreshShopifyAccessToken({
      shop: connection.shop_domain,
      refreshToken: connection.refresh_token,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
    });
    return await persistRefreshedShopifyToken({ supabaseAdmin, connection, token });
  } catch (refreshError) {
    // If another serverless invocation rotated the token concurrently, prefer the
    // fresh database value instead of incorrectly forcing a reconnect. This is
    // primarily a backward-compatible safety net if the refresh-lock migration
    // has not been applied yet.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) await sleep(REFRESH_POLL_MS);
      try {
        const latest = await loadShopifyConnection({ supabaseAdmin, brandProfileId: connection.brand_profile_id });
        if (latest.access_token !== connection.access_token && connectionTokenIsFresh(latest, 30 * 1000)) return latest;
      } catch {}
    }
    throw refreshError;
  }
}

export async function getValidShopifyAccessToken({
  supabaseAdmin,
  brandProfileId,
  forceRefresh = false,
  staleAccessToken = "",
}) {
  let connection = await loadShopifyConnection({ supabaseAdmin, brandProfileId });

  if (!forceRefresh && connectionTokenIsFresh(connection)) {
    return { accessToken: connection.access_token, connection };
  }
  // A caller can ask for a forced refresh after a 401. If another request has
  // already rotated the token, use that new pair rather than refreshing twice.
  if (forceRefresh && staleAccessToken && connection.access_token !== staleAccessToken && connectionTokenIsFresh(connection, 30 * 1000)) {
    return { accessToken: connection.access_token, connection };
  }

  const env = getShopifyEnv();
  let lockToken = "";
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const lock = await tryAcquireRefreshLock({ supabaseAdmin, connection });
      if (!lock.schemaSupported) {
        const refreshed = await refreshWithoutDbLock({ supabaseAdmin, connection, env });
        return { accessToken: refreshed.access_token, connection: refreshed };
      }

      if (lock.acquired) {
        lockToken = lock.lockToken;
        const lockedConnection = lock.connection || connection;
        try {
          const token = await refreshShopifyAccessToken({
            shop: lockedConnection.shop_domain,
            refreshToken: lockedConnection.refresh_token,
            clientId: env.clientId,
            clientSecret: env.clientSecret,
          });
          const refreshed = await persistRefreshedShopifyToken({
            supabaseAdmin,
            connection: lockedConnection,
            token,
            lockToken,
          });
          return { accessToken: refreshed.access_token, connection: refreshed };
        } catch (refreshError) {
          // Shopify can reject a refresh token that another request just rotated.
          // Re-read before marking the connection as broken.
          try {
            const latest = await loadShopifyConnection({ supabaseAdmin, brandProfileId });
            if (latest.access_token !== lockedConnection.access_token && connectionTokenIsFresh(latest, 30 * 1000)) {
              await clearRefreshLock({ supabaseAdmin, connectionId: lockedConnection.id, lockToken });
              return { accessToken: latest.access_token, connection: latest };
            }
          } catch {}
          await clearRefreshLock({
            supabaseAdmin,
            connectionId: lockedConnection.id,
            lockToken,
            errorMessage: refreshError?.message || "Shopify token refresh failed",
          });
          lockToken = "";
          throw refreshError;
        }
      }

      const latest = await waitForConcurrentRefresh({
        supabaseAdmin,
        brandProfileId,
        staleAccessToken: staleAccessToken || connection.access_token,
      });
      if (latest?.access_token) return { accessToken: latest.access_token, connection: latest };
      connection = await loadShopifyConnection({ supabaseAdmin, brandProfileId });
      if (!forceRefresh && connectionTokenIsFresh(connection)) return { accessToken: connection.access_token, connection };
      if (forceRefresh && staleAccessToken && connection.access_token !== staleAccessToken && connectionTokenIsFresh(connection, 30 * 1000)) {
        return { accessToken: connection.access_token, connection };
      }
    }

    const busy = new Error("Shopify token refresh is temporarily busy; please retry");
    busy.status = 503;
    throw busy;
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

export async function shopifyGraphqlForBrand({
  supabaseAdmin,
  brandProfileId,
  apiVersion,
  query,
  variables = {},
}) {
  let { accessToken, connection } = await getValidShopifyAccessToken({ supabaseAdmin, brandProfileId });
  try {
    const data = await shopifyGraphql({
      shop: connection.shop_domain,
      accessToken,
      apiVersion,
      query,
      variables,
    });
    return { data, connection };
  } catch (error) {
    if (Number(error?.status || 0) !== 401) throw error;
  }

  // A token can be revoked/rotated slightly before our stored expiry. Refresh
  // once on a real Shopify 401 and retry the original request exactly once.
  const refreshed = await getValidShopifyAccessToken({
    supabaseAdmin,
    brandProfileId,
    forceRefresh: true,
    staleAccessToken: accessToken,
  });
  accessToken = refreshed.accessToken;
  connection = refreshed.connection;

  try {
    const data = await shopifyGraphql({
      shop: connection.shop_domain,
      accessToken,
      apiVersion,
      query,
      variables,
    });
    return { data, connection };
  } catch (error) {
    if (Number(error?.status || 0) === 401) {
      await supabaseAdmin.from("shopify_connections").update({
        status: "reconnect_required",
        last_error: String(error?.message || "Shopify rejected the refreshed access token").slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", connection.id);
      error.requiresReconnect = true;
    }
    throw error;
  }
}

