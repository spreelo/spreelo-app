function normalizeTitleKey(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function deriveProductTitleFromUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const rawSlug = pathParts.at(-1) || "";
    const decodedSlug = decodeURIComponent(rawSlug)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!decodedSlug) return "";

    return decodedSlug.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
  } catch {
    return "";
  }
}

export function buildCapabilityEvidenceTitleFrequency(items = []) {
  const frequency = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeTitleKey(item?.title);
    if (!key) continue;
    frequency.set(key, Number(frequency.get(key) || 0) + 1);
  }

  return frequency;
}

export function resolveCapabilityEvidenceTitle(item, titleFrequency = new Map()) {
  const rawTitle = String(item?.title || "").trim();
  const derivedTitle = deriveProductTitleFromUrl(
    item?.canonical_url || item?.url || item?.requested_url
  );
  const repeatedTitleCount = Number(
    titleFrequency.get(normalizeTitleKey(rawTitle)) || 0
  );

  // Capability analysis occasionally captures one site-wide theme/page title
  // for every product. The product URL slug is a better language-independent
  // identity in that case and gives campaign matching useful product words.
  if (derivedTitle && repeatedTitleCount > 1) {
    return derivedTitle;
  }

  return rawTitle || derivedTitle;
}

export function mergeNormalizedProductEvidence(originalItem, normalizedItem) {
  if (!normalizedItem) return null;

  // The normalized item owns canonical title/url/image fields, while the
  // original verified item owns commerce proof. Dropping those proof fields
  // makes a previously verified product fail the next validation pass.
  return {
    ...(originalItem || {}),
    ...normalizedItem,
    product_page_verified: Boolean(
      originalItem?.product_page_verified || normalizedItem?.product_page_verified
    ),
    product_schema_verified: Boolean(
      originalItem?.product_schema_verified || normalizedItem?.product_schema_verified
    ),
    product_json_ld_found: Boolean(
      originalItem?.product_json_ld_found || normalizedItem?.product_json_ld_found
    ),
    product_schema_found: Boolean(
      originalItem?.product_schema_found || normalizedItem?.product_schema_found
    ),
    ecommerce_proof_found: Boolean(
      originalItem?.ecommerce_proof_found || normalizedItem?.ecommerce_proof_found
    ),
    add_to_cart_detected: Boolean(
      originalItem?.add_to_cart_detected || normalizedItem?.add_to_cart_detected
    ),
  };
}
