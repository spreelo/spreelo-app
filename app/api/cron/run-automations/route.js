import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";
import sharp from "sharp";
import {
  detectLikelyUiLocaleFromText,
  getServerTranslations,
  resolveBestServerLocale,
  resolveUiLocaleFromLanguageName,
} from "../../../../lib/i18n/serverUiText.js";
import {
  isConnectionAuthFailure,
  markConnectionExpiredAndAlert,
} from "../../../../lib/socialConnectionAlerts.js";

export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "UTC";
const BATCH_SIZE = 25;
const APP_URL = "https://app.spreelo.com";
const RESEND_FROM_EMAIL = "Spreelo <noreply@spreelo.com>";
const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const WEBSITE_MAX_PAGES = 8;
const WEBSITE_MAX_TEXT_CHARS_PER_PAGE = 6500;
const WEBSITE_MAX_TOTAL_TEXT_CHARS = 22000;
const WEBSITE_MAX_IMAGE_CANDIDATES = 40;
const WEBSITE_PRODUCT_REUSE_LIMIT = 100;
const WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT = 150;
const WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT = 120;
const WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT = 18;
const CAMPAIGN_STRONG_PRODUCT_FIT_SCORE = 80;
const CAROUSEL_MIN_PRODUCT_SLIDES = 5;
const CAROUSEL_PRODUCT_SLIDE_TARGET = 5;
const CAROUSEL_OUTRO_SLIDE_COUNT = 1;
const CAROUSEL_MAX_PRODUCT_SLIDES = CAROUSEL_PRODUCT_SLIDE_TARGET + CAROUSEL_OUTRO_SLIDE_COUNT;

const PRODUCT_RESEARCH_MODEL = "gpt-5.5";
const POST_TEXT_MODEL = "gpt-4.1-mini";
const IMAGE_MODEL = "gpt-image-2";
const INSTAGRAM_GRAPH_API_VERSION =
  process.env.INSTAGRAM_GRAPH_API_VERSION || "v21.0";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getRuleTimeZone(rule) {
  return rule?.timezone || DEFAULT_TIME_ZONE;
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPostContentForHtml(content) {
  return escapeHtml(content).replace(/\n/g, "<br />");
}


function escapeSvg(value) {
  return escapeHtml(String(value || "").replace(/\s+/g, " ").trim());
}

function splitTextIntoLines(value, maxCharsPerLine, maxLines) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!words.length) {
    return [];
  }

  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (words.length && lines.length) {
    const consumed = lines.join(" ").split(" ").filter(Boolean).length;
    if (consumed < words.length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.…]+$/g, "")}…`;
    }
  }

  return lines.slice(0, maxLines);
}

function buildSvgTextBlock(lines, { x, y, fontSize, lineHeight, fontWeight = 400, fill = "#0f172a" }) {
  if (!Array.isArray(lines) || !lines.length) {
    return "";
  }

  const spans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${spans}</text>`;
}


async function renderCarouselProductSlideImage({
  sourceImageUrl,
}) {
  const width = 1080;
  const height = 1080;
  const cardX = 64;
  const cardY = 64;
  const cardWidth = 952;
  const cardHeight = 952;
  const imageX = 116;
  const imageY = 116;
  const imageWidth = 848;
  const imageHeight = 848;

  const backgroundSvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="0" fill="#f5f7fb"/>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="42" fill="#ffffff" stroke="#d9e2f0" stroke-width="3"/>
      <rect x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" rx="30" fill="#f8fafc"/>
    </svg>
  `;

  const composites = [{
    input: Buffer.from(backgroundSvg),
    top: 0,
    left: 0,
  }];

  if (sourceImageUrl) {
    try {
      const sourceBuffer = await fetchImageBufferForOverlay(sourceImageUrl);
      const productImageBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize({
          width: imageWidth,
          height: imageHeight,
          fit: 'contain',
          background: { r: 248, g: 250, b: 252, alpha: 1 },
          withoutEnlargement: false,
        })
        .png()
        .toBuffer();

      composites.push({
        input: productImageBuffer,
        top: imageY,
        left: imageX,
      });
    } catch (error) {
      console.error('Carousel product slide image fetch/render failed', {
        sourceImageUrl,
        message: error.message,
      });
    }
  }

  const outputBuffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 245, g: 247, b: 251, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return {
    imageBase64: outputBuffer.toString('base64'),
  };
}

function getDateYYYYMMDDInTimeZone(
  date = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

function getWeekdayInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(date);
}

function getTimeHHMMInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

function getDatePartsInTimeZone(
  date = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function zonedLocalToUtcDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcTime = utcGuess - offset;

  const correctedOffset = getTimeZoneOffsetMs(new Date(utcTime), timeZone);

  if (correctedOffset !== offset) {
    utcTime = utcGuess - correctedOffset;
  }

  return new Date(utcTime);
}

function hasAlreadyRunToday(rule, now = new Date()) {
  if (!rule.last_run_at) return false;

  const timeZone = getRuleTimeZone(rule);

  const lastRunDate = getDateYYYYMMDDInTimeZone(
    new Date(rule.last_run_at),
    timeZone
  );

  const today = getDateYYYYMMDDInTimeZone(now, timeZone);

  return lastRunDate === today;
}

function isRuleDueByOldSchedule(rule, now = new Date()) {
  const publishTime = normalizeTime(rule.publish_time);
  const timeZone = getRuleTimeZone(rule);

  if (!rule.is_active) return false;
  if (!publishTime) return false;

  const today = getDateYYYYMMDDInTimeZone(now, timeZone);
  const currentWeekday = getWeekdayInTimeZone(now, timeZone);
  const currentTime = getTimeHHMMInTimeZone(now, timeZone);

  if (rule.schedule_type === "once") {
    if (!rule.run_date) return false;

    if (rule.run_date < today) return true;

    return rule.run_date === today && publishTime <= currentTime;
  }

  if (rule.schedule_type === "weekly") {
    if (!rule.weekday) return false;

    return (
      String(rule.weekday).toLowerCase() ===
        String(currentWeekday).toLowerCase() && publishTime <= currentTime
    );
  }

  return false;
}

function getNextWeeklyRunAtIso(rule, now = new Date()) {
  const publishTime = normalizeTime(rule.publish_time);
  const timeZone = getRuleTimeZone(rule);

  if (!rule.weekday || !publishTime) {
    return null;
  }

  const [hourValue, minuteValue] = publishTime.split(":");

  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const targetWeekdayIndex = WEEKDAYS.findIndex(
    (weekday) => weekday.toLowerCase() === String(rule.weekday).toLowerCase()
  );

  if (targetWeekdayIndex === -1) {
    return null;
  }

  const currentWeekday = getWeekdayInTimeZone(now, timeZone);

  const currentWeekdayIndex = WEEKDAYS.findIndex(
    (weekday) =>
      weekday.toLowerCase() === String(currentWeekday).toLowerCase()
  );

  if (currentWeekdayIndex === -1) {
    return null;
  }

  let daysUntilNextRun =
    (targetWeekdayIndex - currentWeekdayIndex + 7) % 7;

  if (daysUntilNextRun === 0) {
    daysUntilNextRun = 7;
  }

  const localParts = getDatePartsInTimeZone(now, timeZone);

  const nextRunUtcDate = zonedLocalToUtcDate({
    year: localParts.year,
    month: localParts.month,
    day: localParts.day + daysUntilNextRun,
    hour,
    minute,
    second: 0,
    timeZone,
  });

  return nextRunUtcDate.toISOString();
}

function getRuleUpdatePayloadAfterSuccess(rule, nowIso, now) {
  const payload = {
    last_run_at: nowIso,
    last_error: null,
    updated_at: nowIso,
  };

  if (rule.schedule_type === "once") {
    payload.is_active = false;
    payload.next_run_at = null;
  }

  if (rule.schedule_type === "weekly") {
    payload.next_run_at = getNextWeeklyRunAtIso(rule, now);
  }

  return payload;
}

function getLanguageInstruction(language) {
  if (!language || language === "Auto") {
    return `
Language: Auto-detect from the user's instruction.

Important language rule:
- Write the final post in the same language as the user's instruction.
- If the user's instruction is in Swedish, write the post in Swedish.
- If the user's instruction is in English, write the post in English.
- If the user's instruction is in Danish, Norwegian, German, Spanish, French or any other language, write the post in that same language.
- Do not translate to English unless the user specifically asks for English.
`.trim();
  }

  if (language === "English") {
    return `
Language: English.

Important language rule:
- Write the final post in English, even if the user's instruction is written in another language.
`.trim();
  }

  return `
Language: ${language}.

Important language rule:
- Write the final post in ${language}.
`.trim();
}

function formatBrandProfileForPrompt(brandProfile) {
  if (!brandProfile) {
    return `
No brand profile was found for this user.

Important:
- Do not invent a random business.
- Use only the user instruction and automation settings.
- If the user instruction is too generic, keep the post broadly useful but avoid pretending to know a specific industry.
`.trim();
  }

  return `
Business name: ${brandProfile.business_name || "Not provided"}
Website URL: ${brandProfile.website_url || "Not provided"}
Website product source URL: ${
  brandProfile.website_product_source_url || "Not provided"
}
Industry / business type: ${brandProfile.industry || "Not provided"}
Target audience: ${brandProfile.target_audience || "Not provided"}
`.trim();
}

function getWebsiteProductSourceUrl(brandProfile) {
  return normalizeWebsiteUrl(
    brandProfile?.website_product_source_url || brandProfile?.website_url
  );
}

function formatCampaignStrategyForPrompt(rule) {
  const hasStrategy =
    rule.campaign_phase ||
    rule.marketing_angle ||
    rule.customer_stage ||
    rule.cta_strength ||
    rule.campaign_goal ||
    rule.target_customer_need ||
    rule.strategy_notes ||
    rule.campaign_post_index ||
    rule.campaign_post_count;

  if (!hasStrategy) {
    return "";
  }

  return `
Campaign strategy:
${rule.campaign_post_index && rule.campaign_post_count
  ? `Post ${rule.campaign_post_index} of ${rule.campaign_post_count}`
  : "Campaign post"}

Campaign phase: ${rule.campaign_phase || "Not provided"}
Marketing angle: ${rule.marketing_angle || "Not provided"}
Customer stage: ${rule.customer_stage || "Not provided"}
CTA strength: ${rule.cta_strength || "Not provided"}
Campaign goal: ${rule.campaign_goal || "Not provided"}
Target customer need: ${rule.target_customer_need || "Not provided"}
Strategy notes: ${rule.strategy_notes || "Not provided"}

Important campaign strategy rules:
- Follow the campaign strategy above when writing the post.
- The marketing angle should control the main purpose of the post.
- The customer stage should control how direct or sales-focused the post feels.
- For customer_stage "cold", build interest, recognition or engagement before selling.
- For customer_stage "warm", create confidence, explain value or make the product/service easier to consider.
- For customer_stage "ready_to_buy", make the next step clear and action-oriented.
- For cta_strength "soft", use a light call to action such as inviting people to explore, think, comment or learn more.
- For cta_strength "medium", use a clear but natural call to action.
- For cta_strength "strong", use a direct action-focused call to action.
- Do not make every campaign post sound the same.
- Do not ignore the user's instruction, but let the strategy guide how the instruction is turned into a post.
`.trim();
}

function formatWebsiteItemForPrompt(websiteItem) {
  if (!websiteItem) {
    return "No specific website item was selected.";
  }

  const verifiedPrice = getTrustedWebsiteItemPrice(websiteItem);

  return `
Selected website item:
Title: ${websiteItem.title || "Not provided"}
Type: ${websiteItem.type || "Not provided"}
URL: ${websiteItem.url || "Not provided"}
Description: ${websiteItem.description || "Not provided"}
Verified price: ${verifiedPrice || "Not provided"}
Image URL: ${websiteItem.image_url || "Not provided"}

Important website item rules:
- Base this post on the selected website item above.
- Use only details that are present in the selected item information.
- Use the selected item URL as the destination link when this post promotes the selected item.
- Do not invent prices, discounts, guarantees, availability, dates, addresses, square meters, specifications or claims.
- If a verified price is provided above, you may mention that exact price only, exactly as written, inside a normal sentence. Do not put a price on its own separate line. Do not convert currency and do not change the currency symbol/code.
- If no verified price is provided above, do not mention any price at all.
- Never invent USD, EUR, SEK, kr or any other currency. A price must come from Verified price above.
- Do not add generic price fallback text such as "see current price" or "se aktuellt pris".
- A visible ordinary price is not automatically an offer, sale, discount, deal, bargain, campaign price or limited-time promotion.
- Do not call the item an offer, deal, sale, discount, bargain, fynd, erbjudande, rabatt, rea or kampanjpris unless the selected item information explicitly says that the product is discounted or on sale.
- If information is missing, write around the value and benefit instead of inventing facts.
`.trim();
}


function formatWebsiteItemsForPrompt(items = []) {
  const rows = (items || [])
    .slice(0, CAROUSEL_MAX_PRODUCT_SLIDES)
    .map((item, index) => {
      const verifiedPrice = getTrustedWebsiteItemPrice(item);
      return `Product ${index + 1}:
Title: ${item.title || "Not provided"}
URL: ${item.url || "Not provided"}
Description: ${item.description || "Not provided"}
Verified price: ${verifiedPrice || "Not provided"}
Direct checkout proof: ${verifiedPrice ? "Price visible" : "Not verified - use contact/request-info wording, not buy-now wording"}
Image URL: ${item.image_url || "Not provided"}`;
    });

  if (!rows.length) {
    return "No carousel products were selected.";
  }

  return rows.join("\n\n");
}

function getCarouselProducts(rule) {
  return Array.isArray(rule?.website_items) ? rule.website_items : [];
}

function isValidCarouselProduct(item) {
  return Boolean(item?.title && item?.url && item?.image_url);
}

function dedupeWebsiteItemsByUrlTitleAndImage(items = []) {
  const seen = new Set();
  const unique = [];

  for (const item of items || []) {
    const normalized = normalizeWebsiteItem(item, item?.url || item?.source_url || "");

    if (!normalized || !isValidCarouselProduct(normalized)) {
      continue;
    }

    const key = [
      normalizeComparableValue(canonicalizeWebsiteProductUrl(normalized.url, item?.url || item?.source_url || "") || normalized.url),
      normalizeComparableValue(normalized.title),
      normalizeComparableValue(normalized.image_url),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push({
      ...item,
      ...normalized,
      item_key: normalized.item_key || item.item_key || createItemKey(normalized),
      times_used: Number(item.times_used || 0),
      last_used_at: item.last_used_at || null,
      selection_priority: Number(item.selection_priority || 0),
      campaign_fit_score: Number(item.campaign_fit_score || 0),
      campaign_fit_source: item.campaign_fit_source || null,
    });
  }

  return unique;
}

function selectCarouselProductsFromPool({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  allowReuseWhenExhausted = false,
}) {
  const isCampaignRule = isCampaignScopedWebsiteRule(rule);
  const dedupedItems = dedupeWebsiteItemsByUrlTitleAndImage(items);
  const strongCampaignItems = isCampaignRule
    ? getStrongCampaignFitItems(dedupedItems, rule)
    : [];
  const candidateItems = isCampaignRule && strongCampaignItems.length >= CAROUSEL_MIN_PRODUCT_SLIDES
    ? strongCampaignItems
    : dedupedItems;

  const scored = candidateItems
    .map((item) => {
      const wasUsedRecently = hasWebsiteItemAlreadyBeenUsed(item, recentUsedItems, sourceUrl);
      const imageUsedThisRun = usedWebsiteImageUrlsThisRun.has(normalizeComparableValue(item.image_url));
      const usageCount = Number(item?.times_used || 0);
      const lastUsedAtTs = item?.last_used_at ? Date.parse(item.last_used_at) : 0;
      const campaignFitScore = isCampaignRule ? scoreCampaignFitForRule(item, rule) : 0;
      let score = scoreWebsiteItemForRule(item, rule);

      if (isCampaignRule) {
        // Campaign carousels must be selected by product relevance first.
        // Rotation still matters, but it must never let an unrelated product beat
        // a clearly theme-specific product in the same campaign.
        score += campaignFitScore * 4;
      }

      if (wasUsedRecently) {
        score -= allowReuseWhenExhausted ? 20 : 1000;
      }

      if (imageUsedThisRun) {
        score -= allowReuseWhenExhausted ? 15 : 1000;
      }

      return {
        item,
        score,
        campaignFitScore,
        wasUsedRecently,
        imageUsedThisRun,
        usageCount,
        lastUsedAtTs,
      };
    })
    .filter((entry) => allowReuseWhenExhausted || entry.score > -500)
    .sort((a, b) => {
      if (isCampaignRule && a.campaignFitScore !== b.campaignFitScore) {
        return b.campaignFitScore - a.campaignFitScore;
      }
      if (isCampaignRule && a.score !== b.score) {
        return b.score - a.score;
      }
      if (a.wasUsedRecently !== b.wasUsedRecently) {
        return a.wasUsedRecently ? 1 : -1;
      }
      if (a.imageUsedThisRun !== b.imageUsedThisRun) {
        return a.imageUsedThisRun ? 1 : -1;
      }
      if (a.usageCount !== b.usageCount) {
        return a.usageCount - b.usageCount;
      }
      if (a.lastUsedAtTs !== b.lastUsedAtTs) {
        return a.lastUsedAtTs - b.lastUsedAtTs;
      }
      const priorityDelta = Number(b.item?.selection_priority || 0) - Number(a.item?.selection_priority || 0);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return String(a.item?.title || '').localeCompare(String(b.item?.title || ''));
    });

  return scored
    .map((entry) => ({ ...entry.item, times_used: entry.usageCount, last_used_at: entry.item?.last_used_at || null }))
    .slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
}

async function prepareCarouselProductsForRule({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  const websiteUrl = getWebsiteProductSourceUrl(brandProfile);
  const contentType = rule.content_type_id || "carousel_website_item";

  if (!websiteUrl) {
    throw new Error("Website carousel requires a website URL in Brand profile");
  }

  const recentUsedItems = await getRecentUsedWebsiteItems({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType,
    limit: WEBSITE_PRODUCT_REUSE_LIMIT,
  });

  let catalogItems = filterWebsiteCatalogItemsForRule(
    await getWebsiteProductCatalogItems({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      limit: WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT,
    }),
    rule
  );

  const isCampaignRule = isCampaignScopedWebsiteRule(rule);
  let selectedProducts = isCampaignRule
    ? []
    : selectCarouselProductsFromPool({
        items: catalogItems,
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        allowReuseWhenExhausted: false,
      });

  if (selectedProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES || isCampaignScopedWebsiteRule(rule)) {
    try {
      const webSearchItems = await findWebsiteProductWithWebSearch({
        openai,
        brandProfile,
        rule,
        websiteUrl,
        usedWebsiteItems: recentUsedItems,
      });

      if (Array.isArray(webSearchItems) && webSearchItems.length) {
        catalogItems = [
          ...catalogItems.map((item) => ({ ...item, selection_priority: Number(item.selection_priority || 0) || 10 })),
          ...webSearchItems.map((item) => ({
            ...item,
            selection_priority: 100,
            campaign_fit_source: "ai_campaign_research",
            campaign_fit_score: scoreCampaignFitForRule(item, rule) + 40,
          })),
        ];
        selectedProducts = selectCarouselProductsFromPool({
          items: catalogItems,
          rule,
          sourceUrl: websiteUrl,
          recentUsedItems,
          usedWebsiteImageUrlsThisRun,
          allowReuseWhenExhausted: false,
        });

        if (selectedProducts.length >= CAROUSEL_MIN_PRODUCT_SLIDES) {
          summary.website_web_search_success += 1;
        } else {
          console.log("Carousel web search found products, but not enough usable product images yet", {
            ruleId: rule.id,
            brandProfileId: rule.brand_profile_id,
            websiteUrl,
            webSearchCount: webSearchItems.length,
            selectedCount: selectedProducts.length,
            requiredCount: CAROUSEL_MIN_PRODUCT_SLIDES,
          });
        }
      }
    } catch (webSearchError) {
      console.error("Carousel product web search failed", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        message: webSearchError.message,
      });

      summary.website_web_search_failed += 1;
    }
  }

  if (selectedProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES || isCampaignScopedWebsiteRule(rule)) {
    try {
      const discoveredCandidates = await discoverProductCandidatesFromWebsite({
        websiteUrl,
        campaignPrompt: buildCampaignResearchText(rule),
        usedItems: recentUsedItems,
      });

      if (discoveredCandidates.length) {
        const discoveredItems = await verifyDiscoveredWebsiteProductCandidates({
          candidates: discoveredCandidates,
          websiteUrl,
        });

        catalogItems = [
          ...catalogItems.map((item) => ({ ...item, selection_priority: Number(item.selection_priority || 0) || 10 })),
          ...discoveredItems.map((item) => ({
            ...item,
            selection_priority: 90,
            campaign_fit_source: "campaign_discovery",
            campaign_fit_score: scoreCampaignFitForRule(item, rule),
          })),
        ];
        selectedProducts = selectCarouselProductsFromPool({
          items: catalogItems,
          rule,
          sourceUrl: websiteUrl,
          recentUsedItems,
          usedWebsiteImageUrlsThisRun,
          allowReuseWhenExhausted: false,
        });
      }
    } catch (discoveryError) {
      console.error("Carousel product discovery failed", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        message: discoveryError.message,
      });
    }
  }

  let cycleNumber = await getCurrentWebsiteCycle({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType,
  });

  if (selectedProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES && !isCampaignRule) {
    selectedProducts = selectCarouselProductsFromPool({
      items: catalogItems,
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      allowReuseWhenExhausted: true,
    });

    if (selectedProducts.length >= CAROUSEL_MIN_PRODUCT_SLIDES) {
      cycleNumber += 1;
      summary.website_items_reused_cycle += 1;
    }
  }

  if (isCampaignRule) {
    const selectedStrongCampaignProducts = getStrongCampaignFitItems(selectedProducts, rule);

    if (selectedStrongCampaignProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES) {
      throw new Error(
        `Campaign carousel needs at least ${CAROUSEL_MIN_PRODUCT_SLIDES} clearly campaign-relevant products with product images. Found ${selectedStrongCampaignProducts.length}. Spreelo refused to fill the campaign with generic website products.`
      );
    }

    selectedProducts = selectedStrongCampaignProducts.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  }

  if (selectedProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES) {
    throw new Error(
      `Website carousel needs at least ${CAROUSEL_MIN_PRODUCT_SLIDES} products with product images. Found ${selectedProducts.length}.`
    );
  }

  for (const product of selectedProducts) {
    usedWebsiteImageUrlsThisRun.add(normalizeComparableValue(product.image_url));
  }

  await upsertWebsiteProductCatalogItems({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    items: selectedProducts,
    discoverySource: getWebsiteCatalogDiscoverySource("selected", rule),
  });

  summary.website_items_found += selectedProducts.length;
  summary.website_content_success += 1;
  summary.website_image_used += selectedProducts.length;

  return {
    websiteItems: selectedProducts,
    websiteItem: selectedProducts[0],
    websiteSourceUrl: websiteUrl,
    websiteCycleNumber: cycleNumber,
    useWebsiteImage: true,
  };
}

function getPostDestinationUrl(rule) {
  return (
    rule?.website_item?.url ||
    rule?.brand_profile?.website_url ||
    rule?.website_url ||
    ""
  );
}

function hasExplicitOfferSignal(websiteItem) {
  const text = [
    websiteItem?.title,
    websiteItem?.description,
    websiteItem?.reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return false;

  return /(rabatt|rea|kampanjpris|spara|nedsatt|erbjudande|utförsäljning|sale|discount|deal|offer|save\s+\d|%\s*off|clearance|was\s+|now\s+)/i.test(text);
}


function normalizePriceDigits(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

const PRICE_CURRENCY_WORDS = [
  "kr",
  "sek",
  "nok",
  "dkk",
  "eur",
  "euro",
  "usd",
  "dollar",
  "dollars",
  "gbp",
  "pound",
  "pounds",
  "chf",
  "cad",
  "aud",
  "nzd",
  "jpy",
  "cny",
  "inr",
  "brl",
  "mxn",
  "zar",
  "try",
  "pln",
  "czk",
  "huf",
  "ron",
  "uzs",
  "сум",
];

const PRICE_AMOUNT_PATTERN = String.raw`(?:[$€£]\s*)?\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})?\s*(?:${PRICE_CURRENCY_WORDS.join("|")}\b|:-)|(?:[$€£]\s*)\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})?`;
const PRICE_SENTENCE_REGEX = new RegExp(
  String.raw`[^.!?\n]*${PRICE_AMOUNT_PATTERN}[^.!?\n]*[.!?]?`,
  "gi"
);

function hasCurrencyMarker(value) {
  return /[$€£]|\b(?:kr|sek|nok|dkk|eur|euro|usd|gbp|chf|cad|aud|nzd|jpy|cny|inr|brl|mxn|zar|try|pln|czk|huf|ron|uzs)\b|сум|:-/i.test(String(value || ""));
}

function normalizeVerifiedPriceValue(value) {
  const text = String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || !normalizePriceDigits(text) || !hasCurrencyMarker(text)) {
    return "";
  }

  const match = text.match(new RegExp(PRICE_AMOUNT_PATTERN, "i"));
  return match ? String(match[0] || "").trim() : "";
}

function getHostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyWrongUsdPriceForUrl(price, url) {
  const priceText = String(price || "");

  if (!/(?:\$|\busd\b)/i.test(priceText)) {
    return false;
  }

  const host = getHostnameFromUrl(url);

  if (!host) {
    return false;
  }

  return /\.(?:se|dk|no|fi|de|fr|nl|be|es|it|pt|pl|cz|at|ch|eu|uz)$/i.test(host);
}

function getTrustedWebsiteItemPrice(websiteItem) {
  const price = normalizeVerifiedPriceValue(websiteItem?.price);

  if (!price) {
    return "";
  }

  if (isLikelyWrongUsdPriceForUrl(price, websiteItem?.url || websiteItem?.website_url)) {
    console.warn("Ignored suspicious website item price because currency does not match product URL", {
      productUrl: websiteItem?.url || null,
      rawPrice: truncateText(String(websiteItem?.price || ""), 80),
    });

    return "";
  }

  return price;
}

function isStandaloneUnsupportedPriceLine(line, verifiedDigits) {
  const text = String(line || "").trim();

  if (!text) return false;
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return false;

  return !segmentContainsVerifiedPrice(text, verifiedDigits);
}

function segmentContainsVerifiedPrice(segment, verifiedDigits) {
  if (!verifiedDigits) {
    return false;
  }

  return normalizePriceDigits(segment).includes(verifiedDigits);
}

function stripUnsupportedPriceClaims(postContent, websiteItem) {
  let sanitized = String(postContent || "");
  const verifiedPrice = getTrustedWebsiteItemPrice(websiteItem);
  const verifiedDigits = normalizePriceDigits(verifiedPrice);

  const pricePatterns = [
    /\bPris\s*:\s*[^.!?\n]+[.!?]?/gi,
    /\bPrice\s*:\s*[^.!?\n]+[.!?]?/gi,
    /\bKostar\s+[^.!?\n]+[.!?]?/gi,
    /\bCosts\s+[^.!?\n]+[.!?]?/gi,
    /\bpriced at\s+[^.!?\n]+[.!?]?/gi,
    /\bför endast\s+[^.!?\n]+[.!?]?/gi,
    /\bonly\s+[^.!?\n]+[.!?]?/gi,
    PRICE_SENTENCE_REGEX,
  ];

  for (const pattern of pricePatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      if (segmentContainsVerifiedPrice(match, verifiedDigits)) {
        return match;
      }

      console.warn("Removed unsupported price claim from generated post", {
        verifiedPrice: verifiedPrice || null,
        removed: truncateText(match, 160),
      });

      return "";
    });
  }

  sanitized = sanitized
    .split(/\n/)
    .filter((line) => {
      if (!isStandaloneUnsupportedPriceLine(line, verifiedDigits)) {
        return true;
      }

      console.warn("Removed standalone unsupported price line from generated post", {
        verifiedPrice: verifiedPrice || null,
        removed: truncateText(line, 80),
      });

      return false;
    })
    .join("\n");

  return sanitized
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeUnsupportedOfferLanguage(postContent, websiteItem) {
  if (!postContent) {
    return postContent;
  }

  // Do not rewrite generated copy with Swedish/English keyword replacements.
  // The prompt must prevent unverified offers in the correct language. We only
  // keep language-neutral verified price cleanup below.
  const sanitized = websiteItem?.url
    ? stripUnsupportedPriceClaims(String(postContent), websiteItem)
    : String(postContent);

  return sanitized.trim();
}

function buildAutomationPrompt(rule) {
  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const carouselProducts = getCarouselProducts(rule);
  const websiteItemText = isCarouselRule(rule) && carouselProducts.length
    ? `Selected carousel products:\n${formatWebsiteItemsForPrompt(carouselProducts)}`
    : formatWebsiteItemForPrompt(rule.website_item);
  const campaignStrategyText = formatCampaignStrategyForPrompt(rule);
  const destinationUrl = getPostDestinationUrl(rule);

  return `
