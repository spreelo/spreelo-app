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

const STRUCTURED_PRODUCT_CAMPAIGN_CATEGORIES = new Set([
  "gift_campaign",
  "seasonal_campaign",
  "sales_campaign",
  "product_discovery",
  "limited_time_offer",
]);

const STRUCTURED_PRODUCT_ANGLES = new Set([
  "product_discovery",
  "product_push",
  "offer",
]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getFirstExplicitBoolean(...values) {
  return values.find((value) => typeof value === "boolean");
}

function parseStructuredValue(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !["[", "{"].includes(trimmed[0])) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function hasStructuredValues(value) {
  const parsed = parseStructuredValue(value);

  if (Array.isArray(parsed)) {
    return parsed.some((item) => String(item || "").trim().length > 0);
  }

  if (parsed && typeof parsed === "object") {
    return Object.values(parsed).some(hasStructuredValues);
  }

  return false;
}

function getStructuredValues(value) {
  const parsed = parseStructuredValue(value);

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeText).filter(Boolean);
  }

  if (parsed && typeof parsed === "object") {
    return Object.values(parsed).flatMap(getStructuredValues);
  }

  return [];
}

export function normalizeCampaignSourceMode(value) {
  const normalized = normalizeText(value);
  return VALID_CAMPAIGN_SOURCE_MODES.has(normalized) ? normalized : "";
}

export function campaignAllowsSingleWebsiteProduct(campaign = {}) {
  const specificCapability = getFirstExplicitBoolean(
    campaign?.website_single_product_post_available,
    campaign?._brand_website_single_product_post_available
  );

  if (typeof specificCapability === "boolean") {
    return specificCapability;
  }

  return Boolean(
    campaign?.website_product_mode_available === true ||
      campaign?._brand_website_product_mode_available === true
  );
}

export function campaignAllowsWebsiteCarousel(campaign = {}) {
  const specificCapability = getFirstExplicitBoolean(
    campaign?.website_carousel_mode_available,
    campaign?._brand_website_carousel_mode_available
  );

  if (typeof specificCapability === "boolean") {
    return specificCapability;
  }

  return Boolean(
    campaign?.website_product_mode_available === true ||
      campaign?._brand_website_product_mode_available === true
  );
}

export function campaignHasStructuredProductIntent(campaign = {}) {
  const strategy = normalizeText(campaign?.website_content_strategy);

  if (strategy === "product" || strategy === "support") {
    return true;
  }

  if (strategy === "service") {
    return false;
  }

  const blueprint = parseStructuredValue(campaign?.campaign_blueprint) || {};
  const hasProductMatchTerms = [
    campaign?.product_match_terms,
    blueprint?.product_match_terms,
  ].some(hasStructuredValues);
  const hasProductSearchQueries = [
    campaign?.product_search_queries,
    blueprint?.product_search_queries,
  ].some(hasStructuredValues);
  const hasProductMetadata =
    hasProductMatchTerms || hasProductSearchQueries;

  const hasProductGuidance = Boolean(
    String(
      campaign?.product_selection_guidance ||
        campaign?.website_product_selection_hint ||
        blueprint?.product_selection_guidance ||
        ""
    ).trim()
  );

  const campaignCategory = normalizeText(
    campaign?.campaign_category || blueprint?.campaign_category
  );

  if (STRUCTURED_PRODUCT_CAMPAIGN_CATEGORIES.has(campaignCategory)) {
    return true;
  }

  const recommendedAngles = new Set([
    ...getStructuredValues(campaign?.recommended_angles),
    ...getStructuredValues(campaign?.campaign_angles),
    ...getStructuredValues(blueprint?.recommended_angles),
  ]);

  const hasProductAngle = [...recommendedAngles].some((angle) =>
    STRUCTURED_PRODUCT_ANGLES.has(angle)
  );

  // Some older analyses produced generic match terms or a standard
  // product_discovery angle for every campaign. Neither is strong enough on
  // its own. A combination of product metadata and product guidance is an
  // intentional, language-independent signal; a strong website fit plus one
  // of those fields is also sufficient when the old strategy field is stale.
  if (
    (hasProductMatchTerms && hasProductSearchQueries) ||
    (hasProductMetadata && hasProductGuidance) ||
    (normalizeText(campaign?.website_content_fit) === "strong" &&
      (hasProductMetadata || hasProductGuidance))
  ) {
    return true;
  }

  const postPlan = parseStructuredValue(campaign?.post_plan);
  if (Array.isArray(postPlan)) {
    return postPlan.some((item) => {
      const sourceMode = normalizeCampaignSourceMode(item?.content_source_mode);
      const hasExplicitProductSource =
        sourceMode === "website_carousel" ||
        sourceMode === "website_product" ||
        sourceMode === "mixed_campaign_and_website";
      const hasProductTerms = [
        item?.product_match_terms,
        item?.product_search_queries,
      ].some(hasStructuredValues);
      const hasProductGuidance = Boolean(
        String(item?.product_selection_guidance || "").trim()
      );
      const itemHasProductAngle = STRUCTURED_PRODUCT_ANGLES.has(
        normalizeText(item?.marketing_angle)
      );

      return (
        hasExplicitProductSource ||
        ((hasProductTerms || hasProductGuidance) && itemHasProductAngle)
      );
    });
  }

  // Recommended product angles are supporting evidence, but only when the
  // analyzer also supplied concrete product metadata. This avoids treating a
  // standard four-post awareness template as a commercial campaign.
  if (hasProductAngle && hasProductMetadata && strategy !== "none") {
    return true;
  }

  return false;
}

export function campaignHasProductWebsiteFit(campaign = {}) {
  if (
    !campaignAllowsSingleWebsiteProduct(campaign) &&
    !campaignAllowsWebsiteCarousel(campaign)
  ) {
    return false;
  }

  const strategy = normalizeText(campaign?.website_content_strategy);

  // Brand capability decides whether product formats are possible. Structured
  // campaign metadata decides whether they belong in this campaign. Stale
  // weak/none fields cannot veto positive product signals, while capability
  // alone cannot turn a pure information campaign into a sales sequence.
  if (strategy === "service") {
    return false;
  }

  return campaignHasStructuredProductIntent(campaign);
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
  const safeTotal = Math.max(1, Math.round(Number(total) || 1));
  const safeIndex = Math.max(0, Math.min(safeTotal - 1, Math.round(Number(index) || 0)));
  const explicitMode = normalizeCampaignSourceMode(postPlanItem?.content_source_mode);
  const allowsSingle = campaignAllowsSingleWebsiteProduct(campaign);
  const allowsCarousel = campaignAllowsWebsiteCarousel(campaign);
  const hasStoreCapability = allowsSingle || allowsCarousel;
  const strategy = normalizeText(campaign?.website_content_strategy);
  const explicitProductIntent =
    explicitMode === "website_carousel" ||
    explicitMode === "website_product" ||
    explicitMode === "mixed_campaign_and_website";

  if (
    !hasStoreCapability ||
    strategy === "service" ||
    (!campaignHasProductWebsiteFit(campaign) && !explicitProductIntent)
  ) {
    return "";
  }

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
    if (
      explicitMode === "mixed_campaign_and_website" &&
      carouselIndex >= 0 &&
      safeIndex > carouselIndex
    ) {
      return "website_product";
    }

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

    if (!allowsCarousel) {
      return safeIndex >= Math.max(1, Math.floor(safeTotal / 2))
        ? "website_product"
        : explicitMode || "generic_campaign";
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
