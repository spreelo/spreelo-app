import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../lib/shopifyOAuth.js";

const SHOPIFY_PRODUCT_MODE_REASON_PREFIX = "Verified from the connected Shopify Admin API:";

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorizationHeader } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || "").trim();
    const { data: brand } = await supabase
      .from("brand_profiles")
      .select("id,website_product_mode_available,website_product_mode_reason,website_product_source_url")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!brand?.id) return NextResponse.json({ ok: false, error: "Invalid brand" }, { status: 403 });

    const admin = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("shopify_connections")
      .select("id,shop_domain,status,install_source")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", user.id)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connectionError) throw connectionError;

    const now = new Date().toISOString();

    // Keep the installation identity for billing/account-deletion reconciliation,
    // but revoke all data access immediately.
    if (connection?.id) {
      const { error } = await admin.from("shopify_connections").update({
        status: "disconnected",
        access_token: "",
        refresh_token: "",
        access_token_expires_at: now,
        refresh_token_expires_at: now,
        scopes: [],
        ai_store_data_consent_at: null,
        ai_store_data_consent_version: null,
        last_error: null,
        updated_at: now,
      }).eq("id", connection.id);
      if (error) throw error;
    }

    const { error: catalogError } = await admin
      .from("website_product_catalog")
      .update({ is_active: false })
      .eq("brand_profile_id", brandProfileId)
      .eq("commerce_platform", "shopify");
    if (catalogError) throw catalogError;

    const { error: webDataError } = await admin.from("brand_web_data_connections").update({
      status: "discovered",
      connected_at: null,
      last_error: null,
      updated_at: now,
    }).eq("brand_profile_id", brandProfileId).eq("user_id", user.id).eq("provider", "shopify");
    if (webDataError) throw webDataError;

    // Only remove product-mode capability when it was derived from the Shopify
    // Admin API. A separately verified ordinary website product mode is preserved.
    const shopifyBackedProductMode = String(brand?.website_product_mode_reason || "").startsWith(SHOPIFY_PRODUCT_MODE_REASON_PREFIX);
    if (shopifyBackedProductMode) {
      const { error: brandError } = await admin.from("brand_profiles").update({
        website_product_mode_available: false,
        website_product_mode_checked_at: now,
        website_product_mode_reason: null,
        website_product_source_url: null,
        updated_at: now,
      }).eq("id", brandProfileId).eq("user_id", user.id);
      if (brandError) throw brandError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shopify disconnect failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Could not disconnect Shopify" }, { status: 500 });
  }
}
