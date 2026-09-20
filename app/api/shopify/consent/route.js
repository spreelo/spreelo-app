import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, SHOPIFY_AI_CONSENT_VERSION } from "../../../../lib/shopifyOAuth.js";

export const dynamic = "force-dynamic";

function userClient(authorizationHeader) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  return createClient(url, anon, { global: { headers: { Authorization: authorizationHeader } } });
}

function json(payload, init = {}) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = userClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || "").trim();
    if (!brandProfileId || body?.accepted !== true) return json({ ok: false, error: "CONSENT_REQUIRED" }, { status: 400 });

    const { data: brand } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!brand?.id) return json({ ok: false, error: "INVALID_BRAND" }, { status: 403 });

    const admin = createSupabaseAdminClient();
    const acceptedAt = new Date().toISOString();
    const { data: connection, error } = await admin
      .from("shopify_connections")
      .update({
        ai_store_data_consent_at: acceptedAt,
        ai_store_data_consent_version: SHOPIFY_AI_CONSENT_VERSION,
        updated_at: acceptedAt,
      })
      .eq("user_id", user.id)
      .eq("brand_profile_id", brandProfileId)
      .eq("status", "connected")
      .select("id,shop_domain,ai_store_data_consent_at,ai_store_data_consent_version")
      .maybeSingle();
    if (error) throw error;
    if (!connection?.id) return json({ ok: false, error: "SHOPIFY_CONNECTION_NOT_FOUND" }, { status: 404 });

    return json({ ok: true, accepted_at: connection.ai_store_data_consent_at, version: connection.ai_store_data_consent_version });
  } catch (error) {
    console.error("Shopify AI store-data consent failed", error);
    return json({ ok: false, error: error?.message || "Could not save consent." }, { status: 500 });
  }
}
