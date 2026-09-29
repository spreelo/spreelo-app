import {
  comparePlanLevel,
  findStripePriceByLookupKey,
  getAllowedCheckoutLookup,
  getAuthenticatedBillingUser,
  getPlanByLookupKey,
  stripeRequest,
  unixToIso,
} from "../../../../../lib/stripeBilling";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchSubscription(subscriptionId) {
  return stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    params: { "expand[]": ["items.data.price", "latest_invoice.payment_intent"] },
  });
}

function remainingFraction(subscription) {
  const item = subscription?.items?.data?.[0] || {};
  const start = Number(item.current_period_start || subscription?.current_period_start || 0);
  const end = Number(item.current_period_end || subscription?.current_period_end || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!start || !end || end <= start) return 1;
  return Math.max(0, Math.min(1, (end - now) / (end - start)));
}

function getScheduleId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value?.id || "");
}

async function releaseScheduledPlanChange(context, billing, subscription) {
  const scheduleId = getScheduleId(subscription?.schedule) || getScheduleId(billing?.provider_subscription_schedule_id);
  if (!scheduleId) return subscription;

  try {
    await stripeRequest(`/v1/subscription_schedules/${encodeURIComponent(scheduleId)}/release`, { method: "POST" });
  } catch (error) {
    const message = String(error?.message || "");
    const alreadyInactive = /no such subscription schedule|already released|already canceled|already cancelled/i.test(message);
    if (!alreadyInactive) throw error;
  }

  const nowIso = new Date().toISOString();
  const { error: clearError } = await context.admin
    .from("user_credit_balances")
    .update({
      pending_subscription_plan: null,
      pending_subscription_lookup_key: null,
      pending_subscription_effective_at: null,
      provider_subscription_schedule_id: null,
      updated_at: nowIso,
    })
    .eq("user_id", context.user.id);
  if (clearError) throw new Error(`Could not clear previous scheduled plan change: ${clearError.message}`);

  const { error: auditError } = await context.admin
    .from("stripe_plan_changes")
    .update({ status: "canceled", updated_at: nowIso })
    .eq("user_id", context.user.id)
    .eq("status", "scheduled")
    .eq("schedule_id", scheduleId);
  if (auditError) {
    console.warn("Previous scheduled plan change was released but its audit row could not be updated", {
      userId: context.user.id,
      scheduleId,
      message: auditError.message,
    });
  }

  return fetchSubscription(subscription.id);
}

