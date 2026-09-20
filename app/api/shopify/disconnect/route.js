import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../lib/shopifyOAuth.js";

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorizationHeader } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || "").trim();
    const { data: brand } = await supabase.from("brand_profiles").select("id").eq("id", brandProfileId).eq("user_id", user.id).maybeSingle();
    if (!brand?.id) return NextResponse.json({ ok: false, error: "Invalid brand" }, { status: 403 });

    const admin = createSupabaseAdminClient();
    await admin.from("shopify_connections").delete().eq("brand_profile_id", brandProfileId).eq("user_id", user.id);
    await admin.from("brand_web_data_connections").update({
      status: "discovered",
      connected_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("brand_profile_id", brandProfileId).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shopify disconnect failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Could not disconnect Shopify" }, { status: 500 });
  }
}
