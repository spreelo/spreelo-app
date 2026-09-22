import { createClient } from "@supabase/supabase-js";
import { enrichBrandProfileWithEffectiveProductMode } from "../../../../lib/effectiveProductMode.js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function getUserClient(authorizationHeader) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authorizationHeader } } }
  );
}

export async function GET(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getUserClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const brandProfileId = String(url.searchParams.get("brand_profile_id") || "").trim();
    if (!brandProfileId) {
      return Response.json({ ok: false, error: "Missing brand" }, { status: 400 });
    }

    const { data: brandProfile, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id, user_id, website_url, website_product_mode_available, website_product_mode_checked_at, website_product_mode_reason, website_product_source_url")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandError) {
      return Response.json({ ok: false, error: brandError.message }, { status: 500 });
    }
    if (!brandProfile?.id) {
      return Response.json({ ok: false, error: "Invalid brand" }, { status: 403 });
    }

    const { productMode } = await enrichBrandProfileWithEffectiveProductMode({
      brandProfile,
      brandProfileId,
      userId: user.id,
      persist: true,
    });

    return Response.json({
      ok: true,
      available: productMode?.available === true,
      source: productMode?.source || "none",
      reason: productMode?.reason || "",
      sourceUrl: productMode?.sourceUrl || "",
      shopDomain: productMode?.shopDomain || null,
      eligibleProductCount: productMode?.eligibleProductCount ?? null,
      persisted: productMode?.persisted === true,
    });
  } catch (error) {
    console.error("Shopify product-mode request failed", error);
    return Response.json({
      ok: false,
      error: error?.message || "Could not verify Shopify product mode",
    }, { status: 500 });
  }
}
