import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PINTEREST_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
];

export const PINTEREST_ACCESS_REFRESH_WINDOW_DAYS = 7;
export const PINTEREST_REFRESH_TOKEN_SAFETY_WINDOW_DAYS = 14;

export function getPinterestApiEnvironment() {
  return String(process.env.PINTEREST_API_ENV || "production")
    .trim()
    .toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

export function getPinterestApiBaseUrl() {
  return getPinterestApiEnvironment() === "sandbox"
    ? "https://api-sandbox.pinterest.com/v5"
    : "https://api.pinterest.com/v5";
}

export function isPinterestSandbox() {
  return getPinterestApiEnvironment() === "sandbox";
}

export function normalizePinterestRedirectUri(value) {
  return String(value || "").trim();
}

export function getPinterestEnv() {
  return {
    appId: String(process.env.PINTEREST_APP_ID || "").trim(),
    appSecret: String(process.env.PINTEREST_APP_SECRET || "").trim(),
    redirectUri: normalizePinterestRedirectUri(
      process.env.PINTEREST_REDIRECT_URI ||
        "https://app.spreelo.com/api/auth/pinterest/callback"
    ),
    apiEnvironment: getPinterestApiEnvironment(),
    apiBaseUrl: getPinterestApiBaseUrl(),
  };
}

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedPinterestState({ userId, brandProfileId, redirectUri, secret }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      brandProfileId,
      redirectUri: normalizePinterestRedirectUri(redirectUri),
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );

  return `${payload}.${signState(payload, secret)}`;
}

