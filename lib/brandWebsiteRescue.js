export const BRAND_429_RESCUE_STATUS = "rate_limited_rescue";

export const BRAND_429_RESCUE_INTERNAL_MESSAGE =
  "429 Too Many Requests. Website-dependent generation is routed to Spreelo Admin Rescue until an administrator re-enables normal website generation.";

export function isBrand429RescueActive(brandProfile) {
  return String(brandProfile?.website_access_status || "").trim().toLowerCase() === BRAND_429_RESCUE_STATUS;
}

export function buildBrand429RescueUpdate({ enabled, nowIso = new Date().toISOString() } = {}) {
  if (enabled) {
    return {
      website_access_status: BRAND_429_RESCUE_STATUS,
      website_access_status_code: 429,
      website_access_message: BRAND_429_RESCUE_INTERNAL_MESSAGE,
      website_access_checked_at: nowIso,
      updated_at: nowIso,
    };
  }

  return {
    website_access_status: "not_checked",
    website_access_status_code: null,
    website_access_message: null,
    website_access_checked_at: nowIso,
    updated_at: nowIso,
  };
}
