import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function verifyAndDecodeState(state, secret) {
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

function createSupabaseAdminClient() {
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

async function exchangeCodeForUserToken({ code, appId, appSecret, redirectUri }) {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not exchange Meta code");
  }

  return data.access_token;
}

async function getFacebookPages(userAccessToken) {
  const fields = [
    "id",
    "name",
    "access_token",
    "tasks",
  ].join(",");

  const params = new URLSearchParams({
    fields,
    access_token: userAccessToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not fetch Facebook pages");
  }

  return data?.data || [];
}

export async function GET(request) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri =
    process.env.META_REDIRECT_URI ||
    "https://app.spreelo.com/api/meta/callback";

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=meta_cancelled`
    );
  }

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=missing_meta_env`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=missing_meta_code`
    );
  }

  const cookieState = request.cookies.get("spreelo_meta_oauth_state")?.value;

  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=invalid_state`
    );
  }

  const decodedState = verifyAndDecodeState(state, appSecret);

  if (!decodedState?.userId) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=invalid_state_payload`
    );
  }

  try {
    const userAccessToken = await exchangeCodeForUserToken({
      code,
      appId,
      appSecret,
      redirectUri,
    });

    const pages = await getFacebookPages(userAccessToken);

    if (!pages.length) {
      return NextResponse.redirect(
        `${baseUrl}/social-channels?error=no_pages_found`
      );
    }

    const firstPage = pages[0];

    if (!firstPage?.id || !firstPage?.access_token) {
      return NextResponse.redirect(
        `${baseUrl}/social-channels?error=missing_page_token`
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    const { error: upsertError } = await supabaseAdmin
      .from("social_connections")
      .upsert(
        {
          user_id: decodedState.userId,
          platform: "facebook",
          page_id: firstPage.id,
          page_name: firstPage.name || "Facebook Page",
          page_access_token: firstPage.access_token,
          permissions: firstPage.tasks || [],
          status: "connected",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,platform,page_id",
        }
      );

    if (upsertError) {
      throw upsertError;
    }

    const response = NextResponse.redirect(
      `${baseUrl}/social-channels?connected=facebook`
    );

    response.cookies.delete("spreelo_meta_oauth_state");

    return response;
  } catch (callbackError) {
    console.error("Meta callback error:", callbackError);

    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=meta_callback_failed`
    );
  }
}
