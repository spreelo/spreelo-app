import { createClient } from "@supabase/supabase-js";
import { loadProviderCapacity, notifyProviderCapacity } from "../../../../lib/providerCapacityMonitor.js";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request) {
  const secret = String(process.env.CRON_SECRET || "");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rows = await loadProviderCapacity(admin);
    const notifications = await notifyProviderCapacity(admin, rows);
    return Response.json({ ok: true, inspected: rows.length, ...notifications });
  } catch (error) {
    console.error("Provider capacity alert check failed", { message: String(error?.message || error) });
    return Response.json({ ok: false, error: "Provider capacity alert check failed" }, { status: 500 });
  }
}
