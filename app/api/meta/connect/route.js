import { NextResponse } from "next/server";

function createState() {
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);

  return `${timePart}-${randomPart}`;
}

export async function GET() {
  const appId = process.env.META_APP_ID;
  const redirectUri =
    process.env.META_REDIRECT_URI ||
    "https://app.spreelo.com/api/meta/callback";

  if (!appId) {
    return NextResponse.json(
      {
        error: "Missing META_APP_ID",
      },
      { status: 500 }
    );
  }

  const state = createState();

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
