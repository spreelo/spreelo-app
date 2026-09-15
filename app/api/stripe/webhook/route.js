import {
  addUtcMonths,
  extractSubscriptionId,
  extractSubscriptionLookupKey,
  getCreditPackByLookupKey,
  getPlanByLookupKey,
  getServerSupabase,
  stripeRequest,
  unixToIso,
  verifyStripeWebhookSignature,
} from "../../../../lib/stripeBilling";
import { markFreeTrialUsedForPaidPlan } from "../../../../lib/freeTrial.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function claimEvent(admin, event) {
  const { data, error } = await admin.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
  });
  if (error) throw new Error(`Could not claim Stripe webhook: ${error.message}`);
  return data || {};
}

async function completeEvent(admin, eventId) {
  const { error } = await admin.rpc("complete_stripe_webhook_event", { p_event_id: eventId });
  if (error) console.error("Could not mark Stripe webhook complete", { eventId, message: error.message });
}

async function failEvent(admin, eventId, message) {
  const { error } = await admin.rpc("fail_stripe_webhook_event", { p_event_id: eventId, p_error: String(message || "Unknown error").slice(0, 1000) });
  if (error) console.error("Could not mark Stripe webhook failed", { eventId, message: error.message });
}

async function resolveUserId(admin, object) {
  const explicit = object?.metadata?.spreelo_user_id || object?.client_reference_id || null;
  if (explicit) return explicit;
  const customerId = typeof object?.customer === "string" ? object.customer : object?.customer?.id;
  if (!customerId) return null;
  const { data } = await admin.from("user_credit_balances").select("user_id").eq("provider_customer_id", customerId).maybeSingle();
  return data?.user_id || null;
}

async function fetchSubscription(subscriptionId) {
  if (!subscriptionId) return null;
  return stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    params: { "expand[]": "items.data.price" },
  });
}

async function applySubscription(admin, userId, subscription, { grantCredits = false, sourceId = null } = {}) {
  if (!userId || !subscription) return;
  const lookupKey = extractSubscriptionLookupKey(subscription) || subscription?.metadata?.spreelo_lookup_key || null;
  const plan = getPlanByLookupKey(lookupKey);
  if (!plan) throw new Error(`Unknown subscription price lookup key: ${lookupKey || "missing"}.`);

  const primaryItem = subscription?.items?.data?.[0] || {};
  const currentStart = unixToIso(primaryItem.current_period_start || subscription.current_period_start);
  const currentEnd = unixToIso(primaryItem.current_period_end || subscription.current_period_end);
  const trialStart = unixToIso(subscription?.trial_start);
  const trialEnd = unixToIso(subscription?.trial_end);
  const status = String(subscription.status || "active").toLowerCase();
  const activeLike = ["active", "trialing"].includes(status);
  // v144.180 no longer creates Stripe trials. Any legacy/unexpected Stripe
  // trialing state is synchronized without granting promotional credits.
  const isTrial = false;

  // Account deletion cancels Stripe before removing Spreelo data. Stripe can
  // deliver subscription.deleted a moment later; acknowledge that webhook
  // instead of retrying forever against a balance row that no longer exists.
  const { data: balanceExists, error: balanceLookupError } = await admin
    .from("user_credit_balances")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (balanceLookupError) throw new Error(`Could not verify Spreelo billing account: ${balanceLookupError.message}`);
  if (!balanceExists?.user_id) return;

  const { error } = await admin.rpc("apply_stripe_subscription_state_v14378", {
    p_user_id: userId,
    p_plan: plan.key,
    p_monthly_credits: plan.credits,
    p_status: status,
    p_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null,
    p_subscription_id: subscription.id,
    p_lookup_key: lookupKey,
    p_interval: plan.interval,
    p_current_period_start: currentStart,
    p_current_period_end: currentEnd,
    p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    p_price_amount: Number(primaryItem?.price?.unit_amount || 0),
    p_currency: String(primaryItem?.price?.currency || "sek").toUpperCase(),
    p_grant_credits: Boolean(grantCredits && activeLike && status === "active"),
    p_source_id: sourceId,
    p_next_credit_refresh_at: plan.interval === "year" && status === "active" ? addUtcMonths(new Date().toISOString(), 1) : currentEnd,
    p_is_trial: false,
    p_trial_credits: 0,
    p_trial_start: trialStart,
    p_trial_end: trialEnd,
  });
  if (error) throw new Error(`Could not apply Stripe subscription: ${error.message}`);

  if (status === "active" && lookupKey) {
    await markFreeTrialUsedForPaidPlan(admin, userId);
    await admin
      .from("stripe_plan_changes")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("subscription_id", subscription.id)
      .eq("target_lookup_key", lookupKey)
      .eq("status", "scheduled")
      .lte("effective_at", new Date().toISOString());
  }
}

