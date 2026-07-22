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

const PRODUCT_PATH_PATTERNS = [
  /\/(?:products?|produkt(?:er)?|product-detail|item|artikel)\//i,
  /\/(?:p|pd)\//i,
  /\/collections\/[^/]+\/products\//i,
  /[-_/](?:sku|art|product|produkt|p)[-_]?\d{3,}(?:[-_/]|$)/i,
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
  if (/mage\/|magento|static\/version\d+\/frontend/i.test(source)) {
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
  const directProductPath = PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  const categoryPath = CATEGORY_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  const campaignPath = CAMPAIGN_PATH_PATTERNS.some((pattern) => pattern.test(pathname));

  const looksLikeListing =
    productCardCount >= 4 ||
    productLinkCount >= 6 ||
    (hasListingSchema && (productCardCount >= 2 || productLinkCount >= 2)) ||
    (addToCartCount >= 3 && h1Count <= 2);

  // A listing can contain Product JSON-LD for several cards. Do not let the
  // first Product object turn the whole category into one fake product.
  if (looksLikeListing && !directProductPath) {
    return {
      pageType: campaignPath ? "campaign" : categoryPath ? "category" : "category",
      confidence: 94,
      reason: "multiple_product_cards",
    };
  }

  if (productSchemaFound) {
    return { pageType: "product", confidence: 100, reason: "product_schema" };
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

function extractNumericPrice(value) {
  const match = String(value || "")
    .replace(/\s/g, "")
    .match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  const numeric = Number(match[1].replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

export function sanitizeCatalogPrice({ price = "", html = "", source = "" } = {}) {
  const value = String(price || "").trim();
  if (!value) return { price: "", rejectedReason: "missing" };

  const numeric = extractNumericPrice(value);
  if (numeric === null || numeric <= 0) {
    return { price: "", rejectedReason: "zero_or_invalid" };
  }

  const compactPrice = value.toLowerCase().replace(/\s+/g, " ");
  if (/\b(?:per month|\/month|\/manad|\/månad|delbetalning|installment)\b/i.test(compactPrice)) {
    return { price: "", rejectedReason: "installment_price" };
  }
  if (/%/.test(compactPrice)) {
    return { price: "", rejectedReason: "percentage_not_product_price" };
  }

  const visibleText = String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const amountDigits = String(Math.trunc(numeric));
  const shippingRegex = new RegExp(
    `(?:fri\\s+frakt|free\\s+shipping|fraktfritt|gratis\\s+frakt)[^.!?]{0,90}${amountDigits}|${amountDigits}[^.!?]{0,90}(?:fri\\s+frakt|free\\s+shipping|fraktfritt|gratis\\s+frakt)`,
    "i"
  );

  if (shippingRegex.test(visibleText)) {
    return { price: "", rejectedReason: "shipping_threshold" };
  }

  if (String(source || "").includes("visible") && numeric >= 500 && /fri\s+frakt|free\s+shipping/i.test(visibleText)) {
    const escaped = amountDigits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nearby = new RegExp(`(?:fri\\s+frakt|free\\s+shipping)[^.!?]{0,120}${escaped}`, "i");
    if (nearby.test(visibleText)) {
      return { price: "", rejectedReason: "shipping_threshold" };
    }
  }

  return { price: value, rejectedReason: "" };
}

export function buildProductContentContract(selectedProducts = [], reserveProducts = []) {
  const normalizeItem = (item) => ({
    catalog_id: item?.id || null,
    title: String(item?.title || "").trim(),
    product_url: String(item?.url || item?.product_url || "").trim(),
    image_url: String(item?.image_url || "").trim(),
    price: String(item?.price || "").trim(),
  });

  return {
    version: "product-engine-v2",
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
