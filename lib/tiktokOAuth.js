import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const TIKTOK_API_BASE = "https://open.tiktokapis.com";
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"];
export const TIKTOK_PERFORMANCE_SCOPES = ["video.list"];
export const TIKTOK_ACCESS_REFRESH_SAFETY_MS = 2 * 60 * 60 * 1000;

export function getTikTokEnv() {
  return {
    clientKey: String(process.env.TIKTOK_CLIENT_KEY || "").trim(),
    clientSecret: String(process.env.TIKTOK_CLIENT_SECRET || "").trim(),
    redirectUri: String(
      process.env.TIKTOK_REDIRECT_URI ||
        "https://app.spreelo.com/api/auth/tiktok/callback"
    ).trim(),
    mediaSigningSecret: String(
      process.env.TIKTOK_MEDIA_SIGNING_SECRET || process.env.TIKTOK_CLIENT_SECRET || ""
    ).trim(),
    publicPostingReady:
      String(process.env.TIKTOK_PUBLIC_POSTING_READY || "")
        .trim()
        .toLowerCase() === "true",
    allowPrivateTesting:
      String(process.env.TIKTOK_ALLOW_PRIVATE_TESTING || "")
        .trim()
        .toLowerCase() === "true",
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

export function createSignedTikTokState({ userId, brandProfileId, redirectUri, secret }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      brandProfileId,
      redirectUri,
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );
  return `${payload}.${signState(payload, secret)}`;
}

export function verifyAndDecodeTikTokState(state, secret) {
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

export function buildTikTokAuthorizationUrl({ clientKey, redirectUri, state }) {
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: [...TIKTOK_SCOPES, ...TIKTOK_PERFORMANCE_SCOPES].join(","),
    redirect_uri: redirectUri,
    state,
    disable_auto_auth: "1",
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

function createTikTokApiError(response, data, fallback) {
  const code = data?.error?.code || data?.error || data?.code || "";
  const message =
    data?.error?.message ||
    data?.error_description ||
    data?.message ||
    fallback;
  const error = new Error(message || fallback);
  error.status = response?.status || 0;
  error.tiktokCode = code || null;
  error.tiktokLogId = data?.error?.log_id || data?.log_id || response?.headers?.get?.("x-tt-logid") || null;
  if (
    response?.status === 401 ||
    ["access_token_invalid", "scope_not_authorized"].includes(String(code))
  ) {
    error.requiresReconnect = true;
  }
  if (
    response?.status === 429 ||
    response?.status >= 500 ||
    ["rate_limit_exceeded", "internal_error"].includes(String(code))
  ) {
    error.transient = true;
  }
  if (String(code) === "unaudited_client_can_only_post_to_private_accounts") {
    error.tiktokAuditRequired = true;
  }
  if (["invalid_param", "photo_format_check_failed", "file_format_check_failed"].includes(String(code))) {
    error.tiktokFinalFailure = true;
  }
  if ([
    "url_ownership_unverified",
    "privacy_level_option_mismatch",
    "scope_not_authorized",
    "spam_risk_too_many_posts",
    "spam_risk_user_banned_from_posting",
    "spam_risk_text",
    "spam_risk",
    "reached_active_user_cap",
  ].includes(String(code))) {
    error.tiktokFinalFailure = true;
  }
  return error;
}

export async function exchangeTikTokCode({ code, clientKey, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token || !data?.open_id) {
    throw createTikTokApiError(response, data, "Could not exchange TikTok authorization code");
  }
  return data;
}

export async function refreshTikTokAccessToken({ refreshToken, clientKey, clientSecret }) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    const error = createTikTokApiError(response, data, "Could not refresh TikTok access token");
    if (response.status === 400) error.requiresReconnect = true;
    throw error;
  }
  return data;
}

export function getTikTokTokenExpiresAt(expiresInSeconds) {
  const seconds = Math.max(60, Number(expiresInSeconds) || 86400);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function getTikTokRefreshTokenExpiresAt(refreshExpiresInSeconds) {
  const seconds = Math.max(60, Number(refreshExpiresInSeconds) || 31536000);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function fetchTikTokUser(accessToken) {
  const url = new URL(`${TIKTOK_API_BASE}/v2/user/info/`);
  url.searchParams.set("fields", "open_id,avatar_url,display_name");
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  const user = data?.data?.user;
  if (!response.ok || data?.error?.code !== "ok" || !user?.open_id) {
    throw createTikTokApiError(response, data, "Could not load TikTok profile");
  }
  return user;
}

export async function fetchTikTokCreatorInfo(accessToken) {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: "{}",
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error?.code !== "ok" || !data?.data) {
    throw createTikTokApiError(response, data, "Could not load TikTok creator publishing options");
  }
  return data.data;
}

export async function fetchTikTokPostStatus(accessToken, publishId) {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error?.code !== "ok") {
    throw createTikTokApiError(response, data, "Could not fetch TikTok publish status");
  }
  return data?.data || {};
}

export async function initTikTokPhotoPost(accessToken, payload) {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/content/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error?.code !== "ok" || !data?.data?.publish_id) {
    throw createTikTokApiError(response, data, "Could not initialize TikTok photo post");
  }
  return data.data;
}

export async function initTikTokVideoPost(accessToken, payload) {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error?.code !== "ok" || !data?.data?.publish_id) {
    throw createTikTokApiError(response, data, "Could not initialize TikTok video post");
  }
  return data.data;
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

