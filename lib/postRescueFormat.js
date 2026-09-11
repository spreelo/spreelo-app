export const POST_RESCUE_TYPES = Object.freeze({
  SINGLE_PRODUCT: "single_product",
  PRODUCT_CAROUSEL: "product_carousel",
  PRODUCT_REEL: "product_reel",
  AI_PRODUCT_VIDEO: "ai_product_video",
  SOURCE_RESEARCH: "source_research",
});

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function resolvePostRescueType(source = {}) {
  const contentType = normalize(
    source?.content_type_id ||
      source?.post_type ||
      source?.content_type_label ||
      source?.work_item?.content_type_id ||
      source?.work_item?.content_type_label
  );
  const format = normalize(
    source?.content_format || source?.work_item?.content_format
  );

  if (contentType === "ai_product_video") return POST_RESCUE_TYPES.AI_PRODUCT_VIDEO;
  if (contentType === "carousel_website_item" || format === "carousel" || /carousel/.test(contentType)) {
    return POST_RESCUE_TYPES.PRODUCT_CAROUSEL;
  }
  if (contentType === "animated_website_item") return POST_RESCUE_TYPES.PRODUCT_REEL;
  if (
    contentType === "website_item" ||
    contentType === "website_item_text_ad"
  ) {
    return POST_RESCUE_TYPES.SINGLE_PRODUCT;
  }

  return POST_RESCUE_TYPES.SOURCE_RESEARCH;
}

export function getPostRescueProductCount(source = {}, rescueType = resolvePostRescueType(source)) {
  if (rescueType === POST_RESCUE_TYPES.PRODUCT_CAROUSEL) return 5;
  if (
    rescueType === POST_RESCUE_TYPES.SINGLE_PRODUCT ||
    rescueType === POST_RESCUE_TYPES.PRODUCT_REEL ||
    rescueType === POST_RESCUE_TYPES.AI_PRODUCT_VIDEO
  ) {
    return 1;
  }
  return 0;
}

export function isProductRescueType(rescueType) {
  return getPostRescueProductCount({}, rescueType) > 0;
}