Create a ready-to-publish social media post.

Brand profile:
${brandProfileText}

${
  rule.uses_website_content
    ? `
Website content mode:
${isCarouselRule(rule) && carouselProducts.length
  ? `This automation rule is supposed to create a product carousel with at least ${CAROUSEL_MIN_PRODUCT_SLIDES} different website products. The caption should introduce the collection and invite the audience to swipe through the carousel. Do not focus only on one product.`
  : "This automation rule is supposed to promote one concrete product, service, listing, offer or other sellable item from the business website."}

${websiteItemText}
`.trim()
    : ""
}

${campaignStrategyText}

Platform: ${rule.platform || "Instagram"}
${getLanguageInstruction(rule.language)}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Length: ${rule.length || "Medium"}
CTA type: ${rule.cta_type || "Soft CTA"}
Destination URL: ${destinationUrl || "Not provided"}

Include emojis: ${rule.include_emojis ? "Yes" : "No"}
Include hashtags: ${rule.include_hashtags ? "Yes" : "No"}

User instruction:
${rule.prompt || ""}

Critical brand relevance rules:
- The post must clearly fit the Brand profile.
- Do not invent another type of business.
- Do not write generic advice that could apply to any random company.
- Do not write about shopping, product care, cars, restaurants, salons, real estate or other unrelated industries unless the Brand profile says that is the business.
- Use the User instruction as the content angle or post type, but always adapt it to the Brand profile.
- If this is Website content mode and this is not a carousel, focus on the selected website item.
- If this is a carousel, focus on the selected carousel products as a small collection and do not present it as a single-product post.
- If the User instruction says "common mistakes", write common mistakes related to this specific business, industry and audience.
- If the User instruction says "tips", write tips related to this specific business, industry and audience.
- If the User instruction says "FAQ", answer a question that would make sense for this specific business, industry and audience.
- If the User instruction says "behind the scenes", describe something that would realistically happen in this specific business.
- Keep the content useful, specific and trustworthy.
- If Campaign strategy is provided, follow it carefully.
- If the strategy says marketing_angle "awareness", focus on interest, recognition, timing or inspiration before selling.
- If the strategy says marketing_angle "engagement", make the post easy to react to, comment on or relate to.
- If the strategy says marketing_angle "product_discovery", help the audience discover a suitable product, service, idea or option.
- If the strategy says marketing_angle "product_push", make the product, service or offer concrete and relevant.
- If the strategy says marketing_angle "trust", reduce doubt and build confidence without inventing proof, reviews or guarantees.
- If the strategy says marketing_angle "offer", create a clear buying reason without inventing discounts.
- If the strategy says marketing_angle "urgency", make timing matter without exaggerating or using fake scarcity.
- Match CTA strength to the strategy: soft means gentle, medium means clear, strong means action-focused.

Website factual grounding rules:
- Always include the Destination URL in the final post when a Destination URL is available.
- If a selected website item is provided, the Destination URL should be the selected item URL, not just the homepage.
- Place the Destination URL near the end of the post, before hashtags if hashtags are used.
- Keep URLs clean and professional: use the canonical product URL only, without tracking parameters or long collection/search query variants.
- Do not paste multiple links. Use one URL maximum.
- The Destination URL may be introduced with a safe CTA such as "See the product", "View the product", "See our current selection", "Explore available products", "Visit our website", "Learn more about the business", "Contact us through the website" or similar.
- Do not claim that the website contains information about a specific topic, service, product, guide, offer, article or page unless that exact information was provided in the Brand profile or Selected website item.
- Do not write phrases like "read more about this service on our website", "learn more about this topic on our website", "see more details about this offer on our website", "book this service" or "explore this service" unless the website content clearly supports that exact claim.
- Do not imply that a specific service exists unless the Brand profile or Selected website item clearly says the business offers that service.
- If the post uses a general seasonal, educational or awareness angle that is not directly found on the website, keep the CTA general and safe, but still include the website URL.
- For product-based businesses, use safe CTAs such as "see our current selection", "explore available products", "contact us for guidance" or "get help choosing the right option" when that fits the brand.
- If the selected website item has no verified price or direct purchase proof, do not write as if it is a normal webshop checkout product. Use contact/request-info/request-quote style wording instead of buy-now wording.
- For service businesses, use safe CTAs such as "contact us to discuss your needs", "get in touch to learn what fits your situation" or "visit our website" unless a specific bookable service was provided.
- Never invent services, guides, articles, guarantees, discounts, availability, booking pages or website pages that were not provided.
- A product price is not automatically an offer, sale, discount, deal, bargain, fynd, erbjudande, rabatt, rea or kampanjpris. Do not use those words unless the selected item information explicitly confirms a discount or sale.
- For Black Friday, Cyber Monday, Black Week or similar shopping days, you may create buying urgency, but you must still not claim a discount, offer or campaign price unless it is visible in the selected item information.
- It is okay to use a relevant seasonal or educational angle, but do not present it as something the website specifically explains unless it actually does.

Output rules:
- Return only the final post text.
- Do not explain anything.
- Make it suitable for the selected platform.
- Keep the caption compact: normally 2 to 4 short sentences plus optional hashtags. Avoid repeating the same selling point.
- For carousels, write one short intro and one clear CTA. Do not list every product in the caption if the slides already show them.
- For carousel slide titles, use benefit/occasion/gift-angle wording instead of only copying product names when a campaign theme is provided.
- If the selected platform includes both Facebook and Instagram, write a strong core post that works on both. Avoid platform-specific wording such as "click the link" unless a Destination URL is actually included.
- Never mention a price unless it was provided as Verified price for the selected website item. If you mention it, write it naturally inside the text, never as a standalone line.
- Always include the Destination URL in the final post if Destination URL is provided.
- If emojis are disabled, do not use emojis.
- If hashtags are enabled, include relevant hashtags at the end.
- If hashtags are disabled, do not include hashtags.
`.trim();
}

function pickVisualConcept(rule, postContent) {
  const concepts = [
    {
      name: "Environment / setting",
      instruction:
        "Show a relevant environment or setting connected to the business, service or topic. Make it feel natural, professional and brand-appropriate.",
    },
    {
      name: "Detail / close-up",
      instruction:
        "Show a close-up detail that represents the business, service, product or topic. Focus on atmosphere, texture, quality and visual clarity.",
    },
    {
      name: "Human situation",
      instruction:
        "Show a realistic human situation connected to the post topic. The scene should feel natural, respectful and not overly staged. Avoid showing faces clearly unless it fits naturally.",
    },
    {
      name: "Service in focus",
      instruction:
        "Visualize the service or value being provided, without making unrealistic claims. Show the benefit or context in a professional and believable way.",
    },
    {
      name: "Before / after feeling",
      instruction:
        "Create a visual sense of improvement, change, clarity or progress. Do not use split-screen before/after unless explicitly requested.",
    },
    {
      name: "Local / seasonal context",
      instruction:
        "Use a local, seasonal or time-specific feeling if it fits the post. Make it relevant without adding text or obvious clichés.",
    },
    {
      name: "Symbolic / conceptual",
      instruction:
        "Create a symbolic or conceptual image that supports the message in a tasteful, premium and easy-to-understand way.",
    },
    {
      name: "Behind the scenes",
      instruction:
        "Show a behind-the-scenes style image connected to the business or process. It should feel authentic, calm and trustworthy.",
    },
  ];

  const seed = `${rule.id || ""}-${rule.last_run_at || ""}-${
    rule.next_run_at || ""
  }-${postContent || ""}`;

  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const selectedIndex = Math.abs(hash) % concepts.length;

  return concepts[selectedIndex];
}

function buildImagePrompt(rule, postContent) {
  const hasCustomImagePrompt = Boolean(
    rule.image_prompt && String(rule.image_prompt).trim()
  );

  const visualConcept = pickVisualConcept(rule, postContent);
  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const websiteItemText = formatWebsiteItemForPrompt(rule.website_item);

  return `
Create one high-quality square social media image for a business post.

Brand profile:
${brandProfileText}

${
  rule.uses_website_content
    ? `
Website content mode:
${websiteItemText}
`.trim()
    : ""
}

This image must be adapted to the specific business, industry, post topic and audience.
Do not create a generic stock-photo image unless that clearly fits the business.
Do not invent a different type of company than the one described in the Brand profile.

Platform: ${rule.platform || "Facebook"}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Language context: ${rule.language || "Auto"}
Website URL: ${rule.brand_profile?.website_url || "Not provided"}

Selected visual concept:
${visualConcept.name}

Visual concept instruction:
${visualConcept.instruction}

User's post instruction:
${rule.prompt || "Not provided"}

Final post text this image should support:
${postContent}

${
  hasCustomImagePrompt
    ? `
Customer's visual direction:
${rule.image_prompt}

Follow this visual direction closely, but do not repeat the exact same scene every time.
Use the selected visual concept above to create variation.
`.trim()
    : `
No custom visual direction was provided.

Create a professional marketing image that fits the business and post naturally.
Infer the visual style from the brand profile, selected website item, user instruction, post text, platform, tone, post type and selected visual concept.
`.trim()
}

Image quality rules:
- The image must feel relevant to the specific business and post, not random.
- Use a clear visual subject or scene that supports the message.
- Make it visually attractive, polished and suitable for social media.
- Avoid repeating the same composition every time.
- Avoid cluttered compositions.
- Avoid fake-looking generic stock photo style when possible.
- Avoid exaggerated, misleading or unrealistic visuals.
- Do not include logos unless explicitly requested.
- Do not include readable text in the image unless explicitly requested.
- Do not include exact countdown numbers, "days left", "dagar kvar", date countdowns or time-left claims in AI-generated images unless the prompt explicitly provides a verified scheduled post date and verified main campaign date. If unsure, show the campaign theme without a countdown number.
- If the post text contains a countdown, do not create a conflicting countdown in the image.
- Do not include watermarks.
- Do not add UI elements, buttons, mockups or app screens unless explicitly requested.
- Do not use cartoon style unless explicitly requested.
- Make the image suitable for both Facebook and Instagram feed use.
- Keep the image clean, premium and easy to understand at a glance.

Product image safety rules:
- If this post is based on a specific website item but no real website image is being used, do not recreate, imitate or invent a product image.
- Do not create fake versions of branded products, packaging, logos, mascots, characters, toy designs or trademarked styles.
- Do not create fake LEGO, DUPLO, Paw Patrol, Disney, Marvel, Barbie, Pokemon, Nintendo or other branded product images.
- If a real product image is not available from the website, create a generic unbranded lifestyle or campaign image that supports the occasion, feeling or use case instead.
- The fallback image should not focus on the exact selected product. It should focus on the broader campaign theme, such as family time, gift giving, play, celebration, shopping inspiration or seasonal atmosphere.
- For product-based website posts, never make the AI image look like an official product photo unless the image is the original website image.

Output only the image.
`.trim();
}

function createEmptySummary() {
  return {
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    warnings: 0,
    pending_approval: 0,
    approved: 0,
    image_generated: 0,
    image_generation_failed: 0,
    not_enough_credits: 0,
    no_credit_balance: 0,
    emails_sent: 0,
    emails_failed: 0,
    social_publish_checked: 0,
    social_published: 0,
    social_publish_failed: 0,
    facebook_publish_checked: 0,
    facebook_published: 0,
    facebook_publish_failed: 0,
    facebook_publish_skipped_no_config: 0,
    instagram_publish_checked: 0,
    instagram_published: 0,
    instagram_publish_failed: 0,
    instagram_publish_skipped_no_config: 0,
    instagram_publish_skipped_no_image: 0,
    brand_profile_found: 0,
    brand_profile_missing: 0,
    website_content_rules: 0,
    website_content_success: 0,
    website_content_failed: 0,
    carousel_generation_paused: 0,
    website_items_found: 0,
    website_items_reused_cycle: 0,
    website_image_used: 0,
website_image_missing_ai_fallback: 0,
website_web_search_success: 0,
website_web_search_failed: 0,
website_web_search_fallback_used: 0,
  };
}

function buildCarouselEmailPreviewHtml(carouselSlides = []) {
  const slides = (carouselSlides || []).filter((slide) => slide?.image_url).slice(0, 6);

  if (!slides.length) {
    return "";
  }

  const cards = slides
    .map((slide) => `
      <div class="carousel-email-card" style="display:inline-block;width:31%;max-width:180px;min-width:150px;vertical-align:top;margin:6px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="padding:0;background:#f8fafc;">
              <img src="${escapeHtml(slide.image_url || '')}" alt="${escapeHtml(slide.headline || 'Carousel slide')}" style="display:block;width:100%;height:auto;max-height:180px;object-fit:contain;background:#f8fafc;" />
            </td>
          </tr>
          ${slide.headline ? `
          <tr>
            <td style="padding:10px 10px 12px;font-size:12px;line-height:1.45;color:#111827;font-weight:700;">
              ${escapeHtml(slide.headline)}
            </td>
          </tr>
          ` : ''}
        </table>
      </div>
    `)
    .join('');

  return `
    <tr>
      <td style="padding:0 22px 20px;">
        <style>
          @media only screen and (max-width: 520px) {
            .carousel-email-card {
              width: 47% !important;
              max-width: 47% !important;
              min-width: 0 !important;
              margin: 4px !important;
            }
            .carousel-email-card img {
              height: auto !important;
              max-height: none !important;
              object-fit: contain !important;
            }
          }
        </style>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:6px;text-align:left;font-size:0;line-height:0;">
          ${cards}
        </div>
      </td>
    </tr>
  `;
}

function buildApprovalEmailHtml({
  locale,
  t,
  rule,
  postContent,
  approveUrl,
  imageUrl,
  carouselSlides = [],
  isCarouselDraft = false,
}) {
  const platformLabel = rule.platform || "Social media";
  const postTypeLabel = rule.post_type || "Post";
  const safeImageUrl = imageUrl ? escapeHtml(imageUrl) : "";
  const titleKey = isCarouselDraft ? "emails.approval.carouselTitle" : "emails.approval.title";
  const introKey = isCarouselDraft ? "emails.approval.carouselIntro" : "emails.approval.intro";
  const buttonKey = isCarouselDraft ? "emails.approval.button" : "emails.approval.button";
  const afterKey = isCarouselDraft ? "emails.approval.carouselAfterApprovalV2" : "emails.approval.afterApproval";
  const carouselPreviewHtml = isCarouselDraft ? buildCarouselEmailPreviewHtml(carouselSlides) : "";
  return `
<!doctype html>
<html lang="${escapeHtml(locale || "en")}">
  <body style="margin:0;padding:0;background:#f5f3ee;font-family:Arial,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">
                  ${escapeHtml(t("emails.approval.eyebrow"))}
                </p>

                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#111827;">
                  ${escapeHtml(t(titleKey))}
                </h1>

                <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                  ${escapeHtml(
                    t(introKey, {
                      platform: platformLabel,
                      postType: String(postTypeLabel).toLowerCase(),
                    })
                  )}
                </p>
              </td>
            </tr>

            ${
              isCarouselDraft
                ? carouselPreviewHtml
                : safeImageUrl
                ? `
            <tr>
              <td style="padding:0 28px 20px;">
                <img
                  src="${safeImageUrl}"
                  alt="${escapeHtml(t("emails.approval.imageAlt"))}"
                  style="display:block;width:100%;max-width:584px;border-radius:14px;border:1px solid #e5e7eb;"
                />
              </td>
            </tr>
            `
                : ""
            }

            <tr>
              <td style="padding:0 28px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 10px;color:#6b7280;font-size:13px;font-weight:700;">
                        ${escapeHtml(t("emails.approval.generatedPost"))}
                      </p>

                      <div style="font-size:15px;line-height:1.7;color:#111827;">
                        ${formatPostContentForHtml(postContent)}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:4px 28px 28px;">
                <a href="${approveUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;">
                  ${escapeHtml(t(buttonKey))}
                </a>

                <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                  ${escapeHtml(t(afterKey))}
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:18px 0 0;color:#9ca3af;font-size:12px;">
            ${escapeHtml(t("emails.approval.footer"))}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}

function buildApprovalEmailText({
  t,
  rule,
  postContent,
  approveUrl,
  imageUrl,
  isCarouselDraft = false,
}) {
  const platformLabel = rule.platform || "Social media";
  const postTypeLabel = rule.post_type || "Post";
  const textTitleKey = isCarouselDraft ? "emails.approval.carouselTextTitle" : "emails.approval.textTitle";
  const textActionKey = isCarouselDraft ? "emails.approval.textApprovePost" : "emails.approval.textApprovePost";
  const afterKey = isCarouselDraft ? "emails.approval.carouselAfterApprovalV2" : "emails.approval.afterApproval";

  return `
${t(textTitleKey)}

${t("emails.approval.textPlatform", { platform: platformLabel })}
${t("emails.approval.textPostType", { postType: postTypeLabel })}

${imageUrl ? `${t("emails.approval.textImage", { imageUrl })}
` : ""}${t("emails.approval.textGeneratedPost")}
${postContent}

${t(textActionKey)}
${approveUrl}

${t(afterKey)}
`.trim();
}

