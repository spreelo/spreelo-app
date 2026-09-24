import crypto from "node:crypto";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const OFFLINE_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";
const ONLINE_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:online-access-token";
const CLOCK_SKEW_SECONDS = 5;
const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function normalizeShopifyShop(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  return SHOPIFY_DOMAIN_RE.test(raw) ? raw : "";
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizedUrlHostname(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function timingSafeEqualBuffers(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function getBearerToken(request) {
  const authorization = String(request?.headers?.get?.("authorization") || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

export function verifyShopifyIdToken(idToken, { clientId, clientSecret, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const token = String(idToken || "").trim();
  if (!token || token.length > 12000 || !clientId || !clientSecret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);
  if (!header || !payload || String(header.alg || "").toUpperCase() !== "HS256") return null;

  let providedSignature;
  try {
    providedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expectedSignature = crypto
    .createHmac("sha256", clientSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  if (!timingSafeEqualBuffers(providedSignature, expectedSignature)) return null;

  const exp = Number(payload.exp || 0);
  const nbf = Number(payload.nbf || 0);
  if (!Number.isFinite(exp) || exp <= nowSeconds - CLOCK_SKEW_SECONDS) return null;
  if (!Number.isFinite(nbf) || nbf > nowSeconds + CLOCK_SKEW_SECONDS) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || "")];
  if (!audiences.includes(String(clientId))) return null;

  const issuerHost = normalizedUrlHostname(payload.iss);
  const destinationHost = normalizedUrlHostname(payload.dest);
  if (!issuerHost || !destinationHost || issuerHost !== destinationHost) return null;
  const shop = normalizeShopifyShop(destinationHost);
  if (!shop) return null;

  return {
    shop,
    userId: String(payload.sub || "").trim(),
    sessionId: String(payload.sid || "").trim(),
    issuedAt: Number(payload.iat || 0) || null,
    expiresAt: exp,
    claims: payload,
  };
}

function tokenExchangeError(response, payload, fallbackMessage) {
  const message = String(payload?.error_description || payload?.error || fallbackMessage || "Shopify token exchange failed");
  const error = new Error(message);
  error.status = Number(response?.status || 0);
  error.invalidIdToken = error.status === 400 && /subject[_ -]?token|id[_ -]?token|expired|invalid/i.test(message);
  return error;
}

export async function exchangeShopifyIdToken({
  shop,
  idToken,
  clientId,
  clientSecret,
  tokenType = "offline",
}) {
  const normalizedShop = normalizeShopifyShop(shop);
  if (!normalizedShop) throw new Error("A valid Shopify shop domain is required");
  if (!idToken || !clientId || !clientSecret) throw new Error("Shopify embedded authentication is not configured");

  const requestedTokenType = tokenType === "online" ? ONLINE_TOKEN_TYPE : OFFLINE_TOKEN_TYPE;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: TOKEN_EXCHANGE_GRANT,
    subject_token: idToken,
    subject_token_type: ID_TOKEN_TYPE,
    requested_token_type: requestedTokenType,
  });
  if (tokenType !== "online") body.set("expiring", "1");

  const response = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw tokenExchangeError(response, payload, "Could not exchange Shopify ID token");
  }
  if (tokenType !== "online" && !payload?.refresh_token) {
    throw new Error("Shopify did not return the required refresh token");
  }
  return payload;
}
