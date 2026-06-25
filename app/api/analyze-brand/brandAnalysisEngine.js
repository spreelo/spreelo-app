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
