export const PLAN_ENTITLEMENTS = Object.freeze({
  free: Object.freeze({
    key: "free",
    name: "Free",
    brands: 1,
    socialAccounts: 1,
    recurringPlans: 0,
  }),
  starter: Object.freeze({
    key: "starter",
    name: "Starter",
    brands: 1,
    socialAccounts: 1,
    recurringPlans: 1,
  }),
  growth: Object.freeze({
    key: "growth",
    name: "Growth",
    brands: 2,
    socialAccounts: 5,
    recurringPlans: 3,
  }),
  pro: Object.freeze({
    key: "pro",
    name: "Pro",
    brands: 5,
    socialAccounts: null, // Unlimited per brand.
    recurringPlans: 8,
  }),
});

export const PLAN_LIMIT_RESOURCES = Object.freeze({
  brands: "brands",
  socialAccounts: "socialAccounts",
  recurringPlans: "recurringPlans",
});

export function normalizeEntitlementPlanKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^plan\s*:\s*/i, "")
    .replace(/\s+trial$/i, "");
  return PLAN_ENTITLEMENTS[normalized] ? normalized : "free";
}

export function getPlanEntitlements(value) {
  return PLAN_ENTITLEMENTS[normalizeEntitlementPlanKey(value)] || PLAN_ENTITLEMENTS.free;
}

export function getPlanDisplayName(value) {
  return getPlanEntitlements(value).name;
}

export function isUnlimitedPlanResource(value) {
  return value === null || value === Number.POSITIVE_INFINITY || String(value).toLowerCase() === "unlimited";
}

export function getRecommendedPlanForResource(planValue, resource) {
  const currentKey = normalizeEntitlementPlanKey(planValue);
  const currentValue = getPlanEntitlements(currentKey)?.[resource];
  if (isUnlimitedPlanResource(currentValue)) return null;

  const currentLimit = Number(currentValue || 0);
  const order = ["starter", "growth", "pro"];
  const currentIndex = Math.max(-1, order.indexOf(currentKey));

  for (let index = currentIndex + 1; index < order.length; index += 1) {
    const candidate = PLAN_ENTITLEMENTS[order[index]];
    const candidateValue = candidate?.[resource];
    if (isUnlimitedPlanResource(candidateValue) || Number(candidateValue || 0) > currentLimit) return candidate;
  }

  return null;
}

export function buildPlanLimitDetails({ plan, resource, current = 0, limit = undefined } = {}) {
  const entitlements = getPlanEntitlements(plan);
  const entitlementValue = entitlements?.[resource];
  const resolvedValue = limit === undefined ? entitlementValue : limit;
  const unlimited = isUnlimitedPlanResource(resolvedValue);
  const resolvedLimit = unlimited ? null : Number(resolvedValue || 0);
  const recommended = getRecommendedPlanForResource(entitlements.key, resource);
  const recommendedValue = recommended?.[resource];
  const recommendedUnlimited = Boolean(recommended && isUnlimitedPlanResource(recommendedValue));
  return {
    code: "plan_limit_reached",
    resource,
    plan: entitlements.key,
    planName: entitlements.name,
    current: Number(current || 0),
    limit: resolvedLimit,
    unlimited,
    recommendedPlan: recommended?.key || null,
    recommendedPlanName: recommended?.name || null,
    recommendedLimit: recommended ? (recommendedUnlimited ? null : Number(recommendedValue || 0)) : null,
    recommendedUnlimited,
  };
}

export function parsePlanLimitDatabaseError(error) {
  const message = String(error?.message || error || "");
  const match = message.match(/SPREELO_PLAN_LIMIT\|([^|]+)\|(\d+)\|([^|\s]+)/i);
  if (!match) return null;
  const [, rawResource, rawLimit, rawPlan] = match;
  const resourceMap = {
    brands: "brands",
    social_accounts: "socialAccounts",
    recurring_plans: "recurringPlans",
  };
  const resource = resourceMap[String(rawResource || "").toLowerCase()] || rawResource;
  return buildPlanLimitDetails({
    plan: rawPlan,
    resource,
    current: Number(rawLimit || 0),
    limit: Number(rawLimit || 0),
  });
}

