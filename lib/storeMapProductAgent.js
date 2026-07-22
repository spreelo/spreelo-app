const DEFAULT_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "with",
  "och", "att", "av", "den", "det", "en", "ett", "för", "från", "i", "med", "och", "om", "på", "som", "till",
  "product", "products", "produkt", "produkter", "shop", "store", "butik", "category", "kategori", "collection", "kollektion",
]);

const PRODUCT_HINT_PATTERNS = [
  /\/(?:products?|produkt(?:er)?|product-detail|item|artikel)\//i,
  /\/collections\/[^/]+\/products\//i,
  /\/(?:p|pd)\//i,
  /[-_/](?:sku|art|product|produkt|p)[-_]?\d{3,}(?:[-_/]|$)/i,
];

const CAMPAIGN_HINT_PATTERNS = [
  /\/(?:campaign|campaigns|kampanj|kampanjer|sale|rea|offers?|erbjudanden|holiday|holidays|occasion|occasions|seasonal)(?:\/|$)/i,
];

const CATEGORY_HINT_PATTERNS = [
  /\/(?:collections?|categories?|category|kategori(?:er)?|catalog|katalog|departments?|shop|store)(?:\/|$)/i,
];

const BRAND_HINT_PATTERNS = [
  /\/(?:brands?|varumarken?|varumärke|manufacturers?)(?:\/|$)/i,
];

const BLOCKED_HINT_PATTERNS = [
  /\/(?:account|login|sign-in|register|cart|checkout|kundvagn|kassa|privacy|integritet|cookies?|terms|villkor|contact|kontakt|about|om-oss|blog|news|nyheter|faq|support)(?:\/|$)/i,
  /\.(?:pdf|zip|jpg|jpeg|png|gif|webp|svg|mp4|mov)(?:$|\?)/i,
  /^(?:mailto|tel|javascript):/i,
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%+&'\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(/\s+/u)
        .filter((token) => token.length >= 3 && !DEFAULT_STOP_WORDS.has(token) && !/^\d+$/.test(token))
    )
  );
}

export function getStoreOriginUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    return `${url.origin}/`;
  } catch {
    return "";
  }
}

export function canonicalizeStoreMapUrl(value, baseUrl = "") {
  try {
    const url = new URL(String(value || "").trim(), baseUrl || undefined);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        /^(?:utm_|mc_)/i.test(key) ||
        /^(?:fbclid|gclid|ref|source|campaign|ord|order|sort|dir|direction|limit|page|p)$/i.test(key)
      ) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return "";
  }
}

export function classifyStoreMapLinkHint({ url = "", text = "", originUrl = "" } = {}) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl || BLOCKED_HINT_PATTERNS.some((pattern) => pattern.test(rawUrl))) {
    return { nodeType: "blocked", confidence: 100, reason: "blocked_path" };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl, originUrl || undefined);
  } catch {
    return { nodeType: "blocked", confidence: 100, reason: "invalid_url" };
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return { nodeType: "blocked", confidence: 100, reason: "unsupported_protocol" };
  }

  if (originUrl) {
    try {
      if (parsed.origin !== new URL(originUrl).origin) {
        return { nodeType: "blocked", confidence: 100, reason: "external_origin" };
      }
    } catch {
      // Keep classifying if the origin hint is malformed.
    }
  }

  const combined = `${parsed.pathname} ${parsed.search} ${normalizeText(text)}`;
  if (PRODUCT_HINT_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { nodeType: "product", confidence: 92, reason: "product_path_hint" };
  }
  if (CAMPAIGN_HINT_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { nodeType: "campaign", confidence: 88, reason: "campaign_path_hint" };
  }
  if (CATEGORY_HINT_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { nodeType: "category", confidence: 84, reason: "category_path_hint" };
  }
  if (BRAND_HINT_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { nodeType: "brand", confidence: 82, reason: "brand_path_hint" };
  }

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const textTokens = tokenize(text);
  if (pathSegments.length >= 1 && pathSegments.length <= 4 && textTokens.length >= 1) {
    return { nodeType: "unknown", confidence: 48, reason: "navigable_internal_link" };
  }

  return { nodeType: "other", confidence: 30, reason: "weak_navigation_hint" };
}

export function extractStoreMapKeywords(...values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    for (const token of tokenize(value)) {
      if (seen.has(token)) continue;
      seen.add(token);
      result.push(token);
      if (result.length >= 40) return result;
    }
  }
  return result;
}

export function buildStoreMapIntent({
  campaignText = "",
  searchQueries = [],
  matchTerms = [],
  avoidTerms = [],
} = {}) {
  const phrases = [];
  const seenPhrases = new Set();
  for (const raw of [campaignText, ...(searchQueries || []), ...(matchTerms || [])]) {
    const normalized = normalizeText(raw);
    if (!normalized || normalized.length < 3 || seenPhrases.has(normalized)) continue;
    seenPhrases.add(normalized);
    phrases.push(normalized);
  }

  const positiveTokens = extractStoreMapKeywords(campaignText, ...(searchQueries || []), ...(matchTerms || []));
  const negativeTokens = extractStoreMapKeywords(...(avoidTerms || []));

  return {
    phrases: phrases.slice(0, 24),
    positiveTokens: positiveTokens.slice(0, 50),
    negativeTokens: negativeTokens.slice(0, 30),
  };
}

