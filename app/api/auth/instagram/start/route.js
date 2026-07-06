import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSignedInstagramState,
  getInstagramEnv,
} from "../../../../../lib/instagramOAuth";

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

function buildInstagramLoginUrl({ request, userId, brandProfileId }) {
  const { appId, appSecret, redirectUri } = getInstagramEnv();

  if (!appId) {
    throw new Error("Missing INSTAGRAM_APP_ID");
  }

  if (!appSecret) {
    throw new Error("Missing INSTAGRAM_APP_SECRET");
  }

  const state = createSignedInstagramState({
    userId,
    brandProfileId,
    redirectUri,
    secret: appSecret,
  });

  const authEndpoint = "https://www.instagram.com/oauth/authorize";

  const params = new URLSearchParams({
    force_reauth: "true",
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: [
      "instagram_business_basic",
      "instagram_business_content_publish",
    ].join(","),
  });

  return {
    state,
    url: `${authEndpoint}?${params.toString()}`,
  };
}

function setStateCookie(response, state) {
  response.cookies.set("spreelo_instagram_oauth_state", state, {
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

    const { state, url } = buildInstagramLoginUrl({
      request,
      userId: authResult.user.id,
      brandProfileId,
    });

    const response = NextResponse.json({ ok: true, url });
    setStateCookie(response, state);
    return response;
  } catch (error) {
    console.error("Instagram OAuth start failed", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Could not start Instagram connection." },
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

    const { state, url } = buildInstagramLoginUrl({
      request,
      userId: authResult.user.id,
      brandProfileId,
    });

    const response = NextResponse.redirect(url);
    setStateCookie(response, state);
    return response;
  } catch (error) {
    console.error("Instagram OAuth start failed", error);
    return NextResponse.redirect(new URL("/social-channels?error=missing_instagram_env", request.url));
  }
}
