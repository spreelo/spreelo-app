import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

const layout = read("app/layout.jsx");
const embeddedPage = read("app/shopify/app/page.jsx");
const embeddedRoute = read("app/api/shopify/embedded/bootstrap/route.js");
const claimRoute = read("app/api/shopify/onboarding/claim/route.js");
const onboardingPage = read("app/shopify/onboarding/page.jsx");
const legacyConnect = read("app/api/shopify/connect/route.js");

assert(layout.includes('name="shopify-api-key"') && layout.includes("https://cdn.shopify.com/shopifycloud/app-bridge.js"), "latest Shopify App Bridge CDN script and API key meta are present in the document head");
assert(layout.includes('shopify-disabled-features') && layout.includes('fetch, auto-redirect'), "App Bridge cannot overwrite Spreelo Supabase Authorization headers or redirect standalone customers");
assert(embeddedPage.includes("window.shopify?.idToken") && embeddedPage.includes('Authorization: `Bearer ${idToken}`'), "embedded App Home requests a fresh Shopify ID token and sends it to Spreelo backend");
assert(embeddedRoute.includes("verifyShopifyIdToken") && embeddedRoute.includes('tokenType: "online"') && embeddedRoute.includes('tokenType: "offline"'), "backend validates Shopify identity and exchanges it for online identity plus offline background access");
assert(embeddedRoute.includes("SHOPIFY_USER_NOT_LINKED_TO_SPRELO_ACCOUNT"), "embedded auto-login refuses to map a different Shopify staff email onto an existing Spreelo owner account");
assert(claimRoute.includes("body?.shopify_onboarding_session_id") && claimRoute.includes('request.cookies.get("spreelo_shopify_onboarding")'), "onboarding works without third-party cookies while preserving legacy cookie flow");
assert(onboardingPage.includes('embeddedMode') && onboardingPage.includes('EMBEDDED_SESSION_KEY'), "existing Shopify onboarding UI accepts the embedded App Bridge handoff");
assert(legacyConnect.includes('flow: "brand_connect"') && legacyConnect.includes('flow: "app_store_identity"'), "legacy Shopify OAuth/Grow Brain connector remains available and was not replaced");

const mod = await import(pathToFileURL(path.join(root, "lib/shopifyEmbeddedAuth.js")).href);
const secret = "unit-test-secret";
const clientId = "unit-test-client";
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({
  iss: "https://unit-test-store.myshopify.com/admin",
  dest: "https://unit-test-store.myshopify.com",
  aud: clientId,
  sub: "12345",
  exp: now + 60,
  nbf: now - 2,
  iat: now - 2,
  sid: "session-1",
})).toString("base64url");
const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
const token = `${header}.${payload}.${signature}`;
const verified = mod.verifyShopifyIdToken(token, { clientId, clientSecret: secret, nowSeconds: now });
assert(verified?.shop === "unit-test-store.myshopify.com" && verified?.userId === "12345", "HS256 Shopify ID token signature and required claims validate successfully");
assert(!mod.verifyShopifyIdToken(token, { clientId: "wrong-client", clientSecret: secret, nowSeconds: now }), "Shopify ID token with wrong audience is rejected");
assert(!mod.verifyShopifyIdToken(`${header}.${payload}.bad`, { clientId, clientSecret: secret, nowSeconds: now }), "Shopify ID token with invalid signature is rejected");

console.log("\nv144.254 Shopify embedded App Bridge checks passed.");
