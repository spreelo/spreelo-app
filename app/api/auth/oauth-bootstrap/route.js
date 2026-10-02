import { NextResponse } from "next/server";
import { getOAuthBootstrapConfig } from "../../../../lib/socialOAuthBootstrap";

function isAllowedTarget(targetUrl, allowedHosts) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return allowedHosts.some((allowedHost) => {
      const normalized = String(allowedHost || "").toLowerCase();
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const provider = String(searchParams.get("provider") || "").trim().toLowerCase();
  const state = String(searchParams.get("state") || "").trim();
  const target = String(searchParams.get("target") || "").trim();
  const { cookieName, allowedHosts } = getOAuthBootstrapConfig(provider);

  if (!cookieName || !state || !target || !isAllowedTarget(target, allowedHosts)) {
    return NextResponse.redirect(new URL("/social-channels?error=invalid_oauth_start", request.url));
  }

  const response = NextResponse.redirect(target);
  response.cookies.set(cookieName, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