export function getRecurringPlanGroupKey(rule) {
  const createdMinute = String(rule?.created_at || "").slice(0, 16);
  const name = String(rule?.name || rule?.content_type_label || rule?.post_type || "").trim();
  const scheduleType = String(rule?.schedule_type || "").trim();
  const source = String(rule?.queue_source || "studio").trim() || "studio";
  return [name, scheduleType, source, createdMinute].join("|");
}

export function countActiveRecurringPlanGroups(rules = []) {
  const keys = new Set();
  for (const rule of rules || []) {
    if (String(rule?.schedule_type || "").toLowerCase() !== "weekly") continue;
    if (rule?.is_active === false) continue;
    if (String(rule?.plan_state || "active").toLowerCase() === "ended") continue;
    if (String(rule?.queue_source || "studio").toLowerCase() === "campaign") continue;
    keys.add(getRecurringPlanGroupKey(rule));
  }
  return keys.size;
}

export async function loadPlanUsage(db, userId, { brandProfileId = null } = {}) {
  if (!db || !userId) throw new Error("Could not load Spreelo plan usage.");

  let socialQuery = db
    .from("social_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "connected");
  let recurringQuery = db
    .from("automation_rules")
    .select("id, name, content_type_label, post_type, schedule_type, queue_source, created_at, is_active, plan_state, brand_profile_id")
    .eq("user_id", userId)
    .eq("schedule_type", "weekly")
    .eq("is_active", true);

  if (brandProfileId) {
    socialQuery = socialQuery.eq("brand_profile_id", brandProfileId);
    recurringQuery = recurringQuery.eq("brand_profile_id", brandProfileId);
  }

  const [billingResult, brandsResult, socialResult, recurringResult] = await Promise.all([
    db
      .from("user_credit_balances")
      .select("subscription_plan, plan_name, subscription_status")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("brand_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    socialQuery,
    recurringQuery,
  ]);

  const firstError = billingResult.error || brandsResult.error || socialResult.error || recurringResult.error;
  if (firstError) throw firstError;

  const planKey = normalizeEntitlementPlanKey(
    billingResult.data?.subscription_plan || billingResult.data?.plan_name || "free"
  );
  const limits = getPlanEntitlements(planKey);
  const recurringPlans = countActiveRecurringPlanGroups(recurringResult.data || []);

  return {
    plan: planKey,
    planName: limits.name,
    subscriptionStatus: String(billingResult.data?.subscription_status || "").toLowerCase(),
    brandProfileId: brandProfileId || null,
    resourceScope: brandProfileId ? "brand" : "account",
    limits: {
      brands: limits.brands,
      socialAccounts: limits.socialAccounts,
      recurringPlans: limits.recurringPlans,
    },
    usage: {
      brands: Number(brandsResult.count || 0),
      socialAccounts: Number(socialResult.count || 0),
      recurringPlans,
    },
  };
}

export async function checkPlanResourceCapacity(db, userId, resource, { brandProfileId = null } = {}) {
  const usage = await loadPlanUsage(db, userId, { brandProfileId });
  const current = Number(usage.usage?.[resource] || 0);
  const rawLimit = usage.limits?.[resource];
  if (isUnlimitedPlanResource(rawLimit)) return { allowed: true, ...usage, unlimited: true };
  const limit = Number(rawLimit || 0);
  if (current < limit) return { allowed: true, ...usage };
  return {
    allowed: false,
    ...usage,
    limitDetails: buildPlanLimitDetails({ plan: usage.plan, resource, current, limit }),
  };
}

export async function checkSocialConnectionCapacity(db, userId, { brandProfileId, platform } = {}) {
  if (brandProfileId && platform) {
    const { data: existing, error } = await db
      .from("social_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("brand_profile_id", brandProfileId)
      .eq("platform", platform)
      .eq("status", "connected")
      .limit(1);
    if (error) throw error;
    if ((existing || []).length > 0) {
      const usage = await loadPlanUsage(db, userId, { brandProfileId });
      return { allowed: true, replacingExisting: true, ...usage };
    }
  }
  return checkPlanResourceCapacity(db, userId, PLAN_LIMIT_RESOURCES.socialAccounts, { brandProfileId });
}