export function verifyAndDecodePinterestState(state, secret) {
  if (!state || !state.includes(".") || !secret) return null;
  const [payload, signature] = state.split(".");
  const expected = signState(payload, secret);

  try {
    if (
      Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!decoded?.createdAt || Date.now() - decoded.createdAt > 10 * 60 * 1000) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function verifyBrandBelongsToUser({ supabaseAdmin, userId, brandProfileId }) {
  if (!userId || !brandProfileId) return false;
  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

export function buildPinterestAuthorizationUrl({ appId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PINTEREST_SCOPES.join(","),
    state,
  });

  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

function pinterestApiError(response, data, fallback) {
  const error = new Error(
    data?.message || data?.error_description || data?.error || fallback
  );
  error.status = response?.status || 0;
  error.pinterestCode = data?.code ?? data?.error_code ?? null;
  return error;
}

export function isPinterestAuthError(error) {
  return Boolean(
    error?.status === 401 ||
      Number(error?.pinterestCode) === 2 ||
      /authentication failed|invalid access token|access token.*expired|token.*invalid|authorization grant is invalid|unauthorized/i.test(
        String(error?.message || "")
      )
  );
}

export function isPinterestSchemaError(error) {
  const code = String(error?.code || error?.cause?.code || "");
  const message = String(error?.message || "");
  return (
    code === "23514" ||
    code === "22P02" ||
    code === "42703" ||
    /social_connections.*(platform|refresh_token)|violates check constraint|invalid input value for enum/i.test(message)
  );
}

export async function exchangePinterestCode({ code, appId, appSecret, redirectUri }) {
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${getPinterestApiBaseUrl()}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw pinterestApiError(response, data, "Could not exchange Pinterest authorization code");
  }
  return data;
}

export async function refreshPinterestAccessToken({ refreshToken, appId, appSecret }) {
  if (!refreshToken) {
    const error = new Error("Pinterest refresh token is missing; reconnect is required");
    error.requiresReconnect = true;
    throw error;
  }

  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(`${getPinterestApiBaseUrl()}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    const error = pinterestApiError(response, data, "Could not refresh Pinterest access token");
    if (isPinterestAuthError(error) || response.status === 400) error.requiresReconnect = true;
    throw error;
  }

  return data;
}

export async function fetchPinterestUserAccount(accessToken) {
  const response = await fetch(`${getPinterestApiBaseUrl()}/user_account`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw pinterestApiError(response, data, "Could not load Pinterest account");
  }
  return data;
}

export async function createPinterestPin(accessToken, payload) {
  const response = await fetch(`${getPinterestApiBaseUrl()}/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    throw pinterestApiError(response, data, "Could not create Pinterest Pin");
  }
  return data;
}

export async function createPinterestBoard(accessToken, {
  name = "Spreelo Test",
  description = "Sandbox board created by Spreelo for Pinterest publishing tests.",
  privacy = "PUBLIC",
} = {}) {
  const response = await fetch(`${getPinterestApiBaseUrl()}/boards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: String(name || "Spreelo Test").slice(0, 180),
      description: String(description || "").slice(0, 500),
      privacy,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    throw pinterestApiError(response, data, "Could not create Pinterest board");
  }
  return data;
}

export async function fetchPinterestBoards(accessToken) {
  const url = new URL(`${getPinterestApiBaseUrl()}/boards`);
  url.searchParams.set("page_size", "100");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw pinterestApiError(response, data, "Could not load Pinterest boards");
  }
  return Array.isArray(data?.items) ? data.items : [];
}

export function pinterestExpiryIso(expiresInSeconds, nowMs = Date.now()) {
  const seconds = Number(expiresInSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(nowMs + seconds * 1000).toISOString();
}

export function pinterestRefreshExpiryIso(token, nowMs = Date.now()) {
  const expiresAt = Number(token?.refresh_token_expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    return new Date(expiresAt * 1000).toISOString();
  }
  return pinterestExpiryIso(token?.refresh_token_expires_in, nowMs);
}

function expiresWithin(value, days, nowMs = Date.now()) {
  if (!value) return true;
  const expiresMs = new Date(value).getTime();
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= nowMs + days * 24 * 60 * 60 * 1000;
}

export function shouldRefreshPinterestConnection(connection, nowMs = Date.now()) {
  if (!connection?.page_access_token) return true;
  return (
    expiresWithin(connection.token_expires_at, PINTEREST_ACCESS_REFRESH_WINDOW_DAYS, nowMs) ||
    (connection.refresh_token_expires_at &&
      expiresWithin(
        connection.refresh_token_expires_at,
        PINTEREST_REFRESH_TOKEN_SAFETY_WINDOW_DAYS,
        nowMs
      ))
  );
}

export async function refreshStoredPinterestConnection({
  supabaseAdmin,
  connection,
  force = false,
}) {
  if (!connection?.id) throw new Error("Pinterest connection is missing");
  if (!force && !shouldRefreshPinterestConnection(connection)) {
    return {
      ...connection,
      accessToken: connection.page_access_token,
      refreshed: false,
    };
  }

  const { appId, appSecret } = getPinterestEnv();
  if (!appId || !appSecret) throw new Error("Pinterest connection is not configured");

  const refreshed = await refreshPinterestAccessToken({
    refreshToken: connection.refresh_token,
    appId,
    appSecret,
  });

  const nowIso = new Date().toISOString();
  const nextRefreshToken = refreshed.refresh_token || connection.refresh_token;
  const next = {
    page_access_token: refreshed.access_token,
    token_expires_at: pinterestExpiryIso(refreshed.expires_in),
    refresh_token: nextRefreshToken,
    refresh_token_expires_at:
      pinterestRefreshExpiryIso(refreshed) || connection.refresh_token_expires_at || null,
    permissions: String(refreshed.scope || "")
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    last_token_refresh_at: nowIso,
    last_connection_check_at: nowIso,
    last_connection_error: null,
    reauth_required_at: null,
    status: connection.status === "connected" ? "connected" : connection.status,
    updated_at: nowIso,
  };

  const { error } = await supabaseAdmin
    .from("social_connections")
    .update(next)
    .eq("id", connection.id);
  if (error) throw error;

  return {
    ...connection,
    ...next,
    accessToken: refreshed.access_token,
    refreshed: true,
  };
}

export async function getHealthyPinterestAccessToken({
  supabaseAdmin,
  connection,
  forceRefresh = false,
}) {
  const fresh = await refreshStoredPinterestConnection({
    supabaseAdmin,
    connection,
    force: forceRefresh,
  });
  return { accessToken: fresh.accessToken || fresh.page_access_token, connection: fresh };
}

export async function savePendingPinterestConnection({
  supabaseAdmin,
  userId,
  brandProfileId,
  account,
  accessToken,
  refreshToken,
  expiresIn,
  refreshTokenExpiresIn,
  refreshTokenExpiresAt,
  scope,
}) {
  const nowIso = new Date().toISOString();
  const accountId = String(account?.id || account?.username || `pinterest-${userId}`);
  const accountName = account?.username || account?.business_name || account?.first_name || "Pinterest account";
  const permissions = String(scope || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const payload = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    platform: "pinterest",
    page_id: accountId,
    external_account_id: accountId,
    page_name: accountName,
    page_access_token: accessToken,
    token_expires_at: pinterestExpiryIso(expiresIn),
    refresh_token: refreshToken || null,
    refresh_token_expires_at:
      pinterestRefreshExpiryIso({
        refresh_token_expires_in: refreshTokenExpiresIn,
        refresh_token_expires_at: refreshTokenExpiresAt,
      }) || null,
    permissions,
    // Use an already-supported non-active status while the user chooses a board.
    // This avoids requiring a new "pending" status value in legacy databases and,
    // importantly, does not disconnect a previously working Pinterest board yet.
    status: "disconnected",
    last_connection_check_at: nowIso,
    last_connection_error: null,
    reauth_required_at: null,
    updated_at: nowIso,
  };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "pinterest")
    .eq("page_id", accountId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .update(payload)
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .insert({ ...payload, created_at: nowIso })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
