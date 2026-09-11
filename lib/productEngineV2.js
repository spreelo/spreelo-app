const QUERY_STOP_WORDS = new Set([
  "using",
  "exact",
  "code",
  "belongs",
  "this",
  "time",
  "limited",
  "apply",
  "enter",
  "checkout",
  "instructions",
  "instruction",
  "coupon",
  "promo",
  "promocode",
  "discountcode",
  "rabattkod",
  "anvand",
  "använd",
  "koden",
  "kod",
]);

// v144.162: product-search vocabulary can be assembled from several AI and
// deterministic metadata layers. Keep internal workflow language out of the
// retailer search box. These patterns are deliberately narrow so real product
// phrases such as "certified refurbished iphone" remain valid while leaked
// orchestration fragments such as "one verified with usable" are rejected.
const INTERNAL_WORKFLOW_QUERY_PATTERNS = [
  /^(?:one|two|three|four|five|\d+)\s+(?:verified|usable|candidate|candidates)\b/i,
  /^verified\s+(?:with|without|usable|product|products|candidate|candidates|item|items|count)\b/i,
  /^usable\s+(?:with|without|product|products|candidate|candidates|item|items|count)\b/i,
  /\b(?:verified|usable|candidate|candidates)\s+count\b/i,
  /\bminimum\s+(?:strong\s+)?(?:product|products|candidate|candidates)\b/i,
  /\b(?:product\s+)?search\s+queries?\b/i,
  /\b(?:selected|ranked)\s+(?:product|products|candidate|candidates)\b/i,
];

