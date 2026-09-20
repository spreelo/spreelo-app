import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  exchangeShopifyCode,
  getShopifyEnv,
  normalizeShopifyShop,
  saveShopifyConnection,
  verifyAndDecodeShopifyState,
  verifyBrandBelongsToUser,
  verifyShopifyCallbackHmac,
} from "../../../../lib/shopifyOAuth.js";

function resultUrl(origin, params = {}) {
  const url = new URL("/grow-brain", origin);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  return url.toString();
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const shop = normalizeShopifyShop(requestUrl.searchParams.get("shop"));
  const env = getShopifyEnv();

  const fail = (reason) => {
    const response = NextResponse.redirect(resultUrl(origin, { shopify: "error", reason }));
    response.cookies.delete("spreelo_shopify_oauth_state");
    return response;
  };

  if (!env.clientId || !env.clientSecret || !env.redirectUri) return fail("missing_env");
  if (!code || !state || !shop) return fail("missing_callback_data");
  if (!verifyShopifyCallbackHmac(requestUrl, env.clientSecret)) return fail("invalid_hmac");

  const cookieState = request.cookies.get("spreelo_shopify_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return fail("invalid_state");
  const decoded = verifyAndDecodeShopifyState(state, env.clientSecret);
  if (!decoded?.userId || !decoded?.brandProfileId || normalizeShopifyShop(decoded.shop) !== shop) return fail("invalid_state_payload");

  let stage = "brand";
  try {
    const supabaseAdmin = createSupabaseAdminClient();
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
    });
    const grantedScopes = String(token.scope || "").split(",").map((item) => item.trim()).filter(Boolean);
    const missingScopes = env.scopes.filter((scope) =>
      !grantedScopes.includes(scope) &&
      !(scope.startsWith("read_") && grantedScopes.includes(`write_${scope.slice(5)}`))
    );
    if (missingScopes.length) return fail("missing_scope");

    stage = "save";
    await saveShopifyConnection({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
      shop,
      token,
    });

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
        detected_platform: "shopify",
        detected_signals: { ...(currentWeb?.detected_signals || {}), shop_domain: shop },
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "brand_profile_id" });

    const response = NextResponse.redirect(resultUrl(origin, { shopify: "connected" }));
    response.cookies.delete("spreelo_shopify_oauth_state");
    return response;
  } catch (error) {
    console.error(`Shopify OAuth callback failed at ${stage}`, error);
    return fail(stage === "token" ? "token_failed" : stage === "save" ? "save_failed" : "callback_failed");
  }
}
