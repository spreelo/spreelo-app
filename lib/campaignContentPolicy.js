const VALID_CAMPAIGN_SOURCE_MODES = new Set([
  "generic_campaign",
  "mixed_campaign_and_website",
  "website_product",
  "website_service",
  "website_carousel",
  "ai_image_overlay",
  "ai_image_text",
]);

const WEBSITE_SINGLE_SOURCE_MODES = new Set([
  "mixed_campaign_and_website",
  "website_product",
  "website_service",
]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeCampaignSourceMode(value) {
  const normalized = normalizeText(value);
  return VALID_CAMPAIGN_SOURCE_MODES.has(normalized) ? normalized : "";
}

export function campaignAllowsSingleWebsiteProduct(campaign = {}) {
  return Boolean(
    campaign?.website_single_product_post_available === true ||
      campaign?.website_product_mode_available === true ||
      campaign?._brand_website_single_product_post_available === true ||
      campaign?._brand_website_product_mode_available === true
  );
}

export function campaignAllowsWebsiteCarousel(campaign = {}) {
  return Boolean(
    campaign?.website_carousel_mode_available === true ||
      campaign?.website_product_mode_available === true ||
      campaign?._brand_website_carousel_mode_available === true ||
      campaign?._brand_website_product_mode_available === true
  );
}

function getCampaignPolicyText(campaign = {}) {
  return [
    campaign?.title,
    campaign?.description,
    campaign?.campaign_goal,
    campaign?.target_customer_need,
    campaign?.relevance_reason,
    campaign?.prompt_context,
    campaign?.product_selection_guidance,
    campaign?.website_product_selection_hint,
    campaign?.campaign_category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function campaignHasProductIntent(campaign = {}) {
  const hasProductMetadata = [
    campaign?.product_match_terms,
    campaign?.product_search_queries,
    campaign?.campaign_blueprint?.product_match_terms,
    campaign?.campaign_blueprint?.product_search_queries,
  ].some((value) => Array.isArray(value) && value.length > 0);

  if (hasProductMetadata) {
    return true;
  }

  return /shop|store|ecommerce|e-commerce|product|products|gift|gifts|present|sale|discount|offer|commercial|shopping|collection|launch|buy|order|retail|merchandise/.test(
    getCampaignPolicyText(campaign)
  );
}

export function campaignHasProductWebsiteFit(campaign = {}) {
  if (
    !campaignAllowsSingleWebsiteProduct(campaign) &&
    !campaignAllowsWebsiteCarousel(campaign)
  ) {
    return false;
  }

  const fit = normalizeText(campaign?.website_content_fit);
  const strategy = normalizeText(campaign?.website_content_strategy);

  if (fit === "weak" || strategy === "none" || strategy === "service") {
    return false;
  }

  if (strategy === "product") {
    return true;
  }

  if (strategy === "support") {
    return campaignHasProductIntent(campaign);
  }

  return campaignHasProductIntent(campaign) && fit !== "weak";
}

export function getProductCampaignCarouselIndex(total) {
  const safeTotal = Math.max(1, Math.round(Number(total) || 1));

  if (safeTotal < 3) {
    return -1;
  }

  return Math.max(1, Math.min(safeTotal - 2, Math.floor((safeTotal - 1) / 2)));
}

export function resolveProductCampaignSourceMode({
  campaign = {},
  postPlanItem = {},
  index = 0,
  total = 1,
} = {}) {
  if (!campaignHasProductWebsiteFit(campaign)) {
    return "";
  }

  const safeTotal = Math.max(1, Math.round(Number(total) || 1));
  const safeIndex = Math.max(0, Math.min(safeTotal - 1, Math.round(Number(index) || 0)));
  const explicitMode = normalizeCampaignSourceMode(postPlanItem?.content_source_mode);
  const allowsSingle = campaignAllowsSingleWebsiteProduct(campaign);
  const allowsCarousel = campaignAllowsWebsiteCarousel(campaign);
  const carouselIndex = getProductCampaignCarouselIndex(safeTotal);

  // A product-driven plan with at least three posts gets one predictable carousel
  // in the discovery/consideration part of the sequence. This prevents a valid
  // store campaign from accidentally becoming an all-AI-image plan.
  if (allowsCarousel && carouselIndex >= 0 && safeIndex === carouselIndex) {
    return "website_carousel";
  }

  // For very short plans, respect an explicit carousel request when possible.
  if (allowsCarousel && safeTotal < 3 && explicitMode === "website_carousel") {
    return "website_carousel";
  }

  // Do not create a second carousel elsewhere in a longer sequence. Convert an
  // extra AI-requested carousel into a normal website product post instead.
  if (explicitMode === "website_carousel" && allowsSingle) {
    return "website_product";
  }

  if (WEBSITE_SINGLE_SOURCE_MODES.has(explicitMode) && allowsSingle) {
    return explicitMode;
  }

  if (allowsSingle) {
    if (safeTotal === 1) {
      return "website_product";
    }

    if (safeTotal === 2) {
      return safeIndex === 0
        ? explicitMode || "generic_campaign"
        : "website_product";
    }

    // After the discovery carousel, the remaining campaign posts should use
    // concrete products rather than silently reverting to generic AI images.
    if (carouselIndex >= 0 && safeIndex > carouselIndex) {
      return "website_product";
    }
  }

  if (["generic_campaign", "ai_image_overlay", "ai_image_text"].includes(explicitMode)) {
    return explicitMode;
  }

  return "generic_campaign";
}

export function getCampaignContentTypeId(sourceMode) {
  const normalized = normalizeCampaignSourceMode(sourceMode);

  if (normalized === "website_carousel") {
    return "carousel_website_item";
  }

  if (WEBSITE_SINGLE_SOURCE_MODES.has(normalized)) {
    return "website_item";
  }

  return "manual_prompt";
}

export function getCampaignContentFormat(sourceMode) {
  return normalizeCampaignSourceMode(sourceMode) === "website_carousel"
    ? "carousel"
    : "single_image";
}

export function campaignSourceUsesWebsiteContent(sourceMode) {
  const normalized = normalizeCampaignSourceMode(sourceMode);
  return normalized === "website_carousel" || WEBSITE_SINGLE_SOURCE_MODES.has(normalized);
}

export function getCampaignContentTypeLabel(sourceMode, fallbackLabel = "Campaign post") {
  const normalized = normalizeCampaignSourceMode(sourceMode);

  if (normalized === "website_carousel") return "Website carousel";
  if (normalized === "website_product") return "Website product";
  if (normalized === "website_service") return "Website service";
  if (normalized === "mixed_campaign_and_website") return "Campaign + website";
  return fallbackLabel;
}