const PRODUCT_PATH_PATTERNS = [
  /\/(?:products?|produkt(?:er)?|product-detail|item|artikel)\//i,
  /\/(?:p|pd)\//i,
  /\/collections\/[^/]+\/products\//i,
  /[-_/](?:sku|art|product|produkt|p)[-_]?\d{3,}(?:[-_/]|$)/i,
  // Modern Magento/headless product paths such as Boozt:
  // /se/sv/brand/product-name_33039377/16258962
  /\/[^/?#]+\/[^/?#]+_\d{6,}\/\d{6,}(?:\/|$)/i,
  // Common headless storefront product URLs ending in one or more article
  // identifiers, for example product-name-ab123c456-d11.html. Requiring
  // digits in both identifier segments avoids treating ordinary .html help
  // and editorial pages as products.
  /\/[^/?#]+-[a-z0-9]*\d[a-z0-9]{4,}-[a-z0-9]*\d[a-z0-9]{1,}\.html(?:\/|$)/i,
];

const CATEGORY_PATH_PATTERNS = [
  /\/(?:collections?|categories?|kategori(?:er)?|catalog|katalog)(?:\/|$)/i,
  /\/(?:brands?|varumarken?|varumärke)(?:\/|$)/i,
];

const CAMPAIGN_PATH_PATTERNS = [
  /\/(?:campaign|campaigns|kampanj|kampanjer|sale|rea|offers?|erbjudanden)(?:\/|$)/i,
];

const INTERNAL_API_PATH_PATTERNS = [
  /\/apps?\//i,
  /\/(?:api|ajax|fetch|graphql)(?:\/|$)/i,
  /\.(?:json|xml)(?:$|\?)/i,
];

const SEARCH_PATH_PATTERNS = [
  /\/(?:search|sok|sök|catalogsearch)(?:\/|$|\?)/i,
  /[?&](?:q|query|s|search|search_query)=/i,
];

const ARTICLE_PATH_PATTERNS = [
  /\/(?:blog|blogs|news|nyheter|article|articles|artiklar)(?:\/|$)/i,
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%+&'\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(value, regex) {
  const source = String(value || "");
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  return Array.from(source.matchAll(globalRegex)).length;
}

export function isProductEngineV2Enabled() {
  return String(process.env.PRODUCT_ENGINE_V2 || "true").toLowerCase() !== "false";
}

export function getAdaptiveProductPoolTargets(requiredCount = 5) {
  const count = Math.max(1, Number(requiredCount) || 1);
  return {
    requiredCount: count,
    minimumCandidatePool: Math.max(30, count * 6),
    minimumVerifiedPool: Math.max(8, count + 3),
    reserveCount: Math.max(3, Math.min(count, 5)),
    aiRankLimit: Math.max(18, count * 4),
    finalVerificationLimit: Math.max(12, count * 3),
  };
}

export function isSafeProductSearchQuery(value) {
  const query = normalizeText(value).slice(0, 70);
  if (!query) return false;

  const words = query.split(/\s+/u).filter(Boolean);
  if (!words.length || words.length > 5) return false;
  if (/^\d+$/u.test(query)) return false;
  if (/^[a-z]+\d{2,}$/i.test(query)) return false;

  const stopWordCount = words.filter((word) => QUERY_STOP_WORDS.has(word)).length;
  if (stopWordCount >= Math.max(1, Math.ceil(words.length * 0.5))) return false;

  const looksLikeInstruction =
    /\b(?:use|using|enter|apply|with)\b.*\b(?:code|coupon|discount)\b/i.test(query) ||
    /\b(?:anvand|använd|ange)\b.*\b(?:kod|rabattkod)\b/i.test(query);
  if (looksLikeInstruction) return false;

  if (INTERNAL_WORKFLOW_QUERY_PATTERNS.some((pattern) => pattern.test(query))) {
    return false;
  }

  const hasMeaningfulWord = words.some(
    (word) => word.length >= 4 && !QUERY_STOP_WORDS.has(word) && !/^\d+$/.test(word)
  );

  return hasMeaningfulWord;
}

export function sanitizeProductSearchQueryList(values, limit = 12) {
  const result = [];
  const seen = new Set();

  for (const raw of values || []) {
    const normalized = normalizeText(raw).slice(0, 70);
    if (!isSafeProductSearchQuery(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function detectCommercePlatform({ html = "", url = "" } = {}) {
  const source = `${String(url || "")} ${String(html || "")}`.toLowerCase();

  if (/quickbutik\.com|cdn\.quickbutik\.com|storage\.quickbutik\.com|quickbutik/i.test(source)) {
    return "quickbutik";
  }
  if (/cdn\.shopify\.com|shopify\.theme|shopify-section|myshopify\.com|shopify-payment-button/i.test(source)) {
    return "shopify";
  }
  if (/wp-content\/plugins\/woocommerce|woocommerce-product|wc-ajax|woocommerce/i.test(source)) {
    return "woocommerce";
  }
  // Do not use a loose /mage/ substring. It also matches the end of ordinary
  // "/image/" asset paths and incorrectly labels generic headless stores as
  // Magento. These are concrete Magento runtime signatures.
  if (
    /magento|x-magento-init|data-mage-init|magento_[a-z0-9_]+|\/static\/version\d+\/frontend|\/pub\/static\/frontend|(?:["'(=\s]|^)\/?mage\/(?:cookies|translate|validation|storage|url)/i.test(
      source
    )
  ) {
    return "magento";
  }
  if (/prestashop|ps_shoppingcart|modules\/ps_/i.test(source)) {
    return "prestashop";
  }
  if (/wixstatic\.com|wixstores|wix-code-sdk/i.test(source)) {
    return "wix";
  }
  if (/static1\.squarespace\.com|squarespace-commerce|sqs-add-to-cart-button/i.test(source)) {
    return "squarespace";
  }

  return "generic";
}

export function isLikelyProductDetailUrl(value) {
  let pathname = "";

  try {
    pathname = new URL(String(value || "")).pathname.toLowerCase();
  } catch {
    pathname = String(value || "").toLowerCase();
  }

  return PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

const WEAK_PRODUCT_IDENTITY_TOKENS = new Set([
  "shop",
  "official",
  "online",
  "store",
  "product",
  "products",
  "produkt",
  "produkter",
  "new",
  "sale",
  "outlet",
  "unisex",
  "men",
  "mens",
  "women",
  "womens",
  "herr",
  "dam",
  "kids",
  "kid",
  "barn",
  "junior",
  "true",
  "black",
  "white",
  "grey",
  "gray",
  "blue",
  "green",
  "red",
  "pink",
  "beige",
  "brown",
  "navy",
  "svart",
  "vit",
  "gra",
  "grå",
  "bla",
  "blå",
  "gron",
  "grön",
  "rod",
  "röd",
  "rosa",
  "brun",
  "bts",
]);

function getProductIdentityTokens(value) {
  return normalizeText(value)
    .replace(/[-_/]+/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token &&
        (token.length >= 2 || /^\d$/u.test(token)) &&
        !["shop", "official", "online", "store", "product", "products"].includes(token)
    );
}

function isDistinctiveProductIdentityToken(token) {
  return Boolean(
    token &&
      !WEAK_PRODUCT_IDENTITY_TOKENS.has(token) &&
      (token.length >= 4 || /\d/u.test(token))
  );
}

/**
 * Conservative title identity matching for technical product recovery.
 *
 * Two shared words are not enough: retailer pages commonly repeat brand,
 * campaign and colour words across unrelated products. We require substantial
 * overlap in the full title and at least two distinctive shared identity
 * tokens (or a shared model/number token). This keeps harmless word-order and
 * category suffix differences working while rejecting lookalikes such as
 * "Kipling 100 PENS BTS" vs "Kipling CLASS ROOM BTS".
 */
export function haveProductTitlesIdentityAgreement(leftValue, rightValue) {
  const leftNormalized = normalizeText(leftValue);
  const rightNormalized = normalizeText(rightValue);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const leftList = getProductIdentityTokens(leftValue);
  const rightList = getProductIdentityTokens(rightValue);
  const leftTokens = new Set(leftList);
  const rightTokens = new Set(rightList);

  if (!leftTokens.size || !rightTokens.size) return false;

  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token));
  const matches = sharedTokens.length;
  const minimumSize = Math.min(leftTokens.size, rightTokens.size);
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;

  // A brand-only/category-only result must never prove a concrete product.
  if (minimumSize === 1) {
    return leftTokens.size === 1 && rightTokens.size === 1 && matches === 1;
  }

  const leftModelTokens = new Set(leftList.filter((token) => /\d/u.test(token)));
  const rightModelTokens = new Set(rightList.filter((token) => /\d/u.test(token)));
  const sharedModelTokens = [...leftModelTokens].filter((token) =>
    rightModelTokens.has(token)
  );

  // If both titles name a model/number and those identifiers conflict, fail
  // immediately even when brand/category words happen to overlap.
  if (
    leftModelTokens.size > 0 &&
    rightModelTokens.size > 0 &&
    sharedModelTokens.length === 0
  ) {
    return false;
  }

  const sharedDistinctiveTokens = sharedTokens.filter(
    isDistinctiveProductIdentityToken
  );
  const containment = matches / Math.max(1, minimumSize);
  const jaccard = matches / Math.max(1, unionSize);

  // Retailers often prepend a brand to one title but omit it from Product
  // JSON-LD, or use a more specific category word (for example
  // "dagryggsäck" vs "ryggsäck"). Treat those as harmless only when there
  // is still real shared product-name evidence. This deliberately does not
  // relax the conflicting-model guard above, so "100 PENS" can never become
  // "CLASS ROOM" merely because both titles say Kipling/BTS/black.
  const leftCompact = leftNormalized.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const rightCompact = rightNormalized.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const shorterContained =
    (leftCompact.length >= 5 && rightCompact.includes(leftCompact)) ||
    (rightCompact.length >= 5 && leftCompact.includes(rightCompact));
  if (shorterContained && sharedDistinctiveTokens.length >= 1) {
    return true;
  }

  const fuzzyDistinctiveMatches = [];
  for (const leftToken of leftList.filter(isDistinctiveProductIdentityToken)) {
    for (const rightToken of rightList.filter(isDistinctiveProductIdentityToken)) {
      if (leftToken === rightToken) continue;
      if (
        leftToken.length >= 5 &&
        rightToken.length >= 5 &&
        (leftToken.endsWith(rightToken) || rightToken.endsWith(leftToken))
      ) {
        fuzzyDistinctiveMatches.push([leftToken, rightToken]);
      }
    }
  }
  if (
    sharedDistinctiveTokens.length >= 1 &&
    fuzzyDistinctiveMatches.length >= 1 &&
    (matches + fuzzyDistinctiveMatches.length) / Math.max(1, minimumSize) >= 0.6
  ) {
    return true;
  }

  // A shorter official title may be fully contained in a retailer title with
  // category/colour suffixes, but it still needs real model/name evidence.
  if (
    containment >= 0.8 &&
    matches >= 2 &&
    (sharedDistinctiveTokens.length >= 2 || sharedModelTokens.length >= 1)
  ) {
    return true;
  }

  // Equivalent titles with changed word order or modest merchandising text.
  return (
    matches >= 3 &&
    jaccard >= 0.6 &&
    (sharedDistinctiveTokens.length >= 2 || sharedModelTokens.length >= 1)
  );
}

export function hasConcreteProductPageProof(item = {}) {
  if (item?.concrete_product_verified === true) {
    return true;
  }
  if (item?.concrete_product_verified === false) {
    return false;
  }

  // Compatibility for previously persisted products: established product URL
  // structures remain acceptable. Product cards or Product JSON-LD embedded
  // on a category page are not sufficient on their own.
  return Boolean(
    isLikelyProductDetailUrl(item?.url) ||
      isLikelyProductDetailUrl(item?.product_url) ||
      isLikelyProductDetailUrl(item?.item_url)
  );
}

function getMetaValue(html, names = []) {
  const source = String(html || "");

  for (const name of names) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const normal = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    );
    const match = source.match(normal) || source.match(reversed);
    if (match?.[1]) return String(match[1]).trim();
  }

  return "";
}

function getCanonicalPageUrl(html, pageUrl) {
  const match = String(html || "").match(
    /<link[^>]+rel=["'][^"']*\bcanonical\b[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>|<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i
  );
  const value = match?.[1] || match?.[2] || "";
  if (!value) return "";

  try {
    return new URL(value, pageUrl || value).toString();
  } catch {
    return "";
  }
}

function urlsPointToSamePage(left, right) {
  try {
    const a = new URL(String(left || ""));
    const b = new URL(String(right || ""));
    const normalizePath = (value) =>
      value.pathname.replace(/\/+$/, "").toLowerCase() || "/";
    return (
      a.hostname.replace(/^www\./i, "").toLowerCase() ===
        b.hostname.replace(/^www\./i, "").toLowerCase() &&
      normalizePath(a) === normalizePath(b)
    );
  } catch {
    return false;
  }
}

export function classifyCommercePage({
  html = "",
  url = "",
  productSchemaFound = false,
  ecommerceProofFound = false,
} = {}) {
  const source = String(html || "");
  const normalizedUrl = String(url || "");
  let pathname = "";

  try {
    pathname = new URL(normalizedUrl).pathname.toLowerCase();
  } catch {
    pathname = normalizedUrl.toLowerCase();
  }

  if (INTERNAL_API_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return { pageType: "internal_api", confidence: 100, reason: "internal_api_path" };
  }
  if (SEARCH_PATH_PATTERNS.some((pattern) => pattern.test(normalizedUrl))) {
    return { pageType: "search", confidence: 95, reason: "search_path" };
  }
  if (ARTICLE_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return { pageType: "article", confidence: 95, reason: "article_path" };
  }

  const addToCartCount = countMatches(
    source,
    /(?:add[-_ ]?to[-_ ]?cart|add[-_ ]?to[-_ ]?bag|lägg i varukorg|lagg i varukorg|buy now|product-form|data-product-id|name=["'](?:id|variant|quantity)["'])/gi
  );
  const productCardCount = countMatches(
    source,
    /(?:product-card|product_card|product-item|product_item|product-grid-item|collection-product|data-product-card|itemtype=["']https?:\/\/schema\.org\/Product["'])/gi
  );
  const productLinkCount = countMatches(
    source,
    /href=["'][^"']*\/(?:products?|produkt(?:er)?|product-detail|item)\/[^"'#?]+/gi
  );
  const h1Count = countMatches(source, /<h1\b/gi);
  const hasListingSchema = /["']@type["']\s*:\s*["'](?:ItemList|CollectionPage|SearchResultsPage)["']|["']numberOfItems["']\s*:/i.test(source);
  const directProductPath = isLikelyProductDetailUrl(normalizedUrl);
  const categoryPath = CATEGORY_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  const campaignPath = CAMPAIGN_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  const canonicalUrl = getCanonicalPageUrl(source, normalizedUrl);
  const canonicalMatchesPage = urlsPointToSamePage(canonicalUrl, normalizedUrl);
  const ogType = getMetaValue(source, ["og:type"]).toLowerCase();
  const hasProductOgType = /(?:^|[.:/_-])product(?:$|[.:/_-])/i.test(ogType);
  const hasProductIdentityMeta = Boolean(
    getMetaValue(source, [
      "product:retailer_item_id",
      "product:sku",
      "sku",
      "product:id",
    ])
  );
  const hasMainImageMeta = Boolean(
    getMetaValue(source, ["og:image", "twitter:image"])
  );
  const hasProductMicrodata =
    /itemprop=["'](?:sku|productID|availability)["']|itemtype=["']https?:\/\/schema\.org\/(?:Individual)?Product["']/i.test(
      source
    );
  const hasStrongMainProductMetadata =
    hasProductOgType ||
    (canonicalMatchesPage &&
      hasMainImageMeta &&
      (hasProductIdentityMeta || hasProductMicrodata));

  const looksLikeListing =
    productCardCount >= 4 ||
    productLinkCount >= 6 ||
    (hasListingSchema && (productCardCount >= 2 || productLinkCount >= 2)) ||
    (addToCartCount >= 3 && h1Count <= 2);

  const hasClearMainProduct =
    hasStrongMainProductMetadata ||
    (canonicalMatchesPage &&
      h1Count === 1 &&
      addToCartCount > 0 &&
      hasMainImageMeta) ||
    (directProductPath &&
      (productSchemaFound ||
        ecommerceProofFound ||
        addToCartCount > 0 ||
        hasProductIdentityMeta ||
        hasProductMicrodata ||
        (canonicalMatchesPage && hasMainImageMeta) ||
        h1Count === 1));

  // A real product detail page often contains many recommendation cards below
  // the main product. Strong main-product signals must win over those cards.
  if (hasClearMainProduct) {
    return {
      pageType: "product",
      confidence: productSchemaFound ? 100 : 94,
      reason: looksLikeListing
        ? "product_with_recommendations"
        : productSchemaFound
        ? "product_schema"
        : "product_path_and_purchase_proof",
    };
  }

  // A listing can contain Product JSON-LD for several cards. Do not let the
  // first Product object turn the whole category into one fake product when
  // there is no clear main product.
  if (looksLikeListing) {
    return {
      pageType: campaignPath ? "campaign" : categoryPath ? "category" : "category",
      confidence: 94,
      reason: "multiple_product_cards",
    };
  }

  if (productSchemaFound) {
    return { pageType: "product", confidence: 92, reason: "product_schema" };
  }

  if (campaignPath && !directProductPath) {
    return { pageType: "campaign", confidence: 86, reason: "campaign_path" };
  }
  if (categoryPath && !directProductPath) {
    return { pageType: "category", confidence: 86, reason: "category_path" };
  }

  if (directProductPath && (ecommerceProofFound || addToCartCount > 0)) {
    return { pageType: "product", confidence: 88, reason: "product_path_and_purchase_proof" };
  }

  if (ecommerceProofFound && addToCartCount > 0 && productCardCount <= 1 && productLinkCount <= 3) {
    return { pageType: "product", confidence: 78, reason: "single_purchase_surface" };
  }

  return { pageType: "unknown", confidence: 35, reason: "insufficient_page_type_proof" };
}


export function dedupeProductCandidateQueueRows(rows = []) {
  const byCanonicalUrl = new Map();

  for (const row of rows || []) {
    const canonicalUrl = String(
      row?.canonical_product_url || row?.product_url || ""
    )
      .trim()
      .toLowerCase();
    const brandProfileId = String(row?.brand_profile_id || "").trim();
    if (!canonicalUrl || !brandProfileId) continue;

    const key = `${brandProfileId}|${canonicalUrl}`;
    const existing = byCanonicalUrl.get(key);
    if (!existing) {
      byCanonicalUrl.set(key, row);
      continue;
    }

    const preferred =
      Number(row?.discovery_score || 0) >
      Number(existing?.discovery_score || 0)
        ? row
        : existing;
    const secondary = preferred === row ? existing : row;
    byCanonicalUrl.set(key, {
      ...secondary,
      ...preferred,
      title: preferred?.title || secondary?.title || null,
      image_url: preferred?.image_url || secondary?.image_url || null,
      metadata: {
        ...(secondary?.metadata || {}),
        ...(preferred?.metadata || {}),
      },
    });
  }

  return [...byCanonicalUrl.values()];
}

export function buildProductContentContract(selectedProducts = [], reserveProducts = []) {
  const normalizeItem = (item) => ({
    catalog_id: item?.id || null,
    title: String(item?.title || "").trim(),
    brand: String(
      item?.product_brand || item?.locked_product_brand || item?.brand || ""
    ).trim(),
    product_identifier: String(
      item?.product_identifier || item?.locked_product_identifier || ""
    ).trim(),
    display_product_type: String(
      item?.product_display_type || item?.display_product_type || item?.locked_product_category || item?.category || ""
    ).trim(),
    color: String(
      item?.product_color || item?.locked_product_color || item?.color || ""
    ).trim(),
    product_url: String(item?.url || item?.product_url || "").trim(),
    image_url: String(item?.image_url || "").trim(),
    image_width: Number(item?.product_image_width || 0) || null,
    image_height: Number(item?.product_image_height || 0) || null,
    product_identity_locked: item?.product_identity_locked === true,
    product_identity_fingerprint: String(
      item?.locked_product_fingerprint || ""
    ).trim(),
  });

  return {
    version: "product-engine-v3-locked-object",
    selected_products: (selectedProducts || []).map(normalizeItem).filter((item) => item.title),
    reserve_products: (reserveProducts || []).map(normalizeItem).filter((item) => item.title),
  };
}

export function validateSingleProductCopyAgainstContract({ text = "", selectedProduct = null, reserveProducts = [] } = {}) {
  const content = normalizeText(text);
  const selectedTitle = normalizeText(selectedProduct?.title || "");
  const disallowedMentions = [];

  for (const reserve of reserveProducts || []) {
    const reserveTitle = normalizeText(reserve?.title || "");
    if (!reserveTitle || reserveTitle.length < 5 || reserveTitle === selectedTitle) continue;
    if (content.includes(reserveTitle)) disallowedMentions.push(reserve?.title || reserveTitle);
  }

  return {
    valid: disallowedMentions.length === 0,
    disallowedMentions,
  };
}
