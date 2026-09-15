import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";
const YOUTUBE_REFRESH_SAFETY_MS = 5 * 60 * 1000;
const YOUTUBE_MAX_REMOTE_VIDEO_BYTES = 96 * 1024 * 1024;

export function getYouTubeEnv() {
  const privacy = String(process.env.YOUTUBE_DEFAULT_PRIVACY || "private")
    .trim()
    .toLowerCase();

  return {
    clientId: String(process.env.YOUTUBE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.YOUTUBE_CLIENT_SECRET || "").trim(),
    redirectUri: String(
      process.env.YOUTUBE_REDIRECT_URI ||
        "https://app.spreelo.com/api/auth/youtube/callback"
    ).trim(),
    defaultPrivacy: ["private", "unlisted", "public"].includes(privacy)
      ? privacy
      : "private",
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

export function createSignedYouTubeState({ userId, brandProfileId, redirectUri, secret }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      brandProfileId,
      redirectUri: String(redirectUri || "").trim(),
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );

  return `${payload}.${signState(payload, secret)}`;
}

export function verifyAndDecodeYouTubeState(state, secret) {
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

export function buildYouTubeAuthorizationUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function createYouTubeApiError(response, data, fallback) {
  const message =
    data?.error_description ||
    data?.error?.message ||
    (typeof data?.error === "string" ? data.error : "") ||
    fallback;
  const error = new Error(message || fallback || "YouTube API request failed");
  error.status = Number(response?.status || 0);
  error.youtubeReason =
    data?.error?.errors?.[0]?.reason ||
    data?.error ||
    null;
  error.requiresReconnect = Boolean(
    error.status === 401 ||
      String(error.youtubeReason || "").toLowerCase() === "invalid_grant" ||
      /invalid_grant|invalid credentials|invalid token|token has been expired or revoked|unauthorized/i.test(
        String(error.message || "")
      )
  );
  return error;
}

export async function exchangeYouTubeCode({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.access_token) {
    throw createYouTubeApiError(response, data, "Could not exchange YouTube authorization code");
  }

  return data;
}

export async function refreshYouTubeAccessToken({ refreshToken, clientId, clientSecret }) {
  if (!refreshToken) {
    const error = new Error("YouTube refresh token is missing; reconnect is required");
    error.requiresReconnect = true;
    throw error;
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.access_token) {
    throw createYouTubeApiError(response, data, "Could not refresh YouTube access token");
  }

  return data;
}

export function getYouTubeTokenExpiresAt(expiresInSeconds) {
  const seconds = Number(expiresInSeconds || 3600);
  return new Date(Date.now() + Math.max(60, seconds) * 1000).toISOString();
}

export async function fetchYouTubeChannel(accessToken) {
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createYouTubeApiError(response, data, "Could not load the connected YouTube channel");
  }

  const channel = Array.isArray(data?.items) ? data.items[0] : null;
  if (!channel?.id) {
    const error = new Error("No YouTube channel was found for this Google account");
    error.code = "no_youtube_channel";
    throw error;
  }

  return {
    id: String(channel.id),
    title: String(channel?.snippet?.title || "YouTube channel"),
    handle: String(channel?.snippet?.customUrl || ""),
    thumbnailUrl:
      channel?.snippet?.thumbnails?.default?.url ||
      channel?.snippet?.thumbnails?.medium?.url ||
      null,
  };
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

export async function saveYouTubeConnection({
  supabaseAdmin,
  userId,
  brandProfileId,
  channel,
  accessToken,
  refreshToken,
  tokenExpiresAt,
  permissions = YOUTUBE_SCOPES,
}) {
  if (!brandProfileId) throw new Error("Missing brand_profile_id for YouTube connection");
  if (!channel?.id) throw new Error("Missing YouTube channel id");

  const nowIso = new Date().toISOString();
  const pageId = String(channel.id);

  // Keep disconnected rows for durable refresh tokens/history, but reuse the row for
  // this exact YouTube channel when it is connected to another brand. This avoids the
  // unique (user_id, platform, page_id) collision that previously occurred after a
  // user disconnected a channel from one brand and connected it to another.
  const findExternalConnection = async () => {
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .select("id, refresh_token")
      .eq("user_id", userId)
      .eq("platform", "youtube")
      .eq("page_id", pageId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  };

  const existingExternal = await findExternalConnection();
  const durableRefreshToken = refreshToken || existingExternal?.refresh_token || null;
  if (!durableRefreshToken) {
    const error = new Error("Google did not return an offline refresh token. Reconnect YouTube and approve access again.");
    error.requiresReconnect = true;
    throw error;
  }

  const { error: disconnectBrandError } = await supabaseAdmin
    .from("social_connections")
    .update({ status: "disconnected", updated_at: nowIso })
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "youtube");
  if (disconnectBrandError) throw disconnectBrandError;

  const payload = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    platform: "youtube",
    page_id: pageId,
    external_account_id: pageId,
    page_name: channel.handle
      ? `${channel.title} (${channel.handle})`
      : channel.title,
    page_access_token: accessToken,
    refresh_token: durableRefreshToken,
    token_expires_at: tokenExpiresAt,
    permissions,
    status: "connected",
    last_token_refresh_at: nowIso,
    last_connection_check_at: nowIso,
    last_connection_error: null,
    reauth_required_at: null,
    updated_at: nowIso,
  };

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

  // Defensive race handling for simultaneous callbacks of the same external channel.
  if (String(inserted.error?.code || "") === "23505") {
    const racedExternal = await findExternalConnection();
    if (racedExternal?.id) {
      const racedRefreshToken = refreshToken || racedExternal.refresh_token || durableRefreshToken;
      const { data, error } = await supabaseAdmin
        .from("social_connections")
        .update({ ...payload, refresh_token: racedRefreshToken })
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

export async function getHealthyYouTubeAccessToken({ supabase, connection, forceRefresh = false }) {
  if (!connection?.id || !connection?.page_access_token) {
    const error = new Error("YouTube connection is incomplete; reconnect is required");
    error.requiresReconnect = true;
    throw error;
  }

  const expiryMs = new Date(connection.token_expires_at || 0).getTime();
  const shouldRefresh =
    forceRefresh ||
    !expiryMs ||
    expiryMs <= Date.now() + YOUTUBE_REFRESH_SAFETY_MS;

  if (!shouldRefresh) {
    return { accessToken: connection.page_access_token, connection, refreshed: false };
  }

  const { clientId, clientSecret } = getYouTubeEnv();
  if (!clientId || !clientSecret) {
    throw new Error("YouTube OAuth environment variables are missing");
  }

  const token = await refreshYouTubeAccessToken({
    refreshToken: connection.refresh_token,
    clientId,
    clientSecret,
  });
  const tokenExpiresAt = getYouTubeTokenExpiresAt(token.expires_in);
  const nowIso = new Date().toISOString();
  const nextConnection = {
    ...connection,
    page_access_token: token.access_token,
    refresh_token: token.refresh_token || connection.refresh_token,
    token_expires_at: tokenExpiresAt,
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

function truncateUnicode(value, maxCharacters) {
  const chars = Array.from(String(value || ""));
  if (chars.length <= maxCharacters) return chars.join("");
  return chars.slice(0, maxCharacters).join("").trimEnd();
}

export function buildYouTubeVideoTitle(content, fallback = "Spreelo Short") {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^(#[\p{L}\p{N}_-]+\s*)+$/u.test(line));

  const raw = (lines[0] || fallback || "Spreelo Short")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateUnicode(raw || fallback || "Spreelo Short", 100);
}

export function buildYouTubeVideoDescription(content) {
  return truncateUnicode(String(content || "").trim(), 4900);
}

async function downloadRemoteVideo(videoUrl) {
  const parsed = new URL(String(videoUrl || ""));
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("YouTube video source must use HTTPS");

  const response = await fetch(parsed.toString(), {
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Could not download rendered video for YouTube | status: ${response.status}`);
  }

  const advertisedLength = Number(response.headers.get("content-length") || 0);
  if (advertisedLength > YOUTUBE_MAX_REMOTE_VIDEO_BYTES) {
    throw new Error("Rendered video is too large for Spreelo's YouTube uploader");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Rendered video for YouTube is empty");
  if (bytes.length > YOUTUBE_MAX_REMOTE_VIDEO_BYTES) {
    throw new Error("Rendered video is too large for Spreelo's YouTube uploader");
  }

  const sourceType = String(response.headers.get("content-type") || "").split(";")[0].trim();
  const contentType =
    sourceType.startsWith("video/") || sourceType === "application/octet-stream"
      ? sourceType
      : "video/mp4";

  return { bytes, contentType };
}

export async function uploadVideoToYouTube({
  accessToken,
  videoUrl,
  title,
  description = "",
  privacyStatus,
}) {
  if (!accessToken) throw new Error("Missing YouTube access token");
  if (!videoUrl) throw new Error("Missing video URL for YouTube upload");

  const { defaultPrivacy } = getYouTubeEnv();
  const privacy = ["private", "unlisted", "public"].includes(String(privacyStatus || "").toLowerCase())
    ? String(privacyStatus).toLowerCase()
    : defaultPrivacy;
  const video = await downloadRemoteVideo(videoUrl);

  const initUrl = new URL(`${YOUTUBE_UPLOAD_BASE}/videos`);
  initUrl.searchParams.set("uploadType", "resumable");
  initUrl.searchParams.set("part", "snippet,status");

  const metadata = {
    snippet: {
      title: buildYouTubeVideoTitle(title || description),
      description: buildYouTubeVideoDescription(description),
      categoryId: "22",
    },
    status: {
      privacyStatus: privacy,
    },
  };

  const initResponse = await fetch(initUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": video.contentType,
      "X-Upload-Content-Length": String(video.bytes.length),
    },
    body: JSON.stringify(metadata),
    cache: "no-store",
  });

  if (!initResponse.ok) {
    const data = await initResponse.json().catch(async () => ({ message: await initResponse.text().catch(() => "") }));
    throw createYouTubeApiError(initResponse, data, "Could not start YouTube video upload");
  }

  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": video.contentType,
      "Content-Length": String(video.bytes.length),
    },
    body: video.bytes,
    cache: "no-store",
  });
  const result = await uploadResponse.json().catch(() => ({}));

  if (!uploadResponse.ok || !result?.id) {
    throw createYouTubeApiError(uploadResponse, result, "YouTube video upload failed");
  }

  return {
    id: String(result.id),
    privacyStatus: result?.status?.privacyStatus || privacy,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(result.id))}`,
  };
}
