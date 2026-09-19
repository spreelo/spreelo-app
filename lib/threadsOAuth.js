import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];
export const THREADS_LONG_LIVED_TOKEN_DAYS = 60;
export const THREADS_TOKEN_REFRESH_WINDOW_DAYS = 14;
export const THREADS_GRAPH_API_BASE = "https://graph.threads.com/v1.0";

export function normalizeThreadsRedirectUri(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getThreadsEnv() {
  return {
    appId: String(process.env.THREADS_APP_ID || "").trim(),
    appSecret: String(process.env.THREADS_APP_SECRET || "").trim(),
    redirectUri: normalizeThreadsRedirectUri(
      process.env.THREADS_REDIRECT_URI ||
        "https://app.spreelo.com/api/auth/threads/callback"
    ),
  };
}

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function safeSignatureEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedThreadsState({
  userId,
  brandProfileId,
  redirectUri,
  secret,
}) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      brandProfileId,
      redirectUri: normalizeThreadsRedirectUri(redirectUri),
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );

  return `${payload}.${signState(payload, secret)}`;
}

export function verifyAndDecodeThreadsState(state, secret) {
  if (!state || !secret || !String(state).includes(".")) return null;

  const [payload, signature] = String(state).split(".");
  const expected = signState(payload, secret);
  if (!safeSignatureEquals(signature, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!decoded?.createdAt || Date.now() - Number(decoded.createdAt) > 10 * 60 * 1000) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function buildThreadsAuthorizationUrl({ appId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: String(appId || ""),
    redirect_uri: normalizeThreadsRedirectUri(redirectUri),
    scope: THREADS_SCOPES.join(","),
    response_type: "code",
    state: String(state || ""),
  });

  return `https://threads.com/oauth/authorize?${params.toString()}`;
}

export async function verifyBrandBelongsToUser({
  supabaseAdmin,
  userId,
  brandProfileId,
}) {
  if (!userId || !brandProfileId) return false;

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not verify Threads brand ownership", error);
    return false;
  }

  return Boolean(data?.id);
}

export async function exchangeThreadsCodeForShortToken({
  code,
  appId,
  appSecret,
  redirectUri,
}) {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: normalizeThreadsRedirectUri(redirectUri),
    code,
  });

  const response = await fetch("https://graph.threads.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_message || data?.error?.message || "Could not exchange Threads authorization code"
    );
  }

  return {
    accessToken: data.access_token,
    userId: data.user_id || data.id || null,
  };
}

export async function exchangeThreadsShortTokenForLongToken({
  shortLivedToken,
  appSecret,
}) {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });

  const response = await fetch(
    `https://graph.threads.com/access_token?${params.toString()}`
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error?.message || "Could not create long-lived Threads token");
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || "bearer",
    expiresIn: data.expires_in,
  };
}

export async function refreshThreadsLongLivedToken(accessToken) {
  const params = new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.threads.com/refresh_access_token?${params.toString()}`
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error?.message || "Could not refresh Threads token");
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || "bearer",
    expiresIn: data.expires_in,
  };
}

export function getThreadsTokenExpiresAt(expiresInSeconds) {
  const safeSeconds = Number.isFinite(Number(expiresInSeconds))
    ? Number(expiresInSeconds)
    : THREADS_LONG_LIVED_TOKEN_DAYS * 24 * 60 * 60;
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

export async function getThreadsProfile(accessToken) {
  const url = new URL(`${THREADS_GRAPH_API_BASE}/me`);
  url.searchParams.set(
    "fields",
    "id,username,name,threads_profile_picture_url,threads_biography"
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || "Could not fetch Threads profile");
  }

  return data;
}

export async function saveThreadsConnection({
  supabaseAdmin,
  userId,
  brandProfileId,
  threadsUserId,
  username,
  accessToken,
  tokenExpiresAt,
  permissions = THREADS_SCOPES,
}) {
  if (!brandProfileId) throw new Error("Missing brand_profile_id for Threads connection");
  if (!threadsUserId) throw new Error("Missing Threads user id");

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    platform: "threads",
    page_id: String(threadsUserId),
    external_account_id: String(threadsUserId),
    page_name: username ? `@${String(username).replace(/^@/, "")}` : "Threads account",
    page_access_token: accessToken,
    token_expires_at: tokenExpiresAt,
    permissions,
    status: "connected",
    last_connection_error: null,
    reauth_required_at: null,
    updated_at: nowIso,
  };

  const { error: disconnectError } = await supabaseAdmin
    .from("social_connections")
    .update({ status: "disconnected", updated_at: nowIso })
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "threads");
  if (disconnectError) throw disconnectError;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "threads")
    .eq("page_id", String(threadsUserId))
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("social_connections")
      .update(payload)
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .insert({ ...payload, created_at: nowIso })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id || null;
}

export function decodeAndVerifyMetaSignedRequest(signedRequest, appSecret) {
  if (!signedRequest || !appSecret || !String(signedRequest).includes(".")) return null;
  const [encodedSignature, payloadPart] = String(signedRequest).split(".");

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (String(payload?.algorithm || "HMAC-SHA256").toUpperCase() !== "HMAC-SHA256") {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(payloadPart)
    .digest("base64url");

  if (!safeSignatureEquals(encodedSignature, expectedSignature)) return null;
  return payload;
}

export async function readSignedRequestFromMeta(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => ({}));
    return String(json?.signed_request || json?.signedRequest || "").trim();
  }

  const form = await request.formData().catch(() => null);
  return String(form?.get("signed_request") || "").trim();
}

export async function disconnectThreadsConnectionForProviderUser({
  supabaseAdmin,
  threadsUserId,
  deleteRow = false,
}) {
  if (!threadsUserId) return 0;

  if (deleteRow) {
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .delete()
      .eq("platform", "threads")
      .eq("page_id", String(threadsUserId))
      .select("id");
    if (error) throw error;
    return data?.length || 0;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .update({
      status: "disconnected",
      page_access_token: null,
      token_expires_at: null,
      permissions: [],
      last_connection_error: "Threads authorization removed by provider user.",
      reauth_required_at: nowIso,
      updated_at: nowIso,
    })
    .eq("platform", "threads")
    .eq("page_id", String(threadsUserId))
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

export function createThreadsDeletionConfirmationCode({ threadsUserId, appSecret }) {
  const issuedAt = Date.now();
  const payload = base64UrlEncode(JSON.stringify({ threadsUserId: String(threadsUserId), issuedAt }));
  const signature = signState(payload, appSecret);
  return `${payload}.${signature}`;
}

export function verifyThreadsDeletionConfirmationCode(code, appSecret) {
  if (!code || !String(code).includes(".")) return null;
  const [payload, signature] = String(code).split(".");
  const expected = signState(payload, appSecret);
  if (!safeSignatureEquals(signature, expected)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
