import {
  findStripePriceByLookupKey,
  getAllowedCheckoutLookup,
  getAuthenticatedBillingUser,
  getCheckoutOrigin,
  getOrCreateStripeCustomer,
  stripeRequest,
} from "../../../../lib/stripeBilling";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const context = await getAuthenticatedBillingUser(request);
    if (context.error) return Response.json({ ok: false, error: context.error }, { status: context.status });

    const body = await request.json().catch(() => ({}));
    const lookup = getAllowedCheckoutLookup(body?.lookupKey);
    if (!lookup) return Response.json({ ok: false, error: "Unknown Spreelo price." }, { status: 400 });

    const { data: currentBilling } = await context.admin
      .from("user_credit_balances")
      .select("payment_provider, provider_subscription_id, subscription_status")
      .eq("user_id", context.user.id)
      .maybeSingle();

    const subscriptionStatus = String(currentBilling?.subscription_status || "").toLowerCase();
    const hasStripeSubscription = Boolean(currentBilling?.payment_provider === "stripe" && currentBilling?.provider_subscription_id);

    if (lookup.kind === "subscription") {
      const blockingStatuses = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
      if (hasStripeSubscription && blockingStatuses.has(subscriptionStatus)) {
        return Response.json(
          { ok: false, error: "You already have a Stripe subscription. Change or cancel it from Spreelo settings.", activeSubscription: true },
          { status: 409 }
        );
      }
    }

    if (lookup.kind === "credits") {
      if (!hasStripeSubscription || subscriptionStatus !== "active") {
        return Response.json(
          { ok: false, error: "Extra credits require an active Spreelo subscription." },
          { status: 409 }
        );
      }
    }

    const price = await findStripePriceByLookupKey(lookup.lookupKey);
    const customerId = await getOrCreateStripeCustomer(context);
    const origin = getCheckoutOrigin(request);
    const managedPaymentsEnabled = String(process.env.STRIPE_MANAGED_PAYMENTS_ENABLED || "true").toLowerCase() !== "false";

    const params = {
      mode: lookup.kind === "subscription" ? "subscription" : "payment",
      customer: customerId,
      "line_items[0][price]": price.id,
      "line_items[0][quantity]": 1,
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?billing=cancelled`,
      client_reference_id: context.user.id,
      "metadata[spreelo_user_id]": context.user.id,
      "metadata[spreelo_lookup_key]": lookup.lookupKey,
      "metadata[spreelo_purchase_kind]": lookup.kind,
    };

    if (managedPaymentsEnabled) params["managed_payments[enabled]"] = true;
    if (lookup.kind === "subscription") {
      params["subscription_data[metadata][spreelo_user_id]"] = context.user.id;
      params["subscription_data[metadata][spreelo_lookup_key]"] = lookup.lookupKey;
    }

    const session = await stripeRequest("/v1/checkout/sessions", { method: "POST", params });
    if (!session?.url) throw new Error("Stripe did not return a Checkout URL.");

    return Response.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe checkout session failed", {
      message: error?.message,
      status: error?.status || null,
      stripeCode: error?.stripeCode || null,
    });
    return Response.json({ ok: false, error: error?.message || "Could not start Stripe Checkout." }, { status: error?.status || 500 });
  }
}
