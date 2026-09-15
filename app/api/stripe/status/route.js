import { getAuthenticatedBillingUser } from "../../../../lib/stripeBilling";
import {
  refreshFreeTrialStateForUser,
  SPREELO_FREE_TRIAL_CREDITS,
  SPREELO_FREE_TRIAL_DAYS,
} from "../../../../lib/freeTrial.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BILLING_SELECT = "credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, current_period_start, current_period_end, credits_renewed_at, next_credit_refresh_at, cancel_at_period_end, payment_provider, provider_customer_id, provider_subscription_id, provider_subscription_schedule_id, subscription_price_amount, subscription_currency, subscription_interval, subscription_price_lookup_key, purchased_credits_remaining, trial_start, trial_end, free_trial_status, free_trial_started_at, free_trial_ends_at, free_trial_credit_amount, pending_subscription_plan, pending_subscription_lookup_key, pending_subscription_effective_at";

export async function GET(request) {
  const context = await getAuthenticatedBillingUser(request);
  if (context.error) return Response.json({ ok: false, error: context.error }, { status: context.status });

  try {
    await refreshFreeTrialStateForUser(context.admin, context.user.id);
  } catch (refreshError) {
    console.warn("Could not refresh free-trial state", { userId: context.user.id, message: refreshError?.message });
  }

  const { data, error } = await context.admin
    .from("user_credit_balances")
    .select(BILLING_SELECT)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const plan = String(data?.subscription_plan || data?.plan_name || "free").trim().toLowerCase();
  const status = String(data?.free_trial_status || (plan === "free" ? "locked" : "used")).toLowerCase();
  const freeTrial = {
    status,
    locked: plan === "free" && status === "locked",
    active: plan === "free" && status === "active",
    expired: status === "expired",
    used: status === "used",
    credits: Number(data?.free_trial_credit_amount || SPREELO_FREE_TRIAL_CREDITS),
    days: SPREELO_FREE_TRIAL_DAYS,
    startedAt: data?.free_trial_started_at || null,
    endsAt: data?.free_trial_ends_at || null,
    cardRequired: false,
  };

  return Response.json({ ok: true, billing: data || null, freeTrial });
}
