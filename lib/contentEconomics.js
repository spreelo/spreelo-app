export const DEFAULT_CONTENT_CREDIT_COSTS = Object.freeze({
  website_item: 10,
  website_item_text_ad: 20,
  animated_website_item: 50,
  ai_product_video: 50,
  carousel_website_item: 20,
  problem_solution: 10,
  tips: 10,
  offer_campaign: 10,
  giveaway: 10,
  focus_source: 10,
  mistakes: 10,
  faq: 10,
  checklist: 10,
  service_focus: 10,
  myth_fact: 10,
  seasonal: 10,
  mini_guide: 10,
  guide_choice: 10,
  engagement_humor: 80,
  manual_prompt: 10,
});

export const DEFAULT_CONTENT_CREDIT_VARIANTS = Object.freeze({
  engagement_humor: Object.freeze({
    ai_video: 80,
    ai_image: 10,
    product_image: 10,
  }),
});

export const DEFAULT_REFERENCE_CREDIT_VALUE_SEK = 1.7;

export function getDefaultContentCreditVariantCost(contentTypeId, variantId) {
  const variants = DEFAULT_CONTENT_CREDIT_VARIANTS[String(contentTypeId || "").trim()] || {};
  const value = Number(variants[String(variantId || "").trim()] || 0);
  return value > 0 ? Math.max(1, Math.round(value)) : null;
}

export function getConfiguredContentCreditVariantCost(row, variantId) {
  const key = String(variantId || "").trim();
  if (!key) return getConfiguredContentCreditCost(row);
  const configured = Number(row?.credit_variant_prices?.[key] || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.round(configured));
  return getDefaultContentCreditVariantCost(row?.content_type_id, key) || getConfiguredContentCreditCost(row);
}

export function getConfiguredContentCreditCost(row, now = new Date()) {
  if (!row) return null;

  const currentCost = Math.max(1, Number(row.customer_credit_cost ?? row.credit_cost ?? 0) || 0);
  const pendingCost = Number(row.pending_credit_cost || 0);
  const pendingAt = row.pending_effective_at ? new Date(row.pending_effective_at) : null;

  if (
    pendingCost > 0 &&
    pendingAt &&
    Number.isFinite(pendingAt.getTime()) &&
    pendingAt.getTime() <= now.getTime()
  ) {
    return Math.max(1, Math.round(pendingCost));
  }

  return currentCost || null;
}

export function getDefaultContentCreditCost(contentTypeId) {
  return DEFAULT_CONTENT_CREDIT_COSTS[String(contentTypeId || "").trim()] || 10;
}

export function getMarginSignal({ creditCost, estimatedCostSek, referenceCreditValueSek = DEFAULT_REFERENCE_CREDIT_VALUE_SEK }) {
  const credits = Math.max(0, Number(creditCost || 0));
  const cost = Math.max(0, Number(estimatedCostSek || 0));
  const creditValue = Math.max(0, Number(referenceCreditValueSek || 0));
  const estimatedRevenue = credits * creditValue;

  if (!cost || !estimatedRevenue) {
    return { key: "unknown", ratio: null, estimatedRevenue };
  }

  const ratio = (estimatedRevenue - cost) / estimatedRevenue;
  if (ratio < 0) return { key: "loss", ratio, estimatedRevenue };
  if (ratio < 0.35) return { key: "low", ratio, estimatedRevenue };
  return { key: "healthy", ratio, estimatedRevenue };
}
