import { getServerSupabase } from "../../../../lib/stripeBilling";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorizedCron(request) {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${configured}`;
}

export async function GET(request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const admin = getServerSupabase();
  const [stripeResult, shopifyResult] = await Promise.all([
    admin.rpc("refresh_due_annual_subscription_credits", { p_limit: 500 }),
    admin.rpc("refresh_due_shopify_annual_subscription_credits", { p_limit: 500 }),
  ]);
  const error = stripeResult.error || shopifyResult.error;
  if (error) {
    console.error("Annual subscription credit refresh failed", { message: error.message });
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({
    ok: true,
    stripe: stripeResult.data || {},
    shopify: shopifyResult.data || {},
    refreshed_accounts: Number(stripeResult.data?.refreshed_accounts || 0) + Number(shopifyResult.data?.refreshed_accounts || 0),
    credits_granted: Number(stripeResult.data?.credits_granted || 0) + Number(shopifyResult.data?.credits_granted || 0),
  });
}
