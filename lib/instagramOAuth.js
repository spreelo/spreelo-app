import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS = 14;
export const INSTAGRAM_LONG_LIVED_TOKEN_DAYS = 60;

export function getInstagramEnv() {
  return {
    appId: process.env.INSTAGRAM_APP_ID,
    appSecret: process.env.INSTAGRAM_APP_SECRET,
    redirectUri:
      process.env.INSTAGRAM_REDIRECT_URI ||
      "https://app.spreelo.com/api/auth/instagram/callback",
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

export function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

export function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedInstagramState({ userId, brandProfileId, secret }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      brandProfileId,
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );

  const signature = signState(payload, secret);

  return `${payload}.${signature}`;
}

export function verifyAndDecodeInstagramState(state, secret) {
  if (!state || !state.includes(".")) {
    return null;
  }

  const [payload, signature] = state.split(".");
  const expectedSignature = signState(payload, secret);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    const maxAgeMs = 10 * 60 * 1000;
    const isTooOld = Date.now() - decoded.createdAt > maxAgeMs;

    if (isTooOld) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function getInstagramTokenExpiresAt(expiresInSeconds) {
  const safeExpiresInSeconds = Number.isFinite(Number(expiresInSeconds))
    ? Number(expiresInSeconds)
    : INSTAGRAM_LONG_LIVED_TOKEN_DAYS * 24 * 60 * 60;

  return new Date(Date.now() + safeExpiresInSeconds * 1000).toISOString();
}

export async function verifyBrandBelongsToUser({
  supabaseAdmin,
  userId,
  brandProfileId,
}) {
  if (!userId || !brandProfileId) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not verify brand profile ownership:", error);
    return false;
  }

  return Boolean(data?.id);
}

export async function exchangeInstagramCodeForShortToken({
  code,
  appId,
  appSecret,
  redirectUri,
}) {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error_message || data?.error?.message || "Could not exchange Instagram code"
    );
  }

  return {
    accessToken: data.access_token,
    userId: data.user_id || data.id || null,
  };
}

export async function exchangeInstagramShortTokenForLongToken({
  shortLivedToken,
  appSecret,
}) {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/access_token?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Could not exchange Instagram long-lived token"
    );
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || "bearer",
    expiresIn: data.expires_in,
  };
}

export async function refreshInstagramLongLivedToken(accessToken) {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/refresh_access_token?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not refresh Instagram token");
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || "bearer",
    expiresIn: data.expires_in,
  };
}

async function tryFetchInstagramProfileWithFields({ accessToken, fields }) {
  const params = new URLSearchParams({
    fields: fields.join(","),
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/me?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not fetch Instagram profile");
  }

  return data;
}

export async function getInstagramProfile(accessToken) {
  const fieldAttempts = [
    ["user_id", "username", "account_type", "media_count"],
    ["id", "username", "account_type", "media_count"],
    ["id", "username"],
  ];

  let lastError = null;

  for (const fields of fieldAttempts) {
    try {
      return await tryFetchInstagramProfileWithFields({ accessToken, fields });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not fetch Instagram profile");
}

export async function saveInstagramConnection({
  supabaseAdmin,
  userId,
  brandProfileId,
  instagramUserId,
  username,
  accessToken,
  tokenExpiresAt,
  permissions = [],
  profile = {},
}) {
  if (!brandProfileId) {
    throw new Error("Missing brand_profile_id for Instagram connection");
  }

  if (!instagramUserId) {
    throw new Error("Missing Instagram user id");
  }

  const nowIso = new Date().toISOString();

  const connectionPayload = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    platform: "instagram",
    page_id: String(instagramUserId),
    page_name: username || "Instagram account",
    page_access_token: accessToken,
    token_expires_at: tokenExpiresAt,
    permissions,
    status: "connected",
    updated_at: nowIso,
  };

  const { error: disconnectBrandError } = await supabaseAdmin
    .from("social_connections")
    .update({
      status: "disconnected",
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "instagram");

  if (disconnectBrandError) {
    throw disconnectBrandError;
  }

  const { data: existingInstagramConnection, error: existingInstagramError } =
    await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", "instagram")
      .eq("page_id", String(instagramUserId))
      .maybeSingle();

  if (existingInstagramError) {
    throw existingInstagramError;
  }

  if (existingInstagramConnection?.id) {
    const { error: updateExistingError } = await supabaseAdmin
      .from("social_connections")
      .update(connectionPayload)
      .eq("id", existingInstagramConnection.id)
      .eq("user_id", userId);

    if (updateExistingError) {
      throw updateExistingError;
    }

    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("social_connections")
    .insert({
      ...connectionPayload,
      created_at: nowIso,
    });

  if (insertError) {
    throw insertError;
  }
}