async function setRuleError(supabase, ruleId, message) {
  await supabase
    .from("automation_rules")
    .update({
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId);
}

async function getBrandProfileForRule(supabase, rule) {
  if (!rule?.brand_profile_id) {
    console.error("Automation rule has no brand_profile_id", {
      ruleId: rule?.id,
      userId: rule?.user_id,
    });

    return null;
  }

  const { data, error } = await supabase
    .from("brand_profiles")
    .select(
  "id, business_name, website_url, website_product_source_url, brand_description, industry, target_audience, content_language, logo_url, logo_storage_path, logo_enabled_by_default"
)
    .eq("id", rule.brand_profile_id)
    .eq("user_id", rule.user_id)
    .maybeSingle();

  if (error) {
    console.error("Could not load brand profile for rule", {
      ruleId: rule.id,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      message: error.message,
    });

    return null;
  }

  return data || null;
}
function normalizeWebsiteUrl(value) {
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

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function canonicalizeWebsiteProductUrl(value, baseUrl = "") {
  const resolved = value ? resolveUrl(value, baseUrl || value) : null;

  if (!resolved || !isHttpUrl(resolved)) {
    return resolved;
  }

  try {
    const url = new URL(resolved);
    url.hash = "";
    url.search = "";

    // Shopify often exposes the same product as both /products/x and
    // /collections/y/products/x. Store and compare the product-level URL only.
    const shopifyProductMatch = url.pathname.match(/\/collections\/[^/]+\/products\/([^/?#]+)/i);
    if (shopifyProductMatch?.[1]) {
      url.pathname = `/products/${shopifyProductMatch[1]}`;
    }

    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    url.hostname = url.hostname.toLowerCase();

    return url.toString();
  } catch {
    return resolved.split("#")[0].split("?")[0].replace(/\/$/, "");
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSameOrigin(urlA, urlB) {
  try {
    return new URL(urlA).origin === new URL(urlB).origin;
  } catch {
    return false;
  }
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripHtmlToText(html) {
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

function getMetaContent(html, propertyNames) {
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

function extractPageTitle(html) {
  const ogTitle = getMetaContent(html, ["og:title", "twitter:title"]);

  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  }

  return "";
}

function getAttributeValueFromTag(tag, attributeName) {
  const regex = new RegExp(`\\b${attributeName}=["']([^"']+)["']`, "i");
  return String(tag || "").match(regex)?.[1] || "";
}

function splitSrcsetUrls(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function normalizeEscapedUrl(value) {
  return String(value || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function looksLikeProductImageUrl(value) {
  const lower = String(value || "").toLowerCase();

  if (!lower) {
    return false;
  }

  if (/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(lower)) {
    return true;
  }

  return (
    lower.includes("image") ||
    lower.includes("img") ||
    lower.includes("media") ||
    lower.includes("cdn") ||
    lower.includes("globalassets")
  );
}

function extractEmbeddedImageUrls(html, pageUrl, score = 4) {
  const candidates = [];
  const seen = new Set();
  const source = String(html || "");
  const patterns = [
    /https?:\/\/[^"'<>\s\)\]]+/gi,
    /["']((?:\/[^"'<>\s\)\]]+){1,}\.(?:jpe?g|png|webp|avif)(?:\?[^"'<>\s\)\]]*)?)["']/gi,
    /(?:image|imageUrl|image_url|thumbnail|thumbnailUrl|src|url)["']?\s*[:=]\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(source)) !== null) {
      const raw = normalizeEscapedUrl(match[1] || match[0] || "");
      const resolved = raw.startsWith("http") ? raw : resolveUrl(raw, pageUrl);

      if (!resolved || !isHttpUrl(resolved) || seen.has(resolved)) {
        continue;
      }

      if (!looksLikeProductImageUrl(resolved) || isBadProductImageUrl(resolved)) {
        continue;
      }

      seen.add(resolved);
      candidates.push({
        url: resolved,
        alt: "Embedded product image",
        source: "embedded-image",
        score,
        page_url: pageUrl,
      });

      if (candidates.length >= 80) {
        return candidates;
      }
    }
  }

  return candidates;
}

function extractImageCandidates(html, pageUrl) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = ({ url, alt = "", source = "image", score = 0 }) => {
    const resolvedUrl = resolveUrl(url, pageUrl);

    if (!resolvedUrl || !isHttpUrl(resolvedUrl)) {
      return;
    }

    if (seen.has(resolvedUrl)) {
      return;
    }

    const lowerUrl = resolvedUrl.toLowerCase();
    const lowerAlt = String(alt || "").toLowerCase();

    if (
      lowerUrl.includes("logo") ||
      lowerUrl.includes("favicon") ||
      lowerUrl.includes("icon") ||
      lowerUrl.includes("sprite") ||
      lowerUrl.endsWith(".svg")
    ) {
      score -= 30;
    }

    if (
      lowerUrl.includes("product") ||
      lowerUrl.includes("service") ||
      lowerUrl.includes("listing") ||
      lowerUrl.includes("property") ||
      lowerUrl.includes("bostad") ||
      lowerUrl.includes("objekt") ||
      lowerUrl.includes("offer") ||
      lowerUrl.includes("shop") ||
      lowerAlt.includes("product") ||
      lowerAlt.includes("service") ||
      lowerAlt.includes("bostad") ||
      lowerAlt.includes("property")
    ) {
      score += 20;
    }

    if (
      lowerUrl.includes("banner") ||
      lowerUrl.includes("hero") ||
      lowerUrl.includes("background") ||
      lowerUrl.includes("header")
    ) {
      score -= 12;
    }

    seen.add(resolvedUrl);
    candidates.push({
      url: resolvedUrl,
      alt: decodeHtmlEntities(alt),
      source,
      score,
      page_url: pageUrl,
    });
  };

  const ogImage = getMetaContent(html, ["og:image", "twitter:image"]);

  if (ogImage) {
    addCandidate({
      url: ogImage,
      alt: "Open graph image",
      source: "og:image",
      score: 5,
    });
  }

  const imageRegex = /<img\b[^>]*>/gi;
  const matches = String(html || "").match(imageRegex) || [];
  const directImageAttributes = [
    "src",
    "data-src",
    "data-original",
    "data-lazy",
    "data-lazy-src",
    "data-image",
    "data-image-src",
    "data-src-large",
    "data-zoom-image",
    "data-img-zoom-url",
    "data-full",
  ];
  const srcsetAttributes = ["srcset", "data-srcset", "data-lazy-srcset"];

  for (const tag of matches) {
    const alt = getAttributeValueFromTag(tag, "alt");

    for (const attributeName of directImageAttributes) {
      const value = getAttributeValueFromTag(tag, attributeName);
      if (!value) {
        continue;
      }

      addCandidate({
        url: normalizeEscapedUrl(value),
        alt,
        source: `img:${attributeName}`,
        score: attributeName === "src" ? 0 : 8,
      });
    }

    for (const attributeName of srcsetAttributes) {
      const srcsetValue = getAttributeValueFromTag(tag, attributeName);

      for (const imageUrl of splitSrcsetUrls(srcsetValue)) {
        addCandidate({
          url: normalizeEscapedUrl(imageUrl),
          alt,
          source: `img:${attributeName}`,
          score: 10,
        });
      }
    }
  }

  const backgroundImageRegex = /url\((['"]?)(https?:[^)'"]+)\1\)/gi;
  let backgroundMatch;

  while ((backgroundMatch = backgroundImageRegex.exec(String(html || ""))) !== null) {
    addCandidate({
      url: backgroundMatch[2],
      alt: "Background image",
      source: "background-image",
      score: -4,
    });
  }

  for (const embeddedImage of extractEmbeddedImageUrls(html, pageUrl, 2)) {
    addCandidate(embeddedImage);
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(WEBSITE_MAX_IMAGE_CANDIDATES, 80));
}

function extractLinks(html, pageUrl) {
  const links = [];
  const seen = new Set();
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = linkRegex.exec(String(html || ""))) !== null) {
    const href = match[1];
    const rawText = match[2] || "";
    const text = stripHtmlToText(rawText);
    const resolvedUrl = resolveUrl(href, pageUrl);

    if (!resolvedUrl || !isHttpUrl(resolvedUrl)) {
      continue;
    }

    if (!isSameOrigin(resolvedUrl, pageUrl)) {
      continue;
    }

    const cleanUrl = resolvedUrl.split("#")[0];

    if (seen.has(cleanUrl)) {
      continue;
    }

    seen.add(cleanUrl);

    const lower = `${cleanUrl} ${text}`.toLowerCase();

    let score = 0;

    const positiveKeywords = [
      "product",
      "products",
      "service",
      "services",
      "shop",
      "store",
      "offer",
      "offers",
      "listing",
      "listings",
      "property",
      "properties",
      "bostad",
      "bostader",
      "bostäder",
      "objekt",
      "tjanst",
      "tjänst",
      "tjanster",
      "tjänster",
      "behandling",
      "behandlingar",
      "menu",
      "meny",
      "course",
      "courses",
      "package",
      "packages",
      "pris",
      "price",
    ];

    const negativeKeywords = [
      "privacy",
      "cookie",
      "terms",
      "login",
      "sign-in",
      "cart",
      "checkout",
      "kontakt",
      "contact",
      "about",
      "om-oss",
      "policy",
      "blog",
      "news",
      "nyheter",
    ];

    for (const keyword of positiveKeywords) {
      if (lower.includes(keyword)) {
        score += 8;
      }
    }

    for (const keyword of negativeKeywords) {
      if (lower.includes(keyword)) {
        score -= 8;
      }
    }

    if (score > -10) {
      links.push({
        url: cleanUrl,
        text,
        score,
      });
    }
  }

  return links.sort((a, b) => b.score - a.score);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
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
    const lowerContentType = contentType.toLowerCase();

    if (
      lowerContentType &&
      !lowerContentType.includes("text/html") &&
      !lowerContentType.includes("application/xhtml") &&
      !lowerContentType.includes("application/xml") &&
      !lowerContentType.includes("text/xml") &&
      !lowerContentType.includes("text/plain")
    ) {
      throw new Error(`Website did not return readable HTML/XML content: ${contentType}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWebsitePages(websiteUrl) {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

  if (!normalizedWebsiteUrl) {
    throw new Error("Brand profile has no website URL");
  }

  const homeHtml = await fetchHtml(normalizedWebsiteUrl);
  const homeTitle = extractPageTitle(homeHtml);
  const homeText = truncateText(
    stripHtmlToText(homeHtml),
    WEBSITE_MAX_TEXT_CHARS_PER_PAGE
  );
  const homeImages = extractImageCandidates(homeHtml, normalizedWebsiteUrl);
  const links = extractLinks(homeHtml, normalizedWebsiteUrl);

  const pages = [
    {
      url: normalizedWebsiteUrl,
      title: homeTitle,
      text: homeText,
      images: homeImages,
    },
  ];

  const candidateLinks = links
    .filter((link) => link.score > 0)
    .slice(0, WEBSITE_MAX_PAGES - 1);

  for (const link of candidateLinks) {
    try {
      const html = await fetchHtml(link.url);

      pages.push({
        url: link.url,
        title: extractPageTitle(html) || link.text,
        text: truncateText(stripHtmlToText(html), WEBSITE_MAX_TEXT_CHARS_PER_PAGE),
        images: extractImageCandidates(html, link.url),
      });
    } catch (error) {
      console.error("Could not fetch website subpage", {
        url: link.url,
        message: error.message,
      });
    }
  }

  return pages;
}

function buildWebsiteAnalysisInput({ brandProfile, pages }) {
  const pageBlocks = [];
  let totalChars = 0;

  for (const page of pages) {
    const imageLines = (page.images || [])
      .slice(0, 10)
      .map(
        (image, index) =>
          `${index + 1}. url: ${image.url} | alt: ${image.alt || ""} | source: ${
            image.source || ""
          }`
      )
      .join("\n");

    const block = `
Page URL: ${page.url}
Page title: ${page.title || "Not provided"}

Page text:
${page.text || ""}

Image candidates on this page:
${imageLines || "No images found"}
`.trim();

    if (totalChars + block.length > WEBSITE_MAX_TOTAL_TEXT_CHARS) {
      break;
    }

    pageBlocks.push(block);
    totalChars += block.length;
  }

  return `
Brand profile:
${formatBrandProfileForPrompt(brandProfile)}

Website pages:
${pageBlocks.join("\n\n---\n\n")}
`.trim();
}

function buildWebsiteItemSelectionContext(rule) {
  const prompt = String(rule?.prompt || "").trim();

  if (!prompt) {
    return `
No specific automation prompt was provided.

Choose website items that are generally relevant to the brand and content type.
`.trim();
  }

  return `
Current automation / campaign prompt:
${truncateText(prompt, 3000)}

Important:
- If the prompt contains a "Product selection hint", treat that hint as high priority.
- The selected website item must fit the campaign, occasion, buyer intent, recipient and audience.
- Do not choose a random product or service just because it exists on the website.
`.trim();
}

function safeJsonParse(value) {
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

function normalizeContentFormat(value) {
  const format = String(value || "single_image").trim();

  if (["single_image", "carousel", "slideshow_video"].includes(format)) {
    return format;
  }

  return "single_image";
}

function isCarouselRule(rule) {
  return normalizeContentFormat(rule?.content_format) === "carousel";
}

function normalizeSlideText(value, maxLength = 180) {
  return truncateText(String(value || "").replace(/\s+/g, " ").trim(), maxLength);
}

function buildFallbackCarouselSlides(rule, postContent) {
  const item = rule?.website_item || {};
  const title = normalizeSlideText(item.title || rule?.brand_profile?.business_name || "Worth a closer look", 80);
  const description = normalizeSlideText(item.description || postContent || "A relevant pick from the business website.", 180);
  const cta = normalizeSlideText(rule?.cta_type || "", 60);

  return [
    {
      slide_type: "hook",
      headline: title,
      body: normalizeSlideText("A quick look at why this could be a good fit.", 160),
      cta_text: "",
    },
    {
      slide_type: "product",
      headline: normalizeSlideText(title, 80),
      body: description,
      cta_text: "",
    },
    {
      slide_type: "benefit",
      headline: "Why it matters",
      body: normalizeSlideText("Connect the item to the audience's need in a clear and useful way.", 160),
      cta_text: "",
    },
    {
      slide_type: "cta",
      headline: "Want to know more?",
      body: normalizeSlideText("Visit the website to see the current details and decide if it fits.", 160),
      cta_text: cta,
    },
  ];
}

function normalizeCarouselSlides(value, rule, postContent) {
  const source = Array.isArray(value?.slides) ? value.slides : Array.isArray(value) ? value : [];

  const slides = source
    .map((slide, index) => ({
      slide_type: normalizeSlideText(slide?.slide_type || (index === 0 ? "hook" : index === source.length - 1 ? "cta" : "content"), 40) || "content",
      headline: normalizeSlideText(slide?.headline || slide?.title || "", 90),
      body: normalizeSlideText(slide?.body || slide?.text || "", 220),
      cta_text: normalizeSlideText(slide?.cta_text || slide?.cta || "", 80),
    }))
    .filter((slide) => slide.headline || slide.body || slide.cta_text)
    .slice(0, 5);

  if (slides.length >= 3) {
    return slides;
  }

  return buildFallbackCarouselSlides(rule, postContent);
}

function normalizeItemKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "")
    .replace(/\s+/g, " ");
}

function createItemKey(item) {
  const normalizedUrl = normalizeItemKeyPart(item?.url);
  const normalizedTitle = normalizeItemKeyPart(item?.title);
  const normalizedType = normalizeItemKeyPart(item?.type);
  const normalizedDescription = normalizeItemKeyPart(item?.description);

  let base = "";

  if (normalizedUrl) {
    base = `url:${normalizedUrl}`;
  } else if (normalizedTitle && normalizedType) {
    base = `title-type:${normalizedTitle}|${normalizedType}`;
  } else if (normalizedTitle) {
    base = `title:${normalizedTitle}`;
  } else {
    base = `fallback:${normalizedDescription}`;
  }

  return crypto.createHash("sha256").update(base).digest("hex");
}

function normalizeWebsiteItem(item, websiteUrl) {
  const title = String(item?.title || "").trim();
  const description = String(item?.description || "").trim();
  const type = String(item?.type || "website_item").trim();
  const resolvedUrl = item?.url ? resolveUrl(item.url, websiteUrl) : websiteUrl;
  const url = resolvedUrl ? canonicalizeWebsiteProductUrl(resolvedUrl, websiteUrl) : websiteUrl;
  const imageUrl = item?.image_url ? resolveUrl(item.image_url, websiteUrl) : null;
let price = normalizeVerifiedPriceValue(item?.price);
  if (item?.price && !price) {
    console.warn("Ignored unverified website item price because it lacked a clear currency marker", {
      title: truncateText(title, 120),
      rawPrice: truncateText(String(item.price), 80),
    });
  }

  if (price && isLikelyWrongUsdPriceForUrl(price, url || websiteUrl)) {
    console.warn("Ignored suspicious website item price because currency does not match product URL", {
      title: truncateText(title, 120),
      productUrl: url || websiteUrl,
      rawPrice: truncateText(String(item.price), 80),
    });
    price = "";
  }
  if (!title || !description) {
    return null;
  }

return {
  title,
  description: truncateText(description, 900),
  price,
  type,
  url: url || websiteUrl,
  image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
};
}

async function extractWebsiteItems(openai, brandProfile, pages, rule = null) {
  const websiteUrl = normalizeWebsiteUrl(brandProfile?.website_url);
const analysisInput = buildWebsiteAnalysisInput({ brandProfile, pages });
const selectionContext = buildWebsiteItemSelectionContext(rule);
  const completion = await openai.chat.completions.create({
    model: POST_TEXT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You extract concrete website items for social media promotion. Return strict JSON only.",
      },
      {
        role: "user",
        content: `
Analyze the website content below.

Find concrete items that could become individual social media posts.

Current automation context:
${selectionContext}
An item can be:
- product
- service
- property/listing
- treatment
- offer
- course
- menu item
- package
- event
- other specific sellable item

Rules:
- Do not invent items.
- Only use information that appears in the website content.
- Prefer specific product/service/listing pages over generic homepage claims.
- Do not use privacy policy, cookie policy, blog posts or generic about pages as items.
- Avoid generic company descriptions unless the website only offers one clear service.
- For image_url, only choose a real image URL from the website that clearly shows the selected product, service, listing or item.
- For product pages, prefer the main product image from the product page.
- The image_url must be used exactly as found on the website. Do not describe, modify, recreate or invent a product image.
- Do not use logos, brand logos, franchise logos, mascot images, category graphics, navigation graphics, decorative banners, hero images or generic campaign artwork as image_url.
- Do not use an image_url if the image mainly shows a logo, brand mark, character artwork or campaign graphic without a clearly identifiable purchasable product.
- If no real product/item image is clearly available for the selected item, set image_url to null.
- If a clear product price is visible in the website content, include it in price.
- If the price is not clearly visible, use an empty string for price.
- Rank the returned items from strongest campaign match to weakest campaign match for the current automation context.
- Do not rank by what appears first on the website.
- Do not rank by which image is largest or most visually prominent.
- Do not rank by which product is currently shown in a campaign banner unless it is also the strongest match for the current campaign.
- If the automation context contains a Product selection hint, treat that hint as high priority when deciding which items are relevant.
- First identify the campaign, holiday, theme day, season or occasion.
- Then identify the likely buyer, the likely recipient, the buying intent and the emotional or practical reason to buy.
- Before selecting an item, infer the most likely product categories that fit that campaign or occasion.
- Choose the item that best fits the recipient, buyer intent and campaign theme.
- Prefer the strongest thematic match, not just any item that could loosely work.
- If several products are available, rank the one with the clearest gift, seasonal, practical or emotional use case highest.
- For gift days and shopping occasions, consider who buys the item, who receives it, and why the item fits the occasion.
- Avoid choosing products mainly aimed at a different recipient when a stronger match exists.
- Do not return unrelated random products just because they exist on the website.

Language-neutral campaign fit guidance:
- Do not rely on a fixed Swedish or English list of holidays, words or product types.
- Infer the campaign meaning from the automation prompt, market, language, audience and website content.
- If the website has a category, collection, search result, campaign page or landing page that is clearly dedicated to the same campaign/theme/occasion, inspect that area first and prefer concrete product pages found from there.
- Prefer items whose title, URL, description, image and surrounding page context clearly support the campaign intent.
- Avoid broad homepage items, generic custom products, unrelated bestsellers and decorative campaign banners when clearly stronger theme-specific product pages exist.
- If no concrete product page fits the campaign well, return generally usable items only after the strongest theme-specific search paths have been tried, and rank the closest matches first.
- Return 3 to 15 items if possible.

Return JSON in this exact shape:
{
  "items": [
    {
      "title": "Item title",
      "type": "product | service | listing | property | treatment | offer | course | menu_item | package | event | other",
      "url": "Full URL if known",
"description": "Specific factual description based only on the website",
"price": "Visible price if clearly found on the website, otherwise empty string",
"image_url": "Full image URL if clearly relevant, otherwise null"
    }
  ]
}

Website content:
${analysisInput}
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  return rawItems
    .map((item) => normalizeWebsiteItem(item, websiteUrl))
    .filter(Boolean)
    .map((item) => ({
      ...item,
      item_key: createItemKey(item),
    }));
}

async function getCurrentWebsiteCycle({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
}) {
  const { data, error } = await supabase
    .from("website_content_history")
    .select("cycle_number")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("source_url", sourceUrl)
    .eq("content_type", contentType)
    .order("cycle_number", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message || "Could not load website content history");
  }

  return Number(data?.[0]?.cycle_number || 1);
}

function normalizeComparableValue(value) {
  let normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/#.*$/, "")
    .replace(/\?.*$/, "")
    .replace(/\/$/, "")
    .replace(/\s+/g, " ");

  normalized = normalized.replace(/\/collections\/[^/]+\/products\//i, "/products/");

  return normalized;
}

function isWeakItemUrl(itemUrl, sourceUrl) {
  const normalizedItemUrl = normalizeComparableValue(itemUrl);
  const normalizedSourceUrl = normalizeComparableValue(sourceUrl);

  if (!normalizedItemUrl) {
    return true;
  }

  return normalizedItemUrl === normalizedSourceUrl;
}

async function getUsedWebsiteItems({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
  cycleNumber,
  limit = WEBSITE_PRODUCT_REUSE_LIMIT,
}) {
  let query = supabase
    .from("website_content_history")
    .select("item_key, item_url, item_title, item_image_url, content_type, created_at")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("source_url", sourceUrl)
    .limit(limit);

  if (contentType) {
    query = query.eq("content_type", contentType);
  }

  if (cycleNumber) {
    query = query.eq("cycle_number", cycleNumber);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load used website items");
  }

  return data || [];
}

async function getRecentUsedWebsiteItems({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
  limit = WEBSITE_PRODUCT_REUSE_LIMIT,
}) {
  // Product rotation must be shared across normal website posts and carousels.
  // Otherwise a product used in a carousel can immediately reappear in a single-product post.
  return getUsedWebsiteItems({
    supabase,
    userId,
    brandProfileId,
    sourceUrl,
    contentType: null,
    limit,
  });
}

function hasWebsiteItemAlreadyBeenUsed(item, usedItems, sourceUrl) {
  const itemKey = normalizeComparableValue(item?.item_key);
  const itemUrl = normalizeComparableValue(canonicalizeWebsiteProductUrl(item?.url || item?.product_url || "", sourceUrl) || item?.url || item?.product_url);
  const itemTitle = normalizeComparableValue(item?.title || item?.item_title);
  const itemImageUrl = normalizeComparableValue(item?.image_url || item?.item_image_url);

  return usedItems.some((usedItem) => {
    const usedKey = normalizeComparableValue(usedItem.item_key);
    const usedUrl = normalizeComparableValue(canonicalizeWebsiteProductUrl(usedItem.item_url || usedItem.product_url || usedItem.url || "", sourceUrl) || usedItem.item_url || usedItem.product_url || usedItem.url);
    const usedTitle = normalizeComparableValue(usedItem.item_title || usedItem.title);
    const usedImageUrl = normalizeComparableValue(usedItem.item_image_url || usedItem.image_url);

    if (itemKey && usedKey && itemKey === usedKey) {
      return true;
    }

    if (
      itemUrl &&
      usedUrl &&
      itemUrl === usedUrl &&
      !isWeakItemUrl(itemUrl, sourceUrl)
    ) {
      return true;
    }

    if (itemTitle && usedTitle && itemTitle === usedTitle) {
      return true;
    }

    if (itemImageUrl && usedImageUrl && itemImageUrl === usedImageUrl) {
      return true;
    }

    return false;
  });
}

function normalizeWebsiteCatalogItem(row) {
  if (!row) {
    return null;
  }

  const item = normalizeWebsiteItem(
    {
      title: row.title || row.product_title || row.item_title || "",
      type: "product",
      url: row.product_url || row.url || row.item_url || "",
      description: row.description || row.item_description || "",
      price: row.price || "",
      image_url: row.image_url || row.item_image_url || null,
    },
    row.source_url || row.website_url || row.product_url || ""
  );

  if (!item) {
    return null;
  }

  return {
    ...item,
    id: row.id || null,
    item_key: row.item_key || createItemKey(item),
    times_used: Number(row.times_used || 0),
    last_used_at: row.last_used_at || null,
    catalog_source: row.discovery_source || "catalog",
  };
}

function extractCurrencyFromVerifiedPrice(price) {
  const value = String(price || "").trim();

  if (!value) {
    return "";
  }

  const lower = value.toLowerCase();

  if (/\bsek\b|\bkr\b|:-/.test(lower)) return "SEK";
  if (/\bnok\b/.test(lower)) return "NOK";
  if (/\bdkk\b/.test(lower)) return "DKK";
  if (/\beur\b|€|\beuro\b/.test(lower)) return "EUR";
  if (/\busd\b|\$/.test(lower)) return "USD";
  if (/\bgbp\b|£/.test(lower)) return "GBP";
  if (/\buzs\b|сум/.test(lower)) return "UZS";

  return "";
}

async function getWebsiteProductCatalogItems({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  limit = WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT,
}) {
  const { data, error } = await supabase
    .from("website_product_catalog")
    .select(
      "id, product_url, title, description, price, currency, image_url, source_url, times_used, last_used_at, is_active, discovery_source"
    )
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("source_url", sourceUrl)
    .eq("is_active", true)
    .order("times_used", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    console.error("Website product catalog unavailable; falling back to live product research", {
      brandProfileId,
      sourceUrl,
      message: error.message,
      code: error.code,
    });

    return [];
  }

  return (data || []).map(normalizeWebsiteCatalogItem).filter(Boolean);
}

async function upsertWebsiteProductCatalogItems({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  items,
  discoverySource = "live_research",
}) {
  const rows = (items || [])
    .map((item) => normalizeWebsiteItem(item, sourceUrl))
    .filter(Boolean)
    .filter((item) => item.url && item.title)
    .map((item) => ({
      user_id: userId,
      brand_profile_id: brandProfileId,
      source_url: sourceUrl,
      product_url: canonicalizeWebsiteProductUrl(item.url, sourceUrl) || item.url,
      title: item.title,
      description: item.description || "",
      price: item.price || null,
      currency: extractCurrencyFromVerifiedPrice(item.price),
      image_url: item.image_url || null,
      item_key: createItemKey(item),
      discovery_source: discoverySource,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    }));

  if (!rows.length) {
    return;
  }

  const { error } = await supabase
    .from("website_product_catalog")
    .upsert(rows, { onConflict: "brand_profile_id,product_url" });

  if (error) {
    console.error("Could not upsert website product catalog items", {
      brandProfileId,
      sourceUrl,
      count: rows.length,
      message: error.message,
      code: error.code,
    });
  }
}

async function markWebsiteProductCatalogItemUsed({
  supabase,
  brandProfileId,
  productUrl,
  usedSource = null,
}) {
  if (!brandProfileId || !productUrl) {
    return;
  }

  const canonicalProductUrl = canonicalizeWebsiteProductUrl(productUrl, productUrl) || productUrl;

  const { data, error: readError } = await supabase
    .from("website_product_catalog")
    .select("id, times_used, discovery_source")
    .eq("brand_profile_id", brandProfileId)
    .eq("product_url", canonicalProductUrl)
    .limit(1);

  if (readError || !data?.[0]?.id) {
    if (readError) {
      console.error("Could not read website product catalog usage", {
        brandProfileId,
        productUrl: canonicalProductUrl,
        message: readError.message,
        code: readError.code,
      });
    }

    return;
  }

  const updatePayload = {
    times_used: Number(data[0].times_used || 0) + 1,
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (usedSource) {
    updatePayload.discovery_source = usedSource;
  }

  const { error: updateError } = await supabase
    .from("website_product_catalog")
    .update(updatePayload)
    .eq("id", data[0].id);

  if (updateError) {
    console.error("Could not update website product catalog usage", {
      brandProfileId,
      productUrl,
      message: updateError.message,
      code: updateError.code,
    });
  }
}


function isCampaignScopedWebsiteRule(rule) {
  return Boolean(
    rule?.campaign_phase ||
      rule?.marketing_angle ||
      rule?.customer_stage ||
      rule?.cta_strength ||
      rule?.campaign_goal ||
      rule?.target_customer_need ||
      rule?.strategy_notes ||
      rule?.campaign_post_index ||
      rule?.campaign_post_count
  );
}

function getWebsiteCatalogDiscoverySource(baseSource, rule) {
  const cleanSource = String(baseSource || "live_research").trim() || "live_research";
  return isCampaignScopedWebsiteRule(rule)
    ? `campaign_${cleanSource}`
    : `general_${cleanSource}`;
}

function getWebsiteCatalogUsedSource(rule) {
  return isCampaignScopedWebsiteRule(rule) ? "campaign_used" : "general_used";
}

function buildCampaignResearchText(rule) {
  return [
    rule?.name,
    rule?.prompt,
    rule?.campaign_goal,
    rule?.marketing_angle,
    rule?.target_customer_need,
    rule?.strategy_notes,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isCampaignScopedCatalogSource(source) {
  return String(source || "").toLowerCase().startsWith("campaign_");
}

function isGeneralScopedCatalogSource(source) {
  const value = String(source || "").toLowerCase();
  return (
    value.startsWith("general_") ||
    value === "general_used" ||
    value === "live_research" ||
    value === "manual" ||
    value === "catalog"
  );
}

function filterWebsiteCatalogItemsForRule(items, rule) {
  const sourceItems = Array.isArray(items) ? items : [];

  if (isCampaignScopedWebsiteRule(rule)) {
    return sourceItems;
  }

  return sourceItems.filter((item) => {
    const source = String(item?.catalog_source || item?.discovery_source || "").toLowerCase();

    if (!source) {
      return true;
    }

    if (isCampaignScopedCatalogSource(source)) {
      return false;
    }

    // Legacy rows from older versions were stored as ai_web_search/site_discovery without
    // knowing whether they came from a themed calendar campaign. To avoid campaign products
    // leaking into normal AI Content Studio sales posts, treat those legacy candidate pools as
    // campaign-scoped until a product is selected again by a normal post and marked general_used.
    if (["ai_web_search", "site_discovery"].includes(source)) {
      return false;
    }

    return isGeneralScopedCatalogSource(source);
  });
}

function formatUsedWebsiteItemsForResearchPrompt(usedItems, limit = 100) {
  const rows = (usedItems || [])
    .slice(0, limit)
    .map((item, index) => {
      const title = String(item.item_title || item.title || "").trim();
      const url = String(item.item_url || item.product_url || item.url || "").trim();

      if (!title && !url) {
        return null;
      }

      return `${index + 1}. ${title || "Untitled"}${url ? ` — ${url}` : ""}`;
    })
    .filter(Boolean);

  if (!rows.length) {
    return "No previously used products are known yet.";
  }

  return rows.join("\n");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/g, "&");
}

function extractCampaignTerms(rule) {
  const source = [
    rule?.name,
    rule?.prompt,
    rule?.campaign_goal,
    rule?.marketing_angle,
    rule?.target_customer_need,
    rule?.strategy_notes,
  ]
    .filter(Boolean)
    .join(" ");

  const normalized = normalizeSearchText(source);
  const rawWords = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word));

  const seen = new Set();
  const terms = [];

  for (const word of rawWords) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    terms.push(word);
    if (terms.length >= 12) {
      break;
    }
  }

  return terms;
}

function scoreCampaignFitForRule(item, rule) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return 0;
  }

  const terms = extractCampaignTerms(rule);
  if (!terms.length) {
    return Number(item?.campaign_fit_score || 0);
  }

  const title = normalizeSearchText(item?.title);
  const url = normalizeSearchText(item?.url || item?.product_url || item?.item_url);
  const description = normalizeSearchText(item?.description);
  const reason = normalizeSearchText(item?.reason);
  const source = normalizeSearchText(item?.catalog_source || item?.discovery_source || item?.campaign_fit_source);
  let score = Number(item?.campaign_fit_score || 0);

  for (const term of terms) {
    if (title.includes(term)) score += 45;
    if (url.includes(term)) score += 45;
    if (description.includes(term)) score += 12;
    if (reason.includes(term)) score += 10;
  }

  if (source.includes("ai_campaign_research")) score += 25;
  if (source.includes("campaign")) score += 12;

  return score;
}

function getStrongCampaignFitItems(items, rule) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return [];
  }

  return (items || [])
    .map((item) => ({
      ...item,
      campaign_fit_score: scoreCampaignFitForRule(item, rule),
    }))
    .filter((item) => Number(item.campaign_fit_score || 0) >= CAMPAIGN_STRONG_PRODUCT_FIT_SCORE)
    .sort((a, b) => Number(b.campaign_fit_score || 0) - Number(a.campaign_fit_score || 0));
}

function scoreWebsiteItemForRule(item, rule) {
  const haystack = `${item?.title || ""} ${item?.description || ""} ${item?.url || ""}`.toLowerCase();
  const promptText = `${rule?.prompt || ""} ${rule?.campaign_goal || ""} ${rule?.strategy_notes || ""}`.toLowerCase();
  const promptWords = promptText
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4);

  let score = 0;

  for (const word of promptWords) {
    if (haystack.includes(word)) {
      score += 4;
    }
  }

  if (isCampaignScopedWebsiteRule(rule)) {
    score += scoreCampaignFitForRule(item, rule);
  }

  if (item?.image_url) score += 3;
  if (item?.price) score += 1;
  if (item?.last_used_at) score -= 2;
  score -= Math.min(Number(item?.times_used || 0), 20);

  return score;
}

async function chooseUnusedWebsiteItem({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
  items,
  rule = null,
  usedWebsiteImageUrlsThisRun = new Set(),
  recentUsedItems = null,
  allowReuseWhenExhausted = true,
}) {
  const currentCycle = await getCurrentWebsiteCycle({
    supabase,
    userId,
    brandProfileId,
    sourceUrl,
    contentType,
  });

  const usedItems = Array.isArray(recentUsedItems)
    ? recentUsedItems
    : await getRecentUsedWebsiteItems({
        supabase,
        userId,
        brandProfileId,
        sourceUrl,
        contentType,
      });

  const normalizedItems = (items || [])
    .map((item) => ({
      ...item,
      item_key: item?.item_key || createItemKey(item),
    }))
    .filter((item) => item?.url || item?.title)
    .sort((a, b) => {
      if (!rule) return 0;

      const scoreDelta = scoreWebsiteItemForRule(b, rule) - scoreWebsiteItemForRule(a, rule);

      if (scoreDelta !== 0) return scoreDelta;

      const aSource = Number(a?.selection_priority || 0);
      const bSource = Number(b?.selection_priority || 0);

      if (aSource !== bSource) return bSource - aSource;

      return String(a?.title || '').localeCompare(String(b?.title || ''));
    });

  const unusedItems = normalizedItems.filter(
    (item) => !hasWebsiteItemAlreadyBeenUsed(item, usedItems, sourceUrl)
  );

  function hasFreshWebsiteImage(item) {
    const imageUrl = normalizeComparableValue(item?.image_url);

    if (!imageUrl) {
      return false;
    }

    return !usedWebsiteImageUrlsThisRun.has(imageUrl);
  }

  function hasDuplicateWebsiteImageThisRun(item) {
    const imageUrl = normalizeComparableValue(item?.image_url);

    if (!imageUrl) {
      return false;
    }

    return usedWebsiteImageUrlsThisRun.has(imageUrl);
  }

  const bestUnusedWithFreshImage = unusedItems.find(hasFreshWebsiteImage);

  if (bestUnusedWithFreshImage) {
    return {
      item: bestUnusedWithFreshImage,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: true,
      reusedBecauseExhausted: false,
    };
  }

  const bestUnusedWithoutImage = unusedItems.find((item) => !item.image_url);

  if (bestUnusedWithoutImage) {
    return {
      item: bestUnusedWithoutImage,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: false,
      reusedBecauseExhausted: false,
    };
  }

  const bestUnusedWithDuplicateImage = unusedItems.find(
    hasDuplicateWebsiteImageThisRun
  );

  if (bestUnusedWithDuplicateImage) {
    return {
      item: bestUnusedWithDuplicateImage,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: false,
      reusedBecauseExhausted: false,
    };
  }

  if (!allowReuseWhenExhausted) {
    return {
      item: null,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: false,
      reusedBecauseExhausted: false,
    };
  }

  const fallbackItem = normalizedItems.find(
    (item) => item?.image_url && !hasDuplicateWebsiteImageThisRun(item)
  );

  if (!fallbackItem) {
    return {
      item: null,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: false,
      reusedBecauseExhausted: false,
    };
  }

  console.log("Website product rotation exhausted; reusing an older product after trying recent-history avoidance", {
    brandProfileId,
    sourceUrl,
    contentType,
    recentUsedCount: usedItems.length,
    candidateCount: normalizedItems.length,
    reuseLimit: WEBSITE_PRODUCT_REUSE_LIMIT,
  });

  return {
    item: fallbackItem,
    cycleNumber: currentCycle + 1,
    startedNewCycle: true,
    useWebsiteImage: hasFreshWebsiteImage(fallbackItem),
    reusedBecauseExhausted: true,
  };
}
function getHostnameWithoutWww(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSameOrSubdomainUrl(candidateUrl, websiteUrl) {
  const candidateHost = getHostnameWithoutWww(candidateUrl);
  const websiteHost = getHostnameWithoutWww(websiteUrl);

  if (!candidateHost || !websiteHost) {
    return false;
  }

  return candidateHost === websiteHost || candidateHost.endsWith(`.${websiteHost}`);
}

function isLikelyNonProductUrl(value, websiteUrl) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();

    if (!path || path === "/" || isWeakItemUrl(value, websiteUrl)) {
      return true;
    }

    const blockedPathParts = [
      "/blog",
      "/news",
      "/nyheter",
      "/article",
      "/artiklar",
      "/cart",
      "/checkout",
      "/kundvagn",
      "/kassa",
      "/account",
      "/login",
      "/sign-in",
      "/privacy",
      "/integritet",
      "/cookie",
      "/terms",
      "/villkor",
      "/contact",
      "/kontakt",
      "/about",
      "/om-oss",
      "/search",
      "/sok",
      "/sök",
    ];

    return blockedPathParts.some((part) => path.includes(part));
  } catch {
    return true;
  }
}

function isBadProductImageUrl(value) {
  const lowerUrl = String(value || "").toLowerCase();

  if (!lowerUrl) {
    return true;
  }

  return (
    lowerUrl.includes("logo") ||
    lowerUrl.includes("favicon") ||
    lowerUrl.includes("icon") ||
    lowerUrl.includes("sprite") ||
    lowerUrl.includes("placeholder") ||
    lowerUrl.includes("banner") ||
    lowerUrl.includes("hero") ||
    lowerUrl.includes("background") ||
    lowerUrl.includes("classy-fabric") ||
    lowerUrl.includes("theme") ||
    lowerUrl.includes("pattern") ||
    lowerUrl.includes("separator") ||
    lowerUrl.includes("texture") ||
    lowerUrl.includes("swatch") ||
    lowerUrl.endsWith(".svg")
  );
}

function normalizeJsonLdType(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").toLowerCase());
  }

  return [String(value || "").toLowerCase()];
}

function flattenJsonLd(value) {
  const items = [];

  function walk(node) {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }

      return;
    }

    if (typeof node !== "object") {
      return;
    }

    items.push(node);

    if (Array.isArray(node["@graph"])) {
      walk(node["@graph"]);
    }

    if (Array.isArray(node.itemListElement)) {
      walk(node.itemListElement);
    }
  }

  walk(value);

  return items;
}

function extractJsonLdObjects(html) {
  const objects = [];
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = scriptRegex.exec(String(html || ""))) !== null) {
    const rawJson = decodeHtmlEntities(match[1] || "").trim();

    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson);
      objects.push(...flattenJsonLd(parsed));
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  return objects;
}