async function grantCreditPack(admin, session, eventId) {
  if (session?.payment_status !== "paid") return;
  const lookupKey = session?.metadata?.spreelo_lookup_key;
  const pack = getCreditPackByLookupKey(lookupKey);
  if (!pack) throw new Error(`Unknown credit pack lookup key: ${lookupKey || "missing"}.`);
  const userId = await resolveUserId(admin, session);
  if (!userId) throw new Error("Could not resolve Spreelo user for credit purchase.");

  const { error } = await admin.rpc("grant_stripe_purchased_credits", {
    p_user_id: userId,
    p_credits: pack.credits,
    p_source_id: session.id || eventId,
    p_lookup_key: lookupKey,
  });
  if (error) throw new Error(`Could not grant purchased credits: ${error.message}`);
}


async function handleEvent(admin, event) {
  const object = event?.data?.object || {};

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (object?.mode === "payment") {
      await grantCreditPack(admin, object, event.id);
      return;
    }
    if (object?.mode === "subscription") {
      const userId = await resolveUserId(admin, object);
      const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
      const subscription = await fetchSubscription(subscriptionId);
      await applySubscription(admin, userId, subscription, { grantCredits: false, sourceId: object.id || event.id });
      return;
    }
  }

  if (event.type === "checkout.session.async_payment_failed") {
    // No credits or subscription allowance are granted. Stripe can retry or the
    // customer can complete a new Checkout Session later.
    return;
  }

  if (event.type === "invoice.paid") {
    const subscriptionId = extractSubscriptionId(object);
    if (!subscriptionId) return;
    const subscription = await fetchSubscription(subscriptionId);
    const userId = await resolveUserId(admin, { ...object, customer: subscription?.customer, metadata: subscription?.metadata });
    const lookupKey = extractSubscriptionLookupKey(subscription) || subscription?.metadata?.spreelo_lookup_key;
    const plan = getPlanByLookupKey(lookupKey);
    const billingReason = String(object?.billing_reason || "").toLowerCase();
    const allowanceReasons = new Set(["subscription_create", "subscription_cycle", "subscription"]);
    // Grant a fresh monthly allowance only when a paid invoice starts a normal
    // subscription period. Proration/update invoices must not grant a second full
    // allowance in the same period. Annual plans receive later monthly refreshes
    // from the annual-credit cron while the prepaid yearly period remains active.
    if (billingReason === "subscription_update" && userId && subscriptionId) {
      const { error: changeError } = await admin.rpc("finalize_stripe_plan_change", {
        p_user_id: userId,
        p_subscription_id: subscriptionId,
        p_invoice_id: object.id || event.id,
      });
      if (changeError) throw new Error(`Could not finalize plan change credits: ${changeError.message}`);
    }
    await applySubscription(admin, userId, subscription, {
      grantCredits: Boolean(plan && allowanceReasons.has(billingReason) && String(subscription?.status || "").toLowerCase() !== "trialing"),
      sourceId: object.id || event.id,
    });
    return;
  }


  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const userId = await resolveUserId(admin, object);
    await applySubscription(admin, userId, object, { grantCredits: false, sourceId: event.id });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const subscriptionId = extractSubscriptionId(object);
    const subscription = await fetchSubscription(subscriptionId);
    if (!subscription) return;
    const userId = await resolveUserId(admin, { ...object, customer: subscription.customer, metadata: subscription.metadata });
    await applySubscription(admin, userId, { ...subscription, status: "past_due" }, { grantCredits: false, sourceId: object.id || event.id });
    await admin.from("stripe_plan_changes").update({ status: "failed", last_error: "invoice_payment_failed", updated_at: new Date().toISOString() }).eq("subscription_id", subscriptionId).eq("status", "pending");
  }
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    verifyStripeWebhookSignature(rawBody, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook signature rejected", { message: error?.message });
    return Response.json({ ok: false, error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getServerSupabase();
  try {
    const claim = await claimEvent(admin, event);
    if (claim?.already_processed || claim?.busy) return Response.json({ ok: true, duplicate: true });
    await handleEvent(admin, event);
    await completeEvent(admin, event.id);
    return Response.json({ ok: true });
  } catch (error) {
    await failEvent(admin, event?.id, error?.message);
    console.error("Stripe webhook processing failed", { eventId: event?.id, type: event?.type, message: error?.message });
    return Response.json({ ok: false, error: "Webhook processing failed." }, { status: 500 });
  }
}
