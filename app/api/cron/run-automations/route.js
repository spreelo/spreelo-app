import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  OPENAI_MODELS,
  getTemperatureOptions,
} from "../../../../lib/openaiModels.js";
import crypto from "crypto";
import sharp from "sharp";
import {
  detectLikelyUiLocaleFromText,
  getServerTranslations,
  resolveBestServerLocale,
  resolveUiLocaleFromLanguageName,
} from "../../../../lib/i18n/serverUiText.js";
import { assertPublicHttpUrl } from "../../../../lib/security.js";
import { normalizeSingleContentLanguage } from "../../../../lib/contentLanguage.js";
import {
  buildCampaignFingerprint,
  chooseQualityCutoffAndRank,
} from "../../../../lib/productResolverCore.js";
import {
  PRODUCT_RESOLVER_VERSION,
  canTrustExhaustedProductDiscoveryState,
} from "../../../../lib/productDiscoveryPolicy.js";
import {
  buildCapabilityEvidenceTitleFrequency,
  mergeNormalizedProductEvidence,
  resolveCapabilityEvidenceTitle,
} from "../../../../lib/productEvidencePolicy.js";
import { fetchWebsiteHtmlRobust } from "../../../../lib/websiteFetch.js";
import {
  isConnectionAuthFailure,
  markConnectionExpiredAndAlert,
} from "../../../../lib/socialConnectionAlerts.js";

export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "UTC";
const BATCH_SIZE = 25;
const CRON_RULE_PROCESSING_LOCK_MINUTES = 15;
const RECENT_AUTOMATION_DRAFT_BLOCK_HOURS = 6;
const APP_URL = "https://app.spreelo.com";
const RESEND_FROM_EMAIL = "Spreelo <noreply@spreelo.com>";
const PRODUCT_FETCH_TIMEOUT_MS = 12000;
const PRODUCT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const WEBSITE_MAX_PAGES = 8;
const WEBSITE_MAX_TEXT_CHARS_PER_PAGE = 6500;
const WEBSITE_MAX_TOTAL_TEXT_CHARS = 22000;
const WEBSITE_MAX_IMAGE_CANDIDATES = 40;
const WEBSITE_PRODUCT_REUSE_LIMIT = 100;
const WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT = 150;
const WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT = 24;
const WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT = 10;
const WEBSITE_STORE_SEARCH_FETCH_LIMIT = 8;
const WEBSITE_STORE_SEARCH_VERIFY_LIMIT = 12;
const CAMPAIGN_STORE_SEARCH_QUERY_LIMIT = 6;
const CAMPAIGN_SEARCH_FORM_QUERY_LIMIT = 4;
const CAROUSEL_AI_SCORE_MAX_ITEMS = 15;
const CAROUSEL_DISCOVERY_VERIFY_LIMIT = 16;
const CAROUSEL_WEB_SEARCH_MAX_VERIFIED_ITEMS = 8;
const CAROUSEL_WEB_SEARCH_CANDIDATE_LIMIT = 16;
const CAMPAIGN_STRONG_PRODUCT_FIT_SCORE = 80;
const CAMPAIGN_NEAR_PRODUCT_FIT_SCORE = 75;
const CAMPAIGN_SUPPORTING_PRODUCT_FIT_SCORE = 60;
const CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE = 60;
const CAROUSEL_MIN_PRODUCT_SLIDES = 5;
const CAROUSEL_PRODUCT_SLIDE_TARGET = 5;
const CAROUSEL_OUTRO_SLIDE_COUNT = 1;
const CAROUSEL_MAX_PRODUCT_SLIDES = CAROUSEL_PRODUCT_SLIDE_TARGET + CAROUSEL_OUTRO_SLIDE_COUNT;
const CAMPAIGN_LOCKED_SEARCH_POOL_MIN_ITEMS = 3;
const CAMPAIGN_REUSE_EXHAUSTION_MIN_DISCOVERY_ATTEMPTS = 2;
const CAROUSEL_PRODUCT_CONFIDENCE_MIN = 55;
const CAROUSEL_PRODUCT_CONFIDENCE_SOFT_MIN = 50;
const CAROUSEL_FINAL_BROAD_FALLBACK_MIN_CONFIDENCE = 50;
const WEBSITE_TEXT_INTENT_MATCH_TERM_LIMIT = 18;
const WEBSITE_TEXT_INTENT_QUERY_LIMIT = 10;
const WEBSITE_TEXT_INTENT_AVOID_LIMIT = 12;
const WEBSITE_TEXT_INTENT_AI_MIN_SIGNAL_TERMS = 2;
const WEBSITE_TEXT_INTENT_AI_SCORE_MAX_ITEMS = 25;
const WEBSITE_TEXT_INTENT_STORE_VERIFY_LIMIT = 12;

const POST_TEXT_MODEL = OPENAI_MODELS.automationPost;
const PRODUCT_RESEARCH_MODEL = OPENAI_MODELS.productResearch;
const PRODUCT_RESEARCH_FAST_MODEL = OPENAI_MODELS.productResearchFast;
const IMAGE_MODEL = OPENAI_MODELS.image;
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


function appendProductCardSource(sources, value) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !/^[\[{]/.test(trimmed)) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        sources.push(parsed);
      }
    } catch {
      return;
    }

    return;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    sources.push(value);
  }
}

function getProductCardDataSources(item) {
  const sources = [];
  appendProductCardSource(sources, item);

  if (item && typeof item === "object") {
    [
      "metadata",
      "pricing",
      "price_info",
      "priceInfo",
      "product_data",
      "productData",
      "raw",
      "raw_product",
      "source_data",
      "data",
      "attributes",
      "details",
      "offer",
      "offers",
    ].forEach((key) => appendProductCardSource(sources, item?.[key]));
  }

  return sources;
}

