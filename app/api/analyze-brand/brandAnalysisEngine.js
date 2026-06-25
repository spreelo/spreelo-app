import OpenAI from "openai";

export const WEBSITE_FETCH_TIMEOUT_MS = 12000;
export const WEBSITE_MAX_TEXT_CHARS = 18000;
export const WEBSITE_MAX_PRODUCT_SOURCE_PAGES = 4;
export const WEBSITE_MAX_PRODUCT_SOURCE_TEXT_CHARS = 9000;
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

export async function fetchWebsiteHtml(websiteUrl) {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

  if (!normalizedWebsiteUrl) {
    throw new Error("Website URL is required");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    WEBSITE_FETCH_TIMEOUT_MS
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
      const candidate = await fetchWebsiteHtml(link.url);

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

export function normalizeWebsiteProductMode(rawValue, fallbackWebsiteUrl = "") {
  const rawMode = rawValue || {};

  const available = Boolean(rawMode.available);

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
        ? "The website appears to contain stable individual items that can be used for website-based posts."
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
