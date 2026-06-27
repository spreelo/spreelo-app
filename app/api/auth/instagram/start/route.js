import { NextResponse } from "next/server";
import {
  createSignedInstagramState,
  getInstagramEnv,
} from "../../../../../lib/instagramOAuth";

export async function GET(request) {
  const { appId, appSecret, redirectUri } = getInstagramEnv();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const brandProfileId = searchParams.get("brand_profile_id");

  if (!appId) {
    return NextResponse.json(
      { error: "Missing INSTAGRAM_APP_ID" },
      { status: 500 }
    );
  }

  if (!appSecret) {
    return NextResponse.json(
      { error: "Missing INSTAGRAM_APP_SECRET" },
      { status: 500 }
    );
  }

  if (!userId) {
    return NextResponse.redirect(
      new URL("/social-channels?error=missing_user", request.url)
    );
  }

  if (!brandProfileId) {
    return NextResponse.redirect(
      new URL("/social-channels?error=missing_brand", request.url)
    );
  }

  const state = createSignedInstagramState({
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
      "instagram_business_basic",
      "instagram_business_content_publish",
    ].join(","),
  });

  const instagramLoginUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  const response = NextResponse.redirect(instagramLoginUrl);

  response.cookies.set("spreelo_instagram_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
