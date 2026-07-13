export const CREDIT_COSTS = Object.freeze({
  CUSTOM_UPLOADED_IMAGE: 1,
  WEBSITE_PRODUCT_IMAGE: 2,
  AI_IMAGE: 3,
  PRODUCT_CAROUSEL: 6,
});

export function getCreditCostForContent(input = {}) {
  const contentTypeId = String(
    input.contentTypeId || input.content_type_id || ""
  ).toLowerCase();
  const contentFormat = String(
    input.contentFormat || input.content_format || ""
  ).toLowerCase();
  const imageSource = String(
    input.imageSource || input.image_source || ""
  ).toLowerCase();
  const usesWebsiteContent = Boolean(
    input.usesWebsiteContent ?? input.uses_website_content
  );
  const generateImage = Boolean(
    input.generateImage ?? input.generate_image
  );

  if (
    contentFormat === "carousel" ||
    contentTypeId === "carousel_website_item" ||
    imageSource === "website_carousel"
  ) {
    return CREDIT_COSTS.PRODUCT_CAROUSEL;
  }

  if (contentTypeId === "manual_prompt" && imageSource === "uploaded") {
    return CREDIT_COSTS.CUSTOM_UPLOADED_IMAGE;
  }

  if (
    usesWebsiteContent ||
    imageSource === "website" ||
    contentTypeId === "website_item"
  ) {
    return CREDIT_COSTS.WEBSITE_PRODUCT_IMAGE;
  }

  if (generateImage || imageSource === "ai" || contentTypeId === "manual_prompt") {
    return CREDIT_COSTS.AI_IMAGE;
  }

  // Spreelo no longer offers planned posts without visual content.
  return CREDIT_COSTS.AI_IMAGE;
}

export function getCreditCostForCampaignSourceMode(sourceMode) {
  const normalized = String(sourceMode || "").toLowerCase();

  if (normalized === "website_carousel") {
    return CREDIT_COSTS.PRODUCT_CAROUSEL;
  }

  if (
    normalized === "website_product" ||
    normalized === "website_service" ||
    normalized === "mixed_campaign_and_website"
  ) {
    return CREDIT_COSTS.WEBSITE_PRODUCT_IMAGE;
  }

  return CREDIT_COSTS.AI_IMAGE;
}
