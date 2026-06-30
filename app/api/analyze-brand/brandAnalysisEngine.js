import OpenAI from "openai";

export const WEBSITE_FETCH_TIMEOUT_MS = 12000;
export const WEBSITE_MAX_TEXT_CHARS = 18000;
export const WEBSITE_MAX_PRODUCT_SOURCE_PAGES = 1;
export const WEBSITE_MAX_PRODUCT_SOURCE_FETCH_TIMEOUT_MS = 3000;
export const WEBSITE_MAX_PRODUCT_SOURCE_TEXT_CHARS = 3000;
export const MAX_CAMPAIGN_OPPORTUNITIES = 25;

export function normalizeWebsiteUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (
    trimmedValue.startsWith("http://") ||
    trimmedValue.startsWith("https://")
  ) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

export function inferMarketSetup({
  contentMarket,
  countryCode,
  contentLanguage,
}) {
  const providedMarket = String(contentMarket || "").trim();
  const providedCountryCode = String(countryCode || "").trim().toUpperCase();
  const providedLanguage = String(contentLanguage || "").trim();

  return {
    contentMarket: providedMarket,
    countryCode: providedCountryCode,
    contentLanguage: providedLanguage,
  };
}

export function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getHostnameWithoutWww(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isSameRootDomainOrSubdomain(candidateUrl, websiteUrl) {
  const candidateHost = getHostnameWithoutWww(candidateUrl);
  const websiteHost = getHostnameWithoutWww(websiteUrl);

  if (!candidateHost || !websiteHost) {
    return false;
  }

  return (
    candidateHost === websiteHost ||
    candidateHost.endsWith(`.${websiteHost}`) ||
    websiteHost.endsWith(`.${candidateHost}`)
  );
}

export function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

export function stripHtmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function stripHtmlToLanguageText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function getMetaContent(html, propertyNames) {
  for (const name of propertyNames) {
    const propertyRegex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );

    const propertyMatch = String(html || "").match(propertyRegex);

    if (propertyMatch?.[1]) {
      return decodeHtmlEntities(propertyMatch[1]);
    }

    const reversedRegex = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i"
    );

    const reversedMatch = String(html || "").match(reversedRegex);

    if (reversedMatch?.[1]) {
      return decodeHtmlEntities(reversedMatch[1]);
    }
  }

  return "";
}

export function extractPageTitle(html) {
  const ogTitle = getMetaContent(html, ["og:title", "twitter:title"]);

  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch = String(html || "").match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  }

  return "";
}

export function extractMetaDescription(html) {
  return getMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);
}

export function truncateText(value, maxLength) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value || "").match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function repairJsonWithOpenAI({
  openai,
  rawContent,
  expectedShapeDescription,
  contextLabel = "OpenAI JSON response",
}) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You repair invalid JSON. Return valid JSON only. Do not use markdown. Do not explain anything.",
      },
      {
        role: "user",
        content: `
The following ${contextLabel} was supposed to be valid JSON, but it may be malformed, truncated, wrapped in markdown, contain comments, contain trailing commas, or contain text outside the JSON.

Repair it into valid JSON.

Expected JSON shape:
${expectedShapeDescription}

Important rules:
- Return JSON only.
- Do not add markdown.
- Do not add explanations.
- Preserve the original meaning as much as possible.
- If a field is missing, use a safe empty value such as "", false, null or [] depending on the expected shape.
- Do not invent detailed business facts that are not present in the original response.

Original response:
${truncateText(rawContent, 60000)}
`.trim(),
      },
    ],
    temperature: 0,
  });

  const repairedContent = completion.choices?.[0]?.message?.content || "";

  return safeJsonParse(repairedContent);
}

export async function parseOpenAIJsonWithRepair({
  openai,
  content,
  expectedShapeDescription,
  contextLabel,
}) {
  const parsed = safeJsonParse(content);

  if (parsed) {
    return parsed;
  }

  console.warn("OpenAI JSON parse failed. Trying JSON repair.", {
    contextLabel,
    preview: truncateText(content, 500),
  });

  const repairedParsed = await repairJsonWithOpenAI({
    openai,
    rawContent: content,
    expectedShapeDescription,
    contextLabel,
  });

  if (repairedParsed) {
    return repairedParsed;
  }

  console.error("OpenAI JSON repair failed.", {
    contextLabel,
    preview: truncateText(content, 500),
  });

  return null;
}

export function createOpenAIClient() {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  return new OpenAI({
    apiKey: openaiApiKey,
  });
}