export async function POST(request) {
  try {
    const context = await getAuthenticatedBillingUser(request);
    if (context.error) return Response.json({ ok: false, error: context.error }, { status: context.status });
    const body = await request.json().catch(() => ({}));
    const targetLookup = getAllowedCheckoutLookup(body?.lookupKey);
    if (!targetLookup || targetLookup.kind !== "subscription") return Response.json({ ok: false, error: "Unknown target plan." }, { status: 400 });

    const { data: billing, error: billingError } = await context.admin
      .from("user_credit_balances")
      .select("provider_subscription_id, subscription_status, subscription_price_lookup_key, subscription_plan, subscription_interval, provider_subscription_schedule_id, pending_subscription_plan, pending_subscription_lookup_key, pending_subscription_effective_at")
      .eq("user_id", context.user.id)
      .maybeSingle();
    if (billingError) throw new Error(billingError.message);
    if (!billing?.provider_subscription_id || !["active"].includes(String(billing?.subscription_status || "").toLowerCase())) {
      return Response.json({ ok: false, error: "Plan changes are available after the trial and while the subscription is active." }, { status: 409 });
    }

    const current = getPlanByLookupKey(billing.subscription_price_lookup_key);
    if (!current) return Response.json({ ok: false, error: "Current Stripe plan could not be identified." }, { status: 409 });

    let subscription = await fetchSubscription(billing.provider_subscription_id);
    const hasScheduledChange = Boolean(subscription?.schedule || billing?.provider_subscription_schedule_id);
    if (current.key === targetLookup.plan.key && current.interval === targetLookup.plan.interval) {
      if (!hasScheduledChange) return Response.json({ ok: true, unchanged: true });
      await releaseScheduledPlanChange(context, billing, subscription);
      return Response.json({ ok: true, unchanged: true, canceledScheduledChange: true });
    }
    const currentItem = subscription?.items?.data?.[0];
    if (!currentItem?.id) throw new Error("Stripe subscription item is missing.");
    const targetPrice = await findStripePriceByLookupKey(targetLookup.lookupKey);
    const levelDelta = comparePlanLevel(current.key, targetLookup.plan.key);
    const scheduleAtEnd = levelDelta < 0 || (levelDelta === 0 && current.interval === "year" && targetLookup.plan.interval === "month");

    if (scheduleAtEnd) {
      if (subscription?.schedule || billing?.provider_subscription_schedule_id) {
        subscription = await releaseScheduledPlanChange(context, billing, subscription);
      }
      const refreshedCurrentItem = subscription?.items?.data?.[0];
      if (!refreshedCurrentItem?.id) throw new Error("Stripe subscription item is missing after releasing the previous schedule.");
      const schedule = await stripeRequest("/v1/subscription_schedules", {
        method: "POST",
        params: { from_subscription: subscription.id },
      });
      const currentPhase = schedule?.phases?.[0];
      const currentStart = Number(currentPhase?.start_date || refreshedCurrentItem.current_period_start || subscription.current_period_start);
      const currentEnd = Number(currentPhase?.end_date || refreshedCurrentItem.current_period_end || subscription.current_period_end);
      if (!currentStart || !currentEnd) throw new Error("Could not determine the current billing period for the downgrade.");

      const updatedSchedule = await stripeRequest(`/v1/subscription_schedules/${encodeURIComponent(schedule.id)}`, {
        method: "POST",
        params: {
          end_behavior: "release",
          "phases[0][start_date]": currentStart,
          "phases[0][end_date]": currentEnd,
          "phases[0][items][0][price]": refreshedCurrentItem.price?.id,
          "phases[0][items][0][quantity]": 1,
          "phases[0][proration_behavior]": "none",
          "phases[1][start_date]": currentEnd,
          "phases[1][items][0][price]": targetPrice.id,
          "phases[1][items][0][quantity]": 1,
          "phases[1][duration][interval]": targetLookup.plan.interval,
          "phases[1][duration][interval_count]": 1,
          "phases[1][proration_behavior]": "none",
          "metadata[spreelo_user_id]": context.user.id,
          "metadata[spreelo_target_lookup_key]": targetLookup.lookupKey,
        },
      });

      const effectiveAt = unixToIso(currentEnd);
      const { data: change, error: changeError } = await context.admin.from("stripe_plan_changes").insert({
        user_id: context.user.id,
        subscription_id: subscription.id,
        schedule_id: updatedSchedule.id,
        old_lookup_key: billing.subscription_price_lookup_key,
        target_lookup_key: targetLookup.lookupKey,
        change_type: "scheduled_downgrade",
        credit_mode: "none",
        credit_amount: 0,
        target_monthly_credits: targetLookup.plan.credits,
        status: "scheduled",
        effective_at: effectiveAt,
      }).select("id").single();
      if (changeError) throw new Error(`Could not save scheduled plan change: ${changeError.message}`);
      await context.admin.from("user_credit_balances").update({
        pending_subscription_plan: targetLookup.plan.key,
        pending_subscription_lookup_key: targetLookup.lookupKey,
        pending_subscription_effective_at: effectiveAt,
        provider_subscription_schedule_id: updatedSchedule.id,
        updated_at: new Date().toISOString(),
      }).eq("user_id", context.user.id);

      return Response.json({ ok: true, scheduled: true, effectiveAt, changeId: change.id });
    }

    if (subscription?.schedule || billing?.provider_subscription_schedule_id) {
      subscription = await releaseScheduledPlanChange(context, billing, subscription);
    }

    const sameInterval = current.interval === targetLookup.plan.interval;
    const fraction = remainingFraction(subscription);
    const creditMode = sameInterval ? "delta" : "full";
    const creditAmount = sameInterval ? Math.max(0, Math.round((targetLookup.plan.credits - current.credits) * fraction)) : targetLookup.plan.credits;

    const { data: change, error: changeError } = await context.admin.from("stripe_plan_changes").insert({
      user_id: context.user.id,
      subscription_id: subscription.id,
      old_lookup_key: billing.subscription_price_lookup_key,
      target_lookup_key: targetLookup.lookupKey,
      change_type: sameInterval ? "immediate_upgrade" : "interval_upgrade",
      credit_mode: creditMode,
      credit_amount: creditAmount,
      target_monthly_credits: targetLookup.plan.credits,
      status: "pending",
      effective_at: new Date().toISOString(),
    }).select("id").single();
    if (changeError) throw new Error(`Could not save plan change: ${changeError.message}`);

    try {
      const updated = await stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscription.id)}`, {
        method: "POST",
        params: {
          "items[0][id]": subscription.items.data[0].id,
          "items[0][price]": targetPrice.id,
          "items[0][quantity]": 1,
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          "metadata[spreelo_user_id]": context.user.id,
          "metadata[spreelo_lookup_key]": targetLookup.lookupKey,
          "expand[]": ["latest_invoice.payment_intent"],
        },
      });
      const invoice = updated?.latest_invoice || null;
      const invoiceStatus = String(invoice?.status || "").toLowerCase();
      const paymentIntentStatus = String(invoice?.payment_intent?.status || "").toLowerCase();
      const requiresCustomerPayment = Boolean(
        updated?.pending_update ||
        ["draft", "open"].includes(invoiceStatus) ||
        ["requires_action", "requires_payment_method", "requires_confirmation"].includes(paymentIntentStatus)
      );
      const paymentUrl = requiresCustomerPayment ? invoice?.hosted_invoice_url || null : null;
      return Response.json({
        ok: true,
        scheduled: false,
        pendingPayment: requiresCustomerPayment,
        paymentUrl,
        changeId: change.id,
      });
    } catch (stripeError) {
      await context.admin.from("stripe_plan_changes").update({ status: "failed", last_error: String(stripeError?.message || "Stripe update failed").slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", change.id);
      throw stripeError;
    }
  } catch (error) {
    console.error("Stripe plan change failed", { message: error?.message, stripeCode: error?.stripeCode || null });
    return Response.json({ ok: false, error: error?.message || "Could not change subscription." }, { status: error?.status || 500 });
  }
}
