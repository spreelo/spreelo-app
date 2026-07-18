import crypto from "crypto";

const DEFAULT_TOKEN_LIFETIME_SECONDS = 10 * 24 * 60 * 60;

function getSecret() {
  return String(
    process.env.PLAN_PREVIEW_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      ""
  ).trim();
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(encodedPayload, secret) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createPlanPreviewToken(payload, options = {}) {
  const secret = getSecret();
  if (!secret) throw new Error("Plan preview token secret is not configured.");

  const lifetimeSeconds = Math.max(
    60,
    Number(options.lifetimeSeconds || DEFAULT_TOKEN_LIFETIME_SECONDS)
  );
  const body = {
    userId: String(payload?.userId || ""),
    brandId: String(payload?.brandId || ""),
    planName: String(payload?.planName || ""),
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
  };

  if (!body.userId || !body.brandId || !body.planName) {
    throw new Error("Plan preview token payload is incomplete.");
  }

  const encodedPayload = toBase64Url(JSON.stringify(body));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyPlanPreviewToken(token) {
  const secret = getSecret();
  if (!secret) throw new Error("Plan preview token secret is not configured.");

  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (
      !payload?.userId ||
      !payload?.brandId ||
      !payload?.planName ||
      !payload?.exp ||
      Number(payload.exp) < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