function findJsonLdProduct(html) {
  const objects = extractJsonLdObjects(html);

  return (
    objects.find((item) =>
      normalizeJsonLdType(item?.["@type"]).some((type) => type.includes("product"))
    ) || null
  );
}

function collectImageValuesFromObject(value, results = []) {
  if (!value) {
    return results;
  }

  if (typeof value === "string") {
    results.push(value);
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageValuesFromObject(item, results);
    }
    return results;
  }

  if (typeof value === "object") {
    for (const key of ["url", "contentUrl", "src", "image"]) {
      if (value?.[key]) {
        collectImageValuesFromObject(value[key], results);
      }
    }
  }

  return results;
}

function getProductImageFromJsonLd(product, pageUrl) {
  const rawImages = collectImageValuesFromObject(product?.image);

  for (const rawImage of rawImages) {
    const resolvedUrl = rawImage ? resolveUrl(rawImage, pageUrl) : null;

    if (resolvedUrl && isHttpUrl(resolvedUrl) && !isBadProductImageUrl(resolvedUrl)) {
      return resolvedUrl;
    }
  }

  return null;
}

function getProductPriceFromJsonLd(product) {
  const offers = Array.isArray(product?.offers)
    ? product.offers[0]
    : product?.offers;

  const price = offers?.price || offers?.lowPrice || offers?.highPrice || "";
  const currency = offers?.priceCurrency || "";

  if (!price) {
    return "";
  }

  return normalizeVerifiedPriceValue(`${price}${currency ? ` ${currency}` : ""}`);
}


function getProductUrlFromJsonLd(product, pageUrl) {
  const rawUrl =
    product?.url ||
    product?.offers?.url ||
    product?.mainEntityOfPage?.['@id'] ||
    product?.mainEntityOfPage?.url ||
    "";

  const resolvedUrl = rawUrl ? resolveUrl(String(rawUrl), pageUrl) : null;

  return resolvedUrl && isHttpUrl(resolvedUrl) ? resolvedUrl : null;
}

function extractJsonLdProductCandidatesFromHtml({
  html,
  pageUrl,
  websiteUrl,
  campaignPrompt,
}) {
  const objects = extractJsonLdObjects(html);
  const candidates = [];

  for (const object of objects) {
    if (!normalizeJsonLdType(object?.['@type']).some((type) => type.includes('product'))) {
      continue;
    }

    const title = String(object?.name || "").trim();
    const url = getProductUrlFromJsonLd(object, pageUrl) || pageUrl;
    const imageUrl = getProductImageFromJsonLd(object, pageUrl);
    const price = getProductPriceFromJsonLd(object);
    const description = String(object?.description || "").trim();

    if (!title || !url || !isSameOrSubdomainUrl(url, websiteUrl)) {
      continue;
    }

    if (isLikelyBadDiscoveryPageUrl(url, websiteUrl)) {
      continue;
    }

    candidates.push({
      title,
      url,
      price,
      image_url: imageUrl,
      description,
      reason: `Product found in structured data on ${pageUrl}`,
      score: 40 + scorePossibleProductLink({ url, text: title, campaignPrompt }),
    });
  }

  return dedupeUrlItems(candidates);
}

function extractProductUrlCandidatesFromText({
  text,
  pageUrl,
  websiteUrl,
  campaignPrompt,
}) {
  const candidates = [];
  const source = String(text || "");
  const origin = getWebsiteOrigin(websiteUrl);
  const host = getHostnameWithoutWww(websiteUrl);
  const patterns = [
    /https?:\/\/[^"'<>\s]+/gi,
    /["']((?:\/[^"'<>\s]+){1,})["']/g,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(source)) !== null) {
      const raw = String(match[1] || match[0] || "")
        .replace(/\\u002F/g, "/")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .trim();

      if (!raw || raw.length > 700) {
        continue;
      }

      const resolvedUrl = raw.startsWith("http")
        ? raw
        : resolveUrl(raw, origin || pageUrl);

      if (!resolvedUrl || !isHttpUrl(resolvedUrl)) {
        continue;
      }

      if (!isSameOrSubdomainUrl(resolvedUrl, websiteUrl)) {
        continue;
      }

      if (isLikelyNonProductUrl(resolvedUrl, websiteUrl)) {
        continue;
      }

      const lower = resolvedUrl.toLowerCase();
      const looksItemLike =
        lower.includes("/p/") ||
        /\/[^/?#]+-p\d{3,}/i.test(lower) ||
        /\/[^/?#]+\d{5,}/i.test(lower);

      if (!looksItemLike && host && !lower.includes(host)) {
        continue;
      }

      candidates.push({
        title: "",
        url: resolvedUrl.split("#")[0],
        price: "",
        reason: `Item-like URL found in embedded page data on ${pageUrl}`,
        score: (looksItemLike ? 28 : 6) + scorePossibleProductLink({ url: resolvedUrl, text: "", campaignPrompt }),
      });
    }
  }

  return dedupeUrlItems(candidates);
}

function extractVisiblePriceFromText(text) {
  const normalizedText = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return "";
  }

  const priceRegex = new RegExp(PRICE_AMOUNT_PATTERN, "gi");
  const matches = [];
  let match;

  while ((match = priceRegex.exec(normalizedText)) !== null) {
    const value = String(match[0] || "").trim();

    if (!value || !normalizePriceDigits(value)) {
      continue;
    }

    matches.push(value);
  }

  const preferredLocalCurrencyMatch = matches.find((value) =>
    /\b(kr|sek|nok|dkk|eur|euro|uzs)\b|сум|:-/i.test(value)
  );

  return preferredLocalCurrencyMatch || matches[0] || "";
}

function extractProductPriceFromHtml(html) {
  const visiblePrice = extractVisiblePriceFromText(stripHtmlToText(html));

  if (visiblePrice) {
    return normalizeVerifiedPriceValue(visiblePrice);
  }

  return "";
}

function imageUrlMatchesProductIdentity(imageUrl, productUrl, productTitle = "") {
  const imageComparable = normalizeComparableValue(imageUrl);
  const productComparable = normalizeComparableValue(productUrl);
  const titleTokens = String(productTitle || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 4);

  if (!imageComparable) {
    return false;
  }

  const slug = productComparable.split("/").filter(Boolean).at(-1) || "";
  const slugTokens = slug.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 4);

  if (slug && imageComparable.includes(slug)) {
    return true;
  }

  const meaningfulTokens = [...new Set([...slugTokens, ...titleTokens])];
  const matches = meaningfulTokens.filter((token) => imageComparable.includes(token)).length;

  return matches >= Math.min(2, meaningfulTokens.length || 2);
}

function extractBestProductImageFromHtml(html, pageUrl, productTitle = "") {
  const product = findJsonLdProduct(html);
  const jsonLdImage = getProductImageFromJsonLd(product, pageUrl);

  if (jsonLdImage) {
    return jsonLdImage;
  }

  const ogImage = getMetaContent(html, ["og:image", "twitter:image"]);
  const resolvedOgImage = ogImage ? resolveUrl(ogImage, pageUrl) : null;

  if (
    resolvedOgImage &&
    isHttpUrl(resolvedOgImage) &&
    !isBadProductImageUrl(resolvedOgImage)
  ) {
    return resolvedOgImage;
  }

  const imageCandidates = extractImageCandidates(html, pageUrl)
    .filter((image) => image?.url && !isBadProductImageUrl(image.url));

  // Safety rule: never upgrade to a sharper image if we cannot tie it to the same product page.
  // A lower-resolution correct product image is better than a sharp image from a recommended product.
  const matchedImage = imageCandidates.find((image) =>
    imageUrlMatchesProductIdentity(image.url, pageUrl, productTitle)
  );

  return matchedImage?.url || null;
}

async function extractProductDataFromProductPage({
  productUrl,
  websiteUrl,
  webSearchProduct,
}) {
  const html = await fetchHtml(productUrl);
  const product = findJsonLdProduct(html);

  const title =
    String(product?.name || "").trim() ||
    String(webSearchProduct?.title || "").trim() ||
    extractPageTitle(html);

  const metaDescription = getMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);

  const description =
    String(product?.description || "").trim() ||
    String(metaDescription || "").trim() ||
    truncateText(stripHtmlToText(html), 700);

 const price = extractProductPriceFromHtml(html);

