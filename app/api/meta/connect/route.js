import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSignedState({ userId, brandProfileId, secret }) {
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

function getSupabaseClient(authorizationHeader) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorizationHeader,
      },
    },
  });
}

async function getAuthenticatedBrand({ request, brandProfileId }) {
  const authorizationHeader = request.headers.get("authorization") || "";

  if (!authorizationHeader.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }

  const supabase = getSupabaseClient(authorizationHeader);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return { error: "Unauthorized", status: 401 };
  }

  if (!brandProfileId) {
    return { error: "Missing brand", status: 400 };
  }

  const { data: brand, error: brandError } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("id", brandProfileId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError) {
    return { error: brandError.message || "Could not verify brand", status: 500 };
  }

  if (!brand?.id) {
    return { error: "Invalid brand", status: 403 };
  }

  return { user, brand };
}

function buildFacebookLoginUrl({ request, userId, brandProfileId }) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri =
    process.env.META_REDIRECT_URI ||
    "https://app.spreelo.com/api/meta/callback";

  if (!appId) {
    throw new Error("Missing META_APP_ID");
  }

  if (!appSecret) {
    throw new Error("Missing META_APP_SECRET");
  }

  const state = createSignedState({
    userId,
    brandProfileId,
    secret: appSecret,
  });

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "business_management",
    ].join(","),
  });

  return {
    state,
    url: `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`,
  };
}

function setStateCookie(response, state) {
  response.cookies.set("spreelo_meta_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || body?.brandProfileId || "").trim();
    const authResult = await getAuthenticatedBrand({ request, brandProfileId });

    if (authResult.error) {
      return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
    }

    const { state, url } = buildFacebookLoginUrl({
      request,
      userId: authResult.user.id,
      brandProfileId,
    });

    const response = NextResponse.json({ ok: true, url });
    setStateCookie(response, state);
    return response;
  } catch (error) {
    console.error("Meta OAuth start failed", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Could not start Facebook connection." },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandProfileId = String(searchParams.get("brand_profile_id") || "").trim();
    const authResult = await getAuthenticatedBrand({ request, brandProfileId });

    if (authResult.error) {
      return NextResponse.redirect(new URL("/social-channels?error=unauthorized", request.url));
    }

    const { state, url } = buildFacebookLoginUrl({
      request,
      userId: authResult.user.id,
      brandProfileId,
    });

    const response = NextResponse.redirect(url);
    setStateCookie(response, state);
    return response;
  } catch (error) {
    console.error("Meta OAuth start failed", error);
    return NextResponse.redirect(new URL("/social-channels?error=missing_meta_env", request.url));
  }
}
