const PROVIDER_COOKIE_NAMES = {
  facebook: "spreelo_meta_oauth_state",
  instagram: "spreelo_instagram_oauth_state",
  threads: "spreelo_threads_oauth_state",
  tiktok: "spreelo_tiktok_oauth_state",
  youtube: "spreelo_youtube_oauth_state",
  pinterest: "spreelo_pinterest_oauth_state",
};

const PROVIDER_ALLOWED_HOSTS = {
  facebook: ["facebook.com", "www.facebook.com"],
  instagram: ["instagram.com", "www.instagram.com"],
  threads: ["threads.net", "www.threads.net", "facebook.com", "www.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "www.tiktok.com"],
  youtube: ["accounts.google.com"],
  pinterest: ["pinterest.com", "www.pinterest.com"],
};

export function buildFirstPartyOAuthBootstrapUrl(request, { provider, state, targetUrl }) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  if (!PROVIDER_COOKIE_NAMES[normalizedProvider]) {
    throw new Error("Unsupported OAuth provider");
  }
  const bootstrap = new URL("/api/auth/oauth-bootstrap", request.url);
  bootstrap.searchParams.set("provider", normalizedProvider);
  bootstrap.searchParams.set("state", state);
  bootstrap.searchParams.set("target", targetUrl);
  return bootstrap.toString();
}

export function getOAuthBootstrapConfig(provider) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  return {
    provider: normalizedProvider,
    cookieName: PROVIDER_COOKIE_NAMES[normalizedProvider] || "",
    allowedHosts: PROVIDER_ALLOWED_HOSTS[normalizedProvider] || [],
  };
}
