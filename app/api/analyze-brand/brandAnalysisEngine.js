import OpenAI from "openai";
import { OPENAI_MODELS, withOpenAITemperature } from "../../../lib/openaiSettings.js";
import { assertPublicHttpUrl } from "../../../lib/security.js";
import {
  inferContentLanguageFromWebsiteSignals,
  inferMarketSetupFromWebsiteSignals,
  normalizeSingleContentLanguage,
} from "../../../lib/contentLanguage.js";

export const WEBSITE_FETCH_TIMEOUT_MS = 12000;
export const WEBSITE_MAX_TEXT_CHARS = 8000;
export const WEBSITE_MAX_PRODUCT_SOURCE_PAGES = 8;
export const WEBSITE_MAX_PRODUCT_SOURCE_FETCH_TIMEOUT_MS = 5000;
export const WEBSITE_MAX_PRODUCT_SOURCE_TEXT_CHARS = 3500;
export const MAX_CAMPAIGN_OPPORTUNITIES = 12;
export const WEBSITE_MAX_CONTEXT_LINK_CANDIDATES = 60;
export const WEBSITE_PRODUCT_ASSORTMENT_HINT_MAX_ITEMS = 80;
export const WEBSITE_PRODUCT_METADATA_REPAIR_MAX_OPPORTUNITIES = 12;

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
    model: OPENAI_MODELS.helper,
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
    ...withOpenAITemperature("jsonRepair"),
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
  const sourceHtml = String(html || "");
  const linkRegex =
    /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;
  let linkIndex = 0;

  while ((match = linkRegex.exec(sourceHtml)) !== null) {
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

    const linkText = stripHtmlToText(`${beforeHrefAttributes} ${afterHrefAttributes} ${rawInnerHtml}`);
    const pathSegments = getPathSegments(cleanUrl);
    const surroundingStart = Math.max(0, match.index - 450);
    const surroundingEnd = Math.min(sourceHtml.length, linkRegex.lastIndex + 450);
    const surroundingText = truncateText(
      stripHtmlToText(sourceHtml.slice(surroundingStart, surroundingEnd)),
      700
    );

    // Language-neutral pre-filtering only. Relevance is decided by AI from
    // URL, link text and surrounding text so global sites are not biased toward
    // Swedish or English keywords.
    let score = 0;

    if (pathSegments.length >= 1 && pathSegments.length <= 4) {
      score += 8;
    }

    if (linkText.length >= 2 && linkText.length <= 180) {
      score += 4;
    }

    if (surroundingText.length >= 20) {
      score += 3;
    }

    if (linkIndex < 40) {
      score += Math.max(0, 8 - Math.floor(linkIndex / 5));
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
        surrounding_text: surroundingText,
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

  const safeWebsiteUrl = await assertPublicHttpUrl(normalizedWebsiteUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(safeWebsiteUrl, {
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
      url: safeWebsiteUrl,
      html,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function selectWebsiteContextLinksWithOpenAI({ openai, websiteUrl, html }) {
  const sourceLinks = extractProductSourceLinks(html, websiteUrl).slice(
    0,
    WEBSITE_MAX_CONTEXT_LINK_CANDIDATES
  );

  if (!sourceLinks.length || !openai) {
    return sourceLinks.slice(0, WEBSITE_MAX_PRODUCT_SOURCE_PAGES);
  }

  const linkRows = sourceLinks
    .map((link, index) => {
      const text = String(link.text || "").trim();
      const surrounding = String(link.surrounding_text || "").trim();
      return `${index + 1}. URL: ${link.url}\nLink text: ${text || "Not found"}\nSurrounding text: ${surrounding || "Not found"}`;
    })
    .join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODELS.helper,
      messages: [
        {
          role: "system",
          content:
            "You select website pages for multilingual business analysis. Return strict JSON only.",
        },
        {
          role: "user",
          content: `
The website homepage has these internal links.

Choose 6 to 10 pages that are most useful for understanding what this business does, sells, offers, who it serves, how customers contact/buy/book, and what social media posts could be based on.

Rules:
- Work for any country, language, writing system or culture.
- Do not rely on Swedish or English keywords.
- Use the URL, visible link text and surrounding text to judge meaning.
- Prefer pages that explain the business, products, services, offers, item lists, booking/contact paths, references/cases, about information or other customer-relevant evidence.
- Avoid technical, duplicate, legal-only, login/account, cart/checkout, feed, policy-only and file/media URLs unless they are clearly needed to understand the business.
- Return only URLs from the supplied list.

Website: ${websiteUrl}

Internal links:
${linkRows}

Return JSON only:
{
  "selected_urls": ["https://example.com/page"],
  "reason": "Short explanation"
}
`.trim(),
        },
      ],
      ...withOpenAITemperature("websiteContextSelection"),
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const parsed = await parseOpenAIJsonWithRepair({
      openai,
      content,
      contextLabel: "website context link selection response",
      expectedShapeDescription: `
{
  "selected_urls": ["URL from the supplied list"],
  "reason": "Short explanation"
}
`.trim(),
    });

    const selectedSet = new Set(
      (Array.isArray(parsed?.selected_urls) ? parsed.selected_urls : [])
        .map((url) => String(url || "").split("#")[0].trim())
        .filter(Boolean)
    );

    const selectedLinks = sourceLinks.filter((link) => selectedSet.has(link.url));

    if (selectedLinks.length) {
      return selectedLinks.slice(0, WEBSITE_MAX_PRODUCT_SOURCE_PAGES);
    }
  } catch (error) {
    console.error("Could not select website context links with AI", {
      websiteUrl,
      message: error.message,
    });
  }

  return sourceLinks.slice(0, WEBSITE_MAX_PRODUCT_SOURCE_PAGES);
}

export async function fetchProductSourceCandidates({ openai, websiteUrl, html }) {
  const sourceLinks = await selectWebsiteContextLinksWithOpenAI({
    openai,
    websiteUrl,
    html,
  });

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
        surrounding_text: link.surrounding_text || "",
        score: link.score || 0,
      });
    } catch (error) {
      console.error("Could not fetch website context page", {
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
    return "No additional website context pages were selected or fetched.";
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


function addAssortmentHint(hints, value, sourceUrl = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (!text || text.length < 2 || text.length > 180) {
    return;
  }

  const key = text.toLocaleLowerCase();

  if (hints.seen.has(key)) {
    return;
  }

  hints.seen.add(key);
  hints.items.push({ text, source_url: sourceUrl || "" });
}

export function buildProductAssortmentHints({ html, websiteUrl, productSourceCandidates }) {
  const hints = { seen: new Set(), items: [] };
  const links = extractProductSourceLinks(html, websiteUrl).slice(0, 120);

  for (const link of links) {
    addAssortmentHint(hints, link.text, link.url);

    if (hints.items.length >= WEBSITE_PRODUCT_ASSORTMENT_HINT_MAX_ITEMS) {
      break;
    }
  }

  for (const candidate of Array.isArray(productSourceCandidates) ? productSourceCandidates : []) {
    addAssortmentHint(hints, candidate.title, candidate.url);
    addAssortmentHint(hints, candidate.description, candidate.url);

    const text = String(candidate.text || "");
    const lines = text
      .split(/[\n.?!•|]+/u)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 3 && line.length <= 140)
      .slice(0, 18);

    for (const line of lines) {
      addAssortmentHint(hints, line, candidate.url);

      if (hints.items.length >= WEBSITE_PRODUCT_ASSORTMENT_HINT_MAX_ITEMS) {
        break;
      }
    }

    if (hints.items.length >= WEBSITE_PRODUCT_ASSORTMENT_HINT_MAX_ITEMS) {
      break;
    }
  }

  return hints.items.slice(0, WEBSITE_PRODUCT_ASSORTMENT_HINT_MAX_ITEMS);
}

export function formatProductAssortmentHintsForPrompt(hints) {
  const items = Array.isArray(hints) ? hints : [];

  if (!items.length) {
    return "No compact product/category hints could be extracted from the checked website pages.";
  }

  return items
    .slice(0, WEBSITE_PRODUCT_ASSORTMENT_HINT_MAX_ITEMS)
    .map((item, index) => {
      const source = item.source_url ? ` Source: ${item.source_url}` : "";
      return `${index + 1}. ${item.text}${source}`;
    })
    .join("\n");
}

function campaignNeedsProductMetadata(opportunity) {
  const strategy = String(opportunity?.website_content_strategy || "").toLowerCase().trim();

  if (!["product", "service"].includes(strategy)) {
    return false;
  }

  const matchTerms = normalizeCampaignTerms(opportunity?.product_match_terms);
  const blueprintMatchTerms = normalizeCampaignTerms(opportunity?.campaign_blueprint?.product_match_terms);
  const searchQueries = normalizeCampaignTerms(
    opportunity?.product_search_queries || opportunity?.campaign_blueprint?.product_search_queries
  );

  return matchTerms.length === 0 && blueprintMatchTerms.length === 0 && searchQueries.length === 0;
}

function mergeCampaignProductMetadata(opportunity, metadata) {
  if (!opportunity || !metadata) {
    return opportunity;
  }

  const productMatchTerms = normalizeCampaignProductTermsForOpportunity(
    opportunity,
    metadata.product_match_terms
  );
  const productSearchQueries = normalizeCampaignProductTermsForOpportunity(
    opportunity,
    metadata.product_search_queries || metadata.search_queries || metadata.local_search_queries
  );
  const productAvoidTerms = normalizeCampaignTerms(
    metadata.product_avoid_terms || metadata.avoid_terms || metadata.negative_terms
  );
  const productSelectionGuidance = normalizeShortText(
    metadata.product_selection_guidance || opportunity.product_selection_guidance,
    700
  );
  const websiteProductSelectionHint = normalizeWebsiteProductSelectionHint(
    metadata.website_product_selection_hint || opportunity.website_product_selection_hint
  );

  const merged = {
    ...opportunity,
    product_match_terms: productMatchTerms.length ? productMatchTerms : opportunity.product_match_terms,
    product_search_queries: productSearchQueries.length ? productSearchQueries : opportunity.product_search_queries,
    product_avoid_terms: productAvoidTerms.length ? productAvoidTerms : opportunity.product_avoid_terms,
    avoid_terms: productAvoidTerms.length ? productAvoidTerms : opportunity.avoid_terms,
    product_selection_guidance: productSelectionGuidance || opportunity.product_selection_guidance,
    website_product_selection_hint: websiteProductSelectionHint || opportunity.website_product_selection_hint,
  };

  merged.campaign_blueprint = normalizeCampaignBlueprint(merged);

  return merged;
}

async function repairCampaignProductMetadataWithOpenAI({
  openai,
  campaignOpportunities,
  websiteProductMode,
  businessName,
  websiteUrl,
  contentMarket,
  countryCode,
  contentLanguage,
  industry,
  targetAudience,
  visibleText,
  productSourceCandidateText,
  productAssortmentHintText,
}) {
  const opportunities = Array.isArray(campaignOpportunities) ? campaignOpportunities : [];
  const needsRepair = opportunities
    .map((opportunity, index) => ({ opportunity, index }))
    .filter(({ opportunity }) => campaignNeedsProductMetadata(opportunity))
    .slice(0, WEBSITE_PRODUCT_METADATA_REPAIR_MAX_OPPORTUNITIES);

  if (!openai || !websiteProductMode?.available || !needsRepair.length) {
    return opportunities;
  }

  try {
    const repairRows = needsRepair
      .map(({ opportunity, index }) => `${index + 1}. Title: ${opportunity.title}\nStrategy: ${opportunity.website_content_strategy}\nGoal: ${opportunity.campaign_goal || ""}\nNeed: ${opportunity.target_customer_need || ""}\nGuidance: ${opportunity.product_selection_guidance || opportunity.website_product_selection_hint || ""}`)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODELS.helper,
      messages: [
        {
          role: "system",
          content:
            "You repair missing product-selection metadata for a global social media automation tool. Return strict JSON only.",
        },
        {
          role: "user",
          content: `
Some product-based campaign opportunities are missing product_match_terms/product_search_queries.
Create compact, campaign-specific product metadata that helps a website product engine find matching items.

Rules:
- Work in the business/customer language and market. Do not default to Swedish or English unless the website/market uses those terms.
- Do not use hardcoded holiday dictionaries. Infer terms from the campaign, market, business type, website evidence and product/category hints below.
- product_match_terms: 10 to 20 concrete product/category/use-case/search terms likely to appear in product titles, category names, URLs or customer searches for items that truly fit the campaign.
- product_search_queries: 5 to 10 short website search/category queries to try first.
- product_avoid_terms: 6 to 15 broad nearby-but-wrong product/category terms when there are obvious risks. Use [] only if there are no clear wrong nearby categories.
- Do not invent exact product names unless they are supported by the provided website hints. Category/search terms are fine.
- Do not over-block the store. Avoid terms should prevent bad substitutions, not ban everything outside one narrow word.
- If a campaign is product-based, never return empty product_match_terms or empty product_search_queries.

Business:
${businessName || "Not provided"}

Website:
${websiteUrl}

Market/country/language:
${contentMarket || "Not provided"} / ${countryCode || "Not provided"} / ${contentLanguage || "Use website language"}

Industry:
${industry || "Not provided"}

Target audience:
${targetAudience || "Not provided"}

Compact product/category hints from the website:
${productAssortmentHintText || "Not available"}

Additional checked website pages:
${truncateText(productSourceCandidateText, 12000)}

Homepage/context excerpt:
${truncateText(visibleText, 6000)}

Campaigns to repair:
${repairRows}

Return JSON only:
{
  "campaigns": [
    {
      "index": 1,
      "title": "same title",
      "product_match_terms": ["term"],
      "product_search_queries": ["query"],
      "product_avoid_terms": ["term"],
      "product_selection_guidance": "Short guidance for selecting matching products and avoiding weak substitutions.",
      "website_product_selection_hint": "Short product-selection hint."
    }
  ]
}
`.trim(),
        },
      ],
      ...withOpenAITemperature("productMetadataRepair"),
      response_format: { type: "json_object" },
      max_completion_tokens: 5000,
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const parsed = await parseOpenAIJsonWithRepair({
      openai,
      content,
      contextLabel: "campaign product metadata repair response",
      expectedShapeDescription: `
{
  "campaigns": [
    {
      "index": 1,
      "title": "",
      "product_match_terms": [],
      "product_search_queries": [],
      "product_avoid_terms": [],
      "product_selection_guidance": "",
      "website_product_selection_hint": ""
    }
  ]
}
`.trim(),
    });

    const repairsByIndex = new Map();

    for (const repair of Array.isArray(parsed?.campaigns) ? parsed.campaigns : []) {
      const index = Number.parseInt(repair?.index, 10) - 1;

      if (Number.isInteger(index) && index >= 0) {
        repairsByIndex.set(index, repair);
      }
    }

    return opportunities.map((opportunity, index) =>
      repairsByIndex.has(index)
        ? mergeCampaignProductMetadata(opportunity, repairsByIndex.get(index))
        : opportunity
    );
  } catch (error) {
    console.error("Could not repair campaign product metadata with AI", {
      websiteUrl,
      message: error.message,
    });

    return opportunities;
  }
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

export function normalizeCampaignTerms(value) {
  const rawTerms = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[,;|\n]+/u)
    : [];
  const seen = new Set();
  const terms = [];

  for (const rawTerm of rawTerms) {
    const term = String(rawTerm || "").replace(/\s+/g, " ").trim();
    const key = term.toLocaleLowerCase();

    if (!term || key.length < 2 || /^\d+$/.test(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    terms.push(term.slice(0, 70));

    if (terms.length >= 24) {
      break;
    }
  }

  return terms;
}

function normalizeCampaignTermText(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCampaignTermText(value) {
  return normalizeCampaignTermText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function getCommonPrefixLength(firstValue, secondValue) {
  const first = normalizeCampaignTermText(firstValue);
  const second = normalizeCampaignTermText(secondValue);
  const maxLength = Math.min(first.length, second.length);
  let index = 0;

  while (index < maxLength && first[index] === second[index]) {
    index += 1;
  }

  return index;
}

function getCompactCampaignAnchorRoot(token) {
  const value = normalizeCampaignTermText(token);

  if (value.length < 10) {
    return "";
  }

  return value.slice(0, 3);
}

function getCampaignTermAnchorTokens(rawOpportunity) {
  const sourceText = [
    rawOpportunity?.title,
    rawOpportunity?.campaign_goal,
    rawOpportunity?.target_customer_need,
    rawOpportunity?.prompt_context,
    rawOpportunity?.product_selection_guidance,
    rawOpportunity?.website_product_selection_hint,
    rawOpportunity?.campaign_blueprint?.campaign_goal,
    rawOpportunity?.campaign_blueprint?.target_customer_need,
    rawOpportunity?.campaign_blueprint?.product_selection_guidance,
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = tokenizeCampaignTermText(sourceText);
  const anchors = [];
  const seen = new Set();

  for (const token of tokens) {
    for (const value of [getCompactCampaignAnchorRoot(token), token]) {
      if (!value || seen.has(value)) {
        continue;
      }

      seen.add(value);
      anchors.push(value);

      if (anchors.length >= 10) {
        return anchors;
      }
    }
  }

  return anchors;
}

function campaignTermHasAnchor(term, anchorTokens) {
  const termText = normalizeCampaignTermText(term);
  const termTokens = tokenizeCampaignTermText(termText);

  if (!termText || !anchorTokens.length) {
    return true;
  }

  for (const anchor of anchorTokens) {
    if (!anchor) continue;
    if (termText.includes(anchor)) {
      return true;
    }

    for (const token of termTokens) {
      const minLength = Math.min(token.length, anchor.length);
      const commonLength = getCommonPrefixLength(token, anchor);

      if (token === anchor || commonLength >= Math.min(6, minLength) || commonLength >= Math.ceil(minLength * 0.75)) {
        return true;
      }
    }
  }

  return false;
}

function anchorCampaignTerm(term, anchorTokens) {
  const cleanTerm = String(term || "").replace(/\s+/g, " ").trim();
  const anchor = anchorTokens.find(Boolean);

  if (!cleanTerm || !anchor || campaignTermHasAnchor(cleanTerm, anchorTokens)) {
    return cleanTerm;
  }

  return `${anchor} ${cleanTerm}`.slice(0, 70);
}

function normalizeCampaignProductTermsForOpportunity(rawOpportunity, value, limit = 24) {
  const terms = normalizeCampaignTerms(value);
  const anchorTokens = getCampaignTermAnchorTokens(rawOpportunity);
  const anchoredTerms = terms.map((term) => anchorCampaignTerm(term, anchorTokens));

  return normalizeCampaignTerms(anchoredTerms).slice(0, limit);
}


function addUniqueCampaignTerms(target, values, limit = 24) {
  if (!Array.isArray(target)) return target;

  const existing = new Set(
    target
      .map((value) => String(value || "").toLocaleLowerCase().trim())
      .filter(Boolean)
  );

  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = String(rawValue || "").replace(/\s+/g, " ").trim();
    const key = value.toLocaleLowerCase();

    if (!value || key.length < 2 || /^\d+$/.test(key) || existing.has(key)) {
      continue;
    }

    target.push(value.slice(0, 70));
    existing.add(key);

    if (target.length >= limit) {
      break;
    }
  }

  return target;
}

// Product campaign terms are generated by AI, then anchored to the campaign's
// own title/context. Do not infer localized holiday dictionaries in code here;
// Spreelo must work globally across languages and markets.

export function normalizeCampaignBlueprint(rawOpportunity) {
  const recommendedAngles = normalizeRecommendedAngles(
    rawOpportunity?.recommended_angles || rawOpportunity?.campaign_angles
  );
  const productMatchTerms = normalizeCampaignProductTermsForOpportunity(
    rawOpportunity,
    rawOpportunity?.product_match_terms
  );
  const productSearchQueries = normalizeCampaignProductTermsForOpportunity(
    rawOpportunity,
    rawOpportunity?.product_search_queries ||
      rawOpportunity?.search_queries ||
      rawOpportunity?.local_search_queries
  );
  const avoidTerms = normalizeCampaignTerms(
    rawOpportunity?.avoid_terms ||
      rawOpportunity?.product_avoid_terms ||
      rawOpportunity?.negative_terms
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
    product_match_terms: productMatchTerms,
    product_search_queries: productSearchQueries,
    product_avoid_terms: avoidTerms,
    avoid_terms: avoidTerms,
  };
}

export function hasProductBasedWebsiteEvidence(evidenceText) {
  const text = String(evidenceText || "");

  if (!text.trim()) {
    return false;
  }

  // Language-neutral backup only. The primary product/service mode decision is
  // made by AI from the full website context. This backup avoids Swedish/English
  // commerce word lists and only looks for structured product/offer markup,
  // SKU-like identifiers, currency symbols/codes or repeated item-card markup.
  let score = 0;

  if (/schema\.org\/(Product|Offer|AggregateOffer)/i.test(text)) score += 4;
  if (/"@type"\s*:\s*"(?:Product|Offer|AggregateOffer)"/i.test(text)) score += 4;
  if (/\b(?:sku|gtin|mpn|itemprop=["'](?:price|offers|sku)["'])\b/i.test(text)) score += 3;
  if (/\p{Sc}\s?\d|\d\s?\p{Sc}/u.test(text)) score += 2;
  if (/\b(?:USD|EUR|GBP|CAD|AUD|JPY|CNY|INR|SEK|NOK|DKK|CHF|AED|SAR)\b/i.test(text)) score += 1;

  const repeatedStructuredItems = (text.match(/itemtype=["'][^"']*(?:Product|Offer)[^"']*["']/gi) || []).length;
  if (repeatedStructuredItems >= 2) score += 3;

  return score >= 4;
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
  const productMatchTerms = normalizeCampaignProductTermsForOpportunity(
    rawOpportunity,
    rawOpportunity?.product_match_terms
  );
  const productSearchQueries = normalizeCampaignProductTermsForOpportunity(
    rawOpportunity,
    rawOpportunity?.product_search_queries ||
      rawOpportunity?.search_queries ||
      rawOpportunity?.local_search_queries
  );
  const productAvoidTerms = normalizeCampaignTerms(
    rawOpportunity?.product_avoid_terms ||
      rawOpportunity?.avoid_terms ||
      rawOpportunity?.negative_terms
  );

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
    product_match_terms: productMatchTerms,
    product_search_queries: productSearchQueries,
    product_avoid_terms: productAvoidTerms,
    avoid_terms: productAvoidTerms,
    tone_guidance: normalizeShortText(rawOpportunity?.tone_guidance, 500),
    cta_guidance: normalizeShortText(rawOpportunity?.cta_guidance, 500),
    image_guidance: normalizeShortText(rawOpportunity?.image_guidance, 500),
    campaign_blueprint: normalizeCampaignBlueprint(rawOpportunity),
  };
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


// Campaign opportunities must come from AI using the selected market, language and website context.
// Do not add hardcoded Swedish/English fallback calendars.

function buildStrategicCampaignOpportunitySet({
  opportunities,
  campaignCalendarYear,
  currentDate,
  contentLanguage = "",
  websiteProductMode = null,
}) {
  const normalizedSource = normalizeCampaignOpportunities(
    Array.isArray(opportunities) ? opportunities : [],
    campaignCalendarYear
  ).filter((opportunity) => isOpportunityUpcomingOnDate(opportunity, currentDate));

  const selected = [];
  const usedSlugs = new Set();

  function addOpportunity(opportunity) {
    if (!opportunity || selected.length >= MAX_CAMPAIGN_OPPORTUNITIES) return;
    const slug = opportunity.slug || slugify(opportunity.title);
    if (!slug || usedSlugs.has(slug)) return;
    usedSlugs.add(slug);
    selected.push(opportunity);
  }

  // Keep only AI-chosen campaign opportunities. A thin AI result is safer than
  // injecting hardcoded market/language fallback campaigns into a global product.
  normalizedSource.forEach(addOpportunity);

  return selected.slice(0, MAX_CAMPAIGN_OPPORTUNITIES);
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

    contentLanguage: normalizeSingleContentLanguage(
      rawSetup.content_language ||
        rawSetup.contentLanguage ||
        rawSetup.language ||
        fallbackLanguage ||
        "",
      fallbackLanguage || "English"
    ),

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
    model: OPENAI_MODELS.helper,
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
    ...withOpenAITemperature("languageDetection"),
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
  const productAssortmentHints = buildProductAssortmentHints({
    html,
    websiteUrl,
    productSourceCandidates,
  });
  const productAssortmentHintText =
    formatProductAssortmentHintsForPrompt(productAssortmentHints);
  const productModeEvidenceText = [
    title,
    description,
    visibleText,
    productSourceCandidateText,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODELS.brandAnalysis,
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

Compact product/category hints extracted from website links and checked pages:
${productAssortmentHintText}

Additional website context pages checked:
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
      "product_match_terms": ["10-20 compact product/category/use-case/search terms that should identify matching products for this campaign, in the business/customer language plus common local synonyms when useful"],
      "product_search_queries": ["5-10 short website search/category queries to find matching items for this campaign"],
      "product_avoid_terms": ["6-15 broad nearby-but-wrong product/category/search terms that should be avoided for this campaign when better matching products exist"],
      "avoid_terms": ["Same values as product_avoid_terms for compatibility"],
      "relevance_reason": "Why this opportunity fits this specific business",
      "relevance_score": 1,
      "sales_score": 1,
      "engagement_score": 1,
      "recommended_post_count": 5,
      "campaign_angles": ["angle 1", "angle 2"],
      "post_plan": [],
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
- Do not force internationally famous commercial days if they are not relevant in the selected market. Use your market knowledge to choose the correct local holidays, gift days, religious/cultural seasons and shopping moments for the selected/inferred country, language and audience.
- Do not include political, sensitive or divisive events unless clearly safe and directly suitable for business marketing.
- Quality matters, but do not under-generate the calendar. A useful business calendar should feel rich enough for a marketing team to choose from.
- Avoid weak filler, but for businesses with clear seasonal, commercial, gift, retail, service, booking or product potential, you must normally return many strong opportunities rather than only a few obvious ones.
- There is no hardcoded fallback calendar. You must create the campaign opportunities in the selected/inferred language and market yourself.


Campaign selection quality gate:
- Before finalizing campaign_opportunities, build a broad internal candidate pool of local market moments, shopping periods, gift days, seasonal periods, school/work/life moments, industry moments and business-specific evergreen campaigns. Then select only the strongest opportunities for this exact business.
- Do not choose campaigns because they are generally popular. Choose them only when there is a clear customer reason to buy, book, visit, remember, compare, prepare, celebrate, gift, upgrade, replace, learn or engage with this specific business.
- Apply a strict commercial fit test to every candidate: Would a realistic customer of this business plausibly care about this moment and take a meaningful action related to the business offer? If the answer is no or weak, omit it.
- Strong broad commercial moments that clearly fit the market and business category should normally be included before vague custom campaigns. For example: giftable products should strongly consider local gift days; ecommerce/retail should strongly consider major local shopping periods; restaurants/food should consider relevant food and dining moments; beauty/fashion should consider party, season, wedding, graduation and self-care moments; service/bookable businesses should consider seasonal preparation and booking windows.
- For broad ecommerce and retail, do not miss obvious high-value local shopping and gift moments that are still upcoming in the calendar year for the selected/inferred market. These should normally beat generic evergreen campaigns when they fit the product range.
- Irrelevant theme days must be omitted even if they are commercially famous in the market. A food-specific day belongs to bakeries, grocery, cafes or restaurants, not to unrelated electronics or B2B software. A pet-related day belongs to pet brands, not to unrelated retailers unless their product range genuinely fits.
- Custom or evergreen campaigns are allowed, but they must be grounded in the actual business, website evidence, product range, customer behavior or clear market logic. Do not invent business-specific recurring campaigns, product launches, price robots, proprietary programs, guarantees, discounts, delivery promises, events or features unless they are clearly supported by the provided website/description.
- If a custom campaign title implies a feature, offer, sale, discount, campaign price, launch or program that may not exist, rename it to a safer generic strategy or omit it. For example, prefer a grounded campaign like "Product guide", "Seasonal upgrade", "Gift guide" or "Buying advice" over an unsupported named feature.
- The final calendar should feel like a senior marketer first secured the obvious high-value opportunities for this business and then added only the best extra strategic campaigns.
- For broad ecommerce, retail and product-based businesses, return a focused but useful set of the strongest upcoming opportunities. Prefer quality and speed over generating a huge calendar in this first analysis.

Campaign quantity:
- Return 10 to 12 campaign opportunities for the first brand analysis when the business has clear commercial, seasonal, retail, gift, ecommerce, service, booking, restaurant, food, beauty, fashion or product-based potential.
- Return 8 to 9 only when the business is genuinely narrow, low-frequency, sensitive or has limited safe marketing angles.
- Do not return only 5-6 opportunities for normal retail/ecommerce/product/service businesses. That feels unfinished.
- Never return more than 12.

Campaign timing:
- Only create campaign opportunities for Calendar year ${campaignCalendarYear}.
- Every event_date, start_date and end_date must be inside Calendar year ${campaignCalendarYear}.
- If an opportunity cannot be placed inside this year, omit it.
- For exact dated events, event_date must be YYYY-MM-DD.
- For date ranges or seasons, use start_date and end_date.
- A healthy calendar should normally include several fixed-date opportunities when the market and business make them relevant. For giftable, retail, ecommerce, food, fashion, beauty, local service or product-based businesses, include relevant fixed local dates such as local Mother's Day, Father's Day, Valentine's Day, Christmas date(s), Halloween, Singles Day, national/local shopping days or culturally relevant holidays when they fit.
- Do not replace obvious relevant fixed-date opportunities with broad evergreen campaigns. Evergreen/custom campaigns may supplement the calendar, not dominate it.
- Do not generate detailed post_plan items during brand analysis. Always return post_plan as an empty array []. Spreelo creates the detailed post sequence later only when the user chooses a campaign.
- recommended_post_count should still reflect how many posts the selected campaign should later create.
- Use date_confidence as relevance strength, not proof that the campaign exists on the website: high = strong fit for this business/market, medium = plausible fit, low = weak or uncertain fit.
- If date is uncertain, use date_confidence "low" and prefer a date range.

Campaign strategy:
- Every campaign must be genuinely useful for this business, industry, market and audience.
- Every campaign must include a strategic campaign blueprint.
- For every campaign_opportunity that uses website_content_strategy "product" or "service", create product_match_terms, product_search_queries, product_avoid_terms and avoid_terms yourself. These are compact search/filter terms for the product engine, not finished social copy. They must be broad enough to find several different matching products over repeated posts, but still specific to the campaign.
- Use the compact product/category hints from the website and the checked context pages when creating these terms. The terms should reflect what this business appears to sell, not a generic holiday dictionary.
- product_match_terms must contain 10-20 concrete terms customers or product URLs/titles/categories are likely to use for products that truly fit this campaign. Include local-language synonyms, common imported terms only when they are actually used in that market, recipient/use-case/category words, and product-type words when useful.
- product_search_queries must contain 5-10 short website search/category queries the product engine should try first.
- product_avoid_terms and avoid_terms must contain 6-15 broad or misleading nearby product categories that should not be selected when better campaign-specific products exist. Use [] only if there are no obvious nearby wrong product groups.
- For themed campaigns, each product_match_term must be able to identify products that fit the campaign by itself. Do not include broad store categories merely because the business sells them or because they could be given as gifts.
- If a product category is broad but useful, combine it with the campaign theme, recipient, occasion or local search phrase instead of using the broad category alone. For example, prefer theme/category phrases over standalone category words.
- Do not put standalone broad assortment/category words in product_match_terms unless the term also carries the campaign theme, occasion, recipient, use case or the campaign is explicitly about that category.
- product_search_queries are mandatory for product/service campaigns. They should be the exact short searches the store search should try first, including local-language theme/category combinations when useful.
- Before returning each product_match_term, ask: "If the product engine searched only this term, would the results mostly fit this campaign?" If not, rewrite it with the campaign theme/occasion/recipient or move it to avoid_terms.
- Keep these fields short, language-aware and market-aware. Do not rely on Swedish or English unless that fits the business/market.
- These fields are used directly by the product engine, so never leave product_match_terms or product_search_queries empty for product/service-based campaigns. Create enough specific, non-overlapping terms to support product rotation across multiple posts without repeating the same products.
- Every campaign should move the audience from interest to action.
- Keep each campaign object compact. Do not create long schedule explanations or finished post copy in this analysis.
- recommended_post_count must be between 1 and 10.
- relevance_score, sales_score and engagement_score must be between 1 and 5.
- Choose recommended_post_count from the actual campaign complexity and commercial value, not from a fixed template. A minor awareness moment may need 1-2 posts, a strong sales/booking period may need 3-5, and a major lead-time campaign may need 5-7.

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
- Do not invent business-specific facts beyond the provided content. You may use general market knowledge for holidays, shopping periods, cultural seasons and local commercial timing.
- Do not create finished social media posts.
`.trim(),
      },
    ],
    ...withOpenAITemperature("brandAnalysis"),
    response_format: { type: "json_object" },
    max_completion_tokens: 12000,
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

  const normalizedMarketSetup = normalizeMarketSetup(
    parsed.market_setup,
    parsed.profile.detected_language
  );
  const normalizedProfile = {
    business_name: String(
      parsed.profile.business_name || businessName || ""
    ).trim(),
    industry: String(parsed.profile.industry || "").trim(),
    target_audience: String(parsed.profile.target_audience || "").trim(),
    detected_language: String(parsed.profile.detected_language || "").trim(),
  };
  const normalizedWebsiteProductMode = normalizeWebsiteProductMode(
    parsed.website_product_mode,
    websiteUrl,
    productModeEvidenceText
  );
  const campaignOpportunities = await repairCampaignProductMetadataWithOpenAI({
    openai,
    campaignOpportunities: Array.isArray(parsed.campaign_opportunities)
      ? parsed.campaign_opportunities
      : [],
    websiteProductMode: normalizedWebsiteProductMode,
    businessName: normalizedProfile.business_name || businessName,
    websiteUrl,
    contentMarket: normalizedMarketSetup.content_market || contentMarket,
    countryCode: normalizedMarketSetup.country_code || countryCode,
    contentLanguage: normalizeSingleContentLanguage(
      normalizedMarketSetup.contentLanguage ||
        contentLanguage ||
        normalizedProfile.detected_language,
      "English"
    ),
    industry: normalizedProfile.industry,
    targetAudience: normalizedProfile.target_audience,
    visibleText,
    productSourceCandidateText,
    productAssortmentHintText,
  });

  return {
    market_setup: normalizedMarketSetup,
    profile: normalizedProfile,
    website_product_mode: normalizedWebsiteProductMode,
    campaign_opportunities: campaignOpportunities,
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
    model: OPENAI_MODELS.brandAnalysis,
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
      "product_match_terms": ["10-20 compact product/category/use-case/search terms that should identify matching products for this campaign, in the business/customer language plus common local synonyms when useful"],
      "product_search_queries": ["5-10 short website search/category queries to find matching items for this campaign"],
      "product_avoid_terms": ["6-15 broad nearby-but-wrong product/category/search terms that should be avoided for this campaign when better matching products exist"],
      "avoid_terms": ["Same values as product_avoid_terms for compatibility"],
      "relevance_reason": "Why this opportunity fits this specific business",
      "relevance_score": 1,
      "sales_score": 1,
      "engagement_score": 1,
      "recommended_post_count": 5,
      "campaign_angles": ["angle 1", "angle 2"],
      "post_plan": [],
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
- Do not force internationally famous commercial days if they are not relevant in the selected market. Use your market knowledge to choose the correct local holidays, gift days, religious/cultural seasons and shopping moments for the selected/inferred country, language and audience.
- Do not include political, sensitive or divisive events unless clearly safe and directly suitable for business marketing.
- Quality matters, but do not under-generate the calendar. A useful business calendar should feel rich enough for a marketing team to choose from.
- Avoid weak filler, but for businesses with clear seasonal, commercial, gift, retail, service, booking or product potential, you must normally return many strong opportunities rather than only a few obvious ones.
- There is no hardcoded fallback calendar. You must create the campaign opportunities in the selected/inferred language and market yourself.


Campaign selection quality gate:
- Before finalizing campaign_opportunities, build a broad internal candidate pool of local market moments, shopping periods, gift days, seasonal periods, school/work/life moments, industry moments and business-specific evergreen campaigns. Then select only the strongest opportunities for this exact business.
- Do not choose campaigns because they are generally popular. Choose them only when there is a clear customer reason to buy, book, visit, remember, compare, prepare, celebrate, gift, upgrade, replace, learn or engage with this specific business.
- Apply a strict commercial fit test to every candidate: Would a realistic customer of this business plausibly care about this moment and take a meaningful action related to the business offer? If the answer is no or weak, omit it.
- Strong broad commercial moments that clearly fit the market and business category should normally be included before vague custom campaigns. For example: giftable products should strongly consider local gift days; ecommerce/retail should strongly consider major local shopping periods; restaurants/food should consider relevant food and dining moments; beauty/fashion should consider party, season, wedding, graduation and self-care moments; service/bookable businesses should consider seasonal preparation and booking windows.
- For broad ecommerce and retail, do not miss obvious high-value local shopping and gift moments that are still upcoming in the calendar year for the selected/inferred market. These should normally beat generic evergreen campaigns when they fit the product range.
- Irrelevant theme days must be omitted even if they are commercially famous in the market. A food-specific day belongs to bakeries, grocery, cafes or restaurants, not to unrelated electronics or B2B software. A pet-related day belongs to pet brands, not to unrelated retailers unless their product range genuinely fits.
- Custom or evergreen campaigns are allowed, but they must be grounded in the actual business, website evidence, product range, customer behavior or clear market logic. Do not invent business-specific recurring campaigns, product launches, price robots, proprietary programs, guarantees, discounts, delivery promises, events or features unless they are clearly supported by the provided website/description.
- If a custom campaign title implies a feature, offer, sale, discount, campaign price, launch or program that may not exist, rename it to a safer generic strategy or omit it. For example, prefer a grounded campaign like "Product guide", "Seasonal upgrade", "Gift guide" or "Buying advice" over an unsupported named feature.
- The final calendar should feel like a senior marketer first secured the obvious high-value opportunities for this business and then added only the best extra strategic campaigns.
- For broad ecommerce, retail and product-based businesses, return a focused but useful set of the strongest upcoming opportunities. Prefer quality and speed over generating a huge calendar in this first analysis.

Campaign quantity:
- Return 10 to 12 campaign opportunities for the first brand analysis when the business has clear commercial, seasonal, retail, gift, ecommerce, service, booking, restaurant, food, beauty, fashion or product-based potential.
- Return 8 to 9 only when the business is genuinely narrow, low-frequency, sensitive or has limited safe marketing angles.
- Do not return only 5-6 opportunities for normal retail/ecommerce/product/service businesses. That feels unfinished.
- Never return more than 12.

Campaign timing:
- Only create campaign opportunities for Calendar year ${campaignCalendarYear}.
- Every event_date, start_date and end_date must be inside Calendar year ${campaignCalendarYear}.
- If an opportunity cannot be placed inside this year, omit it.
- For exact dated events, event_date must be YYYY-MM-DD.
- For date ranges or seasons, use start_date and end_date.
- A healthy calendar should normally include several fixed-date opportunities when the market and business make them relevant. For giftable, retail, ecommerce, food, fashion, beauty, local service or product-based businesses, include relevant fixed local dates such as local Mother's Day, Father's Day, Valentine's Day, Christmas date(s), Halloween, Singles Day, national/local shopping days or culturally relevant holidays when they fit.
- Do not replace obvious relevant fixed-date opportunities with broad evergreen campaigns. Evergreen/custom campaigns may supplement the calendar, not dominate it.
- Do not generate detailed post_plan items during brand analysis. Always return post_plan as an empty array []. Spreelo creates the detailed post sequence later only when the user chooses a campaign.
- recommended_post_count should still reflect how many posts the selected campaign should later create.
- Use date_confidence as relevance strength, not proof that the campaign exists on the website: high = strong fit for this business/market, medium = plausible fit, low = weak or uncertain fit.
- If date is uncertain, use date_confidence "low" and prefer a date range.

Campaign strategy:
- Every campaign must be genuinely useful for this business, industry, market and audience.
- Every campaign must include a strategic campaign blueprint.
- For every campaign_opportunity that uses website_content_strategy "product" or "service", create product_match_terms, product_search_queries, product_avoid_terms and avoid_terms yourself. These are compact search/filter terms for the product engine, not finished social copy. They must be broad enough to find several different matching products over repeated posts, but still specific to the campaign.
- Use the compact product/category hints from the website and the checked context pages when creating these terms. The terms should reflect what this business appears to sell, not a generic holiday dictionary.
- product_match_terms must contain 10-20 concrete terms customers or product URLs/titles/categories are likely to use for products that truly fit this campaign. Include local-language synonyms, common imported terms only when they are actually used in that market, recipient/use-case/category words, and product-type words when useful.
- product_search_queries must contain 5-10 short website search/category queries the product engine should try first.
- product_avoid_terms and avoid_terms must contain 6-15 broad or misleading nearby product categories that should not be selected when better campaign-specific products exist. Use [] only if there are no obvious nearby wrong product groups.
- For themed campaigns, each product_match_term must be able to identify products that fit the campaign by itself. Do not include broad store categories merely because the business sells them or because they could be given as gifts.
- If a product category is broad but useful, combine it with the campaign theme, recipient, occasion or local search phrase instead of using the broad category alone. For example, prefer theme/category phrases over standalone category words.
- Do not put standalone broad assortment/category words in product_match_terms unless the term also carries the campaign theme, occasion, recipient, use case or the campaign is explicitly about that category.
- product_search_queries are mandatory for product/service campaigns. They should be the exact short searches the store search should try first, including local-language theme/category combinations when useful.
- Before returning each product_match_term, ask: "If the product engine searched only this term, would the results mostly fit this campaign?" If not, rewrite it with the campaign theme/occasion/recipient or move it to avoid_terms.
- Keep these fields short, language-aware and market-aware. Do not rely on Swedish or English unless that fits the business/market.
- These fields are used directly by the product engine, so never leave product_match_terms or product_search_queries empty for product/service-based campaigns. Create enough specific, non-overlapping terms to support product rotation across multiple posts without repeating the same products.
- Every campaign should move the audience from interest to action.
- Keep each campaign object compact. Do not create long schedule explanations or finished post copy in this analysis.
- recommended_post_count must be between 1 and 10.
- relevance_score, sales_score and engagement_score must be between 1 and 5.
- Do not create finished social media posts.
- Do not invent specific services, products, offers, locations, dates or facts not supported by the description or general market knowledge.

Website-content rules:
- Because no website was provided, website_content_strategy must be "support" or "none".
- Because no website was provided, website_product_selection_hint must be an empty string.
- Use the selected or inferred market to choose culturally correct holidays, seasonal moments and shopping periods; do not apply a Swedish/Western template unless that is the actual market fit.
`.trim(),
      },
    ],
    ...withOpenAITemperature("descriptionAnalysis"),
    response_format: { type: "json_object" },
    max_completion_tokens: 12000,
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
      "id, title, event_date, event_year, slug, website_content_fit, website_content_strategy, website_product_selection_hint, campaign_category, campaign_goal, target_customer_need, recommended_angles, product_selection_guidance, campaign_blueprint"
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
  let detectedWebsiteMarketSetup = null;

  if (websiteUrl) {
    await updateJob({
      status: "running",
      step: "reading_website",
      progress: 15,
    });

    const website = await fetchWebsiteHtml(websiteUrl);
    finalWebsiteUrl = website.url;
    detectedWebsiteMarketSetup = inferMarketSetupFromWebsiteSignals(website.url, website.html);

    if (!requestedContentLanguage) {
      await updateJob({
        status: "running",
        step: "detecting_language",
        progress: 25,
      });

      detectedWebsiteContentLanguage = inferContentLanguageFromWebsiteSignals(
        website.url,
        website.html
      );
    }

    await updateJob({
      status: "running",
      step: "selecting_context_pages",
      progress: 35,
    });

    const productSourceCandidates = await fetchProductSourceCandidates({
      openai,
      websiteUrl: website.url,
      html: website.html,
    });

    await updateJob({
      status: "running",
      step: "creating_profile",
      progress: 45,
    });

    analysis = await analyzeWebsiteWithOpenAI({
      openai,
      businessName,
      websiteUrl: website.url,
      html: website.html,
      productSourceCandidates,
      brandDescription,
      contentMarket: detectedWebsiteMarketSetup?.contentMarket || contentMarket,
      countryCode: detectedWebsiteMarketSetup?.countryCode || countryCode,
      contentLanguage:
        requestedContentLanguage || detectedWebsiteMarketSetup?.contentLanguage || detectedWebsiteContentLanguage,
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
    detectedWebsiteMarketSetup?.contentMarket ||
    detectedMarketSetup.contentMarket ||
    contentMarket ||
    "";

  const finalCountryCode =
    detectedWebsiteMarketSetup?.countryCode || detectedMarketSetup.countryCode || countryCode || "";

  const finalContentLanguage = normalizeSingleContentLanguage(
    getDefaultLanguage(
      requestedContentLanguage ||
        detectedWebsiteMarketSetup?.contentLanguage ||
        detectedWebsiteContentLanguage ||
        detectedMarketSetup.contentLanguage,
      profile.detected_language
    ),
    "English"
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