if (!price) {
  console.log("Product page candidate has no clear price; continuing because many service/catalog pages hide prices", {
    productUrl,
    title,
  });
}

const imageUrl =
  extractBestProductImageFromHtml(html, productUrl, title) ||
  (webSearchProduct?.image_url &&
  isHttpUrl(webSearchProduct.image_url) &&
  !isBadProductImageUrl(webSearchProduct.image_url) &&
  imageUrlMatchesProductIdentity(webSearchProduct.image_url, productUrl, title)
    ? webSearchProduct.image_url
    : null);

  const normalizedItem = normalizeWebsiteItem(
    {
      title,
      type: "product",
      url: productUrl,
      description,
      price,
      image_url: imageUrl,
    },
    websiteUrl
  );

  if (!normalizedItem) {
    return null;
  }

  if (!normalizedItem.image_url) {
    console.log("Product page candidate has no usable image", {
      productUrl,
      title,
    });
  }

  return {
    ...normalizedItem,
    item_key: createItemKey(normalizedItem),
    reason: webSearchProduct?.reason || "",
    campaign_fit_source: webSearchProduct?.campaign_fit_source || null,
    campaign_fit_score: Number(webSearchProduct?.campaign_fit_score || webSearchProduct?.score || 0),
  };
}
function isLikelyBadDiscoveryPageUrl(value, websiteUrl) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();

    if (!path || path === "/" || isWeakItemUrl(value, websiteUrl)) {
      return true;
    }

    const blockedPathParts = [
      "/blog",
      "/news",
      "/nyheter",
      "/article",
      "/artiklar",
      "/cart",
      "/checkout",
      "/kundvagn",
      "/kassa",
      "/account",
      "/login",
      "/sign-in",
      "/privacy",
      "/integritet",
      "/cookie",
      "/terms",
      "/villkor",
      "/contact",
      "/kontakt",
      "/about",
      "/om-oss",
      "/search",
      "/sok",
      "/sök",
      "/kundservice",
      "/faq",
    ];

    return blockedPathParts.some((part) => path.includes(part));
  } catch {
    return true;
  }
}

function dedupeUrlItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const normalizedUrl = normalizeComparableValue(item?.url);

    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    result.push(item);
  }

  return result;
}

function scorePossibleProductLink({ url, text, campaignPrompt }) {
  let score = 0;

  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);

    // Language-neutral link scoring. Product relevance is handled by structured
    // website data and AI research, not by Swedish/English keyword lists.
    if (pathSegments.length >= 1 && pathSegments.length <= 5) {
      score += 8;
    }

    if (pathSegments.length > 6) {
      score -= 6;
    }

    if (parsedUrl.search) {
      score -= 2;
    }
  } catch {
    score -= 10;
  }

  if (text && String(text).trim().length >= 4) {
    score += 4;
  }

  const terms = extractCampaignTerms({ prompt: campaignPrompt });
  if (terms.length) {
    const haystack = normalizeSearchText(`${url || ""} ${text || ""}`);
    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 35;
      }
    }
  }

  return score;
}

function extractProductLinksFromDiscoveryPage({
  html,
  pageUrl,
  websiteUrl,
  campaignPrompt,
}) {
  const links = extractLinks(html, pageUrl);
  const candidates = [];

  candidates.push(
    ...extractJsonLdProductCandidatesFromHtml({
      html,
      pageUrl,
      websiteUrl,
      campaignPrompt,
    })
  );

  candidates.push(
    ...extractProductUrlCandidatesFromText({
      text: html,
      pageUrl,
      websiteUrl,
      campaignPrompt,
    })
  );

  for (const link of links) {
    const url = link?.url;

    if (!url || !isHttpUrl(url)) {
      continue;
    }

    if (!isSameOrSubdomainUrl(url, websiteUrl)) {
      continue;
    }

    if (isLikelyNonProductUrl(url, websiteUrl)) {
      continue;
    }

    const score = scorePossibleProductLink({
      url,
      text: link.text || "",
      campaignPrompt,
    });

    if (score < 0) {
      continue;
    }

    candidates.push({
      title: link.text || "",
      url,
      price: "",
      reason: `Product link found on discovery page: ${pageUrl}`,
      score,
    });
  }

  return dedupeUrlItems(candidates)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 40);
}

async function findProductCandidatesFromDiscoveryPages({
  discoveryPages,
  websiteUrl,
  campaignPrompt,
}) {
  const candidates = [];

  for (const page of discoveryPages || []) {
    try {
      const html = await fetchHtml(page.url);

      const pageCandidates = extractProductLinksFromDiscoveryPage({
        html,
        pageUrl: page.url,
        websiteUrl,
        campaignPrompt,
      });

      candidates.push(...pageCandidates);
    } catch (error) {
      console.error("Could not fetch discovery page for product links", {
        discoveryPageUrl: page.url,
        message: error.message,
      });
    }
  }

  return dedupeUrlItems(candidates)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 12);
}

function getWebsiteOrigin(websiteUrl) {
  try {
    const url = new URL(websiteUrl);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "";
  }
}

function makeSearchSlug(value) {
  return normalizeSearchText(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildCampaignDiscoverySearches(campaignPrompt) {
  const terms = extractCampaignTerms({ prompt: campaignPrompt });
  const searches = [];

  for (const term of terms.slice(0, 8)) {
    const slug = makeSearchSlug(term);
    if (slug) searches.push(slug);
  }

  const normalizedPrompt = normalizeSearchText(campaignPrompt);
  const phrase = makeSearchSlug(normalizedPrompt.split(/\s+/).slice(0, 4).join(" "));
  if (phrase) searches.unshift(phrase);

  return Array.from(new Set(searches)).slice(0, 10);
}

function buildLikelyDiscoveryUrls(websiteUrl, campaignPrompt = "") {
  const origin = getWebsiteOrigin(websiteUrl);
  const urls = [];

  if (websiteUrl && isHttpUrl(websiteUrl)) {
    urls.push(websiteUrl);
  }

  if (origin) {
    const campaignSearches = buildCampaignDiscoverySearches(campaignPrompt);

    for (const search of campaignSearches) {
      const encoded = encodeURIComponent(search.replace(/-/g, " "));
      urls.push(
        `${origin}/collections/${search}`,
        `${origin}/collections/${search}/products.json?limit=250`,
        `${origin}/search?q=${encoded}`,
        `${origin}/search?type=product&q=${encoded}`,
        `${origin}/collections/all/${search}`
      );
    }

    urls.push(
      `${origin}/collections/all`,
      `${origin}/products`,
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_products_1.xml`,
      `${origin}/product-sitemap.xml`
    );
  }

  return Array.from(new Set(urls));
}

function extractUrlsFromXml(xml, pageUrl) {
  const urls = [];
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;

  while ((match = locRegex.exec(String(xml || ""))) !== null) {
    const rawUrl = String(match[1] || "").trim();
    const url = resolveUrl(rawUrl, pageUrl);

    if (url && isHttpUrl(url)) {
      urls.push(url);
    }
  }

  return Array.from(new Set(urls));
}

function scoreDiscoveredProductUrl(url, websiteUrl, campaignPrompt) {
  return scorePossibleProductLink({
    url,
    text: "",
    campaignPrompt,
  }) + (isLikelyNonProductUrl(url, websiteUrl) ? -100 : 0);
}

async function discoverShopifyProductsJson({ websiteUrl, campaignPrompt }) {
  const origin = getWebsiteOrigin(websiteUrl);

  if (!origin) {
    return [];
  }

  const discovered = [];

  for (let page = 1; page <= 3; page += 1) {
    const jsonUrl = `${origin}/products.json?limit=250&page=${page}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
      const response = await fetch(jsonUrl, {
        headers: {
          "user-agent": "SpreeloBot/1.0 (+https://spreelo.com)",
          accept: "application/json,text/plain,*/*",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        break;
      }

      const json = await response.json();
      const products = Array.isArray(json?.products) ? json.products : [];

      if (!products.length) {
        break;
      }

      for (const product of products) {
        const handle = String(product?.handle || "").trim();
        const title = String(product?.title || "").trim();
        const productUrl = handle ? `${origin}/products/${handle}` : "";
        const imageUrl =
          product?.image?.src ||
          product?.images?.[0]?.src ||
          null;
        const firstVariant = Array.isArray(product?.variants)
          ? product.variants[0]
          : null;
        const price = normalizeVerifiedPriceValue(
          firstVariant?.price ? String(firstVariant.price) : ""
        );

        if (!productUrl || !title || isLikelyNonProductUrl(productUrl, websiteUrl)) {
          continue;
        }

        discovered.push({
          title,
          url: productUrl,
          price,
          image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
          description: String(product?.body_html || product?.body || ""),
          reason: "Product found from Shopify products feed",
          score: scorePossibleProductLink({ url: productUrl, text: title, campaignPrompt }),
        });
      }
    } catch (error) {
      console.log("Shopify products.json discovery unavailable", {
        websiteUrl,
        message: error.message,
      });
      break;
    }
  }

  return dedupeUrlItems(discovered)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 80);
}

async function discoverShopifyCollectionJson({ websiteUrl, campaignPrompt }) {
  const origin = getWebsiteOrigin(websiteUrl);
  const searches = buildCampaignDiscoverySearches(campaignPrompt);
  const discovered = [];

  if (!origin || !searches.length) {
    return [];
  }

  for (const search of searches.slice(0, 6)) {
    const jsonUrl = `${origin}/collections/${search}/products.json?limit=250`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
      const response = await fetch(jsonUrl, {
        headers: {
          "user-agent": "SpreeloBot/1.0 (+https://spreelo.com)",
          accept: "application/json,text/plain,*/*",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        continue;
      }

      const json = await response.json();
      const products = Array.isArray(json?.products) ? json.products : [];

      for (const product of products) {
        const handle = String(product?.handle || "").trim();
        const title = String(product?.title || "").trim();
        const productUrl = handle ? `${origin}/products/${handle}` : "";
        const imageUrl = product?.image?.src || product?.images?.[0]?.src || null;
        const firstVariant = Array.isArray(product?.variants) ? product.variants[0] : null;
        const price = normalizeVerifiedPriceValue(firstVariant?.price ? String(firstVariant.price) : "");

        if (!productUrl || !title || isLikelyNonProductUrl(productUrl, websiteUrl)) {
          continue;
        }

        discovered.push({
          title,
          url: productUrl,
          price,
          image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
          description: String(product?.body_html || product?.body || ""),
          reason: `Product found from Shopify campaign collection: ${search}`,
          score: 80 + scorePossibleProductLink({ url: productUrl, text: title, campaignPrompt }),
          campaign_fit_source: "campaign_collection_json",
        });
      }
    } catch (error) {
      console.log("Shopify campaign collection discovery unavailable", {
        websiteUrl,
        collection: search,
        message: error.message,
      });
    }
  }

  return dedupeUrlItems(discovered)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 80);
}

async function discoverProductsFromSitemaps({
  websiteUrl,
  campaignPrompt,
  maxSitemaps = 12,
  maxCandidates = 80,
}) {
  const origin = getWebsiteOrigin(websiteUrl);
  const startUrls = Array.from(
    new Set(
      [
        origin ? `${origin}/sitemap.xml` : "",
        origin ? `${origin}/sitemap_index.xml` : "",
        origin ? `${origin}/sitemap-products.xml` : "",
        origin ? `${origin}/sitemap_product.xml` : "",
        origin ? `${origin}/product-sitemap.xml` : "",
        origin ? `${origin}/products-sitemap.xml` : "",
        origin ? `${origin}/sitemap_products_1.xml` : "",
      ].filter(Boolean)
    )
  );

  const queue = [...startUrls];
  const visited = new Set();
  const candidates = [];

  while (queue.length && visited.size < maxSitemaps && candidates.length < maxCandidates) {
    const sitemapUrl = queue.shift();
    const normalizedSitemapUrl = normalizeComparableValue(sitemapUrl);

    if (!sitemapUrl || visited.has(normalizedSitemapUrl)) {
      continue;
    }

    visited.add(normalizedSitemapUrl);

    try {
      const xml = await fetchHtml(sitemapUrl);
      const urls = extractUrlsFromXml(xml, sitemapUrl).filter((url) =>
        isSameOrSubdomainUrl(url, websiteUrl)
      );

      if (!urls.length) {
        continue;
      }

      if (/<sitemapindex/i.test(xml)) {
        queue.push(...urls.slice(0, 8));
        continue;
      }

      const productUrls = urls
        .map((url) => ({
          title: "",
          url,
          price: "",
          reason: `Product URL found in sitemap: ${sitemapUrl}`,
          score: scoreDiscoveredProductUrl(url, websiteUrl, campaignPrompt),
        }))
        .filter((item) => item.score >= 0)
        .filter((item) => !isLikelyBadDiscoveryPageUrl(item.url, websiteUrl));

      candidates.push(...productUrls);
    } catch (error) {
      console.log("Product sitemap discovery unavailable", {
        sitemapUrl,
        message: error.message,
      });
    }
  }

  const result = dedupeUrlItems(candidates)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, maxCandidates);

  console.log("Product sitemap discovery finished", {
    websiteUrl,
    visitedSitemapCount: visited.size,
    candidateCount: result.length,
  });

  return result;
}

async function discoverProductCandidatesFromWebsite({
  websiteUrl,
  campaignPrompt,
  usedItems = [],
}) {
  const candidates = [];
  const usedComparable = new Set(
    (usedItems || [])
      .map((item) => normalizeComparableValue(item.item_url || item.product_url || item.url))
      .filter(Boolean)
  );

  const sitemapCandidates = await discoverProductsFromSitemaps({
    websiteUrl,
    campaignPrompt,
  });
  candidates.push(...sitemapCandidates);

  const shopifyCollectionCandidates = await discoverShopifyCollectionJson({
    websiteUrl,
    campaignPrompt,
  });
  candidates.push(...shopifyCollectionCandidates);

  const shopifyCandidates = await discoverShopifyProductsJson({
    websiteUrl,
    campaignPrompt,
  });
  candidates.push(...shopifyCandidates);

  const discoveryUrls = buildLikelyDiscoveryUrls(websiteUrl, campaignPrompt).slice(
    0,
    WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT
  );

  for (const discoveryUrl of discoveryUrls) {
    try {
      const html = await fetchHtml(discoveryUrl);

      if (/<urlset|<sitemapindex/i.test(html)) {
        const xmlUrls = extractUrlsFromXml(html, discoveryUrl)
          .filter((url) => isSameOrSubdomainUrl(url, websiteUrl))
          .filter((url) => scoreDiscoveredProductUrl(url, websiteUrl, campaignPrompt) >= 0)
          .map((url) => ({
            title: "",
            url,
            price: "",
            reason: `Product URL found in sitemap/discovery page: ${discoveryUrl}`,
            score: scoreDiscoveredProductUrl(url, websiteUrl, campaignPrompt),
          }));

        candidates.push(...xmlUrls);
        continue;
      }

      const pageCandidates = extractProductLinksFromDiscoveryPage({
        html,
        pageUrl: discoveryUrl,
        websiteUrl,
        campaignPrompt,
      });

      candidates.push(...pageCandidates);
    } catch (error) {
      console.log("Product catalog discovery page unavailable", {
        discoveryUrl,
        message: error.message,
      });
    }
  }

  return dedupeUrlItems(candidates)
    .filter((item) => !usedComparable.has(normalizeComparableValue(item.url)))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT);
}

async function verifyDiscoveredWebsiteProductCandidates({
  candidates,
  websiteUrl,
  limit = WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT,
}) {
  const verifiedItems = [];
  const seenUrls = new Set();
  const seenImages = new Set();

  for (const candidate of candidates || []) {
    if (verifiedItems.length >= limit) {
      break;
    }

    try {
      const websiteItem = await extractProductDataFromProductPage({
        productUrl: candidate.url,
        websiteUrl,
        webSearchProduct: candidate,
      });

      if (!websiteItem?.url || !websiteItem?.title) {
        continue;
      }

      const normalizedUrl = normalizeComparableValue(websiteItem.url);
      const normalizedImageUrl = normalizeComparableValue(websiteItem.image_url);

      if (seenUrls.has(normalizedUrl) || (normalizedImageUrl && seenImages.has(normalizedImageUrl))) {
        continue;
      }

      seenUrls.add(normalizedUrl);
      if (normalizedImageUrl) {
        seenImages.add(normalizedImageUrl);
      }

      verifiedItems.push(websiteItem);
    } catch (error) {
      console.log("Could not verify discovered product catalog candidate", {
        productUrl: candidate?.url,
        message: error.message,
      });
    }
  }

  return verifiedItems;
}

async function findProductUrlWithWebSearch({
  openai,
  brandProfile,
  rule,
  attempt = "best_match",
  usedWebsiteItems = [],
}) {
  const websiteUrl = getWebsiteProductSourceUrl(brandProfile);

  if (!websiteUrl) {
    return {
      products: [],
      discoveryPages: [],
    };
  }

  const websiteHost = getHostnameWithoutWww(websiteUrl);
  const campaignPrompt = String(rule?.prompt || "").trim();

  if (!websiteHost) {
    return {
      products: [],
      discoveryPages: [],
    };
  }

  const isBackupAttempt = attempt === "backup_broad";
  const usedProductsBlock = formatUsedWebsiteItemsForResearchPrompt(
    usedWebsiteItems,
    WEBSITE_PRODUCT_REUSE_LIMIT
  );

const response = await openai.responses.create({
  model: PRODUCT_RESEARCH_MODEL,
  tools: [{ type: "web_search" }],
  tool_choice: "required",
  reasoning: {
    effort: "medium",
  },
  input: `
You are a product researcher for a social media automation app.

Your job:
Find real, concrete products from the customer's website that can be promoted in a social media post.

Customer website:
${websiteUrl}

Allowed domain:
${websiteHost}

Brand profile:
${formatBrandProfileForPrompt(brandProfile)}

Campaign / automation prompt:
${campaignPrompt || "No specific campaign prompt was provided. Find a concrete product from the customer website that would work well in a social media sales post."}

Products already used recently by Spreelo for this brand/source:
${usedProductsBlock}

Reuse rule:
- Do not return products from the already-used list unless there are truly no other products on the website.
- Actively search for different products first.
- The goal is to avoid reusing the same product within the latest ${WEBSITE_PRODUCT_REUSE_LIMIT} product posts when the store has enough products.

Research mode:
${
  isBackupAttempt
    ? `
This is a backup attempt.

The first attempt did not find a usable product page.

Now broaden the search, but still return ONLY real product pages.
If the perfect campaign match is hard to find, choose the best concrete product from the customer website that is still reasonably useful for the campaign.
Do not return category pages, brand pages, gift guide pages, age pages or campaign pages.
`.trim()
    : `
This is the primary attempt.

Find the strongest product match for the campaign.
`.trim()
}

Before searching, analyze the campaign like a marketing strategist.

Campaign analysis:
- What is the campaign, holiday, season, theme day or sales angle?
- Who is the likely buyer?
- Who is the likely recipient or end user?
- Is the product meant as a gift, shared activity, seasonal need, celebration item, practical purchase, impulse buy, premium purchase, problem-solver or inspiration?
- What age group, life situation, interest, relationship or occasion does the campaign imply?
- What product categories naturally fit this intent?
- What product types would feel wrong, too random, too childish, too adult, too generic, too expensive, too cheap or aimed at the wrong person?

Then search like a human researcher.

Use several targeted searches based on your campaign analysis.
Do not only open the homepage.
Do not only choose the first result.
Do not choose a product just because it exists on the website.
Choose products because they match the campaign intent.

Search strategy:
- First search the customer site for category, collection, campaign, search-result or landing pages that match the campaign/theme/occasion in the site's own language.
- Open the most relevant campaign/theme/category area and identify concrete product pages from there.
- Search for specific product categories that fit the campaign.
- Search for recipient-based product ideas.
- Search for occasion-based product ideas.
- Search for use-case-based product ideas.
- Search for gift/activity/seasonal/sales intent when relevant.
- Prefer concrete product pages over category, brand or listing pages in the final result, but use category/campaign pages as research paths.

Product quality rules:
- Return only real product pages from the allowed customer domain.
- A product page must be about one specific product that a customer can buy, book, order, rent, request a quote for or contact the business about.
- Do not return the homepage.
- Do not return brand pages.
- Do not return category pages.
- Do not return gift guide pages.
- Do not return age collection pages.
- Do not return campaign landing pages.
- Do not return customer service pages.
- Do not return FAQ pages.
- Do not return blog/news pages.
- Do not return search pages.
- Do not return cart or checkout pages.
- Do not return images by themselves.
- Do not return another company's website.
- Do not guess URLs.
- Prefer products that likely have a clear product image.
- If you cannot find the perfect campaign match, still choose the best real concrete product from the customer website rather than returning a category, brand or guide page.

Ranking rules:
- Rank products by campaign fit, not by what appears first.
- Prefer products that match the likely buyer, recipient and reason to buy.
- Prefer products that create a clear social media angle.
- Prefer products with strong emotional, practical, seasonal or gift relevance.
- Avoid products aimed at the wrong recipient or wrong age group if better options exist.
- Avoid generic products that only loosely match the theme.
- If a campaign/theme-specific area on the customer site contains concrete product pages, those concrete products should beat generic homepage products unless there is a clear reason not to.
- If several products fit, prefer the one that is easiest to explain in a clear, useful and attractive post.

Language-neutral campaign and business-fit rules:
- Do not use a fixed Swedish or English list of holidays, product words or campaign categories.
- Infer the campaign meaning from the campaign prompt, the selected/inferred market, the website language, the brand profile and the customer website.
- Identify the most likely product types, recipients, buyer motivations and use cases for that exact campaign before searching.
- Search the customer's site for campaign/theme/occasion/category pages in the site's own language, then open concrete product pages from those areas.
- When a campaign/theme-specific product category exists on the site, products from that area should outrank generic homepage products, generic custom products and broad bestsellers.
- A product should be chosen because it clearly fits the campaign intent, not merely because it is on the website or has a good image.
- If discount information is not clearly visible, do not invent a discount.
- A visible ordinary price is not proof of an offer, sale, deal, discount or campaign price.
- Do not describe a product as an offer/deal/sale/discount unless the product page clearly says it is discounted or on sale.

Output:
Return strict JSON only.
Do not explain.
Do not include markdown.

JSON shape:
{
  "products": [
    {
      "title": "Exact product title",
      "url": "Full product page URL",
      "price": "Visible price if clearly found, otherwise empty string",
      "reason": "Short reason why this product fits the campaign, buyer and recipient"
    }
  ],
  "discovery_pages": []
}

Return 1 to 5 real product pages if possible.
`.trim(),
  });

  const content = response.output_text || "";
  const parsed = safeJsonParse(content);

  const rawProducts = Array.isArray(parsed?.products) ? parsed.products : [];

  const validProducts = [];

  for (const product of rawProducts) {
    const productUrl = String(product?.url || "").trim();

    if (!productUrl || !isHttpUrl(productUrl)) {
      continue;
    }

    if (!isSameOrSubdomainUrl(productUrl, websiteUrl)) {
      console.error("Product researcher returned product from wrong domain", {
        ruleId: rule?.id,
        websiteUrl,
        productUrl,
        attempt,
      });

      continue;
    }

    if (isLikelyNonProductUrl(productUrl, websiteUrl)) {
      console.error("Product researcher returned weak or non-product URL", {
        ruleId: rule?.id,
        websiteUrl,
        productUrl,
        attempt,
      });

      continue;
    }

    if (isLikelyBadDiscoveryPageUrl(productUrl, websiteUrl)) {
      console.error("Product researcher returned discovery/category URL instead of product URL", {
        ruleId: rule?.id,
        websiteUrl,
        productUrl,
        attempt,
      });

      continue;
    }

    validProducts.push({
      title: String(product?.title || "").trim(),
      url: productUrl,
      price: String(product?.price || "").trim(),
      reason: String(product?.reason || "").trim(),
    });
  }

  if (!validProducts.length) {
    console.error("Product researcher returned no valid product URLs", {
      ruleId: rule?.id,
      brandProfileId: rule?.brand_profile_id,
      websiteUrl,
      attempt,
      rawResponse: truncateText(content, 1200),
    });
  }

  return {
    products: dedupeUrlItems(validProducts).slice(0, 5),
    discoveryPages: [],
  };
}

async function findWebsiteProductWithWebSearch({
  openai,
  brandProfile,
  rule,
  websiteUrl,
  usedWebsiteItems = [],
}) {
  const attempts = ["best_match", "backup_broad"];
  const verifiedItems = [];
  const seenUrls = new Set();
  const seenImages = new Set();
  const MAX_VERIFIED_ITEMS = 12;

  for (const attempt of attempts) {
    const searchResult = await findProductUrlWithWebSearch({
      openai,
      brandProfile,
      rule,
      attempt,
      usedWebsiteItems,
    });

    const webSearchProducts = Array.isArray(searchResult?.products)
      ? searchResult.products
      : [];

    if (!webSearchProducts.length) {
      console.error("Product researcher found no usable product candidates", {
        ruleId: rule?.id,
        brandProfileId: rule?.brand_profile_id,
        websiteUrl,
        attempt,
      });

      continue;
    }

    for (const webSearchProduct of webSearchProducts) {
      try {
        const websiteItem = await extractProductDataFromProductPage({
          productUrl: webSearchProduct.url,
          websiteUrl,
          webSearchProduct,
        });

        if (!websiteItem?.image_url) {
          console.log("Product researcher candidate had no usable product image; keeping it as text-only fallback", {
            ruleId: rule?.id,
            productUrl: webSearchProduct.url,
            title: webSearchProduct.title,
            attempt,
          });
        }

        const normalizedUrl = normalizeComparableValue(websiteItem.url);
        const normalizedImageUrl = normalizeComparableValue(websiteItem.image_url);

        if (seenUrls.has(normalizedUrl) || (normalizedImageUrl && seenImages.has(normalizedImageUrl))) {
          console.error("Product researcher duplicate candidate skipped", {
            ruleId: rule?.id,
            productUrl: websiteItem.url,
            title: websiteItem.title,
            imageUrl: websiteItem.image_url,
            attempt,
          });

          continue;
        }

        seenUrls.add(normalizedUrl);
        if (normalizedImageUrl) {
          seenImages.add(normalizedImageUrl);
        }
        verifiedItems.push(websiteItem);

        console.log("Product researcher verified website product", {
          ruleId: rule?.id,
          productUrl: websiteItem.url,
          title: websiteItem.title,
          imageUrl: websiteItem.image_url,
          attempt,
          verifiedCount: verifiedItems.length,
        });

        if (verifiedItems.length >= MAX_VERIFIED_ITEMS) {
          console.log("Product researcher stopped after reaching max verified products", {
            ruleId: rule?.id,
            brandProfileId: rule?.brand_profile_id,
            websiteUrl,
            attempt,
            verifiedCount: verifiedItems.length,
          });

          return verifiedItems;
        }
      } catch (candidateError) {
        console.error("Could not extract product data from researcher result", {
          ruleId: rule?.id,
          productUrl: webSearchProduct.url,
          title: webSearchProduct.title,
          attempt,
          message: candidateError.message,
        });
      }
    }

    console.log("Product researcher attempt finished", {
      ruleId: rule?.id,
      brandProfileId: rule?.brand_profile_id,
      websiteUrl,
      attempt,
      candidateCount: webSearchProducts.length,
      verifiedCount: verifiedItems.length,
    });

  }

  return verifiedItems;
}
function createSafeWebsiteCampaignFallbackItem({ brandProfile, rule, websiteUrl }) {
  const businessName = String(brandProfile?.business_name || "the business").trim();
  const prompt = String(rule?.prompt || "").trim();

  const title = prompt
    ? `Campaign inspiration: ${prompt}`
    : `Campaign inspiration from ${businessName}`;

  const description = `
This fallback item is used because no verified product page with a safe product image was found.

Create a general campaign post for ${businessName}.
Base the post on the campaign instruction and brand profile.
Do not mention a specific product.
Do not invent a product, price, discount, stock status or product details.
Do not claim that a specific item is available.
Invite people to explore the website for relevant options.
`.trim();

  const item = normalizeWebsiteItem(
    {
      title,
      type: "campaign_fallback",
      url: websiteUrl,
      description,
      price: "",
      image_url: null,
    },
    websiteUrl
  );

  if (!item) {
    return null;
  }

  return {
    ...item,
    item_key: createItemKey(item),
  };
}
async function prepareWebsiteContentForRule({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  if (!rule.uses_website_content) {
    return {
      websiteItem: null,
      websiteSourceUrl: null,
      websiteCycleNumber: null,
      useWebsiteImage: false,
    };
  }

  summary.website_content_rules += 1;

  const websiteUrl = getWebsiteProductSourceUrl(brandProfile);
  const contentType = rule.content_type_id || "website_item";

  if (!websiteUrl) {
    throw new Error("This automation requires a website URL in Brand profile");
  }

  const recentUsedItems = await getRecentUsedWebsiteItems({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType,
    limit: WEBSITE_PRODUCT_REUSE_LIMIT,
  });

  const catalogItems = filterWebsiteCatalogItemsForRule(
    await getWebsiteProductCatalogItems({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
    }),
    rule
  );

  const sortedCatalogItems = [...catalogItems].sort(
    (a, b) => scoreWebsiteItemForRule(b, rule) - scoreWebsiteItemForRule(a, rule)
  );

  const catalogSelection = await chooseUnusedWebsiteItem({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType,
    items: sortedCatalogItems,
    rule,
    usedWebsiteImageUrlsThisRun,
    recentUsedItems,
    allowReuseWhenExhausted: false,
  });

  if (catalogSelection?.item && !isCampaignScopedWebsiteRule(rule)) {
    console.log("Website product selected from product catalog", {
      ruleId: rule.id,
      brandProfileId: rule.brand_profile_id,
      websiteUrl,
      productUrl: catalogSelection.item.url,
      title: catalogSelection.item.title,
      catalogCount: catalogItems.length,
      recentUsedCount: recentUsedItems.length,
    });

    summary.website_items_found += 1;
    summary.website_content_success += 1;

    return {
      websiteItem: catalogSelection.item,
      websiteSourceUrl: websiteUrl,
      websiteCycleNumber: catalogSelection.cycleNumber,
      useWebsiteImage: catalogSelection.useWebsiteImage,
    };
  }

  if (catalogSelection?.item && isCampaignScopedWebsiteRule(rule)) {
    console.log("Campaign website rule found a catalog match, but will still run live product research before final selection", {
      ruleId: rule.id,
      brandProfileId: rule.brand_profile_id,
      websiteUrl,
      productUrl: catalogSelection.item.url,
      title: catalogSelection.item.title,
      catalogCount: catalogItems.length,
      recentUsedCount: recentUsedItems.length,
    });
  }

  try {
    const webSearchItems = await findWebsiteProductWithWebSearch({
      openai,
      brandProfile,
      rule,
      websiteUrl,
      usedWebsiteItems: recentUsedItems,
    });

    if (Array.isArray(webSearchItems) && webSearchItems.length) {
      const selected = await chooseUnusedWebsiteItem({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        contentType,
        items: isCampaignScopedWebsiteRule(rule)
          ? [
              ...webSearchItems.map((item) => ({
                ...item,
                selection_priority: 100,
                campaign_fit_source: "ai_campaign_research",
                campaign_fit_score: scoreCampaignFitForRule(item, rule) + 40,
              })),
              ...getStrongCampaignFitItems(sortedCatalogItems, rule).map((item) => ({ ...item, selection_priority: 10 })),
            ]
          : webSearchItems,
        rule,
        usedWebsiteImageUrlsThisRun,
        recentUsedItems,
        allowReuseWhenExhausted: false,
      });

      if (selected?.item && (!isCampaignScopedWebsiteRule(rule) || scoreCampaignFitForRule(selected.item, rule) >= CAMPAIGN_STRONG_PRODUCT_FIT_SCORE)) {
        await upsertWebsiteProductCatalogItems({
          supabase,
          userId: rule.user_id,
          brandProfileId: rule.brand_profile_id,
          sourceUrl: websiteUrl,
          items: [selected.item],
          discoverySource: getWebsiteCatalogDiscoverySource("ai_web_search", rule),
        });

        summary.website_items_found += 1;
        summary.website_content_success += 1;
        summary.website_web_search_success += 1;

        return {
          websiteItem: selected.item,
          websiteSourceUrl: websiteUrl,
          websiteCycleNumber: selected.cycleNumber,
          useWebsiteImage: selected.useWebsiteImage,
        };
      }

      console.log("Verified products were found but all were recently used; expanding catalog discovery", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        verifiedCount: webSearchItems.length,
        recentUsedCount: recentUsedItems.length,
        reuseLimit: WEBSITE_PRODUCT_REUSE_LIMIT,
      });
    }

    const discoveredCandidates = await discoverProductCandidatesFromWebsite({
      websiteUrl,
      campaignPrompt: buildCampaignResearchText(rule),
      usedItems: recentUsedItems,
    });

    if (discoveredCandidates.length) {
      const discoveredItems = await verifyDiscoveredWebsiteProductCandidates({
        candidates: discoveredCandidates,
        websiteUrl,
      });

      const discoveredSelection = await chooseUnusedWebsiteItem({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        contentType,
        items: isCampaignScopedWebsiteRule(rule)
          ? [
              ...discoveredItems.map((item) => ({
                ...item,
                selection_priority: 100,
                campaign_fit_source: "campaign_discovery",
                campaign_fit_score: scoreCampaignFitForRule(item, rule),
              })),
              ...(Array.isArray(webSearchItems) ? webSearchItems.map((item) => ({
                ...item,
                selection_priority: 90,
                campaign_fit_source: "ai_campaign_research",
                campaign_fit_score: scoreCampaignFitForRule(item, rule) + 40,
              })) : []),
              ...getStrongCampaignFitItems(sortedCatalogItems, rule).map((item) => ({ ...item, selection_priority: 10 })),
            ]
          : discoveredItems,
        rule,
        usedWebsiteImageUrlsThisRun,
        recentUsedItems,
        allowReuseWhenExhausted: false,
      });

      if (discoveredSelection?.item && (!isCampaignScopedWebsiteRule(rule) || scoreCampaignFitForRule(discoveredSelection.item, rule) >= CAMPAIGN_STRONG_PRODUCT_FIT_SCORE)) {
        await upsertWebsiteProductCatalogItems({
          supabase,
          userId: rule.user_id,
          brandProfileId: rule.brand_profile_id,
          sourceUrl: websiteUrl,
          items: [discoveredSelection.item],
          discoverySource: getWebsiteCatalogDiscoverySource("site_discovery", rule),
        });

        console.log("Website product selected from expanded product discovery", {
          ruleId: rule.id,
          brandProfileId: rule.brand_profile_id,
          websiteUrl,
          productUrl: discoveredSelection.item.url,
          title: discoveredSelection.item.title,
          discoveredCount: discoveredItems.length,
          recentUsedCount: recentUsedItems.length,
        });

        summary.website_items_found += 1;
        summary.website_content_success += 1;
        summary.website_web_search_success += 1;

        return {
          websiteItem: discoveredSelection.item,
          websiteSourceUrl: websiteUrl,
          websiteCycleNumber: discoveredSelection.cycleNumber,
          useWebsiteImage: discoveredSelection.useWebsiteImage,
        };
      }
    }

    const reusablePool = isCampaignScopedWebsiteRule(rule)
      ? [
          ...getStrongCampaignFitItems(sortedCatalogItems, rule),
          ...(Array.isArray(webSearchItems) ? getStrongCampaignFitItems(webSearchItems, rule) : []),
        ]
      : [...sortedCatalogItems, ...(Array.isArray(webSearchItems) ? webSearchItems : [])];
    const reuseSelection = await chooseUnusedWebsiteItem({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      contentType,
      items: reusablePool,
      rule,
      usedWebsiteImageUrlsThisRun,
      recentUsedItems,
      allowReuseWhenExhausted: true,
    });

    if (reuseSelection?.item && (!isCampaignScopedWebsiteRule(rule) || scoreCampaignFitForRule(reuseSelection.item, rule) >= CAMPAIGN_STRONG_PRODUCT_FIT_SCORE)) {
      await upsertWebsiteProductCatalogItems({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        items: [reuseSelection.item],
        discoverySource: getWebsiteCatalogDiscoverySource("reuse_selected", rule),
      });

      if (reuseSelection.startedNewCycle) {
        summary.website_items_reused_cycle += 1;
      }

      summary.website_items_found += 1;
      summary.website_content_success += 1;
      summary.website_web_search_success += 1;

      return {
        websiteItem: reuseSelection.item,
        websiteSourceUrl: websiteUrl,
        websiteCycleNumber: reuseSelection.cycleNumber,
        useWebsiteImage: reuseSelection.useWebsiteImage,
      };
    }
  } catch (webSearchError) {
    console.error("Website product research failed", {
      ruleId: rule.id,
      brandProfileId: rule.brand_profile_id,
      websiteUrl,
      message: webSearchError.message,
    });

    summary.website_web_search_failed += 1;
  }

  summary.website_web_search_fallback_used += 1;

  console.error("No verified website product found. Refusing to create a website-product post without a real verified website item.", {
    ruleId: rule.id,
    brandProfileId: rule.brand_profile_id,
    websiteUrl,
  });

  throw new Error(
    "No verified matching website product could be found for this product-based post. Spreelo will not create a generic AI fallback for a post that requires a real website product."
  );
}

async function saveCarouselWebsiteContentHistory({
  supabase,
  rule,
  postId,
  sourceUrl,
  websiteItems,
  cycleNumber,
}) {
  if (!isCarouselRule(rule) || !Array.isArray(websiteItems) || !websiteItems.length || !sourceUrl) {
    return;
  }

  const rows = websiteItems.map((websiteItem, index) => ({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,
    automation_rule_id: rule.id,
    post_id: postId,
    source_url: sourceUrl,
    source_type: "website",
    content_type: rule.content_type_id || "carousel_website_item",
    item_key: websiteItem.item_key || createItemKey(websiteItem),
    item_url: websiteItem.url || null,
    item_title: websiteItem.title || null,
    item_description: websiteItem.description || null,
    item_image_url: websiteItem.image_url || null,
    cycle_number: cycleNumber || 1,
  }));

  const { error } = await supabase.from("website_content_history").insert(rows);

  if (error) {
    throw new Error(error.message || "Could not save carousel website content history");
  }

  await Promise.all(
    websiteItems.map((websiteItem) =>
      markWebsiteProductCatalogItemUsed({
        supabase,
        brandProfileId: rule.brand_profile_id,
        productUrl: websiteItem.url,
        usedSource: getWebsiteCatalogUsedSource(rule),
      })
    )
  );
}

async function saveWebsiteContentHistory({
  supabase,
  rule,
  postId,
  sourceUrl,
  websiteItem,
  cycleNumber,
}) {
  if (!rule.uses_website_content || !websiteItem || !sourceUrl) {
    return;
  }

  const { error } = await supabase.from("website_content_history").insert({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,
    automation_rule_id: rule.id,
    post_id: postId,
    source_url: sourceUrl,
    source_type: "website",
    content_type: rule.content_type_id || "website_item",
    item_key: websiteItem.item_key,
    item_url: websiteItem.url || null,
    item_title: websiteItem.title || null,
    item_description: websiteItem.description || null,
    item_image_url: websiteItem.image_url || null,
    cycle_number: cycleNumber || 1,
  });

  if (error) {
    throw new Error(error.message || "Could not save website content history");
  }

  await markWebsiteProductCatalogItemUsed({
    supabase,
    brandProfileId: rule.brand_profile_id,
    productUrl: websiteItem.url,
    usedSource: getWebsiteCatalogUsedSource(rule),
  });
}

async function generateAutomationPost(openai, rule) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert social media copywriter. You write clear, useful and ready-to-publish social media posts. You must always follow the provided brand profile and never invent a different industry.",
      },
      {
        role: "user",
        content: buildAutomationPrompt(rule),
      },
    ],
    temperature: 0.75,
  });

  return completion.choices?.[0]?.message?.content?.trim() || "";
}

