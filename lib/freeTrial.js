import { createHmac } from "crypto";
import { getRegistrableBusinessDomain } from "./stripeBilling.js";

export const SPREELO_FREE_TRIAL_CREDITS = 100;
export const SPREELO_FREE_TRIAL_DAYS = 14;

export const FREE_TRIAL_RESTRICTION_CODES = new Set([
  "trial_social_account_used",
  "trial_account_already_used",
  "trial_business_already_used",
]);

function trialFingerprintSecret() {
  const value = String(process.env.SPREELO_TRIAL_FINGERPRINT_SECRET || "").trim();
  if (!value) {
    throw new Error(
      "Missing SPREELO_TRIAL_FINGERPRINT_SECRET. Configure a stable dedicated secret before enabling Free-trial social verification."
    );
  }
  return value;
}

export function createSocialTrialFingerprint(platform, externalAccountId) {
  const normalizedPlatform = String(platform || "").trim().toLowerCase();
  const normalizedAccountId = String(externalAccountId || "").trim();
  if (!normalizedPlatform || !normalizedAccountId) {
    throw new Error("Verified social account identity is required.");
  }
  return createHmac("sha256", trialFingerprintSecret())
    .update(`${normalizedPlatform}:${normalizedAccountId}`, "utf8")
    .digest("hex");
}

export function createTrialRestrictionError(code, result = null) {
  const error = new Error(code || "trial_social_account_used");
  error.code = code || "trial_social_account_used";
  error.freeTrialRestriction = true;
  error.trialResult = result || null;
  return error;
}

