import { createClient } from "@supabase/supabase-js";
import { normalizeContentFormatRows } from "../../../lib/contentFormatLibrary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json({ ok: true, formats: normalizeContentFormatRows([]), source: "defaults" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin
      .from("content_format_library")
      .select("content_type_id, display_label, description, icon_name, image_url, image_storage_path, icon_url, icon_storage_path, category, is_featured, active, sort_order, customer_credit_cost, credit_variant_prices, estimated_cost_sek, available_starter, available_growth, available_pro, pending_credit_cost, pending_effective_at, is_custom, updated_at")
      .order("sort_order", { ascending: true });

    if (error) {
      console.warn("Content format library is not available; using defaults:", error.message);
      return Response.json({ ok: true, formats: normalizeContentFormatRows([]), source: "defaults" });
    }

    return Response.json({ ok: true, formats: normalizeContentFormatRows(data || []), source: "database" });
  } catch (error) {
    console.error("Could not load content formats:", error);
    return Response.json({ ok: true, formats: normalizeContentFormatRows([]), source: "defaults" });
  }
}
