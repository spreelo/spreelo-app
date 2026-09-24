import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  expiresAt,
  getShopifyEnv,
  grantedScopesFromToken,
  hasRequiredShopifyScopes,
  saveShopifyConnection,
  shopifyGraphql,
} from "../../../../../lib/shopifyOAuth.js";
import {
  exchangeShopifyIdToken,
  getBearerToken,
  verifyShopifyIdToken,
} from "../../../../../lib/shopifyEmbeddedAuth.js";
import { selectExactShopifyBrand } from "../../../../../lib/shopifyBrandIsolation.js";

export const dynamic = "force-dynamic";

const SHOP_DETAILS_QUERY = `#graphql
query SpreeloEmbeddedShopDetails {
  shop {
    name
    myshopifyDomain
    primaryDomain { url }
  }
}`;

function noStoreJson(payload, init = {}) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function retryInvalidSession(payload = { ok: false, error: "SHOPIFY_ID_TOKEN_INVALID" }) {
  const response = noStoreJson(payload, { status: 401 });
  response.headers.set("X-Shopify-Retry-Invalid-Session-Request", "1");
  return response;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function generateSupabaseTokenHash(admin, { email, signupSource = "shopify_app_store", shop }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Shopify user email is missing");
  const metadata = { signup_source: signupSource, shopify_shop: shop };

  let linkResult = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
    options: { data: metadata },
  });
  if (linkResult.error && /not found|does not exist/i.test(String(linkResult.error.message || ""))) {
    linkResult = await admin.auth.admin.generateLink({
      type: "signup",
      email: normalizedEmail,
      password: crypto.randomUUID(),
      options: { data: metadata },
    });
  }
  if (linkResult.error) throw linkResult.error;
  const tokenHash = String(
    linkResult.data?.properties?.hashed_token ||
    linkResult.data?.properties?.hashedToken ||
    ""
  ).trim();
  if (!tokenHash) throw new Error("Could not create Spreelo session from Shopify identity");
  return tokenHash;
}

async function loadSupabaseUserEmail(admin, userId) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  return normalizeEmail(data?.user?.email);
}

async function loadExactShopifyBrandForUser(admin, { userId, shopDomain, preferredBrandProfileId = "" }) {
  const { data: brands, error: brandError } = await admin
    .from("brand_profiles")
    .select("id,business_name,website_url,is_default,created_at,campaign_calendar_generated_at")
    .eq("user_id", userId);
  if (brandError) throw brandError;
  const brandRows = brands || [];

  const { data: webRows, error: webError } = brandRows.length
    ? await admin
        .from("brand_web_data_connections")
        .select("brand_profile_id,website_url,detected_signals")
        .eq("user_id", userId)
        .in("brand_profile_id", brandRows.map((brand) => brand.id))
    : { data: [], error: null };
  if (webError) throw webError;

  return selectExactShopifyBrand({
    brands: brandRows,
    webConnections: webRows || [],
    shopDomain,
    preferredBrandProfileId,
  });
}

