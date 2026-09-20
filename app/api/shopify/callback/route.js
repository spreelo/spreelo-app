import { NextResponse } from "next/server";
import {
  buildShopifyAuthorizationUrl,
  createSignedShopifyState,
  createSupabaseAdminClient,
  exchangeShopifyCode,
  expiresAt,
  getShopifyEnv,
  grantedScopesFromToken,
  hasRequiredShopifyScopes,
  normalizeShopifyShop,
  saveShopifyConnection,
  SHOPIFY_AI_CONSENT_VERSION,
  shopifyGraphql,
  verifyAndDecodeShopifyState,
  verifyBrandBelongsToUser,
  verifyShopifyCallbackHmac,
} from "../../../../lib/shopifyOAuth.js";

export const dynamic = "force-dynamic";

const SHOP_DETAILS_QUERY = `#graphql
query SpreeloShopDetails {
  shop {
    name
    myshopifyDomain
    primaryDomain { url }
  }
}`;

function growBrainUrl(origin, params = {}) {
  const url = new URL("/grow-brain", origin);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  return url.toString();
}

function onboardingUrl(origin, params = {}) {
  const url = new URL("/shopify/onboarding", origin);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  return url.toString();
}

function clearOauthState(response) {
  response.cookies.delete("spreelo_shopify_oauth_state");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function setOauthState(response, state) {
  response.cookies.set("spreelo_shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function setOnboardingSession(response, sessionId) {
  response.cookies.set("spreelo_shopify_onboarding", String(sessionId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const shop = normalizeShopifyShop(requestUrl.searchParams.get("shop"));
  const env = getShopifyEnv();

  const decoded = state ? verifyAndDecodeShopifyState(state, env.clientSecret) : null;
  const isAppStoreFlow = String(decoded?.flow || "").startsWith("app_store_");
  const fail = (reason) => {
    const destination = isAppStoreFlow
      ? onboardingUrl(origin, { error: reason })
      : growBrainUrl(origin, { shopify: "error", reason });
    return clearOauthState(NextResponse.redirect(destination));
  };

  if (!env.clientId || !env.clientSecret || !env.redirectUri) return fail("missing_env");
  if (!code || !state || !shop) return fail("missing_callback_data");
  if (!verifyShopifyCallbackHmac(requestUrl, env.clientSecret)) return fail("invalid_hmac");

  const cookieState = request.cookies.get("spreelo_shopify_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return fail("invalid_state");
  if (!decoded || normalizeShopifyShop(decoded.shop) !== shop) return fail("invalid_state_payload");

  let stage = "callback";
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    if (decoded.flow === "app_store_identity") {
      stage = "identity_token";
      const identityToken = await exchangeShopifyCode({
        shop,
        code,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        tokenType: "online",
      });
      const associatedUser = identityToken?.associated_user || {};
      const installerEmail = String(associatedUser?.email || "").trim().toLowerCase();
      const installerEmailVerified = Boolean(associatedUser?.email_verified);
      if (!installerEmail || !installerEmailVerified) return fail("shopify_email_unverified");

      stage = "identity_session";
      await supabaseAdmin
        .from("shopify_onboarding_sessions")
        .delete()
        .lt("expires_at", new Date().toISOString());
      await supabaseAdmin
        .from("shopify_onboarding_sessions")
        .delete()
        .eq("shop_domain", shop)
        .neq("status", "claimed");

      const { data: onboardingSession, error: sessionError } = await supabaseAdmin
        .from("shopify_onboarding_sessions")
        .insert({
          shop_domain: shop,
          installer_email: installerEmail,
          installer_email_verified: true,
          installer_shopify_user_id: String(associatedUser?.id || ""),
          installer_locale: String(associatedUser?.locale || "").trim(),
          status: "identity_verified",
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (sessionError || !onboardingSession?.id) throw sessionError || new Error("Could not create Shopify onboarding session");

      const nextState = createSignedShopifyState({
        flow: "app_store_offline",
        onboardingSessionId: onboardingSession.id,
        shop,
        redirectUri: env.redirectUri,
        secret: env.clientSecret,
      });
      const offlineAuthorizationUrl = buildShopifyAuthorizationUrl({
        shop,
        clientId: env.clientId,
        scopes: env.scopes,
        redirectUri: env.redirectUri,
        state: nextState,
        online: false,
      });
      return setOauthState(NextResponse.redirect(offlineAuthorizationUrl), nextState);
    }

    if (decoded.flow === "app_store_offline") {
      stage = "onboarding_session";
      const { data: onboardingSession, error: sessionError } = await supabaseAdmin
        .from("shopify_onboarding_sessions")
        .select("*")
        .eq("id", decoded.onboardingSessionId)
        .eq("shop_domain", shop)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!onboardingSession?.id || new Date(onboardingSession.expires_at || 0).getTime() <= Date.now()) {
        return fail("onboarding_session_expired");
      }

      stage = "offline_token";
      const token = await exchangeShopifyCode({
        shop,
        code,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        tokenType: "offline",
      });
      if (!hasRequiredShopifyScopes(token, env.scopes)) return fail("missing_scope");

      stage = "shop_details";
      const shopData = await shopifyGraphql({
        shop,
        accessToken: token.access_token,
        apiVersion: env.apiVersion,
        query: SHOP_DETAILS_QUERY,
      });
      const shopDetails = shopData?.shop || {};

      stage = "onboarding_ready";
      const { error: updateError } = await supabaseAdmin
        .from("shopify_onboarding_sessions")
        .update({
          shop_name: String(shopDetails?.name || shop.split(".")[0] || "Shopify Store").trim(),
          primary_domain: String(shopDetails?.primaryDomain?.url || "").trim(),
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          access_token_expires_at: expiresAt(token.expires_in, 3600),
          refresh_token_expires_at: expiresAt(token.refresh_token_expires_in, 7776000),
          scopes: grantedScopesFromToken(token),
          status: "ready_to_claim",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", onboardingSession.id);
      if (updateError) throw updateError;

      let response = NextResponse.redirect(onboardingUrl(origin));
      response = setOnboardingSession(response, onboardingSession.id);
      return clearOauthState(response);
    }

    if (decoded.flow !== "brand_connect") return fail("invalid_flow");

    stage = "brand";
    const validBrand = await verifyBrandBelongsToUser({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
    });
    if (!validBrand) return fail("invalid_brand");

    stage = "token";
    const token = await exchangeShopifyCode({
      shop,
      code,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      tokenType: "offline",
    });
    if (!hasRequiredShopifyScopes(token, env.scopes)) return fail("missing_scope");

    stage = "save";
    await saveShopifyConnection({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
      shop,
      token,
    });

    if (decoded.aiConsent) {
      const acceptedAt = new Date().toISOString();
      await supabaseAdmin.from("shopify_connections").update({
        ai_store_data_consent_at: acceptedAt,
        ai_store_data_consent_version: SHOPIFY_AI_CONSENT_VERSION,
        updated_at: acceptedAt,
      }).eq("user_id", decoded.userId).eq("brand_profile_id", decoded.brandProfileId).eq("shop_domain", shop);
    }

    const { data: currentWeb } = await supabaseAdmin
      .from("brand_web_data_connections")
      .select("detected_signals")
      .eq("brand_profile_id", decoded.brandProfileId)
      .maybeSingle();
    await supabaseAdmin
      .from("brand_web_data_connections")
      .upsert({
        brand_profile_id: decoded.brandProfileId,
        user_id: decoded.userId,
        status: "connected",
        provider: "shopify",
        website_url: `https://${shop}`,
        detected_platform: "shopify",
        detected_signals: { ...(currentWeb?.detected_signals || {}), shop_domain: shop },
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "brand_profile_id" });

    return clearOauthState(NextResponse.redirect(growBrainUrl(origin, { shopify: "connected" })));
  } catch (error) {
    console.error(`Shopify OAuth callback failed at ${stage}`, error);
    if (decoded?.flow === "app_store_offline" && decoded?.onboardingSessionId) {
      try {
        const admin = createSupabaseAdminClient();
        await admin.from("shopify_onboarding_sessions").update({
          status: "error",
          last_error: String(error?.message || "Shopify onboarding failed").slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq("id", decoded.onboardingSessionId);
      } catch {}
    }
    return fail(stage.includes("token") ? "token_failed" : stage.includes("session") ? "session_failed" : "callback_failed");
  }
}
