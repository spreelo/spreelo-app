import { getAuthenticatedBillingUser } from "../../../../../lib/stripeBilling.js";
import { findAppStoreShopifyConnection, syncShopifyBillingForConnection } from "../../../../../lib/shopifyBilling.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const context = await getAuthenticatedBillingUser(request);
  if (context.error) return Response.json({ ok: false, error: context.error }, { status: context.status });
  try {
    const body = await request.json().catch(() => ({}));
    const connection = await findAppStoreShopifyConnection(context.admin, context.user.id);
    if (!connection) return Response.json({ ok: false, error: "No connected Shopify App Store installation was found." }, { status: 404 });
    const shopify = await syncShopifyBillingForConnection(context.admin, {
      connection,
      userId: context.user.id,
      planHandleHint: String(body?.planHandle || "").trim(),
    });
    return Response.json({ ok: true, shopify });
  } catch (error) {
    console.error("Shopify billing sync failed", { userId: context.user.id, message: error?.message, code: error?.code || null });
    return Response.json({ ok: false, error: error?.message || "Could not synchronize Shopify billing.", code: error?.code || null }, { status: 500 });
  }
}