function findFirstProductCardValue(item, keys = []) {
  const sources = getProductCardDataSources(item);

  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (value === null || value === undefined) {
        continue;
      }

      const text = String(value).replace(/\s+/g, " ").trim();
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function parseComparablePriceAmount(value) {
  const raw = String(value || "").replace(/[^\d,.-]/g, "").trim();
  if (!raw) {
    return null;
  }

  let normalized = raw.replace(/\s+/g, "");
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    if (decimalSeparator === ',') {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const decimals = normalized.length - lastComma - 1;
    normalized = decimals > 0 && decimals <= 2
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimals = normalized.length - lastDot - 1;
    normalized = decimals > 0 && decimals <= 2
      ? normalized.replace(/,/g, '')
      : normalized.replace(/\./g, '');
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function getTrustedProductCardBrand(item) {
  const brand = findFirstProductCardValue(item, [
    "brand_name",
    "brand",
    "vendor",
    "vendor_name",
    "designer",
    "manufacturer",
    "brandName",
    "vendorName",
    "product_brand",
  ]);

  if (!brand || brand.length < 2) {
    return "";
  }

  return normalizeSlideText(brand.replace(/\s+/g, " "), 48);
}

function getTrustedProductCardTitle(item) {
  const title = String(item?.title || item?.name || item?.product_title || "").trim();
  if (!title || title.length < 2) {
    return "";
  }

  return normalizeSlideText(title.replace(/\s+/g, " "), 96);
}

function getTrustedWebsiteItemPricing(websiteItem) {
  const currentPriceRaw = findFirstProductCardValue(websiteItem, [
    "sale_price",
    "current_price",
    "discount_price",
    "final_price",
    "offer_price",
    "now_price",
    "product_sale_price",
  ]);
  const originalPriceRaw = findFirstProductCardValue(websiteItem, [
    "original_price",
    "compare_at_price",
    "regular_price",
    "list_price",
    "was_price",
    "price_before_discount",
    "product_original_price",
  ]);
  const fallbackPriceRaw = findFirstProductCardValue(websiteItem, [
    "price",
    "formatted_price",
    "display_price",
    "product_price",
  ]);

  let currentPrice = normalizeVerifiedPriceValue(currentPriceRaw || fallbackPriceRaw);
  let originalPrice = normalizeVerifiedPriceValue(originalPriceRaw);

  if (!currentPrice && originalPrice) {
    currentPrice = originalPrice;
    originalPrice = "";
  }

  if (currentPrice && originalPrice) {
    const currentAmount = parseComparablePriceAmount(currentPrice);
    const originalAmount = parseComparablePriceAmount(originalPrice);

    if (currentAmount !== null && originalAmount !== null) {
      if (currentAmount > originalAmount) {
        const swappedCurrent = originalPrice;
        originalPrice = currentPrice;
        currentPrice = swappedCurrent;
      } else if (Math.abs(currentAmount - originalAmount) < 0.0001) {
        originalPrice = "";
      }
    } else if (currentPrice === originalPrice) {
      originalPrice = "";
    }
  }

  const displayPrice = currentPrice || originalPrice || "";
  const isOnSale = Boolean(displayPrice && originalPrice && displayPrice !== originalPrice);

  if (displayPrice && isLikelyWrongUsdPriceForUrl(displayPrice, websiteItem?.url || websiteItem?.website_url)) {
    console.warn("Ignored suspicious website item price because currency does not match product URL", {
      productUrl: websiteItem?.url || null,
      rawPrice: truncateText(String(fallbackPriceRaw || currentPriceRaw || originalPriceRaw || ""), 80),
    });

    return {
      displayPrice: "",
      currentPrice: "",
      salePrice: "",
      originalPrice: "",
      isOnSale: false,
    };
  }

  return {
    displayPrice,
    currentPrice: displayPrice,
    salePrice: isOnSale ? displayPrice : "",
    originalPrice: isOnSale ? originalPrice : "",
    isOnSale,
  };
}

function getTrustedProductCardPrice(item) {
  return getTrustedWebsiteItemPricing(item).displayPrice;
}

function buildCenteredSvgTextBlock(lines, { x, y, fontSize, lineHeight, fontWeight = 400, fill = "#0f172a" }) {
  if (!Array.isArray(lines) || !lines.length) {
    return "";
  }

  const spans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="middle">${spans}</text>`;
}

async function renderCarouselProductSlideImage({
  sourceImageUrl,
  product = null,
  title = "",
  price = "",
}) {
  const width = 1080;
  const height = 1080;
  const cardX = 64;
  const cardY = 64;
  const cardWidth = 952;
  const cardHeight = 952;
  const imageX = 116;
  const imageY = 104;
  const imageWidth = 848;
  const imageHeight = 640;
  const centerX = width / 2;

  const pricingSource = product && typeof product === 'object' ? { ...product } : {};
  if (price && !pricingSource.price) {
    pricingSource.price = price;
  }

  const trustedBrand = getTrustedProductCardBrand(pricingSource);
  const trustedTitle = getTrustedProductCardTitle({
    title: title || pricingSource?.title || pricingSource?.name || pricingSource?.product_title || "",
  });
  const pricing = getTrustedWebsiteItemPricing(pricingSource);
  const titleLines = trustedTitle ? wrapSvgText(trustedTitle, 28, 2) : [];
  const brandLines = trustedBrand ? wrapSvgText(trustedBrand, 36, 1) : [];
  const hasBrand = brandLines.length > 0;
  const titleY = hasBrand ? 830 : titleLines.length > 1 ? 824 : 846;
  const priceY = hasBrand ? (titleLines.length > 1 ? 936 : 924) : (titleLines.length > 1 ? 938 : 928);

  const brandSvg = hasBrand
    ? buildCenteredSvgTextBlock(brandLines, {
        x: centerX,
        y: 792,
        fontSize: 21,
        lineHeight: 24,
        fontWeight: 600,
        fill: '#64748b',
      })
    : '';

  const titleSvg = titleLines.length
    ? buildCenteredSvgTextBlock(titleLines, {
        x: centerX,
        y: titleY,
        fontSize: 37,
        lineHeight: 46,
        fontWeight: 700,
        fill: '#111827',
      })
    : '';

  let priceSvg = '';
  if (pricing.isOnSale && pricing.salePrice && pricing.originalPrice) {
    const saleX = centerX - 20;
    const originalX = centerX + 20;
    const originalFontSize = 26;
    const estimatedWidth = Math.max(pricing.originalPrice.length * originalFontSize * 0.58, 48);

    priceSvg = `
      <text x="${saleX}" y="${priceY}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="#dc2626" text-anchor="end">${escapeSvg(pricing.salePrice)}</text>
      <text x="${originalX}" y="${priceY}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${originalFontSize}" font-weight="600" fill="#94a3b8" text-anchor="start">${escapeSvg(pricing.originalPrice)}</text>
      <line x1="${originalX}" y1="${priceY - 10}" x2="${originalX + estimatedWidth}" y2="${priceY - 10}" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
    `;
  } else if (pricing.displayPrice) {
    priceSvg = `<text x="${centerX}" y="${priceY}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#0f172a" text-anchor="middle">${escapeSvg(pricing.displayPrice)}</text>`;
  }

  const dividerSvg = (brandSvg || titleSvg || priceSvg)
    ? `<line x1="156" y1="754" x2="924" y2="754" stroke="#eef2f7" stroke-width="2"/>`
    : '';

  const backgroundSvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="0" fill="#f5f7fb"/>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="42" fill="#ffffff" stroke="#d9e2f0" stroke-width="3"/>
      <rect x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" rx="30" fill="#f8fafc"/>
      ${dividerSvg}
      ${brandSvg}
      ${titleSvg}
      ${priceSvg}
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

function addMinutesIso(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function subtractHoursIso(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000).toISOString();
}

async function claimAutomationRuleForProcessing({ supabase, rule, now }) {
  const lockUntilIso = addMinutesIso(now, CRON_RULE_PROCESSING_LOCK_MINUTES);
  const claimStartedIso = new Date().toISOString();
  let query = supabase
    .from("automation_rules")
    .update({
      next_run_at: lockUntilIso,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rule.id)
    .eq("is_active", true);

  if (rule.next_run_at) {
    query = query.lte("next_run_at", claimStartedIso);
  } else {
    query = query.is("next_run_at", null);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not lock automation rule for processing");
  }

  return Boolean(data?.id);
}

async function findRecentAutomationDraftsForRule({ supabase, ruleId, now }) {
  if (!ruleId) {
    return [];
  }

  const sinceIso = subtractHoursIso(now, RECENT_AUTOMATION_DRAFT_BLOCK_HOURS);
  const { data, error } = await supabase
    .from("posts")
    .select("id, status, created_at, content_format, slide_count, slide_generation_status, slide_render_status")
    .eq("automation_rule_id", ruleId)
    .in("status", ["pending_approval", "generating"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message || "Could not check recent automation drafts");
  }

  return Array.isArray(data) ? data : [];
}

function isCompleteAutomationDraft(post) {
  if (normalizeContentFormat(post?.content_format) !== "carousel") {
    return post?.status === "pending_approval";
  }

  return (
    Number(post?.slide_count || 0) > 0 &&
    String(post?.slide_generation_status || "").toLowerCase() === "ready"
  );
}

function isIncompleteCarouselDraftPost(post) {
  if (normalizeContentFormat(post?.content_format) !== "carousel") {
    return false;
  }

  const slideCount = Number(post?.slide_count || 0);
  const generationStatus = String(post?.slide_generation_status || "").toLowerCase();

  return slideCount < 1 || generationStatus === "none" || generationStatus === "failed";
}

async function deleteIncompleteCarouselDrafts({ supabase, posts }) {
  const postIds = (posts || [])
    .filter(isIncompleteCarouselDraftPost)
    .map((post) => post.id)
    .filter(Boolean);

  if (!postIds.length) {
    return 0;
  }

  const { error: slideDeleteError } = await supabase
    .from("post_slides")
    .delete()
    .in("post_id", postIds);

  if (slideDeleteError) {
    throw new Error(slideDeleteError.message || "Could not delete incomplete carousel slides");
  }

  const { error } = await supabase.from("posts").delete().in("id", postIds);

  if (error) {
    throw new Error(error.message || "Could not delete incomplete carousel drafts");
  }

  return postIds.length;
}

function countIncompleteCarouselDrafts(posts) {
  return (posts || []).filter(isIncompleteCarouselDraftPost).length;
}

async function makeCompleteGeneratingDraftVisible({ supabase, post }) {
  if (!post?.id || post.status !== "generating" || !isCompleteAutomationDraft(post)) {
    return false;
  }

  const { error } = await supabase
    .from("posts")
    .update({
      status: "pending_approval",
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);

  if (error) {
    throw new Error(error.message || "Could not recover completed carousel draft");
  }

  return true;
}

function getLanguageInstruction(language) {
  const normalizedLanguage = normalizeSingleContentLanguage(language, "English");

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

  if (normalizedLanguage === "English") {
    return `
Language: English.

Important language rule:
- Write the final post in English, even if the user's instruction is written in another language.
`.trim();
  }

  return `
Language: ${normalizedLanguage}.

Important language rule:
- Write the final post in ${normalizedLanguage}.
- Do not mix multiple languages in the same post.
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

function getBrandCapabilityVerifiedProductCandidates(brandProfile) {
  const evidence = brandProfile?.website_product_mode_evidence;
  const verifiedItems = Array.isArray(evidence?.verified_items)
    ? evidence.verified_items
    : [];
  const websiteUrl = getWebsiteProductSourceUrl(brandProfile);
  const titleFrequency = buildCapabilityEvidenceTitleFrequency(verifiedItems);

  return dedupeUrlItems(
    verifiedItems
      .filter((item) => item?.verified && item?.url)
      .map((item) => {
        const signals = item?.signals || {};

        return {
          title: resolveCapabilityEvidenceTitle(item, titleFrequency),
          url: canonicalizeWebsiteProductUrl(item.url, websiteUrl) || item.url,
          image_url: item.image_url || null,
          price: item.price || "",
          description: String(item?.description || "").trim(),
          reason: "Product page previously verified during brand capability analysis",
          score: 160 + Number(item?.score || 0),
          discovery_score: 160 + Number(item?.score || 0),
          source_page_url: websiteUrl,
          campaign_fit_source: "brand_capability_verified_seed",
          product_page_verified: true,
          product_schema_verified: Boolean(signals.hasProductSchema),
          ecommerce_proof_found: Boolean(
            signals.hasPurchaseAction ||
            signals.hasOfferSchema ||
            signals.hasStructuredPrice
          ),
          add_to_cart_detected: Boolean(signals.hasPurchaseAction),
          product_confidence: 100,
        };
      })
  ).slice(0, 24);
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

function isBadProductUrl(value) {
  const lowerUrl = String(value || "").toLowerCase().trim();

  if (!lowerUrl) {
    return true;
  }

  if (
    lowerUrl.includes("{{") ||
    lowerUrl.includes("}}") ||
    lowerUrl.includes("%7b%7b") ||
    lowerUrl.includes("%7d%7d") ||
    lowerUrl.includes("/undefined") ||
    lowerUrl.includes("/null")
  ) {
    return true;
  }

  try {
    const parsedUrl = new URL(lowerUrl);
    const path = parsedUrl.pathname.replace(/\/{2,}/g, "/");
    const isCollectionProductPath = /^\/collections\/[^/]+\/products\/[^/]+/i.test(path);

    if (isCollectionProductPath) {
      return false;
    }

    return /^\/(?:collections?|categories?|search|sok|sök|pages?)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
}

function hasMeaningfulProductIdentityText(value) {
  const text = String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 4 || text.length > 180) {
    return false;
  }

  const tokens = text.split(" ").filter(Boolean);
  const letterTokens = tokens.filter((token) => /\p{L}/u.test(token));

  if (!letterTokens.length) {
    return false;
  }

  // A single short navigation label is weak product evidence. A one-word product
  // can still pass later if the page has strong product proof such as schema/cart/price.
  if (tokens.length === 1 && text.length < 9) {
    return false;
  }

  return true;
}

function getProductUrlEvidenceScore(value) {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase();

    if (!path || path === "/" || isBadProductUrl(value)) {
      return 0;
    }

    let score = 8;

    if (/\/(?:products?|produkt(?:er)?|artiklar?|item|p)\//i.test(path)) score += 22;
    if (/\/collections\/[^/]+\/products\//i.test(path)) score += 18;
    if (/[-_/](?:p|sku|art|id)?\d{3,}(?:[-_/]|$)/i.test(path)) score += 12;
    if ((path.match(/\//g) || []).length >= 2) score += 6;

    return Math.min(score, 35);
  } catch {
    return 0;
  }
}

function hasEcommerceProofText(value) {
  const text = normalizeSearchText(value);

  return /\b(add to cart|add to bag|buy now|checkout|in stock|out of stock|variant|variants|size|sizes|color|colour|quantity|sku|cart|basket|varukorg|lagg i varukorg|lägg i varukorg|kop nu|köp nu|storlek|farg|färg|lager|artikelnummer|sku|warenkorb|in den warenkorb|größe|groesse|taille|panier|añadir|carrito|carrello)\b/i.test(text);
}

function getCarouselProductConfidence(item) {
  if (!item || !item.title || !item.url || !item.image_url) {
    return 0;
  }

  if (isBadProductUrl(item.url) || isBadProductImageUrl(item.image_url)) {
    return 0;
  }

  let score = 0;

  if (hasMeaningfulProductIdentityText(item.title)) score += 18;
  if (String(item.description || "").trim().length >= 20) score += 8;
  if (getTrustedWebsiteItemPrice(item) || normalizeVerifiedPriceValue(item.price)) score += 16;
  if (item.image_url && !isBadProductImageUrl(item.image_url)) score += 22;

  score += getProductUrlEvidenceScore(item.url);

  if (item.product_schema_verified || item.product_json_ld_found || item.product_schema_found) score += 30;
  if (item.add_to_cart_detected || item.ecommerce_proof_found || hasEcommerceProofText(item.description)) score += 16;
  if (item.product_page_verified || item.discovery_source === "selected" || String(item.campaign_fit_source || "").includes("product")) score += 8;

  return Math.min(score, 100);
}

function isValidCarouselProduct(item) {
  const hasVerifiedCommerceEvidence = Boolean(
    item?.product_schema_verified ||
    item?.product_json_ld_found ||
    item?.product_schema_found ||
    item?.add_to_cart_detected ||
    item?.ecommerce_proof_found ||
    (
      item?.product_page_verified &&
      (getTrustedWebsiteItemPrice(item) || normalizeVerifiedPriceValue(item?.price)) &&
      getProductUrlEvidenceScore(item?.url) >= 22
    )
  );

  return Boolean(
    item?.title &&
    item?.url &&
    item?.image_url &&
    !isBadProductUrl(item.url) &&
    !isBadProductImageUrl(item.image_url) &&
    hasVerifiedCommerceEvidence &&
    getCarouselProductConfidence(item) >= CAROUSEL_PRODUCT_CONFIDENCE_SOFT_MIN
  );
}

function isHighConfidenceCarouselProduct(item) {
  return isValidCarouselProduct(item) && getCarouselProductConfidence(item) >= CAROUSEL_PRODUCT_CONFIDENCE_MIN;
}

function hasWebsiteItemCatalogUsage(item) {
  return (
    Number(item?.times_used || 0) > 0 ||
    Boolean(item?.last_used_at) ||
    /(?:^|_)used$/i.test(String(item?.discovery_source || item?.catalog_source || ""))
  );
}

function mergeWebsiteItemDuplicateMetadata(existingItem, incomingItem) {
  if (!existingItem || !incomingItem) {
    return existingItem || incomingItem;
  }

  const existingLastUsedAt = existingItem.last_used_at ? Date.parse(existingItem.last_used_at) : 0;
  const incomingLastUsedAt = incomingItem.last_used_at ? Date.parse(incomingItem.last_used_at) : 0;

  existingItem.times_used = Math.max(
    Number(existingItem.times_used || 0),
    Number(incomingItem.times_used || 0)
  );

  if (incomingLastUsedAt > existingLastUsedAt) {
    existingItem.last_used_at = incomingItem.last_used_at;
  }

  existingItem.selection_priority = Math.max(
    Number(existingItem.selection_priority || 0),
    Number(incomingItem.selection_priority || 0)
  );
  existingItem.campaign_fit_score = Math.max(
    Number(existingItem.campaign_fit_score || 0),
    Number(incomingItem.campaign_fit_score || 0)
  );

  if (!existingItem.catalog_source && incomingItem.catalog_source) {
    existingItem.catalog_source = incomingItem.catalog_source;
  }
  if (!existingItem.discovery_source && incomingItem.discovery_source) {
    existingItem.discovery_source = incomingItem.discovery_source;
  }
  if (!existingItem.campaign_fit_source && incomingItem.campaign_fit_source) {
    existingItem.campaign_fit_source = incomingItem.campaign_fit_source;
  }
  if (!existingItem.item_key && incomingItem.item_key) {
    existingItem.item_key = incomingItem.item_key;
  }

  return existingItem;
}

function dedupeWebsiteItemsByUrlTitleAndImage(items = []) {
  const seen = new Set();
  const seenUrls = new Set();
  const seenImageUrls = new Set();
  const existingByKey = new Map();
  const existingByUrl = new Map();
  const existingByImage = new Map();
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
    const urlKey = normalizeComparableValue(
      canonicalizeWebsiteProductUrl(normalized.url, item?.url || item?.source_url || "") || normalized.url
    );
    const imageKey = normalizeComparableValue(normalized.image_url);

    if (
      seen.has(key) ||
      (urlKey && seenUrls.has(urlKey)) ||
      (imageKey && seenImageUrls.has(imageKey))
    ) {
      const existingItem =
        existingByKey.get(key) ||
        (urlKey ? existingByUrl.get(urlKey) : null) ||
        (imageKey ? existingByImage.get(imageKey) : null);

      if (existingItem) {
        mergeWebsiteItemDuplicateMetadata(existingItem, item);
      }

      continue;
    }

    seen.add(key);
    if (urlKey) {
      seenUrls.add(urlKey);
    }
    if (imageKey) {
      seenImageUrls.add(imageKey);
    }
    unique.push({
      ...item,
      ...normalized,
      item_key: normalized.item_key || item.item_key || createItemKey(normalized),
      times_used: Number(item.times_used || 0),
      last_used_at: item.last_used_at || null,
      selection_priority: Number(item.selection_priority || 0),
      campaign_fit_score: Number(item.campaign_fit_score || 0),
      campaign_fit_source: item.campaign_fit_source || null,
      ai_campaign_fit_score:
        item.ai_campaign_fit_score === undefined || item.ai_campaign_fit_score === null
          ? null
          : Number(item.ai_campaign_fit_score),
      campaign_fit_verdict: item.campaign_fit_verdict || null,
      campaign_fit_reason: item.campaign_fit_reason || null,
    });
    existingByKey.set(key, unique[unique.length - 1]);
    if (urlKey) {
      existingByUrl.set(urlKey, unique[unique.length - 1]);
    }
    if (imageKey) {
      existingByImage.set(imageKey, unique[unique.length - 1]);
    }
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
      const wasUsedRecently =
        hasWebsiteItemCatalogUsage(item) ||
        hasWebsiteItemAlreadyBeenUsed(item, recentUsedItems, sourceUrl);
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
        score -= allowReuseWhenExhausted ? 500 : 100000;
      }

      if (imageUsedThisRun) {
        score -= allowReuseWhenExhausted ? 250 : 100000;
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
    .filter((entry) => allowReuseWhenExhausted || (!entry.wasUsedRecently && !entry.imageUsedThisRun))
    .sort((a, b) => {
      if (a.wasUsedRecently !== b.wasUsedRecently) {
        return a.wasUsedRecently ? 1 : -1;
      }
      if (a.imageUsedThisRun !== b.imageUsedThisRun) {
        return a.imageUsedThisRun ? 1 : -1;
      }
      if (isCampaignRule && a.campaignFitScore !== b.campaignFitScore) {
        return b.campaignFitScore - a.campaignFitScore;
      }
      if (isCampaignRule && a.score !== b.score) {
        return b.score - a.score;
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

function getCarouselProductSelectionKey(item, sourceUrl = "") {
  const normalized = normalizeWebsiteItem(item, item?.url || item?.source_url || sourceUrl);

  if (!normalized || !isValidCarouselProduct(normalized)) {
    return "";
  }

  return [
    normalizeComparableValue(canonicalizeWebsiteProductUrl(normalized.url, sourceUrl) || normalized.url),
    normalizeComparableValue(normalized.title),
    normalizeComparableValue(normalized.image_url),
  ].join("|");
}


function areSameWebsiteItem(a, b, sourceUrl = "") {
  const aKey = getCarouselProductSelectionKey(a, sourceUrl);
  const bKey = getCarouselProductSelectionKey(b, sourceUrl);

  if (aKey && bKey && aKey === bKey) {
    return true;
  }

  const aUrl = canonicalizeWebsiteProductUrl(a?.url || a?.product_url || a?.item_url || "", sourceUrl);
  const bUrl = canonicalizeWebsiteProductUrl(b?.url || b?.product_url || b?.item_url || "", sourceUrl);

  if (aUrl && bUrl && normalizeComparableValue(aUrl) === normalizeComparableValue(bUrl)) {
    return true;
  }

  const aImage = normalizeComparableValue(a?.image_url);
  const bImage = normalizeComparableValue(b?.image_url);

  if (aImage && bImage && aImage === bImage) {
    return true;
  }

  return false;
}

function mergeCarouselProductSelections(primaryItems, fallbackItems, sourceUrl, limit = CAROUSEL_PRODUCT_SLIDE_TARGET) {
  const selected = [];
  const seen = new Set();

  for (const item of [...(primaryItems || []), ...(fallbackItems || [])]) {
    const key = getCarouselProductSelectionKey(item, sourceUrl);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push(item);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function fillCarouselProductSelection(primaryItems, fallbackGroups, sourceUrl, limit = CAROUSEL_PRODUCT_SLIDE_TARGET) {
  const selected = [];

  for (const item of primaryItems || []) {
    if (!isValidCarouselProduct(item)) {
      continue;
    }

    if (selected.some((selectedItem) => areSameWebsiteItem(selectedItem, item, sourceUrl))) {
      continue;
    }

    selected.push(item);

    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const group of fallbackGroups || []) {
    for (const item of group || []) {
      if (!isValidCarouselProduct(item)) {
        continue;
      }

      if (selected.some((selectedItem) => areSameWebsiteItem(selectedItem, item, sourceUrl))) {
        continue;
      }

      selected.push(item);

      if (selected.length >= limit) {
        return selected;
      }
    }
  }

  return selected;
}

function getFreshCarouselProductCandidates({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  const isCampaignRule = isCampaignScopedWebsiteRule(rule);

  return dedupeWebsiteItemsByUrlTitleAndImage(items)
    .filter((item) => {
      if (!isValidCarouselProduct(item)) {
        return false;
      }

      if (hasWebsiteItemCatalogUsage(item)) {
        return false;
      }

      if (hasWebsiteItemAlreadyBeenUsed(item, recentUsedItems, sourceUrl)) {
        return false;
      }

      return !usedWebsiteImageUrlsThisRun.has(normalizeComparableValue(item.image_url));
    })
    .map((item) => ({
      item,
      primaryMatches: isCampaignRule ? countPrimaryCampaignTermMatches(item, rule) : 0,
      campaignFitScore: isCampaignRule ? scoreCampaignFitForRule(item, rule) : 0,
      score: scoreWebsiteItemForRule(item, rule),
      selectionPriority: Number(item?.selection_priority || 0),
    }))
    .sort((a, b) => {
      if (isCampaignRule && a.primaryMatches !== b.primaryMatches) {
        return b.primaryMatches - a.primaryMatches;
      }

      if (isCampaignRule && a.campaignFitScore !== b.campaignFitScore) {
        return b.campaignFitScore - a.campaignFitScore;
      }

      if (a.selectionPriority !== b.selectionPriority) {
        return b.selectionPriority - a.selectionPriority;
      }

      if (a.score !== b.score) {
        return b.score - a.score;
      }

      return String(a.item?.title || "").localeCompare(String(b.item?.title || ""));
    })
    .map((entry) => entry.item);
}

function getFreshSafeCampaignProductCandidates({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  const freshItems = getFreshCarouselProductCandidates({
    items,
    rule,
    sourceUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
  });

  if (!isCampaignScopedWebsiteRule(rule)) {
    return freshItems;
  }

  return getSafeCampaignProductCandidates(freshItems, rule);
}

function getFreshRelevantCampaignProductCandidates({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  minimumScore = 30,
}) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return [];
  }

  return getFreshCarouselProductCandidates({
    items,
    rule,
    sourceUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
  })
    .map((item) => {
      const campaignFitScore = scoreCampaignFitForRule(item, rule);
      const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
      const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
      const anchorMatches = countCampaignAnchorTermMatches(item, rule);
      const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
      const aiCampaignFitScore = getAiCampaignFitScore(item);
      const directSignalCount = themeMatches + sourceThemeMatches + anchorMatches + primaryMatches;
      const source = normalizeSearchText(item?.catalog_source || item?.discovery_source || item?.campaign_fit_source);
      const cameFromCampaignResearch =
        source.includes("campaign") ||
        source.includes("store_search") ||
        source.includes("ai_campaign_research");
      const hasRequiredSignal = hasRequiredDirectCampaignSignal({
        rule,
        themeMatches,
        sourceThemeMatches,
        anchorMatches,
        primaryMatches,
      });

      return {
        ...item,
        campaign_fit_score: Math.max(Number(item.campaign_fit_score || 0), campaignFitScore),
        campaign_fit_source: item.campaign_fit_source || "fresh_relevant_delivery",
        campaign_rotation_state: "fresh",
        _freshRelevantSort: {
          campaignFitScore,
          themeMatches,
          sourceThemeMatches,
          anchorMatches,
          primaryMatches,
          directSignalCount,
          hasRequiredSignal,
          aiCampaignFitScore,
          cameFromCampaignResearch,
          selectionPriority: Number(item.selection_priority || 0),
        },
      };
    })
    .filter((item) => {
      const sort = item?._freshRelevantSort || {};

      return Boolean(sort.hasRequiredSignal) &&
        Number(sort.campaignFitScore || 0) >= minimumScore;
    })
    .sort((a, b) => {
      const aSort = a?._freshRelevantSort || {};
      const bSort = b?._freshRelevantSort || {};

      const signalDelta = Number(bSort.directSignalCount || 0) - Number(aSort.directSignalCount || 0);
      if (signalDelta !== 0) return signalDelta;

      const scoreDelta = Number(bSort.campaignFitScore || 0) - Number(aSort.campaignFitScore || 0);
      if (scoreDelta !== 0) return scoreDelta;

      const priorityDelta = Number(bSort.selectionPriority || 0) - Number(aSort.selectionPriority || 0);
      if (priorityDelta !== 0) return priorityDelta;

      return String(a?.title || "").localeCompare(String(b?.title || ""));
    })
    .map(({ _freshRelevantSort, ...item }) => item);
}

function getStrictCampaignFallbackGroups(items, rule) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return [items || []];
  }

  const dedupedItems = dedupeWebsiteItemsByUrlTitleAndImage(items);
  const directThemeGroups = [
    getCampaignThemeSourceLockedItems(dedupedItems, rule),
    getCampaignThemeMatchedItems(dedupedItems, rule),
    getCampaignAnchorMatchedItems(dedupedItems, rule),
  ].filter((group) => Array.isArray(group) && group.length);

  // A named campaign theme must never be padded with generic product-type
  // matches. If the themed pool is too small, discovery should fail clearly
  // instead of creating a misleading carousel.
  if (extractCampaignCoreThemeTerms(rule).length > 0) {
    return directThemeGroups;
  }

  return [
    ...directThemeGroups,
    getPrimaryCampaignMatchedItems(dedupedItems, rule),
    getSafeCampaignProductCandidates(dedupedItems, rule),
    getStrongCampaignFitItems(dedupedItems, rule),
    getCampaignFitItemsAtOrAboveScore(
      dedupedItems,
      rule,
      CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
    ),
    getSupportingCampaignFitItems(dedupedItems, rule),
  ].filter((group) => Array.isArray(group) && group.length);
}

function getStrictCampaignFallbackProducts(items, rule) {
  return dedupeWebsiteItemsByUrlTitleAndImage(
    getStrictCampaignFallbackGroups(items, rule).flat()
  );
}

function fillCampaignProductSelection(primaryItems, fallbackItems, rule, sourceUrl, limit = CAROUSEL_PRODUCT_SLIDE_TARGET) {
  return fillCarouselProductSelection(
    primaryItems,
    getStrictCampaignFallbackGroups(fallbackItems, rule),
    sourceUrl,
    limit
  );
}


function getCampaignCandidateUsageState(item, recentUsedItems, sourceUrl, usedWebsiteImageUrlsThisRun = new Set()) {
  return {
    wasUsedRecently:
      hasWebsiteItemCatalogUsage(item) ||
      hasWebsiteItemAlreadyBeenUsed(item, recentUsedItems, sourceUrl),
    imageUsedThisRun: usedWebsiteImageUrlsThisRun.has(normalizeComparableValue(item?.image_url)),
  };
}

function isFreshCampaignCandidate(item, recentUsedItems, sourceUrl, usedWebsiteImageUrlsThisRun = new Set()) {
  const state = getCampaignCandidateUsageState(
    item,
    recentUsedItems,
    sourceUrl,
    usedWebsiteImageUrlsThisRun
  );

  return !state.wasUsedRecently && !state.imageUsedThisRun;
}

function annotateCampaignReuseState(item, recentUsedItems, sourceUrl, usedWebsiteImageUrlsThisRun = new Set()) {
  const state = getCampaignCandidateUsageState(
    item,
    recentUsedItems,
    sourceUrl,
    usedWebsiteImageUrlsThisRun
  );

  return {
    ...item,
    campaign_was_used_recently: state.wasUsedRecently,
    campaign_image_used_this_run: state.imageUsedThisRun,
    campaign_rotation_state:
      state.wasUsedRecently || state.imageUsedThisRun ? "reused" : "fresh",
  };
}

function buildRecentUsedCampaignDeliveryItems(recentUsedItems, rule, sourceUrl) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return [];
  }

  return dedupeWebsiteItemsByUrlTitleAndImage(
    (recentUsedItems || [])
      .map((item) => {
        const title = String(item?.item_title || item?.title || "").trim();
        const url = item?.item_url || item?.product_url || item?.url || "";
        const imageUrl = item?.item_image_url || item?.image_url || "";

        if (!title || !url || !imageUrl) {
          return null;
        }

        return {
          title,
          description: title,
          type: "product",
          url: canonicalizeWebsiteProductUrl(url, sourceUrl) || url,
          image_url: imageUrl,
          item_key: item?.item_key || createItemKey({ url, title }),
          campaign_fit_source: "recent_used_relevance_delivery",
          campaign_fit_score: scoreCampaignFitForRule(
            {
              title,
              description: title,
              url,
              image_url: imageUrl,
            },
            rule
          ),
          campaign_was_used_recently: true,
          campaign_image_used_this_run: false,
          campaign_rotation_state: "reused",
          selection_priority: 1,
        };
      })
      .filter(Boolean)
  );
}

function getCampaignProductTier(score) {
  if (score >= 90) return "strong";
  if (score >= CAMPAIGN_NEAR_PRODUCT_FIT_SCORE) return "near";
  if (score >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE) return "fallback";
  return "reject";
}

function hasRequiredDirectCampaignSignal({
  rule,
  themeMatches = 0,
  sourceThemeMatches = 0,
  anchorMatches = 0,
  primaryMatches = 0,
}) {
  if (extractCampaignCoreThemeTerms(rule).length > 0) {
    return (
      Number(themeMatches) +
        Number(anchorMatches) >
      0
    );
  }

  if (extractCampaignAnchorTerms(rule).length > 0) {
    return Number(anchorMatches) > 0;
  }

  if (extractExplicitCampaignMatchTerms(rule).length > 0) {
    return Number(primaryMatches) > 0;
  }

  return true;
}

function isEligibleCampaignCarouselProduct(item, rule) {
  if (!isValidCarouselProduct(item)) {
    return false;
  }

  const campaignFitScore = scoreCampaignFitForRule(item, rule);

  if (campaignFitScore < CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE) {
    return false;
  }

  return hasRequiredDirectCampaignSignal({
    rule,
    themeMatches: countCampaignCoreThemeTermMatches(item, rule),
    sourceThemeMatches: countCampaignSourceThemeMatches(item, rule),
    anchorMatches: countCampaignAnchorTermMatches(item, rule),
    primaryMatches: countPrimaryCampaignTermMatches(item, rule),
  });
}

function selectBestAvailableCampaignCarouselProducts({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  limit = CAROUSEL_PRODUCT_SLIDE_TARGET,
}) {
  const rankedCandidates = dedupeWebsiteItemsByUrlTitleAndImage(items)
    .filter(isValidCarouselProduct)
    .map((item) => {
      const campaignFitScore = scoreCampaignFitForRule(item, rule);
      const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
      const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
      const anchorMatches = countCampaignAnchorTermMatches(item, rule);
      const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
      const hasDirectSignal = hasRequiredDirectCampaignSignal({
        rule,
        themeMatches,
        sourceThemeMatches,
        anchorMatches,
        primaryMatches,
      });
      const usage = getCampaignCandidateUsageState(
        item,
        recentUsedItems,
        sourceUrl,
        usedWebsiteImageUrlsThisRun
      );
      const relevanceTier = hasDirectSignal && campaignFitScore >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE
        ? 0
        : campaignFitScore >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE
          ? 1
          : campaignFitScore >= 30
            ? 2
            : 3;

      return {
        ...item,
        campaign_fit_score: campaignFitScore,
        campaign_fit_source: item.campaign_fit_source || "best_available_campaign_fallback",
        campaign_theme_term_matches: themeMatches,
        campaign_source_theme_matches: sourceThemeMatches,
        campaign_anchor_term_matches: anchorMatches,
        primary_campaign_term_matches: primaryMatches,
        campaign_has_direct_signal: hasDirectSignal,
        campaign_rotation_state: usage.wasUsedRecently || usage.imageUsedThisRun ? "reused" : "fresh",
        campaign_was_used_recently: usage.wasUsedRecently,
        campaign_image_used_this_run: usage.imageUsedThisRun,
        _bestAvailableSort: {
          relevanceTier,
          used: usage.wasUsedRecently || usage.imageUsedThisRun,
          campaignFitScore,
          directMatches: themeMatches + sourceThemeMatches + anchorMatches + primaryMatches,
          selectionPriority: Number(item.selection_priority || 0),
          usageCount: Number(item.times_used || 0) + (usage.wasUsedRecently ? 1 : 0),
          lastUsedAtTs: item.last_used_at ? Date.parse(item.last_used_at) || 0 : 0,
        },
      };
    });
  return chooseQualityCutoffAndRank(
    rankedCandidates.map((item) => ({
      item,
      stableKey: item.url || item.title || "",
      selection: item._bestAvailableSort,
    })),
    limit
  ).map(({ item }) => {
    const { _bestAvailableSort, ...cleanItem } = item;
    return cleanItem;
  });
}

function buildCampaignScoredProductCandidates({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  minimumScore = CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
}) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return [];
  }

  const requiresCampaignSignal = Boolean(
    extractCampaignCoreThemeTerms(rule).length ||
      extractCampaignAnchorTerms(rule).length ||
      extractExplicitCampaignMatchTerms(rule).length
  );

  return dedupeWebsiteItemsByUrlTitleAndImage(items)
    .filter(isValidCarouselProduct)
    .map((item) => {
      const campaignFitScore = scoreCampaignFitForRule(item, rule);
      const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
      const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
      const anchorMatches = countCampaignAnchorTermMatches(item, rule);
      const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
      const aiCampaignFitScore = getAiCampaignFitScore(item);
      const hasDirectCampaignSignal = hasRequiredDirectCampaignSignal({
        rule,
        themeMatches,
        sourceThemeMatches,
        anchorMatches,
        primaryMatches,
      });
      const hasAiCampaignApproval =
        aiCampaignFitScore !== null &&
        aiCampaignFitScore >= Math.max(minimumScore, CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE);
      const { wasUsedRecently, imageUsedThisRun } = getCampaignCandidateUsageState(
        item,
        recentUsedItems,
        sourceUrl,
        usedWebsiteImageUrlsThisRun
      );
      const usageCount = Number(item?.times_used || 0);
      const lastUsedAtTs = item?.last_used_at ? Date.parse(item.last_used_at) : 0;
      const selectionPriority = Number(item?.selection_priority || 0);
      const score = campaignFitScore + Math.min(selectionPriority / 10, 30);

      return {
        ...item,
        campaign_fit_score: campaignFitScore,
        campaign_selection_score: score,
        campaign_product_tier: getCampaignProductTier(campaignFitScore),
        campaign_theme_term_matches: themeMatches,
        campaign_source_theme_matches: sourceThemeMatches,
        campaign_anchor_term_matches: anchorMatches,
        primary_campaign_term_matches: primaryMatches,
        campaign_has_direct_signal: hasDirectCampaignSignal,
        campaign_has_meaningful_signal: requiresCampaignSignal
          ? hasDirectCampaignSignal
          : hasDirectCampaignSignal || hasAiCampaignApproval,
        campaign_was_used_recently: wasUsedRecently,
        campaign_image_used_this_run: imageUsedThisRun,
        campaign_rotation_state:
          wasUsedRecently || imageUsedThisRun ? "reused" : "fresh",
        times_used: usageCount,
        last_used_at: item?.last_used_at || null,
        _campaignSort: {
          score,
          campaignFitScore,
          themeMatches,
          sourceThemeMatches,
          anchorMatches,
          primaryMatches,
          wasUsedRecently,
          imageUsedThisRun,
          usageCount,
          lastUsedAtTs,
          selectionPriority,
        },
      };
    })
    .filter((item) => (
      Number(item.campaign_fit_score || 0) >=
      Math.max(minimumScore, CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE) &&
      (!requiresCampaignSignal || item.campaign_has_meaningful_signal)
    ))
    .sort(compareCampaignScoredCandidates);
}

function compareCampaignScoredCandidates(a, b) {
  const aSort = a?._campaignSort || {};
  const bSort = b?._campaignSort || {};

  const scoreDelta = Number(bSort.campaignFitScore || b?.campaign_fit_score || 0) - Number(aSort.campaignFitScore || a?.campaign_fit_score || 0);
  if (scoreDelta !== 0) return scoreDelta;

  const themeDelta = Number(bSort.themeMatches || 0) - Number(aSort.themeMatches || 0);
  if (themeDelta !== 0) return themeDelta;

  const sourceThemeDelta = Number(bSort.sourceThemeMatches || 0) - Number(aSort.sourceThemeMatches || 0);
  if (sourceThemeDelta !== 0) return sourceThemeDelta;

  const anchorDelta = Number(bSort.anchorMatches || 0) - Number(aSort.anchorMatches || 0);
  if (anchorDelta !== 0) return anchorDelta;

  const primaryDelta = Number(bSort.primaryMatches || 0) - Number(aSort.primaryMatches || 0);
  if (primaryDelta !== 0) return primaryDelta;

  const selectionDelta = Number(bSort.selectionPriority || 0) - Number(aSort.selectionPriority || 0);
  if (selectionDelta !== 0) return selectionDelta;

  const usageDelta = Number(aSort.usageCount || 0) - Number(bSort.usageCount || 0);
  if (usageDelta !== 0) return usageDelta;

  const lastUsedDelta = Number(aSort.lastUsedAtTs || 0) - Number(bSort.lastUsedAtTs || 0);
  if (lastUsedDelta !== 0) return lastUsedDelta;

  return String(a?.title || "").localeCompare(String(b?.title || ""));
}

function selectCampaignCarouselProductsByScoreTiers({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  limit = CAROUSEL_PRODUCT_SLIDE_TARGET,
  allowUsedAfterExhausted = false,
  minimumScore = CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
}) {
  const candidates = buildCampaignScoredProductCandidates({
    items,
    rule,
    sourceUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
    minimumScore,
  });

  const freshCandidates = candidates.filter((candidate) => {
    const state = candidate?._campaignSort || {};
    return !state.wasUsedRecently && !state.imageUsedThisRun;
  });
  const reusableCandidates = candidates.filter((candidate) => {
    const state = candidate?._campaignSort || {};
    return Boolean(state.wasUsedRecently || state.imageUsedThisRun);
  });
  const selected = [];

  function alreadySelected(candidate) {
    return selected.some((selectedItem) => areSameWebsiteItem(selectedItem, candidate, sourceUrl));
  }

  function addCandidates(candidatePool) {
    for (const candidate of candidatePool) {
      if (selected.length >= limit) break;
      if (alreadySelected(candidate)) continue;
      selected.push(candidate);
    }
  }

  // Campaign carousels must rotate through fresh matching products before
  // reusing old winners. Reuse is only a delivery fallback after every fresh
  // candidate in the current campaign universe has been considered.
  addCandidates(freshCandidates);
  if (allowUsedAfterExhausted) {
    addCandidates(reusableCandidates);
  }

  return selected.slice(0, limit).map(({ _campaignSort, ...item }) => item);
}


function selectCampaignCarouselProductsByDeliveryLadder({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  existingProducts = [],
  limit = CAROUSEL_PRODUCT_SLIDE_TARGET,
  allowUsedAfterExhausted = false,
}) {
  const selected = [];
  const requiresCampaignSignal = Boolean(
    extractCampaignCoreThemeTerms(rule).length ||
      extractCampaignAnchorTerms(rule).length ||
      extractExplicitCampaignMatchTerms(rule).length
  );

  function addProduct(item) {
    if (!isValidCarouselProduct(item)) {
      return false;
    }

    if (
      requiresCampaignSignal &&
      !hasRequiredDirectCampaignSignal({
        rule,
        themeMatches: countCampaignCoreThemeTermMatches(item, rule),
        sourceThemeMatches: countCampaignSourceThemeMatches(item, rule),
        anchorMatches: countCampaignAnchorTermMatches(item, rule),
        primaryMatches: countPrimaryCampaignTermMatches(item, rule),
      })
    ) {
      return false;
    }

    if (selected.some((selectedItem) => areSameWebsiteItem(selectedItem, item, sourceUrl))) {
      return false;
    }

    selected.push(item);
    return true;
  }

  for (const product of existingProducts || []) {
    if (selected.length >= limit) break;
    if (
      allowUsedAfterExhausted ||
      isFreshCampaignCandidate(product, recentUsedItems, sourceUrl, usedWebsiteImageUrlsThisRun)
    ) {
      addProduct(annotateCampaignReuseState(product, recentUsedItems, sourceUrl, usedWebsiteImageUrlsThisRun));
    }
  }

  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }

  const candidates = dedupeWebsiteItemsByUrlTitleAndImage(items)
    .filter(isValidCarouselProduct)
    .map((item) => {
      const campaignFitScore = scoreCampaignFitForRule(item, rule);
      const productScore = scoreWebsiteItemForRule(item, rule);
      const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
      const anchorMatches = countCampaignAnchorTermMatches(item, rule);
      const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
      const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
      const aiCampaignFitScore = getAiCampaignFitScore(item);
      const hasDirectCampaignSignal = hasRequiredDirectCampaignSignal({
        rule,
        themeMatches,
        sourceThemeMatches,
        anchorMatches,
        primaryMatches,
      });
      const hasAiCampaignApproval =
        aiCampaignFitScore !== null &&
        aiCampaignFitScore >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE;
      const { wasUsedRecently, imageUsedThisRun } = getCampaignCandidateUsageState(
        item,
        recentUsedItems,
        sourceUrl,
        usedWebsiteImageUrlsThisRun
      );
      const usageCount = Number(item?.times_used || 0);
      const lastUsedAtTs = item?.last_used_at ? Date.parse(item.last_used_at) : 0;
      const selectionPriority = Number(item?.selection_priority || 0);

      return {
        ...item,
        campaign_fit_score: Math.max(Number(item.campaign_fit_score || 0), campaignFitScore),
        campaign_product_tier: getCampaignProductTier(campaignFitScore),
        campaign_was_used_recently: wasUsedRecently,
        campaign_image_used_this_run: imageUsedThisRun,
        campaign_rotation_state:
          wasUsedRecently || imageUsedThisRun ? "reused" : "fresh",
        _deliverySort: {
          campaignFitScore,
          productScore,
          primaryMatches,
          anchorMatches,
          themeMatches,
          sourceThemeMatches,
          hasDirectCampaignSignal,
          hasMeaningfulCampaignSignal: requiresCampaignSignal
            ? hasDirectCampaignSignal
            : hasDirectCampaignSignal || hasAiCampaignApproval,
          wasUsedRecently,
          imageUsedThisRun,
          usageCount,
          lastUsedAtTs,
          selectionPriority,
        },
      };
    })
    .filter((candidate) => {
      const sort = candidate?._deliverySort || {};

      if (Number(sort.campaignFitScore || 0) < CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE) {
        return false;
      }

      if (!allowUsedAfterExhausted && Boolean(sort.wasUsedRecently || sort.imageUsedThisRun)) {
        return false;
      }

      return !requiresCampaignSignal || Boolean(sort.hasMeaningfulCampaignSignal);
    })
    .sort((a, b) => {
      const aSort = a?._deliverySort || {};
      const bSort = b?._deliverySort || {};

      // Freshness first: campaign carousels should rotate through every fresh
      // relevant product before reusing old winners. Relevance only sorts
      // within the fresh and reuse buckets.
      const aUsed = Boolean(aSort.wasUsedRecently || aSort.imageUsedThisRun);
      const bUsed = Boolean(bSort.wasUsedRecently || bSort.imageUsedThisRun);
      if (aUsed !== bUsed) return aUsed ? 1 : -1;

      const campaignDelta = Number(bSort.campaignFitScore || 0) - Number(aSort.campaignFitScore || 0);
      if (campaignDelta !== 0) return campaignDelta;

      const themeDelta = Number(bSort.themeMatches || 0) - Number(aSort.themeMatches || 0);
      if (themeDelta !== 0) return themeDelta;

      const sourceThemeDelta = Number(bSort.sourceThemeMatches || 0) - Number(aSort.sourceThemeMatches || 0);
      if (sourceThemeDelta !== 0) return sourceThemeDelta;

      const anchorDelta = Number(bSort.anchorMatches || 0) - Number(aSort.anchorMatches || 0);
      if (anchorDelta !== 0) return anchorDelta;

      const primaryDelta = Number(bSort.primaryMatches || 0) - Number(aSort.primaryMatches || 0);
      if (primaryDelta !== 0) return primaryDelta;

      const productDelta = Number(bSort.productScore || 0) - Number(aSort.productScore || 0);
      if (productDelta !== 0) return productDelta;

      const selectionDelta = Number(bSort.selectionPriority || 0) - Number(aSort.selectionPriority || 0);
      if (selectionDelta !== 0) return selectionDelta;

      const usageDelta = Number(aSort.usageCount || 0) - Number(bSort.usageCount || 0);
      if (usageDelta !== 0) return usageDelta;

      const lastUsedDelta = Number(aSort.lastUsedAtTs || 0) - Number(bSort.lastUsedAtTs || 0);
      if (lastUsedDelta !== 0) return lastUsedDelta;

      return String(a?.title || "").localeCompare(String(b?.title || ""));
    });

  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    addProduct(candidate);
  }

  return selected
    .slice(0, limit)
    .map(({ _deliverySort, ...item }) => item);
}

function countFreshCampaignCarouselCandidates({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  minimumScore = CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
}) {
  return buildCampaignScoredProductCandidates({
    items,
    rule,
    sourceUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
    minimumScore,
  }).filter((candidate) => {
    const state = candidate?._campaignSort || {};
    return !state.wasUsedRecently && !state.imageUsedThisRun;
  }).length;
}

function hasEnoughCarouselProductsForRule(products, rule) {
  return (products || []).filter(isValidCarouselProduct).length >= CAROUSEL_MIN_PRODUCT_SLIDES;
}

function selectFinalBroadVerifiedCarouselProducts({
  items,
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  existingProducts = [],
  limit = CAROUSEL_PRODUCT_SLIDE_TARGET,
  allowUsedAfterExhausted = false,
}) {
  const isCampaignRule = isCampaignScopedWebsiteRule(rule);
  const existing = dedupeWebsiteItemsByUrlTitleAndImage(existingProducts).filter(isValidCarouselProduct);
  const existingKeys = new Set(existing.map(createItemKey));
  const recentUsedKeys = new Set((recentUsedItems || []).map((item) => createItemKey({
    title: item.item_title || item.title,
    url: item.item_url || item.url || item.product_url,
    image_url: item.image_url || item.item_image_url,
  })));

  const candidates = dedupeWebsiteItemsByUrlTitleAndImage(items)
    .filter(isValidCarouselProduct)
    .filter((item) => !existingKeys.has(createItemKey(item)))
    .map((item) => {
      const itemKey = createItemKey(item);
      const imageUsedThisRun = usedWebsiteImageUrlsThisRun.has(normalizeComparableValue(item.image_url));
      const usedRecently = recentUsedKeys.has(itemKey) || hasWebsiteItemCatalogUsage(item);
      const confidence = getCarouselProductConfidence(item);
      const campaignFit = scoreCampaignFitForRule(item, rule);
      const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
      const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
      const anchorMatches = countCampaignAnchorTermMatches(item, rule);
      const primaryMatches = countPrimaryCampaignTermMatches(item, rule);

      return {
        ...item,
        campaign_fit_score: Math.max(Number(item.campaign_fit_score || 0), campaignFit),
        campaign_fit_source: item.campaign_fit_source || "final_broad_verified_fallback",
        product_confidence: Math.max(Number(item.product_confidence || 0), confidence),
        _finalBroadSort: {
          confidence,
           campaignFit,
           themeMatches,
           sourceThemeMatches,
           anchorMatches,
          primaryMatches,
          imageUsedThisRun,
          usedRecently,
          selectionPriority: Number(item.selection_priority || 0),
          usageCount: Number(item.times_used || 0),
        },
      };
    })
    .filter((item) => Number(item._finalBroadSort.confidence || 0) >= CAROUSEL_FINAL_BROAD_FALLBACK_MIN_CONFIDENCE)
    .filter((item) => {
      const sort = item?._finalBroadSort || {};

      if (isCampaignRule && Number(sort.campaignFit || 0) < CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE) {
        return false;
      }

      if (
        isCampaignRule &&
        extractCampaignCoreThemeTerms(rule).length > 0 &&
        !hasRequiredDirectCampaignSignal({
          rule,
          themeMatches: sort.themeMatches,
          sourceThemeMatches: sort.sourceThemeMatches,
          anchorMatches: sort.anchorMatches,
          primaryMatches: sort.primaryMatches,
        })
      ) {
        return false;
      }

      if (!allowUsedAfterExhausted && Boolean(sort.usedRecently || sort.imageUsedThisRun)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aSort = a._finalBroadSort || {};
      const bSort = b._finalBroadSort || {};

      if (Boolean(aSort.imageUsedThisRun) !== Boolean(bSort.imageUsedThisRun)) {
        return aSort.imageUsedThisRun ? 1 : -1;
      }

      if (Boolean(aSort.usedRecently) !== Boolean(bSort.usedRecently)) {
        return aSort.usedRecently ? 1 : -1;
      }

      const fitDelta = Number(bSort.campaignFit || 0) - Number(aSort.campaignFit || 0);
      if (fitDelta !== 0) return fitDelta;

      const confidenceDelta = Number(bSort.confidence || 0) - Number(aSort.confidence || 0);
      if (confidenceDelta !== 0) return confidenceDelta;

      const priorityDelta = Number(bSort.selectionPriority || 0) - Number(aSort.selectionPriority || 0);
      if (priorityDelta !== 0) return priorityDelta;

      const usageDelta = Number(aSort.usageCount || 0) - Number(bSort.usageCount || 0);
      if (usageDelta !== 0) return usageDelta;

      return String(a.title || "").localeCompare(String(b.title || ""));
    });

  const annotatedCandidates = candidates.map((item) => ({
    ...item,
    campaign_was_used_recently: Boolean(item?._finalBroadSort?.usedRecently),
    campaign_image_used_this_run: Boolean(item?._finalBroadSort?.imageUsedThisRun),
    campaign_rotation_state:
      item?._finalBroadSort?.usedRecently || item?._finalBroadSort?.imageUsedThisRun
        ? "reused"
        : "fresh",
  }));

  const merged = mergeCarouselProductSelections(existing, annotatedCandidates, sourceUrl);

  return merged.slice(0, limit).map(({ _finalBroadSort, ...item }) => item);
}

async function prepareCarouselProductsForRule({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  rule = await ensureProductSearchQueriesForRule({ supabase, rule });

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

  if (isCampaignRule) {
    const campaignCachedItems = await getCampaignProductCandidateItems({
      supabase,
      brandProfileId: rule.brand_profile_id,
      themeKey: getCampaignThemeKey(rule),
      limit: 200,
    });
    const brandWideCatalogItems = filterWebsiteCatalogItemsForRule(
      await getWebsiteProductCatalogItems({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: "",
        limit: WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT,
      }),
      rule
    );
    const campaignTermCatalogItems = await getWebsiteProductCatalogItemsByCampaignTerms({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      terms: extractPrimaryCampaignTerms(rule),
    });

    if (campaignTermCatalogItems.length || brandWideCatalogItems.length) {
      catalogItems = dedupeWebsiteItemsByUrlTitleAndImage([
        ...campaignCachedItems.map((item) => ({
          ...item,
          selection_priority: Math.max(Number(item.selection_priority || 0), 220),
          campaign_fit_source: item.campaign_fit_source || "campaign_candidate_cache",
        })),
        ...campaignTermCatalogItems.map((item) => ({
          ...item,
          selection_priority: Math.max(Number(item.selection_priority || 0), 180),
          campaign_fit_source: item.campaign_fit_source || "campaign_catalog_term_match",
          campaign_fit_score: Math.max(
            Number(item.campaign_fit_score || 0),
            85 + Math.min(countPrimaryCampaignTermMatches(item, rule) * 5, 10)
          ),
        })),
        ...catalogItems,
        ...brandWideCatalogItems.map((item) => ({
          ...item,
          selection_priority: Number(item.selection_priority || 0) || 5,
          campaign_fit_source: item.campaign_fit_source || item.discovery_source || "brand_catalog_fallback",
          campaign_fit_score: Number(item.campaign_fit_score || 0) || scoreCampaignFitForRule(item, rule),
        })),
      ]);
    } else if (campaignCachedItems.length) {
      catalogItems = dedupeWebsiteItemsByUrlTitleAndImage([
        ...campaignCachedItems,
        ...catalogItems,
      ]);
    }
  }

  let triedStoreSearchForCampaign = false;
  let lockedCampaignSearchPoolItems = [];
  let hasLockedCampaignSearchPool = false;
  let campaignFreshDiscoveryAttempts = 0;

  async function buildLockedCampaignSearchPool({
    selectionPriority = 75,
    scoreBonus = 0,
  } = {}) {
    triedStoreSearchForCampaign = true;
    if (isCampaignRule) {
      campaignFreshDiscoveryAttempts += 1;
    }

    try {
      const storeSearchCandidates = await discoverProductCandidatesFromStoreSearch({
        websiteUrl,
        campaignPrompt: buildCampaignResearchText(rule),
        usedItems: recentUsedItems,
        excludeUsed: true,
      });

      if (!storeSearchCandidates.length) {
        return false;
      }

      const storeSearchItems = await verifyDiscoveredWebsiteProductCandidates({
        candidates: storeSearchCandidates,
        websiteUrl,
        limit: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
      });

      const storeSearchPoolItems = buildCampaignSearchPoolItems({
        candidates: storeSearchCandidates,
        verifiedItems: storeSearchItems,
        websiteUrl,
        rule,
        selectionPriority: Math.max(selectionPriority, 180),
        scoreBonus,
      });

      if (!storeSearchPoolItems.length) {
        return false;
      }

      catalogItems = dedupeWebsiteItemsByUrlTitleAndImage([
        ...storeSearchPoolItems.map((item) => {
          const campaignFitScore = scoreCampaignFitForRule(item, rule);
          const primaryMatchCount = countPrimaryCampaignTermMatches(item, rule);
          const safeSelectionPriority = primaryMatchCount > 0
            ? Math.max(selectionPriority, 220)
            : Math.max(selectionPriority, 180);

          return {
            ...item,
            selection_priority: Math.max(Number(item.selection_priority || 0), safeSelectionPriority),
            campaign_fit_source: item.campaign_fit_source || "campaign_search_pool",
            campaign_fit_score: Math.max(
              Number(item.campaign_fit_score || 0),
              campaignFitScore + scoreBonus
            ),
          };
        }),
        ...catalogItems.map((item) => ({
          ...item,
          selection_priority: Number(item.selection_priority || 0) || 10,
        })),
      ]);

      const safeStoreSearchPoolItems = getSafeCampaignProductCandidates(storeSearchPoolItems, rule);
      const freshSafeStoreSearchPoolItems = getFreshCarouselProductCandidates({
        items: safeStoreSearchPoolItems,
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
      });

      // Lock only a fresh campaign pool. Already-used store-search matches stay
      // available later as delivery fallback, but must not steer the first pick.
      if (freshSafeStoreSearchPoolItems.length >= CAMPAIGN_LOCKED_SEARCH_POOL_MIN_ITEMS) {
        lockedCampaignSearchPoolItems = freshSafeStoreSearchPoolItems;
        hasLockedCampaignSearchPool = true;
      }

      console.log("Campaign carousel products collected from store search before catalog selection", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        storeSearchCandidateCount: storeSearchCandidates.length,
        storeSearchItemCount: storeSearchItems.length,
        storeSearchPoolCount: storeSearchPoolItems.length,
        safeStoreSearchPoolCount: safeStoreSearchPoolItems.length,
        freshSafeStoreSearchPoolCount: freshSafeStoreSearchPoolItems.length,
        lockedSearchPool: hasLockedCampaignSearchPool,
      });

      return true;
    } catch (error) {
      console.log("Store search preselection failed for campaign carousel", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        message: error.message,
      });

      return false;
    }
  }

  if (isCampaignRule) {
    await buildLockedCampaignSearchPool();
  }

  const getCampaignSelectionItems = () => {
    if (!isCampaignRule) {
      return catalogItems;
    }

    if (hasLockedCampaignSearchPool) {
      const freshSafeCatalogItems = getFreshCarouselProductCandidates({
        items: getSafeCampaignProductCandidates(catalogItems, rule),
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
      });

      return dedupeWebsiteItemsByUrlTitleAndImage([
        ...lockedCampaignSearchPoolItems,
        ...freshSafeCatalogItems,
      ]);
    }

    return getSafeCampaignProductCandidates(catalogItems, rule);
  };

  let selectedProducts = selectCarouselProductsFromPool({
    items: getCampaignSelectionItems(),
    rule,
    sourceUrl: websiteUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
    allowReuseWhenExhausted: false,
  });

  if (isCampaignRule && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET && catalogItems.length) {
    const freshCampaignFallbackProducts = getFreshCarouselProductCandidates({
      items: getCampaignSelectionItems(),
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
    });
    const filledFreshCampaignProducts = fillCampaignProductSelection(
      selectedProducts,
      freshCampaignFallbackProducts,
      rule,
      websiteUrl
    );

    if (filledFreshCampaignProducts.length > selectedProducts.length) {
      selectedProducts = filledFreshCampaignProducts.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
    }
  }

  if (!hasLockedCampaignSearchPool && !hasEnoughCarouselProductsForRule(selectedProducts, rule) && !triedStoreSearchForCampaign) {
    try {
      if (isCampaignRule) {
        campaignFreshDiscoveryAttempts += 1;
      }
      const storeSearchCandidates = await discoverProductCandidatesFromStoreSearch({
        websiteUrl,
        campaignPrompt: buildCampaignResearchText(rule),
        usedItems: recentUsedItems,
      });

      if (storeSearchCandidates.length) {
        const storeSearchItems = await verifyDiscoveredWebsiteProductCandidates({
          candidates: storeSearchCandidates,
          websiteUrl,
          limit: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
        });

        if (storeSearchItems.length) {
          catalogItems = [
            ...catalogItems.map((item) => ({ ...item, selection_priority: Number(item.selection_priority || 0) || 10 })),
            ...storeSearchItems.map((item) => {
              const campaignFitScore = scoreCampaignFitForRule(item, rule);
              const primaryMatchCount = countPrimaryCampaignTermMatches(item, rule);

              return {
                ...item,
                selection_priority: primaryMatchCount > 0 ? 120 : 65,
                campaign_fit_source: item.campaign_fit_source || "store_search",
                campaign_fit_score: Math.max(Number(item.campaign_fit_score || 0), campaignFitScore),
              };
            }),
          ];

          selectedProducts = selectCarouselProductsFromPool({
            items: getCampaignSelectionItems(),
            rule,
            sourceUrl: websiteUrl,
            recentUsedItems,
            usedWebsiteImageUrlsThisRun,
            allowReuseWhenExhausted: false,
          });

          if (isCampaignRule && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
            const freshCampaignFallbackProducts = getFreshCarouselProductCandidates({
              items: getCampaignSelectionItems(),
              rule,
              sourceUrl: websiteUrl,
              recentUsedItems,
              usedWebsiteImageUrlsThisRun,
            });
            const filledFreshCampaignProducts = fillCampaignProductSelection(
              selectedProducts,
              freshCampaignFallbackProducts,
              rule,
              websiteUrl
            );

            if (filledFreshCampaignProducts.length > selectedProducts.length) {
              selectedProducts = filledFreshCampaignProducts.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
            }
          }

          if (hasEnoughCarouselProductsForRule(selectedProducts, rule)) {
            console.log("Carousel products found from store search", {
              ruleId: rule.id,
              brandProfileId: rule.brand_profile_id,
              websiteUrl,
              storeSearchCandidateCount: storeSearchCandidates.length,
              storeSearchItemCount: storeSearchItems.length,
              selectedCount: selectedProducts.length,
            });
          }
        }
      }
    } catch (storeSearchError) {
      console.log("Store search product discovery failed", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        message: storeSearchError.message,
      });
    }
  }

  if (
    (!hasLockedCampaignSearchPool && !hasEnoughCarouselProductsForRule(selectedProducts, rule)) ||
    (isCampaignRule && hasLockedCampaignSearchPool && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET)
  ) {
    try {
      if (isCampaignRule) {
        campaignFreshDiscoveryAttempts += 1;
      }
      const discoveredCandidates = await discoverProductCandidatesFromWebsite({
        websiteUrl,
        campaignPrompt: buildCampaignResearchText(rule),
        rule,
        usedItems: recentUsedItems,
        fastCampaignContinuation: isCampaignRule && hasLockedCampaignSearchPool,
      });

      if (discoveredCandidates.length) {
        const discoveredItems = await verifyDiscoveredWebsiteProductCandidates({
          candidates: discoveredCandidates,
          websiteUrl,
          limit: CAROUSEL_DISCOVERY_VERIFY_LIMIT,
        });

        const enrichedDiscoveredItems = discoveredItems.map((item) => ({
          ...item,
          selection_priority: 90,
          campaign_fit_source: item.campaign_fit_source || "campaign_discovery",
          campaign_fit_score: scoreCampaignFitForRule(item, rule),
        }));

        if (isCampaignRule) {
          await upsertCampaignProductCandidateItems({
            supabase,
            rule,
            sourceUrl: websiteUrl,
            items: enrichedDiscoveredItems,
          });
        }

        catalogItems = [
          ...catalogItems.map((item) => ({ ...item, selection_priority: Number(item.selection_priority || 0) || 10 })),
          ...enrichedDiscoveredItems,
        ];

        if (isCampaignRule && hasLockedCampaignSearchPool && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
          const safeDiscoveredCampaignItems = getSafeCampaignProductCandidates(enrichedDiscoveredItems, rule)
            .map((item) => ({
              ...item,
              selection_priority: Math.max(Number(item.selection_priority || 0), 230),
              campaign_fit_source: item.campaign_fit_source || "campaign_continued_discovery",
              campaign_fit_score: Math.max(Number(item.campaign_fit_score || 0), scoreCampaignFitForRule(item, rule) + 20),
            }));

          if (safeDiscoveredCampaignItems.length) {
            lockedCampaignSearchPoolItems = dedupeWebsiteItemsByUrlTitleAndImage([
              ...lockedCampaignSearchPoolItems,
              ...safeDiscoveredCampaignItems,
            ]);

            console.log("Campaign locked search pool extended from continued discovery", {
              ruleId: rule.id,
              brandProfileId: rule.brand_profile_id,
              websiteUrl,
              previousSelectedCount: selectedProducts.length,
              addedSafeCount: safeDiscoveredCampaignItems.length,
              lockedPoolCount: lockedCampaignSearchPoolItems.length,
            });
          }
        }

        selectedProducts = selectCarouselProductsFromPool({
          items: getCampaignSelectionItems(),
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

  if (isCampaignRule && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET && catalogItems.length) {
    const freshCampaignFallbackProducts = getFreshCarouselProductCandidates({
      items: getCampaignSelectionItems(),
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
    });
    const filledFreshCampaignProducts = fillCampaignProductSelection(
      selectedProducts,
      freshCampaignFallbackProducts,
      rule,
      websiteUrl
    );

    if (filledFreshCampaignProducts.length > selectedProducts.length) {
      selectedProducts = filledFreshCampaignProducts.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
    }
  }

  if (
    !hasEnoughCarouselProductsForRule(selectedProducts, rule) &&
    !hasLockedCampaignSearchPool &&
    isCampaignRule &&
    catalogItems.length &&
    extractCampaignAnchorTerms(rule).length === 0 &&
    getSupportingCampaignFitItems(selectedProducts, rule).length < CAROUSEL_MIN_PRODUCT_SLIDES
  ) {
    catalogItems = await applyAiCampaignFitScores({
      openai,
      rule,
      brandProfile,
      items: catalogItems,
      maxItems: CAROUSEL_AI_SCORE_MAX_ITEMS,
      model: PRODUCT_RESEARCH_FAST_MODEL,
      escalateWhenUncertain: false,
    });

    selectedProducts = selectCarouselProductsFromPool({
      items: getCampaignSelectionItems(),
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      allowReuseWhenExhausted: false,
    });

    if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const freshCampaignFallbackProducts = getFreshCarouselProductCandidates({
        items: getCampaignSelectionItems(),
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
      });
      const filledFreshCampaignProducts = fillCampaignProductSelection(
        selectedProducts,
        freshCampaignFallbackProducts,
        rule,
        websiteUrl
      );

      if (filledFreshCampaignProducts.length > selectedProducts.length) {
        selectedProducts = filledFreshCampaignProducts.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
      }
    }
  }

  const verifiedStrongCampaignSelectionCount = isCampaignRule
    ? selectedProducts.filter((item) => isEligibleCampaignCarouselProduct(item, rule)).length
    : selectedProducts.filter(isValidCarouselProduct).length;
  const shouldRunCarouselWebSearch = isCampaignRule
    ? verifiedStrongCampaignSelectionCount < CAROUSEL_PRODUCT_SLIDE_TARGET
    : !hasEnoughCarouselProductsForRule(selectedProducts, rule);

  if (shouldRunCarouselWebSearch) {
    try {
      if (isCampaignRule) {
        campaignFreshDiscoveryAttempts += 1;
      }
      const webSearchItems = await findWebsiteProductWithWebSearch({
        openai,
        brandProfile,
        rule,
        websiteUrl,
        usedWebsiteItems: recentUsedItems,
      });

      if (Array.isArray(webSearchItems) && webSearchItems.length) {
        const enrichedWebSearchItems = webSearchItems.map((item) => ({
          ...item,
          selection_priority: 100,
          campaign_fit_source: "ai_campaign_research",
          campaign_fit_score: scoreCampaignFitForRule(item, rule) + 40,
        }));

        if (isCampaignRule) {
          await upsertCampaignProductCandidateItems({
            supabase,
            rule,
            sourceUrl: websiteUrl,
            items: enrichedWebSearchItems,
          });
        }

        catalogItems = [
          ...catalogItems.map((item) => ({ ...item, selection_priority: Number(item.selection_priority || 0) || 10 })),
          ...enrichedWebSearchItems,
        ];

        selectedProducts = selectCarouselProductsFromPool({
          items: getCampaignSelectionItems(),
          rule,
          sourceUrl: websiteUrl,
          recentUsedItems,
          usedWebsiteImageUrlsThisRun,
          allowReuseWhenExhausted: false,
        });

        if (hasEnoughCarouselProductsForRule(selectedProducts, rule)) {
          summary.website_web_search_success += 1;
        } else {
          console.log("Carousel web search found products, but not enough strong campaign product images yet", {
            ruleId: rule.id,
            brandProfileId: rule.brand_profile_id,
            websiteUrl,
            webSearchCount: webSearchItems.length,
            selectedCount: selectedProducts.length,
            strongSelectedCount: isCampaignRule ? getStrongCampaignFitItems(selectedProducts, rule).length : selectedProducts.length,
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
    const recentUsedCampaignDeliveryItems = buildRecentUsedCampaignDeliveryItems(
      recentUsedItems,
      rule,
      websiteUrl
    );
    const campaignCandidateUniverse = dedupeWebsiteItemsByUrlTitleAndImage([
      ...selectedProducts,
      ...lockedCampaignSearchPoolItems,
      ...getCampaignSelectionItems(),
      ...getStrictCampaignFallbackProducts(catalogItems, rule),
      ...recentUsedCampaignDeliveryItems,
    ]);

    const freshCandidateCount = countFreshCampaignCarouselCandidates({
      items: campaignCandidateUniverse,
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      minimumScore: CAMPAIGN_NEAR_PRODUCT_FIT_SCORE,
    });

    const freshSupportingCandidateCount = countFreshCampaignCarouselCandidates({
      items: campaignCandidateUniverse,
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      minimumScore: CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
    });

    selectedProducts = selectCampaignCarouselProductsByScoreTiers({
      items: campaignCandidateUniverse,
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
      allowUsedAfterExhausted: false,
      minimumScore: CAMPAIGN_NEAR_PRODUCT_FIT_SCORE,
    });

    if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const supportingProducts = selectCampaignCarouselProductsByScoreTiers({
        items: campaignCandidateUniverse,
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
        allowUsedAfterExhausted: false,
        minimumScore: CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
      });
      const mergedProducts = mergeCarouselProductSelections(
        selectedProducts,
        supportingProducts,
        websiteUrl
      );

      if (mergedProducts.length > selectedProducts.length) {
        selectedProducts = mergedProducts;
      }
    }

    const allowCampaignReuseAfterExhausted =
      selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET &&
      freshSupportingCandidateCount < CAROUSEL_PRODUCT_SLIDE_TARGET;

    if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const deliveryLadderProducts = selectCampaignCarouselProductsByDeliveryLadder({
        items: dedupeWebsiteItemsByUrlTitleAndImage([
          ...campaignCandidateUniverse,
          ...catalogItems,
        ]),
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        existingProducts: selectedProducts,
        limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
      });

      if (deliveryLadderProducts.length > selectedProducts.length) {
        const addedReusedCount = deliveryLadderProducts
          .slice(selectedProducts.length)
          .filter((item) => Boolean(item.campaign_was_used_recently || item.campaign_image_used_this_run)).length;

        if (addedReusedCount > 0) {
          cycleNumber += 1;
          summary.website_items_reused_cycle += 1;
        }

        selectedProducts = deliveryLadderProducts;
      }
    }

    if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const broadVerifiedProducts = selectFinalBroadVerifiedCarouselProducts({
        items: dedupeWebsiteItemsByUrlTitleAndImage([
          ...campaignCandidateUniverse,
          ...catalogItems,
        ]),
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        existingProducts: selectedProducts,
        limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
      });

      if (broadVerifiedProducts.length > selectedProducts.length) {
        const addedReusedCount = broadVerifiedProducts
          .slice(selectedProducts.length)
          .filter((item) => hasWebsiteItemCatalogUsage(item)).length;

        if (addedReusedCount > 0) {
          cycleNumber += 1;
          summary.website_items_reused_cycle += 1;
        }

        selectedProducts = broadVerifiedProducts;
      }
    }

    if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const freshRelevantProducts = getFreshRelevantCampaignProductCandidates({
        items: dedupeWebsiteItemsByUrlTitleAndImage([
          ...campaignCandidateUniverse,
          ...catalogItems,
        ]),
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        minimumScore: CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
      });
      const mergedProducts = mergeCarouselProductSelections(
        selectedProducts,
        freshRelevantProducts,
        websiteUrl
      );

      if (mergedProducts.length > selectedProducts.length) {
        selectedProducts = mergedProducts;
      }
    }

    if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const finalDeliveryProducts = selectCampaignCarouselProductsByDeliveryLadder({
        items: dedupeWebsiteItemsByUrlTitleAndImage([
          ...campaignCandidateUniverse,
          ...catalogItems,
        ]),
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        existingProducts: selectedProducts,
        limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
        allowUsedAfterExhausted: true,
      });

      if (finalDeliveryProducts.length > selectedProducts.length) {
        const addedReusedCount = finalDeliveryProducts
          .slice(selectedProducts.length)
          .filter((item) => Boolean(item.campaign_was_used_recently || item.campaign_image_used_this_run)).length;

        if (addedReusedCount > 0) {
          cycleNumber += 1;
          summary.website_items_reused_cycle += 1;
        }

        selectedProducts = finalDeliveryProducts;
      }
    }

    if (selectedProducts.length >= CAROUSEL_PRODUCT_SLIDE_TARGET) {
      console.log("Campaign carousel selected five products with relevance-first delivery ladder", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        selectedCount: selectedProducts.length,
        freshCandidateCount,
        freshSupportingCandidateCount,
        discoveryAttempts: campaignFreshDiscoveryAttempts,
        strongCount: selectedProducts.filter((item) => Number(item.campaign_fit_score || 0) >= 90).length,
        nearCount: selectedProducts.filter((item) => Number(item.campaign_fit_score || 0) >= CAMPAIGN_NEAR_PRODUCT_FIT_SCORE && Number(item.campaign_fit_score || 0) < 90).length,
        fallbackCount: selectedProducts.filter((item) => Number(item.campaign_fit_score || 0) >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE && Number(item.campaign_fit_score || 0) < CAMPAIGN_NEAR_PRODUCT_FIT_SCORE).length,
        broadFallbackCount: selectedProducts.filter((item) => Number(item.campaign_fit_score || 0) < CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE).length,
        lowestCampaignFitScore: Math.min(...selectedProducts.map((item) => Number(item.campaign_fit_score || 0))),
        reusedCount: selectedProducts.filter((item) => Boolean(item.campaign_was_used_recently || item.campaign_image_used_this_run)).length,
        reuseAfterExhausted: allowCampaignReuseAfterExhausted,
        lockedSearchPool: hasLockedCampaignSearchPool,
      });
    } else {
      console.warn("Campaign carousel could not find five products above the minimum campaign score", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        selectedCount: selectedProducts.length,
        freshCandidateCount,
        freshSupportingCandidateCount,
        discoveryAttempts: campaignFreshDiscoveryAttempts,
        minimumScore: CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE,
        lockedSearchPool: hasLockedCampaignSearchPool,
      });
    }
  }

  if (!isCampaignRule && selectedProducts.length < CAROUSEL_MIN_PRODUCT_SLIDES) {
    const reusableProducts = selectCarouselProductsFromPool({
      items: catalogItems,
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      allowReuseWhenExhausted: true,
    });
    const mergedProducts = mergeCarouselProductSelections(
      selectedProducts,
      reusableProducts,
      websiteUrl
    );

    if (mergedProducts.length > selectedProducts.length) {
      cycleNumber += 1;
      summary.website_items_reused_cycle += 1;
      selectedProducts = mergedProducts;
    }
  }

  if (!isCampaignRule && !selectedProducts.length) {
    const fallbackPool = dedupeWebsiteItemsByUrlTitleAndImage(catalogItems);
    selectedProducts = fallbackPool.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  }

  if (isCampaignRule) {
    selectedProducts = selectBestAvailableCampaignCarouselProducts({
      items: [
        ...selectedProducts,
        ...lockedCampaignSearchPoolItems,
        ...getCampaignSelectionItems(),
        ...catalogItems,
      ],
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
    });
  } else {
    selectedProducts = dedupeWebsiteItemsByUrlTitleAndImage(selectedProducts)
      .filter(isValidCarouselProduct)
      .slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  }

  // A carousel is a delivery promise. If a very small verified catalog has
  // fewer than five unique products, repeat its best verified products rather
  // than failing the entire scheduled post. This is only reached after every
  // available verified product has been considered.
  if (selectedProducts.length > 0 && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
    const bestAvailableProducts = [...selectedProducts];
    let repeatIndex = 0;

    while (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      const repeatedProduct = bestAvailableProducts[repeatIndex % bestAvailableProducts.length];
      selectedProducts.push({
        ...repeatedProduct,
        carousel_repeat_index: repeatIndex + 1,
        campaign_rotation_state: "catalog_exhausted_repeat",
      });
      repeatIndex += 1;
    }
  }

  if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
    throw new Error("Carousel could not find any verified website product with a usable product image.");
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

  if (isCampaignRule) {
    await upsertCampaignProductCandidateItems({
      supabase,
      rule,
      sourceUrl: websiteUrl,
      items: selectedProducts,
    });
  }

  summary.website_items_found += selectedProducts.length;
  summary.website_content_success += 1;
  summary.website_image_used += selectedProducts.length;

  return {
    websiteItems: selectedProducts,
    websiteItem: selectedProducts[0],
    websiteSourceUrl: websiteUrl,
    websiteCycleNumber: cycleNumber,
    useWebsiteImage: true,
    websiteRule: rule,
  };
}

function isStrongResolvedCampaignProduct(item, rule) {
  if (!isValidCarouselProduct(item)) return false;

  const score = scoreCampaignFitForRule(item, rule);
  const aiScore = getAiCampaignFitScore(item);
  const hasDirectSignal = hasRequiredDirectCampaignSignal({
    rule,
    themeMatches: countCampaignCoreThemeTermMatches(item, rule),
    sourceThemeMatches: countCampaignSourceThemeMatches(item, rule),
    anchorMatches: countCampaignAnchorTermMatches(item, rule),
    primaryMatches: countPrimaryCampaignTermMatches(item, rule),
  });

  return score >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE &&
    (hasDirectSignal || (aiScore !== null && aiScore >= CAMPAIGN_NEAR_PRODUCT_FIT_SCORE));
}

async function prepareCampaignCarouselProductsV10({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  rule = await ensureProductSearchQueriesForRule({ supabase, rule });
  const websiteUrl = getWebsiteProductSourceUrl(brandProfile);

  if (!websiteUrl) {
    throw new Error("Website carousel requires a website URL in Brand profile");
  }

  const themeKey = getCampaignThemeKey(rule);
  const capabilitySeedItems = getBrandCapabilityVerifiedProductCandidates(brandProfile)
    .map((item) =>
      normalizeCampaignSearchPoolItem(item, websiteUrl, rule, {
        selectionPriority: 220,
        scoreBonus: 20,
      })
    )
    .filter(Boolean)
    .filter(isValidCarouselProduct);

  const recentUsedItems = await getRecentUsedWebsiteItems({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType: rule.content_type_id || "carousel_website_item",
    limit: WEBSITE_PRODUCT_REUSE_LIMIT,
  });
  const [cachedItems, campaignCatalogItems, catalogFallbackItems, discoveryState] =
    await Promise.all([
      getCampaignProductCandidateItems({
        supabase,
        brandProfileId: rule.brand_profile_id,
        themeKey,
        limit: 200,
      }),
      getWebsiteProductCatalogItemsByCampaignTerms({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        terms: extractPrimaryCampaignTerms(rule),
        limitPerTerm: 30,
      }),
      getWebsiteProductCatalogItems({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        limit: WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT,
      }),
      getCampaignProductDiscoveryState({
        supabase,
        brandProfileId: rule.brand_profile_id,
        themeKey,
      }),
    ]);
  let candidatePool = dedupeWebsiteItemsByUrlTitleAndImage([
    ...cachedItems,
    ...campaignCatalogItems.filter(isValidCarouselProduct),
    ...catalogFallbackItems.filter(isValidCarouselProduct),
    ...capabilitySeedItems,
  ]).map((item) => ({
    ...item,
    heuristic_campaign_fit_score: scoreCampaignFitForRule({ ...item, ai_campaign_fit_score: null }, rule),
    campaign_fit_score: scoreCampaignFitForRule(item, rule),
  }));

  if (capabilitySeedItems.length) {
    await Promise.all([
      upsertWebsiteProductCatalogItems({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        items: capabilitySeedItems,
        discoverySource: getWebsiteCatalogDiscoverySource("brand_capability_verified", rule),
      }),
      upsertCampaignProductCandidateItems({
        supabase,
        rule,
        sourceUrl: websiteUrl,
        items: capabilitySeedItems,
      }),
    ]);
  }

  const getStrongFreshSelection = () => selectBestAvailableCampaignCarouselProducts({
    items: candidatePool.filter((item) => isStrongResolvedCampaignProduct(item, rule)),
    rule,
    sourceUrl: websiteUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
    limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
  });
  let strongSelection = getStrongFreshSelection();
  const hasFiveFreshStrong = strongSelection.length >= CAROUSEL_PRODUCT_SLIDE_TARGET &&
    strongSelection.every((item) => item.campaign_rotation_state === "fresh");
  const mayTrustExhaustedState = canTrustExhaustedProductDiscoveryState({
    discoveryState,
    usableCandidateCount: candidatePool.filter((item) =>
      isStrongResolvedCampaignProduct(item, rule)
    ).length,
    minimumCandidateCount: CAROUSEL_PRODUCT_SLIDE_TARGET,
  });
  let shouldDiscover = !hasFiveFreshStrong && !mayTrustExhaustedState;
  const initialUrls = new Set(candidatePool.map((item) => normalizeComparableValue(item.url)).filter(Boolean));
  let verifiedThisRun = [];
  let completedDiscoverySources = 0;
  const discoveryErrors = [];

  if (shouldDiscover) {
    // Products already verified during brand analysis are trusted seeds.
    // Re-fetching them here caused transient site blocks/timeouts to erase
    // valid products and made the carousel resolver return an empty pool.
    if (capabilitySeedItems.length) {
      verifiedThisRun.push(...capabilitySeedItems);
    }

    try {
      const storeCandidates = await discoverProductCandidatesFromStoreSearch({
        websiteUrl,
        campaignPrompt: buildCampaignResearchText(rule),
        usedItems: recentUsedItems,
        excludeUsed: true,
      });
      const storeItems = await verifyDiscoveredWebsiteProductCandidates({
        candidates: storeCandidates,
        websiteUrl,
        limit: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
      });
      verifiedThisRun.push(...storeItems);
      completedDiscoverySources += 1;
      } catch (error) {
        discoveryErrors.push({ source: "native_store_search", message: error.message });
        console.log("V10 native store discovery unavailable", {
        ruleId: rule.id,
        websiteUrl,
        message: error.message,
      });
    }

    candidatePool = dedupeWebsiteItemsByUrlTitleAndImage([...candidatePool, ...verifiedThisRun]);
    strongSelection = getStrongFreshSelection();

    if (
      strongSelection.length < CAROUSEL_PRODUCT_SLIDE_TARGET ||
      strongSelection.some((item) => item.campaign_rotation_state !== "fresh")
    ) {
      try {
        const webSearchItems = await findWebsiteProductWithWebSearch({
          openai,
          brandProfile,
          rule,
          websiteUrl,
          usedWebsiteItems: recentUsedItems,
          fitModel: PRODUCT_RESEARCH_FAST_MODEL,
          fitMinimumStrongProducts: CAROUSEL_PRODUCT_SLIDE_TARGET,
        });
        verifiedThisRun.push(...(Array.isArray(webSearchItems) ? webSearchItems : []));
        completedDiscoverySources += 1;
      } catch (error) {
        discoveryErrors.push({ source: "domain_web_search", message: error.message });
        console.log("V10 domain web search unavailable", {
          ruleId: rule.id,
          websiteUrl,
          message: error.message,
        });
      }
    }

    candidatePool = dedupeWebsiteItemsByUrlTitleAndImage([...candidatePool, ...verifiedThisRun]);
    strongSelection = getStrongFreshSelection();

    if (strongSelection.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      try {
        const discoveryCandidates = await discoverProductCandidatesFromWebsite({
          websiteUrl,
          campaignPrompt: buildCampaignResearchText(rule),
          rule,
          usedItems: recentUsedItems,
          fastCampaignContinuation: true,
        });
        const remainingItems = await verifyDiscoveredWebsiteProductCandidates({
          candidates: discoveryCandidates,
          websiteUrl,
          limit: CAROUSEL_DISCOVERY_VERIFY_LIMIT,
        });
        verifiedThisRun.push(...remainingItems);
        completedDiscoverySources += 1;
      } catch (error) {
        discoveryErrors.push({ source: "bounded_catalog_discovery", message: error.message });
        console.log("V10 bounded sitemap/catalog discovery unavailable", {
          ruleId: rule.id,
          websiteUrl,
          message: error.message,
        });
      }
    }

    const uniqueVerifiedThisRun = dedupeWebsiteItemsByUrlTitleAndImage(verifiedThisRun)
      .filter(isValidCarouselProduct);
    const directStrongCount = uniqueVerifiedThisRun
      .filter((item) => isStrongResolvedCampaignProduct(item, rule))
      .length;
    let scoredNewItems = uniqueVerifiedThisRun;

    if (uniqueVerifiedThisRun.length && directStrongCount < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      scoredNewItems = await applyAiCampaignFitScores({
        openai,
        rule,
        brandProfile,
        items: uniqueVerifiedThisRun,
        maxItems: Math.min(uniqueVerifiedThisRun.length, 12),
        model: PRODUCT_RESEARCH_FAST_MODEL,
        escalateWhenUncertain: false,
        minimumStrongProducts: CAROUSEL_PRODUCT_SLIDE_TARGET,
      });
    }

    candidatePool = dedupeWebsiteItemsByUrlTitleAndImage([...candidatePool, ...scoredNewItems]);
    await upsertCampaignProductCandidateItems({
      supabase,
      rule,
      sourceUrl: websiteUrl,
      items: scoredNewItems,
    });
    const newCount = scoredNewItems.filter((item) => !initialUrls.has(normalizeComparableValue(item.url))).length;
    await updateCampaignProductDiscoveryState({
      supabase,
      brandProfileId: rule.brand_profile_id,
      themeKey,
      newCount,
      candidateCount: scoredNewItems.length,
      completedSourceCount: completedDiscoverySources,
    });
  }

  let selectedProducts = selectBestAvailableCampaignCarouselProducts({
    items: candidatePool,
    rule,
    sourceUrl: websiteUrl,
    recentUsedItems,
    usedWebsiteImageUrlsThisRun,
    limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
  });

  if (selectedProducts.length > 0 && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
    const uniqueBest = [...selectedProducts];
    let index = 0;
    while (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
      selectedProducts.push({
        ...uniqueBest[index % uniqueBest.length],
        carousel_repeat_index: index + 1,
        campaign_rotation_state: "verified_store_has_fewer_than_five",
      });
      index += 1;
    }
  }

  if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
    const resolverDiagnostics = {
      ruleId: rule.id,
      brandProfileId: rule.brand_profile_id,
      websiteUrl,
      themeKey,
      resolverVersion: PRODUCT_RESOLVER_VERSION,
      productSearchQueries: splitCampaignTermLine(rule?.product_search_queries),
      cachedCount: cachedItems.length,
      campaignCatalogCount: campaignCatalogItems.length,
      catalogFallbackCount: catalogFallbackItems.length,
      capabilitySeedCount: capabilitySeedItems.length,
      usableInitialPoolCount: initialUrls.size,
      ignoredExhaustedState: Boolean(discoveryState.exhausted && !mayTrustExhaustedState),
      discoveryStateVersion: discoveryState.metadata?.resolver_version || "legacy",
      discoveryAttempted: shouldDiscover,
      completedDiscoverySources,
      rawVerifiedThisRun: verifiedThisRun.length,
      finalCandidatePoolCount: candidatePool.length,
      discoveryErrors,
    };
    console.error(
      "V10 product discovery finished without a usable verified product",
      resolverDiagnostics
    );
    const resolverError = new Error(
      "No verified product detail page with a usable product image could be found."
    );
    resolverError.code = "NO_VERIFIED_PRODUCT_AFTER_FULL_SEARCH";
    resolverError.resolverDiagnostics = resolverDiagnostics;
    resolverError.resolvedRule = rule;
    throw resolverError;
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
  await upsertCampaignProductCandidateItems({
    supabase,
    rule,
    sourceUrl: websiteUrl,
    items: selectedProducts,
  });
  const cycleNumber = await getCurrentWebsiteCycle({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType: rule.content_type_id || "carousel_website_item",
  });

  summary.website_items_found += selectedProducts.length;
  summary.website_content_success += 1;
  summary.website_image_used += selectedProducts.length;

  console.log("V10 campaign product resolver completed", {
    ruleId: rule.id,
    brandProfileId: rule.brand_profile_id,
    themeKey,
    cacheCount: cachedItems.length,
    campaignCatalogCount: campaignCatalogItems.length,
    catalogFallbackCount: catalogFallbackItems.length,
    capabilitySeedCount: capabilitySeedItems.length,
    discovered: shouldDiscover,
    verifiedThisRun: verifiedThisRun.length,
    selectedCount: selectedProducts.length,
    selected: selectedProducts.map((item) => ({
      title: item.title,
      url: item.url,
      campaignFitScore: scoreCampaignFitForRule(item, rule),
      aiCampaignFitScore: getAiCampaignFitScore(item),
      rotationState: item.campaign_rotation_state,
    })),
  });

  return {
    websiteItems: selectedProducts,
    websiteItem: selectedProducts[0],
    websiteSourceUrl: websiteUrl,
    websiteCycleNumber: cycleNumber,
    useWebsiteImage: true,
    websiteRule: rule,
  };
}

function getPostDestinationUrl(rule) {
  if (isCarouselRule(rule)) {
    return (
      getWebsiteProductSourceUrl(rule?.brand_profile) ||
      rule?.brand_profile?.website_url ||
      rule?.website_url ||
      ""
    );
  }

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
  return getTrustedWebsiteItemPricing(websiteItem).displayPrice;
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
  const carouselProducts = getCarouselProducts(rule).filter(isValidCarouselProduct);
  const hasCarouselProducts = isCarouselRule(rule) && carouselProducts.length > 0;
  const hasFullProductCarousel = carouselProducts.length >= CAROUSEL_MIN_PRODUCT_SLIDES;
  const carouselModeInstruction = hasFullProductCarousel
    ? `This automation rule is supposed to create a product carousel with at least ${CAROUSEL_MIN_PRODUCT_SLIDES} different website products. The caption should introduce the collection and invite the audience to swipe through the carousel. Do not focus only on one product.`
    : `This automation rule is supposed to create a campaign carousel. Only ${carouselProducts.length} clearly relevant website product${carouselProducts.length === 1 ? "" : "s"} could be safely selected, so use them as campaign-relevant examples and keep the caption focused on the campaign theme. Do not invent additional products.`;
  const websiteItemText = hasCarouselProducts
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
${hasCarouselProducts
  ? carouselModeInstruction
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
- Keep URLs clean and professional in the visible caption: show only the website domain, such as example.com, not a long product/category/search URL. The saved internal Destination URL may still be the exact product URL.
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
- Always include the website domain in the final post if Destination URL is provided; do not show the full long product/category URL in the visible caption.
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

${formatCampaignVisualContextForPrompt(rule)}

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
- If this is a campaign, holiday, seasonal or event post, the image must clearly support that campaign theme. Use the Campaign visual context and match terms above as the primary theme. Do not create a generic unrelated image.
- If the campaign is about a specific occasion but no verified product image is used, create a broader themed campaign/lifestyle image for that occasion rather than unrelated products or random decorations.

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
    skipped_locked: 0,
    skipped_existing_draft: 0,
    recovered_completed_drafts: 0,
    cleaned_incomplete_carousel_drafts: 0,
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
    automation_run_logs_started: 0,
    automation_run_logs_finished: 0,
  };
}

function getCarouselEmailSlideMetadata(slide) {
  const metadata = slide?.metadata;
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata;
  }

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function getCarouselEmailProductTitle(slide) {
  const metadata = getCarouselEmailSlideMetadata(slide);
  const title = String(metadata.product_title || slide?.product_title || slide?.headline || "").trim();
  if (!title || String(metadata.carousel_slide_role || "").toLowerCase().includes("outro")) {
    return "";
  }

  return normalizeSlideText(title.replace(/\s+/g, " "), 68);
}

function getCarouselEmailProductBrand(slide) {
  const metadata = getCarouselEmailSlideMetadata(slide);
  if (String(metadata.carousel_slide_role || "").toLowerCase().includes("outro")) {
    return "";
  }

  return getTrustedProductCardBrand({
    brand_name: metadata.product_brand || slide?.product_brand || "",
  });
}

function getCarouselEmailProductPricing(slide) {
  const metadata = getCarouselEmailSlideMetadata(slide);
  if (String(metadata.carousel_slide_role || "").toLowerCase().includes("outro")) {
    return {
      displayPrice: "",
      currentPrice: "",
      salePrice: "",
      originalPrice: "",
      isOnSale: false,
    };
  }

  return getTrustedWebsiteItemPricing({
    price: metadata.product_price || slide?.product_price || "",
    sale_price: metadata.product_sale_price || "",
    original_price: metadata.product_original_price || "",
  });
}

function buildCarouselEmailPreviewHtml(carouselSlides = []) {
  const slides = (carouselSlides || []).filter((slide) => slide?.image_url).slice(0, 6);

  if (!slides.length) {
    return "";
  }

  const cards = slides
    .map((slide) => {
      const productBrand = getCarouselEmailProductBrand(slide);
      const productTitle = getCarouselEmailProductTitle(slide);
      const pricing = getCarouselEmailProductPricing(slide);
      const hasProductInfo = productBrand || productTitle || pricing.displayPrice;
      const imageMaxHeight = hasProductInfo ? "128px" : "180px";

      return `
      <div class="carousel-email-card" style="display:inline-block;width:31%;max-width:180px;min-width:150px;vertical-align:top;margin:6px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="padding:0;background:#f8fafc;">
              <img src="${escapeHtml(slide.image_url || '')}" alt="${escapeHtml(productTitle || slide.headline || 'Carousel slide')}" style="display:block;width:100%;height:auto;max-height:${imageMaxHeight};object-fit:contain;background:#f8fafc;" />
            </td>
          </tr>
          ${hasProductInfo ? `
          <tr>
            <td style="padding:8px 8px 10px;text-align:center;background:#ffffff;border-top:1px solid #f1f5f9;">
              ${productBrand ? `<div style="font-size:10px;line-height:1.2;color:#64748b;font-weight:600;margin-bottom:4px;">${escapeHtml(productBrand)}</div>` : ""}
              ${productTitle ? `<div style="font-size:11px;line-height:1.25;color:#111827;font-weight:700;min-height:28px;">${escapeHtml(productTitle)}</div>` : ""}
              ${pricing.isOnSale && pricing.salePrice && pricing.originalPrice
                ? `<div style="margin-top:5px;white-space:nowrap;"><span style="font-size:14px;line-height:1.2;color:#dc2626;font-weight:800;">${escapeHtml(pricing.salePrice)}</span><span style="font-size:11px;line-height:1.2;color:#94a3b8;font-weight:600;text-decoration:line-through;margin-left:6px;">${escapeHtml(pricing.originalPrice)}</span></div>`
                : pricing.displayPrice
                  ? `<div style="font-size:14px;line-height:1.2;color:#111827;font-weight:800;margin-top:5px;">${escapeHtml(pricing.displayPrice)}</div>`
                  : ""}
            </td>
          </tr>
          ` : ""}
        </table>
      </div>
    `;
    })
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


function isMissingAutomationRunLogsTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("automation_run_logs") && message.includes("does not exist");
}

function compactAutomationRunLogError(errorMessage) {
  const message = String(errorMessage || "").trim();
  if (!message) {
    return null;
  }

  return message.slice(0, 1200);
}

function normalizeAutomationRunLogSearchMethod(value) {
  const rawValue = String(value || "").trim();
  const normalizedValue = rawValue.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.includes("domain_site_search")) {
    return "domain_site_search";
  }

  if (normalizedValue.includes("backup_broad")) {
    return "domain_web_search_backup_broad";
  }

  if (normalizedValue.includes("best_match")) {
    return "domain_web_search_best_match";
  }

  if (normalizedValue.includes("ai_discovery_page")) {
    return "ai_discovery_page";
  }

  if (normalizedValue.includes("product_research") || normalizedValue.includes("web_search") || normalizedValue.includes("ai_web")) {
    return "ai_domain_web_search";
  }

  if (normalizedValue.includes("campaign_search_pool") || normalizedValue.includes("store_search")) {
    return "store_search";
  }

  if (normalizedValue.includes("campaign_catalog_term_match")) {
    return "catalog_campaign_term_match";
  }

  if (normalizedValue.includes("brand_catalog") || normalizedValue.includes("catalog") || normalizedValue.includes("selected")) {
    return "existing_product_catalog";
  }

  return normalizedValue.slice(0, 80);
}

function inferAutomationRunLogSearchMethodForItem(item) {
  const methodCandidates = [
    item?.automation_search_method,
    item?.product_search_method,
    item?.search_method,
    item?.search_attempt,
    item?.web_search_attempt,
    item?.discovery_attempt,
    item?.campaign_fit_source,
    item?.discovery_source,
    item?.catalog_source,
    item?.used_source,
    item?.source,
    item?.selection_source,
    item?.research_source,
  ];

  for (const candidate of methodCandidates) {
    const normalized = normalizeAutomationRunLogSearchMethod(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "existing_product_catalog";
}

function collectAutomationRunProductLogData({ websiteItem = null, websiteItems = [] } = {}) {
  const allItems = [
    ...(Array.isArray(websiteItems) ? websiteItems : []),
    websiteItem,
  ].filter(Boolean);

  const uniqueByUrl = new Map();

  for (const item of allItems) {
    const key = normalizeComparableValue(item?.url) || normalizeComparableValue(item?.title);
    if (!key || uniqueByUrl.has(key)) {
      continue;
    }

    uniqueByUrl.set(key, item);
  }

  const uniqueItems = Array.from(uniqueByUrl.values());
  const methodCounts = {};
  const productDetails = [];
  let freshProducts = 0;
  let reusedProducts = 0;

  for (const item of uniqueItems) {
    const method = inferAutomationRunLogSearchMethodForItem(item);
    methodCounts[method] = (methodCounts[method] || 0) + 1;
    const isReused = Boolean(
      item?.campaign_rotation_state === "reused" ||
        item?.campaign_was_used_recently ||
        item?.campaign_image_used_this_run ||
        hasWebsiteItemCatalogUsage(item)
    );

    if (isReused) {
      reusedProducts += 1;
    } else {
      freshProducts += 1;
    }

    productDetails.push({
      title: String(item?.title || item?.name || "").trim() || null,
      url: String(item?.url || "").trim() || null,
      image_url: String(item?.image_url || item?.imageUrl || "").trim() || null,
      search_method: method,
      campaign_fit_score: Number.isFinite(Number(item?.campaign_fit_score)) ? Number(item.campaign_fit_score) : null,
      campaign_fit_source: String(item?.campaign_fit_source || "").trim() || null,
      discovery_source: String(item?.discovery_source || "").trim() || null,
      catalog_source: String(item?.catalog_source || "").trim() || null,
      selection_priority: Number.isFinite(Number(item?.selection_priority)) ? Number(item.selection_priority) : null,
      times_used: Number.isFinite(Number(item?.times_used)) ? Number(item.times_used) : null,
      last_used_at: String(item?.last_used_at || "").trim() || null,
      campaign_rotation_state:
        String(item?.campaign_rotation_state || "").trim() || (isReused ? "reused" : "fresh"),
      campaign_was_used_recently: Boolean(item?.campaign_was_used_recently || hasWebsiteItemCatalogUsage(item)),
      campaign_image_used_this_run: Boolean(item?.campaign_image_used_this_run),
    });
  }

  const searchMethods = Object.keys(methodCounts).slice(0, 20);

  return {
    productsSelected: uniqueItems.length,
    productTitles: uniqueItems
      .map((item) => String(item?.title || item?.name || "").trim())
      .filter(Boolean)
      .slice(0, 12),
    productUrls: uniqueItems
      .map((item) => String(item?.url || "").trim())
      .filter(Boolean)
      .slice(0, 12),
    searchMethods,
    methodCounts,
    productDetails: productDetails.slice(0, 12),
    productsWithImages: uniqueItems.filter((item) => Boolean(item?.image_url || item?.imageUrl)).length,
    freshProducts,
    reusedProducts,
  };
}

async function createAutomationRunLog({ supabase, rule, startedAtIso }) {
  const ruleName = rule?.name || rule?.title || null;
  const campaignTitle =
    rule?.campaign_title ||
    rule?.campaign_name ||
    rule?.campaign_opportunity_title ||
    ruleName ||
    null;

  try {
    const { data, error } = await supabase
      .from("automation_run_logs")
      .insert({
        user_id: rule.user_id,
        brand_profile_id: rule.brand_profile_id || null,
        rule_id: rule.id,
        status: "running",
        started_at: startedAtIso,
        rule_name: ruleName,
        campaign_title: campaignTitle,
        content_type_id: rule.content_type_id || null,
        content_format: normalizeContentFormat(rule.content_format),
        product_match_terms: rule.product_match_terms || null,
        product_search_queries: rule.product_search_queries || null,
        metadata: {
          rule_name: ruleName,
          campaign_title: campaignTitle,
          post_type: rule.post_type || null,
          uses_website_content: Boolean(rule.uses_website_content),
          generate_image: Boolean(rule.generate_image),
        },
      })
      .select("id")
      .single();

    if (error) {
      if (!isMissingAutomationRunLogsTableError(error)) {
        console.warn("Could not create automation run log", {
          ruleId: rule.id,
          message: error.message,
        });
      }
      return null;
    }

    return data?.id || null;
  } catch (error) {
    if (!isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not create automation run log", {
        ruleId: rule?.id,
        message: error.message,
      });
    }
    return null;
  }
}

async function updateAutomationRunLogBrandSnapshot({ supabase, runLogId, brandProfile, rule }) {
  if (!runLogId) {
    return;
  }

  const brandName = String(
    brandProfile?.business_name ||
      brandProfile?.name ||
      brandProfile?.brand_name ||
      ""
  ).trim();
  const brandWebsiteUrl = String(
    brandProfile?.website_product_source_url ||
      brandProfile?.website_url ||
      ""
  ).trim();
  const ruleName = rule?.name || rule?.title || null;
  const campaignTitle =
    rule?.campaign_title ||
    rule?.campaign_name ||
    rule?.campaign_opportunity_title ||
    ruleName ||
    null;

  try {
    const { error } = await supabase
      .from("automation_run_logs")
      .update({
        brand_name: brandName || null,
        brand_website_url: brandWebsiteUrl || null,
        rule_name: ruleName,
        campaign_title: campaignTitle,
        content_type_id: rule?.content_type_id || null,
        content_format: normalizeContentFormat(rule?.content_format),
        updated_at: new Date().toISOString(),
      })
      .eq("id", runLogId);

    if (error && !isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not update automation run log brand snapshot", {
        runLogId,
        message: error.message,
      });
    }
  } catch (error) {
    if (!isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not update automation run log brand snapshot", {
        runLogId,
        message: error.message,
      });
    }
  }
}

async function finishAutomationRunLog({
  supabase,
  runLogId,
  status,
  startedAtIso,
  errorMessage = null,
  postId = null,
  websiteItem = null,
  websiteItems = [],
  ruleSnapshot = null,
  extraSummary = {},
}) {
  if (!runLogId) {
    return;
  }

  const finishedAtIso = new Date().toISOString();
  const durationMs = Math.max(0, new Date(finishedAtIso).getTime() - new Date(startedAtIso).getTime());
  const productData = collectAutomationRunProductLogData({ websiteItem, websiteItems });

  try {
    const { error } = await supabase
      .from("automation_run_logs")
      .update({
        status,
        finished_at: finishedAtIso,
        duration_ms: Number.isFinite(durationMs) ? durationMs : null,
        error_message: compactAutomationRunLogError(errorMessage),
        post_id: postId || null,
        products_selected: productData.productsSelected,
        product_titles: productData.productTitles,
        product_urls: productData.productUrls,
        search_methods: productData.searchMethods,
        product_match_terms: ruleSnapshot?.product_match_terms || null,
        product_search_queries: ruleSnapshot?.product_search_queries || null,
        metadata: {
          ...extraSummary,
          website_items_found: Array.isArray(websiteItems) ? websiteItems.length : 0,
          selected_product_count: productData.productsSelected,
          selected_products_with_images: productData.productsWithImages,
          fresh_product_count: productData.freshProducts,
          reused_product_count: productData.reusedProducts,
          search_method_counts: productData.methodCounts,
          product_details: productData.productDetails,
        },
        updated_at: finishedAtIso,
      })
      .eq("id", runLogId);

    if (error && !isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not finish automation run log", {
        runLogId,
        message: error.message,
      });
    }
  } catch (error) {
    if (!isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not finish automation run log", {
        runLogId,
        message: error.message,
      });
    }
  }
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

async function stopRuleAfterCostProtectedCarouselFailure(supabase, ruleId, message) {
  await supabase
    .from("automation_rules")
    .update({
      is_active: false,
      next_run_at: null,
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
  "id, business_name, website_url, website_product_source_url, website_product_mode_available, website_carousel_mode_available, website_product_mode_evidence, brand_description, industry, target_audience, content_language, logo_url, logo_storage_path, logo_enabled_by_default"
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
    const removableParams = new Set([
      "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid",
      "ref", "ref_", "source", "campaign", "variant", "currency",
    ]);
    for (const key of [...url.searchParams.keys()]) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith("utm_") || removableParams.has(lowerKey)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

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

function getImageUrlFromImgTag(imgTag, pageUrl) {
  const srcsetUrl = splitSrcsetUrls(
    getAttributeValueFromTag(imgTag, "srcset") ||
      getAttributeValueFromTag(imgTag, "data-srcset")
  ).at(-1);

  const rawUrlCandidates = [
    getAttributeValueFromTag(imgTag, "data-src") ||
      getAttributeValueFromTag(imgTag, "data-original") ||
      getAttributeValueFromTag(imgTag, "data-lazy-src"),
    getAttributeValueFromTag(imgTag, "data-image"),
    getAttributeValueFromTag(imgTag, "data-url"),
    srcsetUrl,
    getAttributeValueFromTag(imgTag, "src"),
  ].filter(Boolean);

  for (const rawUrl of rawUrlCandidates) {
    const resolvedUrl = rawUrl ? resolveUrl(normalizeEscapedUrl(rawUrl), pageUrl) : "";

    if (resolvedUrl && isHttpUrl(resolvedUrl) && !isBadProductImageUrl(resolvedUrl)) {
      return resolvedUrl;
    }
  }

  return "";
}

function getTitleFromImageTag(imgTag) {
  return (
    decodeHtmlEntities(getAttributeValueFromTag(imgTag, "alt")) ||
    decodeHtmlEntities(getAttributeValueFromTag(imgTag, "title")) ||
    decodeHtmlEntities(getAttributeValueFromTag(imgTag, "aria-label")) ||
    ""
  ).trim();
}

function extractBestProductCardImageFromAnchorBody(anchorBody, pageUrl) {
  const imageCandidates = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let imgMatch;

  while ((imgMatch = imgRegex.exec(String(anchorBody || ""))) !== null) {
    const imgTag = imgMatch[0] || "";
    const imageUrl = getImageUrlFromImgTag(imgTag, pageUrl);

    if (!imageUrl) {
      continue;
    }

    const imageText = getTitleFromImageTag(imgTag);
    const lowerUrl = imageUrl.toLowerCase();
    const lowerText = imageText.toLowerCase();
    let score = 0;

    if (imageText) score += 12;
    if (lowerUrl.includes("product") || lowerUrl.includes("products")) score += 8;
    if (lowerUrl.includes("logo") || lowerText.includes("logo")) score -= 50;
    if (lowerUrl.includes("placeholder") || lowerText.includes("placeholder")) score -= 50;

    imageCandidates.push({ imageUrl, imageText, score });
  }

  return imageCandidates.sort((a, b) => b.score - a.score)[0] || null;
}

function extractProductCardCandidatesFromHtml({
  html,
  pageUrl,
  websiteUrl,
  campaignPrompt,
}) {
  const candidates = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(String(html || ""))) !== null) {
    const href = match[1] || "";
    const anchorBody = match[2] || "";
    const url = resolveUrl(href, pageUrl);

    if (!url || !isHttpUrl(url)) {
      continue;
    }

    if (!isSameOrSubdomainUrl(url, websiteUrl)) {
      continue;
    }

    if (isLikelyNonProductUrl(url, websiteUrl) || isLikelyBadDiscoveryPageUrl(url, websiteUrl)) {
      continue;
    }

    const imageCandidate = extractBestProductCardImageFromAnchorBody(anchorBody, pageUrl);

    if (!imageCandidate?.imageUrl) {
      continue;
    }

    if (Number(imageCandidate.score || 0) < -20) {
      continue;
    }

    const title =
      stripHtmlToText(anchorBody) ||
      imageCandidate.imageText ||
      decodeHtmlEntities(getAttributeValueFromTag(match[0], "title")) ||
      "";

    if (!title) {
      continue;
    }

    const score =
      120 +
      Number(imageCandidate.score || 0) +
      scorePossibleProductLink({ url, text: title, campaignPrompt });

    candidates.push({
      title,
      url,
      description: title,
      price: "",
      image_url: imageCandidate.imageUrl,
      source_page_url: pageUrl,
      reason: `Product card found on store search page: ${pageUrl}`,
      score,
      discovery_score: score,
      campaign_fit_source: "store_search_card",
    });
  }

  return dedupeUrlItems(candidates)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 40);
}

async function fetchHtml(url) {
  const result = await fetchWebsiteHtmlRobust(url, {
    timeoutMs: PRODUCT_FETCH_TIMEOUT_MS,
    totalTimeoutMs: 24000,
    maxAttempts: 3,
    allowReadableText: true,
  });
  return result.html;
}

async function fetchJson(url) {
  const safeUrl = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PRODUCT_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": PRODUCT_BROWSER_USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "*",
      },
    });

    if (!response.ok) {
      throw new Error(`Website returned ${response.status}`);
    }

    return await response.json();
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
    ...getTemperatureOptions(POST_TEXT_MODEL, 0.2),
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
    .eq("brand_profile_id", brandProfileId);

  if (sourceUrl) {
    query = query.eq("source_url", sourceUrl);
  }

  if (contentType) {
    query = query.eq("content_type", contentType);
  }

  if (cycleNumber) {
    query = query.eq("cycle_number", cycleNumber);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Could not load used website items");
  }

  return data || [];
}