async function generateCarouselSlides(openai, rule, postContent) {
  const carouselProducts = getCarouselProducts(rule).filter(isValidCarouselProduct);

  if (carouselProducts.length >= CAROUSEL_MIN_PRODUCT_SLIDES) {
    return generateProductCarouselSlides(openai, rule, postContent, carouselProducts);
  }

  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const websiteItemText = formatWebsiteItemForPrompt(rule.website_item);
  const destinationUrl = getPostDestinationUrl(rule);

  try {
    const completion = await openai.chat.completions.create({
      model: POST_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Spreelo, an expert social media carousel strategist. Return only valid JSON. Do not explain your work.",
        },
        {
          role: "user",
          content: `
Create a swipeable carousel draft with 4 or 5 slides.

Brand profile:
${brandProfileText}

Selected website item:
${websiteItemText}

Platform: ${rule.platform || "Instagram/Facebook"}
${getLanguageInstruction(rule.language)}
Tone: ${rule.tone || "Professional"}
CTA type: ${rule.cta_type || "Soft CTA"}
Destination URL: ${destinationUrl || "Not provided"}

Automation instruction:
${rule.prompt || "Create a useful product/service carousel."}

Caption already created for the post:
${postContent || "Not provided"}

Rules:
- Write the slide text in the selected post language.
- Use only facts from the brand profile, selected website item and automation instruction.
- Do not invent prices, discounts, guarantees, stock status, reviews, delivery promises or features.
- Slide 1 should be a strong hook.
- One middle slide should introduce the selected item clearly.
- One middle slide should explain a benefit or useful angle.
- Final slide should have a clear CTA.
- Keep each slide short enough to fit on a social media carousel.
- If a Destination URL exists, include it only on the final slide CTA/body if it fits naturally.

Return JSON exactly in this shape:
{
  "slides": [
    { "slide_type": "hook", "headline": "...", "body": "...", "cta_text": "" },
    { "slide_type": "product", "headline": "...", "body": "...", "cta_text": "" },
    { "slide_type": "benefit", "headline": "...", "body": "...", "cta_text": "" },
    { "slide_type": "cta", "headline": "...", "body": "...", "cta_text": "..." }
  ]
}
          `.trim(),
        },
      ],
      temperature: 0.65,
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw);

    return normalizeCarouselSlides(parsed, rule, postContent);
  } catch (error) {
    console.error("Carousel slide generation failed, using fallback slides", {
      ruleId: rule.id,
      message: error.message,
    });

    return buildFallbackCarouselSlides(rule, postContent);
  }
}

function buildFallbackProductCarouselSlides(rule, products, postContent = "") {
  const selectedProducts = products.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  const productSlides = selectedProducts.map((product, index) => ({
    slide_type: index === 0 ? "product_hook" : "product",
    headline: normalizeSlideText(product.title || `Product ${index + 1}`, 90),
    body: normalizeSlideText(
      product.description ||
        (index === 0
          ? "Swipe through a few selected products from the website."
          : "A selected product from the website."),
      190
    ),
    cta_text: "",
    product_url: product.url || null,
    image_url: product.image_url || null,
  }));

  productSlides.push({
    slide_type: "product_outro",
    headline: normalizeSlideText(rule?.brand_profile?.business_name || "See more in the collection", 90),
    body: normalizeSlideText(
      postContent || "Explore more products from the collection on the website.",
      180
    ),
    cta_text: normalizeSlideText(rule?.cta_type || "", 70),
    overlay_text: normalizeSlideText(rule?.brand_profile?.business_name || "See more", 80),
    product_url: getPostDestinationUrl(rule) || null,
    image_url: null,
  });

  return productSlides;
}

function buildCarouselOutroImagePrompt(rule, outroSlide, products) {
  const brandName = rule?.brand_profile?.business_name || "the brand";
  const language = rule?.language || rule?.brand_profile?.content_language || "English";
  const productNames = (products || []).slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET).map((item) => item?.title).filter(Boolean).join(", ");
  const headline = normalizeSlideText(outroSlide?.headline || brandName, 80);
  const supportingText = normalizeSlideText(outroSlide?.cta_text || outroSlide?.body || rule?.cta_type || "", 90);

  return `Create a premium square closing slide for a social media carousel. This is the final CTA slide after product slides for ${brandName}. Use a clean, polished marketing design with a subtle modern background and clear readable text overlay. Write the overlaid text in ${language}. Main overlay text: "${headline}". Supporting overlay text: "${supportingText}". The slide should feel like a professional final call-to-action and may use abstract shapes, elegant composition, soft shadows, geometric shapes, or a tasteful category-inspired scene. If you include any product-like objects, they must be generic, unbranded, non-specific, and not directly identifiable as exact products from the store. Never invent or depict specific catalog items, exact product prints, poster motifs, readable slogan text on products, apparel graphics, packaging artwork, or branded product designs. Do not place the store name or brand logo onto any depicted product. Avoid close-up hero shots of a single product. For stores that sell printed or text-based products such as posters, apparel, mugs, or accessories, do not generate new readable product text or new product artwork. Keep all non-overlay product details subtle, generic, and secondary to the CTA message. Do not show prices, discount claims, or crowded text. Products featured earlier in the carousel: ${productNames || "selected website products"}.`;
}

async function generateCarouselOutroSlideImage(openai, rule, outroSlide, products) {
  const imagePrompt = buildCarouselOutroImagePrompt(rule, outroSlide, products);
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: imagePrompt,
    size: "1024x1024",
  });

  const imageBase64 = response?.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI image generation returned empty outro image data");
  }

  return {
    imageBase64,
    imagePrompt,
  };
}

