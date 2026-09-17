export const SMART_ONBOARDING_GOALS = Object.freeze(["sell_more", "get_followers", "build_trust"]);
export const SMART_ONBOARDING_POST_COUNTS = Object.freeze([3, 5, 7]);

export function normalizeSmartOnboardingGoal(value, fallback = "build_trust") {
  const normalized = String(value || "").trim().toLowerCase();
  return SMART_ONBOARDING_GOALS.includes(normalized) ? normalized : fallback;
}

export function normalizeSmartOnboardingPostCount(value, fallback = 5) {
  const numeric = Number(value);
  return SMART_ONBOARDING_POST_COUNTS.includes(numeric) ? numeric : fallback;
}

export function getFallbackSmartOnboardingRecommendation({ brandProfile = {}, connectedPlatformCount = 0 } = {}) {
  const hasProducts = brandProfile?.website_product_mode_available === true;
  const hasServices = brandProfile?.website_service_mode_available === true;
  const profileSignals = [
    brandProfile?.business_name,
    brandProfile?.industry,
    brandProfile?.brand_description,
    brandProfile?.target_audience,
    brandProfile?.content_market,
  ].filter((value) => String(value || "").trim()).length;
  const platformCount = Math.max(0, Number(connectedPlatformCount || 0));

  let goalId = "get_followers";
  if (hasProducts) goalId = "sell_more";
  else if (hasServices) goalId = "build_trust";

  let postCount = 3;
  if (profileSignals >= 4 && platformCount >= 1) postCount = 5;
  if (profileSignals >= 5 && platformCount >= 4 && hasProducts) postCount = 7;

  return { goalId, postCount, source: "fallback" };
}
