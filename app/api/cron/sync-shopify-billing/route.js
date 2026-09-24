import { createSupabaseAdminClient } from "../../../../lib/shopifyOAuth.js";
import { getShopifyAppPricingEnv, syncShopifyBillingForConnection } from "../../../../lib/shopifyBilling.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorizedCron(request) {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${configured}`;
}

export async function GET(request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const pricingEnv = getShopifyAppPricingEnv();
  if (!pricingEnv.configured) return Response.json({ ok: true, skipped: true, reason: "shopify_app_pricing_not_configured", missing: pricingEnv.missing });

  const admin = createSupabaseAdminClient();
  const { data: connections, error } = await admin
    .from("shopify_connections")
    .select("*")
    .eq("install_source", "shopify_app_store")
    .eq("status", "connected")
    .order("shopify_billing_last_synced_at", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  let synced = 0;
  let failed = 0;
  const errors = [];
  for (const connection of connections || []) {
    try {
      await syncShopifyBillingForConnection(admin, { connection, userId: connection.user_id });
      synced += 1;
    } catch (syncError) {
      failed += 1;
      errors.push({ shop: connection.shop_domain, error: String(syncError?.message || "sync failed").slice(0, 240) });
    }
  }
  return Response.json({ ok: failed === 0, checked: (connections || []).length, synced, failed, errors: errors.slice(0, 20) });
}