async function generateProductCarouselSlides(openai, rule, postContent, products) {
  const selectedProducts = products.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const productsText = formatWebsiteItemsForPrompt(selectedProducts);

  try {
    const completion = await openai.chat.completions.create({
      model: POST_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Spreelo, an expert social media product carousel strategist. Return only valid JSON. Do not explain your work.",
        },
        {
          role: "user",
          content: `
Create short slide copy for a product carousel.

Brand profile:
${brandProfileText}

Selected products for the carousel:
${productsText}

Platform: ${rule.platform || "Instagram/Facebook"}
${getLanguageInstruction(rule.language)}
Tone: ${rule.tone || "Professional"}
CTA type: ${rule.cta_type || "Soft CTA"}

Caption already created for the post:
${postContent || "Not provided"}

Rules:
- Create exactly ${selectedProducts.length} product slides in the same order as the selected products.
- Then create 1 final outro slide that acts as a closing CTA for the whole carousel.
- Every product slide must focus on its matching product only.
- Write in the selected post language.
- Keep text short enough for a social media carousel.
- Use only facts from the product list and brand profile.
- Do not invent prices, discounts, stock status, reviews, delivery promises, guarantees or features.
- If a verified price is provided for a product, you may mention it exactly as written. If not, do not mention price.
- The first product slide can feel like a hook, but it must still feature Product 1.
- The final outro slide should invite the reader to explore more or visit the website.
- The final outro slide should include short overlay_text suitable for a text overlay on an AI-generated closing image.

Return JSON exactly in this shape:
{
  "slides": [
    { "headline": "...", "body": "...", "cta_text": "" }
  ],
  "outro": { "headline": "...", "body": "...", "cta_text": "...", "overlay_text": "..." }
}
          `.trim(),
        },
      ],
      temperature: 0.55,
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw);
    const sourceSlides = Array.isArray(parsed?.slides) ? parsed.slides : [];
    const sourceOutro = parsed?.outro || {};

    const slides = selectedProducts.map((product, index) => {
      const slide = sourceSlides[index] || {};
      return {
        slide_type: index === 0 ? "product_hook" : "product",
        headline: normalizeSlideText(slide.headline || slide.title || product.title || `Product ${index + 1}`, 90),
        body: normalizeSlideText(slide.body || slide.text || product.description || "", 210),
        cta_text: normalizeSlideText(slide.cta_text || slide.cta || "", 80),
        product_url: product.url || null,
        image_url: product.image_url || null,
      };
    });

    const outroSlide = {
      slide_type: "product_outro",
      headline: normalizeSlideText(
        sourceOutro.headline || sourceOutro.title || rule?.brand_profile?.business_name || "See more from the collection",
        90
      ),
      body: normalizeSlideText(
        sourceOutro.body || sourceOutro.text || "Explore more products from the collection on the website.",
        210
      ),
      cta_text: normalizeSlideText(sourceOutro.cta_text || sourceOutro.cta || rule?.cta_type || "", 80),
      overlay_text: normalizeSlideText(
        sourceOutro.overlay_text || sourceOutro.overlay || sourceOutro.headline || rule?.brand_profile?.business_name || "See more",
        90
      ),
      product_url: getPostDestinationUrl(rule) || null,
      image_url: null,
    };

    const combinedSlides = slides.every((slide) => slide.headline || slide.body)
      ? [...slides, outroSlide]
      : buildFallbackProductCarouselSlides(rule, selectedProducts, postContent);

    return combinedSlides;
  } catch (error) {
    console.error("Product carousel slide copy generation failed, using fallback slides", {
      ruleId: rule.id,
      message: error.message,
    });

    return buildFallbackProductCarouselSlides(rule, selectedProducts, postContent);
  }
}

async function saveCarouselSlidesForPost({
  supabase,
  openai,
  postId,
  rule,
  postContent,
  imageUrl,
  imageStoragePath,
}) {
  if (!isCarouselRule(rule) || !postId) {
    return [];
  }

  const slides = await generateCarouselSlides(openai, rule, postContent);
  const selectedItem = rule?.website_item || null;
  const carouselProducts = getCarouselProducts(rule).filter(isValidCarouselProduct).slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  const productCount = carouselProducts.length;
  const includeLogo = shouldUseLogoForRule(rule, rule.brand_profile);
  const destinationUrl = getPostDestinationUrl(rule);

  const rows = [];

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index] || {};
    const isOutroSlide = String(slide.slide_type || '').toLowerCase() === 'product_outro';
    const sourceSlideImageUrl = slide.image_url || (!isOutroSlide && index === 0 ? imageUrl : null) || (!isOutroSlide ? selectedItem?.image_url : null) || null;
    let slideImageUrl = sourceSlideImageUrl;
    let slideStoragePath = !isOutroSlide && index === 0 ? imageStoragePath || null : null;
    let generatedImagePrompt = null;
    let slideRenderedBy = 'source_image';

    if (!isOutroSlide && sourceSlideImageUrl) {
      try {
        const { imageBase64 } = await renderCarouselProductSlideImage({
          slide,
          brandName: rule?.brand_profile?.business_name || 'Spreelo',
          sourceImageUrl: sourceSlideImageUrl,
          language: rule?.language || rule?.brand_profile?.content_language || 'English',
        });

        const uploadedImage = await uploadGeneratedImageToStorage({
          supabase,
          imageBase64,
          userId: rule.user_id,
          postId,
          fileSuffix: `carousel-slide-${index + 1}-rendered`,
        });

        slideImageUrl = uploadedImage.imageUrl;
        slideStoragePath = uploadedImage.imageStoragePath;
        slideRenderedBy = 'step95j_product_carousel_render';

        const logoOverlayResult = await applyLogoOverlayIfNeeded({
          supabase,
          userId: rule.user_id,
          postId: `${postId}-carousel-slide-${index + 1}`,
          imageUrl: slideImageUrl,
          imageStoragePath: slideStoragePath,
          brandProfile: rule.brand_profile,
          includeLogo: includeLogo,
        });

        if (logoOverlayResult?.imageUrl) {
          slideImageUrl = logoOverlayResult.imageUrl;
          slideStoragePath = logoOverlayResult.imageStoragePath || slideStoragePath;
        }
      } catch (error) {
        console.error('Carousel product slide render failed', {
          ruleId: rule?.id,
          postId,
          slideOrder: index + 1,
          message: error.message,
        });
      }
    }

    if (isOutroSlide && !slideImageUrl) {
      try {
        const { imageBase64, imagePrompt } = await generateCarouselOutroSlideImage(
          openai,
          rule,
          slide,
          carouselProducts
        );

        const uploadedImage = await uploadGeneratedImageToStorage({
          supabase,
          imageBase64,
          userId: rule.user_id,
          postId,
          fileSuffix: `carousel-slide-${index + 1}`,
        });

        slideImageUrl = uploadedImage.imageUrl;
        slideStoragePath = uploadedImage.imageStoragePath;
        generatedImagePrompt = imagePrompt;
        slideRenderedBy = 'step95g_product_carousel_outro';

        const logoOverlayResult = await applyLogoOverlayIfNeeded({
          supabase,
          userId: rule.user_id,
          postId: `${postId}-carousel-slide-${index + 1}`,
          imageUrl: slideImageUrl,
          imageStoragePath: slideStoragePath,
          brandProfile: rule.brand_profile,
          includeLogo: includeLogo,
        });

        if (logoOverlayResult?.imageUrl) {
          slideImageUrl = logoOverlayResult.imageUrl;
          slideStoragePath = logoOverlayResult.imageStoragePath || slideStoragePath;
        }
      } catch (error) {
        console.error('Carousel outro slide image generation failed', {
          ruleId: rule?.id,
          postId,
          message: error.message,
        });
      }
    }

    const slideProductUrl = slide.product_url || (!isOutroSlide && index === 0 ? selectedItem?.url : null) || (isOutroSlide ? destinationUrl : null) || null;

    rows.push({
      user_id: rule.user_id,
      post_id: postId,
      slide_order: index + 1,
      slide_type: 'content',
      headline: slide.headline || null,
      body: slide.body || null,
      cta_text: slide.cta_text || null,
      image_url: slideImageUrl,
      product_url: slideProductUrl,
      logo_enabled: includeLogo,
      metadata: {
        generated_by: productCount >= CAROUSEL_MIN_PRODUCT_SLIDES
          ? slideRenderedBy
          : 'step94_carousel_draft',
        carousel_slide_role: slide.slide_type || (index === 0 ? 'product_hook' : index === slides.length - 1 ? 'product_cta' : 'product'),
        source_content_type_id: rule.content_type_id || null,
        product_count: productCount || null,
        image_storage_path: slideStoragePath || null,
        image_prompt: generatedImagePrompt || null,
        overlay_text: slide.overlay_text || null,
        source_image_url: sourceSlideImageUrl || null,
        rendered_slide: slideRenderedBy !== 'source_image',
      },
    });
  }

  if (productCount >= CAROUSEL_MIN_PRODUCT_SLIDES && rows.length < CAROUSEL_MIN_PRODUCT_SLIDES + CAROUSEL_OUTRO_SLIDE_COUNT) {
    throw new Error(`Carousel product slides were not created correctly. Expected at least ${CAROUSEL_MIN_PRODUCT_SLIDES + CAROUSEL_OUTRO_SLIDE_COUNT}, got ${rows.length}.`);
  }

  await supabase.from('post_slides').delete().eq('post_id', postId);

  const insertAttempts = [
    rows,
    rows.map(({ metadata, ...rest }) => rest),
    rows.map(({ metadata, logo_enabled, ...rest }) => rest),
  ];

  let insertError = null;
  let inserted = false;

  for (const payload of insertAttempts) {
    const { error } = await supabase.from('post_slides').insert(payload);
    if (!error) {
      inserted = true;
      insertError = null;
      break;
    }
    insertError = error;
  }

  if (!inserted) {
    throw new Error(insertError?.message || 'Could not save carousel slides');
  }

  const readyImageCount = rows.filter((row) => row.image_url).length;
  const slideCount = rows.length;
  const slideGenerationStatus = slideCount > 0 ? 'ready' : 'failed';
  const slideRenderStatus = readyImageCount === slideCount && slideCount > 0 ? 'ready' : readyImageCount > 0 ? 'partial' : 'none';

  const postUpdatePayload = {
    slide_count: slideCount,
    slide_generation_status: slideGenerationStatus,
    slide_render_status: slideRenderStatus,
    updated_at: new Date().toISOString(),
  };

  const { error: postUpdateError } = await supabase
    .from('posts')
    .update(postUpdatePayload)
    .eq('id', postId);

  if (postUpdateError) {
    throw new Error(postUpdateError.message || 'Could not update carousel slide summary');
  }

  return rows;
}

async function generateAutomationImage(openai, rule, postContent) {
  const prompt = buildImagePrompt(rule, postContent);

const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1024",
  });

  const imageBase64 = response?.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI image generation returned empty image data");
  }

  return {
    imageBase64,
    imagePrompt: prompt,
  };
}

async function uploadGeneratedImageToStorage({
  supabase,
  imageBase64,
  userId,
  postId,
  fileSuffix = "",
}) {
  const safeSuffix = String(fileSuffix || "").trim();
  const filePath = `${userId}/${postId}${safeSuffix ? `-${safeSuffix}` : ""}.png`;
  const fileBuffer = Buffer.from(imageBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from("post-images")
    .upload(filePath, fileBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Could not upload image");
  }

  const { data: publicUrlData } = supabase.storage
    .from("post-images")
    .getPublicUrl(filePath);

  return {
    imageUrl: publicUrlData?.publicUrl || null,
    imageStoragePath: filePath,
  };
}

function shouldUseLogoForRule(rule, brandProfile) {
  if (!brandProfile?.logo_url) {
    return false;
  }

  if (typeof rule?.include_logo === "boolean") {
    return rule.include_logo;
  }

  return brandProfile.logo_enabled_by_default !== false;
}

async function fetchImageBufferForOverlay(imageUrl) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    throw new Error("Logo overlay skipped because image URL is missing or not public");
  }

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Spreelo/1.0 image overlay",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch image for logo overlay: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function applyLogoOverlayIfNeeded({
  supabase,
  userId,
  postId,
  imageUrl,
  imageStoragePath,
  brandProfile,
  includeLogo,
}) {
  if (!includeLogo || !brandProfile?.logo_url || !imageUrl) {
    return null;
  }

  try {
    const [baseImageBuffer, logoBuffer] = await Promise.all([
      fetchImageBufferForOverlay(imageUrl),
      fetchImageBufferForOverlay(brandProfile.logo_url),
    ]);

    const baseImage = sharp(baseImageBuffer).rotate();
    const baseMetadata = await baseImage.metadata();
    const baseWidth = Number(baseMetadata.width || 0);
    const baseHeight = Number(baseMetadata.height || 0);

    if (!baseWidth || !baseHeight) {
      throw new Error("Could not read base image dimensions for logo overlay");
    }

    const logoTargetWidth = Math.max(
      72,
      Math.min(Math.round(baseWidth * 0.16), 220)
    );
    const margin = Math.max(24, Math.round(baseWidth * 0.035));

    const logoPng = await sharp(logoBuffer)
      .rotate()
      .resize({ width: logoTargetWidth, withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMetadata = await sharp(logoPng).metadata();
    const logoWidth = Number(logoMetadata.width || logoTargetWidth);
    const logoHeight = Number(logoMetadata.height || Math.round(logoTargetWidth * 0.4));

    const left = Math.max(margin, baseWidth - logoWidth - margin);
    const top = Math.max(margin, baseHeight - logoHeight - margin);

    const outputBuffer = await baseImage
      .composite([
        {
          input: logoPng,
          left,
          top,
        },
      ])
      .png()
      .toBuffer();

    const filePath = `${userId}/${postId}-with-logo.png`;

    const { error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(filePath, outputBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Could not upload logo overlay image");
    }

    const { data: publicUrlData } = supabase.storage
      .from("post-images")
      .getPublicUrl(filePath);

    console.log("Brand logo overlay applied", {
      postId,
      brandProfileId: brandProfile.id || null,
      sourceImageStoragePath: imageStoragePath || null,
      overlayStoragePath: filePath,
    });

    return {
      imageUrl: publicUrlData?.publicUrl || null,
      imageStoragePath: filePath,
    };
  } catch (error) {
    console.error("Brand logo overlay failed", {
      postId,
      brandProfileId: brandProfile?.id || null,
      message: error.message,
    });

    return null;
  }
}

async function getUserAuthProfile(supabase, userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user?.email) {
    return null;
  }

  const metadata = data.user.user_metadata || {};

  return {
    email: data.user.email,
    appLanguage:
      metadata.app_language ||
      metadata.appLanguage ||
      metadata.ui_language ||
      metadata.locale ||
      null,
  };
}

async function sendApprovalEmail({
  supabase,
  resendApiKey,
  to,
  rule,
  postContent,
  approvalToken,
  imageUrl,
  userAppLanguage,
  postId,
  contentFormat,
}) {
  const detectedPostLocale = detectLikelyUiLocaleFromText(postContent);
  const userLocale = resolveUiLocaleFromLanguageName(userAppLanguage);
  const ruleLocale = resolveBestServerLocale({
    languageCandidates: [
      rule?.app_language,
      rule?.ui_language,
      rule?.language,
      rule?.brand_profile?.content_language,
    ],
  });

  // Prefer the user's explicitly saved app language when it exists.
  // If that is missing/English but the post is clearly in another supported script/language,
  // use the post language so approval emails do not remain in English for non-English brands.
  const locale =
    userLocale && userLocale !== "en"
      ? userLocale
      : detectedPostLocale || userLocale || (ruleLocale !== "en" ? ruleLocale : "en");
  const { t } = await getServerTranslations({
    supabaseAdmin: supabase,
    locale,
    namespaces: ["emails"],
  });
  const normalizedContentFormat = normalizeContentFormat(contentFormat || rule?.content_format);
  const isCarouselDraft = normalizedContentFormat === "carousel";
  const approveUrl = `${APP_URL}/api/approve-post?token=${approvalToken}&lang=${locale}`;

  let carouselSlides = [];
  if (isCarouselDraft && postId) {
    try {
      const { data } = await supabase
        .from('post_slides')
        .select('slide_order, headline, image_url')
        .eq('post_id', postId)
        .order('slide_order', { ascending: true });
      carouselSlides = data || [];
    } catch (error) {
      console.error('Could not load carousel slides for approval email', {
        postId,
        message: error.message,
      });
    }
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject: isCarouselDraft ? t("emails.approval.carouselSubject") : t("emails.approval.subject"),
      html: buildApprovalEmailHtml({
        locale,
        t,
        rule,
        postContent,
        approveUrl,
        imageUrl,
        carouselSlides,
        isCarouselDraft,
      }),
      text: buildApprovalEmailText({
        t,
        rule,
        postContent,
        approveUrl,
        imageUrl,
        carouselSlides,
        isCarouselDraft,
      }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Resend email request failed");
  }

  return response.json();
}

async function publishTextPostToFacebook({ pageId, pageAccessToken, message }) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        access_token: pageAccessToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    const facebookMessage =
      result?.error?.message || "Facebook publishing failed";

    const facebookType = result?.error?.type || "unknown";
    const facebookCode = result?.error?.code || "unknown";
    const facebookSubcode = result?.error?.error_subcode || "none";
    const facebookTrace = result?.error?.fbtrace_id || "none";

    throw new Error(
      `${facebookMessage} | type: ${facebookType} | code: ${facebookCode} | subcode: ${facebookSubcode} | trace: ${facebookTrace}`
    );
  }

  return result;
}

async function publishImagePostToFacebook({
  pageId,
  pageAccessToken,
  imageUrl,
  caption,
}) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/photos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: imageUrl,
        caption,
        access_token: pageAccessToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    const facebookMessage =
      result?.error?.message || "Facebook image publishing failed";

    const facebookType = result?.error?.type || "unknown";
    const facebookCode = result?.error?.code || "unknown";
    const facebookSubcode = result?.error?.error_subcode || "none";
    const facebookTrace = result?.error?.fbtrace_id || "none";

    throw new Error(
      `${facebookMessage} | type: ${facebookType} | code: ${facebookCode} | subcode: ${facebookSubcode} | trace: ${facebookTrace}`
    );
  }

  return result;
}

function getPublishTargets(platformValue) {
  const normalized = String(platformValue || "")
    .toLowerCase()
    .replaceAll("&", "+")
    .replaceAll(",", "+");

  const targets = [];

  if (normalized.includes("facebook")) {
    targets.push("facebook");
  }

  if (normalized.includes("instagram")) {
    targets.push("instagram");
  }

  return targets;
}

function extractUrlsFromText(value) {
  return String(value || "").match(/https?:\/\/\S+/gi) || [];
}

function cleanUrlForCaption(value) {
  const cleaned = String(value || "").replace(/[).,!?:;]+$/g, "");
  return canonicalizeWebsiteProductUrl(cleaned, cleaned) || cleaned;
}

function cleanPostContentUrls(content) {
  return String(content || "").replace(/https?:\/\/\S+/gi, (match) => cleanUrlForCaption(match));
}

function normalizeHashtagLine(value) {
  const hashtags = String(value || "").match(/#[\p{L}\p{N}_]+/gu) || [];
  const unique = [];

  for (const hashtag of hashtags) {
    const normalized = hashtag.toLowerCase();

    if (!unique.some((item) => item.toLowerCase() === normalized)) {
      unique.push(hashtag);
    }

    if (unique.length >= 8) {
      break;
    }
  }

  return unique.join(" ");
}

function buildInstagramCaptionFromPostContent(content) {
  return truncateText(String(content || "").trim(), 2200);
}


function buildPlatformApprovalPreviews({ platform, postContent }) {
  return [
    {
      label: platform || "Social media",
      content: postContent,
    },
  ];
}


function getMetaErrorMessage(result, fallbackMessage) {
  const metaMessage = result?.error?.message || fallbackMessage;
  const metaType = result?.error?.type || "unknown";
  const metaCode = result?.error?.code || "unknown";
  const metaSubcode = result?.error?.error_subcode || "none";
  const metaTrace = result?.error?.fbtrace_id || "none";

  return `${metaMessage} | type: ${metaType} | code: ${metaCode} | subcode: ${metaSubcode} | trace: ${metaTrace}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForInstagramContainerReady({
  creationId,
  accessToken,
  instagramUserId,
}) {
  const maxAttempts = 6;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      await sleep(delayMs);
    }

    const statusUrl = new URL(
      `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${creationId}`
    );
    statusUrl.searchParams.set("fields", "status_code,status");
    statusUrl.searchParams.set("access_token", accessToken);

    const statusResponse = await fetch(statusUrl.toString(), {
      method: "GET",
    });

    const statusResult = await statusResponse.json();
    const statusCode = statusResult?.status_code || null;

    console.log("Instagram publish: media container status", {
      instagramUserId,
      creationId,
      attempt,
      ok: statusResponse.ok,
      statusCode,
      status: statusResult?.status || null,
      error: statusResult?.error?.message || null,
    });

    if (!statusResponse.ok) {
      throw new Error(
        getMetaErrorMessage(
          statusResult,
          "Instagram media container status check failed"
        )
      );
    }

    if (statusCode === "FINISHED") {
      return statusResult;
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(
        `Instagram media container is not publishable | status_code: ${statusCode}`
      );
    }
  }

  throw new Error(
    "Instagram media container was not ready for publishing in time. Try again shortly."
  );
}

async function publishImagePostToInstagram({
  instagramUserId,
  accessToken,
  imageUrl,
  caption,
}) {
  console.log("Instagram publish: creating media container", {
    instagramUserId,
    hasImageUrl: Boolean(imageUrl),
  });

  const createResponse = await fetch(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${instagramUserId}/media`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );

  const createResult = await createResponse.json();

  console.log("Instagram publish: media container response", {
    instagramUserId,
    ok: createResponse.ok,
    creationId: createResult?.id || null,
    error: createResult?.error?.message || null,
  });

  if (!createResponse.ok || !createResult?.id) {
    throw new Error(
      getMetaErrorMessage(createResult, "Instagram media container creation failed")
    );
  }

  await waitForInstagramContainerReady({
    creationId: createResult.id,
    accessToken,
    instagramUserId,
  });

  const publishResponse = await fetch(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${instagramUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        creation_id: createResult.id,
        access_token: accessToken,
      }),
    }
  );

  const publishResult = await publishResponse.json();

  console.log("Instagram publish: publish response", {
    instagramUserId,
    ok: publishResponse.ok,
    publishedId: publishResult?.id || null,
    error: publishResult?.error?.message || null,
  });

  if (!publishResponse.ok || !publishResult?.id) {
    throw new Error(
      getMetaErrorMessage(publishResult, "Instagram media publish failed")
    );
  }

  return publishResult;
}


async function publishCarouselPostToFacebook({
  pageId,
  pageAccessToken,
  slideImageUrls,
  caption,
}) {
  const uploadedMediaIds = [];

  for (const imageUrl of slideImageUrls) {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/photos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: imageUrl,
          published: false,
          access_token: pageAccessToken,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result?.id) {
      throw new Error(
        getMetaErrorMessage(result, "Facebook carousel image upload failed")
      );
    }

    uploadedMediaIds.push(result.id);
  }

  if (uploadedMediaIds.length < 2) {
    throw new Error("Facebook carousel publishing requires at least 2 slide images.");
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: caption,
        attached_media: uploadedMediaIds.map((mediaId) => ({ media_fbid: mediaId })),
        access_token: pageAccessToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result?.id) {
    throw new Error(
      getMetaErrorMessage(result, "Facebook carousel publish failed")
    );
  }

  return result;
}

async function createInstagramCarouselChild({
  instagramUserId,
  accessToken,
  imageUrl,
}) {
  const response = await fetch(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${instagramUserId}/media`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: accessToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result?.id) {
    throw new Error(
      getMetaErrorMessage(result, "Instagram carousel child creation failed")
    );
  }

  await waitForInstagramContainerReady({
    creationId: result.id,
    accessToken,
    instagramUserId,
  });

  return result.id;
}

async function publishCarouselPostToInstagram({
  instagramUserId,
  accessToken,
  slideImageUrls,
  caption,
}) {
  const childIds = [];

  for (const imageUrl of slideImageUrls) {
    const childId = await createInstagramCarouselChild({
      instagramUserId,
      accessToken,
      imageUrl,
    });
    childIds.push(childId);
  }

  if (childIds.length < 2) {
    throw new Error("Instagram carousel publishing requires at least 2 slide images.");
  }

  const createResponse = await fetch(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${instagramUserId}/media`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        media_type: "CAROUSEL",
        children: childIds,
        caption,
        access_token: accessToken,
      }),
    }
  );

  const createResult = await createResponse.json();

  if (!createResponse.ok || !createResult?.id) {
    throw new Error(
      getMetaErrorMessage(createResult, "Instagram carousel container creation failed")
    );
  }

  await waitForInstagramContainerReady({
    creationId: createResult.id,
    accessToken,
    instagramUserId,
  });

  const publishResponse = await fetch(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${instagramUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        creation_id: createResult.id,
        access_token: accessToken,
      }),
    }
  );

  const publishResult = await publishResponse.json();

  if (!publishResponse.ok || !publishResult?.id) {
    throw new Error(
      getMetaErrorMessage(publishResult, "Instagram carousel publish failed")
    );
  }

  return publishResult;
}