export async function saveTikTokConnection({
  supabaseAdmin,
  userId,
  brandProfileId,
  openId,
  displayName,
  accessToken,
  refreshToken,
  tokenExpiresAt,
  refreshTokenExpiresAt,
  permissions = TIKTOK_SCOPES,
}) {
  if (!brandProfileId) throw new Error("Missing brand_profile_id for TikTok connection");
  if (!openId) throw new Error("Missing TikTok open_id");
  if (!refreshToken) throw new Error("TikTok did not return a refresh token");

  const nowIso = new Date().toISOString();
  const pageId = String(openId);
  const payload = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    platform: "tiktok",
    page_id: pageId,
    external_account_id: pageId,
    page_name: String(displayName || "TikTok account").trim() || "TikTok account",
    page_access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: tokenExpiresAt,
    refresh_token_expires_at: refreshTokenExpiresAt,
    permissions,
    status: "connected",
    last_token_refresh_at: nowIso,
    last_connection_check_at: nowIso,
    last_connection_error: null,
    reauth_required_at: null,
    updated_at: nowIso,
  };

  // A disconnected connection is intentionally kept for token/history durability.
  // Before attaching a TikTok account to this brand, reuse the row for this exact
  // external account if it already exists. This preserves the unique
  // (user_id, platform, page_id) invariant when moving an account between brands.
  const findExternalConnection = async () => {
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .eq("page_id", pageId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  };

  const existingExternal = await findExternalConnection();

  const { error: disconnectBrandError } = await supabaseAdmin
    .from("social_connections")
    .update({ status: "disconnected", updated_at: nowIso })
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "tiktok");
  if (disconnectBrandError) throw disconnectBrandError;

  if (existingExternal?.id) {
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .update(payload)
      .eq("id", existingExternal.id)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  const inserted = await supabaseAdmin
    .from("social_connections")
    .insert({ ...payload, created_at: nowIso })
    .select("id")
    .single();

  if (!inserted.error) return inserted.data;

  // Defensive race handling: if two callbacks for the same external account arrive
  // together, the unique index is the final authority. Re-read that row and update it
  // rather than surfacing a duplicate-key failure to the user.
  if (String(inserted.error?.code || "") === "23505") {
    const racedExternal = await findExternalConnection();
    if (racedExternal?.id) {
      const { data, error } = await supabaseAdmin
        .from("social_connections")
        .update(payload)
        .eq("id", racedExternal.id)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    }
  }

  throw inserted.error;
}

export async function getHealthyTikTokAccessToken({ supabase, connection, forceRefresh = false }) {
  if (!connection?.id || !connection?.page_access_token || !connection?.refresh_token) {
    const error = new Error("TikTok connection is incomplete; reconnect is required");
    error.requiresReconnect = true;
    throw error;
  }

  const refreshExpiryMs = new Date(connection.refresh_token_expires_at || 0).getTime();
  if (refreshExpiryMs && refreshExpiryMs <= Date.now() + 24 * 60 * 60 * 1000) {
    const error = new Error("TikTok refresh authorization is expiring; reconnect is required");
    error.requiresReconnect = true;
    throw error;
  }

  const expiryMs = new Date(connection.token_expires_at || 0).getTime();
  const shouldRefresh =
    forceRefresh || !expiryMs || expiryMs <= Date.now() + TIKTOK_ACCESS_REFRESH_SAFETY_MS;

  if (!shouldRefresh) {
    return { accessToken: connection.page_access_token, connection, refreshed: false };
  }

  const { clientKey, clientSecret } = getTikTokEnv();
  if (!clientKey || !clientSecret) throw new Error("TikTok OAuth environment variables are missing");

  const token = await refreshTikTokAccessToken({
    refreshToken: connection.refresh_token,
    clientKey,
    clientSecret,
  });
  const nowIso = new Date().toISOString();
  const nextConnection = {
    ...connection,
    page_access_token: token.access_token,
    refresh_token: token.refresh_token || connection.refresh_token,
    token_expires_at: getTikTokTokenExpiresAt(token.expires_in),
    refresh_token_expires_at: getTikTokRefreshTokenExpiresAt(token.refresh_expires_in),
    last_token_refresh_at: nowIso,
    last_connection_check_at: nowIso,
    last_connection_error: null,
    reauth_required_at: null,
    status: "connected",
  };
  const { error: updateError } = await supabase
    .from("social_connections")
    .update({
      page_access_token: nextConnection.page_access_token,
      refresh_token: nextConnection.refresh_token,
      token_expires_at: nextConnection.token_expires_at,
      refresh_token_expires_at: nextConnection.refresh_token_expires_at,
      last_token_refresh_at: nowIso,
      last_connection_check_at: nowIso,
      last_connection_error: null,
      reauth_required_at: null,
      status: "connected",
      updated_at: nowIso,
    })
    .eq("id", connection.id);
  if (updateError) throw updateError;
  return { accessToken: token.access_token, connection: nextConnection, refreshed: true };
}

export function createTikTokMediaProxyUrl({ postId, mediaUrl, expiresAtMs, secret, baseUrl = "https://app.spreelo.com" }) {
  if (!postId || !mediaUrl || !secret) throw new Error("Missing TikTok media proxy signing data");
  const exp = Math.floor((expiresAtMs || Date.now() + 24 * 60 * 60 * 1000) / 1000);
  const encodedUrl = Buffer.from(String(mediaUrl)).toString("base64url");
  const payload = `${postId}.${exp}.${encodedUrl}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const url = new URL("/api/tiktok/media", baseUrl);
  url.searchParams.set("post", String(postId));
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("src", encodedUrl);
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function verifyTikTokMediaProxySignature({ postId, exp, encodedUrl, signature, secret }) {
  if (!postId || !exp || !encodedUrl || !signature || !secret) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const payload = `${postId}.${exp}.${encodedUrl}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    return (
      Buffer.byteLength(signature) === Buffer.byteLength(expected) &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}