export async function preflightSocialConnectionForTrial({
  supabaseAdmin,
  userId,
  brandProfileId,
  platform,
  externalAccountId,
}) {
  if (!supabaseAdmin || !userId || !brandProfileId) {
    throw new Error("Missing Spreelo account context for social trial preflight.");
  }

  const normalizedPlatform = String(platform || "").trim().toLowerCase();
  const normalizedExternalId = String(externalAccountId || "").trim();
  const fingerprint = createSocialTrialFingerprint(normalizedPlatform, normalizedExternalId);

  const [{ data: brand, error: brandError }, { data: adminBypass, error: adminError }, { data: balance, error: balanceError }] = await Promise.all([
    supabaseAdmin
      .from("brand_profiles")
      .select("id, user_id, website_url, website_product_source_url")
      .eq("id", brandProfileId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin.rpc("spreelo_is_plan_limit_admin", { p_user_id: userId }),
    supabaseAdmin
      .from("user_credit_balances")
      .select("subscription_plan, plan_name, free_trial_status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (brandError) throw brandError;
  if (adminError) throw adminError;
  if (balanceError) throw balanceError;
  if (!brand?.id) throw new Error("Brand profile not found.");
  if (!balance) throw new Error("No Spreelo credit balance exists for this account.");
  if (adminBypass === true) return { allowed: true, reason: "admin" };

  const plan = String(balance.subscription_plan || balance.plan_name || "free").trim().toLowerCase();
  if (["starter", "growth", "pro"].includes(plan)) {
    return { allowed: true, reason: "paid_plan" };
  }

  const { data: socialClaim, error: socialClaimError } = await supabaseAdmin
    .from("trial_social_account_claims")
    .select("user_id, status")
    .eq("platform", normalizedPlatform)
    .eq("account_fingerprint", fingerprint)
    .maybeSingle();
  if (socialClaimError) throw socialClaimError;

  if (socialClaim) {
    if (
      socialClaim.user_id === userId &&
      String(balance.free_trial_status || "locked").toLowerCase() === "active"
    ) {
      return { allowed: true, reason: "same_account_reconnect" };
    }
    if (socialClaim.user_id === userId) {
      throw createTrialRestrictionError("trial_account_already_used", socialClaim);
    }
    throw createTrialRestrictionError("trial_social_account_used", socialClaim);
  }

  if (String(balance.free_trial_status || "locked").toLowerCase() !== "locked") {
    throw createTrialRestrictionError("trial_account_already_used");
  }

  const domainKey = getRegistrableBusinessDomain(
    brand.website_url || brand.website_product_source_url || ""
  );
  if (domainKey) {
    const { data: domainClaim, error: domainClaimError } = await supabaseAdmin
      .from("trial_business_claims")
      .select("user_id, status")
      .eq("domain_key", domainKey)
      .maybeSingle();
    if (domainClaimError) throw domainClaimError;
    if (domainClaim && domainClaim.user_id !== userId) {
      throw createTrialRestrictionError("trial_business_already_used", domainClaim);
    }
  }

  return { allowed: true, reason: "eligible" };
}

export async function authorizeSocialConnectionForTrial({
  supabaseAdmin,
  userId,
  brandProfileId,
  platform,
  externalAccountId,
}) {
  if (!supabaseAdmin || !userId || !brandProfileId) {
    throw new Error("Missing Spreelo account context for social trial authorization.");
  }

  const [{ data: brand, error: brandError }, { data: adminBypass, error: adminError }] = await Promise.all([
    supabaseAdmin
      .from("brand_profiles")
      .select("id, user_id, website_url, website_product_source_url")
      .eq("id", brandProfileId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin.rpc("spreelo_is_plan_limit_admin", { p_user_id: userId }),
  ]);

  if (brandError) throw brandError;
  if (adminError) throw adminError;
  if (!brand?.id) throw new Error("Brand profile not found.");
  if (adminBypass === true) return { allowed: true, reason: "admin", trialActivated: false };

  const { data: balance, error: balanceError } = await supabaseAdmin
    .from("user_credit_balances")
    .select("subscription_plan, plan_name, subscription_status, free_trial_status, free_trial_started_at, free_trial_ends_at, free_trial_credit_amount, credits_remaining")
    .eq("user_id", userId)
    .maybeSingle();
  if (balanceError) throw balanceError;
  if (!balance) throw new Error("No Spreelo credit balance exists for this account.");

  const plan = String(balance.subscription_plan || balance.plan_name || "free").trim().toLowerCase();
  if (["starter", "growth", "pro"].includes(plan)) {
    return { allowed: true, reason: "paid_plan", trialActivated: false };
  }

  const fingerprint = createSocialTrialFingerprint(platform, externalAccountId);
  const domainKey = getRegistrableBusinessDomain(
    brand.website_url || brand.website_product_source_url || ""
  );

  const { data, error } = await supabaseAdmin.rpc("claim_spreelo_social_trial", {
    p_user_id: userId,
    p_brand_profile_id: brandProfileId,
    p_platform: String(platform || "").trim().toLowerCase(),
    p_account_fingerprint: fingerprint,
    p_external_account_id: String(externalAccountId || "").trim(),
    p_domain_key: domainKey || null,
  });
  if (error) throw error;

  const result = data || {};
  if (result.allowed === false) {
    throw createTrialRestrictionError(result.reason, result);
  }
  return result;
}

export async function markFreeTrialUsedForPaidPlan(supabaseAdmin, userId) {
  if (!supabaseAdmin || !userId) return;
  const { error } = await supabaseAdmin.rpc("mark_spreelo_free_trial_used", {
    p_user_id: userId,
  });
  if (error) throw error;
}


export async function refreshFreeTrialStateForUser(supabaseAdmin, userId) {
  if (!supabaseAdmin || !userId) return null;
  const { data: balance, error } = await supabaseAdmin
    .from("user_credit_balances")
    .select("user_id, credits_remaining, purchased_credits_remaining, subscription_plan, plan_name, free_trial_status, free_trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!balance) return null;

  const plan = String(balance.subscription_plan || balance.plan_name || "free").trim().toLowerCase();
  const expiresAt = balance.free_trial_ends_at ? new Date(balance.free_trial_ends_at).getTime() : 0;
  if (balance.free_trial_status !== "active" || !expiresAt || expiresAt > Date.now() || plan !== "free") {
    return balance;
  }

  const total = Math.max(Number(balance.credits_remaining || 0), 0);
  const purchased = Math.min(Math.max(Number(balance.purchased_credits_remaining || 0), 0), total);
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("user_credit_balances")
    .update({
      credits_remaining: purchased,
      monthly_credit_limit: 0,
      free_trial_status: "expired",
      subscription_status: "free",
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;

  await Promise.all([
    supabaseAdmin
      .from("trial_social_account_claims")
      .update({ status: "consumed", trial_ended_at: nowIso, updated_at: nowIso })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabaseAdmin
      .from("trial_business_claims")
      .update({ status: "consumed", trial_ended_at: nowIso, updated_at: nowIso })
      .eq("user_id", userId)
      .in("status", ["pending", "active"]),
    // Do not let promotional credits survive the 14-day window by remaining
    // parked in a future reservation. Free has no recurring-plan entitlement,
    // but clearing every still-reserved rule is the safest fail-closed behavior.
    supabaseAdmin
      .from("automation_rules")
      .update({
        is_active: false,
        plan_state: "ended",
        credit_reservation_status: "released",
        credit_reserved_amount: 0,
        credit_released_at: nowIso,
        queue_locked_until: null,
        retry_not_before: null,
        updated_at: nowIso,
      })
      .eq("user_id", userId)
      .eq("credit_reservation_status", "reserved"),
  ]);
  return updated || balance;
}

export function getTrialRestrictionCode(error) {
  const code = String(error?.code || error?.message || "").trim();
  return FREE_TRIAL_RESTRICTION_CODES.has(code) ? code : "";
}
