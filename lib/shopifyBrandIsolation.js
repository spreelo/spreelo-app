const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function normalizeShopifyIdentity(value) {
  let raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) raw = new URL(raw).hostname.toLowerCase();
  } catch {}
  raw = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/\.$/, "");
  return SHOPIFY_DOMAIN_RE.test(raw) ? raw : "";
}

function exactShopCandidates(brand, webConnection) {
  const brandIdentity = normalizeShopifyIdentity(brand?.website_url);
  const signals = webConnection?.detected_signals || {};
  const derivedFromAppStoreClaim = String(signals?.install_source || "").trim() === "shopify_app_store";

  // brand_profiles.website_url predates/reaches beyond the Shopify connection row
  // and is therefore usable as independent identity evidence. Legacy App Store
  // claim rows are different: the old buggy claim itself wrote their web-data
  // shop_domain, so that value cannot be used to prove the mapping was correct.
  const candidates = brandIdentity ? [brandIdentity] : [];
  if (!derivedFromAppStoreClaim) {
    candidates.push(
      normalizeShopifyIdentity(webConnection?.website_url),
      normalizeShopifyIdentity(signals?.shop_domain)
    );
  }
  return candidates.filter(Boolean);
}

export function brandMatchesExactShopifyShop({ brand, webConnection, shopDomain }) {
  const normalizedShop = normalizeShopifyIdentity(shopDomain);
  if (!normalizedShop || !brand?.id) return false;
  return exactShopCandidates(brand, webConnection).includes(normalizedShop);
}

export function selectExactShopifyBrand({
  brands = [],
  webConnections = [],
  shopDomain,
  preferredBrandProfileId = "",
} = {}) {
  const normalizedShop = normalizeShopifyIdentity(shopDomain);
  if (!normalizedShop) return { match: null, matches: [], normalizedShop: "" };

  const webByBrand = new Map(
    (Array.isArray(webConnections) ? webConnections : [])
      .filter((row) => row?.brand_profile_id)
      .map((row) => [String(row.brand_profile_id), row])
  );
  const matches = (Array.isArray(brands) ? brands : []).filter((brand) =>
    brandMatchesExactShopifyShop({
      brand,
      webConnection: webByBrand.get(String(brand?.id || "")) || null,
      shopDomain: normalizedShop,
    })
  );

  const preferredId = String(preferredBrandProfileId || "").trim();
  const preferred = preferredId
    ? matches.find((brand) => String(brand?.id || "") === preferredId) || null
    : null;

  return {
    match: preferred || (matches.length === 1 ? matches[0] : null),
    matches,
    normalizedShop,
  };
}
