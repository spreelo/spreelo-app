export const WEBSITE_PRODUCT_MODE_MIN_LOCAL_ITEMS = 1;
export const WEBSITE_PRODUCT_MODE_DISCOVERY_TARGET_ITEMS = 5;
export const WEBSITE_PRODUCT_MODE_MAX_CANDIDATES = 20;
export const WEBSITE_PRODUCT_MODE_RETRY_LIMIT = 12;
export const WEBSITE_PRODUCT_DETECTOR_VERSION = "v10";

export function decideWebsiteProductCapability({
  verifiedCount,
  completedProbeCount,
  checkedUrlCount,
  webSearchCompleted,
}) {
  const verified = Math.max(0, Number(verifiedCount || 0));
  const completed = Math.max(0, Number(completedProbeCount || 0));
  const checked = Math.max(0, Number(checkedUrlCount || 0));
  const available = verified >= WEBSITE_PRODUCT_MODE_MIN_LOCAL_ITEMS;
  const minimumDecisiveCompletedProbes = Math.min(
    WEBSITE_PRODUCT_MODE_DISCOVERY_TARGET_ITEMS,
    checked
  );
  const decisiveNoProductEvidence = Boolean(
    webSearchCompleted &&
    (checked === 0 || completed >= minimumDecisiveCompletedProbes)
  );

  return {
    available,
    productCarouselAvailable: available,
    status: available
      ? "confirmed"
      : decisiveNoProductEvidence
        ? "not_found"
        : "inconclusive",
    needsMoreDiscovery:
      verified < WEBSITE_PRODUCT_MODE_DISCOVERY_TARGET_ITEMS,
    minimumDecisiveCompletedProbes,
  };
}