export function scoreStoreMapNodeForIntent(node, intent = {}) {
  const nodeText = normalizeText([
    node?.title,
    node?.summary,
    node?.url,
    ...(Array.isArray(node?.keywords) ? node.keywords : []),
  ].filter(Boolean).join(" "));
  if (!nodeText) return -1000;

  let score = 0;
  const nodeType = String(node?.node_type || node?.nodeType || "unknown").toLowerCase();
  if (nodeType === "campaign") score += 90;
  else if (nodeType === "category") score += 70;
  else if (nodeType === "brand") score += 35;
  else if (nodeType === "unknown") score += 15;
  else if (nodeType === "product") score -= 30;
  else score -= 10;

  const titleText = normalizeText(node?.title || "");
  const urlText = normalizeText(node?.url || "");

  for (const phrase of intent?.phrases || []) {
    if (!phrase || phrase.length < 3) continue;
    if (titleText.includes(phrase)) score += 90;
    else if (urlText.includes(phrase)) score += 70;
    else if (nodeText.includes(phrase)) score += 45;
  }

  for (const token of intent?.positiveTokens || []) {
    if (!token) continue;
    if (titleText.includes(token)) score += 18;
    else if (urlText.includes(token)) score += 14;
    else if (nodeText.includes(token)) score += 7;
  }

  for (const token of intent?.negativeTokens || []) {
    if (token && nodeText.includes(token)) score -= 55;
  }

  const productCount = Number(node?.product_link_count || node?.productLinkCount || 0);
  if (productCount > 0) score += Math.min(50, productCount * 3);
  const childCount = Number(node?.child_link_count || node?.childLinkCount || 0);
  if (childCount > 0) score += Math.min(20, childCount);

  const confidence = Number(node?.node_type_confidence || node?.confidence || 0);
  score += Math.min(20, Math.max(0, confidence) / 5);

  return Math.round(score);
}

export function rankStoreMapNodes(nodes, intent, limit = 12) {
  return (nodes || [])
    .filter((node) => node && !["blocked", "product", "other", "internal_api", "search", "article"].includes(String(node.node_type || node.nodeType || "").toLowerCase()))
    .map((node) => ({ ...node, store_map_intent_score: scoreStoreMapNodeForIntent(node, intent) }))
    .sort((a, b) => {
      const scoreDelta = Number(b.store_map_intent_score || 0) - Number(a.store_map_intent_score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      const productDelta = Number(b.product_link_count || 0) - Number(a.product_link_count || 0);
      if (productDelta !== 0) return productDelta;
      return String(a.title || a.url || "").localeCompare(String(b.title || b.url || ""));
    })
    .slice(0, Math.max(1, Number(limit) || 12));
}

export function dedupeStoreMapNodes(nodes) {
  const byUrl = new Map();
  for (const rawNode of nodes || []) {
    const url = canonicalizeStoreMapUrl(rawNode?.url || rawNode?.canonical_url || "");
    if (!url) continue;
    const existing = byUrl.get(url);
    const node = { ...rawNode, url, canonical_url: url };
    if (!existing) {
      byUrl.set(url, node);
      continue;
    }

    byUrl.set(url, {
      ...existing,
      ...node,
      title: node.title || existing.title || "",
      summary: node.summary || existing.summary || "",
      node_type: node.node_type && node.node_type !== "unknown" ? node.node_type : existing.node_type,
      node_type_confidence: Math.max(Number(existing.node_type_confidence || 0), Number(node.node_type_confidence || 0)),
      product_link_count: Math.max(Number(existing.product_link_count || 0), Number(node.product_link_count || 0)),
      child_link_count: Math.max(Number(existing.child_link_count || 0), Number(node.child_link_count || 0)),
      keywords: Array.from(new Set([...(existing.keywords || []), ...(node.keywords || [])])).slice(0, 40),
      metadata: { ...(existing.metadata || {}), ...(node.metadata || {}) },
      last_crawled_at: node.last_crawled_at || existing.last_crawled_at || null,
      created_at: existing.created_at || node.created_at || null,
      updated_at: node.updated_at || existing.updated_at || null,
    });
  }
  return Array.from(byUrl.values());
}

export function shouldRefreshStoreMap(nodes, { minimumNodes = 6, maxAgeHours = 72 } = {}) {
  const usable = (nodes || []).filter((node) => node?.url && !["blocked", "other"].includes(String(node.node_type || "")));
  if (usable.length < minimumNodes) return true;

  const newestTimestamp = usable.reduce((latest, node) => {
    const timestamp = Date.parse(node?.last_crawled_at || node?.updated_at || node?.created_at || "");
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  if (!newestTimestamp) return true;
  return Date.now() - newestTimestamp > maxAgeHours * 60 * 60 * 1000;
}

export function getStoreMapAgentTargets(requiredCount = 5) {
  const count = Math.max(1, Number(requiredCount) || 1);
  const isCarouselScale = count >= 5;
  return {
    requiredCount: count,
    reserveCount: isCarouselScale ? Math.max(count, 5) : 3,
    minimumVerifiedProducts: isCarouselScale
      ? Math.max(20, count * 4)
      : Math.max(4, count + 3),
    mapCrawlPageLimit: isCarouselScale ? Math.max(12, count * 3) : 8,
    mapDepthLimit: 3,
    shelfSelectionLimit: isCarouselScale
      ? Math.max(4, Math.min(6, count + 1))
      : 3,
    shelfProductLimit: isCarouselScale ? Math.max(20, count * 4) : 8,
    mapNodeLimit: 600,
  };
}