function safeDecodeUrlPart(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function getPathSegments(value) {
  try {
    const url = new URL(value);

    return safeDecodeUrlPart(url.pathname)
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasBlockedFileExtension(pathname) {
  return /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|pdf|zip|rar|7z|mp4|mov|avi|mp3|wav|woff|woff2|ttf|eot)$/i.test(
    pathname
  );
}

function isLikelyTechnicalPage(cleanUrl) {
  try {
    const url = new URL(cleanUrl);
    const pathname = safeDecodeUrlPart(url.pathname).toLowerCase();

    if (!pathname || pathname === "/") {
      return true;
    }

    if (hasBlockedFileExtension(pathname)) {
      return true;
    }

    const technicalRoutePatterns = [
      "/wp-admin",
      "/wp-login",
      "/admin",
      "/login",
      "/signin",
      "/sign-in",
      "/account",
      "/cart",
      "/checkout",
      "/sitemap",
      "/robots",
      "/feed",
      "/rss",
      "/cdn-cgi",
    ];

    return technicalRoutePatterns.some(
      (pattern) =>
        pathname === pattern ||
        pathname.startsWith(`${pattern}/`) ||
        pathname.includes(`${pattern}/`)
    );
  } catch {
    return true;
  }
}

function countPatternMatches(value, pattern) {
  const matches = String(value || "").match(pattern);

  return matches ? matches.length : 0;
}

export function extractProductSourceLinks(html, pageUrl) {
  const links = [];
  const seen = new Set();

  const linkRegex =
    /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;
  let linkIndex = 0;

  while ((match = linkRegex.exec(String(html || ""))) !== null) {
    const beforeHrefAttributes = match[1] || "";
    const href = match[2] || "";
    const afterHrefAttributes = match[3] || "";
    const rawInnerHtml = match[4] || "";

    const resolvedUrl = resolveUrl(href, pageUrl);

    if (!resolvedUrl || !isHttpUrl(resolvedUrl)) {
      continue;
    }

    if (!isSameRootDomainOrSubdomain(resolvedUrl, pageUrl)) {
      continue;
    }

    const cleanUrl = resolvedUrl.split("#")[0];

    if (seen.has(cleanUrl)) {
      continue;
    }

    seen.add(cleanUrl);

    if (isLikelyTechnicalPage(cleanUrl)) {
      continue;
    }

    const urlText = safeDecodeUrlPart(cleanUrl);
    const attributesText = `${beforeHrefAttributes} ${afterHrefAttributes}`;
    const linkText = stripHtmlToText(`${attributesText} ${rawInnerHtml}`);
    const combinedRaw = `${urlText} ${attributesText} ${rawInnerHtml} ${linkText}`;

    const pathSegments = getPathSegments(cleanUrl);
    const candidateHost = getHostnameWithoutWww(cleanUrl);
    const pageHost = getHostnameWithoutWww(pageUrl);

    let score = 0;

    if (pathSegments.length >= 1 && pathSegments.length <= 4) {
      score += 4;
    }

    if (pathSegments.length >= 2 && pathSegments.length <= 5) {
      score += 3;
    }

    if (candidateHost && pageHost && candidateHost !== pageHost) {
      score += 8;
    }

    if (/<img\b/i.test(rawInnerHtml)) {
      score += 8;
    }

    if (/\p{Sc}/u.test(combinedRaw)) {
      score += 10;
    }

    if (
      /\b\d+([.,]\d{2})?\b/.test(combinedRaw) &&
      /\p{Sc}|price|amount|sale|sku|data-price|data-product|product-id|itemprop/i.test(
        combinedRaw
      )
    ) {
      score += 8;
    }

    if (
      /schema\.org|Product|Offer|AggregateOffer|itemprop|data-product|product-id|variant-id|sku/i.test(
        combinedRaw
      )
    ) {
      score += 10;
    }

    if (linkText.length >= 2 && linkText.length <= 180) {
      score += 2;
    }

    if (linkIndex < 30) {
      score += Math.max(0, 6 - Math.floor(linkIndex / 5));
    }

    if (pathSegments.length > 6) {
      score -= 6;
    }

    if (countPatternMatches(cleanUrl, /\?/g) > 1) {
      score -= 4;
    }

    if (score > 0) {
      links.push({
        url: cleanUrl,
        text: linkText,
        score,
      });
    }

    linkIndex += 1;
  }

  return links.sort((a, b) => b.score - a.score);
}

export async function fetchWebsiteHtml(websiteUrl, options = {}) {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
  const timeoutMs = Number(options?.timeoutMs || WEBSITE_FETCH_TIMEOUT_MS);

  if (!normalizedWebsiteUrl) {
    throw new Error("Website URL is required");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(normalizedWebsiteUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SpreeloBot/1.0; +https://app.spreelo.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Website returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("Website did not return HTML");
    }

    const html = await response.text();

    return {
      url: normalizedWebsiteUrl,
      html,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchProductSourceCandidates({ websiteUrl, html }) {
  const sourceLinks = extractProductSourceLinks(html, websiteUrl).slice(
    0,
    WEBSITE_MAX_PRODUCT_SOURCE_PAGES
  );

  const candidates = [];

  for (const link of sourceLinks) {
    try {
      const candidate = await fetchWebsiteHtml(link.url, {
        timeoutMs: WEBSITE_MAX_PRODUCT_SOURCE_FETCH_TIMEOUT_MS,
      });

      candidates.push({
        url: candidate.url,
        title: extractPageTitle(candidate.html),
        description: extractMetaDescription(candidate.html),
        text: truncateText(
          stripHtmlToText(candidate.html),
          WEBSITE_MAX_PRODUCT_SOURCE_TEXT_CHARS
        ),
        link_text: link.text || "",
        score: link.score || 0,
      });
    } catch (error) {
      console.error("Could not fetch product source candidate", {
        websiteUrl,
        candidateUrl: link.url,
        message: error.message,
      });
    }
  }

  return candidates;
}

export function formatProductSourceCandidatesForPrompt(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "No extra product source candidate pages were found.";
  }

  return candidates
    .map((candidate, index) =>
      `
Candidate page ${index + 1}:
URL: ${candidate.url}
Link text: ${candidate.link_text || "Not provided"}
Page title: ${candidate.title || "Not found"}
Meta description: ${candidate.description || "Not found"}

Visible text:
${candidate.text || ""}
`.trim()
    )
    .join("\n\n---\n\n");
}

export function slugify(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "";
}

export function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export function normalizeDate(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return null;
  }

  const date = new Date(`${rawValue}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return rawValue;
}

export function getYearFromDate(value, fallbackYear) {
  const normalizedDate = normalizeDate(value);

  if (!normalizedDate) {
    return fallbackYear;
  }

  return Number.parseInt(normalizedDate.slice(0, 4), 10);
}

export function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

export function normalizeDateConfidence(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  if (["high", "medium", "low"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "medium";
}

export function normalizeWebsiteContentFit(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  if (["strong", "medium", "weak"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "medium";
}

export function normalizeWebsiteContentStrategy(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  if (["product", "service", "support", "none"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "support";
}

export function normalizeWebsiteProductSelectionHint(value) {
  return String(value || "").trim().slice(0, 700);
}

export function normalizeShortText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizeCampaignCategory(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  const allowedCategories = [
    "gift_campaign",
    "seasonal_campaign",
    "sales_campaign",
    "local_event",
    "educational_theme",
    "awareness_theme",
    "product_discovery",
    "trust_building",
    "engagement_theme",
    "booking_push",
    "limited_time_offer",
    "community_moment",
    "custom_campaign",
  ];

  if (allowedCategories.includes(normalizedValue)) {
    return normalizedValue;
  }

  return "custom_campaign";
}

export function normalizeRecommendedAngles(value) {
  const rawAngles = Array.isArray(value) ? value : [];

  return rawAngles
    .map((angle) => String(angle || "").toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function normalizeCampaignBlueprint(rawOpportunity) {
  const recommendedAngles = normalizeRecommendedAngles(
    rawOpportunity?.recommended_angles || rawOpportunity?.campaign_angles
  );

  return {
    campaign_category: normalizeCampaignCategory(
      rawOpportunity?.campaign_category
    ),
    campaign_goal: normalizeShortText(rawOpportunity?.campaign_goal, 700),
    target_customer_need: normalizeShortText(
      rawOpportunity?.target_customer_need,
      700
    ),
    recommended_angles: recommendedAngles,
    product_selection_guidance: normalizeShortText(
      rawOpportunity?.product_selection_guidance ||
        rawOpportunity?.website_product_selection_hint,
      700
    ),
    tone_guidance: normalizeShortText(rawOpportunity?.tone_guidance, 500),
    cta_guidance: normalizeShortText(rawOpportunity?.cta_guidance, 500),
    image_guidance: normalizeShortText(rawOpportunity?.image_guidance, 500),
  };
}

export function hasProductBasedWebsiteEvidence(evidenceText) {
  const lower = String(evidenceText || "").toLowerCase();

  if (!lower.trim()) {
    return false;
  }

  let score = 0;

  const commerceSignals = [
    "add to cart",
    "add-to-cart",
    "buy now",
    "shop now",
    "order now",
    "lägg i varukorg",
    "lagg i varukorg",
    "köp nu",
    "kop nu",
    "beställ nu",
    "bestall nu",
    "varukorg",
    "kundvagn",
    "checkout",
    "kassa",
    "product",
    "products",
    "produkt",
    "produkter",
    "webshop",
    "butik",
    "e-handel",
    "ecommerce",
    "online store",
    "sortiment",
    "category",
    "kategori",
    "sku",
    "schema.org/product",
    "@type product",
    "product:",
    "offer",
    "offers",
    "price",
    "pris",
    "kr",
    "sek",
  ];

  const strongSignals = [
    "add to cart",
    "add-to-cart",
    "lägg i varukorg",
    "lagg i varukorg",
    "varukorg",
    "kundvagn",
    "checkout",
    "schema.org/product",
    "@type product",
    "sku",
  ];

  for (const signal of commerceSignals) {
    if (lower.includes(signal)) {
      score += strongSignals.includes(signal) ? 3 : 1;
    }
  }

  const hasMoneySignal = /(?:\d{1,3}(?:[ .]\d{3})*|\d+)(?:[,.]\d{1,2})?\s?(?:kr|sek|usd|eur|£|\$|:-)/i.test(lower);
  if (hasMoneySignal) {
    score += 2;
  }

  const productLikePathCount = (lower.match(/\/(?:produkt|produkter|product|products|p|shop|store|butik|kategori|category|collection|collections)\b/g) || []).length;
  if (productLikePathCount >= 2) {
    score += 2;
  }

  const isMostlyNonSellable = /(portfolio|blog|news|nyheter|press|privacy|cookie|terms|villkor)/.test(lower) && score < 4;

  return score >= 4 && !isMostlyNonSellable;
}

function normalizeWebsiteProductMode(rawValue, fallbackWebsiteUrl = "", evidenceText = "") {
  const rawMode = rawValue || {};

  const evidenceSuggestsProductBasedWebsite = hasProductBasedWebsiteEvidence(evidenceText);

  const available = Boolean(rawMode.available) || evidenceSuggestsProductBasedWebsite;

  const reason = String(rawMode.reason || "")
    .trim()
    .slice(0, 500);

  const rawSourceUrl = String(rawMode.source_url || "").trim();
  const normalizedSourceUrl = rawSourceUrl
    ? normalizeWebsiteUrl(rawSourceUrl)
    : "";

  return {
    available,
    reason:
      reason ||
      (available
        ? evidenceSuggestsProductBasedWebsite
          ? "The website appears to be product-based/ecommerce. Product pages are verified again when a product post is generated."
          : "The website appears to contain stable individual items that can be used for website-based posts."
        : "No clear stable individual website item was found during brand analysis."),
    source_url: available
      ? normalizedSourceUrl || normalizeWebsiteUrl(fallbackWebsiteUrl)
      : "",
  };
}

export function normalizeCampaignOpportunity(rawOpportunity, fallbackYear) {
  const title = String(rawOpportunity?.title || "").trim();

  if (!title) {
    return null;
  }

  const eventDate = normalizeDate(rawOpportunity?.event_date);
  const startDate = normalizeDate(rawOpportunity?.start_date);
  const endDate = normalizeDate(rawOpportunity?.end_date);

  const eventYear = eventDate
    ? getYearFromDate(eventDate, fallbackYear)
    : startDate
    ? getYearFromDate(startDate, fallbackYear)
    : fallbackYear;

  const slug = slugify(rawOpportunity?.slug || title);

  return {
    title,
    slug,
    description: String(rawOpportunity?.description || "").trim(),
    event_type: String(rawOpportunity?.event_type || "campaign").trim(),
    event_date: eventDate,
    event_year: eventYear,
    start_date: startDate,
    end_date: endDate,
    relevance_reason: String(rawOpportunity?.relevance_reason || "").trim(),
    relevance_score: clampNumber(rawOpportunity?.relevance_score, 1, 5, 3),
    sales_score: clampNumber(rawOpportunity?.sales_score, 1, 5, 3),
    engagement_score: clampNumber(rawOpportunity?.engagement_score, 1, 5, 3),
    recommended_post_count: clampNumber(
      rawOpportunity?.recommended_post_count,
      1,
      10,
      5
    ),
    prompt_context: String(rawOpportunity?.prompt_context || "").trim(),
    campaign_angles: normalizeJsonArray(rawOpportunity?.campaign_angles),
    post_plan: normalizeJsonArray(rawOpportunity?.post_plan),
    date_confidence: normalizeDateConfidence(rawOpportunity?.date_confidence),
    website_content_fit: normalizeWebsiteContentFit(
      rawOpportunity?.website_content_fit
    ),
    website_content_strategy: normalizeWebsiteContentStrategy(
      rawOpportunity?.website_content_strategy
    ),
    website_product_selection_hint: normalizeWebsiteProductSelectionHint(
      rawOpportunity?.website_product_selection_hint
    ),
    campaign_category: normalizeCampaignCategory(
      rawOpportunity?.campaign_category
    ),
    campaign_goal: normalizeShortText(rawOpportunity?.campaign_goal, 700),
    target_customer_need: normalizeShortText(
      rawOpportunity?.target_customer_need,
      700
    ),
    recommended_angles: normalizeRecommendedAngles(
      rawOpportunity?.recommended_angles || rawOpportunity?.campaign_angles
    ),
    product_selection_guidance: normalizeShortText(
      rawOpportunity?.product_selection_guidance ||
        rawOpportunity?.website_product_selection_hint,
      700
    ),
    tone_guidance: normalizeShortText(rawOpportunity?.tone_guidance, 500),
    cta_guidance: normalizeShortText(rawOpportunity?.cta_guidance, 500),
    image_guidance: normalizeShortText(rawOpportunity?.image_guidance, 500),
    campaign_blueprint: normalizeCampaignBlueprint(rawOpportunity),
  };
}


function getLastFridayOfNovember(year) {
  const date = new Date(Date.UTC(year, 10, 30));

  while (date.getUTCDay() !== 5) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}


function getNthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  let found = 0;

  while (date.getUTCMonth() === monthIndex) {
    if (date.getUTCDay() === weekday) {
      found += 1;
      if (found === occurrence) {
        return date.toISOString().slice(0, 10);
      }
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function getLastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));

  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString().slice(0, 10);
}

function getSwedishMothersDay(year) {
  return getLastWeekdayOfMonth(year, 4, 0);
}

function getSwedishFathersDay(year) {
  return getNthWeekdayOfMonth(year, 10, 0, 2);
}

function isOpportunityUpcomingOnDate(opportunity, currentDate) {
  if (!opportunity || !currentDate) {
    return true;
  }

  const endDate = opportunity.end_date || opportunity.event_date || opportunity.start_date;

  if (!endDate) {
    return true;
  }

  return endDate >= currentDate;
}

function getOpportunityKey(opportunity) {
  return slugify(opportunity?.slug || opportunity?.title || "");
}

function isSwedishContentLanguage(language) {
  const normalized = String(language || "").toLowerCase();
  return normalized.includes("swedish") || normalized.includes("svensk");
}

function appearsProductOrRetailBased({ industry, websiteProductMode }) {
  if (websiteProductMode?.available) {
    return true;
  }

  const normalizedIndustry = String(industry || "").toLowerCase();

  return [
    "ecommerce",
    "e-commerce",
    "webshop",
    "online store",
    "retail",
    "butik",
    "shop",
    "product",
    "produkt",
    "electronics",
    "elektronik",
    "fashion",
    "mode",
    "beauty",
    "home",
    "interior",
    "inredning",
    "gifts",
    "present",
  ].some((keyword) => normalizedIndustry.includes(keyword));
}

function makeFallbackCampaign({
  title,
  slug,
  description,
  eventType = "custom_campaign",
  eventDate = null,
  startDate = null,
  endDate = null,
  category = "product_discovery",
  goal,
  need,
  productGuidance,
  angles = ["product_discovery", "product_push"],
  postCount = 5,
  salesScore = 4,
  engagementScore = 3,
  dateConfidence = "medium",
}) {
  return {
    title,
    slug,
    description,
    event_type: eventType,
    event_date: eventDate,
    start_date: startDate,
    end_date: endDate,
    date_confidence: dateConfidence,
    website_content_fit: "strong",
    website_content_strategy: "product",
    website_product_selection_hint: productGuidance,
    campaign_category: category,
    campaign_goal: goal,
    target_customer_need: need,
    recommended_angles: angles,
    product_selection_guidance: productGuidance,
    tone_guidance: "Helpful, commercial and clear without inventing unverified discounts or promises.",
    cta_guidance: "Start with inspiration and product discovery, then move toward clearer website visits and purchase intent.",
    image_guidance: "Use verified website product images for product posts and carousel slides; use AI images only for safe mood or campaign context.",
    relevance_reason: "Fallback campaign generated because the brand appears product-based and needs a usable campaign calendar even when AI returned too few future opportunities.",
    relevance_score: 4,
    sales_score: salesScore,
    engagement_score: engagementScore,
    recommended_post_count: postCount,
    campaign_angles: angles,
    post_plan: [],
    prompt_context: `${title}: ${description} ${productGuidance}`.trim(),
  };
}

function buildFallbackProductCampaignOpportunities({
  campaignCalendarYear,
  currentDate,
  contentLanguage,
}) {
  const swedish = isSwedishContentLanguage(contentLanguage);
  const blackFriday = getLastFridayOfNovember(campaignCalendarYear);
  const cyberMonday = addDays(blackFriday, 3);
  const swedishMothersDay = getSwedishMothersDay(campaignCalendarYear);
  const swedishFathersDay = getSwedishFathersDay(campaignCalendarYear);

  const campaigns = swedish
    ? [
        makeFallbackCampaign({
          title: "Mors dag presentguide",
          slug: "mors-dag-presentguide",
          description: "En presentguide som hjälper kunder hitta omtänksamma och användbara produkter inför Mors dag.",
          eventType: "holiday",
          eventDate: swedishMothersDay,
          category: "gift_campaign",
          goal: "Driva relevanta presentköp inför Mors dag med produkter som passar olika behov och personligheter.",
          need: "Kunder vill hitta en uppskattad present som känns genomtänkt och praktisk.",
          productGuidance: "Välj presentvänliga produkter som passar hem, vardag, teknik, ljud, kök, smart hem, hälsa, komfort eller personlig användning. Undvik produkter som känns slumpmässiga eller svåra att motivera som present.",
          angles: ["awareness", "product_discovery", "gift_guide", "product_push"],
          postCount: 5,
          salesScore: 5,
          engagementScore: 4,
          dateConfidence: "high",
        }),
        makeFallbackCampaign({
          title: "Fars dag presentguide",
          slug: "fars-dag-presentguide",
          description: "En presentguide som hjälper kunder hitta relevanta produkter inför Fars dag.",
          eventType: "holiday",
          eventDate: swedishFathersDay,
          category: "gift_campaign",
          goal: "Driva presentköp inför Fars dag genom tydliga produktförslag och köpvägledning.",
          need: "Kunder behöver konkreta presentidéer som passar olika intressen, hem och vardagsbehov.",
          productGuidance: "Välj presentvänliga produkter som teknik, ljud, gaming, smart hem, verktygsliknande elektronik, kök, kaffe, personlig användning eller vardagsuppgraderingar. Undvik slumpmässiga produkter utan tydlig presentlogik.",
          angles: ["awareness", "product_discovery", "gift_guide", "product_push", "urgency"],
          postCount: 5,
          salesScore: 5,
          engagementScore: 4,
          dateConfidence: "high",
        }),
        makeFallbackCampaign({
          title: "Sommarens smarta produktval",
          slug: "sommarens-smarta-produktval",
          description: "En säsongsanpassad produktguide som hjälper kunder att hitta praktiska produkter för sommar, hem och vardag.",
          eventType: "seasonal",
          startDate: `${campaignCalendarYear}-07-01`,
          endDate: `${campaignCalendarYear}-08-15`,
          category: "seasonal_campaign",
          goal: "Driva produktupptäckt och försäljning genom en relevant sommarvinkel.",
          need: "Kunder vill hitta produkter som gör sommaren, hemmet eller vardagen enklare och roligare.",
          productGuidance: "Välj produkter som naturligt passar sommar, hem, resor, uteplats, ljud, kylning, smart teknik eller vardagskomfort. Undvik slumpmässiga produkter utan tydlig säsongskoppling.",
          angles: ["awareness", "product_discovery", "product_push"],
          postCount: 5,
        }),
        makeFallbackCampaign({
          title: "Back to school och vardagsstart",
          slug: "back-to-school-vardagsstart",
          description: "En köpguide för produkter som hjälper kunder komma igång efter sommaren.",
          eventType: "seasonal",
          startDate: `${campaignCalendarYear}-08-05`,
          endDate: `${campaignCalendarYear}-09-05`,
          category: "seasonal_campaign",
          goal: "Fånga efterfrågan när kunder återgår till skola, jobb och vardagsrutiner.",
          need: "Kunder behöver praktiska produkter för skola, arbete, teknik, hem och nya rutiner.",
          productGuidance: "Prioritera produkter för skola, arbete, teknik, datorer, tillbehör, hörlurar, smarta vardagsprodukter och organisering. Undvik produkter som inte passar vardagsstarten.",
          angles: ["product_discovery", "product_push", "trust"],
          postCount: 5,
        }),
        makeFallbackCampaign({
          title: "Höstens uppgradering hemma",
          slug: "hostens-uppgradering-hemma",
          description: "En säsongskampanj för produkter som gör hemmet smartare, bekvämare eller mer underhållande under hösten.",
          eventType: "seasonal",
          startDate: `${campaignCalendarYear}-09-15`,
          endDate: `${campaignCalendarYear}-10-20`,
          category: "seasonal_campaign",
          goal: "Driva intresse och köp kring produkter för hemmet inför höstperioden.",
          need: "Kunder spenderar mer tid hemma och vill förbättra komfort, underhållning och vardagsrutiner.",
          productGuidance: "Välj produkter för smart hem, städning, ljud, TV, gaming, kök, värme, belysning eller hemkomfort. Undvik sommarprodukter utan höstkoppling.",
          angles: ["awareness", "product_discovery", "product_push"],
          postCount: 5,
        }),
        makeFallbackCampaign({
          title: "Halloween och höstmys hemma",
          slug: "halloween-hostmys-hemma",
          description: "En lättsam kampanj för produkter som passar filmkvällar, ljud, ljus, spel och hemmakvällar.",
          eventType: "theme_day",
          eventDate: `${campaignCalendarYear}-10-31`,
          category: "engagement_theme",
          goal: "Skapa engagemang och produktintresse kring en säsongsaktuell höstkväll.",
          need: "Kunder vill skapa stämning hemma med underhållning, ljud, ljus eller smarta produkter.",
          productGuidance: "Välj produkter som passar filmkväll, gaming, högtalare, belysning, TV, projektor, smart hem eller mys hemma. Undvik produkter utan tydlig Halloween- eller hemmakvällskoppling.",
          angles: ["engagement", "product_discovery", "product_push"],
          postCount: 4,
          salesScore: 3,
          engagementScore: 5,
        }),
        makeFallbackCampaign({
          title: "Singles Day produktguide",
          slug: "singles-day-produktguide",
          description: "En shoppingperiod där kunder kan inspireras till smarta produktval och uppgraderingar.",
          eventType: "shopping",
          eventDate: `${campaignCalendarYear}-11-11`,
          category: "sales_campaign",
          goal: "Driva produktupptäckt och köpintresse under en tydlig shoppingdag.",
          need: "Kunder letar efter produkter att unna sig själva eller uppgradera hemma.",
          productGuidance: "Välj attraktiva produkter med bred köpintention, gärna teknik, ljud, smart hem, gaming, vardagsprodukter och populära kategorier. Nämn inte rabatter om de inte är verifierade.",
          angles: ["product_discovery", "product_push", "urgency"],
          postCount: 4,
          salesScore: 5,
        }),
        makeFallbackCampaign({
          title: "Black Week köpguide",
          slug: "black-week-kopguide",
          description: "En försäljningsdriven shoppingkampanj för att hjälpa kunder hitta rätt produkter under Black Week-perioden.",
          eventType: "shopping",
          startDate: addDays(blackFriday, -4),
          endDate: cyberMonday,
          category: "sales_campaign",
          goal: "Driva försäljning och hemsidebesök under årets starka shoppingperiod.",
          need: "Kunder vill jämföra, välja och hitta produkter som passar deras behov under Black Week.",
          productGuidance: "Prioritera starka produktkategorier, populära produkter, jämförelsevänliga produkter, teknik, hem, ljud, gaming och produkter med tydlig köpintention. Använd bara rabatt-/erbjudandevinkel om den är verifierad eller tydligt kopplad till shoppingperioden.",
          angles: ["product_discovery", "product_push", "offer", "urgency"],
          postCount: 6,
          salesScore: 5,
        }),
        makeFallbackCampaign({
          title: "Cyber Monday teknikval",
          slug: "cyber-monday-teknikval",
          description: "En köpdriven kampanj för kunder som fortfarande jämför och vill hitta rätt produkt efter Black Week-helgen.",
          eventType: "shopping",
          eventDate: cyberMonday,
          category: "sales_campaign",
          goal: "Fånga köpintentionen under Cyber Monday med tydliga produktval och beslutshjälp.",
          need: "Kunder vill snabbt hitta rätt produkt innan shoppingperioden är över.",
          productGuidance: "Prioritera jämförelsevänliga produkter, populära kategorier och produkter med tydlig köpintention. Nämn inte rabatter eller kampanjpriser om de inte är verifierade.",
          angles: ["product_discovery", "product_push", "comparison", "urgency"],
          postCount: 4,
          salesScore: 5,
          engagementScore: 3,
          dateConfidence: "high",
        }),
        makeFallbackCampaign({
          title: "Julklappsguide",
          slug: "julklappsguide",
          description: "En presentguide som hjälper kunder hitta relevanta julklappar i olika produktkategorier.",
          eventType: "holiday",
          eventDate: `${campaignCalendarYear}-12-24`,
          category: "gift_campaign",
          goal: "Driva presentköp genom relevanta produktrekommendationer inför jul.",
          need: "Kunder behöver hjälp att hitta bra julklappar till olika mottagare och behov.",
          productGuidance: "Välj produkter som fungerar som julklappar: teknik, ljud, gaming, smart hem, kök, personlig användning, hemkomfort eller populära produktkategorier. Anpassa urvalet till mottagare och undvik slumpmässiga produkter.",
          angles: ["awareness", "product_discovery", "product_push", "urgency"],
          postCount: 6,
          salesScore: 5,
        }),
      ]
    : [
        makeFallbackCampaign({
          title: "Summer product picks",
          slug: "summer-product-picks",
          description: "A seasonal product guide that helps customers find useful products for summer, home and everyday life.",
          eventType: "seasonal",
          startDate: `${campaignCalendarYear}-07-01`,
          endDate: `${campaignCalendarYear}-08-15`,
          category: "seasonal_campaign",
          goal: "Drive product discovery and sales through a relevant summer angle.",
          need: "Customers want products that make summer, home or everyday routines easier and more enjoyable.",
          productGuidance: "Choose products that naturally fit summer, home, travel, outdoor living, sound, cooling, smart tech or everyday comfort. Avoid random products with no seasonal connection.",
          angles: ["awareness", "product_discovery", "product_push"],
          postCount: 5,
        }),
        makeFallbackCampaign({
          title: "Back to school and routine reset",
          slug: "back-to-school-routine-reset",
          description: "A buying guide for products that help customers restart school, work and daily routines.",
          eventType: "seasonal",
          startDate: `${campaignCalendarYear}-08-05`,
          endDate: `${campaignCalendarYear}-09-05`,
          category: "seasonal_campaign",
          goal: "Capture demand as customers return to school, work and routines.",
          need: "Customers need practical products for school, work, technology, home and new routines.",
          productGuidance: "Prioritize products for school, work, tech, computers, accessories, headphones, smart everyday products and organization. Avoid products that do not fit the routine reset.",
          angles: ["product_discovery", "product_push", "trust"],
          postCount: 5,
        }),
        makeFallbackCampaign({
          title: "Autumn home upgrade",
          slug: "autumn-home-upgrade",
          description: "A seasonal campaign for products that make the home smarter, more comfortable or more entertaining during autumn.",
          eventType: "seasonal",
          startDate: `${campaignCalendarYear}-09-15`,
          endDate: `${campaignCalendarYear}-10-20`,
          category: "seasonal_campaign",
          goal: "Drive interest and purchase intent around home-related products for autumn.",
          need: "Customers spend more time at home and want to improve comfort, entertainment and routines.",
          productGuidance: "Choose products for smart home, cleaning, sound, TV, gaming, kitchen, heating, lighting or home comfort. Avoid summer-only products.",
          angles: ["awareness", "product_discovery", "product_push"],
          postCount: 5,
        }),
        makeFallbackCampaign({
          title: "Halloween and cosy nights in",
          slug: "halloween-cosy-nights-in",
          description: "A light seasonal campaign for products that fit movie nights, sound, lighting, gaming and home entertainment.",
          eventType: "theme_day",
          eventDate: `${campaignCalendarYear}-10-31`,
          category: "engagement_theme",
          goal: "Create engagement and product interest around a seasonal night at home.",
          need: "Customers want to create atmosphere at home with entertainment, sound, lighting or smart products.",
          productGuidance: "Choose products for movie nights, gaming, speakers, lighting, TV, projectors, smart home or cosy home experiences. Avoid products with no clear Halloween or home-night connection.",
          angles: ["engagement", "product_discovery", "product_push"],
          postCount: 4,
          salesScore: 3,
          engagementScore: 5,
        }),
        makeFallbackCampaign({
          title: "Singles Day product guide",
          slug: "singles-day-product-guide",
          description: "A shopping moment where customers can be inspired to choose smart upgrades and useful products.",
          eventType: "shopping",
          eventDate: `${campaignCalendarYear}-11-11`,
          category: "sales_campaign",
          goal: "Drive product discovery and purchase intent around a clear shopping day.",
          need: "Customers look for products to treat themselves or upgrade their home.",
          productGuidance: "Choose attractive products with broad purchase intent, such as technology, sound, smart home, gaming, everyday products and popular categories. Do not mention discounts unless verified.",
          angles: ["product_discovery", "product_push", "urgency"],
          postCount: 4,
          salesScore: 5,
        }),
        makeFallbackCampaign({
          title: "Black Week buying guide",
          slug: "black-week-buying-guide",
          description: "A sales-driven shopping campaign that helps customers find the right products during Black Week.",
          eventType: "shopping",
          startDate: addDays(blackFriday, -4),
          endDate: cyberMonday,
          category: "sales_campaign",
          goal: "Drive sales and website visits during a major shopping period.",
          need: "Customers want to compare, choose and find products that fit their needs during Black Week.",
          productGuidance: "Prioritize strong product categories, popular products, comparison-friendly products, tech, home, sound, gaming and products with clear buying intent. Only use discount or offer angles when verified or clearly tied to the shopping period.",
          angles: ["product_discovery", "product_push", "offer", "urgency"],
          postCount: 6,
          salesScore: 5,
        }),
        makeFallbackCampaign({
          title: "Christmas gift guide",
          slug: "christmas-gift-guide",
          description: "A gift guide that helps customers find relevant Christmas gifts across product categories.",
          eventType: "holiday",
          eventDate: `${campaignCalendarYear}-12-24`,
          category: "gift_campaign",
          goal: "Drive gift purchases through relevant product recommendations before Christmas.",
          need: "Customers need help finding good Christmas gifts for different recipients and needs.",
          productGuidance: "Choose giftable products: technology, sound, gaming, smart home, kitchen, personal use, home comfort or popular product categories. Adapt the selection to recipients and avoid random products.",
          angles: ["awareness", "product_discovery", "product_push", "urgency"],
          postCount: 6,
          salesScore: 5,
        }),
      ];

  return campaigns.filter((campaign) =>
    normalizeCampaignOpportunity(campaign, campaignCalendarYear)?.event_year ===
      campaignCalendarYear &&
    isOpportunityUpcomingOnDate(
      normalizeCampaignOpportunity(campaign, campaignCalendarYear),
      currentDate
    )
  );
}

function buildStrategicCampaignOpportunitySet({
  opportunities,
  campaignCalendarYear,
  currentDate,
  contentLanguage,
  industry,
  websiteProductMode,
}) {
  const sourceOpportunities = Array.isArray(opportunities)
    ? opportunities
    : [];

  const normalizedSource = normalizeCampaignOpportunities(
    sourceOpportunities,
    campaignCalendarYear
  );

  const productOrRetailBased = appearsProductOrRetailBased({
    industry,
    websiteProductMode,
  });

  if (!productOrRetailBased) {
    return sourceOpportunities;
  }

  const fallbackOpportunities = buildFallbackProductCampaignOpportunities({
    campaignCalendarYear,
    currentDate,
    contentLanguage,
  }).filter((opportunity) => isOpportunityUpcomingOnDate(opportunity, currentDate));

  const usedKeys = new Set();
  const merged = [];

  // Product and retail calendars must not depend entirely on the AI remembering
  // obvious high-value shopping moments. Add the deterministic premium moments
  // first, then fill the remaining slots with AI opportunities. This is fast and
  // does not add any extra website fetching or AI calls.
  for (const fallback of fallbackOpportunities) {
    const key = getOpportunityKey(fallback);

    if (key && usedKeys.has(key)) {
      continue;
    }

    usedKeys.add(key);
    merged.push(fallback);

    if (merged.length >= MAX_CAMPAIGN_OPPORTUNITIES) {
      return merged;
    }
  }

  for (const opportunity of sourceOpportunities) {
    const key = getOpportunityKey(opportunity);

    if (key && usedKeys.has(key)) {
      continue;
    }

    if (key) {
      usedKeys.add(key);
    }

    merged.push(opportunity);

    if (merged.length >= MAX_CAMPAIGN_OPPORTUNITIES) {
      break;
    }
  }

  return merged;
}

export function normalizeCampaignOpportunities(rawOpportunities, fallbackYear) {
  const opportunities = Array.isArray(rawOpportunities)
    ? rawOpportunities
    : [];

  const normalizedOpportunities = [];
  const usedSlugs = new Set();

  for (const rawOpportunity of opportunities) {
    const normalizedOpportunity = normalizeCampaignOpportunity(
      rawOpportunity,
      fallbackYear
    );

    if (!normalizedOpportunity) {
      continue;
    }

    if (normalizedOpportunity.event_year !== fallbackYear) {
      continue;
    }

    let finalSlug =
      normalizedOpportunity.slug || slugify(normalizedOpportunity.title);

    if (!finalSlug) {
      finalSlug = `campaign-${normalizedOpportunities.length + 1}`;
    }

    let uniqueSlug = finalSlug;
    let suffix = 2;

    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${finalSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(uniqueSlug);

    normalizedOpportunities.push({
      ...normalizedOpportunity,
      slug: uniqueSlug,
    });

    if (normalizedOpportunities.length >= MAX_CAMPAIGN_OPPORTUNITIES) {
      break;
    }
  }

  return normalizedOpportunities;
}

export function getDefaultLanguage(contentLanguage, detectedLanguage) {
  const requestedLanguage = String(contentLanguage || "").trim();

  if (requestedLanguage) {
    return requestedLanguage;
  }

  const detected = String(detectedLanguage || "").trim();

  if (detected) {
    return detected;
  }

  return "";
}

export function normalizeMarketSetup(rawValue, fallbackLanguage = "") {
  const rawSetup = rawValue || {};

  return {
    contentMarket: String(
      rawSetup.content_market ||
        rawSetup.contentMarket ||
        rawSetup.market ||
        ""
    )
      .trim()
      .slice(0, 120),

    countryCode: String(rawSetup.country_code || rawSetup.countryCode || "")
      .trim()
      .toUpperCase()
      .slice(0, 20),

    contentLanguage: String(
      rawSetup.content_language ||
        rawSetup.contentLanguage ||
        rawSetup.language ||
        fallbackLanguage ||
        ""
    )
      .trim()
      .slice(0, 80),

    reason: String(rawSetup.reason || "").trim().slice(0, 500),
  };
}
export async function detectWebsiteLanguageWithOpenAI({
  openai,
  websiteUrl,
  html,
}) {
  const title = extractPageTitle(html);
  const description = extractMetaDescription(html);
  const visibleText = truncateText(stripHtmlToLanguageText(html), 14000);

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You detect the main customer-facing language of a website. Return strict JSON only.",
      },
      {
        role: "user",
        content: `
Detect the main customer-facing language of this website.

Website URL:
${websiteUrl}

Page title:
${title || "Not found"}

Meta description:
${description || "Not found"}

Customer-facing website text:
${visibleText}

Return JSON only in this exact shape:
{
  "language": "The actual main customer-facing language name",
  "confidence": "high | medium | low",
  "reason": "Short explanation of the strongest evidence"
}

Rules:
- This must work for any language in the world.
- Detect the language the website mainly uses to communicate with visitors.
- Give strongest weight to navigation, menus, headings, banners, body text, buttons, service descriptions, product descriptions, booking text, delivery text, contact text, footer text, legal/customer information and general customer instructions.
- Give weaker weight to imported product names, brand names, model names, technical specifications, URLs, metadata, scripts, SEO snippets, isolated foreign phrases and generic platform/ecommerce terms.
- Do not choose a language only because the website contains product names, brand names, technical terms or imported phrases in that language.
- If the website mainly communicates with visitors in a local language, choose that local language.
- Return the language name in English, for example the language name, not a country name.
`.trim(),
      },
    ],
    temperature: 0,
  });

  const content = completion.choices?.[0]?.message?.content || "";

  const parsed = await parseOpenAIJsonWithRepair({
    openai,
    content,
    contextLabel: "website language detection response",
    expectedShapeDescription: `
{
  "language": "Detected language name",
  "confidence": "high | medium | low",
  "reason": "Short explanation"
}
`.trim(),
  });

  return {
    language: String(parsed?.language || "").trim().slice(0, 80),
    confidence: String(parsed?.confidence || "medium").trim().slice(0, 20),
    reason: String(parsed?.reason || "").trim().slice(0, 500),
  };
}

export async function analyzeWebsiteWithOpenAI({
  openai,
  businessName,
  websiteUrl,
  html,
  productSourceCandidates,
  brandDescription,
  contentMarket,
  countryCode,
  contentLanguage,
  currentDate,
  campaignCalendarYear,
}) {
  const title = extractPageTitle(html);
  const description = extractMetaDescription(html);
  const visibleText = truncateText(stripHtmlToText(html), WEBSITE_MAX_TEXT_CHARS);
  const productSourceCandidateText =
    formatProductSourceCandidatesForPrompt(productSourceCandidates);
  const productModeEvidenceText = [
    title,
    description,
    visibleText,
    productSourceCandidateText,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You analyze business websites for a global social media automation tool. Return strict JSON only. Do not write actual social media posts.",
      },
      {
        role: "user",
        content: `
Analyze this business and create:
1. A brand profile.
2. A market-aware campaign calendar.
3. A website product mode assessment.

User-entered business name:
${businessName || "Not provided"}

Website URL:
${websiteUrl}

Selected market/country:
${contentMarket || "Not provided"}

Country code:
${countryCode || "Not provided"}

Preferred content language:
${contentLanguage || "Use the strongest customer-facing language from the website"}

Current date:
${currentDate}

Calendar year:
${campaignCalendarYear}

Optional user-provided brand description:
${brandDescription || "Not provided"}

Page title:
${title || "Not found"}

Meta description:
${description || "Not found"}

Visible website text:
${visibleText}

Extra product/source candidate pages checked:
${productSourceCandidateText}

Return JSON only in this exact shape:
{
  "market_setup": {
    "content_market": "The most likely campaign market for this business",
    "country_code": "ISO country code, or GLOBAL only when the business is clearly international or no reliable country can be inferred",
    "content_language": "The main customer-facing language",
    "reason": "Short explanation of why this market and language were selected"
  },
  "profile": {
    "business_name": "Business name",
    "industry": "Short but clear description of what the business does, written in the selected content language",
    "target_audience": "Clear description of the likely customers/audience, written in the selected content language",
    "detected_language": "Detected main customer-facing language"
  },
  "website_product_mode": {
    "available": true,
    "reason": "Short internal explanation. True only if the provided website content or checked candidate pages clearly contain stable individual items suitable for website-based posts.",
    "source_url": "The exact URL where the best item-level evidence was found. Empty string when available is false."
  },
  "campaign_opportunities": [
    {
      "title": "Campaign or theme name",
      "slug": "simple-url-safe-slug",
      "description": "Short explanation of the campaign opportunity",
      "event_type": "holiday | theme_day | seasonal | shopping | industry_day | local_event | custom_campaign",
      "event_date": "YYYY-MM-DD or null",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "date_confidence": "high | medium | low",
      "website_content_fit": "strong | medium | weak",
      "website_content_strategy": "product | service | support | none",
      "website_product_selection_hint": "Short instruction for what type of website item should be selected for this campaign. Empty string when strategy is none.",
      "campaign_category": "gift_campaign | seasonal_campaign | sales_campaign | local_event | educational_theme | awareness_theme | product_discovery | trust_building | engagement_theme | booking_push | limited_time_offer | community_moment | custom_campaign",
      "campaign_goal": "What this campaign should achieve for the business",
      "target_customer_need": "The customer need, situation, problem, desire or buying intent this campaign is built around",
      "recommended_angles": ["awareness", "engagement", "product_discovery", "product_push", "trust", "offer", "urgency"],
      "product_selection_guidance": "Strategic guidance for what products, services, categories or verified offers fit this campaign and what to avoid",
      "tone_guidance": "How the campaign should sound and feel",
      "cta_guidance": "How the call to action should develop across the campaign",
      "image_guidance": "What kind of images should support this campaign",
      "relevance_reason": "Why this opportunity fits this specific business",
      "relevance_score": 1,
      "sales_score": 1,
      "engagement_score": 1,
      "recommended_post_count": 5,
      "campaign_angles": ["angle 1", "angle 2"],
      "post_plan": [
        {
          "role": "Campaign post role",
          "days_before_event": 14,
          "scheduled_date": "YYYY-MM-DD or null, especially for date range campaigns",
          "publish_time": "HH:MM in local time, chosen for this exact weekday, audience, post role and campaign type",
          "timing_anchor": "before_start | start | middle | end | event | relationship_event | deadline_before_event | conversion_before_deadline",
          "campaign_phase": "early | early_middle | middle | middle_late | late | last_chance | main | relationship_event",
          "marketing_angle": "awareness | engagement | product_discovery | product_push | trust | offer | urgency | main",
          "customer_stage": "cold | warm | ready_to_buy",
          "cta_strength": "soft | medium | strong",
          "purpose": "What this post should achieve in the campaign sequence",
          "schedule_reason": "Why this exact date and time is strategically best for this business, campaign and post role"
        }
      ],
      "prompt_context": "Reusable prompt context for generating posts later. Do not include finished post copy."
    }
  ]
}

Global rules:
- Spreelo must work equally well for businesses from any country, language, region or culture.
- Do not assume a European, English-speaking, Swedish-speaking or Western market.
- If a selected market/country is provided, use it.
- If no market is provided, infer the most likely market from URL, domain, currency, delivery/service area, address/contact details, language, local context and business content.
- Use GLOBAL only when the business appears clearly international or when no reliable country can be inferred.
- If a preferred content language is provided, write user-facing fields in that language.
- If no preferred content language is provided, use the main customer-facing website language.
- Do not default to English because a website contains imported product names, technical terms, brand names, model names, platform terms or isolated phrases.
- Campaigns must be relevant to the selected/inferred market, local culture, local seasonality, local buying behavior and the business type.
- Include local holidays, local gift days, cultural moments, religious/cultural seasons, national shopping moments, school seasons, tourism seasons, weather seasons, industry moments and commercial periods only when they are useful and suitable for that business.
- Do not force internationally famous commercial days if they are not relevant in the selected market.
- Do not include political, sensitive or divisive events unless clearly safe and directly suitable for business marketing.
- Quality matters, but do not under-generate the calendar. A useful business calendar should feel rich enough for a marketing team to choose from.
- Avoid weak filler, but for businesses with clear seasonal, commercial, gift, retail, service, booking or product potential, you must normally return many strong opportunities rather than only a few obvious ones.


Campaign selection quality gate:
- Before finalizing campaign_opportunities, build a broad internal candidate pool of local market moments, shopping periods, gift days, seasonal periods, school/work/life moments, industry moments and business-specific evergreen campaigns. Then select only the strongest opportunities for this exact business.
- Do not choose campaigns because they are generally popular. Choose them only when there is a clear customer reason to buy, book, visit, remember, compare, prepare, celebrate, gift, upgrade, replace, learn or engage with this specific business.
- Apply a strict commercial fit test to every candidate: Would a realistic customer of this business plausibly care about this moment and take a meaningful action related to the business offer? If the answer is no or weak, omit it.
- Strong broad commercial moments that clearly fit the market and business category should normally be included before vague custom campaigns. For example: giftable products should strongly consider local gift days; ecommerce/retail should strongly consider major local shopping periods; restaurants/food should consider relevant food and dining moments; beauty/fashion should consider party, season, wedding, graduation and self-care moments; service/bookable businesses should consider seasonal preparation and booking windows.
- For broad ecommerce and retail, do not miss obvious high-value local shopping and gift moments that are still upcoming in the calendar year. These should normally beat generic evergreen campaigns when they fit the product range.
- Irrelevant theme days must be omitted even if they are commercially famous in the market. A food-specific day belongs to bakeries, grocery, cafes or restaurants, not to unrelated electronics or B2B software. A pet-related day belongs to pet brands, not to unrelated retailers unless their product range genuinely fits.
- Custom or evergreen campaigns are allowed, but they must be grounded in the actual business, website evidence, product range, customer behavior or clear market logic. Do not invent business-specific recurring campaigns, product launches, price robots, proprietary programs, guarantees, discounts, delivery promises, events or features unless they are clearly supported by the provided website/description.
- If a custom campaign title implies a feature, offer, sale, discount, campaign price, launch or program that may not exist, rename it to a safer generic strategy or omit it. For example, prefer a grounded campaign like "Product guide", "Seasonal upgrade", "Gift guide" or "Buying advice" over an unsupported named feature.
- The final calendar should feel like a senior marketer first secured the obvious high-value opportunities for this business and then added only the best extra strategic campaigns.
- For broad ecommerce, retail and product-based businesses, returning only around 10 opportunities is usually under-generated unless the year has already passed or the business is unusually narrow. Prefer 15-20 strong opportunities when enough relevant moments exist.

Campaign quantity:
- Return 15 to 20 campaign opportunities when the brand is ecommerce, retail, food, restaurant, beauty, fashion, gifts, local services, bookings, events, tourism, product-based, service-based or has strong seasonal/commercial potential.
- For giftable, personalized, physical, visual or home/lifestyle products, include a strong mix of gift moments, seasonal moments, shopping moments, customer-life moments and industry-specific moments across the calendar year.
- Return 12 to 20 campaign opportunities for most other businesses.
- Return fewer than 10 only when the business is genuinely narrow, low-frequency, sensitive or has very limited safe marketing angles.
- Never return more than 20.

Campaign timing:
- Only create campaign opportunities for Calendar year ${campaignCalendarYear}.
- Every event_date, start_date and end_date must be inside Calendar year ${campaignCalendarYear}.
- If an opportunity cannot be placed inside this year, omit it.
- For exact dated events, event_date must be YYYY-MM-DD.
- For date ranges or seasons, use start_date and end_date.
- For date ranges/seasons, the post_plan must still describe the best campaign sequence. Use days_before_event as days before the main campaign date, final event date, or campaign end date. For date ranges, timing_anchor must explain where the post belongs: before_start, start, middle, conversion_window, deadline_before_event, relationship_event or end.
- For date ranges/seasons, each post_plan item should include scheduled_date as YYYY-MM-DD whenever a specific date is strategically best. scheduled_date must be inside the campaign period, or shortly before start_date only when timing_anchor is before_start.
- For date ranges/seasons, do not spread posts with mechanical equal intervals. Create a natural marketing rhythm: launch, early interest, proof/trust, decision window, deadline/closing or relationship close.
- For date ranges/seasons, final urgency/last-chance posts should use timing_anchor "end" or "deadline_before_event" so they are scheduled near the real action deadline, not randomly in the middle.
- For date ranges/seasons, launch/introduction posts should use timing_anchor "start", early preparation posts should use timing_anchor "before_start", and trust/engagement/value posts can use timing_anchor "middle".
- For date ranges/seasons, distinguish the marketing period from the customer action deadline. The campaign may end on a cultural, seasonal or business moment, but conversion-focused posts must be placed when customers can still realistically act.
- If the business offer requires production time, personalization, delivery, booking, reservation, installation, consultation, limited capacity or any other lead time, place product_push, offer and urgency posts before the realistic purchase/action deadline. The final day of the period should then be used for softer relationship, celebration, reminder, educational or brand-building content unless same-day action is realistic.
- Do not rely on named holiday-specific rules. Apply the same timing logic to any gift day, seasonal period, shopping moment, booking window, event period, local tradition or industry campaign.
- The post_plan order must be chronological and strategically progressive: early value/inspiration first, engagement/trust in the middle, conversion before the deadline, and final relationship or closing content at the end when appropriate.
- Avoid clustering most posts in the final few days unless the campaign is explicitly a short flash sale or same-day/instant-action event.
- For gift campaigns, holiday campaigns, physical products, personalized products, handmade products, printed products, shipped products, booking services or anything with lead time, separate the cultural/event date from the realistic customer action deadline.
- For these lead-time campaigns, use the final event date mainly for relationship, greeting, thank-you, celebration or brand warmth, not hard selling.
- For these lead-time campaigns, choose the final sales/order/booking reminder based on the real buying deadline for this specific business, product, market and customer behavior. It may be several weeks before the event for long lead-time offers, or much closer for fast-action offers.
- Do not use fixed day patterns. Decide the best number of posts, exact days_before_event values and publish_time values for each campaign as a senior performance-minded social media marketer would.
- Each post_plan item must include publish_time in HH:MM local time. Choose the time based on weekday, audience behavior, campaign role, business category and whether the post is inspiration, engagement, trust, product discovery, product push, urgency or relationship-building.
- Each post_plan item must include schedule_reason explaining why that specific date offset and time is the best strategic choice.
- The code may validate or clamp impossible dates, but the AI plan should be the source of truth for the campaign sequence.
- Use date_confidence as relevance strength, not proof that the campaign exists on the website: high = strong fit for this business/market, medium = plausible fit, low = weak or uncertain fit.
- If date is uncertain, use date_confidence "low" and prefer a date range.

Campaign strategy:
- Every campaign must be genuinely useful for this business, industry, market and audience.
- Every campaign must include a strategic campaign blueprint.
- Every campaign should move the audience from interest to action.
- recommended_post_count must be between 1 and 10.
- relevance_score, sales_score and engagement_score must be between 1 and 5.
- The final post in post_plan should normally have days_before_event 0 only when it is appropriate to publish on the main date. If customers need lead time to buy, book or receive delivery, do not make the final date a hard sales push; use it for softer relationship-building content.
- Earlier post_plan items should prepare the audience before the event.
- Every post_plan item should include timing_anchor. For exact event_date campaigns use "event", "relationship_event", "deadline_before_event", "conversion_before_deadline" or "before_start". For start_date/end_date campaigns use "before_start", "start", "middle", "conversion_window", "deadline_before_event", "relationship_event" or "end" to control when the post should be scheduled.
- For every post_plan item, write a role that sounds customer-facing and strategic, not generic. Avoid vague internal labels like "Campaign post" or "Warm-up post".
- Do not make every post a reminder.
- Do not make early posts too salesy.
- Do not make final posts too vague.
- Choose recommended_post_count from the actual campaign complexity and commercial value, not from a fixed template. A minor awareness moment may need 1-2 posts, a strong sales/booking period may need 3-5, and a major lead-time campaign may need 5-7.
- Design the post_plan as a complete campaign sequence, not as separate random posts.
- The sequence should normally move from awareness/inspiration to engagement/trust to product discovery/product push to urgency/deadline, with a softer relationship or celebration post at the end only when it is genuinely useful.
- Do not force every campaign to include every stage. Use only the stages that make the campaign stronger.
- Do not choose the same publish_time for every post. Vary times when a different time is strategically better for the weekday, audience and role of the post.

Website product mode:
- Set website_product_mode.available to true when the website appears product-based, ecommerce, retail, catalog-based, service-menu-based, bookable, listing-based, restaurant/menu-based, course/event-based or otherwise likely to contain concrete sellable/selectable website items. For obvious ecommerce/retail/product-catalog websites, prefer true even if the first fetched pages only show categories, campaign areas or navigation; concrete product pages are verified later during product-post generation.
- A suitable website item should normally have several of these signals:
  1. clear item name/title,
  2. item card or detail page,
  3. price, booking, order, buy, add-to-cart, reservation, request-quote or similar conversion signal,
  4. category/listing structure where individual items can be identified,
  5. relevant item image or item-specific presentation,
  6. enough item-specific description to write a concrete post.
- Set website_product_mode.available to false only when the website is mainly brochure-only, portfolio/blog/news-only, a pure store locator, or does not appear to provide any realistic website items for Spreelo to research.
- Do not set website_product_mode.available to false just because the site is a large store chain, uses category pages, campaign pages or requires deeper product discovery.
- Do not set it to true only because the website mentions broad categories, discounts, offers, products or services.
- If the site clearly appears product-based/ecommerce but item-level evidence is incomplete in this first analysis, set available true and explain that product pages must be verified during post generation.
- If available is true, source_url must be the exact URL where the strongest item-level evidence was found.
- If available is false, source_url must be an empty string.

Website content strategy:
- If website_product_mode.available is true and the business is product-based/ecommerce/retail/catalog-based, campaign opportunities may use website_content_strategy "product" when the campaign naturally benefits from selecting a website product.
- If website_product_mode.available is true, use "product" or "service" only when the campaign clearly fits items that exist on the website.
- If website_content_fit is "weak", website_content_strategy should normally be "none".
- Always write website_product_selection_hint when website_content_strategy is "product" or "service".
- If website_content_strategy is "none", website_product_selection_hint must be an empty string.

Accuracy:
- Do not invent specific services, products, offers, discounts, sales, delivery promises, locations, dates or facts not supported by the website, description or general market knowledge.
- Do not search beyond the provided content.
- Do not create finished social media posts.
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";

  const parsed = await parseOpenAIJsonWithRepair({
    openai,
    content,
    contextLabel: "website brand analysis response",
    expectedShapeDescription: `
{
  "market_setup": {
    "content_market": "",
    "country_code": "",
    "content_language": "",
    "reason": ""
  },
  "profile": {
    "business_name": "",
    "industry": "",
    "target_audience": "",
    "detected_language": ""
  },
  "website_product_mode": {
    "available": false,
    "reason": "",
    "source_url": ""
  },
  "campaign_opportunities": []
}
`.trim(),
  });

  if (!parsed?.profile) {
    throw new Error("Spreelo could not read the analysis result correctly.");
  }

  return {
    market_setup: normalizeMarketSetup(
      parsed.market_setup,
      parsed.profile.detected_language
    ),
    profile: {
      business_name: String(
        parsed.profile.business_name || businessName || ""
      ).trim(),
      industry: String(parsed.profile.industry || "").trim(),
      target_audience: String(parsed.profile.target_audience || "").trim(),
      detected_language: String(parsed.profile.detected_language || "").trim(),
    },
    website_product_mode: normalizeWebsiteProductMode(
      parsed.website_product_mode,
      websiteUrl,
      productModeEvidenceText
    ),
    campaign_opportunities: Array.isArray(parsed.campaign_opportunities)
      ? parsed.campaign_opportunities
      : [],
  };
}

export async function analyzeDescriptionWithOpenAI({
  openai,
  businessName,
  brandDescription,
  contentMarket,
  countryCode,
  contentLanguage,
  currentDate,
  campaignCalendarYear,
}) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You create brand profiles and marketing campaign opportunities from user-provided business descriptions for a global social media automation tool. Return strict JSON only. Do not write actual social media posts.",
      },
      {
        role: "user",
        content: `
Create:
1. A brand profile.
2. A market-aware campaign calendar.

User-entered business name:
${businessName || "Not provided"}

Brand description:
${brandDescription}

Selected market/country:
${contentMarket || "Not provided"}

Country code:
${countryCode || "Not provided"}

Preferred content language:
${contentLanguage || "Use the strongest language from the description"}

Current date:
${currentDate}

Calendar year:
${campaignCalendarYear}

Return JSON only in this exact shape:
{
  "market_setup": {
    "content_market": "The most likely campaign market for this business",
    "country_code": "ISO country code, or GLOBAL only when the business is clearly international or no reliable country can be inferred",
    "content_language": "The main language used in the business description",
    "reason": "Short explanation of why this market and language were selected"
  },
  "profile": {
    "business_name": "Business name",
    "industry": "Short but clear description of what the business does, written in the selected content language",
    "target_audience": "Clear description of the likely customers/audience, written in the selected content language",
    "detected_language": "Detected main language"
  },
  "campaign_opportunities": [
    {
      "title": "Campaign or theme name",
      "slug": "simple-url-safe-slug",
      "description": "Short explanation of the campaign opportunity",
      "event_type": "holiday | theme_day | seasonal | shopping | industry_day | local_event | custom_campaign",
      "event_date": "YYYY-MM-DD or null",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "date_confidence": "high | medium | low",
      "website_content_fit": "strong | medium | weak",
      "website_content_strategy": "product | service | support | none",
      "website_product_selection_hint": "Empty string because no website was provided",
      "campaign_category": "gift_campaign | seasonal_campaign | sales_campaign | local_event | educational_theme | awareness_theme | product_discovery | trust_building | engagement_theme | booking_push | limited_time_offer | community_moment | custom_campaign",
      "campaign_goal": "What this campaign should achieve for the business",
      "target_customer_need": "The customer need, situation, problem, desire or buying intent this campaign is built around",
      "recommended_angles": ["awareness", "engagement", "product_discovery", "product_push", "trust", "offer", "urgency"],
      "product_selection_guidance": "Strategic guidance for what products, categories, services or verified offers fit this campaign and what to avoid",
      "tone_guidance": "How the campaign should sound and feel",
      "cta_guidance": "How the call to action should develop across the campaign",
      "image_guidance": "What kind of images should support this campaign",
      "relevance_reason": "Why this opportunity fits this specific business",
      "relevance_score": 1,
      "sales_score": 1,
      "engagement_score": 1,
      "recommended_post_count": 5,
      "campaign_angles": ["angle 1", "angle 2"],
      "post_plan": [
        {
          "role": "Campaign post role",
          "days_before_event": 14,
          "scheduled_date": "YYYY-MM-DD or null, especially for date range campaigns",
          "publish_time": "HH:MM in local time, chosen for this exact weekday, audience, post role and campaign type",
          "timing_anchor": "before_start | start | middle | end | event | relationship_event | deadline_before_event | conversion_before_deadline",
          "campaign_phase": "early | early_middle | middle | middle_late | late | last_chance | main | relationship_event",
          "marketing_angle": "awareness | engagement | product_discovery | product_push | trust | offer | urgency | main",
          "customer_stage": "cold | warm | ready_to_buy",
          "cta_strength": "soft | medium | strong",
          "purpose": "What this post should achieve in the campaign sequence",
          "schedule_reason": "Why this exact date and time is strategically best for this business, campaign and post role"
        }
      ],
      "prompt_context": "Reusable prompt context for generating posts later. Do not include finished post copy."
    }
  ]
}

Global rules:
- Spreelo must work equally well for businesses from any country, language, region or culture.
- Do not assume a European, English-speaking, Swedish-speaking or Western market.
- If a selected market/country is provided, use it.
- If no market is provided, infer the most likely market from the business description.
- Use GLOBAL only when the business appears clearly international or when no reliable country can be inferred.
- If a preferred content language is provided, write user-facing fields in that language.
- If no preferred content language is provided, use the main language of the business description.
- Do not default to English because the description contains imported product names, platform terms, brand names or isolated phrases.
- Campaigns must be relevant to the selected/inferred market, local culture, local seasonality, local buying behavior and the business type.
- Include local holidays, local gift days, cultural moments, religious/cultural seasons, national shopping moments, school seasons, tourism seasons, weather seasons, industry moments and commercial periods only when they are useful and suitable for that business.
- Do not force internationally famous commercial days if they are not relevant in the selected market.
- Do not include political, sensitive or divisive events unless clearly safe and directly suitable for business marketing.
- Quality matters, but do not under-generate the calendar. A useful business calendar should feel rich enough for a marketing team to choose from.
- Avoid weak filler, but for businesses with clear seasonal, commercial, gift, retail, service, booking or product potential, you must normally return many strong opportunities rather than only a few obvious ones.


Campaign selection quality gate:
- Before finalizing campaign_opportunities, build a broad internal candidate pool of local market moments, shopping periods, gift days, seasonal periods, school/work/life moments, industry moments and business-specific evergreen campaigns. Then select only the strongest opportunities for this exact business.
- Do not choose campaigns because they are generally popular. Choose them only when there is a clear customer reason to buy, book, visit, remember, compare, prepare, celebrate, gift, upgrade, replace, learn or engage with this specific business.
- Apply a strict commercial fit test to every candidate: Would a realistic customer of this business plausibly care about this moment and take a meaningful action related to the business offer? If the answer is no or weak, omit it.
- Strong broad commercial moments that clearly fit the market and business category should normally be included before vague custom campaigns. For example: giftable products should strongly consider local gift days; ecommerce/retail should strongly consider major local shopping periods; restaurants/food should consider relevant food and dining moments; beauty/fashion should consider party, season, wedding, graduation and self-care moments; service/bookable businesses should consider seasonal preparation and booking windows.
- For broad ecommerce and retail, do not miss obvious high-value local shopping and gift moments that are still upcoming in the calendar year. These should normally beat generic evergreen campaigns when they fit the product range.
- Irrelevant theme days must be omitted even if they are commercially famous in the market. A food-specific day belongs to bakeries, grocery, cafes or restaurants, not to unrelated electronics or B2B software. A pet-related day belongs to pet brands, not to unrelated retailers unless their product range genuinely fits.
- Custom or evergreen campaigns are allowed, but they must be grounded in the actual business, website evidence, product range, customer behavior or clear market logic. Do not invent business-specific recurring campaigns, product launches, price robots, proprietary programs, guarantees, discounts, delivery promises, events or features unless they are clearly supported by the provided website/description.
- If a custom campaign title implies a feature, offer, sale, discount, campaign price, launch or program that may not exist, rename it to a safer generic strategy or omit it. For example, prefer a grounded campaign like "Product guide", "Seasonal upgrade", "Gift guide" or "Buying advice" over an unsupported named feature.
- The final calendar should feel like a senior marketer first secured the obvious high-value opportunities for this business and then added only the best extra strategic campaigns.
- For broad ecommerce, retail and product-based businesses, returning only around 10 opportunities is usually under-generated unless the year has already passed or the business is unusually narrow. Prefer 15-20 strong opportunities when enough relevant moments exist.

Campaign quantity:
- Return 15 to 20 campaign opportunities when the brand has strong seasonal/commercial potential.
- Return 12 to 20 campaign opportunities for most other businesses.
- Return fewer than 10 only when the business is genuinely narrow, low-frequency, sensitive or has very limited safe marketing angles.
- Never return more than 20.

Campaign timing:
- Only create campaign opportunities for Calendar year ${campaignCalendarYear}.
- Every event_date, start_date and end_date must be inside Calendar year ${campaignCalendarYear}.
- If an opportunity cannot be placed inside this year, omit it.
- For exact dated events, event_date must be YYYY-MM-DD.
- For date ranges or seasons, use start_date and end_date.
- For date ranges/seasons, the post_plan must still describe the best campaign sequence. Use days_before_event as days before the main campaign date, final event date, or campaign end date. For date ranges, timing_anchor must explain where the post belongs: before_start, start, middle, conversion_window, deadline_before_event, relationship_event or end.
- For date ranges/seasons, each post_plan item should include scheduled_date as YYYY-MM-DD whenever a specific date is strategically best. scheduled_date must be inside the campaign period, or shortly before start_date only when timing_anchor is before_start.
- For date ranges/seasons, do not spread posts with mechanical equal intervals. Create a natural marketing rhythm: launch, early interest, proof/trust, decision window, deadline/closing or relationship close.
- For date ranges/seasons, final urgency/last-chance posts should use timing_anchor "end" or "deadline_before_event" so they are scheduled near the real action deadline, not randomly in the middle.
- For date ranges/seasons, launch/introduction posts should use timing_anchor "start", early preparation posts should use timing_anchor "before_start", and trust/engagement/value posts can use timing_anchor "middle".
- For date ranges/seasons, distinguish the marketing period from the customer action deadline. The campaign may end on a cultural, seasonal or business moment, but conversion-focused posts must be placed when customers can still realistically act.
- If the business offer requires production time, personalization, delivery, booking, reservation, installation, consultation, limited capacity or any other lead time, place product_push, offer and urgency posts before the realistic purchase/action deadline. The final day of the period should then be used for softer relationship, celebration, reminder, educational or brand-building content unless same-day action is realistic.
- Do not rely on named holiday-specific rules. Apply the same timing logic to any gift day, seasonal period, shopping moment, booking window, event period, local tradition or industry campaign.
- The post_plan order must be chronological and strategically progressive: early value/inspiration first, engagement/trust in the middle, conversion before the deadline, and final relationship or closing content at the end when appropriate.
- Avoid clustering most posts in the final few days unless the campaign is explicitly a short flash sale or same-day/instant-action event.
- For gift campaigns, holiday campaigns, physical products, personalized products, handmade products, printed products, shipped products, booking services or anything with lead time, separate the cultural/event date from the realistic customer action deadline.
- For these lead-time campaigns, use the final event date mainly for relationship, greeting, thank-you, celebration or brand warmth, not hard selling.
- For these lead-time campaigns, choose the final sales/order/booking reminder based on the real buying deadline for this specific business, product, market and customer behavior. It may be several weeks before the event for long lead-time offers, or much closer for fast-action offers.
- Do not use fixed day patterns. Decide the best number of posts, exact days_before_event values and publish_time values for each campaign as a senior performance-minded social media marketer would.
- Each post_plan item must include publish_time in HH:MM local time. Choose the time based on weekday, audience behavior, campaign role, business category and whether the post is inspiration, engagement, trust, product discovery, product push, urgency or relationship-building.
- Each post_plan item must include schedule_reason explaining why that specific date offset and time is the best strategic choice.
- The code may validate or clamp impossible dates, but the AI plan should be the source of truth for the campaign sequence.
- Use date_confidence as relevance strength, not proof that the campaign exists on the website: high = strong fit for this business/market, medium = plausible fit, low = weak or uncertain fit.
- If date is uncertain, use date_confidence "low" and prefer a date range.

Campaign strategy:
- Every campaign must be genuinely useful for this business, industry, market and audience.
- Every campaign must include a strategic campaign blueprint.
- Every campaign should move the audience from interest to action.
- recommended_post_count must be between 1 and 10.
- relevance_score, sales_score and engagement_score must be between 1 and 5.
- Do not create finished social media posts.
- Do not invent specific services, products, offers, locations, dates or facts not supported by the description or general market knowledge.

Website-content rules:
- Because no website was provided, website_content_strategy must be "support" or "none".
- Because no website was provided, website_product_selection_hint must be an empty string.
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";

  const parsed = await parseOpenAIJsonWithRepair({
    openai,
    content,
    contextLabel: "description brand analysis response",
    expectedShapeDescription: `
{
  "market_setup": {
    "content_market": "",
    "country_code": "",
    "content_language": "",
    "reason": ""
  },
  "profile": {
    "business_name": "",
    "industry": "",
    "target_audience": "",
    "detected_language": ""
  },
  "campaign_opportunities": []
}
`.trim(),
  });

  if (!parsed?.profile) {
    throw new Error("Spreelo could not read the analysis result correctly.");
  }

  return {
    market_setup: normalizeMarketSetup(
      parsed.market_setup,
      parsed.profile.detected_language
    ),
    profile: {
      business_name: String(
        parsed.profile.business_name || businessName || ""
      ).trim(),
      industry: String(parsed.profile.industry || "").trim(),
      target_audience: String(parsed.profile.target_audience || "").trim(),
      detected_language: String(parsed.profile.detected_language || "").trim(),
    },
    website_product_mode: {
      available: false,
      reason:
        "No website was provided, so website product mode is not available.",
      source_url: "",
    },
    campaign_opportunities: Array.isArray(parsed.campaign_opportunities)
      ? parsed.campaign_opportunities
      : [],
  };
}

export async function checkRateLimit({ supabase, userId }) {
  const now = new Date();

  const lastAllowedTime = new Date(now.getTime() - 60 * 1000).toISOString();
  const last24Hours = new Date(
    now.getTime() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentRuns, error: recentError } = await supabase
    .from("brand_analysis_runs")
    .select("id, created_at")
    .eq("user_id", userId)
    .gte("created_at", last24Hours)
    .order("created_at", { ascending: false });

  if (recentError) {
    throw new Error(recentError.message || "Could not check analyze limit.");
  }

  const runs = recentRuns || [];

  if (runs.length >= 25) {
    throw new Error(
      "Analyze limit reached. You can analyze your brand 25 times per 24 hours."
    );
  }

  const latestRun = runs[0];

  if (latestRun?.created_at && latestRun.created_at > lastAllowedTime) {
    throw new Error("Please wait 1 minute before analyzing again.");
  }
}

export async function logAnalysisRun({ supabase, userId, websiteUrl }) {
  const { error } = await supabase.from("brand_analysis_runs").insert({
    user_id: userId,
    website_url: websiteUrl || "manual_description",
  });

  if (error) {
    throw new Error(error.message || "Could not log analysis run.");
  }
}

export async function saveBrandProfile({
  supabase,
  userId,
  brandProfileId,
  websiteUrl,
  brandDescription,
  profile,
  contentMarket,
  countryCode,
  contentLanguage,
  campaignCalendarYear,
  websiteProductMode,
}) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .update({
      business_name: profile.business_name,
      website_url: websiteUrl || "",
      brand_description: brandDescription || "",
      industry: profile.industry,
      target_audience: profile.target_audience,
      content_market: contentMarket || "",
      country_code: countryCode || "",
      content_language: contentLanguage || "",
      campaign_calendar_year: campaignCalendarYear,
      campaign_calendar_generated_at: new Date().toISOString(),
      campaign_calendar_refreshed_at: new Date().toISOString(),
      website_product_mode_available: Boolean(websiteProductMode?.available),
      website_product_mode_checked_at: websiteUrl
        ? new Date().toISOString()
        : null,
      website_product_mode_reason: websiteProductMode?.reason || "",
      website_product_source_url: websiteProductMode?.available
        ? websiteProductMode?.source_url || websiteUrl || ""
        : "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .select(
      "id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, campaign_calendar_year, campaign_calendar_generated_at, campaign_calendar_refreshed_at, website_product_mode_available, website_product_mode_checked_at, website_product_mode_reason, website_product_source_url"
    )
    .single();

  if (error) {
    throw new Error(error.message || "Could not save brand profile.");
  }

  return data;
}

export async function replaceBrandCampaignOpportunities({
  supabase,
  userId,
  brandProfileId,
  contentMarket,
  countryCode,
  contentLanguage,
  industry,
  campaignCalendarYear,
  opportunities,
}) {
  const safeOpportunities = normalizeCampaignOpportunities(
    opportunities,
    campaignCalendarYear
  );

  const { error: deleteError } = await supabase
    .from("brand_campaign_opportunities")
    .delete()
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("event_year", campaignCalendarYear)
    .eq("is_ai_generated", true);

  if (deleteError) {
    throw new Error(
      deleteError.message || "Could not replace campaign opportunities."
    );
  }

  if (safeOpportunities.length === 0) {
    return [];
  }

  const now = new Date().toISOString();

  const rows = safeOpportunities.map((opportunity) => ({
    user_id: userId,
    brand_profile_id: brandProfileId,

    title: opportunity.title,
    slug: opportunity.slug,
    description: opportunity.description,

    country_code: countryCode || "",
    market: contentMarket || "",
    language: contentLanguage || "",
    industry: industry || "",

    event_type: opportunity.event_type,
    event_date: opportunity.event_date,
    event_year: opportunity.event_year,

    start_date: opportunity.start_date,
    end_date: opportunity.end_date,

    relevance_reason: opportunity.relevance_reason,
    relevance_score: opportunity.relevance_score,
    sales_score: opportunity.sales_score,
    engagement_score: opportunity.engagement_score,

    recommended_post_count: opportunity.recommended_post_count,

    prompt_context: opportunity.prompt_context,
    campaign_angles: opportunity.campaign_angles,
    post_plan: opportunity.post_plan,

    date_confidence: opportunity.date_confidence,
    website_content_fit: opportunity.website_content_fit,
    website_content_strategy: opportunity.website_content_strategy,
    website_product_selection_hint: opportunity.website_product_selection_hint,

    campaign_category: opportunity.campaign_category,
    campaign_goal: opportunity.campaign_goal,
    target_customer_need: opportunity.target_customer_need,
    recommended_angles: opportunity.recommended_angles,
    product_selection_guidance: opportunity.product_selection_guidance,
    tone_guidance: opportunity.tone_guidance,
    cta_guidance: opportunity.cta_guidance,
    image_guidance: opportunity.image_guidance,
    campaign_blueprint: opportunity.campaign_blueprint,

    is_ai_generated: true,
    is_hidden: false,
    is_active: true,
    is_archived: false,

    generated_at: now,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("brand_campaign_opportunities")
    .insert(rows)
    .select(
      "id, title, event_date, event_year, slug, website_content_fit, website_content_strategy, website_product_selection_hint, campaign_category, campaign_goal, target_customer_need, recommended_angles"
    );

  if (error) {
    throw new Error(error.message || "Could not save campaign opportunities.");
  }

  return data || [];
}

export async function runBrandAnalysisJob({
  supabase,
  userId,
  job,
  updateJob,
}) {
  if (!job?.id) {
    throw new Error("Analysis job not found.");
  }

  const openai = createOpenAIClient();

  await updateJob({
    status: "running",
    step: "starting",
    progress: 5,
    errorMessage: "",
    internalError: "",
    startedAt: new Date().toISOString(),
  });

  await checkRateLimit({
    supabase,
    userId,
  });

  const businessName = String(job.business_name || "").trim();
  const websiteUrl = normalizeWebsiteUrl(job.website_url);
  const brandDescription = String(job.brand_description || "").trim();

  const requestedMarketSetup = inferMarketSetup({
    contentMarket: job.content_market,
    countryCode: job.country_code,
    contentLanguage: job.content_language,
  });

  const contentMarket = requestedMarketSetup.contentMarket;
  const countryCode = requestedMarketSetup.countryCode;
  const requestedContentLanguage = requestedMarketSetup.contentLanguage;

  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const campaignCalendarYear = now.getUTCFullYear();

  let analysis;
  let finalWebsiteUrl = websiteUrl;
  let detectedWebsiteContentLanguage = "";

  if (websiteUrl) {
    await updateJob({
      status: "running",
      step: "reading_website",
      progress: 15,
    });

    const website = await fetchWebsiteHtml(websiteUrl);
    finalWebsiteUrl = website.url;

    if (!requestedContentLanguage) {
      await updateJob({
        status: "running",
        step: "detecting_language",
        progress: 25,
      });

      const languageDetection = await detectWebsiteLanguageWithOpenAI({
        openai,
        websiteUrl: website.url,
        html: website.html,
      });

      detectedWebsiteContentLanguage = languageDetection.language || "";
    }

    await updateJob({
      status: "running",
      step: "finding_products",
      progress: 40,
    });

    const productSourceCandidates = await fetchProductSourceCandidates({
      websiteUrl: website.url,
      html: website.html,
    });

    await updateJob({
      status: "running",
      step: "creating_profile",
      progress: 65,
    });

    analysis = await analyzeWebsiteWithOpenAI({
      openai,
      businessName,
      websiteUrl: website.url,
      html: website.html,
      productSourceCandidates,
      brandDescription,
      contentMarket,
      countryCode,
      contentLanguage:
        requestedContentLanguage || detectedWebsiteContentLanguage,
      currentDate,
      campaignCalendarYear,
    });
  } else {
    await updateJob({
      status: "running",
      step: "creating_profile",
      progress: 65,
    });

    analysis = await analyzeDescriptionWithOpenAI({
      openai,
      businessName,
      brandDescription,
      contentMarket,
      countryCode,
      contentLanguage: requestedContentLanguage,
      currentDate,
      campaignCalendarYear,
    });
  }

  await updateJob({
    status: "running",
    step: "saving",
    progress: 90,
  });

  const profile = analysis.profile;
  const detectedMarketSetup = analysis.market_setup || {};

  const finalContentMarket =
    detectedMarketSetup.contentMarket || contentMarket || "";

  const finalCountryCode = detectedMarketSetup.countryCode || countryCode || "";

  const finalContentLanguage = getDefaultLanguage(
    requestedContentLanguage ||
      detectedWebsiteContentLanguage ||
      detectedMarketSetup.contentLanguage,
    profile.detected_language
  );

  const savedProfile = await saveBrandProfile({
    supabase,
    userId,
    brandProfileId: job.brand_profile_id,
    websiteUrl: finalWebsiteUrl,
    brandDescription,
    profile,
    contentMarket: finalContentMarket,
    countryCode: finalCountryCode,
    contentLanguage: finalContentLanguage,
    campaignCalendarYear,
    websiteProductMode: analysis.website_product_mode,
  });

  const strategicCampaignOpportunities = buildStrategicCampaignOpportunitySet({
    opportunities: analysis.campaign_opportunities,
    campaignCalendarYear,
    currentDate,
    contentLanguage: finalContentLanguage,
    industry: profile.industry,
    websiteProductMode: analysis.website_product_mode,
  });

  const savedOpportunities = await replaceBrandCampaignOpportunities({
    supabase,
    userId,
    brandProfileId: job.brand_profile_id,
    contentMarket: finalContentMarket,
    countryCode: finalCountryCode,
    contentLanguage: finalContentLanguage,
    industry: profile.industry,
    campaignCalendarYear,
    opportunities: strategicCampaignOpportunities,
  });

  await logAnalysisRun({
    supabase,
    userId,
    websiteUrl: finalWebsiteUrl,
  });

  const completedJob = await updateJob({
    status: "completed",
    step: "completed",
    progress: 100,
    result: {
      website_url: finalWebsiteUrl,
      profile: savedProfile,
      detected_language: profile.detected_language || null,
      content_market: finalContentMarket,
      country_code: finalCountryCode,
      content_language: finalContentLanguage,
      website_product_mode: analysis.website_product_mode,
      campaign_opportunities_count: savedOpportunities.length,
      campaign_opportunities: savedOpportunities,
    },
    completedAt: new Date().toISOString(),
  });

  return completedJob;
}
