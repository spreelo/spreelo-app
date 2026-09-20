import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildShopifyAuthorizationUrl,
  createSignedShopifyState,
  getShopifyEnv,
  normalizeShopifyShop,
} from "../../../../lib/shopifyOAuth.js";

function getUserClient(authorizationHeader) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  return createClient(url, anon, { global: { headers: { Authorization: authorizationHeader } } });
}

export async function GET(request) {
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/grow-brain?shopify=connect`);
}

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = getUserClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || "").trim();
    if (!brandProfileId) return NextResponse.json({ ok: false, error: "Missing brand" }, { status: 400 });

    const { data: brand, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id,website_url")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (brandError) throw brandError;
    if (!brand?.id) return NextResponse.json({ ok: false, error: "Invalid brand" }, { status: 403 });

    const { data: webConnection } = await supabase
      .from("brand_web_data_connections")
      .select("provider,detected_signals,website_url")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    const shop = normalizeShopifyShop(
      body?.shop || webConnection?.detected_signals?.shop_domain || webConnection?.website_url || brand?.website_url
    );
    if (!shop) {
      return NextResponse.json({
        ok: false,
        error: "SHOP_DOMAIN_REQUIRED",
        message: "We found Shopify, but could not determine the store's .myshopify.com domain.",
      }, { status: 422 });
    }

    const env = getShopifyEnv();
    if (!env.clientId || !env.clientSecret || !env.redirectUri || env.scopes.length === 0) {
      return NextResponse.json({ ok: false, error: "Shopify connection is not configured yet." }, { status: 500 });
    }

    const state = createSignedShopifyState({
      userId: user.id,
      brandProfileId,
      shop,
      redirectUri: env.redirectUri,
      secret: env.clientSecret,
    });
    const url = buildShopifyAuthorizationUrl({
      shop,
      clientId: env.clientId,
      scopes: env.scopes,
      redirectUri: env.redirectUri,
      state,
    });

    await supabase
      .from("brand_web_data_connections")
      .update({ status: "setup_pending", provider: "shopify", updated_at: new Date().toISOString() })
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", user.id);

    const response = NextResponse.json({ ok: true, url, shop });
    response.cookies.set("spreelo_shopify_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("Shopify OAuth start failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Could not start Shopify connection." }, { status: 500 });
  }
}