async function loadCarouselSlidesForPublish({ supabase, postId }) {
  const { data, error } = await supabase
    .from("post_slides")
    .select("id, slide_order, image_url, headline, body, cta_text, metadata")
    .eq("post_id", postId)
    .order("slide_order", { ascending: true });

  if (error) {
    throw new Error(error.message || "Could not load carousel slides");
  }

  return (data || []).filter((slide) => slide?.image_url);
}

async function getFacebookConnectionForBrand({
  supabase,
  userId,
  brandProfileId,
}) {
  if (!userId || !brandProfileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("social_connections")
    .select("id, page_id, page_name, page_access_token, status")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "facebook")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not load Facebook connection for brand", {
      userId,
      brandProfileId,
      message: error.message,
    });

    return null;
  }

  return data || null;
}


async function getInstagramConnectionForBrand({
  supabase,
  userId,
  brandProfileId,
}) {
  if (!userId || !brandProfileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("social_connections")
    .select("id, page_id, page_name, page_access_token, status, token_expires_at")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "instagram")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not load Instagram connection for brand", {
      userId,
      brandProfileId,
      message: error.message,
    });

    return null;
  }

  return data || null;
}
async function publishApprovedSocialPosts({
  supabase,
  nowIso,
  summary,
  resendApiKey,
}) {
  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id, user_id, brand_profile_id, content, platform, status, published_at, approved_at, image_url, content_format"
    )
    .eq("status", "approved")
    .is("published_at", null)
    .order("approved_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Could not load approved social posts", {
      message: error.message,
    });

    summary.social_publish_failed += 1;
    return;
  }

  const approvedPosts = (posts || []).filter((post) => {
    const format = normalizeContentFormat(post.content_format);
    return ["single_image", "carousel"].includes(format) && getPublishTargets(post.platform).length > 0;
  });

  summary.social_publish_checked += approvedPosts.length;

  for (const post of approvedPosts) {
    const targets = getPublishTargets(post.platform);
    const normalizedFormat = normalizeContentFormat(post.content_format);
    let facebookConnectionForPost = null;
    let instagramConnectionForPost = null;
    let activePublishTarget = null;

    try {
      if (!post.content) {
        summary.social_publish_failed += 1;
        continue;
      }

      if (!post.brand_profile_id) {
        console.error("Approved social post is missing brand_profile_id", {
          postId: post.id,
          userId: post.user_id,
        });

        await supabase
          .from("posts")
          .update({
            status: "failed",
            updated_at: nowIso,
          })
          .eq("id", post.id);

        summary.social_publish_failed += 1;
        continue;
      }

      if (targets.includes("instagram") && normalizedFormat === "single_image" && !post.image_url) {
        console.error("Instagram publish skipped because post has no image URL", {
          postId: post.id,
          userId: post.user_id,
          brandProfileId: post.brand_profile_id,
          platform: post.platform,
        });

        await supabase
          .from("posts")
          .update({
            status: "failed",
            updated_at: nowIso,
          })
          .eq("id", post.id);

        summary.instagram_publish_skipped_no_image += 1;
        summary.social_publish_failed += 1;
        continue;
      }

      if (targets.includes("facebook")) {
        activePublishTarget = "facebook";
        summary.facebook_publish_checked += 1;

        facebookConnectionForPost = await getFacebookConnectionForBrand({
          supabase,
          userId: post.user_id,
          brandProfileId: post.brand_profile_id,
        });

        const facebookConnection = facebookConnectionForPost;

        console.log("Facebook publish: connection lookup", {
          postId: post.id,
          found: Boolean(facebookConnection),
          pageId: facebookConnection?.page_id || null,
        });

        if (
          !facebookConnection?.page_id ||
          !facebookConnection?.page_access_token
        ) {
          console.error("No connected Facebook page found for post brand", {
            postId: post.id,
            userId: post.user_id,
            brandProfileId: post.brand_profile_id,
          });

          summary.facebook_publish_skipped_no_config += 1;
          throw new Error("No connected Facebook page found for this brand");
        }

        if (normalizedFormat === "carousel") {
          const carouselSlides = await loadCarouselSlidesForPublish({
            supabase,
            postId: post.id,
          });

          const slideImageUrls = carouselSlides
            .map((slide) => slide.image_url)
            .filter(Boolean);

          if (slideImageUrls.length < 2) {
            throw new Error("Carousel post is missing render-ready slide images for Facebook publishing.");
          }

          await publishCarouselPostToFacebook({
            pageId: facebookConnection.page_id,
            pageAccessToken: facebookConnection.page_access_token,
            slideImageUrls,
            caption: post.content,
          });
        } else if (post.image_url) {
          await publishImagePostToFacebook({
            pageId: facebookConnection.page_id,
            pageAccessToken: facebookConnection.page_access_token,
            imageUrl: post.image_url,
            caption: post.content,
          });
        } else {
          await publishTextPostToFacebook({
            pageId: facebookConnection.page_id,
            pageAccessToken: facebookConnection.page_access_token,
            message: post.content,
          });
        }

        summary.facebook_published += 1;
        activePublishTarget = null;
      }

      if (targets.includes("instagram")) {
        activePublishTarget = "instagram";
        summary.instagram_publish_checked += 1;

        instagramConnectionForPost = await getInstagramConnectionForBrand({
          supabase,
          userId: post.user_id,
          brandProfileId: post.brand_profile_id,
        });

        const instagramConnection = instagramConnectionForPost;

        console.log("Instagram publish: connection lookup", {
          postId: post.id,
          found: Boolean(instagramConnection),
          instagramUserId: instagramConnection?.page_id || null,
          tokenExpiresAt: instagramConnection?.token_expires_at || null,
          hasImageUrl: Boolean(post.image_url),
          imageUrl: post.image_url || null,
        });

        if (
          !instagramConnection?.page_id ||
          !instagramConnection?.page_access_token
        ) {
          console.error("No connected Instagram account found for post brand", {
            postId: post.id,
            userId: post.user_id,
            brandProfileId: post.brand_profile_id,
          });

          summary.instagram_publish_skipped_no_config += 1;
          throw new Error("No connected Instagram account found for this brand");
        }

        if (normalizedFormat === "carousel") {
          const carouselSlides = await loadCarouselSlidesForPublish({
            supabase,
            postId: post.id,
          });

          const slideImageUrls = carouselSlides
            .map((slide) => slide.image_url)
            .filter(Boolean);

          if (slideImageUrls.length < 2) {
            throw new Error("Carousel post is missing render-ready slide images for Instagram publishing.");
          }

          await publishCarouselPostToInstagram({
            instagramUserId: instagramConnection.page_id,
            accessToken: instagramConnection.page_access_token,
            slideImageUrls,
            caption: buildInstagramCaptionFromPostContent(post.content),
          });
        } else {
          await publishImagePostToInstagram({
            instagramUserId: instagramConnection.page_id,
            accessToken: instagramConnection.page_access_token,
            imageUrl: post.image_url,
            caption: buildInstagramCaptionFromPostContent(post.content),
          });
        }

        summary.instagram_published += 1;
        activePublishTarget = null;
      }

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", post.id);

      if (updateError) {
        summary.social_publish_failed += 1;
        continue;
      }

      summary.social_published += 1;
    } catch (error) {
      console.error("Social publish failed", {
        postId: post.id,
        userId: post.user_id,
        brandProfileId: post.brand_profile_id,
        platform: post.platform,
        targets,
        message: error.message,
      });

      if (isConnectionAuthFailure(error)) {
        if (activePublishTarget === "facebook" && facebookConnectionForPost?.id) {
          await markConnectionExpiredAndAlert({
            supabase,
            connectionId: facebookConnectionForPost.id,
            platform: "facebook",
            reason: error.message || "Facebook publishing failed because the connection is no longer valid.",
            resendApiKey,
            nowIso,
          });
        }

        if (activePublishTarget === "instagram" && instagramConnectionForPost?.id) {
          await markConnectionExpiredAndAlert({
            supabase,
            connectionId: instagramConnectionForPost.id,
            platform: "instagram",
            reason: error.message || "Instagram publishing failed because the connection is no longer valid.",
            resendApiKey,
            nowIso,
          });
        }
      }

      await supabase
        .from("posts")
        .update({
          status: "failed",
          updated_at: nowIso,
        })
        .eq("id", post.id);

      summary.social_publish_failed += 1;

      if (targets.includes("facebook")) {
        summary.facebook_publish_failed += 1;
      }

      if (targets.includes("instagram")) {
        summary.instagram_publish_failed += 1;
      }
    }
  }
}

async function getRulesToProcess({ supabase, nowIso, now }) {
  const { data: dueRules, error: dueRulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (dueRulesError) {
    throw new Error(dueRulesError.message);
  }

  const rules = dueRules || [];

  if (rules.length >= BATCH_SIZE) {
    return rules;
  }

  const remainingLimit = BATCH_SIZE - rules.length;

  const { data: fallbackRules, error: fallbackRulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .is("next_run_at", null)
    .limit(remainingLimit);

  if (fallbackRulesError) {
    throw new Error(fallbackRulesError.message);
  }

  const oldRulesThatAreDue = (fallbackRules || []).filter((rule) =>
    isRuleDueByOldSchedule(rule, now)
  );

  const uniqueRules = new Map();

  for (const rule of [...rules, ...oldRulesThatAreDue]) {
    uniqueRules.set(rule.id, rule);
  }

  return Array.from(uniqueRules.values()).slice(0, BATCH_SIZE);
}

function isAuthorizedCronRequest(request, cronSecret) {
  const authorizationHeader = request.headers.get("authorization");
  const expectedAuthorizationHeader = `Bearer ${cronSecret}`;

  return authorizationHeader === expectedAuthorizationHeader;
}

export async function GET(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const resendApiKey = process.env.RESEND_API_KEY;


    if (!supabaseUrl || !serviceRoleKey || !openaiApiKey || !cronSecret) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY or CRON_SECRET.",
        },
        { status: 500 }
      );
    }

    if (!isAuthorizedCronRequest(request, cronSecret)) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    const now = new Date();
    const nowIso = now.toISOString();

    const summary = createEmptySummary();
    const usedWebsiteImageUrlsThisRun = new Set();

   await publishApprovedSocialPosts({
  supabase,
  nowIso,
  summary,
  resendApiKey,
});

    const rules = await getRulesToProcess({
      supabase,
      nowIso,
      now,
    });

    for (const rule of rules || []) {
      summary.processed += 1;

      try {
        if (hasAlreadyRunToday(rule, now)) {
          summary.skipped += 1;
          continue;
        }


        const creditCost = Number(rule.credit_cost || 1);

        const { data: balance, error: balanceError } = await supabase
          .from("user_credit_balances")
          .select("credits_remaining, monthly_credit_limit, plan_name")
          .eq("user_id", rule.user_id)
          .single();

        if (balanceError || !balance) {
          const message = "No credit balance found";

          await setRuleError(supabase, rule.id, message);

          summary.skipped += 1;
          summary.no_credit_balance += 1;
          continue;
        }

        const creditsRemaining = Number(balance.credits_remaining || 0);

        if (creditsRemaining < creditCost) {
          const message = "Not enough credits";

          await setRuleError(supabase, rule.id, message);

          summary.skipped += 1;
          summary.not_enough_credits += 1;
          continue;
        }

const brandProfile = await getBrandProfileForRule(supabase, rule);

        if (brandProfile) {
          summary.brand_profile_found += 1;
        } else {
          summary.brand_profile_missing += 1;
        }

let websiteItem = null;
let websiteItems = [];
let websiteSourceUrl = null;
let websiteCycleNumber = null;
let useWebsiteImage = false;

        if (isCarouselRule(rule)) {
          try {
            const preparedCarouselProducts = await prepareCarouselProductsForRule({
              supabase,
              openai,
              rule,
              brandProfile,
              summary,
              usedWebsiteImageUrlsThisRun,
            });

            websiteItem = preparedCarouselProducts.websiteItem;
            websiteItems = preparedCarouselProducts.websiteItems || [];
            websiteSourceUrl = preparedCarouselProducts.websiteSourceUrl;
            websiteCycleNumber = preparedCarouselProducts.websiteCycleNumber;
            useWebsiteImage = Boolean(preparedCarouselProducts.useWebsiteImage);
          } catch (carouselError) {
            const message = carouselError.message ||
              `Website carousel needs at least ${CAROUSEL_MIN_PRODUCT_SLIDES} products with product images.`;

            await supabase
              .from("automation_rules")
              .update({
                is_active: false,
                next_run_at: null,
                last_error: message,
                updated_at: nowIso,
              })
              .eq("id", rule.id);

            summary.skipped += 1;
            summary.carousel_generation_paused += 1;
            continue;
          }
        } else if (rule.uses_website_content) {
          try {
           const preparedWebsiteContent = await prepareWebsiteContentForRule({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun,
});
            websiteItem = preparedWebsiteContent.websiteItem;
            websiteSourceUrl = preparedWebsiteContent.websiteSourceUrl;
            websiteCycleNumber = preparedWebsiteContent.websiteCycleNumber;
            useWebsiteImage = Boolean(preparedWebsiteContent.useWebsiteImage);
          } catch (websiteError) {
            summary.website_content_failed += 1;

            throw websiteError;
          }
        }

        const ruleWithBrandProfile = {
          ...rule,
          brand_profile: brandProfile,
          website_item: websiteItem,
          website_items: websiteItems,
        };

        const rawGeneratedContent = await generateAutomationPost(
          openai,
          ruleWithBrandProfile
        );

        const generatedContent = cleanPostContentUrls(
          sanitizeUnsupportedOfferLanguage(
            rawGeneratedContent,
            websiteItem
          )
        );

        if (!generatedContent) {
          const message = "OpenAI returned empty content";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

    const approvalRequired = true;
const approvalToken = crypto.randomBytes(32).toString("hex");
const postStatus = "pending_approval";
const wantsImage = Boolean(rule.generate_image);

const { data: post, error: postError } = await supabase
  .from("posts")
  .insert({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,

            content: generatedContent,
            platform: rule.platform || null,
            tone: rule.tone || null,
            language: rule.language || null,
            post_type: rule.post_type || null,
            website_url:
  websiteItem?.url ||
  websiteSourceUrl ||
  brandProfile?.website_product_source_url ||
  brandProfile?.website_url ||
  rule.website_url ||
  null,
            length: rule.length || null,
            include_emojis: Boolean(rule.include_emojis),
            include_hashtags: Boolean(rule.include_hashtags),
            cta_type: rule.cta_type || null,

            source: "automation",
            source_label: rule.uses_website_content
              ? "Generated from website"
              : "Generated by automation",
            automation_rule_id: rule.id,

        status: postStatus,
approval_required: true,
approval_token: approvalToken,
approved_at: null,
scheduled_for: nowIso,
            image_status: wantsImage ? "generating" : "none",
            image_prompt: wantsImage ? rule.image_prompt || null : null,
            content_format: normalizeContentFormat(rule.content_format),
    text_model_used: POST_TEXT_MODEL,
image_model_used: wantsImage ? IMAGE_MODEL : null,
include_logo: shouldUseLogoForRule(rule, brandProfile),
logo_url: shouldUseLogoForRule(rule, brandProfile) ? brandProfile?.logo_url || null : null,
product_research_model_used: rule.uses_website_content
  ? PRODUCT_RESEARCH_MODEL
  : null,
          })
          .select("id")
          .single();

        if (postError || !post) {
          const message = postError?.message || "Could not save post";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        let imageUrl = null;
        let imageStoragePath = null;
        let finalImagePrompt = wantsImage ? rule.image_prompt || null : null;

        const isWebsiteBasedPost = Boolean(rule.uses_website_content || websiteItem || websiteSourceUrl);

        if (wantsImage && websiteItem?.image_url && useWebsiteImage) {
          imageUrl = websiteItem.image_url;
          finalImagePrompt =
            "Website image selected because it appears connected to the selected website item.";

          const logoOverlayResult = await applyLogoOverlayIfNeeded({
            supabase,
            userId: rule.user_id,
            postId: post.id,
            imageUrl,
            imageStoragePath: null,
            brandProfile,
            includeLogo: shouldUseLogoForRule(rule, brandProfile),
          });

          if (logoOverlayResult?.imageUrl) {
            imageUrl = logoOverlayResult.imageUrl;
            imageStoragePath = logoOverlayResult.imageStoragePath || null;
          }

          const { error: websiteImageUpdateError } = await supabase
            .from("posts")
            .update({
              image_url: imageUrl,
              image_storage_path: imageStoragePath,
              image_status: "ready",
              image_prompt: finalImagePrompt,
              include_logo: shouldUseLogoForRule(rule, brandProfile),
              logo_url: shouldUseLogoForRule(rule, brandProfile) ? brandProfile?.logo_url || null : null,
              updated_at: nowIso,
            })
            .eq("id", post.id);

          if (websiteImageUpdateError) {
            throw new Error(
              websiteImageUpdateError.message ||
                "Could not update post with website image"
            );
          }

          usedWebsiteImageUrlsThisRun.add(
  normalizeComparableValue(websiteItem.image_url)
);
          summary.website_image_used += 1;
       } else if (wantsImage && isWebsiteBasedPost) {
  summary.website_image_missing_ai_fallback += 1;

  finalImagePrompt =
    "No verified website product image was found. AI image fallback is disabled for website product posts.";

  const { error: noWebsiteImageUpdateError } = await supabase
    .from("posts")
    .update({
      image_url: null,
      image_storage_path: null,
      image_status: "none",
      image_prompt: finalImagePrompt,
      updated_at: nowIso,
    })
    .eq("id", post.id);

  if (noWebsiteImageUpdateError) {
    throw new Error(
      noWebsiteImageUpdateError.message ||
        "Could not update post without website image"
    );
  }
} else if (wantsImage) {
  try {
    const { imageBase64, imagePrompt } = await generateAutomationImage(
      openai,
      ruleWithBrandProfile,
      generatedContent
    );

    const uploadedImage = await uploadGeneratedImageToStorage({
      supabase,
      imageBase64,
      userId: rule.user_id,
      postId: post.id,
    });

    imageUrl = uploadedImage.imageUrl;
    imageStoragePath = uploadedImage.imageStoragePath;
    finalImagePrompt = imagePrompt;

    const logoOverlayResult = await applyLogoOverlayIfNeeded({
      supabase,
      userId: rule.user_id,
      postId: post.id,
      imageUrl,
      imageStoragePath,
      brandProfile,
      includeLogo: shouldUseLogoForRule(rule, brandProfile),
    });

    if (logoOverlayResult?.imageUrl) {
      imageUrl = logoOverlayResult.imageUrl;
      imageStoragePath = logoOverlayResult.imageStoragePath || imageStoragePath;
    }

    const { error: imageUpdateError } = await supabase
      .from("posts")
      .update({
        image_url: imageUrl,
        image_storage_path: imageStoragePath,
        image_status: "ready",
        image_prompt: finalImagePrompt,
        include_logo: shouldUseLogoForRule(rule, brandProfile),
        logo_url: shouldUseLogoForRule(rule, brandProfile) ? brandProfile?.logo_url || null : null,
        updated_at: nowIso,
      })
      .eq("id", post.id);

    if (imageUpdateError) {
      throw new Error(
        imageUpdateError.message || "Could not update post with image"
      );
    }

    summary.image_generated += 1;
  } catch (imageError) {
    console.error("Image generation failed", {
      ruleId: rule.id,
      postId: post.id,
      message: imageError.message,
    });

    await supabase
      .from("posts")
      .update({
        image_status: "failed",
        image_prompt: finalImagePrompt,
        updated_at: nowIso,
      })
      .eq("id", post.id);

    summary.image_generation_failed += 1;
    summary.warnings += 1;
  }
}

        if (isCarouselRule(rule)) {
          try {
            await saveCarouselSlidesForPost({
              supabase,
              openai,
              postId: post.id,
              rule: ruleWithBrandProfile,
              postContent: generatedContent,
              imageUrl,
              imageStoragePath,
            });
          } catch (carouselSlideError) {
            await supabase.from("post_slides").delete().eq("post_id", post.id);
            await supabase.from("posts").delete().eq("id", post.id);
            throw new Error(carouselSlideError.message || "Carousel slides could not be created.");
          }
        }

        if (isCarouselRule(rule) && websiteItems.length) {
          try {
            await saveCarouselWebsiteContentHistory({
              supabase,
              rule,
              postId: post.id,
              sourceUrl: websiteSourceUrl,
              websiteItems,
              cycleNumber: websiteCycleNumber,
            });
          } catch (historyError) {
            console.error("Could not save carousel website content history", {
              ruleId: rule.id,
              postId: post.id,
              message: historyError.message,
            });

            summary.warnings += 1;
          }
        } else if (rule.uses_website_content && websiteItem) {
          try {
            await saveWebsiteContentHistory({
              supabase,
              rule,
              postId: post.id,
              sourceUrl: websiteSourceUrl,
              websiteItem,
              cycleNumber: websiteCycleNumber,
            });
          } catch (historyError) {
            console.error("Could not save website content history", {
              ruleId: rule.id,
              postId: post.id,
              message: historyError.message,
            });

            summary.warnings += 1;
          }
        }

        if (postStatus === "pending_approval") {
          if (!resendApiKey) {
            summary.warnings += 1;
            summary.emails_failed += 1;
          } else {
            try {
              const userProfile = await getUserAuthProfile(supabase, rule.user_id);

              if (!userProfile?.email) {
                summary.warnings += 1;
                summary.emails_failed += 1;
              } else {
                await sendApprovalEmail({
                  supabase,
                  resendApiKey,
                  to: userProfile.email,
                  rule: ruleWithBrandProfile,
                  postContent: generatedContent,
                  approvalToken,
                  imageUrl: isCarouselRule(rule) ? null : (isWebsiteBasedPost && !websiteItem?.image_url ? null : imageUrl),
                  userAppLanguage: userProfile.appLanguage,
                  postId: post.id,
                  contentFormat: normalizeContentFormat(rule.content_format),
                });

                summary.emails_sent += 1;
              }
            } catch {
              summary.warnings += 1;
              summary.emails_failed += 1;
            }
          }
        }

        const newCreditsRemaining = creditsRemaining - creditCost;

        const { error: creditUpdateError } = await supabase
          .from("user_credit_balances")
          .update({
            credits_remaining: newCreditsRemaining,
            updated_at: nowIso,
          })
          .eq("user_id", rule.user_id);

        if (creditUpdateError) {
          const message =
            creditUpdateError.message || "Could not update credit balance";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        const { error: transactionError } = await supabase
          .from("credit_transactions")
          .insert({
            user_id: rule.user_id,
            amount: -creditCost,
            reason: rule.uses_website_content
              ? "Automation website post generated"
              : wantsImage
              ? "Automation post with image generated"
              : "Automation post generated",
            reference_type: "post",
            reference_id: post.id,
          });

        if (transactionError) {
          const message =
            transactionError.message || "Could not create credit transaction";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        const ruleUpdatePayload = getRuleUpdatePayloadAfterSuccess(
          rule,
          nowIso,
          now
        );

        const { error: ruleUpdateError } = await supabase
          .from("automation_rules")
          .update(ruleUpdatePayload)
          .eq("id", rule.id);

        if (ruleUpdateError) {
          summary.warnings += 1;
          continue;
        }

        summary.generated += 1;

        if (postStatus === "pending_approval") {
          summary.pending_approval += 1;
        }

      if (postStatus === "approved") {
  summary.approved += 1;
}
      } catch (error) {
        const message = error.message || "Unknown automation error";

        await setRuleError(supabase, rule.id, message);

        summary.errors += 1;
      }
    }

    return Response.json({
      ok: true,
      mode: "live_text_image_facebook_brand_profile_website_content_history",
      checked_at: nowIso,
      batch_size: BATCH_SIZE,
      fetched_rules: rules?.length || 0,
      summary,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || "Unknown cron error",
      },
      { status: 500 }
    );
  }
}
