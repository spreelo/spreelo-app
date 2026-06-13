import crypto from "node:crypto";
import { NextResponse } from "next/server";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signState(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSignedState({ userId, secret }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      nonce: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    })
  );

  const signature = signState(payload, secret);

  return `${payload}.${signature}`;
}

export async function GET(request) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri =
    process.env.META_REDIRECT_URI ||
    "https://app.spreelo.com/api/meta/callback";

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!appId) {
    return NextResponse.json(
      { error: "Missing META_APP_ID" },
      { status: 500 }
    );
  }

  if (!appSecret) {
    return NextResponse.json(
      { error: "Missing META_APP_SECRET" },
      { status: 500 }
    );
  }

  if (!userId) {
    return NextResponse.redirect(
      new URL("/social-channels?error=missing_user", request.url)
    );
  }

  const state = createSignedState({
    userId,
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
    ].join(","),
  });

  const facebookLoginUrl = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;

  const response = NextResponse.redirect(facebookLoginUrl);

  response.cookies.set("spreelo_meta_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