export async function POST(request) {
  const env = getShopifyEnv();
  if (!env.clientId || !env.clientSecret || env.scopes.length === 0) {
    return noStoreJson({ ok: false, error: "SHOPIFY_EMBEDDED_NOT_CONFIGURED" }, { status: 500 });
  }

  const idToken = getBearerToken(request);
  const identity = verifyShopifyIdToken(idToken, {
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  });
  if (!identity?.shop) return retryInvalidSession();

  try {
    // Online exchange proves which Shopify staff member is actively opening the app.
    const onlineToken = await exchangeShopifyIdToken({
      shop: identity.shop,
      idToken,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      tokenType: "online",
    });
    const associatedUser = onlineToken?.associated_user || {};
    if (identity.userId && String(associatedUser?.id || "") !== identity.userId) {
      return retryInvalidSession({ ok: false, error: "SHOPIFY_IDENTITY_MISMATCH" });
    }
    const shopifyEmail = normalizeEmail(associatedUser?.email);
    const shopifyEmailVerified = Boolean(associatedUser?.email_verified);
    if (!shopifyEmail || !shopifyEmailVerified) {
      return noStoreJson({ ok: false, error: "SHOPIFY_EMAIL_NOT_VERIFIED" }, { status: 403 });
    }

    // Spreelo runs scheduled/background work, so keep the same expiring offline
    // token + refresh-token model used by the existing Shopify connector.
    const offlineToken = await exchangeShopifyIdToken({
      shop: identity.shop,
      idToken,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      tokenType: "offline",
    });
    if (!hasRequiredShopifyScopes(offlineToken, env.scopes)) {
      return noStoreJson({ ok: false, error: "SHOPIFY_SCOPE_MISSING" }, { status: 403 });
    }

    const shopData = await shopifyGraphql({
      shop: identity.shop,
      accessToken: offlineToken.access_token,
      apiVersion: env.apiVersion,
      query: SHOP_DETAILS_QUERY,
    });
    const shopDetails = shopData?.shop || {};
    const admin = createSupabaseAdminClient();

    const { data: existingConnection, error: connectionError } = await admin
      .from("shopify_connections")
      .select("id,user_id,brand_profile_id,install_source,status")
      .eq("shop_domain", identity.shop)
      .maybeSingle();
    if (connectionError) throw connectionError;

    if (existingConnection?.id && existingConnection?.user_id) {
      const spreeloEmail = await loadSupabaseUserEmail(admin, existingConnection.user_id);
      // A Shopify store must never silently grant a different staff identity access
      // to the owner's complete Spreelo account. Team/staff delegation can be added
      // later as an explicit permission feature.
      if (!spreeloEmail || spreeloEmail !== shopifyEmail) {
        return noStoreJson({
          ok: false,
          error: "SHOPIFY_USER_NOT_LINKED_TO_SPRELO_ACCOUNT",
          message: "This Shopify staff account is not the Spreelo account linked to this store.",
        }, { status: 403 });
      }

      const exactBrandSelection = await loadExactShopifyBrandForUser(admin, {
        userId: existingConnection.user_id,
        shopDomain: identity.shop,
        preferredBrandProfileId: existingConnection.brand_profile_id || "",
      });

      if (exactBrandSelection.match?.id) {
        const resolvedBrandProfileId = exactBrandSelection.match.id;
        if (resolvedBrandProfileId !== existingConnection.brand_profile_id) {
          console.warn("Shopify embedded shop-to-brand mapping repaired", {
            shopDomain: identity.shop,
            previousBrandProfileId: existingConnection.brand_profile_id || null,
            resolvedBrandProfileId,
          });
        }

        await saveShopifyConnection({
          supabaseAdmin: admin,
          userId: existingConnection.user_id,
          brandProfileId: resolvedBrandProfileId,
          shop: identity.shop,
          token: offlineToken,
        });
        const tokenHash = await generateSupabaseTokenHash(admin, {
          email: spreeloEmail,
          signupSource: existingConnection.install_source || "shopify_embedded",
          shop: identity.shop,
        });

        return noStoreJson({
          ok: true,
          mode: "existing",
          token_hash: tokenHash,
          verification_type: "email",
          brand_profile_id: resolvedBrandProfileId,
          shop: {
            domain: identity.shop,
            name: String(shopDetails?.name || identity.shop.split(".")[0] || "Shopify Store").trim(),
            primary_domain: String(shopDetails?.primaryDomain?.url || "").trim(),
          },
        });
      }

      // A legacy/stale connection can point at a brand owned by the same Spreelo
      // account but belonging to another Shopify shop. Do not auto-login to it.
      // Continue through isolated onboarding, which will reuse only an exact
      // myshopify match or create a dedicated brand for this shop.
      console.warn("Shopify embedded shop-to-brand mismatch detected; isolated onboarding required", {
        shopDomain: identity.shop,
        previousBrandProfileId: existingConnection.brand_profile_id || null,
        exactMatchCount: exactBrandSelection.matches.length,
      });
    }

    await admin.from("shopify_onboarding_sessions").delete().lt("expires_at", new Date().toISOString());
    await admin
      .from("shopify_onboarding_sessions")
      .delete()
      .eq("shop_domain", identity.shop)
      .neq("status", "claimed");

    const now = new Date().toISOString();
    const { data: onboarding, error: onboardingError } = await admin
      .from("shopify_onboarding_sessions")
      .insert({
        shop_domain: identity.shop,
        shop_name: String(shopDetails?.name || identity.shop.split(".")[0] || "Shopify Store").trim(),
        primary_domain: String(shopDetails?.primaryDomain?.url || "").trim(),
        installer_email: shopifyEmail,
        installer_email_verified: true,
        installer_shopify_user_id: String(associatedUser?.id || identity.userId || ""),
        installer_locale: String(associatedUser?.locale || "").trim(),
        access_token: offlineToken.access_token,
        refresh_token: offlineToken.refresh_token,
        access_token_expires_at: expiresAt(offlineToken.expires_in, 3600),
        refresh_token_expires_at: expiresAt(offlineToken.refresh_token_expires_in, 7776000),
        scopes: grantedScopesFromToken(offlineToken),
        status: "ready_to_claim",
        auth_bootstrap_issued_at: now,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        last_error: null,
        updated_at: now,
      })
      .select("id")
      .single();
    if (onboardingError || !onboarding?.id) throw onboardingError || new Error("Could not create Shopify onboarding session");

    const tokenHash = await generateSupabaseTokenHash(admin, {
      email: shopifyEmail,
      shop: identity.shop,
    });

    return noStoreJson({
      ok: true,
      mode: "onboarding",
      token_hash: tokenHash,
      verification_type: "email",
      onboarding_session_id: onboarding.id,
      shop: {
        domain: identity.shop,
        name: String(shopDetails?.name || identity.shop.split(".")[0] || "Shopify Store").trim(),
        primary_domain: String(shopDetails?.primaryDomain?.url || "").trim(),
      },
    });
  } catch (error) {
    console.error("Shopify embedded bootstrap failed", error);
    if (error?.invalidIdToken || Number(error?.status || 0) === 400) {
      return retryInvalidSession({ ok: false, error: "SHOPIFY_ID_TOKEN_EXPIRED" });
    }
    return noStoreJson({ ok: false, error: error?.message || "Could not open Spreelo from Shopify." }, { status: 500 });
  }
}