async function getRecentPostSlideWebsiteItems({
  supabase,
  userId,
  brandProfileId,
  sourceUrl = "",
  limit = WEBSITE_PRODUCT_REUSE_LIMIT,
}) {
  let postsQuery = supabase
    .from("posts")
    .select("id, created_at, brand_profile_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(10, Math.min(limit, sourceUrl ? 160 : 80)));

  if (!sourceUrl) {
    postsQuery = postsQuery.eq("brand_profile_id", brandProfileId);
  }

  const { data: posts, error: postsError } = await postsQuery;

  if (postsError || !posts?.length) {
    if (postsError) {
      console.error("Could not load recent posts for carousel product rotation", {
        brandProfileId,
        message: postsError.message,
        code: postsError.code,
      });
    }

    return [];
  }

  const postIds = posts.map((post) => post.id).filter(Boolean);

  if (!postIds.length) {
    return [];
  }

  const { data: slides, error: slidesError } = await supabase
    .from("post_slides")
    .select("post_id, product_url, image_url, headline")
    .in("post_id", postIds)
    .not("product_url", "is", null)
    .limit(Math.max(20, Math.min(limit * 6, 480)));

  if (slidesError) {
    console.error("Could not load recent carousel slides for product rotation", {
      brandProfileId,
      message: slidesError.message,
      code: slidesError.code,
    });

    return [];
  }

  return (slides || [])
    .filter((slide) => slide?.product_url || slide?.image_url)
    .filter((slide) => {
      if (!sourceUrl || !slide?.product_url || isBadProductUrl(slide.product_url)) {
        return true;
      }

      return isSameOrSubdomainUrl(slide.product_url, sourceUrl);
    })
    .map((slide) => ({
      item_key: slide.product_url ? createItemKey({ url: slide.product_url }) : "",
      item_url: slide.product_url || null,
      item_title: slide.headline || null,
      item_image_url: slide.image_url || null,
      content_type: "carousel_slide",
      created_at:
        posts.find((post) => post.id === slide.post_id)?.created_at || null,
    }));
}

async function getDomainUsedWebsiteCatalogItems({
  supabase,
  userId,
  sourceUrl,
  limit = WEBSITE_PRODUCT_REUSE_LIMIT,
}) {
  const hostname = getHostnameWithoutWww(sourceUrl);

  if (!hostname) {
    return [];
  }

  const domainPattern = `%${hostname}%`;
  const { data, error } = await supabase
    .from("website_product_catalog")
    .select("product_url, title, image_url, times_used, last_used_at, discovery_source")
    .eq("user_id", userId)
    .or(`source_url.ilike.${domainPattern},product_url.ilike.${domainPattern}`)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("times_used", { ascending: false })
    .limit(Math.max(limit, 300));

  if (error) {
    console.error("Could not load domain-level catalog usage for product rotation", {
      userId,
      sourceUrl,
      message: error.message,
      code: error.code,
    });

    return [];
  }

  return (data || [])
    .filter((row) =>
      Number(row?.times_used || 0) > 0 ||
      Boolean(row?.last_used_at) ||
      /(?:^|_)used$/i.test(String(row?.discovery_source || ""))
    )
    .filter((row) => row?.product_url || row?.image_url || row?.title)
    .map((row) => ({
      item_key: row.product_url ? createItemKey({ url: row.product_url }) : "",
      item_url: row.product_url || null,
      item_title: row.title || null,
      item_image_url: row.image_url || null,
      content_type: "domain_catalog_usage",
      created_at: row.last_used_at || null,
    }));
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
  const historyItems = await getUsedWebsiteItems({
    supabase,
    userId,
    brandProfileId,
    sourceUrl: "",
    contentType: null,
    limit,
  });

  const slideItems = await getRecentPostSlideWebsiteItems({
    supabase,
    userId,
    brandProfileId,
    sourceUrl,
    limit,
  });

  const domainCatalogItems = await getDomainUsedWebsiteCatalogItems({
    supabase,
    userId,
    sourceUrl,
    limit,
  });

  return [...historyItems, ...slideItems, ...domainCatalogItems];
}

function hasWebsiteItemAlreadyBeenUsed(item, usedItems, sourceUrl) {
  if (hasWebsiteItemCatalogUsage(item)) {
    return true;
  }

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

function isTrustedWebsiteCatalogDiscoverySource(value) {
  const source = String(value || "").trim();

  return /(?:^|_)(?:selected|used|store_search|ai_web_search|site_discovery|reuse_selected|brand_capability_verified)(?:_|$)/i.test(
    source
  );
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

  const catalogSource = row.discovery_source || "catalog";
  const previouslySelectedAndVerified =
    Boolean(row.product_verified) ||
    isTrustedWebsiteCatalogDiscoverySource(catalogSource);

  return {
    ...item,
    id: row.id || null,
    item_key: row.item_key || createItemKey(item),
    times_used: Number(row.times_used || 0),
    last_used_at: row.last_used_at || null,
    catalog_source: catalogSource,
    product_page_verified: previouslySelectedAndVerified,
    product_schema_verified: Boolean(
      row.product_schema_verified ||
      row.metadata?.product_schema_verified
    ),
    ecommerce_proof_found: Boolean(
      row.ecommerce_proof_found ||
      row.metadata?.ecommerce_proof_found ||
      previouslySelectedAndVerified
    ),
    product_confidence: Number(
      row.product_confidence ||
      row.metadata?.product_confidence ||
      (previouslySelectedAndVerified ? 100 : 0)
    ),
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
  let query = supabase
    .from("website_product_catalog")
    .select(
      "id, product_url, title, description, price, currency, image_url, source_url, times_used, last_used_at, is_active, discovery_source"
    )
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("is_active", true);

  if (sourceUrl) {
    query = query.eq("source_url", sourceUrl);
  }

  query = query
    .order("times_used", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  const { data, error } = await query;

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

function getCampaignThemeKey(rule) {
  const payload = {
    v: 1,
    theme: extractCampaignCoreThemeTerms(rule).map(normalizeSearchText).filter(Boolean).sort(),
    match: extractExplicitCampaignMatchTerms(rule).map(normalizeSearchText).filter(Boolean).sort(),
    avoid: extractCampaignAvoidTerms(rule).map(normalizeSearchText).filter(Boolean).sort(),
    intent: normalizeSearchText(rule?.product_search_intent || ""),
    need: normalizeSearchText(rule?.target_customer_need || ""),
    fallback: normalizeSearchText(getCampaignCoreTitleSegment(rule?.name || rule?.campaign_goal || "")),
  };

  return buildCampaignFingerprint(payload);
}

async function getCampaignProductCandidateItems({
  supabase,
  brandProfileId,
  themeKey,
  limit = 200,
}) {
  if (!brandProfileId || !themeKey) return [];

  const { data, error } = await supabase
    .from("campaign_product_candidates")
    .select("id, product_url, title, description, image_url, price, source_url, campaign_fit_score, heuristic_fit_score, ai_fit_score, fit_tier, score_version, product_verified, verified_at, campaign_fit_source, selection_priority, times_used, last_used_at, metadata")
    .eq("brand_profile_id", brandProfileId)
    .eq("theme_key", themeKey)
    .eq("is_active", true)
    .eq("product_verified", true)
    .order("times_used", { ascending: true })
    .order("fit_tier", { ascending: true })
    .order("campaign_fit_score", { ascending: false })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    console.log("Campaign product cache unavailable; continuing with live discovery", {
      brandProfileId,
      themeKey,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data || []).map((row) => {
    const normalized = normalizeWebsiteCatalogItem({
      ...row,
      discovery_source: row.campaign_fit_source || "campaign_candidate_cache",
    });

    return normalized ? {
      ...normalized,
      campaign_candidate_id: row.id,
      campaign_fit_score: Number(row.campaign_fit_score || 0),
      heuristic_campaign_fit_score: Number(row.heuristic_fit_score || 0),
      ai_campaign_fit_score: row.ai_fit_score === null ? null : Number(row.ai_fit_score),
      campaign_fit_tier: Number(row.fit_tier ?? 3),
      campaign_score_version: row.score_version || "legacy",
      product_page_verified: Boolean(row.product_verified),
      product_schema_verified: Boolean(row.metadata?.product_schema_verified),
      ecommerce_proof_found: Boolean(row.metadata?.ecommerce_proof_found),
      product_confidence: Number(row.metadata?.product_confidence || 0),
      campaign_fit_source: row.campaign_fit_source || "campaign_candidate_cache",
      selection_priority: Number(row.selection_priority || 0),
      times_used: Number(row.times_used || 0),
      last_used_at: row.last_used_at || null,
      campaign_candidate_metadata: row.metadata || {},
    } : null;
  }).filter(Boolean);
}

async function getCampaignProductDiscoveryState({ supabase, brandProfileId, themeKey }) {
  const { data, error } = await supabase
    .from("campaign_product_discovery_state")
    .select("last_attempt_at, exhausted, consecutive_no_new, last_new_count, metadata")
    .eq("brand_profile_id", brandProfileId)
    .eq("theme_key", themeKey)
    .maybeSingle();

  if (error) {
    return {
      available: false,
      exhausted: false,
      last_attempt_at: null,
      consecutive_no_new: 0,
    };
  }

  return {
    available: true,
    exhausted: Boolean(data?.exhausted),
    last_attempt_at: data?.last_attempt_at || null,
    consecutive_no_new: Number(data?.consecutive_no_new || 0),
    last_new_count: Number(data?.last_new_count || 0),
    metadata: data?.metadata || {},
  };
}

async function updateCampaignProductDiscoveryState({
  supabase,
  brandProfileId,
  themeKey,
  newCount,
  candidateCount,
  completedSourceCount = 0,
}) {
  const existing = await getCampaignProductDiscoveryState({
    supabase,
    brandProfileId,
    themeKey,
  });
  const noNewCount = newCount > 0 ? 0 : Number(existing.consecutive_no_new || 0) + 1;

  await supabase
    .from("campaign_product_discovery_state")
    .upsert({
      brand_profile_id: brandProfileId,
      theme_key: themeKey,
      last_attempt_at: new Date().toISOString(),
      exhausted: newCount === 0 && completedSourceCount >= 2,
      consecutive_no_new: noNewCount,
      last_new_count: Number(newCount || 0),
      metadata: {
        resolver_version: PRODUCT_RESOLVER_VERSION,
        verified_candidate_count: Number(candidateCount || 0),
        completed_source_count: Number(completedSourceCount || 0),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_profile_id,theme_key" });
}

async function upsertCampaignProductCandidateItems({ supabase, rule, sourceUrl, items }) {
  if (!rule?.id) return;

  const themeKey = getCampaignThemeKey(rule);
  const rows = dedupeWebsiteItemsByUrlTitleAndImage(items)
    .filter(isValidCarouselProduct)
    .map((item) => ({
      user_id: rule.user_id,
      brand_profile_id: rule.brand_profile_id,
      rule_id: rule.id,
      theme_key: themeKey,
      source_url: sourceUrl,
      product_url: canonicalizeWebsiteProductUrl(item.url, sourceUrl) || item.url,
      title: item.title,
      description: item.description || "",
      image_url: item.image_url,
      price: item.price || null,
      campaign_fit_score: scoreCampaignFitForRule(item, rule),
      heuristic_fit_score: scoreCampaignFitForRule({ ...item, ai_campaign_fit_score: null }, rule),
      ai_fit_score: getAiCampaignFitScore(item),
      fit_tier: Number(item.campaign_fit_tier ?? (isEligibleCampaignCarouselProduct(item, rule) ? 0 : scoreCampaignFitForRule(item, rule) >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE ? 1 : 2)),
      score_version: PRODUCT_RESOLVER_VERSION,
      product_verified: true,
      verified_at: new Date().toISOString(),
      campaign_fit_source: item.campaign_fit_source || "hybrid_discovery_cache",
      selection_priority: Number(item.selection_priority || 0),
      is_active: true,
      metadata: {
        theme_matches: countCampaignCoreThemeTermMatches(item, rule),
        source_theme_matches: countCampaignSourceThemeMatches(item, rule),
        anchor_matches: countCampaignAnchorTermMatches(item, rule),
        primary_matches: countPrimaryCampaignTermMatches(item, rule),
        product_schema_verified: Boolean(item.product_schema_verified || item.product_json_ld_found || item.product_schema_found),
        ecommerce_proof_found: Boolean(item.ecommerce_proof_found || item.add_to_cart_detected),
        product_confidence: getCarouselProductConfidence(item),
        discovery_score: Number(item.discovery_score || 0),
        ai_fit_verdict: item.campaign_fit_verdict || "",
        ai_fit_reason: item.campaign_fit_reason || "",
      },
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) return;

  const { error } = await supabase
    .from("campaign_product_candidates")
    .upsert(rows, { onConflict: "brand_profile_id,theme_key,product_url" });

  if (error) {
    console.log("Could not update campaign product cache; delivery continues without cache", {
      ruleId: rule.id,
      count: rows.length,
      message: error.message,
      code: error.code,
    });
  }
}

async function markCampaignProductCandidateUsed({
  supabase,
  brandProfileId,
  themeKey,
  productUrl,
}) {
  if (!brandProfileId || !themeKey || !productUrl) return;

  const { error: rpcError } = await supabase.rpc("increment_campaign_product_candidate_usage", {
    p_brand_profile_id: brandProfileId,
    p_theme_key: themeKey,
    p_product_url: productUrl,
  });

  if (!rpcError) return;

  const { data, error } = await supabase
    .from("campaign_product_candidates")
    .select("id, times_used")
    .eq("brand_profile_id", brandProfileId)
    .eq("theme_key", themeKey)
    .eq("product_url", productUrl)
    .limit(1);

  if (error || !data?.length) return;

  await supabase
    .from("campaign_product_candidates")
    .update({
      times_used: Number(data[0].times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data[0].id);
}

async function commitCarouselProductUsage({
  supabase,
  rule,
  sourceUrl,
  products,
}) {
  const uniqueProducts = dedupeWebsiteItemsByUrlTitleAndImage(products);
  const themeKey = isCampaignScopedWebsiteRule(rule) ? getCampaignThemeKey(rule) : "";

  // Commit only after the post and all slides exist. Keep this sequential and
  // URL-specific so duplicate titles/images cannot mark unrelated products.
  for (const product of uniqueProducts) {
    const productUrl = canonicalizeWebsiteProductUrl(product.url, sourceUrl) || product.url;
    const usedSource = getWebsiteCatalogUsedSource(rule);
    const { error: catalogRpcError } = await supabase.rpc(
      "increment_website_product_catalog_usage",
      {
        p_brand_profile_id: rule.brand_profile_id,
        p_product_url: productUrl,
        p_used_source: usedSource,
      }
    );

    if (catalogRpcError) {
      await markWebsiteProductCatalogItemUsed({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        productUrl,
        sourceUrl,
        websiteItem: product,
        usedSource,
      });
    }

    if (themeKey) {
      await markCampaignProductCandidateUsed({
        supabase,
        brandProfileId: rule.brand_profile_id,
        themeKey,
        productUrl,
      });
    }
  }
}

function escapePostgrestSearchTerm(value) {
  return String(value || "")
    .replace(/[%_*]/g, "")
    .replace(/[(),]/g, " ")
    .trim();
}

function expandCampaignCatalogSearchTerms(terms) {
  const expanded = [];
  const seen = new Set();

  for (const rawTerm of terms || []) {
    const term = escapePostgrestSearchTerm(rawTerm);

    if (!term || term.length < 5) {
      continue;
    }

    for (const variant of [
      term,
      term.length >= 10 ? term.slice(0, 9) : "",
    ]) {
      if (!variant || variant.length < 5 || seen.has(variant)) {
        continue;
      }

      seen.add(variant);
      expanded.push(variant);

      if (expanded.length >= 8) {
        return expanded;
      }
    }
  }

  return expanded;
}

async function getWebsiteProductCatalogItemsByCampaignTerms({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  terms,
  limitPerTerm = 80,
}) {
  const usableTerms = expandCampaignCatalogSearchTerms(terms);

  if (!usableTerms.length) {
    return [];
  }

  const allItems = [];

  for (const term of usableTerms) {
    const pattern = `%${term}%`;
    const { data, error } = await supabase
      .from("website_product_catalog")
      .select(
        "id, product_url, title, description, price, currency, image_url, source_url, times_used, last_used_at, is_active, discovery_source"
      )
      .eq("user_id", userId)
      .eq("brand_profile_id", brandProfileId)
      .eq("is_active", true)
      .or(`title.ilike.${pattern},product_url.ilike.${pattern},description.ilike.${pattern}`)
      .order("times_used", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true })
      .limit(limitPerTerm);

    if (error) {
      console.error("Campaign catalog term search failed", {
        brandProfileId,
        sourceUrl,
        term,
        message: error.message,
        code: error.code,
      });
      continue;
    }

    allItems.push(...((data || []).map(normalizeWebsiteCatalogItem).filter(Boolean)));
  }

  return dedupeWebsiteItemsByUrlTitleAndImage(allItems);
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

  if (!error) {
    return;
  }

  console.error("Could not bulk upsert website product catalog items; falling back to row upsert", {
    brandProfileId,
    sourceUrl,
    count: rows.length,
    message: error.message,
    code: error.code,
  });

  for (const row of rows) {
    const { data: existingRows, error: readError } = await supabase
      .from("website_product_catalog")
      .select("id")
      .eq("user_id", userId)
      .eq("brand_profile_id", brandProfileId)
      .eq("product_url", row.product_url)
      .limit(10);

    if (readError) {
      console.error("Could not read website product catalog row during fallback upsert", {
        brandProfileId,
        productUrl: row.product_url,
        message: readError.message,
        code: readError.code,
      });
      continue;
    }

    if (existingRows?.length) {
      const { user_id, brand_profile_id, product_url, ...updatePayload } = row;
      const { error: updateError } = await supabase
        .from("website_product_catalog")
        .update({
          ...updatePayload,
          updated_at: new Date().toISOString(),
        })
        .in("id", existingRows.map((existingRow) => existingRow.id));

      if (updateError) {
        console.error("Could not update website product catalog row during fallback upsert", {
          brandProfileId,
          productUrl: row.product_url,
          message: updateError.message,
          code: updateError.code,
        });
      }

      continue;
    }

    const { error: insertError } = await supabase
      .from("website_product_catalog")
      .insert(row);

    if (insertError) {
      console.error("Could not insert website product catalog row during fallback upsert", {
        brandProfileId,
        productUrl: row.product_url,
        message: insertError.message,
        code: insertError.code,
      });
    }
  }
}

async function markWebsiteProductCatalogItemUsed({
  supabase,
  userId,
  brandProfileId,
  productUrl,
  sourceUrl = "",
  websiteItem = null,
  usedSource = null,
}) {
  if (!brandProfileId || !productUrl) {
    return;
  }

  const canonicalProductUrl =
    canonicalizeWebsiteProductUrl(productUrl, sourceUrl || productUrl) || productUrl;
  const normalizedWebsiteItem = websiteItem
    ? normalizeWebsiteItem(websiteItem, sourceUrl || productUrl)
    : null;
  const matchRowsById = new Map();

  async function collectMatchingRows(queryBuilder, matchType) {
    const { data, error } = await queryBuilder.limit(25);

    if (error) {
      console.error("Could not read website product catalog usage", {
        brandProfileId,
        productUrl: canonicalProductUrl,
        matchType,
        message: error.message,
        code: error.code,
      });
      return;
    }

    for (const row of data || []) {
      if (row?.id) {
        matchRowsById.set(row.id, row);
      }
    }
  }

  let baseQuery = supabase
    .from("website_product_catalog")
    .select("id, times_used, discovery_source")
    .eq("brand_profile_id", brandProfileId)
    .eq("product_url", canonicalProductUrl);

  if (userId) {
    baseQuery = baseQuery.eq("user_id", userId);
  }

  await collectMatchingRows(baseQuery, "product_url");

  if (userId && sourceUrl && canonicalProductUrl && !isBadProductUrl(canonicalProductUrl)) {
    const domainProductQuery = supabase
      .from("website_product_catalog")
      .select("id, times_used, discovery_source")
      .eq("user_id", userId)
      .eq("product_url", canonicalProductUrl);

    await collectMatchingRows(domainProductQuery, "domain_product_url");
  }

  const imageUrl = normalizedWebsiteItem?.image_url || websiteItem?.image_url || "";
  if (imageUrl) {
    let imageQuery = supabase
      .from("website_product_catalog")
      .select("id, times_used, discovery_source")
      .eq("brand_profile_id", brandProfileId)
      .eq("image_url", imageUrl);

    if (userId) {
      imageQuery = imageQuery.eq("user_id", userId);
    }

    await collectMatchingRows(imageQuery, "image_url");

    if (userId && sourceUrl) {
      const domainImageQuery = supabase
        .from("website_product_catalog")
        .select("id, times_used, discovery_source")
        .eq("user_id", userId)
        .eq("image_url", imageUrl);

      await collectMatchingRows(domainImageQuery, "domain_image_url");
    }
  }

  const title = normalizedWebsiteItem?.title || websiteItem?.title || "";
  if (title) {
    let titleQuery = supabase
      .from("website_product_catalog")
      .select("id, times_used, discovery_source")
      .eq("brand_profile_id", brandProfileId)
      .eq("title", title);

    if (userId) {
      titleQuery = titleQuery.eq("user_id", userId);
    }

    await collectMatchingRows(titleQuery, "title");
  }

  const matchingRows = Array.from(matchRowsById.values());

  if (!matchingRows.length) {
    console.warn("Could not find website product catalog row to mark used", {
      brandProfileId,
      productUrl: canonicalProductUrl,
      title: title || null,
    });
    return;
  }

  for (const row of matchingRows) {
    const updatePayload = {
      times_used: Number(row.times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (usedSource) {
      updatePayload.discovery_source = usedSource;
    }

    const { error: updateError } = await supabase
      .from("website_product_catalog")
      .update(updatePayload)
      .eq("id", row.id);

    if (updateError) {
      console.error("Could not update website product catalog usage", {
        brandProfileId,
        productUrl,
        rowId: row.id,
        message: updateError.message,
        code: updateError.code,
      });
    }
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

function hasProductSearchMetadata(rule) {
  return Boolean(
    splitCampaignTermLine(rule?.product_match_terms).length ||
      splitCampaignTermLine(rule?.product_search_queries).length ||
      splitCampaignTermLine(rule?.product_avoid_terms).length ||
      splitCampaignTermLine(rule?.avoid_terms).length ||
      String(rule?.product_search_intent || "").trim()
  );
}

function isProductIntentScopedWebsiteRule(rule) {
  return Boolean(
    isCampaignScopedWebsiteRule(rule) ||
      hasProductSearchMetadata(rule)
  );
}

function formatCampaignVisualContextForPrompt(rule) {
  if (!isCampaignScopedWebsiteRule(rule)) {
    return "";
  }

  const matchTerms = extractExplicitCampaignMatchTerms(rule).slice(0, 16);
  const avoidTerms = extractCampaignAvoidTerms(rule).slice(0, 12);
  const campaignTheme = [
    rule?.name,
    rule?.campaign_goal,
    rule?.target_customer_need,
    rule?.marketing_angle,
    extractPromptLineValue(rule?.prompt, "Campaign"),
    extractPromptLineValue(rule?.prompt, "Campaign context"),
  ]
    .filter(Boolean)
    .join(" | ");

  return `Campaign visual context:
${campaignTheme || "Campaign theme not explicitly named."}
Product/theme match terms: ${matchTerms.length ? matchTerms.join(", ") : "Not provided"}
Avoid visual/product terms: ${avoidTerms.length ? avoidTerms.join(", ") : "Not provided"}`;
}

function getWebsiteCatalogDiscoverySource(baseSource, rule) {
  const cleanSource = String(baseSource || "live_research").trim() || "live_research";

  if (isCampaignScopedWebsiteRule(rule)) {
    return `campaign_${cleanSource}`;
  }

  if (isProductIntentScopedWebsiteRule(rule)) {
    return `intent_${cleanSource}`;
  }

  return `general_${cleanSource}`;
}

function getWebsiteCatalogUsedSource(rule) {
  if (isCampaignScopedWebsiteRule(rule)) {
    return "campaign_used";
  }

  if (isProductIntentScopedWebsiteRule(rule)) {
    return "intent_used";
  }

  return "general_used";
}

function buildCampaignResearchText(rule) {
  const productMatchTerms = splitCampaignTermLine(rule?.product_match_terms).slice(0, 16);
  const productSearchQueries = splitCampaignTermLine(rule?.product_search_queries).slice(0, 8);
  const productAvoidTerms = collectUniqueTerms(
    [
      ...splitCampaignTermLine(rule?.product_avoid_terms),
      ...splitCampaignTermLine(rule?.avoid_terms),
    ],
    12
  );

  return [
    rule?.name,
    productSearchQueries.length ? `Product search queries: ${productSearchQueries.join(", ")}` : "",
    productMatchTerms.length ? `Campaign product match terms: ${productMatchTerms.join(", ")}` : "",
    productAvoidTerms.length ? `Avoid product terms: ${productAvoidTerms.join(", ")}` : "",
    rule?.product_search_intent ? `Product search intent: ${rule.product_search_intent}` : "",
    rule?.prompt,
    rule?.image_prompt,
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
  const sourceItems = (Array.isArray(items) ? items : []).filter((item) => {
    const itemUrl = item?.url || item?.product_url || item?.item_url || "";
    const sourceUrl = item?.source_url || item?.website_url || itemUrl;

    return !isLikelyBadDiscoveryPageUrl(itemUrl, sourceUrl);
  });

  if (isProductIntentScopedWebsiteRule(rule)) {
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

function extractPromptLineValue(prompt, label) {
  const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(prompt || "").match(
    new RegExp(`^\\s*(?:[-*]\\s*)?${escapedLabel}:\\s*(.+)$`, "im")
  );

  return match?.[1]?.trim() || "";
}

function splitCampaignTermLine(value) {
  let rawTerms = [];

  if (Array.isArray(value)) {
    rawTerms = value;
  } else if (value && typeof value === "object") {
    rawTerms = Object.values(value).flat();
  } else {
    const rawText = String(value || "").trim();

    if ((rawText.startsWith("[") && rawText.endsWith("]")) || (rawText.startsWith("{") && rawText.endsWith("}"))) {
      try {
        const parsed = JSON.parse(rawText);
        rawTerms = Array.isArray(parsed) ? parsed : Object.values(parsed || {}).flat();
      } catch {
        rawTerms = [rawText];
      }
    } else {
      rawTerms = [rawText];
    }
  }

  return rawTerms
    .flatMap((term) => String(term || "").split(/[,;|\n]+/u))
    .map((term) => normalizeSearchText(term).replace(/[\[\]{}"']/g, " ").replace(/\s+/g, " ").trim())
    .filter((term) => term.length >= 2 && term.length <= 70 && !/^\d+$/.test(term));
}

function buildFallbackProductSearchQueriesForRule(rule, limit = CAMPAIGN_STORE_SEARCH_QUERY_LIMIT) {
  const existingQueries = splitCampaignTermLine(rule?.product_search_queries);
  const focusTerms = collectUniqueTerms([
    ...extractCampaignCoreThemeTerms(rule),
    ...splitCampaignTermLine(rule?.product_match_terms),
  ], 20);
  const focusedExistingQueries = existingQueries.filter((query) => {
    const words = query.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 5 || query.length > 55) return false;
    return focusTerms.some((term) => {
      const normalizedTerm = normalizeSearchText(term);
      return normalizedTerm && (query.includes(normalizedTerm) || normalizedTerm.includes(query));
    });
  });

  if (focusedExistingQueries.length >= 2) {
    return anchorCampaignTermsForRule(focusedExistingQueries, rule, limit);
  }

  const rawProductMatchTerms = splitCampaignTermLine(rule?.product_match_terms);
  const supportedProductMatchTerms = filterCampaignMatchTermsForRule(rawProductMatchTerms, rule);
  const unsupportedProductMatchTerms = rawProductMatchTerms.filter(
    (term) => !supportedProductMatchTerms.includes(term)
  );
  const campaignThemeTerms = collectUniqueTerms(
    [
      ...extractCampaignCoreThemeTerms(rule),
      ...splitCampaignTermLine(rule?.name),
      ...splitCampaignTermLine(rule?.product_search_intent),
    ],
    8
  );
  const scopedProductQueries = [];

  for (const themeTerm of campaignThemeTerms.slice(0, 4)) {
    for (const productTerm of unsupportedProductMatchTerms.slice(0, 8)) {
      if (!themeTerm || !productTerm || productTerm.includes(themeTerm)) {
        continue;
      }

      scopedProductQueries.push(`${themeTerm} ${productTerm}`);
      scopedProductQueries.push(`${productTerm} ${themeTerm}`);
    }
  }

  const seedTerms = [
    ...campaignThemeTerms,
    ...supportedProductMatchTerms,
    ...scopedProductQueries,
    ...splitCampaignTermLine(rule?.product_search_intent),
  ];

  const normalizedQueries = collectUniqueTerms(seedTerms, limit)
    .map((term) => anchorCampaignTermsForRule([term], rule, 1)[0] || term)
    .filter((term) => {
      const words = term.split(/\s+/).filter(Boolean);
      if (!words.length || words.length > 6) return false;
      if (genericWebsiteTextIntentTokens.has(term)) return false;
      return true;
    })
    .slice(0, limit);

  if (normalizedQueries.length) {
    return normalizedQueries;
  }

  // Last local fallback: use the campaign-specific AI terms themselves. These
  // are still dynamic per campaign, but they prevent an empty query list from
  // turning a valid campaign into a zero-product run.
  return collectUniqueTerms(
    [
      ...rawProductMatchTerms,
      ...campaignThemeTerms,
      ...scopedProductQueries,
    ],
    limit
  )
    .map((term) => anchorCampaignTermsForRule([term], rule, 1)[0] || term)
    .filter((term) => {
      const words = term.split(/\s+/).filter(Boolean);
      return words.length > 0 && words.length <= 6 && !genericWebsiteTextIntentTokens.has(term);
    })
    .slice(0, limit);
}

async function ensureProductSearchQueriesForRule({ supabase, rule }) {
  const fallbackQueries = buildFallbackProductSearchQueriesForRule(rule);

  if (!fallbackQueries.length) {
    return rule;
  }

  const existingQueries = splitCampaignTermLine(rule?.product_search_queries);
  if (existingQueries.length) {
    const normalizedExistingQueries = anchorCampaignTermsForRule(
      existingQueries,
      rule,
      CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
    );

    try {
      if (normalizedExistingQueries.join("|") !== collectUniqueTerms(existingQueries, CAMPAIGN_STORE_SEARCH_QUERY_LIMIT).join("|")) {
        await supabase
          .from("automation_rules")
          .update({
            product_search_queries: normalizedExistingQueries,
            updated_at: new Date().toISOString(),
          })
          .eq("id", rule.id)
          .eq("user_id", rule.user_id);
      }
    } catch (error) {
      console.warn("Could not persist normalized product_search_queries; using them for this run only", {
        ruleId: rule?.id,
        message: error?.message,
      });
    }

    return {
      ...rule,
      product_search_queries: normalizedExistingQueries,
    };
  }

  const updatedRule = {
    ...rule,
    product_search_queries: fallbackQueries,
    product_search_queries_derived: true,
  };

  try {
    await supabase
      .from("automation_rules")
      .update({
        product_search_queries: fallbackQueries,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id)
      .eq("user_id", rule.user_id);
  } catch (error) {
    console.warn("Could not persist derived product_search_queries; using them for this run only", {
      ruleId: rule?.id,
      message: error?.message,
    });
  }

  return updatedRule;
}

function collectUniqueTerms(terms, limit = 24) {
  const seen = new Set();
  const unique = [];

  for (const term of terms || []) {
    const normalized = normalizeSearchText(term).trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);

    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

const genericWebsiteTextIntentTokens = new Set([
  "automation",
  "availability",
  "available",
  "based",
  "banner",
  "banners",
  "brand",
  "business",
  "build",
  "campaign",
  "caption",
  "clear",
  "clearly",
  "concrete",
  "connected",
  "content",
  "create",
  "customer",
  "customers",
  "decorative",
  "destination",
  "discount",
  "discounts",
  "draft",
  "educate",
  "focused",
  "followers",
  "found",
  "from",
  "guarantee",
  "guarantees",
  "helpful",
  "hero",
  "hours",
  "identify",
  "image",
  "images",
  "information",
  "instead",
  "invent",
  "item",
  "listing",
  "logos",
  "media",
  "mode",
  "more",
  "offer",
  "opening",
  "post",
  "prices",
  "product",
  "profile",
  "promote",
  "promotes",
  "push",
  "professional",
  "relevant",
  "rule",
  "sales",
  "selected",
  "sell",
  "sellable",
  "service",
  "social",
  "something",
  "specific",
  "stay",
  "strong",
  "trust",
  "trustworthy",
  "unrelated",
  "visible",
  "website",
  "webbplats",
  "hemsida",
  "inlagg",
  "kampanj",
  "konkret",
  "produkt",
  "produkter",
  "profil",
  "salj",
  "skapa",
  "tjanst",
  "tjanster",
  "utkast",
]);

function stripDefaultWebsiteTextPromptNoise(value) {
  return String(value || "")
    .replace(/this post is part of a strategic content sequence for the goal:[^\n\r.]*\.?/gi, " ")
    .replace(/^post role:\s*.+$/gim, " ")
    .replace(/^strategic purpose:\s*.+$/gim, " ")
    .replace(/^marketing angle:\s*.+$/gim, " ")
    .replace(/^customer stage:\s*.+$/gim, " ")
    .replace(/^cta strength:\s*.+$/gim, " ")
    .replace(/make this post clearly different from the other posts in the plan\.?/gi, " ")
    .replace(/do not just create a generic mixed post\.?/gi, " ")
    .replace(/if website products are used, choose products that fit this exact role and audience need, not random products from the website\.?/gi, " ")
    .replace(/use the website url from the brand profile\.?/gi, " ")
    .replace(/identify one concrete product, service, listing, offer or other sellable item from the website\.?/gi, " ")
    .replace(/create a social media post that promotes that specific item in a helpful, trustworthy and sales-focused way\.?/gi, " ")
    .replace(/use only information that clearly appears on the website\.?/gi, " ")
    .replace(/do not invent prices, discounts, guarantees, opening hours, features or availability\.?/gi, " ")
    .replace(/use a relevant image connected to the selected website item if one can be found\.?/gi, " ")
    .replace(/avoid logos, banners, hero images, decorative icons and unrelated images\.?/gi, " ")
    .replace(/if no clearly relevant product, service, listing or offer image can be found, create a professional ai image based on the selected item instead\.?/gi, " ");
}

function isUsefulWebsiteTextIntentToken(token) {
  const value = normalizeSearchText(token).trim();

  return (
    value.length >= 3 &&
    value.length <= 34 &&
    !/^\d+$/.test(value) &&
    !weakShortSearchRoots.has(value) &&
    !genericWebsiteTextIntentTokens.has(value)
  );
}

function extractWebsiteTextIntentTermsFromText(value, limit = WEBSITE_TEXT_INTENT_MATCH_TERM_LIMIT) {
  const normalized = normalizeSearchText(stripDefaultWebsiteTextPromptNoise(value))
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bwww\.\S+/g, " ");
  const segments = normalized
    .split(/[\n\r.!?;:|()[\]{}<>]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const terms = [];

  for (const segment of segments) {
    const tokens = segment
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter(isUsefulWebsiteTextIntentToken);

    if (!tokens.length) {
      continue;
    }

    for (let index = 0; index < tokens.length; index += 1) {
      const threeWordPhrase = tokens.slice(index, index + 3);
      const twoWordPhrase = tokens.slice(index, index + 2);

      if (threeWordPhrase.length === 3) {
        terms.push(threeWordPhrase.join(" "));
      }

      if (twoWordPhrase.length === 2) {
        terms.push(twoWordPhrase.join(" "));
      }
    }

    terms.push(...tokens);
  }

  return collectUniqueTerms(terms, limit);
}

function getWebsiteTextIntentSourceText(rule) {
  const prompt = String(rule?.prompt || "");
  const imagePrompt = String(rule?.image_prompt || "");

  return [
    rule?.name,
    stripDefaultWebsiteTextPromptNoise(prompt),
    stripDefaultWebsiteTextPromptNoise(imagePrompt),
    extractPromptLineValue(prompt, "Campaign"),
    extractPromptLineValue(prompt, "Campaign context"),
    extractPromptLineValue(prompt, "Product selection hint"),
    extractPromptLineValue(prompt, "Product search intent"),
    rule?.campaign_goal,
    rule?.target_customer_need,
    rule?.marketing_angle,
    rule?.strategy_notes,
    rule?.product_search_intent,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeWebsiteTextIntentMetadata(metadata = {}) {
  return {
    productMatchTerms: collectUniqueTerms(
      [
        ...splitCampaignTermLine(metadata.product_match_terms),
        ...splitCampaignTermLine(metadata.productMatchTerms),
        ...(Array.isArray(metadata.product_match_terms) ? metadata.product_match_terms : []),
        ...(Array.isArray(metadata.productMatchTerms) ? metadata.productMatchTerms : []),
      ],
      WEBSITE_TEXT_INTENT_MATCH_TERM_LIMIT
    ),
    productSearchQueries: collectUniqueTerms(
      [
        ...splitCampaignTermLine(metadata.product_search_queries),
        ...splitCampaignTermLine(metadata.productSearchQueries),
        ...(Array.isArray(metadata.product_search_queries) ? metadata.product_search_queries : []),
        ...(Array.isArray(metadata.productSearchQueries) ? metadata.productSearchQueries : []),
      ],
      WEBSITE_TEXT_INTENT_QUERY_LIMIT
    ),
    productAvoidTerms: collectUniqueTerms(
      [
        ...splitCampaignTermLine(metadata.product_avoid_terms),
        ...splitCampaignTermLine(metadata.productAvoidTerms),
        ...splitCampaignTermLine(metadata.avoid_terms),
        ...(Array.isArray(metadata.product_avoid_terms) ? metadata.product_avoid_terms : []),
        ...(Array.isArray(metadata.productAvoidTerms) ? metadata.productAvoidTerms : []),
        ...(Array.isArray(metadata.avoid_terms) ? metadata.avoid_terms : []),
      ],
      WEBSITE_TEXT_INTENT_AVOID_LIMIT
    ),
    productSearchIntent: String(
      metadata.product_search_intent ||
        metadata.productSearchIntent ||
        ""
    ).trim(),
  };
}

function buildDeterministicWebsiteTextProductIntent(rule) {
  const sourceText = getWebsiteTextIntentSourceText(rule);
  const inferredTerms = extractWebsiteTextIntentTermsFromText(sourceText);
  const existingMetadata = normalizeWebsiteTextIntentMetadata({
    product_match_terms: rule?.product_match_terms,
    product_search_queries: rule?.product_search_queries,
    product_avoid_terms: rule?.product_avoid_terms,
    avoid_terms: rule?.avoid_terms,
    product_search_intent: rule?.product_search_intent,
  });
  const productMatchTerms = collectUniqueTerms(
    [
      ...existingMetadata.productMatchTerms,
      ...inferredTerms,
    ],
    WEBSITE_TEXT_INTENT_MATCH_TERM_LIMIT
  );
  const productSearchQueries = collectUniqueTerms(
    [
      ...existingMetadata.productSearchQueries,
      ...inferredTerms.slice(0, WEBSITE_TEXT_INTENT_QUERY_LIMIT),
    ],
    WEBSITE_TEXT_INTENT_QUERY_LIMIT
  );
  const productAvoidTerms = existingMetadata.productAvoidTerms;
  const productSearchIntent =
    existingMetadata.productSearchIntent ||
    (productMatchTerms.length
      ? `Prioritize concrete website products matching: ${productMatchTerms.slice(0, 8).join(", ")}.`
      : "");

  return {
    productMatchTerms,
    productSearchQueries,
    productAvoidTerms,
    productSearchIntent,
    hasSpecificIntent:
      hasProductSearchMetadata(rule) ||
      inferredTerms.length >= WEBSITE_TEXT_INTENT_AI_MIN_SIGNAL_TERMS,
  };
}

function applyWebsiteTextProductIntentToRule(rule, intentMetadata) {
  const normalized = normalizeWebsiteTextIntentMetadata({
    product_match_terms: intentMetadata.productMatchTerms,
    product_search_queries: intentMetadata.productSearchQueries,
    product_avoid_terms: intentMetadata.productAvoidTerms,
    product_search_intent: intentMetadata.productSearchIntent,
  });

  if (
    !normalized.productMatchTerms.length &&
    !normalized.productSearchQueries.length &&
    !normalized.productAvoidTerms.length &&
    !normalized.productSearchIntent
  ) {
    return rule;
  }

  return {
    ...rule,
    product_match_terms: normalized.productMatchTerms.join(", "),
    product_search_queries: normalized.productSearchQueries.join(", "),
    product_avoid_terms: normalized.productAvoidTerms.join(", "),
    product_search_intent: normalized.productSearchIntent || rule?.product_search_intent || null,
    website_text_product_intent_applied: true,
  };
}

async function generateWebsiteTextProductIntentWithAi({
  openai,
  rule,
  brandProfile,
  deterministicIntent,
}) {
  if (!openai || !deterministicIntent?.hasSpecificIntent) {
    return null;
  }

  const response = await openai.responses.create({
    model: PRODUCT_RESEARCH_FAST_MODEL,
    ...getReasoningOptionsForModel(PRODUCT_RESEARCH_FAST_MODEL),
    input: `
You create product search metadata for a social media automation product finder.

Goal:
The app must select one real website product/service/listing that fits the user's website post prompt.

Rules:
- Do not use fixed holiday lists or hardcoded Swedish/English campaign words.
- Infer meaning from the brand, language, market, prompt and any existing seed terms.
- Return local-language website search terms that a real store search box could use.
- Prefer short exact terms, category terms, recipient/use-case terms and theme terms.
- Avoid generic words like product, website, post, campaign, custom or offer unless they are truly part of the customer's product vocabulary.
- If the prompt has no specific theme, occasion, recipient, category or product intent, return empty arrays.

Brand profile:
${formatBrandProfileForPrompt(brandProfile)}

Automation name:
${rule?.name || ""}

Automation prompt:
${stripDefaultWebsiteTextPromptNoise(rule?.prompt || "")}

Image prompt:
${stripDefaultWebsiteTextPromptNoise(rule?.image_prompt || "")}

Existing inferred terms:
${deterministicIntent.productMatchTerms.join(", ") || "None"}

Return strict JSON only:
{
  "product_match_terms": ["5-12 short terms"],
  "product_search_queries": ["3-8 short store-search queries"],
  "product_avoid_terms": ["0-8 short avoid terms"],
  "product_search_intent": "One short internal sentence"
}
    `.trim(),
  });

  const parsed = safeJsonParse(response.output_text || "");
  return normalizeWebsiteTextIntentMetadata(parsed);
}

async function resolveWebsiteTextProductIntentRule({
  openai,
  rule,
  brandProfile,
}) {
  if (!rule?.uses_website_content || isCarouselRule(rule)) {
    return rule;
  }

  const deterministicIntent = buildDeterministicWebsiteTextProductIntent(rule);

  if (!deterministicIntent.hasSpecificIntent) {
    return rule;
  }

  let aiIntent = null;

  if (!isCampaignScopedWebsiteRule(rule)) {
    try {
      aiIntent = await generateWebsiteTextProductIntentWithAi({
        openai,
        rule,
        brandProfile,
        deterministicIntent,
      });
    } catch (error) {
      console.log("Website text product-intent AI expansion failed; using deterministic terms", {
        ruleId: rule?.id,
        brandProfileId: rule?.brand_profile_id,
        message: error.message,
      });
    }
  }

  const mergedIntent = {
    productMatchTerms: collectUniqueTerms(
      [
        ...(aiIntent?.productMatchTerms || []),
        ...deterministicIntent.productMatchTerms,
      ],
      WEBSITE_TEXT_INTENT_MATCH_TERM_LIMIT
    ),
    productSearchQueries: collectUniqueTerms(
      [
        ...(aiIntent?.productSearchQueries || []),
        ...deterministicIntent.productSearchQueries,
      ],
      WEBSITE_TEXT_INTENT_QUERY_LIMIT
    ),
    productAvoidTerms: collectUniqueTerms(
      [
        ...(aiIntent?.productAvoidTerms || []),
        ...deterministicIntent.productAvoidTerms,
      ],
      WEBSITE_TEXT_INTENT_AVOID_LIMIT
    ),
    productSearchIntent:
      aiIntent?.productSearchIntent ||
      deterministicIntent.productSearchIntent,
  };

  return applyWebsiteTextProductIntentToRule(rule, mergedIntent);
}

function getCampaignThemeSourceText(rule) {
  const prompt = String(rule?.prompt || "");

  return normalizeSearchText([
    rule?.name,
    extractPromptLineValue(prompt, "Campaign"),
    extractPromptLineValue(prompt, "Campaign context"),
    extractPromptLineValue(prompt, "Product selection hint"),
    extractPromptLineValue(prompt, "Product search intent"),
    rule?.campaign_goal,
    rule?.target_customer_need,
    rule?.strategy_notes,
    rule?.marketing_angle,
    prompt,
  ].filter(Boolean).join(" "));
}

function hasAnyCampaignThemeToken(text, tokens) {
  return (tokens || []).some((token) => {
    const value = normalizeSearchText(token).trim();
    return value && (text.includes(value) || new RegExp(`\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`, "i").test(text));
  });
}

// Campaign product terms come from AI-generated metadata saved on the rule
// and/or prompt context. Do not infer localized theme words in code; Spreelo
// must work globally across languages and markets.

function extractRawExplicitCampaignMatchTerms(rule) {
  const prompt = String(rule?.prompt || "");
  const imagePrompt = String(rule?.image_prompt || "");
  return collectUniqueTerms(
    [
      ...splitCampaignTermLine(rule?.product_match_terms),
      ...splitCampaignTermLine(extractPromptLineValue(prompt, "Product match terms")),
      ...splitCampaignTermLine(extractPromptLineValue(prompt, "Campaign product match terms")),
      ...splitCampaignTermLine(extractPromptLineValue(prompt, "Product terms")),
      ...splitCampaignTermLine(extractPromptLineValue(imagePrompt, "Product match terms")),
      ...splitCampaignTermLine(extractPromptLineValue(imagePrompt, "Campaign product match terms")),
      ...splitCampaignTermLine(extractPromptLineValue(imagePrompt, "Product terms")),
    ],
    30
  );
}

function campaignTermIsSupportedByCampaignContext(term, rule) {
  const normalizedTerm = normalizeSearchText(term).trim();
  const sourceText = normalizeSearchText(getCampaignAnchorSourceText(rule));

  if (!normalizedTerm || !sourceText) {
    return true;
  }

  if (hasCampaignPhraseMatch(sourceText, normalizedTerm)) {
    return true;
  }

  const termTokens = tokenizeSearchText(normalizedTerm);
  const sourceTokens = tokenizeSearchText(sourceText)
    .filter((word) => word.length >= 4 && !weakShortSearchRoots.has(word));

  if (!termTokens.length || !sourceTokens.length) {
    return true;
  }

  for (const sourceToken of sourceTokens) {
    const compactThemeRoot = getCompactCampaignThemeRoot(sourceToken);

    for (const termToken of termTokens) {
      if (!termToken || termToken.length < 3) continue;

      if (termToken === sourceToken) {
        return true;
      }

      const minLength = Math.min(termToken.length, sourceToken.length);
      const commonLength = getCommonPrefix([termToken, sourceToken]).length;

      if (commonLength >= Math.min(6, minLength) || commonLength >= Math.ceil(minLength * 0.75)) {
        return true;
      }

      if (
        compactThemeRoot &&
        (termToken === compactThemeRoot ||
          (termToken.startsWith(compactThemeRoot) && termToken.length >= compactThemeRoot.length + 2))
      ) {
        return true;
      }
    }
  }

  return false;
}

function filterCampaignMatchTermsForRule(terms, rule) {
  const rawTerms = collectUniqueTerms(terms, 30);

  if (!rawTerms.length || !isCampaignScopedWebsiteRule(rule)) {
    return rawTerms;
  }

  const filteredTerms = rawTerms.filter((term) =>
    campaignTermIsSupportedByCampaignContext(term, rule)
  );

  return filteredTerms.length ? filteredTerms : rawTerms;
}

function getCampaignTermAnchorTokensForRule(rule) {
  const sourceText = normalizeSearchText(getCampaignAnchorSourceText(rule));
  const tokens = sourceText
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !weakShortSearchRoots.has(word));
  const anchors = [];
  const seen = new Set();

  for (const token of tokens) {
    const compactRoot = getCompactCampaignThemeRoot(token);

    for (const value of [compactRoot, token]) {
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

function anchorCampaignTermsForRule(terms, rule, limit = 30) {
  const rawTerms = collectUniqueTerms(terms, limit);

  if (!rawTerms.length || !isCampaignScopedWebsiteRule(rule)) {
    return rawTerms;
  }

  const anchorTokens = getCampaignTermAnchorTokensForRule(rule);
  const primaryAnchor = anchorTokens.find(Boolean);

  if (!primaryAnchor) {
    return rawTerms;
  }

  return collectUniqueTerms(
    rawTerms.map((term) =>
      campaignTermIsSupportedByCampaignContext(term, rule)
        ? term
        : `${primaryAnchor} ${term}`.slice(0, 70)
    ),
    limit
  );
}

function extractExplicitCampaignMatchTerms(rule) {
  return filterCampaignMatchTermsForRule(
    extractRawExplicitCampaignMatchTerms(rule),
    rule
  );
}

function extractCampaignAvoidTerms(rule) {
  const prompt = String(rule?.prompt || "");
  const imagePrompt = String(rule?.image_prompt || "");
  return collectUniqueTerms(
    [
      ...splitCampaignTermLine(rule?.product_avoid_terms),
      ...splitCampaignTermLine(rule?.avoid_terms),
      ...splitCampaignTermLine(extractPromptLineValue(prompt, "Avoid product terms")),
      ...splitCampaignTermLine(extractPromptLineValue(prompt, "Avoid terms")),
      ...splitCampaignTermLine(extractPromptLineValue(prompt, "Campaign avoid terms")),
      ...splitCampaignTermLine(extractPromptLineValue(imagePrompt, "Avoid product terms")),
      ...splitCampaignTermLine(extractPromptLineValue(imagePrompt, "Avoid terms")),
      ...splitCampaignTermLine(extractPromptLineValue(imagePrompt, "Campaign avoid terms")),
    ],
    30
  );
}

function extractCampaignTerms(rule) {
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const prompt = String(rule?.prompt || "");
  const source = [
    rule?.name,
    extractPromptLineValue(prompt, "Campaign"),
    extractPromptLineValue(prompt, "Product selection hint"),
    extractPromptLineValue(prompt, "Campaign context"),
    rule?.campaign_goal,
    rule?.target_customer_need,
    rule?.strategy_notes,
    rule?.marketing_angle,
    prompt,
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

  for (const word of [...explicitTerms, ...rawWords]) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    terms.push(word);
    if (terms.length >= 24) {
      break;
    }
  }

  return terms;
}

function getCommonPrefix(values) {
  const words = (values || []).filter(Boolean);

  if (!words.length) {
    return "";
  }

  let prefix = words[0];

  for (const word of words.slice(1)) {
    let index = 0;
    const maxLength = Math.min(prefix.length, word.length);

    while (index < maxLength && prefix[index] === word[index]) {
      index += 1;
    }

    prefix = prefix.slice(0, index);

    if (!prefix) {
      break;
    }
  }

  return prefix;
}

function getCampaignTermWords(terms) {
  return (terms || [])
    .flatMap((term) =>
      normalizeSearchText(term)
        .split(/[^\p{L}\p{N}]+/u)
        .map((word) => word.trim())
    )
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word));
}

function isUsefulShortCampaignRoot(term) {
  const value = normalizeSearchText(term).trim();

  return (
    value.length >= 3 &&
    value.length <= 6 &&
    !/^\d+$/.test(value) &&
    !weakShortSearchRoots.has(value)
  );
}

function extractCompactPrimaryCampaignRoots(explicitTerms) {
  const normalizedExplicitTerms = collectUniqueTerms(explicitTerms, 40);
  const words = getCampaignTermWords(normalizedExplicitTerms);
  const groupedByPrefix = new Map();

  // Only keep very short direct terms when AI explicitly supplied that exact
  // term as a campaign/product match term. This avoids accidental roots from
  // broad business words while staying language-neutral.
  const directShortTerms = words.filter((word) =>
    isUsefulShortCampaignRoot(word) &&
    normalizedExplicitTerms.some((term) => term === word)
  );

  for (const word of words.filter((term) => term.length >= 6)) {
    const key = word.slice(0, 3);

    if (!isUsefulShortCampaignRoot(key)) {
      continue;
    }

    if (!groupedByPrefix.has(key)) {
      groupedByPrefix.set(key, new Set());
    }

    groupedByPrefix.get(key).add(word);
  }

  const sharedRoots = [];

  for (const groupSet of groupedByPrefix.values()) {
    const group = Array.from(groupSet);

    // A short root is useful only when several explicit AI-created terms point
    // to the same theme root. A single long term must not create a broad
    // three-letter root by itself.
    if (group.length < 2) {
      continue;
    }

    const prefix = getCommonPrefix(group);

    if (isUsefulShortCampaignRoot(prefix)) {
      sharedRoots.push(prefix);
    } else if (prefix.length > 6) {
      sharedRoots.push(prefix);
    }
  }

  return collectUniqueTerms([...directShortTerms, ...sharedRoots], 8);
}

function extractPrimaryCampaignTerms(rule) {
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const compactPrimaryRoots = extractCompactPrimaryCampaignRoots(explicitTerms);
  const prompt = String(rule?.prompt || "");
  const source = [
    rule?.name,
    extractPromptLineValue(prompt, "Campaign"),
    extractPromptLineValue(prompt, "Campaign context"),
    rule?.campaign_goal,
  ]
    .filter(Boolean)
    .join(" ");

  const normalized = normalizeSearchText(source);
  const rawWords = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 5 && !/^\d+$/.test(word));

  const seen = new Set();
  const terms = [];

  for (const word of [...explicitTerms, ...compactPrimaryRoots, ...rawWords]) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    terms.push(word);
    if (terms.length >= 10) {
      break;
    }
  }

  return terms;
}

function getPrimaryCampaignShortRoots(rule) {
  return new Set(extractCompactPrimaryCampaignRoots(extractExplicitCampaignMatchTerms(rule)));
}

function hasCampaignPhraseMatch(text, term) {
  const normalizedText = normalizeSearchText(text);
  const normalizedTerm = normalizeSearchText(term).trim();

  if (!normalizedText || !normalizedTerm) {
    return false;
  }

  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\p{L}\p{N}])${escapedTerm}([^\p{L}\p{N}]|$)`, "u").test(normalizedText);
}

function tokenizeSearchText(value) {
  return normalizeSearchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getWebsiteItemCampaignText(item) {
  return [
    item?.title,
    item?.url,
    item?.product_url,
    item?.item_url,
    item?.source_url,
    item?.description,
    item?.reason,
    item?.catalog_source,
    item?.discovery_source,
    item?.campaign_fit_source,
  ]
    .filter(Boolean)
    .join(" ");
}

function getWebsiteItemDirectCampaignText(item) {
  return [
    item?.title,
    item?.url,
    item?.product_url,
    item?.item_url,
    item?.description,
  ]
    .filter(Boolean)
    .join(" ");
}

function getCampaignTitleCandidates(rule) {
  const prompt = String(rule?.prompt || "");
  const imagePrompt = String(rule?.image_prompt || "");

  return collectUniqueTerms(
    [
      rule?.name,
      extractPromptLineValue(prompt, "Campaign"),
      extractPromptLineValue(prompt, "Campaign title"),
      extractPromptLineValue(prompt, "Campaign name"),
      extractPromptLineValue(imagePrompt, "Campaign"),
      extractPromptLineValue(imagePrompt, "Campaign title"),
      extractPromptLineValue(imagePrompt, "Campaign name"),
    ].filter(Boolean),
    8
  );
}

function getCampaignCoreTitleSegment(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return text.split(/\s+(?:-|\u2013|\u2014)\s+|\s*(?::|\||\u2022)\s*/u)[0]?.trim() || text;
}

function getCompactCampaignThemeRoot(word) {
  // Do not derive three-letter roots from named themes. They are too lossy and
  // previously made unrelated products look like exact campaign matches.
  return "";
}

function extractCampaignCoreThemeTerms(rule) {
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const explicitRoots = extractCompactPrimaryCampaignRoots(explicitTerms);
  const titleCandidates = getCampaignTitleCandidates(rule);
  const terms = [...explicitRoots];

  for (const candidate of titleCandidates) {
    const segment = getCampaignCoreTitleSegment(candidate);
    const words = tokenizeSearchText(segment)
      .filter((word) => word.length >= 3 && !/^\d+$/.test(word));

    const phraseWords = words.filter((word) => word.length >= 3).slice(0, 3);

    if (phraseWords.length >= 2) {
      terms.push(phraseWords.join(" "));
    }

    for (const word of words.slice(0, 3)) {
      if (word.length >= 4 && !weakShortSearchRoots.has(word)) {
        terms.push(word);
      }

      const compactRoot = getCompactCampaignThemeRoot(word);

      if (compactRoot) {
        terms.push(compactRoot);
      }
    }
  }

  return collectUniqueTerms(terms, 10);
}

function countCampaignThemeTermMatchesInText(value, rule) {
  const terms = extractCampaignCoreThemeTerms(rule);

  if (!terms.length) {
    return 0;
  }

  const campaignText = normalizeSearchText(value);
  const tokenSet = new Set(tokenizeSearchText(campaignText));
  const shortRoots = new Set(terms.filter(isUsefulShortCampaignRoot));
  let matches = 0;

  for (const term of terms) {
    if (hasStrongCampaignTermMatchAgainstTokens({ campaignText, tokens: tokenSet, term, shortRoots })) {
      matches += 1;
    }
  }

  return matches;
}

function countCampaignCoreThemeTermMatches(item, rule) {
  return countCampaignThemeTermMatchesInText(getWebsiteItemDirectCampaignText(item), rule);
}

function getWebsiteItemCampaignSourceText(item) {
  const sourceValues = [
    item?.source_page_url,
    item?.source_url,
    item?.website_url,
    item?.catalog_source_url,
    item?.discovery_url,
    item?.reason,
    item?.catalog_source,
    item?.discovery_source,
    item?.campaign_fit_source,
  ].filter(Boolean);

  return sourceValues
    .flatMap((value) => {
      const raw = String(value || "");
      const plusAsSpace = raw.replace(/\+/g, " ");

      try {
        return [raw, decodeURIComponent(plusAsSpace)];
      } catch {
        return [raw, plusAsSpace];
      }
    })
    .join(" ");
}

function isLikelyCampaignFocusedSourceText(value) {
  const text = normalizeSearchText(value);

  if (!text) {
    return false;
  }

  return /(^|[\s/_.?=&-])(collection|collections|category|categories|kategori|kategorier|produktkategori|search|sok|sokning|products)([\s/_.?=&-]|$)/u.test(text);
}

function countCampaignSourceThemeMatches(item, rule) {
  const sourceText = getWebsiteItemCampaignSourceText(item);

  if (!isLikelyCampaignFocusedSourceText(sourceText)) {
    return 0;
  }

  return countCampaignThemeTermMatchesInText(sourceText, rule);
}

function getCampaignThemeSourceLockedItems(items, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return [];
  }

  if (!extractCampaignCoreThemeTerms(rule).length) {
    return [];
  }

  return dedupeWebsiteItemsByUrlTitleAndImage(items)
    .map((item) => ({
      ...item,
      campaign_source_theme_matches: countCampaignSourceThemeMatches(item, rule),
      campaign_theme_term_matches: countCampaignCoreThemeTermMatches(item, rule),
      primary_campaign_term_matches: countPrimaryCampaignTermMatches(item, rule),
    }))
    .filter((item) => Number(item.campaign_source_theme_matches || 0) > 0)
    .sort((a, b) => {
      const sourceDelta =
        Number(b.campaign_source_theme_matches || 0) -
        Number(a.campaign_source_theme_matches || 0);
      if (sourceDelta !== 0) return sourceDelta;

      const themeDelta =
        Number(b.campaign_theme_term_matches || 0) -
        Number(a.campaign_theme_term_matches || 0);
      if (themeDelta !== 0) return themeDelta;

      const primaryDelta =
        Number(b.primary_campaign_term_matches || 0) -
        Number(a.primary_campaign_term_matches || 0);
      if (primaryDelta !== 0) return primaryDelta;

      return scoreWebsiteItemForRule(b, rule) - scoreWebsiteItemForRule(a, rule);
    });
}

function getCampaignThemeMatchedItems(items, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return [];
  }

  if (!extractCampaignCoreThemeTerms(rule).length) {
    return [];
  }

  return dedupeWebsiteItemsByUrlTitleAndImage(items)
    .map((item) => ({
      ...item,
      campaign_theme_term_matches: countCampaignCoreThemeTermMatches(item, rule),
      primary_campaign_term_matches: countPrimaryCampaignTermMatches(item, rule),
    }))
    .filter((item) => Number(item.campaign_theme_term_matches || 0) > 0)
    .sort((a, b) => {
      const themeDelta =
        Number(b.campaign_theme_term_matches || 0) -
        Number(a.campaign_theme_term_matches || 0);
      if (themeDelta !== 0) return themeDelta;

      const primaryDelta =
        Number(b.primary_campaign_term_matches || 0) -
        Number(a.primary_campaign_term_matches || 0);
      if (primaryDelta !== 0) return primaryDelta;

      return scoreWebsiteItemForRule(b, rule) - scoreWebsiteItemForRule(a, rule);
    });
}

function isLikelyGenericCustomTemplateProduct(item) {
  const directText = normalizeSearchText(getWebsiteItemDirectCampaignText(item));

  if (!directText) {
    return false;
  }

  const genericTemplatePatterns = [
    /\bditt\s+tryck\b/u,
    /\beget\s+tryck\b/u,
    /\bpersonligt\s+tryck\b/u,
    /\bdesigna\s+sjalv\b/u,
    /\bdesigna\s+dina\s+egna\b/u,
    /\btryckta\s+klader\b/u,
    /\bskapa\s+din\s+unika\b/u,
    /\begna\s+tryckta\b/u,
    /\btryck\s+har\b/u,
    /\byour\s+(?:text|logo|design|print)\b/u,
    /\badd\s+your\s+(?:text|logo|design)\b/u,
    /\bcustom\s+(?:text|logo|design|print)\b/u,
    /\bpersonalized\s+(?:text|logo|design|print)\b/u,
    /\bdesign\s+your\s+own\b/u,
  ];

  return genericTemplatePatterns.some((pattern) => pattern.test(directText));
}

function preferConcreteCampaignProducts(items) {
  const dedupedItems = dedupeWebsiteItemsByUrlTitleAndImage(items);
  const concreteItems = dedupedItems.filter((item) => !isLikelyGenericCustomTemplateProduct(item));

  return concreteItems.length ? concreteItems : [];
}


function getCampaignAnchorSourceText(rule) {
  const prompt = String(rule?.prompt || "");
  const imagePrompt = String(rule?.image_prompt || "");

  return [
    rule?.name,
    extractPromptLineValue(prompt, "Campaign"),
    extractPromptLineValue(prompt, "Campaign title"),
    extractPromptLineValue(prompt, "Campaign name"),
    extractPromptLineValue(prompt, "Campaign context"),
    extractPromptLineValue(prompt, "Product selection guidance"),
    extractPromptLineValue(imagePrompt, "Campaign"),
    extractPromptLineValue(imagePrompt, "Campaign title"),
    extractPromptLineValue(imagePrompt, "Campaign name"),
    extractPromptLineValue(imagePrompt, "Campaign context"),
    rule?.campaign_goal,
  ]
    .filter(Boolean)
    .join(" ");
}

function isCampaignTermRelatedToCompactRoots(term, roots) {
  const normalizedTerm = normalizeSearchText(term).trim();
  const tokens = tokenizeSearchText(normalizedTerm);

  if (!normalizedTerm || !Array.isArray(roots) || !roots.length) {
    return false;
  }

  return roots.some((root) => (
    normalizedTerm === root ||
    hasCampaignPhraseMatch(normalizedTerm, root) ||
    tokens.some((token) => token.startsWith(root) && token.length >= root.length + 2)
  ));
}

function extractCampaignAnchorTerms(rule) {
  const source = normalizeSearchText(getCampaignAnchorSourceText(rule));
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const compactPrimaryRoots = extractCompactPrimaryCampaignRoots(explicitTerms);
  const explicitWords = new Set(getCampaignTermWords(explicitTerms));
  const sourceWords = source
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word) && !weakShortSearchRoots.has(word));

  const anchors = [];
  const seen = new Set();

  for (const root of compactPrimaryRoots) {
    if (!seen.has(root)) {
      anchors.push(root);
      seen.add(root);
    }
  }

  for (const word of sourceWords) {
    if (compactPrimaryRoots.length && !isCampaignTermRelatedToCompactRoots(word, compactPrimaryRoots)) {
      continue;
    }

    const derivedRootTerms = [];
    const supportedByExplicitTerm = explicitWords.has(word) || Array.from(explicitWords).some((explicitWord) => {
      if (!explicitWord || explicitWord.length < 4 || word.length < 4) return false;
      const minLength = Math.min(explicitWord.length, word.length);
      const commonPrefix = getCommonPrefix([explicitWord, word]);
      const commonLength = commonPrefix.length;

      if (commonLength >= Math.min(6, minLength) || commonLength >= Math.ceil(minLength * 0.75)) {
        const compactRoot = commonPrefix.slice(0, 3);

        if (commonPrefix.length > 6 && isUsefulShortCampaignRoot(compactRoot)) {
          derivedRootTerms.push(compactRoot, commonPrefix);
        }
      }

      return commonLength >= Math.min(6, minLength) || commonLength >= Math.ceil(minLength * 0.75);
    });

    // Prefer campaign-title/context terms that AI also reflected in the dynamic
    // product_match_terms. This keeps generic business words from becoming hard
    // product filters while still allowing language-specific roots without
    // hardcoding any theme language.
    if (!supportedByExplicitTerm && explicitTerms.length) {
      continue;
    }

    for (const derivedRootTerm of derivedRootTerms) {
      if (!seen.has(derivedRootTerm)) {
        anchors.push(derivedRootTerm);
        seen.add(derivedRootTerm);
      }
    }

    if (!seen.has(word)) {
      anchors.push(word);
      seen.add(word);
    }

    if (anchors.length >= 8) break;
  }

  return anchors;
}

function hasStrongCampaignTermMatchAgainstTokens({ campaignText, tokens, term, shortRoots }) {
  if (!term) return false;

  if (tokens.has(term) || hasCampaignPhraseMatch(campaignText, term)) {
    return true;
  }

  if (
    shortRoots?.has(term) &&
    Array.from(tokens).some((token) => token.startsWith(term) && token.length >= term.length + 2)
  ) {
    return true;
  }

  if (term.length >= 6) {
    for (const token of tokens) {
      if (!token || token.length < 4) continue;
      const minLength = Math.min(token.length, term.length);
      const commonLength = getCommonPrefix([token, term]).length;

      // Handles normal inflections/plurals without requiring language-specific
      // rules. This is a support for the campaign anchor, not a generic
      // substring match.
      if (commonLength >= Math.min(7, minLength) || commonLength >= Math.ceil(minLength * 0.8)) {
        return true;
      }
    }
  }

  return false;
}

function countCampaignAnchorTermMatches(item, rule) {
  const terms = extractCampaignAnchorTerms(rule);

  if (!terms.length) {
    return 0;
  }

  const campaignText = getWebsiteItemDirectCampaignText(item);
  const tokenSet = new Set(tokenizeSearchText(campaignText));
  const shortRoots = getPrimaryCampaignShortRoots(rule);
  let matches = 0;

  for (const term of terms) {
    if (hasStrongCampaignTermMatchAgainstTokens({ campaignText, tokens: tokenSet, term, shortRoots })) {
      matches += 1;
    }
  }

  return matches;
}

function getCampaignAnchorMatchedItems(items, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return [];
  }

  const anchorTerms = extractCampaignAnchorTerms(rule);

  if (!anchorTerms.length) {
    return [];
  }

  return dedupeWebsiteItemsByUrlTitleAndImage(items)
    .map((item) => ({
      ...item,
      campaign_anchor_term_matches: countCampaignAnchorTermMatches(item, rule),
      primary_campaign_term_matches: countPrimaryCampaignTermMatches(item, rule),
    }))
    .filter((item) => Number(item.campaign_anchor_term_matches || 0) > 0)
    .sort((a, b) => {
      const anchorDelta = Number(b.campaign_anchor_term_matches || 0) - Number(a.campaign_anchor_term_matches || 0);
      if (anchorDelta !== 0) return anchorDelta;

      const primaryDelta = Number(b.primary_campaign_term_matches || 0) - Number(a.primary_campaign_term_matches || 0);
      if (primaryDelta !== 0) return primaryDelta;

      return scoreWebsiteItemForRule(b, rule) - scoreWebsiteItemForRule(a, rule);
    });
}

function countPrimaryCampaignTermMatches(item, rule) {
  const terms = extractPrimaryCampaignTerms(rule);

  if (!terms.length) {
    return 0;
  }

  const campaignText = getWebsiteItemDirectCampaignText(item);
  const tokens = tokenizeSearchText(campaignText);
  const tokenSet = new Set(tokens);
  const shortRoots = getPrimaryCampaignShortRoots(rule);
  let matches = 0;

  for (const term of terms) {
    if (!term) {
      continue;
    }

    if (hasStrongCampaignTermMatchAgainstTokens({
      campaignText,
      tokens: tokenSet,
      term,
      shortRoots,
    })) {
      matches += 1;
    }
  }

  return matches;
}

function getPrimaryCampaignMatchedItems(items, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return [];
  }

  return dedupeWebsiteItemsByUrlTitleAndImage(items)
    .map((item) => ({
      ...item,
      primary_campaign_term_matches: countPrimaryCampaignTermMatches(item, rule),
    }))
    .filter((item) => Number(item.primary_campaign_term_matches || 0) > 0)
    .sort((a, b) => {
      const matchDelta =
        Number(b.primary_campaign_term_matches || 0) -
        Number(a.primary_campaign_term_matches || 0);
      if (matchDelta !== 0) return matchDelta;

      return scoreWebsiteItemForRule(b, rule) - scoreWebsiteItemForRule(a, rule);
    });
}

function getSafeCampaignProductCandidates(items, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return [];
  }

  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const anchorTerms = extractCampaignAnchorTerms(rule);
  const themeTerms = extractCampaignCoreThemeTerms(rule);
  const themeSourceLockedItems = getCampaignThemeSourceLockedItems(items, rule);
  const themeMatchedItems = getCampaignThemeMatchedItems(items, rule);
  const anchorMatchedItems = getCampaignAnchorMatchedItems(items, rule);
  const primaryMatchedItems = getPrimaryCampaignMatchedItems(items, rule);
  const concreteThemeSourceLockedItems = preferConcreteCampaignProducts(themeSourceLockedItems);
  const concreteThemeMatchedItems = preferConcreteCampaignProducts(themeMatchedItems);
  const concreteAnchorMatchedItems = preferConcreteCampaignProducts(anchorMatchedItems);
  const concretePrimaryMatchedItems = preferConcreteCampaignProducts(primaryMatchedItems);

  // A campaign title often contains the true occasion/theme while the rest of
  // the prompt contains broad buying intent such as gift, personal or design.
  // If we can find products or campaign-focused sources matching that core
  // theme, keep the carousel locked there before allowing broad gift terms.
  if (themeTerms.length && concreteThemeSourceLockedItems.length) {
    return concreteThemeSourceLockedItems;
  }

  if (themeTerms.length && concreteThemeMatchedItems.length) {
    return concreteThemeMatchedItems;
  }

  // A named campaign theme must not fall through to broad AI-approved
  // products. Continue focused discovery; if too few matching products exist,
  // stop the carousel instead of padding it with generic catalog items.
  if (themeTerms.length) {
    return [];
  }

  // When a campaign has AI-generated product_match_terms and we can derive
  // campaign anchors from the campaign title/context, the anchor match is the
  // hard product-card guard. This prevents broad terms such as personal, gift,
  // print or design from letting generic products into a Christmas/Halloween/etc
  // campaign carousel.
  if (explicitTerms.length && anchorTerms.length) {
    return concreteAnchorMatchedItems;
  }

  // If we have dynamic terms but no reliable anchor, keep the previous safe
  // behavior: exact/dynamic term matches only, not generic catalog fallback.
  if (explicitTerms.length) {
    return concretePrimaryMatchedItems;
  }

  if (concreteAnchorMatchedItems.length) {
    return concreteAnchorMatchedItems;
  }

  if (concretePrimaryMatchedItems.length) {
    return concretePrimaryMatchedItems;
  }

  return preferConcreteCampaignProducts(getStrongCampaignFitItems(items, rule));
}

function getAiCampaignFitScore(item) {
  if (item?.ai_campaign_fit_score === undefined || item?.ai_campaign_fit_score === null) {
    return null;
  }

  const score = Number(item.ai_campaign_fit_score);

  if (!Number.isFinite(score)) {
    return null;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function normalizeCampaignFitScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function formatProductsForCampaignFitPrompt(candidates) {
  return candidates
    .map(({ item, index }) => {
      const fields = [
        `Index: ${index}`,
        `Title: ${item?.title || "Not provided"}`,
        `URL: ${item?.url || item?.product_url || item?.item_url || "Not provided"}`,
        `Description: ${truncateText(item?.description || "", 500) || "Not provided"}`,
        `Price: ${item?.price || "Not provided"}`,
        `Discovery reason: ${truncateText(item?.reason || "", 300) || "Not provided"}`,
        `Discovery source: ${item?.catalog_source || item?.discovery_source || item?.campaign_fit_source || "Not provided"}`,
      ];

      return fields.join("\n");
    })
    .join("\n\n---\n\n");
}

function getReasoningOptionsForModel(model) {
  return /^gpt-5/i.test(String(model || ""))
    ? { reasoning: { effort: "low" } }
    : {};
}

async function evaluateCampaignFitCandidates({
  openai,
  rule,
  brandProfile,
  candidates,
  model,
}) {
  const evaluationByIndex = new Map();
  const batchSize = 20;

  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize);
    const response = await openai.responses.create({
      model,
      ...getReasoningOptionsForModel(model),
      input: `
You are validating product relevance for a social media campaign.

Your job:
Score each candidate product for how well it fits the campaign, buyer intent, recipient/end user, season/occasion/theme, brand, market and audience.

Important:
- Do not use fixed holiday or product keyword lists.
- Infer the campaign meaning from the campaign context, brand profile, market, language and product information.
- A concrete product page that clearly fits the campaign should score high.
- A generic category, collection, search, brand, guide or landing page must score 0 even if its title matches the campaign.
- A broad custom product or unrelated bestseller must score low when more specific campaign products exist.
- Named occasion priority: if the campaign is built around a specific holiday, season, event, theme day or cultural occasion, products whose title, URL, description, image context or page context directly references that exact occasion in the website's own language must beat generic gifts, personalized products, bestsellers, pet portraits, custom-print items or broad category items.
- Generic gift or personalized products can be strong only when no more explicit occasion-specific products are available in the candidate batch.
- Prefer products that naturally support the campaign reason to buy, not products that merely share generic words with the prompt.
- Do not reward generic words such as product, shop, buy, custom, print, collection, gift, offer, post or social media unless the product itself clearly fits the campaign.

Score guide:
- 90-100: exact or excellent campaign-specific product fit.
- 75-89: strong product fit for the campaign.
- 55-74: loose or general fit, useful only if stronger products are unavailable.
- 1-54: weak, generic, wrong recipient, wrong use case or mostly unrelated.
- 0: not a concrete product page, category/listing/search/landing page, or unsafe to use.

Brand profile:
${formatBrandProfileForPrompt(brandProfile)}

Campaign context:
${buildCampaignResearchText(rule) || "No campaign context provided."}

Candidate products:
${formatProductsForCampaignFitPrompt(batch)}

Return strict JSON only:
{
  "scores": [
    {
      "index": 0,
      "score": 0,
      "verdict": "strong | medium | weak | reject",
      "reason": "Short reason"
    }
  ]
}
      `.trim(),
    });

    const parsed = safeJsonParse(response.output_text || "");
    const scores = Array.isArray(parsed?.scores) ? parsed.scores : [];

    for (const entry of scores) {
      const index = Number(entry?.index);

      if (!Number.isInteger(index)) {
        continue;
      }

      evaluationByIndex.set(index, {
        score: normalizeCampaignFitScore(entry?.score),
        verdict: String(entry?.verdict || "").trim(),
        reason: String(entry?.reason || "").trim(),
        model,
      });
    }
  }

  return evaluationByIndex;
}

function applyCampaignFitEvaluations(items, evaluationByIndex) {
  return items.map((item, index) => {
    const evaluation = evaluationByIndex.get(index);

    if (!evaluation) {
      return {
        ...item,
        ai_campaign_fit_score:
          item?.ai_campaign_fit_score === undefined ? null : item.ai_campaign_fit_score,
        campaign_fit_score: Number(item?.heuristic_campaign_fit_score || 0),
        campaign_fit_source: item?.campaign_fit_source || "ai_campaign_fit_unscored",
        campaign_fit_reason:
          item?.campaign_fit_reason || "Not evaluated in campaign fit batch; kept existing heuristic score.",
      };
    }

    return {
      ...item,
      ai_campaign_fit_score: evaluation.score,
      campaign_fit_score: evaluation.score,
      campaign_fit_source:
        evaluation.model === PRODUCT_RESEARCH_MODEL
          ? "ai_campaign_fit"
          : "ai_campaign_fit_fast",
      campaign_fit_verdict: evaluation.verdict,
      campaign_fit_reason: evaluation.reason,
    };
  });
}

function shouldEscalateCampaignFitEvaluation(evaluationByIndex, minimumStrongProducts) {
  const scores = Array.from(evaluationByIndex.values())
    .map((entry) => Number(entry?.score || 0))
    .filter((score) => Number.isFinite(score));

  if (!scores.length) {
    return true;
  }

  const strongCount = scores.filter((score) => score >= CAMPAIGN_STRONG_PRODUCT_FIT_SCORE).length;
  const excellentCount = scores.filter((score) => score >= 90).length;

  return strongCount < minimumStrongProducts || excellentCount === 0;
}

async function applyAiCampaignFitScores({
  openai,
  rule,
  brandProfile,
  items,
  maxItems = 80,
  model = PRODUCT_RESEARCH_MODEL,
  escalateWhenUncertain = false,
  escalationModel = PRODUCT_RESEARCH_MODEL,
  escalationMaxItems = 20,
  minimumStrongProducts = CAROUSEL_MIN_PRODUCT_SLIDES,
}) {
  if (!isProductIntentScopedWebsiteRule(rule) || !Array.isArray(items) || items.length === 0) {
    return items || [];
  }

  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item?.title || item?.url || item?.product_url || item?.item_url)
    .sort((a, b) => {
      const priorityDelta =
        Number(b.item?.selection_priority || 0) - Number(a.item?.selection_priority || 0);
      if (priorityDelta !== 0) return priorityDelta;

      const sourceScoreDelta =
        Number(b.item?.campaign_fit_score || b.item?.score || 0) -
        Number(a.item?.campaign_fit_score || a.item?.score || 0);
      if (sourceScoreDelta !== 0) return sourceScoreDelta;

      return scoreWebsiteItemForRule(b.item, rule) - scoreWebsiteItemForRule(a.item, rule);
    })
    .slice(0, maxItems);

  if (!candidates.length) {
    return items;
  }

  const evaluationByIndex = await evaluateCampaignFitCandidates({
    openai,
    rule,
    brandProfile,
    candidates,
    model,
  });

  if (
    escalateWhenUncertain &&
    model !== escalationModel &&
    shouldEscalateCampaignFitEvaluation(evaluationByIndex, minimumStrongProducts)
  ) {
    const escalationCandidates = candidates
      .map((candidate) => ({
        ...candidate,
        currentScore: Number(evaluationByIndex.get(candidate.index)?.score || 0),
      }))
      .sort((a, b) => b.currentScore - a.currentScore)
      .slice(0, escalationMaxItems);

    console.log("Campaign fit scoring escalated to senior product research model", {
      ruleId: rule?.id,
      brandProfileId: rule?.brand_profile_id,
      fastModel: model,
      escalationModel,
      candidateCount: candidates.length,
      escalationCandidateCount: escalationCandidates.length,
    });

    const escalatedEvaluationByIndex = await evaluateCampaignFitCandidates({
      openai,
      rule,
      brandProfile,
      candidates: escalationCandidates,
      model: escalationModel,
    });

    for (const [index, evaluation] of escalatedEvaluationByIndex.entries()) {
      evaluationByIndex.set(index, evaluation);
    }
  }

  return applyCampaignFitEvaluations(items, evaluationByIndex);
}

function scoreCampaignFitForRule(item, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return 0;
  }

  const aiScore = getAiCampaignFitScore(item);

  const terms = extractCampaignTerms(rule);
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const avoidTerms = extractCampaignAvoidTerms(rule);
  const themeTerms = extractCampaignCoreThemeTerms(rule);
  const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
  const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
  const anchorMatches = countCampaignAnchorTermMatches(item, rule);
  const anchorTerms = extractCampaignAnchorTerms(rule);
  const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
  const directCampaignSignalCount = themeMatches + anchorMatches + primaryMatches;
  if (!terms.length && !avoidTerms.length && !anchorTerms.length && !themeTerms.length) {
    return aiScore !== null ? aiScore : 0;
  }

  const title = normalizeSearchText(item?.title);
  const url = normalizeSearchText(item?.url || item?.product_url || item?.item_url);
  const description = normalizeSearchText(item?.description);
  const haystack = `${title} ${url} ${description}`;
  let score = aiScore !== null ? aiScore : 0;

  const shortRoots = getPrimaryCampaignShortRoots(rule);

  if (themeMatches > 0) {
    score += 125 + themeMatches * 45;
  } else if (sourceThemeMatches > 0 && directCampaignSignalCount > 0) {
    // The source page may corroborate a match already present on the product,
    // but a search/category URL must never create product relevance by itself.
    score += Math.min(sourceThemeMatches * 5, 10);
  } else if (themeTerms.length) {
    // Once a clear campaign theme exists, broad gift/personal terms should not
    // outrank products that actually carry the occasion/theme.
    score -= 120;
  }

  if (anchorMatches > 0) {
    score += 90 + anchorMatches * 35;
  } else if (explicitTerms.length && anchorTerms.length) {
    // Dynamic broad terms can still help ranking after an anchor matched, but
    // without an anchor they must not promote a generic product into a themed
    // campaign card.
    score -= 80;
  }

  const titleTokens = tokenizeSearchText(title);
  const urlTokens = tokenizeSearchText(url);
  const descriptionTokens = tokenizeSearchText(description);

  for (const term of terms) {
    const isExplicit = explicitTerms.includes(term);
    const isShortRoot = shortRoots.has(term);

    if (isShortRoot) {
      const titleRootMatch = titleTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);
      const urlRootMatch = urlTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);
      const descriptionRootMatch = descriptionTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);

      if (titleRootMatch) score += 48;
      if (urlRootMatch) score += 42;
      if (descriptionRootMatch) score += 10;
      continue;
    }

    if (title.includes(term)) score += isExplicit ? 65 : 35;
    if (url.includes(term)) score += isExplicit ? 65 : 35;
    if (description.includes(term)) score += isExplicit ? 18 : 8;
  }

  for (const avoidTerm of avoidTerms) {
    if (!avoidTerm) continue;
    if (title.includes(avoidTerm)) score -= 90;
    if (url.includes(avoidTerm)) score -= 90;
    if (description.includes(avoidTerm)) score -= 35;
    if (haystack.includes(avoidTerm)) score -= 20;
  }

  if (isLikelyGenericCustomTemplateProduct(item) && themeMatches === 0 && sourceThemeMatches === 0 && anchorMatches === 0) {
    score -= 160;
  }

  if (
    sourceThemeMatches > 0 &&
    directCampaignSignalCount === 0 &&
    (aiScore === null || aiScore < CAMPAIGN_NEAR_PRODUCT_FIT_SCORE)
  ) {
    score = Math.min(score, CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE - 5);
  }

  return Math.min(100, Math.max(Math.round(score), 0));
}

function getStrongCampaignFitItems(items, rule) {
  return getCampaignFitItemsAtOrAboveScore(
    items,
    rule,
    CAMPAIGN_STRONG_PRODUCT_FIT_SCORE
  );
}

function getSupportingCampaignFitItems(items, rule) {
  return getCampaignFitItemsAtOrAboveScore(
    items,
    rule,
    CAMPAIGN_SUPPORTING_PRODUCT_FIT_SCORE
  );
}

function getCampaignFitItemsAtOrAboveScore(items, rule, minimumScore) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return [];
  }

  return (items || [])
    .map((item) => ({
      ...item,
      campaign_fit_score: scoreCampaignFitForRule(item, rule),
    }))
    .filter((item) => Number(item.campaign_fit_score || 0) >= minimumScore)
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

  if (isProductIntentScopedWebsiteRule(rule)) {
    score += scoreCampaignFitForRule(item, rule);
  }

  if (item?.image_url) score += 3;
  if (item?.price) score += 1;
  if (item?.last_used_at) score -= 2;
  score -= Math.min(Number(item?.times_used || 0), 20);

  return score;
}

function isAcceptableWebsiteTextProductSelection(item, rule) {
  if (!isProductIntentScopedWebsiteRule(rule)) {
    return true;
  }

  return scoreCampaignFitForRule(item, rule) >= CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE;
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
    const hasProductPath =
      /^\/products?\/[^/]+/i.test(path) ||
      /\/collections\/[^/]+\/products\/[^/]+/i.test(path);

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
      "/collection",
      "/collections",
      "/category",
      "/categories",
      "/page",
      "/pages",
    ];

    return blockedPathParts.some((part) => {
      if (hasProductPath && ["/collection", "/collections"].includes(part)) {
        return false;
      }

      return path.includes(part);
    });
  } catch {
    return true;
  }
}

function hasSmallImageDimensionHint(value, minDimension = 500) {
  const rawUrl = String(value || "");
  const lowerUrl = rawUrl.toLowerCase();

  if (!lowerUrl) {
    return true;
  }

  if (/(?:^|[\/_-])(thumb|thumbnail|small|tiny|mini|xs|swatch|preview|icon)(?:[\/_-]|$)/i.test(lowerUrl)) {
    return true;
  }

  const sizeMatches = [...lowerUrl.matchAll(/(?:^|[^0-9])([1-9][0-9]{1,3})[x×_-]([1-9][0-9]{1,3})(?:[^0-9]|$)/g)];
  for (const match of sizeMatches) {
    const width = Number(match[1]);
    const height = Number(match[2]);

    if (width && height && Math.max(width, height) < minDimension) {
      return true;
    }
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const smallQueryKeys = [
      "w",
      "width",
      "h",
      "height",
      "imwidth",
      "imheight",
      "maxwidth",
      "maxheight",
    ];

    for (const key of smallQueryKeys) {
      const value = Number(parsedUrl.searchParams.get(key));
      if (value && value < minDimension) {
        return true;
      }
    }
  } catch (_) {
    // Ignore malformed URLs here; other URL validators handle them.
  }

  return false;
}

function isLowQualityProductImageUrl(value) {
  return hasSmallImageDimensionHint(value, 500);
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
    lowerUrl.includes("no-image") ||
    lowerUrl.includes("no_image") ||
    lowerUrl.includes("missing-image") ||
    lowerUrl.includes("blank") ||
    lowerUrl.includes("default-image") ||
    lowerUrl.includes("banner") ||
    lowerUrl.includes("hero") ||
    lowerUrl.includes("background") ||
    lowerUrl.includes("classy-fabric") ||
    lowerUrl.includes("theme") ||
    lowerUrl.includes("pattern") ||
    lowerUrl.includes("separator") ||
    lowerUrl.includes("texture") ||
    lowerUrl.includes("swatch") ||
    lowerUrl.endsWith(".svg") ||
    isLowQualityProductImageUrl(value)
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
  const jsonLdProductCount = extractJsonLdObjects(html)
    .filter((item) => normalizeJsonLdType(item?.["@type"]).some((type) => type.includes("product")))
    .length;
  const productSchemaFound = Boolean(product?.name || product?.image || product?.offers);
  const ecommerceProofFound = hasEcommerceProofText(html);

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
  const productUrlEvidenceScore = getProductUrlEvidenceScore(productUrl);
  const previouslyVerified = Boolean(webSearchProduct?.product_page_verified);
  const productPageVerified = Boolean(
    imageUrl &&
    !isLikelyBadDiscoveryPageUrl(productUrl, websiteUrl) &&
    (
      previouslyVerified ||
      (productSchemaFound && (jsonLdProductCount <= 8 || productUrlEvidenceScore >= 8)) ||
      (
        ecommerceProofFound &&
        (Boolean(price) || productUrlEvidenceScore >= 22)
      )
    )
  );

  if (!productPageVerified) {
    console.log("Rejected fetched page because it is not a verified product detail page", {
      productUrl,
      title,
      productSchemaFound,
      jsonLdProductCount,
      ecommerceProofFound,
      hasPrice: Boolean(price),
      hasImage: Boolean(imageUrl),
      productUrlEvidenceScore,
    });
    return null;
  }

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

  const verifiedProductItem = {
    ...normalizedItem,
    item_key: createItemKey(normalizedItem),
    reason: webSearchProduct?.reason || "",
    source_page_url: webSearchProduct?.source_page_url || null,
    source_search_url: webSearchProduct?.source_search_url || null,
    campaign_fit_source: webSearchProduct?.campaign_fit_source || null,
    discovery_score: Number(webSearchProduct?.discovery_score || webSearchProduct?.score || 0),
    campaign_fit_score: Number(
      webSearchProduct?.campaign_fit_score ||
      webSearchProduct?.score ||
      0
    ),
    product_page_verified: productPageVerified,
    product_schema_verified: productSchemaFound,
    ecommerce_proof_found: ecommerceProofFound,
  };

  const confidence = getCarouselProductConfidence(verifiedProductItem);
  if (confidence < CAROUSEL_PRODUCT_CONFIDENCE_SOFT_MIN) {
    console.log("Rejected product page candidate because product proof was too weak", {
      productUrl,
      title,
      confidence,
      productSchemaFound,
      ecommerceProofFound,
    });
    return null;
  }

  return {
    ...verifiedProductItem,
    product_confidence: confidence,
  };
}
function isLikelyBadDiscoveryPageUrl(value, websiteUrl) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();

    if (!path || path === "/" || isWeakItemUrl(value, websiteUrl)) {
      return true;
    }

    const hasProductPath =
      /\/products?\//i.test(path) ||
      /\/produkt(er)?\//i.test(path) ||
      /\/p\//i.test(path) ||
      /\/[^/?#]+-p\d{3,}/i.test(path);

    const listingPathParts = [
      "/collections",
      "/collection",
      "/category",
      "/categories",
      "/kategori",
      "/kategorier",
      "/catalog",
      "/katalog",
      "/brand",
      "/brands",
      "/varumarke",
      "/varumarken",
      "/tag",
      "/tags",
    ];

    if (!hasProductPath && listingPathParts.some((part) => path.includes(part))) {
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

function isLikelyInvalidDiscoveryResearchUrl(value, websiteUrl) {
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
    ...extractProductCardCandidatesFromHtml({
      html,
      pageUrl,
      websiteUrl,
      campaignPrompt,
    })
  );

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

    if (isLikelyBadDiscoveryPageUrl(url, websiteUrl)) {
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
      source_page_url: pageUrl,
      campaign_fit_source: "discovery_page_link",
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
    .slice(0, 60);
}

function sortFreshProductCandidatesFirst(candidates, usedWebsiteItems, websiteUrl) {
  const rows = (candidates || []).map((item, index) => ({
    item,
    index,
    wasUsedRecently: hasWebsiteItemAlreadyBeenUsed(item, usedWebsiteItems || [], websiteUrl),
  }));

  return rows
    .sort((a, b) => {
      if (a.wasUsedRecently !== b.wasUsedRecently) {
        return a.wasUsedRecently ? 1 : -1;
      }

      const scoreDelta = Number(b.item?.score || 0) - Number(a.item?.score || 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return a.index - b.index;
    })
    .map((entry) => entry.item);
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

const weakShortSearchRoots = new Set([
  "and",
  "att",
  "den",
  "det",
  "dit",
  "din",
  "for",
  "med",
  "och",
  "per",
  "pre",
  "pro",
  "the",
  "til",
  "till",
]);

function addCampaignSearchVariants(searches, value, { allowShortRoot = false } = {}) {
  const slug = makeSearchSlug(value);

  if (slug) {
    searches.push(slug);
  }

  const words = normalizeSearchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word));

  for (const word of words) {
    searches.push(makeSearchSlug(word));

    if (allowShortRoot && word.length >= 8) {
      const shortRoot = word.slice(0, 3);

      if (!weakShortSearchRoots.has(shortRoot)) {
        searches.push(shortRoot);
      }
    }
  }
}

function buildCampaignDiscoverySearches(campaignPrompt) {
  const rule = { prompt: campaignPrompt };
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const terms = extractCampaignTerms(rule);
  const searches = [];

  const coreThemeTerms = extractCampaignCoreThemeTerms(rule);
  const anchorTerms = extractCampaignAnchorTerms(rule);
  const safeRootTerms = extractCompactPrimaryCampaignRoots(explicitTerms);
  const rootRelatedExplicitTerms = safeRootTerms.length
    ? explicitTerms.filter((term) => isCampaignTermRelatedToCompactRoots(term, safeRootTerms))
    : explicitTerms;

  for (const coreThemeTerm of coreThemeTerms) {
    addCampaignSearchVariants(searches, coreThemeTerm, { allowShortRoot: false });
  }

  for (const anchorTerm of anchorTerms) {
    addCampaignSearchVariants(searches, anchorTerm, { allowShortRoot: false });
  }

  for (const rootTerm of safeRootTerms) {
    addCampaignSearchVariants(searches, rootTerm, { allowShortRoot: false });
  }

  for (const term of [...rootRelatedExplicitTerms, ...terms].slice(0, 8)) {
    addCampaignSearchVariants(searches, term, { allowShortRoot: false });
  }

  const normalizedPrompt = normalizeSearchText(campaignPrompt);
  const phrase = makeSearchSlug(normalizedPrompt.split(/\s+/).slice(0, 4).join(" "));
  if (phrase && !explicitTerms.length) searches.unshift(phrase);
  if (phrase && explicitTerms.length) searches.push(phrase);

  return Array.from(new Set(searches.filter(Boolean))).slice(0, CAMPAIGN_STORE_SEARCH_QUERY_LIMIT);
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

function buildStoreSearchQueries(campaignPrompt) {
  const searches = buildCampaignDiscoverySearches(campaignPrompt)
    .map((search) => String(search || "").trim())
    .filter(Boolean);

  return Array.from(new Set(searches)).slice(0, CAMPAIGN_STORE_SEARCH_QUERY_LIMIT);
}

function buildStoreSearchUrls(websiteUrl, campaignPrompt = "") {
  const origin = getWebsiteOrigin(websiteUrl);
  const queries = buildStoreSearchQueries(campaignPrompt);
  const urls = [];

  if (!origin || !queries.length) {
    return [];
  }

  const queryParts = queries.map((query) => {
    const queryText = query.replace(/-/g, " ");
    const encoded = encodeURIComponent(queryText);
    const slug = encodeURIComponent(query);

    return { query, encoded, slug };
  });

  // Interleave common platform-neutral search shapes per query. Previously the
  // global slice was filled by Shopify-style URLs before WooCommerce, Magento
  // or custom search variants were ever attempted.
  const searchUrlBuilders = [
    ({ encoded }) => `${origin}/search?type=product&q=${encoded}`,
    ({ encoded }) => `${origin}/?s=${encoded}&post_type=product`,
    ({ encoded }) => `${origin}/catalogsearch/result/?q=${encoded}`,
    ({ encoded }) => `${origin}/search?query=${encoded}`,
    ({ encoded }) => `${origin}/sok?q=${encoded}`,
    ({ encoded }) => `${origin}/search-results?search_query=${encoded}`,
    ({ slug }) => `${origin}/collections/all?constraint=${slug}`,
  ];

  for (const buildUrl of searchUrlBuilders) {
    for (const queryPart of queryParts.slice(0, 3)) {
      urls.push(buildUrl(queryPart));
    }
  }

  return Array.from(new Set(urls)).slice(0, WEBSITE_STORE_SEARCH_FETCH_LIMIT);
}

function extractSearchFormUrlsFromHtml({
  html,
  pageUrl,
  campaignPrompt,
}) {
  const queries = buildStoreSearchQueries(campaignPrompt).slice(0, CAMPAIGN_SEARCH_FORM_QUERY_LIMIT);

  if (!queries.length) {
    return [];
  }

  const urls = [];
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;

  while ((match = formRegex.exec(String(html || ""))) !== null) {
    const openTag = match[1] || "";
    const body = match[2] || "";
    const formHtml = `${openTag} ${body}`;
    const normalizedForm = normalizeSearchText(formHtml);
    const method = String(getAttributeValueFromTag(openTag, "method") || "get").toLowerCase();

    if (method && method !== "get") {
      continue;
    }

    const looksLikeSearchForm =
      normalizedForm.includes("search") ||
      normalizedForm.includes("sok") ||
      /type=["']search["']/i.test(formHtml);

    if (!looksLikeSearchForm) {
      continue;
    }

    const action = getAttributeValueFromTag(openTag, "action") || pageUrl;
    const actionUrl = resolveUrl(action, pageUrl) || pageUrl;
    const inputRegex = /<input\b[^>]*>/gi;
    const hiddenParams = [];
    const queryNames = [];
    let inputMatch;

    while ((inputMatch = inputRegex.exec(body)) !== null) {
      const inputTag = inputMatch[0] || "";
      const inputType = String(getAttributeValueFromTag(inputTag, "type") || "text").toLowerCase();
      const inputName = String(getAttributeValueFromTag(inputTag, "name") || "").trim();

      if (!inputName) {
        continue;
      }

      if (inputType === "hidden") {
        hiddenParams.push([
          inputName,
          getAttributeValueFromTag(inputTag, "value") || "",
        ]);
        continue;
      }

      if (
        inputType === "search" ||
        ["q", "query", "s", "search", "keyword", "keywords", "search_query", "term"].includes(inputName.toLowerCase())
      ) {
        queryNames.push(inputName);
      }
    }

    const queryName = queryNames[0] || "q";

    for (const query of queries) {
      try {
        const url = new URL(actionUrl);
        for (const [name, value] of hiddenParams) {
          if (name && !url.searchParams.has(name)) {
            url.searchParams.set(name, value);
          }
        }
        url.searchParams.set(queryName, query.replace(/-/g, " "));
        urls.push(url.toString());
      } catch {
        // Ignore malformed form actions.
      }
    }
  }

  return Array.from(new Set(urls)).slice(0, WEBSITE_STORE_SEARCH_FETCH_LIMIT);
}

function normalizeStoreSearchProductSuggestion(product, origin, campaignPrompt) {
  const title = String(product?.title || product?.name || product?.product_title || "").trim();
  const rawUrl =
    product?.url ||
    product?.product_url ||
    (product?.handle ? `/products/${product.handle}` : "") ||
    "";
  const productUrl = rawUrl ? resolveUrl(rawUrl, origin) : "";
  const rawImage =
    product?.featured_image?.url ||
    product?.featured_image ||
    product?.image?.url ||
    product?.image ||
    product?.images?.[0]?.url ||
    product?.images?.[0] ||
    "";
  const imageUrl = rawImage ? resolveUrl(String(rawImage), origin) : "";
  const price = normalizeVerifiedPriceValue(
    product?.price ||
      product?.price_min ||
      product?.min_price ||
      product?.variants?.[0]?.price ||
      ""
  );

  if (!title || !productUrl || !isHttpUrl(productUrl)) {
    return null;
  }

  return {
    title,
    url: productUrl,
    price,
    image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
    description: String(product?.body || product?.body_html || product?.description || ""),
    reason: "Product found from store search suggestions",
    score: 105 + scorePossibleProductLink({ url: productUrl, text: title, campaignPrompt }),
    campaign_fit_source: "store_search_suggest",
  };
}

async function discoverShopifySearchSuggest({
  websiteUrl,
  campaignPrompt,
}) {
  const origin = getWebsiteOrigin(websiteUrl);
  const queries = buildStoreSearchQueries(campaignPrompt).slice(0, 4);
  const discovered = [];

  if (!origin || !queries.length) {
    return [];
  }

  for (const query of queries) {
    const encoded = encodeURIComponent(query.replace(/-/g, " "));
    const suggestUrl = `${origin}/search/suggest.json?q=${encoded}&resources[type]=product&resources[limit]=10`;

    try {
      const json = await fetchJson(suggestUrl);
      const products = Array.isArray(json?.resources?.results?.products)
        ? json.resources.results.products
        : [];

      for (const product of products) {
        const normalized = normalizeStoreSearchProductSuggestion(product, origin, campaignPrompt);
        if (normalized && !isLikelyNonProductUrl(normalized.url, websiteUrl)) {
          discovered.push({
            ...normalized,
            source_page_url: suggestUrl,
          });
        }
      }
    } catch (error) {
      console.log("Store search suggestion endpoint unavailable", {
        websiteUrl,
        query,
        message: error.message,
      });
    }
  }

  return dedupeUrlItems(discovered)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, WEBSITE_STORE_SEARCH_VERIFY_LIMIT);
}

async function discoverProductCandidatesFromStoreSearch({
  websiteUrl,
  campaignPrompt,
  usedItems = [],
  excludeUsed = true,
}) {
  const candidates = [];
  const usedComparable = new Set(
    (usedItems || [])
      .map((item) => normalizeComparableValue(item.item_url || item.product_url || item.url))
      .filter(Boolean)
  );

  let searchUrls = buildStoreSearchUrls(websiteUrl, campaignPrompt);

  try {
    const homeHtml = await fetchHtml(websiteUrl);
    const looksLikeShopify = /cdn\.shopify\.com|shopify-section|Shopify\.theme|\/cdn\/shop\//i.test(homeHtml);

    if (looksLikeShopify) {
      candidates.push(
        ...(await discoverShopifySearchSuggest({
          websiteUrl,
          campaignPrompt,
        }))
      );
    }

    searchUrls = [
      ...extractSearchFormUrlsFromHtml({
        html: homeHtml,
        pageUrl: websiteUrl,
        campaignPrompt,
      }),
      ...searchUrls,
    ];
  } catch (error) {
    console.log("Could not inspect store search forms", {
      websiteUrl,
      message: error.message,
    });
  }

  const boundedSearchUrls = Array.from(new Set(searchUrls)).slice(0, WEBSITE_STORE_SEARCH_FETCH_LIMIT);
  const searchPageResults = await Promise.allSettled(
    boundedSearchUrls.map(async (searchUrl) => {
      const html = await fetchHtml(searchUrl);
      return extractProductLinksFromDiscoveryPage({
        html,
        pageUrl: searchUrl,
        websiteUrl,
        campaignPrompt,
      }).map((item) => ({
        ...item,
        source_page_url: item.source_page_url || searchUrl,
        reason: item.reason || `Product found from store search page: ${searchUrl}`,
        score: Number(item.score || 0) + 90,
        campaign_fit_source: item.campaign_fit_source || "store_search_page",
      }));
    })
  );

  for (let index = 0; index < searchPageResults.length; index += 1) {
    const result = searchPageResults[index];
    if (result.status === "fulfilled") {
      candidates.push(...result.value);
    } else {
      console.log("Store search URL unavailable", {
        searchUrl: boundedSearchUrls[index],
        message: result.reason?.message || "Unknown fetch error",
      });
    }
  }

  return dedupeUrlItems(candidates)
    .filter((item) => !excludeUsed || !usedComparable.has(normalizeComparableValue(item.url)))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, WEBSITE_STORE_SEARCH_VERIFY_LIMIT);
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

async function discoverShopifyProductsJson({ websiteUrl, campaignPrompt, rule = null }) {
  const origin = getWebsiteOrigin(websiteUrl);

  if (!origin) {
    return [];
  }

  const discovered = [];

  // Keep platform feeds bounded. Theme-specific store search, sitemaps and
  // domain web search do the focused discovery; this feed is only one cheap
  // supplementary candidate source and must never scale with catalog size.
  for (let page = 1; page <= 1; page += 1) {
    const jsonUrl = `${origin}/products.json?limit=250&page=${page}`;

    try {
      const safeJsonUrl = await assertPublicHttpUrl(jsonUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PRODUCT_FETCH_TIMEOUT_MS);
      const response = await fetch(safeJsonUrl, {
        headers: {
          "user-agent": PRODUCT_BROWSER_USER_AGENT,
          accept: "application/json,text/plain,*/*",
          "accept-language": "*",
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

        const discoveredItem = {
          title,
          url: productUrl,
          price,
          image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
          description: String(product?.body_html || product?.body || ""),
          reason: "Product found from Shopify products feed",
          score: scorePossibleProductLink({ url: productUrl, text: title, campaignPrompt }),
          campaign_fit_source: "shopify_complete_products_feed",
        };

        discoveredItem.campaign_fit_score = rule
          ? scoreCampaignFitForRule(discoveredItem, rule)
          : 0;
        discovered.push(discoveredItem);
      }

      if (products.length < 250) {
        break;
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
    .sort((a, b) => {
      const campaignDelta = Number(b.campaign_fit_score || 0) - Number(a.campaign_fit_score || 0);
      if (campaignDelta !== 0) return campaignDelta;
      return Number(b.score || 0) - Number(a.score || 0);
    })
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
      const safeJsonUrl = await assertPublicHttpUrl(jsonUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PRODUCT_FETCH_TIMEOUT_MS);
      const response = await fetch(safeJsonUrl, {
        headers: {
          "user-agent": PRODUCT_BROWSER_USER_AGENT,
          accept: "application/json,text/plain,*/*",
          "accept-language": "*",
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
  rule = null,
  usedItems = [],
  fastCampaignContinuation = false,
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
    maxSitemaps: fastCampaignContinuation ? 6 : 12,
    maxCandidates: fastCampaignContinuation ? 50 : 80,
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
    rule,
  });
  candidates.push(...shopifyCandidates);

  const discoveryUrls = buildLikelyDiscoveryUrls(websiteUrl, campaignPrompt).slice(
    0,
    fastCampaignContinuation ? Math.min(8, WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT) : WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT
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
    .sort((a, b) => {
      const campaignDelta = Number(b.campaign_fit_score || 0) - Number(a.campaign_fit_score || 0);
      if (campaignDelta !== 0) return campaignDelta;
      return Number(b.score || 0) - Number(a.score || 0);
    })
    .slice(0, fastCampaignContinuation ? 45 : WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT);
}

function getTrustedVerifiedCandidateFallback(candidate, websiteUrl) {
  if (!candidate?.product_page_verified) {
    return null;
  }

  const normalizedItem = normalizeWebsiteItem(
    {
      title: candidate.title || "",
      type: "product",
      url: candidate.url || candidate.product_url || "",
      description: candidate.description || candidate.reason || "",
      price: candidate.price || "",
      image_url: candidate.image_url || candidate.image || null,
    },
    websiteUrl
  );

  if (
    !normalizedItem ||
    !normalizedItem.image_url ||
    isLikelyBadDiscoveryPageUrl(normalizedItem.url, websiteUrl)
  ) {
    return null;
  }

  const trustedItem = {
    ...candidate,
    ...normalizedItem,
    item_key: candidate.item_key || createItemKey(normalizedItem),
    product_page_verified: true,
    product_schema_verified: Boolean(
      candidate.product_schema_verified ||
      candidate.product_json_ld_found ||
      candidate.product_schema_found
    ),
    ecommerce_proof_found: Boolean(
      candidate.ecommerce_proof_found ||
      candidate.add_to_cart_detected ||
      candidate.product_page_verified
    ),
    campaign_fit_score: Number(
      candidate.campaign_fit_score ||
      candidate.score ||
      0
    ),
    campaign_fit_source:
      candidate.campaign_fit_source || "previously_verified_fallback",
  };

  const confidence = getCarouselProductConfidence(trustedItem);

  return isValidCarouselProduct(trustedItem)
    ? {
        ...trustedItem,
        product_confidence: Math.max(
          Number(candidate.product_confidence || 0),
          confidence
        ),
      }
    : null;
}

async function verifyDiscoveredWebsiteProductCandidates({
  candidates,
  websiteUrl,
  limit = WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT,
}) {
  const verifiedItems = [];
  const seenUrls = new Set();
  const seenImages = new Set();
  const boundedCandidates = (candidates || []).slice(0, Math.min(limit + 8, 24));

  for (let start = 0; start < boundedCandidates.length && verifiedItems.length < limit; start += 4) {
    const batch = boundedCandidates.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map((candidate) =>
      extractProductDataFromProductPage({
          productUrl: candidate.url,
          websiteUrl,
          webSearchProduct: candidate,
        })
    ));

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const candidate = batch[index];
      let websiteItem = null;

      if (result.status === "rejected") {
        console.log("Could not verify discovered product catalog candidate", {
          productUrl: candidate?.url,
          message: result.reason?.message || "Unknown verification error",
        });
        websiteItem = getTrustedVerifiedCandidateFallback(candidate, websiteUrl);
      } else {
        websiteItem =
          result.value ||
          getTrustedVerifiedCandidateFallback(candidate, websiteUrl);
      }

      if (!websiteItem?.url || !websiteItem?.title) {
        console.log("Discovered product candidate was not usable after verification", {
          productUrl: candidate?.url,
          previouslyVerified: Boolean(candidate?.product_page_verified),
        });
        continue;
      }

      if (isLikelyBadDiscoveryPageUrl(websiteItem.url, websiteUrl)) {
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
      if (verifiedItems.length >= limit) break;
    }
  }

  return verifiedItems;
}

function normalizeCampaignSearchPoolItem(
  item,
  websiteUrl,
  rule,
  {
    selectionPriority = 180,
    scoreBonus = 0,
  } = {}
) {
  const title = String(item?.title || "").trim();
  const rawUrl = item?.url || item?.product_url || item?.item_url || "";
  const rawImageUrl = item?.image_url || item?.image || "";

  if (!title || !rawUrl || !rawImageUrl) {
    return null;
  }

  const description =
    String(item?.description || "").trim() ||
    String(item?.reason || "").trim() ||
    title;

  const normalizedItem = normalizeWebsiteItem(
    {
      title,
      type: "product",
      url: rawUrl,
      description,
      price: item?.price || "",
      image_url: rawImageUrl,
    },
    websiteUrl
  );

  if (!normalizedItem) {
    return null;
  }

  const enrichedItem = mergeNormalizedProductEvidence(item, {
    ...item,
    ...normalizedItem,
    reason: item?.reason || "",
    source_page_url: item?.source_page_url || item?.source_search_url || "",
    source_search_url: item?.source_search_url || item?.source_page_url || "",
    campaign_fit_source: item?.campaign_fit_source || "campaign_search_pool",
  });

  if (!isValidCarouselProduct(enrichedItem)) {
    return null;
  }

  return {
    ...enrichedItem,
    item_key: createItemKey(enrichedItem),
    selection_priority: Math.max(Number(item?.selection_priority || 0), selectionPriority),
    discovery_score: Number(item?.discovery_score || item?.score || 0),
    heuristic_campaign_fit_score: scoreCampaignFitForRule(enrichedItem, rule),
    campaign_fit_score: scoreCampaignFitForRule(enrichedItem, rule) + scoreBonus,
  };
}

function buildCampaignSearchPoolItems({
  candidates,
  verifiedItems,
  websiteUrl,
  rule,
  selectionPriority = 180,
  scoreBonus = 0,
}) {
  // Only detail pages that were fetched and verified may enter the campaign
  // selection pool. Raw search/listing cards remain discovery hints.
  return dedupeWebsiteItemsByUrlTitleAndImage([
    ...(verifiedItems || [])
      .map((item) =>
        normalizeCampaignSearchPoolItem(item, websiteUrl, rule, {
          selectionPriority: Math.max(selectionPriority, 190),
          scoreBonus: scoreBonus + 10,
        })
      )
      .filter(Boolean),
  ]);
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
  const campaignPrompt = buildCampaignResearchText(rule) || String(rule?.prompt || "").trim();

  if (!websiteHost) {
    return {
      products: [],
      discoveryPages: [],
    };
  }

  const isBackupAttempt = attempt === "backup_broad";
  const isDomainSearchAttempt = attempt === "domain_site_search";
  const productSearchQueries = splitCampaignTermLine(rule?.product_search_queries).slice(0, 10);
  const productMatchTerms = splitCampaignTermLine(rule?.product_match_terms).slice(0, 16);
  const searchHintTerms = collectUniqueTerms(
    [
      rule?.name,
      ...productSearchQueries,
      ...productMatchTerms,
      rule?.product_search_intent,
      rule?.campaign_goal,
      rule?.target_customer_need,
    ],
    18
  );
  const usedProductsBlock = formatUsedWebsiteItemsForResearchPrompt(
    usedWebsiteItems,
    WEBSITE_PRODUCT_REUSE_LIMIT
  );

const response = await openai.responses.create({
  model: PRODUCT_RESEARCH_MODEL,
  tools: [{ type: "web_search" }],
  tool_choice: "required",
  reasoning: {
    effort: "low",
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
  isDomainSearchAttempt
    ? `
This is a domain-restricted web search attempt.

The normal store/catalog search did not return enough usable products. Search the public web inside the customer's domain like a human researcher would.
Use domain-restricted queries such as:
- site:${websiteHost} ${searchHintTerms.slice(0, 6).join(" ")}
- site:${websiteHost} ${productSearchQueries.slice(0, 4).join(" OR ") || rule?.name || "products"}
- site:${websiteHost} ${productMatchTerms.slice(0, 6).join(" OR ") || rule?.name || "products"}

If the campaign terms appear to be in a different language than the website, infer the website/store language and also try the local-language equivalents a shopper would type on that site.
Return concrete product pages only. Use category/search/campaign pages only as discovery_pages.
`.trim()
    : isBackupAttempt
      ? `
This is a backup attempt.

The first attempts did not find enough usable product pages.

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
- Use domain-restricted web searches when helpful. Prefer queries that explicitly restrict results to the allowed domain, for example site:${websiteHost} plus the campaign/theme/product terms.
- If product_search_queries are missing, weak or too generic, derive search queries yourself from the campaign title, campaign prompt, website language, market and business type. Do not treat an empty product_search_queries field as permission to stop.
- First infer the customer's website language and the local words the website is likely to use for the campaign/holiday/season/occasion. Use those local-language terms in search queries before generic gift or product searches.
- First search the customer site for category, collection, campaign, search-result or landing pages that match the campaign/theme/occasion in the site's own language.
- Open the most relevant campaign/theme/category area and identify concrete product pages from there.
- Search for specific product categories that fit the campaign.
- Search for recipient-based product ideas.
- Search for occasion-based product ideas.
- Search for use-case-based product ideas.
- Search for gift/activity/seasonal/sales intent when relevant.
- Prefer concrete product pages over category, brand or listing pages in the final result, but use category/campaign pages as research paths.
- If you find a relevant category, collection, campaign, search-result or landing page, put it in discovery_pages so the app can extract concrete product pages from it. Do not put that page in products.

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
- If the campaign has a specific named holiday, season, event, theme day or cultural occasion, products whose own title, URL, product image context or product page text directly references that occasion must be ranked before generic giftable/personalized/custom products.
- Generic giftable products, personalized products, pet portraits, custom-print products and broad bestsellers are fallback choices only when no concrete occasion-specific product pages can be found.
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
  "discovery_pages": [
    {
      "url": "Full category, collection, campaign or search-result page URL that is useful for finding concrete products",
      "reason": "Short reason why this page is relevant"
    }
  ]
}

Return 5 to 8 real product pages if possible.
For campaign carousels, stop once you have enough concrete product pages for a useful carousel. Do not keep searching for perfect products when five good-enough products are available.
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

  const rawDiscoveryPages = Array.isArray(parsed?.discovery_pages)
    ? parsed.discovery_pages
    : [];
  const validDiscoveryPages = [];

  for (const page of rawDiscoveryPages) {
    const pageUrl = String(
      typeof page === "string" ? page : page?.url || page?.page_url || ""
    ).trim();
    const reason = String(
      typeof page === "string" ? "" : page?.reason || page?.title || ""
    ).trim();

    if (!pageUrl || !isHttpUrl(pageUrl)) {
      continue;
    }

    if (!isSameOrSubdomainUrl(pageUrl, websiteUrl)) {
      console.error("Product researcher returned discovery page from wrong domain", {
        ruleId: rule?.id,
        websiteUrl,
        pageUrl,
        attempt,
      });

      continue;
    }

    if (isLikelyInvalidDiscoveryResearchUrl(pageUrl, websiteUrl)) {
      console.error("Product researcher returned unusable discovery page", {
        ruleId: rule?.id,
        websiteUrl,
        pageUrl,
        attempt,
      });

      continue;
    }

    validDiscoveryPages.push({
      url: pageUrl,
      reason,
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
    products: dedupeUrlItems(validProducts).slice(0, 8),
    discoveryPages: dedupeUrlItems(validDiscoveryPages).slice(0, 4),
  };
}

async function findWebsiteProductWithWebSearch({
  openai,
  brandProfile,
  rule,
  websiteUrl,
  usedWebsiteItems = [],
  fitModel = PRODUCT_RESEARCH_MODEL,
  fitMinimumStrongProducts = CAROUSEL_PRODUCT_SLIDE_TARGET,
}) {
  const attempts = ["best_match", "domain_site_search"];
  const verifiedItems = [];
  const seenUrls = new Set();
  const seenImages = new Set();
  const MAX_VERIFIED_ITEMS = CAROUSEL_WEB_SEARCH_MAX_VERIFIED_ITEMS;
  const campaignPrompt = buildCampaignResearchText(rule);

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
    const webSearchDiscoveryPages = Array.isArray(searchResult?.discoveryPages)
      ? searchResult.discoveryPages
      : [];

    if (!webSearchProducts.length && !webSearchDiscoveryPages.length) {
      console.error("Product researcher found no usable product candidates", {
        ruleId: rule?.id,
        brandProfileId: rule?.brand_profile_id,
        websiteUrl,
        attempt,
      });

      continue;
    }

    let candidateProducts = [...webSearchProducts];

    if (webSearchDiscoveryPages.length) {
      try {
        const discoveryCandidates = await findProductCandidatesFromDiscoveryPages({
          discoveryPages: webSearchDiscoveryPages,
          websiteUrl,
          campaignPrompt,
        });

        candidateProducts = [
          ...candidateProducts,
          ...discoveryCandidates.map((item) => ({
            ...item,
            campaign_fit_source: "ai_discovery_page",
            score: Number(item.score || 0) + 30,
          })),
        ];
      } catch (discoveryError) {
        console.error("Could not extract products from AI discovery pages", {
          ruleId: rule?.id,
          brandProfileId: rule?.brand_profile_id,
          websiteUrl,
          attempt,
          message: discoveryError.message,
        });
      }
    }

    candidateProducts = sortFreshProductCandidatesFirst(
      dedupeUrlItems(candidateProducts),
      usedWebsiteItems,
      websiteUrl
    ).slice(0, CAROUSEL_WEB_SEARCH_CANDIDATE_LIMIT);

    if (!candidateProducts.length) {
      console.error("Product researcher discovery pages had no usable product candidates", {
        ruleId: rule?.id,
        brandProfileId: rule?.brand_profile_id,
        websiteUrl,
        attempt,
        discoveryPageCount: webSearchDiscoveryPages.length,
      });

      continue;
    }

    for (const webSearchProduct of candidateProducts) {
      try {
        const websiteItem = await extractProductDataFromProductPage({
          productUrl: webSearchProduct.url,
          websiteUrl,
          webSearchProduct,
        });

        if (!websiteItem?.url || !websiteItem?.title) {
          console.error("Product researcher candidate could not be normalized", {
            ruleId: rule?.id,
            productUrl: webSearchProduct.url,
            title: webSearchProduct.title,
            attempt,
          });

          continue;
        }

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

          const localItems = verifiedItems.map((item) => ({
            ...item,
            heuristic_campaign_fit_score: scoreCampaignFitForRule(item, rule),
            campaign_fit_score: scoreCampaignFitForRule(item, rule),
            campaign_fit_source: "verified_domain_web_search",
          }));

          if (localItems.filter((item) => isEligibleCampaignCarouselProduct(item, rule)).length >= fitMinimumStrongProducts) {
            return localItems;
          }

          return applyAiCampaignFitScores({
            openai,
            rule,
            brandProfile,
            items: localItems,
            maxItems: MAX_VERIFIED_ITEMS,
            model: fitModel,
            minimumStrongProducts: fitMinimumStrongProducts,
          });
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
      candidateCount: candidateProducts.length,
      directCandidateCount: webSearchProducts.length,
      discoveryPageCount: webSearchDiscoveryPages.length,
      verifiedCount: verifiedItems.length,
    });

    const locallyStrongVerifiedCount = verifiedItems
      .filter((item) => isEligibleCampaignCarouselProduct(item, rule))
      .length;

    if (locallyStrongVerifiedCount >= fitMinimumStrongProducts) {
      console.log("Product researcher stopped after the first sufficient search attempt", {
        ruleId: rule?.id,
        brandProfileId: rule?.brand_profile_id,
        websiteUrl,
        attempt,
        verifiedCount: verifiedItems.length,
        locallyStrongVerifiedCount,
      });

      return verifiedItems.map((item) => ({
        ...item,
        heuristic_campaign_fit_score: scoreCampaignFitForRule(item, rule),
        campaign_fit_score: scoreCampaignFitForRule(item, rule),
        campaign_fit_source: "verified_domain_web_search",
      }));
    }

  }

  return applyAiCampaignFitScores({
    openai,
    rule,
    brandProfile,
    items: verifiedItems,
    maxItems: MAX_VERIFIED_ITEMS,
    model: fitModel,
    minimumStrongProducts: fitMinimumStrongProducts,
  });
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
      websiteRule: rule,
    };
  }

  summary.website_content_rules += 1;

  rule = await resolveWebsiteTextProductIntentRule({
    openai,
    rule,
    brandProfile,
  });

  const websiteUrl = getWebsiteProductSourceUrl(brandProfile);
  const contentType = rule.content_type_id || "website_item";
  const productIntentScoped = isProductIntentScopedWebsiteRule(rule);

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

  let catalogItems = filterWebsiteCatalogItemsForRule(
    await getWebsiteProductCatalogItems({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
    }),
    rule
  );

  if (productIntentScoped && catalogItems.length) {
    catalogItems = await applyAiCampaignFitScores({
      openai,
      rule,
      brandProfile,
      items: catalogItems,
      maxItems: WEBSITE_TEXT_INTENT_AI_SCORE_MAX_ITEMS,
      model: PRODUCT_RESEARCH_FAST_MODEL,
      minimumStrongProducts: 1,
    });
  }

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

  if (catalogSelection?.item && !productIntentScoped) {
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
      websiteRule: rule,
    };
  }

  if (catalogSelection?.item && productIntentScoped) {
    console.log("Website text product-intent rule found a catalog match, but will still run focused product research before final selection", {
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
    if (productIntentScoped) {
      try {
        const storeSearchCandidates = await discoverProductCandidatesFromStoreSearch({
          websiteUrl,
          campaignPrompt: buildCampaignResearchText(rule),
          usedItems: recentUsedItems,
          excludeUsed: true,
        });

        if (storeSearchCandidates.length) {
          let storeSearchItems = await verifyDiscoveredWebsiteProductCandidates({
            candidates: storeSearchCandidates,
            websiteUrl,
            limit: WEBSITE_TEXT_INTENT_STORE_VERIFY_LIMIT,
          });

          if (storeSearchItems.length) {
            storeSearchItems = await applyAiCampaignFitScores({
              openai,
              rule,
              brandProfile,
              items: storeSearchItems.map((item) => ({
                ...item,
                selection_priority: 130,
                campaign_fit_source: item.campaign_fit_source || "website_text_store_search",
                campaign_fit_score: scoreCampaignFitForRule(item, rule) + 25,
              })),
              maxItems: WEBSITE_TEXT_INTENT_STORE_VERIFY_LIMIT,
              model: PRODUCT_RESEARCH_FAST_MODEL,
              minimumStrongProducts: 1,
            });

            const storeSearchSelection = await chooseUnusedWebsiteItem({
              supabase,
              userId: rule.user_id,
              brandProfileId: rule.brand_profile_id,
              sourceUrl: websiteUrl,
              contentType,
              items: [
                ...storeSearchItems,
                ...getSafeCampaignProductCandidates(sortedCatalogItems, rule).map((item) => ({
                  ...item,
                  selection_priority: 30,
                })),
              ],
              rule,
              usedWebsiteImageUrlsThisRun,
              recentUsedItems,
              allowReuseWhenExhausted: false,
            });

            if (storeSearchSelection?.item && isAcceptableWebsiteTextProductSelection(storeSearchSelection.item, rule)) {
              await upsertWebsiteProductCatalogItems({
                supabase,
                userId: rule.user_id,
                brandProfileId: rule.brand_profile_id,
                sourceUrl: websiteUrl,
                items: [storeSearchSelection.item],
                discoverySource: getWebsiteCatalogDiscoverySource("store_search", rule),
              });

              summary.website_items_found += 1;
              summary.website_content_success += 1;
              summary.website_web_search_success += 1;

              return {
                websiteItem: storeSearchSelection.item,
                websiteSourceUrl: websiteUrl,
                websiteCycleNumber: storeSearchSelection.cycleNumber,
                useWebsiteImage: storeSearchSelection.useWebsiteImage,
                websiteRule: rule,
              };
            }
          }
        }
      } catch (storeSearchError) {
        console.log("Website text store-search product discovery failed", {
          ruleId: rule.id,
          brandProfileId: rule.brand_profile_id,
          websiteUrl,
          message: storeSearchError.message,
        });
      }
    }

    const webSearchItems = await findWebsiteProductWithWebSearch({
      openai,
      brandProfile,
      rule,
      websiteUrl,
      usedWebsiteItems: recentUsedItems,
      fitModel: productIntentScoped ? PRODUCT_RESEARCH_FAST_MODEL : PRODUCT_RESEARCH_MODEL,
      fitMinimumStrongProducts: productIntentScoped ? 1 : CAROUSEL_MIN_PRODUCT_SLIDES,
    });

    if (Array.isArray(webSearchItems) && webSearchItems.length) {
      const selected = await chooseUnusedWebsiteItem({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        contentType,
        items: productIntentScoped
          ? [
              ...webSearchItems.map((item) => ({
                ...item,
                selection_priority: 100,
                campaign_fit_source: isCampaignScopedWebsiteRule(rule) ? "ai_campaign_research" : "ai_product_intent_research",
                campaign_fit_score: scoreCampaignFitForRule(item, rule) + 40,
              })),
              ...getSafeCampaignProductCandidates(sortedCatalogItems, rule).map((item) => ({ ...item, selection_priority: 10 })),
            ]
          : webSearchItems,
        rule,
        usedWebsiteImageUrlsThisRun,
        recentUsedItems,
        allowReuseWhenExhausted: false,
      });

      if (selected?.item && isAcceptableWebsiteTextProductSelection(selected.item, rule)) {
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
          websiteRule: rule,
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
      rule,
      usedItems: recentUsedItems,
    });

    if (discoveredCandidates.length) {
      let discoveredItems = await verifyDiscoveredWebsiteProductCandidates({
        candidates: discoveredCandidates,
        websiteUrl,
      });

      if (productIntentScoped && discoveredItems.length) {
        discoveredItems = await applyAiCampaignFitScores({
          openai,
          rule,
          brandProfile,
          items: discoveredItems,
          maxItems: WEBSITE_TEXT_INTENT_AI_SCORE_MAX_ITEMS,
          model: PRODUCT_RESEARCH_FAST_MODEL,
          minimumStrongProducts: 1,
        });
      }

      const discoveredSelection = await chooseUnusedWebsiteItem({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        contentType,
        items: productIntentScoped
          ? [
              ...discoveredItems.map((item) => ({
                ...item,
                selection_priority: 100,
                campaign_fit_source: isCampaignScopedWebsiteRule(rule) ? "campaign_discovery" : "product_intent_discovery",
                campaign_fit_score: scoreCampaignFitForRule(item, rule),
              })),
              ...(Array.isArray(webSearchItems) ? webSearchItems.map((item) => ({
                ...item,
                selection_priority: 90,
                campaign_fit_source: isCampaignScopedWebsiteRule(rule) ? "ai_campaign_research" : "ai_product_intent_research",
                campaign_fit_score: scoreCampaignFitForRule(item, rule) + 40,
              })) : []),
              ...getSafeCampaignProductCandidates(sortedCatalogItems, rule).map((item) => ({ ...item, selection_priority: 10 })),
            ]
          : discoveredItems,
        rule,
        usedWebsiteImageUrlsThisRun,
        recentUsedItems,
        allowReuseWhenExhausted: false,
      });

      if (discoveredSelection?.item && isAcceptableWebsiteTextProductSelection(discoveredSelection.item, rule)) {
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
          websiteRule: rule,
        };
      }
    }

    const reusablePool = productIntentScoped
      ? [
          ...getSafeCampaignProductCandidates(sortedCatalogItems, rule),
          ...(Array.isArray(webSearchItems) ? getSafeCampaignProductCandidates(webSearchItems, rule) : []),
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

    if (reuseSelection?.item && isAcceptableWebsiteTextProductSelection(reuseSelection.item, rule)) {
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
        websiteRule: rule,
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
  if (!isCarouselRule(rule) || !Array.isArray(websiteItems) || !websiteItems.length) {
    return;
  }

  const resolvedSourceUrl =
    sourceUrl ||
    rule?.brand_profile?.website_product_source_url ||
    rule?.brand_profile?.website_url ||
    rule?.website_url ||
    websiteItems.find((item) => item?.source_url)?.source_url ||
    websiteItems.find((item) => item?.url)?.url ||
    null;

  const rows = websiteItems.map((websiteItem, index) => ({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,
    automation_rule_id: rule.id,
    post_id: postId,
    source_url: resolvedSourceUrl || websiteItem.source_url || websiteItem.url || null,
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

  // Carousel products are reserved when selected, before slides/email are built.
  // website_content_history remains the audit trail and a secondary rotation source.
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
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    productUrl: websiteItem.url,
    sourceUrl,
    websiteItem,
    usedSource: getWebsiteCatalogUsedSource(rule),
  });
}

async function generateAutomationPost(openai, rule) {
  const completion = await openai.chat.completions.create({
    model: POST_TEXT_MODEL,
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
    ...getTemperatureOptions(POST_TEXT_MODEL, 0.75),
  });

  return completion.choices?.[0]?.message?.content?.trim() || "";
}

async function generateCarouselSlides(openai, rule, postContent) {
  const carouselProducts = getCarouselProducts(rule).filter(isValidCarouselProduct);

  if (carouselProducts.length > 0) {
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
      ...getTemperatureOptions(POST_TEXT_MODEL, 0.65),
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
    body: "",
    cta_text: "",
    product_url: product.url || null,
    image_url: product.image_url || null,
    product_title: product.title || null,
    product_price: getTrustedProductCardPrice(product) || null,
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
  const language = normalizeSingleContentLanguage(rule?.language || rule?.brand_profile?.content_language, "English");
  const productNames = (products || []).slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET).map((item) => item?.title).filter(Boolean).join(", ");
  const headline = normalizeSlideText(outroSlide?.headline || brandName, 80);
  const supportingText = normalizeSlideText(outroSlide?.cta_text || outroSlide?.body || rule?.cta_type || "", 90);
  const campaignVisualContext = formatCampaignVisualContextForPrompt(rule) || "Campaign visual context: General brand CTA.";

  return `Create a premium square closing slide for a social media carousel. This is the final CTA slide after product slides for ${brandName}. Use a clean, polished marketing design with a subtle modern background and clear readable text overlay. Write the overlaid text in ${language}. Main overlay text: "${headline}". Supporting overlay text: "${supportingText}". ${campaignVisualContext}. If this carousel is connected to a campaign, holiday, season, shopping event or theme, the closing image must clearly match that theme and must not look generic or unrelated. The slide should feel like a professional final call-to-action and may use abstract shapes, elegant composition, soft shadows, geometric shapes, or a tasteful category-inspired scene. If you include any product-like objects, they must be generic, unbranded, non-specific, and not directly identifiable as exact products from the store. Never invent or depict specific catalog items, exact product prints, poster motifs, readable slogan text on products, apparel graphics, packaging artwork, or branded product designs. Do not place the store name or brand logo onto any depicted product. Avoid close-up hero shots of a single product. For stores that sell printed or text-based products such as posters, apparel, mugs, or accessories, do not generate new readable product text or new product artwork. Keep all non-overlay product details subtle, generic, and secondary to the CTA message. Do not show prices, discount claims, or crowded text. Products featured earlier in the carousel: ${productNames || "selected website products"}.`;
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
- Product slides should use the product title as the main text. Leave product slide body text empty unless a short factual detail is essential and directly belongs to that exact product.
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
      ...getTemperatureOptions(POST_TEXT_MODEL, 0.55),
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
        body: "",
        cta_text: normalizeSlideText(slide.cta_text || slide.cta || "", 80),
        product_url: product.url || null,
        image_url: product.image_url || null,
        product_title: product.title || null,
        product_price: getTrustedProductCardPrice(product) || null,
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

  if (productCount < CAROUSEL_MIN_PRODUCT_SLIDES) {
    throw new Error(`Carousel needs at least ${CAROUSEL_MIN_PRODUCT_SLIDES} verified products with images. Found ${productCount}.`);
  }

  const includeLogo = shouldUseLogoForRule(rule, rule.brand_profile);
  const destinationUrl = getPostDestinationUrl(rule);

  const rows = [];

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index] || {};
    const isOutroSlide = String(slide.slide_type || '').toLowerCase() === 'product_outro';
    const slideProduct = !isOutroSlide ? carouselProducts[index] || null : null;
    const sourceSlideImageUrl = slide.image_url || slideProduct?.image_url || (!isOutroSlide && index === 0 ? imageUrl || selectedItem?.image_url : null) || null;
    let slideImageUrl = sourceSlideImageUrl;
    let slideStoragePath = !isOutroSlide && index === 0 ? imageStoragePath || null : null;
    let generatedImagePrompt = null;
    let slideRenderedBy = 'source_image';
    let productCardRenderError = null;

    if (!isOutroSlide && sourceSlideImageUrl) {
      try {
        const { imageBase64 } = await renderCarouselProductSlideImage({
          sourceImageUrl: sourceSlideImageUrl,
          product: slideProduct || slide,
          title: slideProduct?.title || slide.product_title || slide.headline || "",
          price: getTrustedProductCardPrice(slideProduct) || slide.product_price || "",
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
        productCardRenderError = error?.message || 'Unknown product card render error';
        console.error('Carousel product slide render failed', {
          ruleId: rule?.id,
          postId,
          slideOrder: index + 1,
          message: productCardRenderError,
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
        product_title: slideProduct?.title || slide.product_title || null,
        product_brand: getTrustedProductCardBrand(slideProduct) || null,
        product_price: getTrustedWebsiteItemPricing(slideProduct || {}).displayPrice || slide.product_price || null,
        product_sale_price: getTrustedWebsiteItemPricing(slideProduct || {}).salePrice || null,
        product_original_price: getTrustedWebsiteItemPricing(slideProduct || {}).originalPrice || null,
        product_card_render_error: productCardRenderError || null,
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

  const safeImageUrl = await assertPublicHttpUrl(imageUrl);

  const response = await fetch(safeImageUrl, {
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
        .select('slide_order, headline, image_url, metadata, product_url')
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
  const raw = String(value || "");
  const trailing = raw.match(/[).,!?:;]+$/)?.[0] || "";
  const cleaned = raw.replace(/[).,!?:;]+$/g, "");

  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${trailing}`;
  } catch {
    return cleaned;
  }
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

      let automationRunStartedAtIso = null;
      let automationRunLogId = null;
      let automationRunFinished = false;
      let automationRunPostId = null;
      let automationRunWebsiteItem = null;
      let automationRunWebsiteItems = [];
      let automationRunRuleSnapshot = rule;

      const finishRunLog = async (status, errorMessage = null, extraSummary = {}) => {
        if (automationRunFinished || !automationRunLogId) {
          return;
        }

        await finishAutomationRunLog({
          supabase,
          runLogId: automationRunLogId,
          status,
          startedAtIso: automationRunStartedAtIso,
          errorMessage,
          postId: automationRunPostId,
          websiteItem: automationRunWebsiteItem,
          websiteItems: automationRunWebsiteItems,
          ruleSnapshot: automationRunRuleSnapshot,
          extraSummary,
        });

        automationRunFinished = true;
        summary.automation_run_logs_finished += 1;
      };

      try {
        if (hasAlreadyRunToday(rule, now)) {
          summary.skipped += 1;
          continue;
        }

        const claimed = await claimAutomationRuleForProcessing({
          supabase,
          rule,
          now,
        });

        if (!claimed) {
          summary.skipped += 1;
          summary.skipped_locked += 1;
          continue;
        }

        automationRunStartedAtIso = new Date().toISOString();
        automationRunLogId = await createAutomationRunLog({
          supabase,
          rule,
          startedAtIso: automationRunStartedAtIso,
        });

        if (automationRunLogId) {
          summary.automation_run_logs_started += 1;
        }

        const recentDrafts = await findRecentAutomationDraftsForRule({
          supabase,
          ruleId: rule.id,
          now,
        });

        const incompleteCarouselDrafts = countIncompleteCarouselDrafts(recentDrafts);

        if (incompleteCarouselDrafts > 0) {
          const message =
            "Skipped because this automation rule already has a recent incomplete carousel draft. Review or delete it manually before retrying to avoid duplicate AI cost.";

          await setRuleError(supabase, rule.id, message);

          await finishRunLog("skipped", message, {
            stage: "existing_incomplete_carousel_draft",
            incomplete_carousel_drafts: incompleteCarouselDrafts,
          });

          summary.skipped += 1;
          summary.skipped_existing_draft += 1;
          continue;
        }

        const existingCompleteDraft = recentDrafts.find(isCompleteAutomationDraft);

        if (existingCompleteDraft) {
          const recovered = await makeCompleteGeneratingDraftVisible({
            supabase,
            post: existingCompleteDraft,
          });

          if (recovered) {
            summary.recovered_completed_drafts += 1;
          }

          await setRuleError(
            supabase,
            rule.id,
            "Skipped because this automation rule already has a recent completed draft awaiting review."
          );

          await finishRunLog("skipped", "Skipped because this automation rule already has a recent completed draft awaiting review.", { stage: "existing_completed_draft" });

          summary.skipped += 1;
          summary.skipped_existing_draft += 1;
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

          await finishRunLog("skipped", message, { stage: "credit_balance" });

          summary.skipped += 1;
          summary.no_credit_balance += 1;
          continue;
        }

        const creditsRemaining = Number(balance.credits_remaining || 0);

        if (creditsRemaining < creditCost) {
          const message = "Not enough credits";

          await setRuleError(supabase, rule.id, message);

          await finishRunLog("skipped", message, { stage: "credits" });

          summary.skipped += 1;
          summary.not_enough_credits += 1;
          continue;
        }

const brandProfile = await getBrandProfileForRule(supabase, rule);

        if (brandProfile) {
          summary.brand_profile_found += 1;
          await updateAutomationRunLogBrandSnapshot({
            supabase,
            runLogId: automationRunLogId,
            brandProfile,
            rule,
          });
        } else {
          summary.brand_profile_missing += 1;
        }

let websiteItem = null;
let websiteItems = [];
let websiteSourceUrl = null;
let websiteCycleNumber = null;
let useWebsiteImage = false;
let websitePreparedRule = rule;

        if (isCarouselRule(rule)) {
          try {
            const carouselPreparer = isCampaignScopedWebsiteRule(rule)
              ? prepareCampaignCarouselProductsV10
              : prepareCarouselProductsForRule;
            const preparedCarouselProducts = await carouselPreparer({
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
            websitePreparedRule = preparedCarouselProducts.websiteRule || rule;
            automationRunRuleSnapshot = websitePreparedRule;
            automationRunWebsiteItem = websiteItem;
            automationRunWebsiteItems = websiteItems;
          } catch (carouselError) {
            const message = carouselError.message ||
              `Website carousel needs at least ${CAROUSEL_MIN_PRODUCT_SLIDES} products with product images.`;
            automationRunRuleSnapshot = carouselError?.resolvedRule || automationRunRuleSnapshot;

            await setRuleError(supabase, rule.id, message);

            await finishRunLog("failed", message, {
              stage: "carousel_product_prepare",
              retry_disabled: false,
              cost_protection: false,
              resolver_error_code: carouselError?.code || null,
              resolver_diagnostics: carouselError?.resolverDiagnostics || null,
            });

            summary.skipped += 1;
            summary.website_content_failed += 1;
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
            websitePreparedRule = preparedWebsiteContent.websiteRule || rule;
            automationRunWebsiteItem = websiteItem;
            automationRunWebsiteItems = websiteItem ? [websiteItem] : [];
          } catch (websiteError) {
            summary.website_content_failed += 1;

            throw websiteError;
          }
        }

        const ruleWithBrandProfile = {
          ...websitePreparedRule,
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

          await finishRunLog("failed", message, { stage: "content_generation" });

          summary.errors += 1;
          continue;
        }

    const approvalRequired = true;
const approvalToken = crypto.randomBytes(32).toString("hex");
const postStatus = isCarouselRule(rule) ? "generating" : "pending_approval";
let effectivePostStatus = postStatus;
const wantsImage = Boolean(rule.generate_image);

const { data: post, error: postError } = await supabase
  .from("posts")
  .insert({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,

            content: generatedContent,
            platform: rule.platform || null,
            tone: rule.tone || null,
            language: normalizeSingleContentLanguage(rule.language || brandProfile?.content_language, "English"),
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

          await finishRunLog("failed", message, { stage: "post_insert" });

          summary.errors += 1;
          continue;
        }

        automationRunPostId = post.id;

        let imageUrl = null;
        let imageStoragePath = null;
        let finalImagePrompt = wantsImage ? rule.image_prompt || null : null;

        const isWebsiteBasedPost = Boolean(rule.uses_website_content || websiteItem || websiteSourceUrl);

        if (wantsImage && websiteItem?.image_url && useWebsiteImage) {
          imageUrl = websiteItem.image_url;
          finalImagePrompt =
            "Website product card rendered from verified website image, product name and price when available.";

          try {
            const { imageBase64 } = await renderCarouselProductSlideImage({
              sourceImageUrl: websiteItem.image_url,
              product: websiteItem,
              title: websiteItem.title || "",
              price: getTrustedProductCardPrice(websiteItem) || "",
            });

            const uploadedProductCard = await uploadGeneratedImageToStorage({
              supabase,
              imageBase64,
              userId: rule.user_id,
              postId: post.id,
              fileSuffix: "website-product-card",
            });

            imageUrl = uploadedProductCard.imageUrl || imageUrl;
            imageStoragePath = uploadedProductCard.imageStoragePath || imageStoragePath;
          } catch (renderError) {
            console.error("Website product card render failed, using original website image", {
              ruleId: rule.id,
              postId: post.id,
              message: renderError.message,
            });
          }

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

            const { error: carouselReadyStatusError } = await supabase
              .from("posts")
              .update({
                status: "pending_approval",
                updated_at: new Date().toISOString(),
              })
              .eq("id", post.id);

            if (carouselReadyStatusError) {
              throw new Error(
                carouselReadyStatusError.message ||
                  "Could not mark carousel draft ready for approval"
              );
            }

            effectivePostStatus = "pending_approval";
          } catch (carouselSlideError) {
            const message = carouselSlideError.message || "Carousel slides could not be created.";
            await supabase.from("post_slides").delete().eq("post_id", post.id);
            await supabase.from("posts").delete().eq("id", post.id);
            await stopRuleAfterCostProtectedCarouselFailure(supabase, rule.id, message);
            await finishRunLog("failed", message, {
              stage: "carousel_slide_save",
              retry_disabled: true,
              cost_protection: true,
            });
            summary.website_content_failed += 1;
            continue;
          }
        }

        if (isCarouselRule(rule) && websiteItems.length) {
          try {
            await commitCarouselProductUsage({
              supabase,
              rule: websitePreparedRule,
              sourceUrl: websiteSourceUrl,
              products: websiteItems,
            });

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
              rule: websitePreparedRule,
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

        if (effectivePostStatus === "pending_approval") {
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

          await finishRunLog("failed", message, { stage: "credit_update" });

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

          await finishRunLog("failed", message, { stage: "credit_transaction" });

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
          await finishRunLog("success", null, {
            stage: "rule_update_warning",
            rule_update_error: ruleUpdateError.message || null,
            email_sent: effectivePostStatus === "pending_approval" && summary.emails_sent > 0,
          });
          summary.warnings += 1;
          continue;
        }

        summary.generated += 1;

        if (effectivePostStatus === "pending_approval") {
          summary.pending_approval += 1;
        }

      if (effectivePostStatus === "approved") {
  summary.approved += 1;
}

        await finishRunLog("success", null, {
          stage: "completed",
          effective_post_status: effectivePostStatus,
          email_expected: effectivePostStatus === "pending_approval",
          website_source_url: websiteSourceUrl,
          website_cycle_number: websiteCycleNumber,
          use_website_image: useWebsiteImage,
          website_item_count: Array.isArray(websiteItems) ? websiteItems.length : (websiteItem ? 1 : 0),
        });
      } catch (error) {
        const message = error.message || "Unknown automation error";

        await setRuleError(supabase, rule.id, message);

        await finishRunLog("failed", message, { stage: "unhandled" });

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
