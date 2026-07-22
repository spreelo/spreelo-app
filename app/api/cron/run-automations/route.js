import { createClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import crypto from "crypto";
import { createRequire } from "node:module";
import {
  detectLikelyUiLocaleFromText,
  getServerTranslations,
  resolveBestServerLocale,
  resolveUiLocaleFromLanguageName,
} from "../../../../lib/i18n/serverUiText.js";
import { assertPublicHttpUrl } from "../../../../lib/security.js";
import { normalizeSingleContentLanguage } from "../../../../lib/contentLanguage.js";
import {
  isConnectionAuthFailure,
  markConnectionExpiredAndAlert,
} from "../../../../lib/socialConnectionAlerts.js";
import {
  buildProductPushEdit,
  queueShotstackRender,
  waitForShotstackRender,
} from "../../../../lib/shotstack.js";
import {
  buildVideoBackgroundProfile,
  chooseVideoBackground,
} from "../../../../lib/videoBackgroundSelection.js";
import { createPlanPreviewToken } from "../../../../lib/planPreviewToken.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const require = createRequire(import.meta.url);
let loadedSharpRuntime = null;

function getSharpRuntime() {
  if (loadedSharpRuntime) return loadedSharpRuntime;

  try {
    const importedSharp = require("sharp");
    loadedSharpRuntime = importedSharp?.default || importedSharp;
    return loadedSharpRuntime;
  } catch (error) {
    const runtimeError = new Error(
      "The Sharp image runtime is unavailable. Non-image automation can continue, but this image job cannot be rendered.",
      { cause: error },
    );
    runtimeError.code = "SHARP_RUNTIME_UNAVAILABLE";
    throw runtimeError;
  }
}

const sharp = new Proxy((...args) => getSharpRuntime()(...args), {
  get(_target, property) {
    return getSharpRuntime()[property];
  },
});

const DEFAULT_TIME_ZONE = "UTC";
const SMART_QUEUE_WORKER_COUNT = Math.max(
  1,
  Math.min(
    10,
    Number(
      process.env.SMART_QUEUE_WORKER_COUNT ||
        process.env.SMART_QUEUE_LANE_COUNT ||
        5
    ) || 5
  )
);
const SMART_QUEUE_BATCH_SIZE = Math.max(
  1,
  Math.min(5, Number(process.env.SMART_QUEUE_BATCH_SIZE || 2) || 2)
);
const SMART_QUEUE_CANDIDATE_LIMIT = 250;
const SMART_QUEUE_CLAIM_SCAN_MULTIPLIER = 4;
const SMART_QUEUE_HORIZON_HOURS = 96;
const PUBLISH_BATCH_SIZE = 40;
const PUBLISH_LOCK_MINUTES = 12;
const MAX_PUBLISH_ATTEMPTS = 5;
const CRON_RULE_PROCESSING_LOCK_MINUTES = 15;
const RECENT_AUTOMATION_DRAFT_BLOCK_HOURS = 6;
const INCOMPLETE_CAROUSEL_DRAFT_GRACE_MINUTES = 20;
const STALE_CAROUSEL_RECOVERY_WINDOW_HOURS = 24;
const MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES = 2;
const APP_URL = "https://app.spreelo.com";
const RESEND_FROM_EMAIL = "Spreelo <noreply@spreelo.com>";
const POST_VIDEOS_BUCKET = "post-videos";
const ANIMATED_VIDEO_DURATION_SECONDS = 5;
const ANIMATED_TEXT_PANEL_SOURCE_WIDTH = 1408;
const ANIMATED_TEXT_PANEL_SOURCE_HEIGHT = 480;
const ANIMATED_TEXT_PANEL_LEFT = 128;
const ANIMATED_TEXT_PANEL_TOP = 1280;
const ANIMATED_TEXT_PANEL_WIDTH = 824;
const ANIMATED_TEXT_PANEL_HEIGHT = 281;
const MAX_ANIMATED_VIDEO_RENDERS_PER_RUN = 1;
const MAX_ANIMATED_VIDEO_PUBLISHES_PER_RUN = 1;
const INCOMPLETE_ANIMATED_VIDEO_GRACE_MINUTES = 20;
const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const WEBSITE_MAX_PAGES = 8;
const WEBSITE_MAX_TEXT_CHARS_PER_PAGE = 6500;
const WEBSITE_MAX_TOTAL_TEXT_CHARS = 22000;
const WEBSITE_MAX_IMAGE_CANDIDATES = 40;
const WEBSITE_PRODUCT_REUSE_LIMIT = 100;
const WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT = 150;
const WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT = 120;
const WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT = 18;
const WEBSITE_STORE_SEARCH_FETCH_LIMIT = 18;
const WEBSITE_STORE_SEARCH_VERIFY_LIMIT = 18;
const CAMPAIGN_STORE_SEARCH_QUERY_LIMIT = 12;
const CAMPAIGN_SEARCH_FORM_QUERY_LIMIT = 4;
const CAMPAIGN_SEARCH_FORM_URL_LIMIT = 6;
const CAROUSEL_AI_SCORE_MAX_ITEMS = 15;
const CAROUSEL_DISCOVERY_VERIFY_LIMIT = 25;
const CAROUSEL_WEB_SEARCH_MAX_VERIFIED_ITEMS = 8;
const CAROUSEL_WEB_SEARCH_CANDIDATE_LIMIT = 24;
const CAMPAIGN_STRONG_PRODUCT_FIT_SCORE = 80;
const CAMPAIGN_NEAR_PRODUCT_FIT_SCORE = 75;
const CAMPAIGN_SUPPORTING_PRODUCT_FIT_SCORE = 60;
const CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE = 60;
const CAROUSEL_MIN_PRODUCT_SLIDES = 5;
const CAROUSEL_PRODUCT_SLIDE_TARGET = 5;
const CAROUSEL_OUTRO_SLIDE_COUNT = 1;
const CAROUSEL_MAX_PRODUCT_SLIDES = CAROUSEL_PRODUCT_SLIDE_TARGET + CAROUSEL_OUTRO_SLIDE_COUNT;
const CAMPAIGN_LOCKED_SEARCH_POOL_MIN_ITEMS = CAROUSEL_PRODUCT_SLIDE_TARGET;
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

const POST_TEXT_MODEL = "gpt-4.1-mini";
const PRODUCT_RESEARCH_MODEL = process.env.PRODUCT_RESEARCH_MODEL || "gpt-5.5";
const PRODUCT_RESEARCH_FAST_MODEL =
  process.env.PRODUCT_RESEARCH_FAST_MODEL || POST_TEXT_MODEL;
const IMAGE_MODEL = "gpt-image-2";
const configuredAnimatedOverlayImageModel = String(
  process.env.ANIMATED_OVERLAY_IMAGE_MODEL || ""
).trim();
const ANIMATED_OVERLAY_IMAGE_MODEL = configuredAnimatedOverlayImageModel.startsWith(
  "gpt-image-2"
)
  ? configuredAnimatedOverlayImageModel
  : "gpt-image-2";
const INSTAGRAM_GRAPH_API_VERSION =
  process.env.INSTAGRAM_GRAPH_API_VERSION || "v21.0";
const FACEBOOK_GRAPH_API_VERSION =
  process.env.FACEBOOK_GRAPH_API_VERSION || "v25.0";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ADAPTIVE_PLAN_PREFIX = "SPREELO_ADAPTIVE_V1:";

function parseAdaptivePlanConfig(rule) {
  if (rule?.schedule_type !== "weekly") return null;

  const notes = String(rule?.strategy_notes || "");
  const markerIndex = notes.indexOf(ADAPTIVE_PLAN_PREFIX);
  if (markerIndex === -1) return null;

  const jsonLine = notes
    .slice(markerIndex + ADAPTIVE_PLAN_PREFIX.length)
    .split("\n", 1)[0]
    .trim();

  if (!jsonLine) return null;

  try {
    const config = JSON.parse(jsonLine);
    if (!config?.enabled || !Array.isArray(config?.variants) || !config.variants.length) {
      return null;
    }
    return config;
  } catch (error) {
    console.warn("Could not parse adaptive weekly plan configuration", {
      ruleId: rule?.id,
      message: error?.message,
    });
    return null;
  }
}

function getAdaptiveWeeklyCycle(rule, scheduledPublishAtIso, config = null) {
  const configuredStart = String(config?.baseStartDate || "").trim();
  const cycleStartMs = new Date(
    configuredStart
      ? `${configuredStart}T00:00:00Z`
      : rule?.created_at || rule?.updated_at || 0
  ).getTime();
  const scheduledAtMs = new Date(
    scheduledPublishAtIso || rule?.next_run_at || Date.now()
  ).getTime();

  if (!Number.isFinite(cycleStartMs) || !Number.isFinite(scheduledAtMs)) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((scheduledAtMs - cycleStartMs) / (7 * 24 * 60 * 60 * 1000))
  );
}

function resolveAdaptiveWeeklyRule(rule, scheduledPublishAtIso) {
  const config = parseAdaptivePlanConfig(rule);
  if (!config) return rule;

  const cycle = getAdaptiveWeeklyCycle(rule, scheduledPublishAtIso, config);
  const slotIndex = Math.max(0, Number(config.slotIndex || 0));
  const variantIndex =
    config.selectionMode === "cycle"
      ? cycle % config.variants.length
      : (cycle + slotIndex) % config.variants.length;
  const variant = config.variants[variantIndex];

  if (!variant || typeof variant !== "object") return rule;

  return {
    ...rule,
    content_type_id: variant.contentTypeId || rule.content_type_id,
    content_type_label: variant.contentTypeLabel || rule.content_type_label,
    prompt: variant.prompt || rule.prompt,
    image_prompt: variant.imagePrompt || rule.image_prompt,
    generate_image:
      typeof variant.generateImage === "boolean"
        ? variant.generateImage
        : rule.generate_image,
    image_source: variant.imageSource || rule.image_source,
    uses_website_content:
      typeof variant.usesWebsiteContent === "boolean"
        ? variant.usesWebsiteContent
        : rule.uses_website_content,
    content_format: variant.contentFormat || rule.content_format,
    animation_style: variant.animationStyle || null,
    credit_cost: Number(variant.creditCost || rule.credit_cost || 1),
    marketing_angle: variant.marketingAngle || rule.marketing_angle,
    customer_stage: variant.customerStage || rule.customer_stage,
    cta_strength: variant.ctaStrength || rule.cta_strength,
    adaptive_cycle: cycle,
    adaptive_goal: config.goalId || null,
  };
}

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
  const rawTitle = String(item?.title || item?.name || item?.product_title || "").trim();
  if (!rawTitle || rawTitle.length < 2) {
    return "";
  }

  const title = sanitizeProductTitleForCard(rawTitle);
  return title ? normalizeSlideText(title, 96) : "";
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
  const centerX = width / 2;
  const overlayX = 58;
  const overlayY = 788;
  const overlayWidth = 964;
  const overlayHeight = 234;

  const pricingSource = product && typeof product === "object" ? { ...product } : {};
  if (price && !pricingSource.price) {
    pricingSource.price = price;
  }

  const trustedTitle = getTrustedProductCardTitle({
    ...pricingSource,
    title: title || pricingSource?.title || pricingSource?.name || pricingSource?.product_title || "",
  });
  const pricing = getTrustedWebsiteItemPricing(pricingSource);
  const titleLines = trustedTitle ? wrapSvgText(trustedTitle, 30, 2) : [];
  const hasOverlay = Boolean(titleLines.length || pricing.displayPrice);
  const titleY = titleLines.length > 1 ? 850 : 872;
  const priceY = titleLines.length > 1 ? 970 : 958;

  const titleSvg = titleLines.length
    ? buildCenteredSvgTextBlock(titleLines, {
        x: centerX,
        y: titleY,
        fontSize: 38,
        lineHeight: 46,
        fontWeight: 750,
        fill: "#111827",
      })
    : "";

  let priceSvg = "";
  if (pricing.isOnSale && pricing.salePrice && pricing.originalPrice) {
    const saleX = centerX - 18;
    const originalX = centerX + 18;
    const originalFontSize = 26;
    const estimatedWidth = Math.max(pricing.originalPrice.length * originalFontSize * 0.58, 48);

    priceSvg = `
      <text x="${saleX}" y="${priceY}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="43" font-weight="800" fill="#dc2626" text-anchor="end">${escapeSvg(pricing.salePrice)}</text>
      <text x="${originalX}" y="${priceY}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${originalFontSize}" font-weight="600" fill="#64748b" text-anchor="start">${escapeSvg(pricing.originalPrice)}</text>
      <line x1="${originalX}" y1="${priceY - 10}" x2="${originalX + estimatedWidth}" y2="${priceY - 10}" stroke="#64748b" stroke-width="2.5" stroke-linecap="round"/>
    `;
  } else if (pricing.displayPrice) {
    priceSvg = `<text x="${centerX}" y="${priceY}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="43" font-weight="800" fill="#0f172a" text-anchor="middle">${escapeSvg(pricing.displayPrice)}</text>`;
  }

  const overlaySvg = hasOverlay
    ? `
      <rect x="${overlayX}" y="${overlayY}" width="${overlayWidth}" height="${overlayHeight}" rx="34" fill="#ffffff" fill-opacity="0.95" stroke="#e2e8f0" stroke-width="2"/>
      ${titleSvg}
      ${priceSvg}
    `
    : "";

  const overlayLayer = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${overlaySvg}
    </svg>
  `;

  const composites = [];

  if (sourceImageUrl) {
    try {
      const sourceBuffer = await fetchImageBufferForOverlay(sourceImageUrl);
      const productImageBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize({
          width,
          height,
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
          withoutEnlargement: false,
        })
        .png()
        .toBuffer();

      composites.push({
        input: productImageBuffer,
        top: 0,
        left: 0,
      });
    } catch (error) {
      console.error("Product image fetch/render failed", {
        sourceImageUrl,
        message: error.message,
      });
    }
  }

  if (hasOverlay) {
    composites.push({
      input: Buffer.from(overlayLayer),
      top: 0,
      left: 0,
    });
  }

  const outputBuffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return {
    imageBase64: outputBuffer.toString("base64"),
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

function getRuleUpdatePayloadAfterSuccess(
  rule,
  nowIso,
  now,
  scheduledPublishAtIso
) {
  const payload = {
    last_run_at: nowIso,
    last_error: null,
    queue_locked_until: null,
    queue_attempts: 0,
    updated_at: nowIso,
  };

  if (rule.schedule_type === "once") {
    payload.is_active = false;
    payload.next_run_at = null;
  }

  if (rule.schedule_type === "weekly") {
    payload.next_run_at = getNextWeeklyRunAtIsoAfterScheduled(
      rule,
      scheduledPublishAtIso || getScheduledPublishAtIso(rule, now)
    );
  }

  return payload;
}

function addMinutesIso(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function subtractHoursIso(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function addHoursIso(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function getStableQueueHash(value) {
  let hash = 2166136261;
  const text = String(value || "");

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getGenerationLeadHours(rule) {
  if (isAnimatedVideoRule(rule)) return 72;
  if (isCarouselRule(rule)) return 60;
  if (Boolean(rule?.generate_image)) return 48;
  return 24;
}

function getScheduledPublishAtIso(rule, now = new Date()) {
  const explicit = String(rule?.next_run_at || "").trim();
  if (explicit && Number.isFinite(new Date(explicit).getTime())) {
    return new Date(explicit).toISOString();
  }

  const publishTime = normalizeTime(rule?.publish_time);
  const timeZone = getRuleTimeZone(rule);
  if (!publishTime) return now.toISOString();

  const [hourValue, minuteValue] = publishTime.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return now.toISOString();

  if (rule?.schedule_type === "once" && rule?.run_date) {
    const [year, month, day] = String(rule.run_date).split("-").map(Number);
    if ([year, month, day].every(Number.isFinite)) {
      return zonedLocalToUtcDate({ year, month, day, hour, minute, timeZone }).toISOString();
    }
  }

  return now.toISOString();
}

function getGenerationDueAtMs(rule) {
  const scheduledAtMs = new Date(getScheduledPublishAtIso(rule)).getTime();
  const leadHours = getGenerationLeadHours(rule);
  const spreadHours = Math.max(1, Math.round(leadHours * 0.25));
  const jitterMinutes = getStableQueueHash(rule?.id) % (spreadHours * 60);
  return scheduledAtMs - leadHours * 60 * 60 * 1000 + jitterMinutes * 60 * 1000;
}

function isRuleReadyForGeneration(rule, now = new Date()) {
  const scheduledAtMs = new Date(getScheduledPublishAtIso(rule, now)).getTime();
  if (!Number.isFinite(scheduledAtMs)) return false;
  return now.getTime() >= getGenerationDueAtMs(rule);
}

function getQueuePriorityScore(rule, now = new Date()) {
  const scheduledAtMs = new Date(getScheduledPublishAtIso(rule, now)).getTime();
  const hoursUntilPublish = (scheduledAtMs - now.getTime()) / (60 * 60 * 1000);
  const dueAtMs = getGenerationDueAtMs(rule);
  const overdueHours = Math.max(0, (now.getTime() - dueAtMs) / (60 * 60 * 1000));
  const basePriority = Math.max(0, Math.min(100, Number(rule?.queue_priority || 50)));

  let deadlinePriority = 300;
  if (hoursUntilPublish <= 0) deadlinePriority = 1200;
  else if (hoursUntilPublish <= 2) deadlinePriority = 1100;
  else if (hoursUntilPublish <= 6) deadlinePriority = 1000;
  else if (hoursUntilPublish <= 24) deadlinePriority = 850;
  else if (hoursUntilPublish <= 48) deadlinePriority = 650;
  else if (hoursUntilPublish <= 72) deadlinePriority = 500;

  return deadlinePriority + basePriority * 2 + Math.min(200, overdueHours * 8);
}

function selectFairQueuedRules(rules, limit) {
  const selected = [];
  const selectedIds = new Set();
  const perUser = new Map();

  for (const maxPerUser of [1, 2, Number.POSITIVE_INFINITY]) {
    for (const rule of rules) {
      if (selected.length >= limit) return selected;
      if (selectedIds.has(rule.id)) continue;

      const userId = String(rule.user_id || "unknown");
      const currentCount = perUser.get(userId) || 0;
      if (currentCount >= maxPerUser) continue;

      selected.push(rule);
      selectedIds.add(rule.id);
      perUser.set(userId, currentCount + 1);
    }
  }

  return selected;
}

function getNextWeeklyRunAtIsoAfterScheduled(rule, scheduledPublishAtIso) {
  const scheduled = new Date(scheduledPublishAtIso);
  if (!Number.isFinite(scheduled.getTime())) {
    return getNextWeeklyRunAtIso(rule, new Date());
  }

  const timeZone = getRuleTimeZone(rule);
  const localParts = getDatePartsInTimeZone(scheduled, timeZone);
  const publishTime = normalizeTime(rule.publish_time);
  const [hourValue, minuteValue] = publishTime.split(":");

  return zonedLocalToUtcDate({
    year: localParts.year,
    month: localParts.month,
    day: localParts.day + 7,
    hour: Number(hourValue) || 0,
    minute: Number(minuteValue) || 0,
    second: 0,
    timeZone,
  }).toISOString();
}

async function claimAutomationRuleForProcessing({ supabase, rule, now }) {
  const lockUntilIso = addMinutesIso(now, CRON_RULE_PROCESSING_LOCK_MINUTES);
  const claimStartedIso = new Date().toISOString();
  let query = supabase
    .from("automation_rules")
    .update({
      queue_locked_until: lockUntilIso,
      queue_attempts: Number(rule.queue_attempts || 0) + 1,
      last_queue_started_at: claimStartedIso,
      last_error: null,
      updated_at: claimStartedIso,
    })
    .eq("id", rule.id)
    .eq("is_active", true)
    .or(`queue_locked_until.is.null,queue_locked_until.lte.${claimStartedIso}`);

  if (rule.next_run_at) {
    query = query.eq("next_run_at", rule.next_run_at);
  } else {
    query = query.is("next_run_at", null);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not lock automation rule for processing");
  }

  return Boolean(data?.id);
}

async function findAutomationDraftsForRule({ supabase, ruleId }) {
  if (!ruleId) {
    return [];
  }

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, user_id, status, created_at, updated_at, content_format, image_storage_path, video_storage_path, video_status, video_render_id, slide_count, slide_generation_status, slide_render_status"
    )
    .eq("automation_rule_id", ruleId)
    .in("status", ["pending_approval", "generating"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message || "Could not check automation drafts");
  }

  return Array.isArray(data) ? data : [];
}

function getAutomationDraftActivityTime(post) {
  const updatedAt = new Date(post?.updated_at || 0).getTime();
  const createdAt = new Date(post?.created_at || 0).getTime();

  return Math.max(
    Number.isFinite(updatedAt) ? updatedAt : 0,
    Number.isFinite(createdAt) ? createdAt : 0
  );
}

function isRecentAutomationDraft(post, now, hours = RECENT_AUTOMATION_DRAFT_BLOCK_HOURS) {
  const activityTime = getAutomationDraftActivityTime(post);
  const nowTime = new Date(now).getTime();

  if (!activityTime || !Number.isFinite(nowTime)) {
    return false;
  }

  return nowTime - activityTime < hours * 60 * 60 * 1000;
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

  if (post?.status === "generating") {
    return !isCompleteAutomationDraft(post);
  }

  const slideCount = Number(post?.slide_count || 0);
  const generationStatus = String(post?.slide_generation_status || "").toLowerCase();

  return slideCount < 1 || generationStatus === "none" || generationStatus === "failed";
}

function isIncompleteAnimatedVideoDraftPost(post) {
  if (normalizeContentFormat(post?.content_format) !== "animated_video") {
    return false;
  }

  return (
    post?.status === "generating" ||
    !post?.video_storage_path ||
    String(post?.video_status || "").toLowerCase() !== "ready"
  );
}

function isStaleIncompleteAnimatedVideoDraft(post, now) {
  if (!isIncompleteAnimatedVideoDraftPost(post)) {
    return false;
  }

  const activityTime = getAutomationDraftActivityTime(post);
  const nowTime = new Date(now).getTime();

  if (!activityTime || !Number.isFinite(nowTime)) {
    return true;
  }

  return (
    nowTime - activityTime >=
    INCOMPLETE_ANIMATED_VIDEO_GRACE_MINUTES * 60 * 1000
  );
}

async function deleteIncompleteAnimatedVideoDrafts({ supabase, posts }) {
  const drafts = (posts || []).filter(isIncompleteAnimatedVideoDraftPost);
  const postIds = drafts.map((post) => post.id).filter(Boolean);

  if (!postIds.length) {
    return 0;
  }

  const imagePaths = drafts.flatMap((post) => {
    const userId = post.user_id;

    if (!userId || !post.id) return [];

    return [
      post.image_storage_path,
      `${userId}/${post.id}-animation-product-layer.png`,
      `${userId}/${post.id}-animation-text-overlay.png`,
      `${userId}/${post.id}-animation-logo-overlay.png`,
      `${userId}/${post.id}-animation-poster.png`,
    ].filter(Boolean);
  });
  const videoPaths = drafts
    .flatMap((post) => {
      if (post.video_storage_path) return [post.video_storage_path];
      if (post.user_id && post.id) return [`${post.user_id}/${post.id}.mp4`];
      return [];
    })
    .filter(Boolean);

  await Promise.allSettled([
    imagePaths.length
      ? supabase.storage.from("post-images").remove([...new Set(imagePaths)])
      : Promise.resolve(),
    videoPaths.length
      ? supabase.storage.from(POST_VIDEOS_BUCKET).remove([...new Set(videoPaths)])
      : Promise.resolve(),
  ]);

  const { error } = await supabase.from("posts").delete().in("id", postIds);

  if (error) {
    throw new Error(error.message || "Could not delete incomplete animated video drafts");
  }

  return postIds.length;
}

function isStaleIncompleteCarouselDraft(post, now) {
  if (!isIncompleteCarouselDraftPost(post)) {
    return false;
  }

  const activityTime = getAutomationDraftActivityTime(post);
  const nowTime = new Date(now).getTime();

  if (!activityTime || !Number.isFinite(nowTime)) {
    return true;
  }

  return (
    nowTime - activityTime >=
    INCOMPLETE_CAROUSEL_DRAFT_GRACE_MINUTES * 60 * 1000
  );
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

async function getStaleCarouselRecoveryState({
  supabase,
  ruleId,
  currentRunLogId = null,
  now = new Date(),
}) {
  if (!ruleId) {
    return {
      recoveryCount: 0,
      historyAvailable: false,
      latestRecoveryAt: null,
    };
  }

  const windowStartIso = subtractHoursIso(
    now,
    STALE_CAROUSEL_RECOVERY_WINDOW_HOURS
  );

  try {
    let query = supabase
      .from("automation_run_logs")
      .select("id, status, started_at, finished_at, metadata")
      .eq("rule_id", ruleId)
      .gte("started_at", windowStartIso)
      .order("started_at", { ascending: false })
      .limit(50);

    if (currentRunLogId) {
      query = query.neq("id", currentRunLogId);
    }

    const { data, error } = await query;

    if (error) {
      if (!isMissingAutomationRunLogsTableError(error)) {
        console.warn("Could not inspect stale carousel recovery history", {
          ruleId,
          message: error.message,
        });
      }

      return {
        recoveryCount: 0,
        historyAvailable: false,
        latestRecoveryAt: null,
      };
    }

    let recoveryCount = 0;
    let latestRecoveryAt = null;

    for (const run of Array.isArray(data) ? data : []) {
      const status = String(run?.status || "").toLowerCase();

      if (status === "success") {
        break;
      }

      const metadata =
        run?.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata)
          ? run.metadata
          : {};

      if (
        status === "failed" &&
        metadata.stage === "stale_incomplete_carousel_recovery" &&
        metadata.auto_recovered === true
      ) {
        recoveryCount += 1;

        if (!latestRecoveryAt) {
          latestRecoveryAt = run.finished_at || run.started_at || null;
        }
      }
    }

    return {
      recoveryCount,
      historyAvailable: true,
      latestRecoveryAt,
    };
  } catch (error) {
    if (!isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not inspect stale carousel recovery history", {
        ruleId,
        message: error.message,
      });
    }

    return {
      recoveryCount: 0,
      historyAvailable: false,
      latestRecoveryAt: null,
    };
  }
}

async function markAbandonedAutomationRunsRecovered({
  supabase,
  ruleId,
  staleBeforeIso,
  deletedDraftCount,
  recoveryAttempt,
  automaticRetryScheduled,
}) {
  if (!ruleId || !staleBeforeIso) {
    return 0;
  }

  try {
    const { data, error } = await supabase
      .from("automation_run_logs")
      .select("id, started_at, metadata")
      .eq("rule_id", ruleId)
      .eq("status", "running")
      .lte("started_at", staleBeforeIso)
      .order("started_at", { ascending: false })
      .limit(10);

    if (error) {
      if (!isMissingAutomationRunLogsTableError(error)) {
        console.warn("Could not find abandoned automation run logs", {
          ruleId,
          message: error.message,
        });
      }
      return 0;
    }

    const abandonedRuns = Array.isArray(data) ? data : [];
    const finishedAtIso = new Date().toISOString();

    for (const run of abandonedRuns) {
      const startedAtMs = new Date(run?.started_at || 0).getTime();
      const finishedAtMs = new Date(finishedAtIso).getTime();
      const durationMs =
        Number.isFinite(startedAtMs) && startedAtMs > 0
          ? Math.max(0, finishedAtMs - startedAtMs)
          : null;
      const existingMetadata =
        run?.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata)
          ? run.metadata
          : {};

      const { error: updateError } = await supabase
        .from("automation_run_logs")
        .update({
          status: "failed",
          finished_at: finishedAtIso,
          duration_ms: durationMs,
          error_message: automaticRetryScheduled
            ? `Recovered automatically after an abandoned incomplete carousel draft was detected. Automatic retry ${recoveryAttempt} of ${MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES} was started.`
            : `An abandoned incomplete carousel draft was detected again. Automatic retry limit reached after ${MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES} retries, so the automation was paused.`,
          metadata: {
            ...existingMetadata,
            stage: "stale_incomplete_carousel_recovery",
            auto_recovered: true,
            automatic_retry_scheduled: Boolean(automaticRetryScheduled),
            recovery_attempt: recoveryAttempt,
            recovery_limit: MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES,
            recovery_window_hours: STALE_CAROUSEL_RECOVERY_WINDOW_HOURS,
            deleted_incomplete_drafts: deletedDraftCount,
          },
          updated_at: finishedAtIso,
        })
        .eq("id", run.id)
        .eq("status", "running");

      if (updateError && !isMissingAutomationRunLogsTableError(updateError)) {
        console.warn("Could not mark abandoned automation run log as recovered", {
          ruleId,
          runLogId: run.id,
          message: updateError.message,
        });
      }
    }

    return abandonedRuns.length;
  } catch (error) {
    if (!isMissingAutomationRunLogsTableError(error)) {
      console.warn("Could not recover abandoned automation run logs", {
        ruleId,
        message: error.message,
      });
    }
    return 0;
  }
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

function getRuleContentSourceScope(rule) {
  const scope = String(rule?.content_source_scope || "whole_website").trim();
  return ["whole_website", "focus_page", "exact_product", "product_category"].includes(scope)
    ? scope
    : "whole_website";
}

function getRuleContentSourceUrl(rule) {
  return normalizeWebsiteUrl(rule?.content_source_url || "");
}

function isProductContentTypeRule(rule) {
  return [
    "website_item",
    "website_item_text_ad",
    "animated_website_item",
    "carousel_website_item",
  ].includes(String(rule?.content_type_id || "").trim());
}

function getWebsiteProductSourceUrl(brandProfile, rule = null) {
  const focusedUrl = getRuleContentSourceUrl(rule);
  if (focusedUrl) return focusedUrl;

  return normalizeWebsiteUrl(
    brandProfile?.website_product_source_url || brandProfile?.website_url
  );
}

function formatFocusedPageContextForPrompt(rule) {
  const context = rule?.focused_page_context;
  if (!context?.url) return "";

  return `
Focused website page selected by the customer:
Page type: ${context.sourceScope || getRuleContentSourceScope(rule)}
Page title: ${context.title || rule?.content_source_title || "Not provided"}
Page URL: ${context.url}
Verified summary: ${context.summary || rule?.content_source_summary || "Not provided"}
Current page content:
${truncateText(context.text || "", 9000)}

Mandatory focus rules:
- Base this post on this selected page and the information above.
- Do not switch to an unrelated part of the website.
- Do not invent facts that are not supported by this page or the Brand profile.
- If the selected page is a service, event, auction, article or information section, keep the post focused on that subject and do not turn it into a webshop product post.
`.trim();
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

function formatWebsiteItemForPrompt(websiteItem, { includePrice = true } = {}) {
  if (!websiteItem) {
    return "No specific website item was selected.";
  }

  const verifiedPrice = includePrice ? getTrustedWebsiteItemPrice(websiteItem) : "";

  return `
Selected website item:
Title: ${websiteItem.title || "Not provided"}
Type: ${websiteItem.type || "Not provided"}
URL: ${websiteItem.url || "Not provided"}
Description: ${websiteItem.description || "Not provided"}
Verified price: ${includePrice ? verifiedPrice || "Not provided" : "Intentionally omitted for this format"}
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
- Do not call the item an offer, deal, sale, discount, bargain, fynd, erbjudande, rabatt, rea or kampanjpris unless the selected item information says so or the automation instruction contains an exact authorized customer-supplied campaign offer. In that case, use only the authorized campaign values as written.
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
  return Boolean(
    item?.title &&
    item?.url &&
    item?.image_url &&
    !isBadProductUrl(item.url) &&
    !isBadProductImageUrl(item.image_url) &&
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
  existingItem.discovery_score = Math.max(
    Number(existingItem.discovery_score || 0),
    Number(incomingItem.discovery_score || incomingItem.score || 0)
  );

  const existingAiScore = Number(existingItem.ai_campaign_fit_score);
  const incomingAiScore = Number(incomingItem.ai_campaign_fit_score);
  if (
    Number.isFinite(incomingAiScore) &&
    (!Number.isFinite(existingAiScore) || incomingItem.campaign_fit_verdict)
  ) {
    existingItem.ai_campaign_fit_score = incomingAiScore;
    existingItem.campaign_fit_verdict = incomingItem.campaign_fit_verdict || null;
    existingItem.campaign_fit_reason = incomingItem.campaign_fit_reason || null;
  }

  if (String(incomingItem.description || "").length > String(existingItem.description || "").length) {
    existingItem.description = incomingItem.description;
  }

  existingItem.product_page_verified = Boolean(
    existingItem.product_page_verified || incomingItem.product_page_verified
  );
  existingItem.product_schema_verified = Boolean(
    existingItem.product_schema_verified || incomingItem.product_schema_verified
  );
  existingItem.ecommerce_proof_found = Boolean(
    existingItem.ecommerce_proof_found || incomingItem.ecommerce_proof_found
  );
  existingItem.product_confidence = Math.max(
    Number(existingItem.product_confidence || 0),
    Number(incomingItem.product_confidence || 0)
  );

  if (!existingItem.source_page_url && incomingItem.source_page_url) {
    existingItem.source_page_url = incomingItem.source_page_url;
  }
  if (!existingItem.source_search_url && incomingItem.source_search_url) {
    existingItem.source_search_url = incomingItem.source_search_url;
  }

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
  const candidateItems = isCampaignRule
    ? getSafeCampaignProductCandidates(dedupedItems, rule)
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
      const signalState = getCampaignProductSignalState(
        item,
        rule,
        CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE
      );
      const aiCampaignFitScore = signalState.aiCampaignFitScore;
      const directSignalCount = signalState.hasDirectCampaignSignal ? 1 : 0;

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
          aiCampaignFitScore,
          hasMeaningfulCampaignSignal: signalState.hasMeaningfulCampaignSignal,
          selectionPriority: Number(item.selection_priority || 0),
        },
      };
    })
    .filter((item) => {
      const sort = item?._freshRelevantSort || {};

      return Boolean(sort.hasMeaningfulCampaignSignal) &&
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
  const keepMeaningfulProducts = (group) =>
    (group || []).filter((item) =>
      getCampaignProductSignalState(
        item,
        rule,
        CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
      ).hasMeaningfulCampaignSignal
    );

  return [
    getSafeCampaignProductCandidates(dedupedItems, rule),
    keepMeaningfulProducts(getStrongCampaignFitItems(dedupedItems, rule)),
    keepMeaningfulProducts(
      getCampaignFitItemsAtOrAboveScore(
        dedupedItems,
        rule,
        CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
      )
    ),
    keepMeaningfulProducts(getSupportingCampaignFitItems(dedupedItems, rule)),
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
      const signalState = getCampaignProductSignalState(
        item,
        rule,
        Math.max(minimumScore, CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE)
      );
      const aiCampaignFitScore = signalState.aiCampaignFitScore;
      const hasDirectCampaignSignal = signalState.hasDirectCampaignSignal;
      const hasAiCampaignApproval = signalState.hasAiCampaignApproval;
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
        campaign_has_meaningful_signal: hasDirectCampaignSignal || hasAiCampaignApproval,
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
      const signalState = getCampaignProductSignalState(
        item,
        rule,
        CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE
      );
      const aiCampaignFitScore = signalState.aiCampaignFitScore;
      const hasDirectCampaignSignal = signalState.hasDirectCampaignSignal;
      const hasAiCampaignApproval = signalState.hasAiCampaignApproval;
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
          hasMeaningfulCampaignSignal: hasDirectCampaignSignal || hasAiCampaignApproval,
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
  const validProducts = (products || []).filter(isValidCarouselProduct);

  if (!isCampaignScopedWebsiteRule(rule)) {
    return validProducts.length >= CAROUSEL_MIN_PRODUCT_SLIDES;
  }

  const relevantProducts = validProducts.filter((item) => {
    const signalState = getCampaignProductSignalState(
      item,
      rule,
      CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
    );

    return signalState.hasMeaningfulCampaignSignal &&
      scoreCampaignFitForRule(item, rule) >= CAMPAIGN_NEAR_PRODUCT_FIT_SCORE;
  });

  return relevantProducts.length >= CAROUSEL_MIN_PRODUCT_SLIDES;
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

      return {
        ...item,
        campaign_fit_score: Math.max(Number(item.campaign_fit_score || 0), campaignFit),
        campaign_fit_source: item.campaign_fit_source || "final_broad_verified_fallback",
        product_confidence: Math.max(Number(item.product_confidence || 0), confidence),
        _finalBroadSort: {
          confidence,
          campaignFit,
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

      if (isCampaignRule) {
        const signalState = getCampaignProductSignalState(
          item,
          rule,
          CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
        );

        if (
          Number(sort.campaignFit || 0) < CAMPAIGN_NEAR_PRODUCT_FIT_SCORE ||
          !signalState.hasMeaningfulCampaignSignal
        ) {
          return false;
        }
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


function buildGuaranteedCampaignDeliveryBackupRule(rule, selectedProducts = []) {
  const selectedTitles = (selectedProducts || [])
    .map((item) => String(item?.title || "").trim())
    .filter(Boolean)
    .slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
  const missingCount = Math.max(
    CAROUSEL_PRODUCT_SLIDE_TARGET - selectedTitles.length,
    1
  );
  const backupInstruction = `
Guaranteed campaign product delivery backup:
- The normal campaign product search has already completed and found only ${selectedTitles.length} usable product(s).
- Find at least ${missingCount} additional real products from the customer's own website so the ordered campaign carousel can be delivered with ${CAROUSEL_PRODUCT_SLIDE_TARGET} products.
- Do not rely on or repeat the previously assigned product_search_queries or product_match_terms. Interpret the campaign, recipient, buyer intent, occasion, use case and the business assortment independently.
- Search broader than the original terms while still choosing the products that can most credibly be presented for this campaign.
- Prefer direct campaign matches first, then strong recipient/use-case/gift/seasonal matches, then the best business-specific products that can honestly be angled toward the campaign.
- Do not choose random products merely to fill a slot when better campaign-relevant products exist.
- Return concrete product detail pages from the customer's domain with usable product images.
- Reuse a previously used product only when necessary to complete delivery.
${selectedTitles.length ? `- Products already selected for this carousel: ${selectedTitles.join(", ")}. Find different products.` : ""}
  `.trim();

  return {
    ...rule,
    // The rescue search must reason from the campaign and business itself,
    // rather than being constrained by the first-pass query list.
    product_search_queries: null,
    product_match_terms: null,
    product_search_intent: null,
    prompt: [String(rule?.prompt || "").trim(), backupInstruction]
      .filter(Boolean)
      .join("\n\n"),
    strategy_notes: [String(rule?.strategy_notes || "").trim(), backupInstruction]
      .filter(Boolean)
      .join("\n\n"),
    campaign_delivery_backup: true,
  };
}

function selectGuaranteedCampaignDeliveryProducts({
  existingProducts = [],
  candidateItems = [],
  rule,
  sourceUrl,
  recentUsedItems = [],
  usedWebsiteImageUrlsThisRun = new Set(),
  limit = CAROUSEL_PRODUCT_SLIDE_TARGET,
}) {
  const selected = dedupeWebsiteItemsByUrlTitleAndImage(existingProducts)
    .filter(isValidCarouselProduct)
    .slice(0, limit);

  const candidates = dedupeWebsiteItemsByUrlTitleAndImage(candidateItems)
    .filter(isValidCarouselProduct)
    .filter((item) => !isExplicitCampaignFitRejected(item))
    .filter(
      (item) =>
        !selected.some((selectedItem) =>
          areSameWebsiteItem(selectedItem, item, sourceUrl)
        )
    )
    .map((item) => {
      const aiScore = getAiCampaignFitScore(item);
      const hasAiCampaignFitScore = aiScore !== null;
      const campaignFitScore =
        hasAiCampaignFitScore
          ? aiScore
          : Math.max(
              Number(item?.campaign_fit_score || 0),
              Number(scoreCampaignFitForRule(item, rule) || 0)
            );
      const productConfidence = getCarouselProductConfidence(item);
      const { wasUsedRecently, imageUsedThisRun } = getCampaignCandidateUsageState(
        item,
        recentUsedItems,
        sourceUrl,
        usedWebsiteImageUrlsThisRun
      );

      return {
        ...item,
        campaign_fit_score: campaignFitScore,
        campaign_fit_source:
          item?.campaign_fit_source || "ai_campaign_delivery_backup",
        automation_search_method:
          item?.automation_search_method || "ai_campaign_delivery_backup",
        campaign_was_used_recently: wasUsedRecently,
        campaign_image_used_this_run: imageUsedThisRun,
        campaign_rotation_state:
          wasUsedRecently || imageUsedThisRun ? "reused" : "fresh",
        _guaranteedDeliverySort: {
          hasAiCampaignFitScore,
          campaignFitScore,
          productConfidence,
          wasUsedRecently,
          imageUsedThisRun,
          selectionPriority: Number(item?.selection_priority || 0),
          usageCount: Number(item?.times_used || 0),
          lastUsedAtTs: item?.last_used_at
            ? Date.parse(item.last_used_at)
            : 0,
        },
      };
    })
    .sort((a, b) => {
      const aSort = a?._guaranteedDeliverySort || {};
      const bSort = b?._guaranteedDeliverySort || {};

      // Prefer products that were individually evaluated by AI in the
      // rescue pass. Unscored catalog products remain available only as the
      // final delivery fallback.
      if (
        Boolean(aSort.hasAiCampaignFitScore) !==
        Boolean(bSort.hasAiCampaignFitScore)
      ) {
        return aSort.hasAiCampaignFitScore ? -1 : 1;
      }

      // In the delivery backup, campaign usefulness remains the first
      // priority. Freshness is used as a tie-breaker rather than blocking
      // delivery when suitable products have been used before.
      const fitDelta =
        Number(bSort.campaignFitScore || 0) -
        Number(aSort.campaignFitScore || 0);
      if (fitDelta !== 0) return fitDelta;

      const confidenceDelta =
        Number(bSort.productConfidence || 0) -
        Number(aSort.productConfidence || 0);
      if (confidenceDelta !== 0) return confidenceDelta;

      const aUsed = Boolean(aSort.wasUsedRecently || aSort.imageUsedThisRun);
      const bUsed = Boolean(bSort.wasUsedRecently || bSort.imageUsedThisRun);
      if (aUsed !== bUsed) return aUsed ? 1 : -1;

      const priorityDelta =
        Number(bSort.selectionPriority || 0) -
        Number(aSort.selectionPriority || 0);
      if (priorityDelta !== 0) return priorityDelta;

      const usageDelta =
        Number(aSort.usageCount || 0) - Number(bSort.usageCount || 0);
      if (usageDelta !== 0) return usageDelta;

      const lastUsedDelta =
        Number(aSort.lastUsedAtTs || 0) -
        Number(bSort.lastUsedAtTs || 0);
      if (lastUsedDelta !== 0) return lastUsedDelta;

      return String(a?.title || "").localeCompare(String(b?.title || ""));
    });

  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    selected.push(candidate);
  }

  return selected
    .slice(0, limit)
    .map(({ _guaranteedDeliverySort, ...item }) => item);
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

  const websiteUrl = getWebsiteProductSourceUrl(brandProfile, rule);
  const contentType = rule.content_type_id || "carousel_website_item";
  const contentSourceScope = getRuleContentSourceScope(rule);

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

  if (contentSourceScope === "exact_product") {
    throw new Error(
      "A website carousel needs a product category or collection URL. Choose another content type for one exact product."
    );
  }

  if (contentSourceScope === "product_category" || contentSourceScope === "focus_page") {
    const focusedCategoryItems = await discoverProductsFromFocusedCategory({
      categoryUrl: websiteUrl,
      rule,
      limit: Math.max(CAROUSEL_PRODUCT_SLIDE_TARGET * 2, 12),
    });
    const validFocusedItems = focusedCategoryItems.filter(isValidCarouselProduct);
    let selectedFocusedItems = selectCarouselProductsFromPool({
      items: validFocusedItems,
      rule,
      sourceUrl: websiteUrl,
      recentUsedItems,
      usedWebsiteImageUrlsThisRun,
      allowReuseWhenExhausted: false,
    });

    if (selectedFocusedItems.length < CAROUSEL_MIN_PRODUCT_SLIDES) {
      selectedFocusedItems = selectCarouselProductsFromPool({
        items: validFocusedItems,
        rule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        allowReuseWhenExhausted: true,
      });
    }

    if (selectedFocusedItems.length < CAROUSEL_MIN_PRODUCT_SLIDES) {
      throw new Error(
        `The selected category did not provide at least ${CAROUSEL_MIN_PRODUCT_SLIDES} verified products with usable images.`
      );
    }

    selectedFocusedItems = selectedFocusedItems.slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);
    await upsertWebsiteProductCatalogItems({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      items: selectedFocusedItems,
      discoverySource: "customer_selected_category",
    });

    summary.website_items_found += selectedFocusedItems.length;
    summary.website_content_success += 1;

    return {
      websiteItems: selectedFocusedItems,
      websiteItem: selectedFocusedItems[0],
      websiteSourceUrl: websiteUrl,
      websiteCycleNumber: 1,
      useWebsiteImage: true,
      websiteRule: rule,
    };
  }

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

      let storeSearchItems = await verifyDiscoveredWebsiteProductCandidates({
        candidates: storeSearchCandidates,
        websiteUrl,
        limit: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
      });

      if (storeSearchItems.length) {
        storeSearchItems = await applyAiCampaignFitScores({
          openai,
          rule,
          brandProfile,
          items: storeSearchItems,
          maxItems: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
          model: PRODUCT_RESEARCH_FAST_MODEL,
          escalateWhenUncertain: true,
          escalationModel: PRODUCT_RESEARCH_MODEL,
          escalationMaxItems: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
          minimumStrongProducts: CAROUSEL_PRODUCT_SLIDE_TARGET,
        });
      }

      const storeSearchPoolItems = buildCampaignSearchPoolItems({
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
        let storeSearchItems = await verifyDiscoveredWebsiteProductCandidates({
          candidates: storeSearchCandidates,
          websiteUrl,
          limit: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
        });

        if (isCampaignRule && storeSearchItems.length) {
          storeSearchItems = await applyAiCampaignFitScores({
            openai,
            rule,
            brandProfile,
            items: storeSearchItems,
            maxItems: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
            model: PRODUCT_RESEARCH_FAST_MODEL,
            escalateWhenUncertain: true,
            escalationModel: PRODUCT_RESEARCH_MODEL,
            escalationMaxItems: WEBSITE_STORE_SEARCH_VERIFY_LIMIT,
            minimumStrongProducts: CAROUSEL_PRODUCT_SLIDE_TARGET,
          });
        }

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
        usedItems: recentUsedItems,
        fastCampaignContinuation: isCampaignRule && hasLockedCampaignSearchPool,
      });

      if (discoveredCandidates.length) {
        let discoveredItems = await verifyDiscoveredWebsiteProductCandidates({
          candidates: discoveredCandidates,
          websiteUrl,
          limit: CAROUSEL_DISCOVERY_VERIFY_LIMIT,
        });

        if (isCampaignRule && discoveredItems.length) {
          discoveredItems = (await applyAiCampaignFitScores({
            openai,
            rule,
            brandProfile,
            items: discoveredItems,
            maxItems: CAROUSEL_DISCOVERY_VERIFY_LIMIT,
            model: PRODUCT_RESEARCH_FAST_MODEL,
            escalateWhenUncertain: true,
            escalationModel: PRODUCT_RESEARCH_MODEL,
            escalationMaxItems: CAROUSEL_DISCOVERY_VERIFY_LIMIT,
            minimumStrongProducts: CAROUSEL_PRODUCT_SLIDE_TARGET,
          })).filter((item) => getAiCampaignFitScore(item) !== null);
        }

        const enrichedDiscoveredItems = discoveredItems.map((item) => ({
          ...item,
          selection_priority: 90,
          campaign_fit_source: item.campaign_fit_source || "campaign_discovery",
          campaign_fit_score: scoreCampaignFitForRule(item, rule),
        }));

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

  if (!hasLockedCampaignSearchPool && !hasEnoughCarouselProductsForRule(selectedProducts, rule)) {
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
    selectedProducts = selectedProducts.filter(
      (item) => !isExplicitCampaignFitRejected(item)
    );
  }

  // Delivery guarantee backup for campaign carousels.
  // Everything above remains the unchanged relevance-first flow. This block
  // runs only when that complete flow still has fewer than five products.
  if (isCampaignRule && selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
    const selectedBeforeBackup = selectedProducts.length;
    const backupRule = buildGuaranteedCampaignDeliveryBackupRule(
      rule,
      selectedProducts
    );
    const selectedAsUsedItems = selectedProducts.map((item) => ({
      item_title: item?.title,
      item_url: item?.url,
      image_url: item?.image_url,
    }));

    console.warn("Campaign carousel starting guaranteed delivery backup", {
      ruleId: rule.id,
      brandProfileId: rule.brand_profile_id,
      websiteUrl,
      selectedBeforeBackup,
      missingCount:
        CAROUSEL_PRODUCT_SLIDE_TARGET - selectedBeforeBackup,
    });

    try {
      const backupWebItems = await findWebsiteProductWithWebSearch({
        openai,
        brandProfile,
        rule: backupRule,
        websiteUrl,
        usedWebsiteItems: [
          ...recentUsedItems,
          ...selectedAsUsedItems,
        ],
        fitModel: PRODUCT_RESEARCH_MODEL,
        fitMinimumStrongProducts: 1,
      });

      let backupCandidateItems = dedupeWebsiteItemsByUrlTitleAndImage([
        ...(Array.isArray(backupWebItems) ? backupWebItems : []).map((item) => ({
          ...item,
          selection_priority: Math.max(
            Number(item?.selection_priority || 0),
            300
          ),
          campaign_fit_source: "ai_campaign_delivery_backup",
          automation_search_method: "ai_campaign_delivery_backup",
        })),
        ...lockedCampaignSearchPoolItems.map((item) => ({
          ...item,
          selection_priority: Math.max(
            Number(item?.selection_priority || 0),
            220
          ),
        })),
        ...catalogItems.map((item) => ({
          ...item,
          selection_priority:
            Number(item?.selection_priority || 0) || 50,
        })),
      ]).filter(isValidCarouselProduct);

      // If domain web research still did not expose enough concrete products,
      // make one independent full-site discovery pass using the rescue brief.
      const uniqueBackupProductCount = dedupeWebsiteItemsByUrlTitleAndImage([
        ...selectedProducts,
        ...backupCandidateItems,
      ]).filter(isValidCarouselProduct).length;

      if (uniqueBackupProductCount < CAROUSEL_PRODUCT_SLIDE_TARGET) {
        try {
          const rescueDiscoveryCandidates = await discoverProductCandidatesFromWebsite({
            websiteUrl,
            campaignPrompt: buildCampaignResearchText(backupRule),
            usedItems: [
              ...recentUsedItems,
              ...selectedAsUsedItems,
            ],
            fastCampaignContinuation: false,
          });

          if (rescueDiscoveryCandidates.length) {
            const rescueDiscoveredItems = await verifyDiscoveredWebsiteProductCandidates({
              candidates: rescueDiscoveryCandidates,
              websiteUrl,
              limit: CAROUSEL_DISCOVERY_VERIFY_LIMIT,
            });

            backupCandidateItems = dedupeWebsiteItemsByUrlTitleAndImage([
              ...backupCandidateItems,
              ...rescueDiscoveredItems.map((item) => ({
                ...item,
                selection_priority: Math.max(
                  Number(item?.selection_priority || 0),
                  260
                ),
                campaign_fit_source: "campaign_delivery_backup_discovery",
                automation_search_method: "campaign_delivery_backup_discovery",
              })),
            ]).filter(isValidCarouselProduct);
          }
        } catch (backupDiscoveryError) {
          console.error("Campaign delivery backup site discovery failed", {
            ruleId: rule.id,
            brandProfileId: rule.brand_profile_id,
            websiteUrl,
            message: backupDiscoveryError.message,
          });
        }
      }

      if (backupCandidateItems.length) {
        backupCandidateItems = await applyAiCampaignFitScores({
          openai,
          rule: backupRule,
          brandProfile,
          items: backupCandidateItems,
          maxItems: 20,
          model: PRODUCT_RESEARCH_MODEL,
          minimumStrongProducts: 1,
        });
      }

      selectedProducts = selectGuaranteedCampaignDeliveryProducts({
        existingProducts: selectedProducts,
        candidateItems: backupCandidateItems,
        rule: backupRule,
        sourceUrl: websiteUrl,
        recentUsedItems,
        usedWebsiteImageUrlsThisRun,
        limit: CAROUSEL_PRODUCT_SLIDE_TARGET,
      });

      if (selectedProducts.length > selectedBeforeBackup) {
        summary.website_web_search_success += 1;
      }

      console.log("Campaign carousel guaranteed delivery backup finished", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        selectedBeforeBackup,
        backupCandidateCount: backupCandidateItems.length,
        selectedAfterBackup: selectedProducts.length,
        addedCount: selectedProducts.length - selectedBeforeBackup,
        delivered: selectedProducts.length >= CAROUSEL_PRODUCT_SLIDE_TARGET,
      });
    } catch (backupError) {
      console.error("Campaign carousel guaranteed delivery backup failed", {
        ruleId: rule.id,
        brandProfileId: rule.brand_profile_id,
        websiteUrl,
        selectedBeforeBackup,
        message: backupError.message,
      });
    }
  }

  selectedProducts = dedupeWebsiteItemsByUrlTitleAndImage(selectedProducts)
    .filter(isValidCarouselProduct)
    .slice(0, CAROUSEL_PRODUCT_SLIDE_TARGET);

  if (selectedProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET) {
    throw new Error(`Carousel needs ${CAROUSEL_PRODUCT_SLIDE_TARGET} verified products with product images after one full search. Found ${selectedProducts.length}. Automatic retry disabled for cost protection.`);
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

  await Promise.all(
    selectedProducts.map((product) =>
      markWebsiteProductCatalogItemUsed({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        productUrl: product.url,
        sourceUrl: websiteUrl,
        websiteItem: product,
        usedSource: getWebsiteCatalogUsedSource(rule),
      })
    )
  );

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

function getPostDestinationUrl(rule) {
  const focusedUrl = getRuleContentSourceUrl(rule);

  if (isCarouselRule(rule)) {
    return (
      focusedUrl ||
      getWebsiteProductSourceUrl(rule?.brand_profile, rule) ||
      rule?.brand_profile?.website_url ||
      rule?.website_url ||
      ""
    );
  }

  return (
    rule?.website_item?.url ||
    focusedUrl ||
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

const PRICE_AMOUNT_PATTERN = String.raw`(?:(?:[$€£]\s*)?\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})?\s*(?:(?:${PRICE_CURRENCY_WORDS.join("|")})\b|:-|[$€£])|(?:[$€£]\s*)\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})?)`;
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


function formatVerifiedPriceFromAmount(amount, currency = "") {
  const amountText = decodeHtmlEntities(String(amount || ""))
    .replace(/\s+/g, " ")
    .trim();
  const currencyText = decodeHtmlEntities(String(currency || ""))
    .replace(/\s+/g, " ")
    .trim();

  if (!amountText) {
    return "";
  }

  const alreadyComplete = normalizeVerifiedPriceValue(amountText);
  if (alreadyComplete) {
    return alreadyComplete;
  }

  if (!currencyText) {
    return "";
  }

  return normalizeVerifiedPriceValue(`${amountText} ${currencyText}`);
}

function normalizeExtractedProductPricing({
  currentPrice = "",
  originalPrice = "",
  source = "",
  confidence = "",
} = {}) {
  let current = normalizeVerifiedPriceValue(currentPrice);
  let original = normalizeVerifiedPriceValue(originalPrice);

  if (!current && original) {
    current = original;
    original = "";
  }

  if (current && original) {
    const currentAmount = parseComparablePriceAmount(current);
    const originalAmount = parseComparablePriceAmount(original);

    if (currentAmount !== null && originalAmount !== null) {
      if (currentAmount > originalAmount) {
        const swap = current;
        current = original;
        original = swap;
      } else if (Math.abs(currentAmount - originalAmount) < 0.0001) {
        original = "";
      }
    } else if (current === original) {
      original = "";
    }
  }

  return {
    price: current,
    sale_price: current && original ? current : "",
    original_price: current && original ? original : "",
    price_source: current ? String(source || "").trim() : "",
    price_confidence: current ? String(confidence || "").trim() : "",
  };
}

function extractVerifiedPriceMatches(value) {
  const source = decodeHtmlEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();

  if (!source) {
    return [];
  }

  const regex = new RegExp(PRICE_AMOUNT_PATTERN, "gi");
  const prices = [];
  let match;

  while ((match = regex.exec(source)) !== null) {
    const normalized = normalizeVerifiedPriceValue(match[0]);

    if (normalized && !prices.includes(normalized)) {
      prices.push(normalized);
    }
  }

  return prices;
}

function extractProductPricingFromTitle(value) {
  const title = decodeHtmlEntities(String(value || ""));
  const prices = extractVerifiedPriceMatches(title);

  if (!prices.length) {
    return normalizeExtractedProductPricing();
  }

  const hasExplicitOriginalPriceSignal = /(rrp|uvp|msrp|list price|regular price|original price|was price|ordinarie pris|rek\.\s*pris)/i.test(title);

  return normalizeExtractedProductPricing({
    currentPrice: prices[0],
    originalPrice: hasExplicitOriginalPriceSignal && prices.length > 1 ? prices[1] : "",
    source: "product_search_result_title",
    confidence: "medium",
  });
}

function sanitizeProductTitleForCard(value) {
  let title = decodeHtmlEntities(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    return "";
  }

  // Remove merchandising badges and discount prefixes that are not part of the product name.
  title = title
    .replace(/^\s*-?\s*\d{1,2}%\s+/, "")
    .replace(/^\s*(?:nyhet|new|neu|nouveau|nuevo|novità|sale|rea|kampanj|bestseller)\s*[!:\-–—|]+\s*/i, "")
    .trim();

  // Product search pages often append article numbers, ratings, availability and other UI text.
  // Cut those tails before rendering the public-facing product card.
  const metadataTailPatterns = [
    /\s+(?:art(?:ikel)?\.?\s*(?:nr|no|number)?|artikelnummer|item\s*#|sku|product\s*(?:code|id))\s*[:#.]?\s*[a-z0-9_-]+.*$/i,
    /\s+(?:betyg|rating|rated)\s*[:\-]?\s*\d.*$/i,
    /\s+\d+(?:[.,]\d+)?\s*(?:stjärnor|stars)\s*(?:av|out\s+of)\s*\d+.*$/i,
    /\s+(?:i\s+lager|in\s+stock|out\s+of\s+stock|sold\s+out|slutsåld)\b.*$/i,
  ];

  for (const pattern of metadataTailPatterns) {
    title = title.replace(pattern, "").trim();
  }

  const trailingPricingRegex = new RegExp(
    String.raw`\s*(?:(?:from|ab|från|fra|desde|à\s+partir\s+de)\s+)?(?:${PRICE_AMOUNT_PATTERN})(?:\s+(?:${PRICE_AMOUNT_PATTERN}))?\s*(?:\((?:rrp|uvp|msrp|list price|regular price|original price|ordinarie pris)\))?\s*$`,
    "i"
  );

  for (let index = 0; index < 2; index += 1) {
    const cleaned = title.replace(trailingPricingRegex, "").trim();

    if (!cleaned || cleaned === title) {
      break;
    }

    title = cleaned;
  }

  return title.replace(/[|·•\-–—,:;]+\s*$/g, "").trim();
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

function getPreferredCurrencyRegexForUrl(url) {
  const host = getHostnameFromUrl(url);

  if (/\.se$/i.test(host)) return /\b(?:sek|kr)\b|:-/i;
  if (/\.no$/i.test(host)) return /\b(?:nok|kr)\b|:-/i;
  if (/\.dk$/i.test(host)) return /\b(?:dkk|kr)\b|:-/i;
  if (/\.fi$/i.test(host)) return /€|\b(?:eur|euro)\b/i;
  if (/\.(?:de|fr|nl|be|es|it|pt|at|eu)$/i.test(host)) {
    return /€|\b(?:eur|euro)\b/i;
  }
  if (/\.ch$/i.test(host)) return /\bchf\b/i;
  if (/\.pl$/i.test(host)) return /\bpln\b/i;
  if (/\.cz$/i.test(host)) return /\bczk\b/i;

  return null;
}

function pickPreferredPriceForUrl(prices, url) {
  const uniquePrices = Array.from(
    new Set((prices || []).map((price) => normalizeVerifiedPriceValue(price)).filter(Boolean))
  );

  if (!uniquePrices.length) {
    return "";
  }

  const preferredCurrency = getPreferredCurrencyRegexForUrl(url);
  if (preferredCurrency) {
    const preferred = uniquePrices.find((price) => preferredCurrency.test(price));
    if (preferred) return preferred;
  }

  const nonSuspicious = uniquePrices.find(
    (price) => !isLikelyWrongUsdPriceForUrl(price, url)
  );

  return nonSuspicious || "";
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

function stripDetectedPrices(value) {
  const content = String(value || "");
  const detectedPrices = extractVerifiedPriceMatches(content);
  if (!detectedPrices.length) {
    return content;
  }

  let cleaned = content;
  for (const detectedPrice of detectedPrices) {
    const escapedPrice = escapeRegExp(detectedPrice);
    cleaned = cleaned
      .replace(new RegExp(`\\(\\s*${escapedPrice}\\s*\\)`, "gi"), "")
      .replace(new RegExp(escapedPrice, "gi"), "");
  }

  cleaned = cleaned
    .replace(/\b(?:pris|price)\s*:\s*(?=$|[\s,.;!?])/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([,.;!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

function removePricesFromAnimatedCaption(postContent, rule) {
  const content = String(postContent || "").trim();

  if (!content || !isAnimatedVideoRule(rule)) {
    return content;
  }

  const cleaned = stripDetectedPrices(content);

  if (cleaned !== content) {
    console.info("Price removed from animated Reel caption", {
      ruleId: rule?.id || null,
    });
  }

  return cleaned;
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
    : formatWebsiteItemForPrompt(rule.website_item, {
        includePrice: !isAnimatedVideoRule(rule),
      });
  const campaignStrategyText = formatCampaignStrategyForPrompt(rule);
  const authorizedCampaignOfferText = formatAuthorizedCampaignOfferForPrompt(rule);
  const hasAuthorizedCampaignOffer = Boolean(getAuthorizedCampaignOffer(rule));
  const focusedPageContextText = formatFocusedPageContextForPrompt(rule);
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

${isAnimatedVideoRule(rule)
  ? `Animated Reel price rule:\n- Do not mention a product price anywhere in this caption.\n- ${hasAuthorizedCampaignOffer ? "The exact authorized campaign discount may be mentioned, but it must not be presented as a product price." : "Do not write a currency symbol, currency code, monetary amount, discount price or \"from\" price."}`
  : ""}

${focusedPageContextText}

${campaignStrategyText}

${authorizedCampaignOfferText}

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
- If a Focused website page is provided, keep the entire post anchored to that page and do not switch to another website section.
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
- If the strategy says marketing_angle "offer", create a clear buying reason. Use the exact authorized campaign offer when one is provided; otherwise do not invent discounts.
- If the strategy says marketing_angle "urgency", make timing matter without exaggerating or using fake scarcity.
- Match CTA strength to the strategy: soft means gentle, medium means clear, strong means action-focused.

Website factual grounding rules:
- Always include the Destination URL in the final post when a Destination URL is available.
- If a selected website item is provided, the Destination URL should be the selected item URL, not just the homepage.
- Place the Destination URL exactly once, only in the final CTA sentence near the end of the post, before hashtags if hashtags are used.
- Write that final CTA naturally in the selected language and adapt the wording to the post, product, service and tone. Do not use one fixed CTA phrase for every post.
- Keep URLs clean and professional in the visible caption: show only the website domain, such as example.com, not a long product/category/search URL. The saved internal Destination URL may still be the exact product URL.
- Include the visible website domain exactly once in the entire caption.
- Do not mention the domain earlier in the body and then repeat it in the final CTA.
- Do not repeat the same domain in both a CTA sentence and again after a colon or on a separate line.
- Never write constructions such as "See the product at example.com: example.com". Use either "See the product at example.com" or a single standalone "example.com", not both.
- Do not paste multiple links. Use one URL maximum.
- The Destination URL may be introduced with a safe CTA such as "See the product", "View the product", "See our current selection", "Explore available products", "Visit our website", "Learn more about the business", "Contact us through the website" or similar.
- Do not claim that the website contains information about a specific topic, service, product, guide, offer, article or page unless that exact information was provided in the Brand profile or Selected website item.
- Do not write phrases like "read more about this service on our website", "learn more about this topic on our website", "see more details about this offer on our website", "book this service" or "explore this service" unless the website content clearly supports that exact claim.
- Do not imply that a specific service exists unless the Brand profile or Selected website item clearly says the business offers that service.
- If the post uses a general seasonal, educational or awareness angle that is not directly found on the website, keep the CTA general and safe, but still include the website URL.
- For product-based businesses, use safe CTAs such as "see our current selection", "explore available products", "contact us for guidance" or "get help choosing the right option" when that fits the brand.
- If the selected website item has no verified price or direct purchase proof, do not write as if it is a normal webshop checkout product. Use contact/request-info/request-quote style wording instead of buy-now wording.
- For service businesses, use safe CTAs such as "contact us to discuss your needs", "get in touch to learn what fits your situation" or "visit our website" unless a specific bookable service was provided.
- Never invent services, guides, articles, guarantees, discounts, availability, booking pages or website pages that were not provided. An exact authorized customer-supplied campaign offer counts as provided information.
- A product price is not automatically an offer, sale, discount, deal, bargain, fynd, erbjudande, rabatt, rea or kampanjpris. Use discount language only when the selected item confirms it or an exact authorized customer-supplied campaign offer is provided.
- For Black Friday, Cyber Monday, Black Week or similar shopping days, you may create buying urgency, but you must still not invent a discount, offer or campaign price. An exact authorized customer-supplied campaign offer may be used as written.
- It is okay to use a relevant seasonal or educational angle, but do not present it as something the website specifically explains unless it actually does.

Output rules:
- Return only the final post text.
- Do not explain anything.
- Make it suitable for the selected platform.
- Keep the caption compact: normally 2 to 4 short sentences plus optional hashtags. Avoid repeating the same selling point.
- For carousels, write one short intro and one clear CTA. Do not list every product in the caption if the slides already show them.
- For carousel slide titles, use benefit/occasion/gift-angle wording instead of only copying product names when a campaign theme is provided.
- If the selected platform includes both Facebook and Instagram, write a strong core post that works on both. Avoid platform-specific wording such as "click the link" unless a Destination URL is actually included.
- Never mention a product price unless it was provided as Verified price for the selected website item. An authorized fixed-amount campaign discount is not a product price and may be mentioned exactly as supplied. If you mention a verified product price, write it naturally inside the text, never as a standalone line.
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
  const focusedPageContextText = formatFocusedPageContextForPrompt(rule);

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

${focusedPageContextText}

This image must be adapted to the specific business, industry, post topic and audience.
Do not create a generic stock-photo image unless that clearly fits the business.
Do not invent a different type of company than the one described in the Brand profile.

Platform: ${rule.platform || "Facebook"}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Language context: ${rule.language || "Auto"}
Website URL: ${rule.brand_profile?.website_url || "Not provided"}

${formatCampaignVisualContextForPrompt(rule)}

${formatAuthorizedCampaignOfferForPrompt(rule)}

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
    queue_candidates: 0,
    queue_claimed: 0,
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
  const title = sanitizeProductTitleForCard(
    metadata.product_title || slide?.product_title || slide?.headline || ""
  );
  if (!title || String(metadata.carousel_slide_role || "").toLowerCase().includes("outro")) {
    return "";
  }

  return normalizeSlideText(title, 68);
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
      const metadata = getCarouselEmailSlideMetadata(slide);
      const productTitle = getCarouselEmailProductTitle(slide);
      const pricing = getCarouselEmailProductPricing(slide);
      const slideAlreadyContainsProductInfo = metadata.rendered_slide === true;
      const showFallbackProductInfo = !slideAlreadyContainsProductInfo && Boolean(productTitle || pricing.displayPrice);
      const imageMaxHeight = showFallbackProductInfo ? "128px" : "180px";

      return `
      <div class="carousel-email-card" style="display:inline-block;width:31%;max-width:180px;min-width:150px;vertical-align:top;margin:6px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="padding:0;background:#f8fafc;">
              <img src="${escapeHtml(slide.image_url || '')}" alt="${escapeHtml(productTitle || slide.headline || 'Carousel slide')}" style="display:block;width:100%;height:auto;max-height:${imageMaxHeight};object-fit:contain;background:#f8fafc;" />
            </td>
          </tr>
          ${showFallbackProductInfo ? `
          <tr>
            <td style="padding:8px 8px 10px;text-align:center;background:#ffffff;border-top:1px solid #f1f5f9;">
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


function getApprovalCampaignTitle(rule) {
  return String(
    rule?.campaign_title ||
      rule?.campaign_name ||
      rule?.campaign_opportunity_title ||
      rule?.name ||
      ""
  ).trim();
}

function getApprovalFormatLabel(t, rule) {
  const format = normalizeContentFormat(rule?.content_format);
  const typeId = String(rule?.content_type_id || "").toLowerCase();
  const typeLabel = String(rule?.content_type_label || "").trim();

  if (format === "animated_video") return t("emails.approval.formatAnimatedVideo");
  if (format === "carousel") return t("emails.approval.formatCarousel");
  if (typeId.includes("website") && (typeId.includes("overlay") || typeId.includes("ad"))) {
    return t("emails.approval.formatWebsiteAd");
  }
  if (Boolean(rule?.uses_website_content)) return t("emails.approval.formatWebsiteProduct");
  if (Boolean(rule?.generate_image)) return typeLabel || t("emails.approval.formatImage");
  return typeLabel || t("emails.approval.formatText");
}

function getApprovalChannelsLabel(t, rule) {
  const raw = String(rule?.platform || "").toLowerCase();
  const targets = getPublishTargets(rule?.platform);
  const isReel = normalizeContentFormat(rule?.content_format) === "animated_video";
  const labels = [];

  if (targets.includes("facebook") || raw.includes("facebook")) {
    labels.push(t(isReel ? "emails.approval.channelFacebookReels" : "emails.approval.channelFacebook"));
  }
  if (targets.includes("instagram") || raw.includes("instagram")) {
    labels.push(t(isReel ? "emails.approval.channelInstagramReels" : "emails.approval.channelInstagram"));
  }
  if (raw.includes("tiktok")) labels.push(t("emails.approval.channelTikTok"));
  if (raw.includes("youtube")) labels.push(t("emails.approval.channelYouTubeShorts"));

  return Array.from(new Set(labels)).join(" · ") || String(rule?.platform || "Social media");
}

function formatApprovalDateTime(value, locale, timeZone) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(locale || "en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || DEFAULT_TIME_ZONE,
    }).format(date);
  } catch {
    return date.toISOString().replace("T", " ").slice(0, 16);
  }
}

function buildApprovalPlanContext({ locale, t, rule, nextRule }) {
  const campaignTitle = getApprovalCampaignTitle(rule) || t("emails.approval.noCampaign");
  const formatLabel = getApprovalFormatLabel(t, rule);
  const channelsLabel = getApprovalChannelsLabel(t, rule);
  const scheduledFor = formatApprovalDateTime(
    getScheduledPublishAtIso(rule),
    locale,
    getRuleTimeZone(rule)
  );
  const postIndex = Number(rule?.campaign_post_index || 0);
  const postCount = Number(rule?.campaign_post_count || 0);
  const positionLabel = postIndex > 0 && postCount > 0
    ? t("emails.approval.postPosition", { index: postIndex, count: postCount })
    : "";

  const nextFormatLabel = nextRule ? getApprovalFormatLabel(t, nextRule) : "";
  const nextChannelsLabel = nextRule ? getApprovalChannelsLabel(t, nextRule) : "";
  const nextScheduledFor = nextRule
    ? formatApprovalDateTime(
        getScheduledPublishAtIso(nextRule),
        locale,
        getRuleTimeZone(nextRule)
      )
    : "";

  return {
    campaignTitle,
    formatLabel,
    channelsLabel,
    scheduledFor,
    postIndex,
    postCount,
    positionLabel,
    nextFormatLabel,
    nextChannelsLabel,
    nextScheduledFor,
  };
}

function buildApprovalPlanContextHtml({ locale, t, rule, nextRule }) {
  const context = buildApprovalPlanContext({ locale, t, rule, nextRule });
  const detailRow = (label, value) => value ? `
    <tr>
      <td style="padding:6px 10px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:700;line-height:1.45;">${escapeHtml(value)}</td>
    </tr>` : "";

  return `
    <tr>
      <td style="padding:0 28px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;border:1px solid #e7e2da;border-radius:14px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;">${escapeHtml(t("emails.approval.planContext"))}</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${detailRow(t("emails.approval.campaign"), context.campaignTitle)}
                ${detailRow(t("emails.approval.post"), context.positionLabel)}
                ${detailRow(t("emails.approval.format"), context.formatLabel)}
                ${detailRow(t("emails.approval.channels"), context.channelsLabel)}
                ${detailRow(t("emails.approval.scheduledFor"), context.scheduledFor)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${nextRule ? `
    <tr>
      <td style="padding:0 28px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #d97706;background:#fffbeb;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 7px;color:#92400e;font-size:12px;letter-spacing:.05em;text-transform:uppercase;font-weight:800;">${escapeHtml(t("emails.approval.nextPost"))}</p>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.55;"><strong>${escapeHtml(context.nextFormatLabel)}</strong><br>${escapeHtml(context.nextScheduledFor)}<br>${escapeHtml(context.nextChannelsLabel)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ""}
  `;
}

function buildApprovalEmailHtml({
  locale,
  t,
  rule,
  postContent,
  approveUrl,
  rejectUrl,
  imageUrl,
  carouselSlides = [],
  isCarouselDraft = false,
  nextRule = null,
  upcomingPlanUrl = "",
}) {
  const platformLabel = rule.platform || "Social media";
  const postTypeLabel = rule.post_type || "Post";
  const safeImageUrl = imageUrl ? escapeHtml(imageUrl) : "";
  const titleKey = isCarouselDraft ? "emails.approval.carouselTitle" : "emails.approval.title";
  const introKey = isCarouselDraft ? "emails.approval.carouselIntro" : "emails.approval.intro";
  const buttonKey = isCarouselDraft ? "emails.approval.button" : "emails.approval.button";
  const afterKey = isCarouselDraft ? "emails.approval.carouselAfterApprovalV2" : "emails.approval.afterApproval";
  const carouselPreviewHtml = isCarouselDraft ? buildCarouselEmailPreviewHtml(carouselSlides) : "";
  const planContextHtml = buildApprovalPlanContextHtml({
    locale,
    t,
    rule,
    nextRule,
  });
  const upcomingPlanHtml = upcomingPlanUrl ? `
    <tr>
      <td style="padding:0 28px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f1;border:1px solid #efc6b7;border-radius:14px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 6px;color:#9a412b;font-size:14px;font-weight:800;">${escapeHtml(t("emails.approval.upcomingPlanTitle"))}</p>
              <p style="margin:0 0 14px;color:#4b5563;font-size:14px;line-height:1.55;">${escapeHtml(t("emails.approval.upcomingPlanText"))}</p>
              <a href="${escapeHtml(upcomingPlanUrl)}" style="display:inline-block;background:#ea5b3f;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">${escapeHtml(t("emails.approval.upcomingPlanButton"))}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : "";
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

            ${planContextHtml}

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
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                  <tr>
                    <td style="padding:4px;">
                      <a href="${approveUrl}" style="display:inline-block;background:#0b1724;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:11px;">
                        ${escapeHtml(t(buttonKey))}
                      </a>
                    </td>
                    <td style="padding:4px;">
                      <a href="${rejectUrl}" style="display:inline-block;background:#fff7f1;color:#9a412b;border:1px solid #efc6b7;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:11px;">
                        ${escapeHtml(t("emails.approval.rejectButton"))}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                  ${escapeHtml(t(afterKey))}
                </p>
              </td>
            </tr>
            ${upcomingPlanHtml}
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
  locale,
  t,
  rule,
  postContent,
  approveUrl,
  rejectUrl,
  imageUrl,
  isCarouselDraft = false,
  nextRule = null,
  upcomingPlanUrl = "",
}) {
  const platformLabel = rule.platform || "Social media";
  const postTypeLabel = rule.post_type || "Post";
  const textTitleKey = isCarouselDraft ? "emails.approval.carouselTextTitle" : "emails.approval.textTitle";
  const textActionKey = isCarouselDraft ? "emails.approval.textApprovePost" : "emails.approval.textApprovePost";
  const afterKey = isCarouselDraft ? "emails.approval.carouselAfterApprovalV2" : "emails.approval.afterApproval";
  const context = buildApprovalPlanContext({ locale, t, rule, nextRule });

  return `
${t(textTitleKey)}

${t("emails.approval.textCampaign", { campaign: context.campaignTitle })}
${context.postIndex > 0 && context.postCount > 0 ? `${t("emails.approval.textPosition", { index: context.postIndex, count: context.postCount })}
` : ""}${t("emails.approval.textChannels", { channels: context.channelsLabel })}
${t("emails.approval.textScheduledFor", { scheduledFor: context.scheduledFor })}
${t("emails.approval.textPostType", { postType: context.formatLabel || postTypeLabel })}
${nextRule ? `${t("emails.approval.textNextPost", { postType: context.nextFormatLabel, scheduledFor: context.nextScheduledFor, channels: context.nextChannelsLabel })}
` : ""}

${imageUrl ? `${t("emails.approval.textImage", { imageUrl })}
` : ""}${t("emails.approval.textGeneratedPost")}
${postContent}

${t(textActionKey)}
${approveUrl}

${t("emails.approval.textRejectPost")}
${rejectUrl}

${upcomingPlanUrl ? `${t("emails.approval.textUpcomingPlan")}
${upcomingPlanUrl}

` : ""}${t(afterKey)}
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
      price: getTrustedWebsiteItemPricing(item || {}).displayPrice || null,
      sale_price: getTrustedWebsiteItemPricing(item || {}).salePrice || null,
      original_price: getTrustedWebsiteItemPricing(item || {}).originalPrice || null,
      price_source: String(item?.price_source || "").trim() || null,
      price_confidence: String(item?.price_confidence || "").trim() || null,
      search_method: method,
      campaign_fit_score: Number.isFinite(Number(item?.campaign_fit_score)) ? Number(item.campaign_fit_score) : null,
      campaign_fit_source: String(item?.campaign_fit_source || "").trim() || null,
      ai_campaign_fit_score:
        item?.ai_campaign_fit_score === undefined ||
        item?.ai_campaign_fit_score === null ||
        item?.ai_campaign_fit_score === ""
          ? null
          : Number.isFinite(Number(item.ai_campaign_fit_score))
            ? Number(item.ai_campaign_fit_score)
            : null,
      ai_campaign_fit_source: String(item?.ai_campaign_fit_source || "").trim() || null,
      ai_campaign_fit_model: String(item?.ai_campaign_fit_model || "").trim() || null,
      campaign_fit_verdict: String(item?.campaign_fit_verdict || "").trim() || null,
      campaign_fit_reason: String(item?.campaign_fit_reason || "").trim() || null,
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
  const { error: releaseError } = await supabase.rpc(
    "release_reserved_automation_credit_system",
    {
      p_rule_id: ruleId,
      p_reason: message || "Reserved credits returned after automation failure",
    }
  );

  if (releaseError && !String(releaseError.message || "").includes("function")) {
    console.warn("Could not release reserved credits after automation failure", {
      ruleId,
      message: releaseError.message,
    });
  }

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
  const rawValue = String(value || "").trim();
  const decodedValue = (() => {
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  })();

  if (
    !rawValue ||
    /\{\{|\}\}|<%|%7b|%7d|\bplaceholder\b/i.test(rawValue) ||
    /\{\{|\}\}|<%|\bplaceholder\b/i.test(decodedValue)
  ) {
    return null;
  }

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
  const namedEntities = {
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", trade: "™",
    euro: "€", pound: "£", yen: "¥", cent: "¢",
    Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ", Ccedil: "Ç",
    Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
    ETH: "Ð", Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø",
    Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü", Yacute: "Ý", THORN: "Þ", szlig: "ß",
    agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç",
    egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
    eth: "ð", ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
    ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", thorn: "þ", yuml: "ÿ",
    OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ", Zcaron: "Ž", zcaron: "ž",
    laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
  };

  let decoded = String(value || "");

  // A few stores double-encode product names (for example &amp;ouml;).
  // Decode in a small bounded loop so those titles also become normal text.
  for (let pass = 0; pass < 3; pass += 1) {
    const nextValue = decoded.replace(
      /&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi,
      (match, entity) => {
        if (entity[0] === "#") {
          const isHex = entity[1]?.toLowerCase() === "x";
          const rawCodePoint = entity.slice(isHex ? 2 : 1);
          const codePoint = Number.parseInt(rawCodePoint, isHex ? 16 : 10);

          if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
            try {
              return String.fromCodePoint(codePoint);
            } catch {
              return match;
            }
          }

          return match;
        }

        return Object.prototype.hasOwnProperty.call(namedEntities, entity)
          ? namedEntities[entity]
          : match;
      }
    );

    if (nextValue === decoded) {
      break;
    }

    decoded = nextValue;
  }

  return decoded;
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
      campaign_fit_source: "store_search_card",
    });
  }

  return dedupeUrlItems(candidates)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 40);
}

async function fetchHtml(url) {
  const safeUrl = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl, {
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

async function prepareFocusedPageContextForRule(rule) {
  const sourceUrl = getRuleContentSourceUrl(rule);
  if (!sourceUrl) return null;

  const sourceScope = getRuleContentSourceScope(rule);
  const shouldFetchAsPageContext =
    !isProductContentTypeRule(rule) || sourceScope === "focus_page";

  if (!shouldFetchAsPageContext) {
    return null;
  }

  try {
    const html = await fetchHtml(sourceUrl);
    const title =
      extractPageTitle(html) ||
      String(rule?.content_source_title || "").trim() ||
      sourceUrl;
    const metaDescription = getMetaContent(html, [
      "description",
      "og:description",
      "twitter:description",
    ]);
    const text = truncateText(stripHtmlToText(html), 12000);

    if (!text && !metaDescription && !rule?.content_source_summary) {
      throw new Error("The selected page did not contain readable content");
    }

    return {
      sourceScope,
      url: sourceUrl,
      title: truncateText(title, 220),
      summary: truncateText(
        metaDescription || rule?.content_source_summary || text,
        900
      ),
      text,
    };
  } catch (error) {
    if (rule?.content_source_summary || rule?.content_source_title) {
      console.warn("Could not refresh focused page; using the verified saved page summary", {
        ruleId: rule?.id,
        sourceUrl,
        message: error.message,
      });

      return {
        sourceScope,
        url: sourceUrl,
        title: rule?.content_source_title || sourceUrl,
        summary: rule?.content_source_summary || "",
        text: rule?.content_source_summary || "",
        stale: true,
      };
    }

    throw new Error(`The selected focus page could not be refreshed: ${error.message}`);
  }
}

async function fetchJson(url) {
  const safeUrl = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SpreeloBot/1.0; +https://app.spreelo.com)",
        Accept: "application/json,text/plain,*/*",
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

  if (["single_image", "carousel", "slideshow_video", "animated_video"].includes(format)) {
    return format;
  }

  return "single_image";
}

function isCarouselRule(rule) {
  return normalizeContentFormat(rule?.content_format) === "carousel";
}

function isAnimatedVideoRule(rule) {
  return normalizeContentFormat(rule?.content_format) === "animated_video";
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
  const rawTitle = String(item?.title || "").trim();
  const title = sanitizeProductTitleForCard(rawTitle) || rawTitle;
  const description = String(item?.description || "").trim();
  const type = String(item?.type || "website_item").trim();
  const resolvedUrl = item?.url ? resolveUrl(item.url, websiteUrl) : websiteUrl;
  const url = resolvedUrl ? canonicalizeWebsiteProductUrl(resolvedUrl, websiteUrl) : websiteUrl;
  const imageUrl = item?.image_url ? resolveUrl(item.image_url, websiteUrl) : null;
  const trustedPricing = getTrustedWebsiteItemPricing({
    ...item,
    url: url || websiteUrl,
  });
  let price = trustedPricing.displayPrice;
  let salePrice = trustedPricing.salePrice;
  let originalPrice = trustedPricing.originalPrice;

  if (price && isLikelyWrongUsdPriceForUrl(price, url || websiteUrl)) {
    price = "";
    salePrice = "";
    originalPrice = "";
  }

  if (!title || !description) {
    return null;
  }

  return {
    title,
    description: truncateText(description, 900),
    price,
    sale_price: salePrice,
    original_price: originalPrice,
    price_source: String(item?.price_source || "").trim(),
    price_confidence: String(item?.price_confidence || "").trim(),
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

function isWebsiteTextAdRule(rule) {
  return String(rule?.content_type_id || "").trim() === "website_item_text_ad";
}

function getAuthorizedCampaignOffer(rule) {
  const source = [rule?.prompt, rule?.image_prompt, rule?.strategy_notes]
    .filter(Boolean)
    .join("\n");
  const match = source.match(/AUTHORIZED CAMPAIGN OFFER:\s*([^\n]+)/i);
  return match?.[1]?.trim() || "";
}

function formatAuthorizedCampaignOfferForPrompt(rule) {
  const offer = getAuthorizedCampaignOffer(rule);
  if (!offer) return "";

  return `Authorized customer-supplied campaign offer:\n${offer}\n\nMandatory offer rules:\n- This exact campaign offer was entered by the customer and is verified for this campaign.\n- Use only the exact discount, campaign code, currency and dates supplied in the campaign instruction.\n- Never change, convert, translate, round or invent any campaign value.\n- This authorized campaign offer is the only exception to general rules that prohibit unverified discount claims.`;
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
  const authorizedOffer = getAuthorizedCampaignOffer(rule);

  return `Campaign visual context:
${campaignTheme || "Campaign theme not explicitly named."}
Authorized campaign offer: ${authorizedOffer || "Not provided"}
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
  const productSearchQueries = normalizeStoreSearchQueries(
    splitCampaignTermLine(rule?.product_search_queries),
    CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
  );
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
    .join("\n")
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

function normalizeStoreSearchQueries(values, limit = CAMPAIGN_STORE_SEARCH_QUERY_LIMIT) {
  const seen = new Set();
  const queries = [];

  for (const rawValue of values || []) {
    const query = normalizeSearchText(rawValue)
      .replace(/https?:\/\/\S+/giu, " ")
      .replace(/[.!?]+$/u, "")
      .replace(/[^\p{L}\p{N}'&+\-/ ]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    const words = query.split(/\s+/u).filter(Boolean);

    if (
      !query ||
      words.length < 1 ||
      words.length > 4 ||
      /^\d+$/u.test(query) ||
      genericWebsiteTextIntentTokens.has(query) ||
      seen.has(query)
    ) {
      continue;
    }

    seen.add(query);
    queries.push(query);

    if (queries.length >= limit) {
      break;
    }
  }

  return queries;
}

function buildFallbackProductSearchQueriesForRule(rule, limit = CAMPAIGN_STORE_SEARCH_QUERY_LIMIT) {
  const existingQueries = normalizeStoreSearchQueries(
    splitCampaignTermLine(rule?.product_search_queries),
    limit
  );
  const rawProductMatchTerms = splitCampaignTermLine(rule?.product_match_terms);
  const supportedProductMatchTerms = normalizeStoreSearchQueries(
    filterCampaignMatchTermsForRule(rawProductMatchTerms, rule),
    limit
  );
  const campaignThemeTerms = normalizeStoreSearchQueries(
    extractCampaignCoreThemeTerms(rule),
    limit
  );

  // Keep the analysis-created phrases intact. Do not prefix the campaign name
  // to every query and do not split useful phrases into arbitrary single words.
  // The order favours the core campaign theme, then dedicated analysis queries,
  // then additional concrete match terms.
  return normalizeStoreSearchQueries(
    [
      // Always try the campaign's own core theme before broader analysis-created
      // product/category phrases. For example, a Halloween campaign should test
      // the Halloween theme before generic candy, clothing or gift terms.
      ...campaignThemeTerms,
      ...existingQueries,
      ...supportedProductMatchTerms,
    ],
    limit
  );
}

async function ensureProductSearchQueriesForRule({ supabase, rule }) {
  const normalizedQueries = buildFallbackProductSearchQueriesForRule(rule);

  if (!normalizedQueries.length) {
    return rule;
  }

  const existingQueries = normalizeStoreSearchQueries(
    splitCampaignTermLine(rule?.product_search_queries),
    CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
  );
  const changed = normalizedQueries.join("|") !== existingQueries.join("|");

  if (changed) {
    try {
      await supabase
        .from("automation_rules")
        .update({
          product_search_queries: normalizedQueries,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id)
        .eq("user_id", rule.user_id);
    } catch (error) {
      console.warn("Could not persist normalized product_search_queries; using them for this run only", {
        ruleId: rule?.id,
        message: error?.message,
      });
    }
  }

  // Mutate the current rule object as well as persisting it. The cron logger and
  // all later steps then see the same derived queries that were actually used.
  rule.product_search_queries = normalizedQueries;
  rule.product_search_queries_derived = !existingQueries.length;

  return rule;
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
    .replace(/create a social media post caption that promotes that specific item in a helpful, trustworthy and sales-focused way\.?/gi, " ")
    .replace(/the caption should work together with a product-specific ad image\.?/gi, " ")
    .replace(/create a full ad-style image around the selected website item\.?/gi, " ")
    .replace(/use the real website item image as the basis when possible, and design a unique social media ad that fits that exact product\.?/gi, " ")
    .replace(/include short readable marketing text in the image, but do not include price, discounts or ratings\.?/gi, " ")
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
      const compactRoot = prefix.slice(0, 3);

      if (isUsefulShortCampaignRoot(compactRoot)) {
        sharedRoots.push(compactRoot);
        sharedRoots.push(prefix);
      }
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
  const value = normalizeSearchText(word).trim();

  // Long compound campaign words can contain the useful search root at the
  // beginning. Keep this generic and only use it for longer words so ordinary
  // short words do not become noisy roots.
  if (value.length < 10) {
    return "";
  }

  const root = value.slice(0, 3);

  return isUsefulShortCampaignRoot(root) ? root : "";
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
    const phraseWords = words.slice(0, 3);

    // Preserve the meaningful campaign-title phrase, but do not turn every
    // following product/category word into a hard theme guard. In a title such
    // as “Halloween Candy”, “Halloween” is the occasion while “candy” describes
    // the assortment. Treating both as equal core themes allowed ordinary candy
    // to pass as Halloween-specific.
    if (phraseWords.length >= 2) {
      terms.push(phraseWords.join(" "));
    }

    const primaryWord = words.find(
      (word) => word.length >= 4 && !weakShortSearchRoots.has(word)
    );

    if (primaryWord) {
      terms.push(primaryWord);

      const compactRoot = getCompactCampaignThemeRoot(primaryWord);
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

  const dedupedItems = dedupeWebsiteItemsByUrlTitleAndImage(items).filter((item) => {
    const aiScore = getAiCampaignFitScore(item);

    if (isExplicitCampaignFitRejected(item)) {
      return false;
    }

    // Product-level AI scoring is authoritative in the relevance-first path.
    // Medium/weak evaluated products remain available to the separate delivery
    // backup, but they must not be counted as perfect first-pass matches.
    return aiScore === null || aiScore >= CAMPAIGN_NEAR_PRODUCT_FIT_SCORE;
  });
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const anchorTerms = extractCampaignAnchorTerms(rule);
  const themeTerms = extractCampaignCoreThemeTerms(rule);
  const themeSourceLockedItems = getCampaignThemeSourceLockedItems(dedupedItems, rule);
  const themeMatchedItems = getCampaignThemeMatchedItems(dedupedItems, rule);
  const anchorMatchedItems = getCampaignAnchorMatchedItems(dedupedItems, rule);
  const primaryMatchedItems = getPrimaryCampaignMatchedItems(dedupedItems, rule);
  const concreteThemeSourceLockedItems = preferConcreteCampaignProducts(themeSourceLockedItems);
  const concreteThemeMatchedItems = preferConcreteCampaignProducts(themeMatchedItems);
  const concreteAnchorMatchedItems = preferConcreteCampaignProducts(anchorMatchedItems);
  const concretePrimaryMatchedItems = preferConcreteCampaignProducts(primaryMatchedItems);
  const aiApprovedItems = preferConcreteCampaignProducts(
    dedupedItems.filter((item) => {
      const aiScore = getAiCampaignFitScore(item);
      return aiScore !== null && aiScore >= CAMPAIGN_NEAR_PRODUCT_FIT_SCORE;
    })
  );
  const safeSourceLockedItems = concreteThemeSourceLockedItems.filter((item) =>
    getCampaignProductSignalState(
      item,
      rule,
      CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
    ).hasMeaningfulCampaignSignal
  );

  // Search/category pages are discovery sources only. Every product must still
  // prove its own campaign relevance through its product data or an AI fit score.
  if (themeTerms.length || anchorTerms.length) {
    return dedupeWebsiteItemsByUrlTitleAndImage([
      ...concreteThemeMatchedItems,
      ...concreteAnchorMatchedItems,
      ...aiApprovedItems,
      ...safeSourceLockedItems,
    ]);
  }

  if (explicitTerms.length) {
    return dedupeWebsiteItemsByUrlTitleAndImage([
      ...concretePrimaryMatchedItems,
      ...aiApprovedItems,
    ]);
  }

  if (concreteAnchorMatchedItems.length || concretePrimaryMatchedItems.length || aiApprovedItems.length) {
    return dedupeWebsiteItemsByUrlTitleAndImage([
      ...concreteAnchorMatchedItems,
      ...concretePrimaryMatchedItems,
      ...aiApprovedItems,
    ]);
  }

  return preferConcreteCampaignProducts(getStrongCampaignFitItems(dedupedItems, rule));
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

function normalizeCampaignFitVerdict(value) {
  return normalizeSearchText(value).trim();
}

function isExplicitCampaignFitRejected(item) {
  return normalizeCampaignFitVerdict(item?.campaign_fit_verdict) === "reject";
}

function getCampaignProductSignalState(
  item,
  rule,
  minimumAiScore = CAMPAIGN_NEAR_PRODUCT_FIT_SCORE
) {
  const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
  const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
  const anchorMatches = countCampaignAnchorTermMatches(item, rule);
  const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
  const aiCampaignFitScore = getAiCampaignFitScore(item);
  const coreThemeTerms = extractCampaignCoreThemeTerms(rule);
  const anchorTerms = extractCampaignAnchorTerms(rule);
  const hasCoreThemeGuard = coreThemeTerms.length > 0;
  const hasAnchorGuard = !hasCoreThemeGuard && anchorTerms.length > 0;
  const hasStrictThemeGuard = hasCoreThemeGuard || hasAnchorGuard;

  // When the campaign has a clear occasion/theme such as Halloween, Christmas
  // or Mother's Day, generic product words from the title (for example
  // T-shirt, print, gift or hoodie) must not count as proof of theme relevance.
  // Anchor terms are only allowed as the hard guard when no core theme could be
  // derived at all.
  const hasDirectCampaignSignal = hasCoreThemeGuard
    ? themeMatches > 0
    : hasAnchorGuard
      ? anchorMatches > 0
      : primaryMatches > 0;

  const effectiveMinimumAiScore = hasStrictThemeGuard
    ? Math.max(minimumAiScore, CAMPAIGN_NEAR_PRODUCT_FIT_SCORE)
    : minimumAiScore;
  const hasAiCampaignEvaluation = aiCampaignFitScore !== null;
  const explicitlyRejected = isExplicitCampaignFitRejected(item);
  const hasAiCampaignApproval =
    hasAiCampaignEvaluation &&
    !explicitlyRejected &&
    aiCampaignFitScore >= effectiveMinimumAiScore;

  return {
    themeMatches,
    sourceThemeMatches,
    anchorMatches,
    primaryMatches,
    aiCampaignFitScore,
    hasCoreThemeGuard,
    hasAnchorGuard,
    hasStrictThemeGuard,
    hasDirectCampaignSignal,
    hasAiCampaignEvaluation,
    explicitlyRejected,
    hasAiCampaignApproval,
    // Once AI has evaluated a concrete product, that product-level verdict is
    // authoritative. A matching search/category source or a broad title word
    // must never override a reject or a sub-threshold score.
    hasMeaningfulCampaignSignal: explicitlyRejected
      ? false
      : hasAiCampaignEvaluation
        ? hasAiCampaignApproval
        : hasDirectCampaignSignal,
  };
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
        `Search/result page: ${item?.source_search_url || item?.source_page_url || "Not provided"}`,
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
        campaign_fit_score: Number(item?.campaign_fit_score || item?.score || 0),
        campaign_fit_source: item?.campaign_fit_source || "ai_campaign_fit_unscored",
        campaign_fit_reason:
          item?.campaign_fit_reason || "Not evaluated in campaign fit batch; kept existing heuristic score.",
      };
    }

    const aiCampaignFitSource =
      evaluation.model === PRODUCT_RESEARCH_MODEL
        ? "ai_campaign_fit"
        : "ai_campaign_fit_fast";

    return {
      ...item,
      ai_campaign_fit_score: evaluation.score,
      campaign_fit_score: evaluation.score,
      // Keep the real discovery source (store search, campaign discovery, etc.)
      // so logs and source-level safeguards remain truthful. AI scoring is
      // recorded separately.
      campaign_fit_source: item?.campaign_fit_source || aiCampaignFitSource,
      ai_campaign_fit_source: aiCampaignFitSource,
      ai_campaign_fit_model: evaluation.model,
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

  if (isExplicitCampaignFitRejected(item)) {
    return -200;
  }

  const terms = extractCampaignTerms(rule);
  const explicitTerms = extractExplicitCampaignMatchTerms(rule);
  const avoidTerms = extractCampaignAvoidTerms(rule);
  const themeTerms = extractCampaignCoreThemeTerms(rule);
  const themeMatches = countCampaignCoreThemeTermMatches(item, rule);
  const sourceThemeMatches = countCampaignSourceThemeMatches(item, rule);
  const anchorMatches = countCampaignAnchorTermMatches(item, rule);
  const anchorTerms = extractCampaignAnchorTerms(rule);
  const primaryMatches = countPrimaryCampaignTermMatches(item, rule);
  const hasCoreThemeGuard = themeTerms.length > 0;
  const hasAnchorGuard = !hasCoreThemeGuard && anchorTerms.length > 0;
  const hasStrictThemeGuard = hasCoreThemeGuard || hasAnchorGuard;
  const directCampaignSignalCount = hasCoreThemeGuard
    ? themeMatches
    : hasAnchorGuard
      ? anchorMatches
      : primaryMatches;
  if (!terms.length && !avoidTerms.length && !anchorTerms.length && !themeTerms.length) {
    return aiScore !== null ? aiScore : Number(item?.campaign_fit_score || 0);
  }

  const title = normalizeSearchText(item?.title);
  const url = normalizeSearchText(item?.url || item?.product_url || item?.item_url);
  const description = normalizeSearchText(item?.description);
  const reason = normalizeSearchText(item?.reason);
  const source = normalizeSearchText(item?.catalog_source || item?.discovery_source || item?.campaign_fit_source);
  const haystack = `${title} ${url} ${description} ${reason}`;
  // campaign_fit_score is a derived value. Starting from a previously derived
  // value made the score grow every time this function was called.
  let score = aiScore !== null ? aiScore : 0;

  const shortRoots = getPrimaryCampaignShortRoots(rule);

  if (themeMatches > 0) {
    score += 125 + themeMatches * 45;
  } else if (sourceThemeMatches > 0) {
    score += directCampaignSignalCount > 0
      ? 95 + sourceThemeMatches * 30
      : 40 + sourceThemeMatches * 8;
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
  const reasonTokens = tokenizeSearchText(reason);

  for (const term of terms) {
    const isExplicit = explicitTerms.includes(term);
    const isShortRoot = shortRoots.has(term);

    if (isShortRoot) {
      const titleRootMatch = titleTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);
      const urlRootMatch = urlTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);
      const descriptionRootMatch = descriptionTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);
      const reasonRootMatch = reasonTokens.some((token) => token.startsWith(term) && token.length >= term.length + 2);

      if (titleRootMatch) score += 48;
      if (urlRootMatch) score += 42;
      if (descriptionRootMatch) score += 10;
      if (reasonRootMatch) score += 8;
      continue;
    }

    if (title.includes(term)) score += isExplicit ? 65 : 35;
    if (url.includes(term)) score += isExplicit ? 65 : 35;
    if (description.includes(term)) score += isExplicit ? 18 : 8;
    if (reason.includes(term)) score += isExplicit ? 16 : 8;
  }

  for (const avoidTerm of avoidTerms) {
    if (!avoidTerm) continue;
    if (title.includes(avoidTerm)) score -= 90;
    if (url.includes(avoidTerm)) score -= 90;
    if (description.includes(avoidTerm)) score -= 35;
    if (haystack.includes(avoidTerm)) score -= 20;
  }

  if (source.includes("ai_campaign_research")) score += 25;
  if (source.includes("campaign")) score += 12;

  if (isLikelyGenericCustomTemplateProduct(item) && themeMatches === 0 && sourceThemeMatches === 0 && anchorMatches === 0) {
    score -= 160;
  }

  if (
    hasStrictThemeGuard &&
    directCampaignSignalCount === 0 &&
    (aiScore === null || aiScore < CAMPAIGN_NEAR_PRODUCT_FIT_SCORE)
  ) {
    // A Halloween/Christmas/etc search page does not make every product on that
    // page relevant. Without product-level theme evidence or AI approval, keep
    // the item below the campaign acceptance threshold.
    score = Math.min(score, CAMPAIGN_MINIMUM_PRODUCT_FIT_SCORE - 5);
  }

  // Do not let heuristic title/source bonuses promote an AI-evaluated weak or
  // medium product into a stronger tier than the product-level evaluation.
  if (aiScore !== null && aiScore < 55) {
    score = Math.min(score, 54);
  } else if (aiScore !== null && aiScore < CAMPAIGN_NEAR_PRODUCT_FIT_SCORE) {
    score = Math.min(score, CAMPAIGN_NEAR_PRODUCT_FIT_SCORE - 1);
  }

  return Math.max(score, -200);
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


function findBestJsonLdProduct(html, pageUrl = "", expectedTitle = "") {
  const products = extractJsonLdObjects(html).filter((item) =>
    normalizeJsonLdType(item?.["@type"]).some((type) => type.includes("product"))
  );

  if (!products.length) {
    return null;
  }

  const expectedComparable = normalizeComparableValue(sanitizeProductTitleForCard(expectedTitle));
  const pageComparable = normalizeComparableValue(pageUrl);

  return products
    .map((product, index) => {
      let score = 0;
      const productUrl = getProductUrlFromJsonLd(product, pageUrl);
      const productComparable = normalizeComparableValue(productUrl);
      const titleComparable = normalizeComparableValue(product?.name);

      if (pageComparable && productComparable && pageComparable === productComparable) {
        score += 120;
      } else if (
        pageComparable &&
        productComparable &&
        (pageComparable.includes(productComparable) || productComparable.includes(pageComparable))
      ) {
        score += 60;
      }

      if (expectedComparable && titleComparable) {
        if (expectedComparable === titleComparable) {
          score += 90;
        } else {
          const expectedTokens = expectedComparable
            .split(/[^\p{L}\p{N}]+/u)
            .filter((token) => token.length >= 4);
          const titleTokens = new Set(
            titleComparable
              .split(/[^\p{L}\p{N}]+/u)
              .filter((token) => token.length >= 4)
          );
          score += expectedTokens.filter((token) => titleTokens.has(token)).length * 12;
        }
      }

      if (product?.offers) score += 8;
      if (product?.image) score += 4;

      return { product, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.product || null;
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

function getProductPricingFromJsonLd(product) {
  const offers = Array.isArray(product?.offers)
    ? product.offers
    : product?.offers
      ? [product.offers]
      : [];
  let currentPrice = "";
  let originalPrice = "";

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") {
      continue;
    }

    const offerCurrency = offer?.priceCurrency || "";
    const directPrice = formatVerifiedPriceFromAmount(
      offer?.price || offer?.lowPrice || "",
      offerCurrency
    );

    if (directPrice && !currentPrice) {
      currentPrice = directPrice;
    }

    const specifications = [
      ...(Array.isArray(offer?.priceSpecification)
        ? offer.priceSpecification
        : offer?.priceSpecification
          ? [offer.priceSpecification]
          : []),
      ...(Array.isArray(product?.priceSpecification)
        ? product.priceSpecification
        : product?.priceSpecification
          ? [product.priceSpecification]
          : []),
    ];

    for (const specification of specifications) {
      if (!specification || typeof specification !== "object") {
        continue;
      }

      const specificationPrice = formatVerifiedPriceFromAmount(
        specification?.price || specification?.value || "",
        specification?.priceCurrency || offerCurrency
      );

      if (!specificationPrice) {
        continue;
      }

      const label = [
        specification?.["@type"],
        specification?.name,
        specification?.priceType,
        specification?.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (/(strikethrough|list|regular|original|msrp|rrp|uvp|was)/i.test(label)) {
        originalPrice ||= specificationPrice;
      } else if (/(sale|current|offer|discount|final|now)/i.test(label)) {
        currentPrice ||= specificationPrice;
      } else {
        currentPrice ||= specificationPrice;
      }
    }

    if (currentPrice) {
      break;
    }
  }

  return normalizeExtractedProductPricing({
    currentPrice,
    originalPrice,
    source: "json_ld_product_offer",
    confidence: "high",
  });
}

function getProductPriceFromJsonLd(product) {
  return getProductPricingFromJsonLd(product).price;
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

function extractProductPricingFromVisibleHtml({
  html,
  pageUrl = "",
  productTitle = "",
} = {}) {
  const visibleHtml = String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  const visibleText = decodeHtmlEntities(stripHtmlToText(visibleHtml))
    .replace(/\s+/g, " ")
    .trim();

  if (!visibleText) {
    return normalizeExtractedProductPricing();
  }

  const normalizedTitle = decodeHtmlEntities(String(productTitle || ""))
    .replace(/\s+/g, " ")
    .trim();
  const lowerVisibleText = visibleText.toLowerCase();
  const titleIndex = normalizedTitle
    ? lowerVisibleText.indexOf(normalizedTitle.toLowerCase())
    : -1;
  const scopeStart = titleIndex >= 0 ? Math.max(0, titleIndex - 120) : 0;
  const scopeLength = titleIndex >= 0 ? 3600 : Math.min(visibleText.length, 2200);
  const scope = visibleText.slice(scopeStart, scopeStart + scopeLength);
  const currentLabelRegex = new RegExp(
    String.raw`(?:sale\s*price|current\s*price|offer\s*price|now\s*price|kampanjpris|reapris|pris\s*nu|vanligt\s*pris|price|pris)\s*[:\-–—/]?\s*(${PRICE_AMOUNT_PATTERN})`,
    "gi"
  );
  const originalLabelRegex = new RegExp(
    String.raw`(?:regular\s*price|original\s*price|list\s*price|was\s*price|ordinarie\s*pris|tidigare\s*pris|rek\.?\s*pris)\s*[:\-–—/]?\s*(${PRICE_AMOUNT_PATTERN})`,
    "gi"
  );
  const saleLabelRegex = new RegExp(
    String.raw`(?:sale\s*price|offer\s*price|now\s*price|kampanjpris|reapris|pris\s*nu)\s*[:\-–—/]?\s*(${PRICE_AMOUNT_PATTERN})`,
    "gi"
  );

  const collectLabeledPrices = (regex) => {
    const prices = [];
    let match;
    while ((match = regex.exec(scope)) !== null) {
      const normalized = normalizeVerifiedPriceValue(match[1]);
      if (normalized) prices.push(normalized);
    }
    return prices;
  };

  const salePrices = collectLabeledPrices(saleLabelRegex);
  const originalPrices = collectLabeledPrices(originalLabelRegex);
  const currentPrices = collectLabeledPrices(currentLabelRegex);
  const allVisiblePrices = extractVerifiedPriceMatches(scope);
  const currentPrice = pickPreferredPriceForUrl(
    [...salePrices, ...currentPrices, ...allVisiblePrices],
    pageUrl
  );
  const originalPrice = salePrices.length
    ? pickPreferredPriceForUrl(originalPrices, pageUrl)
    : "";

  return normalizeExtractedProductPricing({
    currentPrice,
    originalPrice,
    source: currentPrice ? "visible_product_page_price" : "",
    confidence: currentPrice ? "high" : "",
  });
}


function inferShopifyCurrencyFromHtml(html, pageUrl = "") {
  const explicitCurrency =
    getMetaContent(html, [
      "product:price:currency",
      "og:price:currency",
      "product:currency",
    ]) ||
    String(html || "").match(/Shopify\.currency\.active\s*=\s*["']([A-Z]{3})["']/i)?.[1] ||
    String(html || "").match(/["'](?:currency|presentment_currency|priceCurrency)["']\s*:\s*["']([A-Z]{3})["']/i)?.[1] ||
    "";

  if (explicitCurrency) {
    return String(explicitCurrency).trim().toUpperCase();
  }

  const host = getHostnameFromUrl(pageUrl);
  if (/\.se$/i.test(host)) return "SEK";
  if (/\.no$/i.test(host)) return "NOK";
  if (/\.dk$/i.test(host)) return "DKK";
  if (/\.fi$/i.test(host)) return "EUR";
  if (/\.(?:de|fr|nl|be|es|it|pt|at|eu)$/i.test(host)) return "EUR";
  if (/\.ch$/i.test(host)) return "CHF";
  if (/\.pl$/i.test(host)) return "PLN";
  if (/\.cz$/i.test(host)) return "CZK";

  return "";
}

function formatShopifyEmbeddedPrice(rawValue, currency) {
  const raw = String(rawValue ?? "").trim();
  if (!raw || !currency || !/^\d+(?:[.,]\d+)?$/.test(raw)) {
    return "";
  }

  const normalized = raw.replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  // Shopify theme/product JSON often stores integer prices in minor units
  // (for example 22900 = 229.00 SEK), while products.json may expose 229.00.
  const looksLikeMinorUnits = !normalized.includes(".") && numeric >= 1000;
  const majorAmount = looksLikeMinorUnits ? numeric / 100 : numeric;
  const amountText = Number.isInteger(majorAmount)
    ? String(majorAmount)
    : majorAmount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

  if (String(currency).toUpperCase() === "SEK") {
    return normalizeVerifiedPriceValue(`${amountText} kr`);
  }

  return formatVerifiedPriceFromAmount(amountText, currency);
}

function getProductPricingFromShopifyEmbeddedData({
  html,
  pageUrl = "",
  productTitle = "",
} = {}) {
  const source = String(html || "");
  const handle = (() => {
    try {
      return new URL(pageUrl).pathname.match(/\/products\/([^/?#]+)/i)?.[1] || "";
    } catch {
      return "";
    }
  })();
  const normalizedTitle = String(productTitle || "").trim().toLowerCase();
  const currency = inferShopifyCurrencyFromHtml(source, pageUrl);

  if (!currency || (!handle && !normalizedTitle)) {
    return normalizeExtractedProductPricing();
  }

  const scriptBodies = Array.from(
    source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => String(match[1] || "")
  );
  const relevantScopes = [];

  for (const scriptBody of scriptBodies) {
    const lower = scriptBody.toLowerCase();
    const handleIndex = handle ? lower.indexOf(handle.toLowerCase()) : -1;
    const titleIndex = normalizedTitle ? lower.indexOf(normalizedTitle) : -1;
    const identityIndex = handleIndex >= 0 ? handleIndex : titleIndex;

    if (identityIndex < 0 || !/["'](?:price|price_min|price_max)["']\s*:/i.test(scriptBody)) {
      continue;
    }

    relevantScopes.push(
      scriptBody.slice(Math.max(0, identityIndex - 2500), identityIndex + 7500)
    );
  }

  const prices = [];
  const compareAtPrices = [];

  for (const scope of relevantScopes) {
    const priceRegex = /["'](?:price|price_min)["']\s*:\s*["']?(\d+(?:[.,]\d+)?)["']?/gi;
    const compareRegex = /["'](?:compare_at_price|compareAtPrice)["']\s*:\s*["']?(\d+(?:[.,]\d+)?)["']?/gi;
    let match;

    while ((match = priceRegex.exec(scope)) !== null) {
      const formatted = formatShopifyEmbeddedPrice(match[1], currency);
      if (formatted && !prices.includes(formatted)) prices.push(formatted);
    }

    while ((match = compareRegex.exec(scope)) !== null) {
      const formatted = formatShopifyEmbeddedPrice(match[1], currency);
      if (formatted && !compareAtPrices.includes(formatted)) compareAtPrices.push(formatted);
    }
  }

  const currentPrice = pickPreferredPriceForUrl(prices, pageUrl);
  const originalPrice = compareAtPrices.length
    ? pickPreferredPriceForUrl(compareAtPrices, pageUrl)
    : "";

  return normalizeExtractedProductPricing({
    currentPrice,
    originalPrice,
    source: currentPrice ? "shopify_embedded_product_price" : "",
    confidence: currentPrice ? "high" : "",
  });
}

function getProductPricingFromMeta(html) {
  const currency = getMetaContent(html, [
    "product:price:currency",
    "og:price:currency",
    "product:currency",
  ]);
  const currentAmount = getMetaContent(html, [
    "product:sale_price:amount",
    "product:discount_price:amount",
    "product:price:amount",
    "og:price:amount",
  ]);
  const originalAmount = getMetaContent(html, [
    "product:original_price:amount",
    "product:regular_price:amount",
    "product:list_price:amount",
    "product:price:standard_amount",
  ]);

  return normalizeExtractedProductPricing({
    currentPrice: formatVerifiedPriceFromAmount(currentAmount, currency),
    originalPrice: formatVerifiedPriceFromAmount(originalAmount, currency),
    source: "product_meta_price",
    confidence: "high",
  });
}

function extractItempropValueFromHtml(html, itempropName) {
  const source = String(html || "");
  const escapedName = String(itempropName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRegex = new RegExp(
    `<([a-z0-9]+)\\b[^>]*itemprop=["'][^"']*\\b${escapedName}\\b[^"']*["'][^>]*>([\\s\\S]{0,180}?)<\\/\\1>|<[^>]+itemprop=["'][^"']*\\b${escapedName}\\b[^"']*["'][^>]*>`,
    "gi"
  );
  let match;

  while ((match = tagRegex.exec(source)) !== null) {
    const fullTag = String(match[0] || "");
    const openingTagMatch = fullTag.match(/^<[^>]+>/);
    const openingTag = openingTagMatch?.[0] || fullTag;
    const attributeValue =
      getAttributeValueFromTag(openingTag, "content") ||
      getAttributeValueFromTag(openingTag, "value");
    const textValue = stripHtmlToText(match[2] || "");
    const value = decodeHtmlEntities(attributeValue || textValue).trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function getProductPricingFromMicrodata(html) {
  const amount = extractItempropValueFromHtml(html, "price");
  const currency = extractItempropValueFromHtml(html, "priceCurrency");

  return normalizeExtractedProductPricing({
    currentPrice: formatVerifiedPriceFromAmount(amount, currency),
    source: "product_microdata_price",
    confidence: "medium",
  });
}

function extractProductPricingFromHtml({
  html,
  product = null,
  fallbackTitle = "",
  pageUrl = "",
} = {}) {
  const sources = [
    extractProductPricingFromVisibleHtml({
      html,
      pageUrl,
      productTitle: product?.name || fallbackTitle,
    }),
    getProductPricingFromShopifyEmbeddedData({
      html,
      pageUrl,
      productTitle: product?.name || fallbackTitle,
    }),
    getProductPricingFromJsonLd(product),
    getProductPricingFromMeta(html),
    getProductPricingFromMicrodata(html),
    // Search/discovery text is deliberately last because it can reflect a
    // different Shopify market or presentment currency than the product page.
    extractProductPricingFromTitle(fallbackTitle),
  ];

  return (
    sources.find((pricing) => pricing?.price) ||
    normalizeExtractedProductPricing()
  );
}

function extractProductPriceFromHtml(html, product = null, fallbackTitle = "") {
  return extractProductPricingFromHtml({
    html,
    product,
    fallbackTitle,
  }).price;
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
  const product = findBestJsonLdProduct(html, pageUrl, productTitle);
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
  const expectedTitle = sanitizeProductTitleForCard(webSearchProduct?.title || "");
  const product = findBestJsonLdProduct(html, productUrl, expectedTitle);
  const productSchemaFound = Boolean(product?.name || product?.offers || product?.image);
  const ecommerceProofFound = hasEcommerceProofText(html);

  const rawTitle =
    String(product?.name || "").trim() ||
    String(webSearchProduct?.title || "").trim() ||
    extractPageTitle(html);
  const title = sanitizeProductTitleForCard(rawTitle) || rawTitle;

  const metaDescription = getMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);

  const description =
    String(product?.description || "").trim() ||
    String(metaDescription || "").trim() ||
    truncateText(stripHtmlToText(html), 700);

  const pricing = extractProductPricingFromHtml({
    html,
    product,
    fallbackTitle: webSearchProduct?.title || rawTitle,
    pageUrl: productUrl,
  });
  const price = pricing.price;

  if (!price) {
    console.log("Product page candidate has no trustworthy main-product price; continuing without a displayed price", {
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
      sale_price: pricing.sale_price,
      original_price: pricing.original_price,
      price_source: pricing.price_source,
      price_confidence: pricing.price_confidence,
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
    campaign_fit_score: Number(webSearchProduct?.campaign_fit_score || 0),
    product_page_verified: true,
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
async function discoverProductsFromFocusedCategory({
  categoryUrl,
  rule,
  limit = WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT,
}) {
  const html = await fetchHtml(categoryUrl);
  const campaignPrompt = buildCampaignResearchText(rule);
  const cardCandidates = extractProductCardCandidatesFromHtml({
    html,
    pageUrl: categoryUrl,
    websiteUrl: categoryUrl,
    campaignPrompt,
  });
  const jsonLdCandidates = extractJsonLdProductCandidatesFromHtml({
    html,
    pageUrl: categoryUrl,
    websiteUrl: categoryUrl,
  });
  const candidates = dedupeUrlItems([
    ...cardCandidates,
    ...jsonLdCandidates,
  ]).slice(0, Math.max(limit * 3, 24));

  if (!candidates.length) {
    return [];
  }

  return verifyDiscoveredWebsiteProductCandidates({
    candidates,
    websiteUrl: categoryUrl,
    limit,
  });
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

function addCampaignSearchVariants(searches, value) {
  const query = normalizeStoreSearchQueries([value], 1)[0];
  const slug = makeSearchSlug(query);

  if (slug) {
    searches.push(slug);
  }
}

function extractDedicatedStoreSearchQueries(campaignPrompt) {
  return normalizeStoreSearchQueries(
    splitCampaignTermLine(
      extractPromptLineValue(campaignPrompt, "Product search queries")
    ),
    CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
  );
}

function buildCampaignDiscoverySearches(campaignPrompt) {
  const rule = { prompt: campaignPrompt };
  const dedicatedQueries = extractDedicatedStoreSearchQueries(campaignPrompt);
  const explicitTerms = normalizeStoreSearchQueries(
    extractExplicitCampaignMatchTerms(rule),
    CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
  );
  const coreThemeTerms = normalizeStoreSearchQueries(
    extractCampaignCoreThemeTerms(rule),
    CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
  );
  const searches = [];

  // Use the analysis/plan-created website queries first and preserve each useful
  // phrase as one query. This prevents “roliga tryck” from becoming separate
  // searches for “roliga” and “tryck”, and prevents full campaign goals from
  // consuming the limited store-search budget.
  for (const query of dedicatedQueries) {
    addCampaignSearchVariants(searches, query);
  }

  for (const term of [...coreThemeTerms, ...explicitTerms]) {
    addCampaignSearchVariants(searches, term);
  }

  return Array.from(new Set(searches.filter(Boolean))).slice(
    0,
    CAMPAIGN_STORE_SEARCH_QUERY_LIMIT
  );
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

  // Give every distinct query one primary search attempt before trying
  // alternate URL formats. The previous pair-per-query ordering meant the
  // fetch cap could stop after only the first half of the query list.
  for (const { encoded } of queryParts) {
    urls.push(`${origin}/search?q=${encoded}`);
  }

  for (const { encoded } of queryParts) {
    urls.push(`${origin}/search?type=product&q=${encoded}`);
  }

  for (const { encoded, slug } of queryParts) {
    urls.push(
      `${origin}/search?options[prefix]=last&q=${encoded}`,
      `${origin}/search?query=${encoded}`,
      `${origin}/search?s=${encoded}`,
      `${origin}/sok?q=${encoded}`,
      `${origin}/sok?query=${encoded}`,
      `${origin}/s%C3%B6k?q=${encoded}`,
      `${origin}/catalogsearch/result/?q=${encoded}`,
      `${origin}/search-results?search_query=${encoded}`,
      `${origin}/?s=${encoded}&post_type=product`,
      `${origin}/collections/all?constraint=${slug}`
    );
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
  const queries = buildStoreSearchQueries(campaignPrompt).slice(0, 6);
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

  candidates.push(
    ...(await discoverShopifySearchSuggest({
      websiteUrl,
      campaignPrompt,
    }))
  );

  let searchUrls = buildStoreSearchUrls(websiteUrl, campaignPrompt);

  try {
    const homeHtml = await fetchHtml(websiteUrl);
    const formSearchUrls = extractSearchFormUrlsFromHtml({
      html: homeHtml,
      pageUrl: websiteUrl,
      campaignPrompt,
    }).slice(0, CAMPAIGN_SEARCH_FORM_URL_LIMIT);

    searchUrls = [
      ...formSearchUrls,
      ...searchUrls,
    ];
  } catch (error) {
    console.log("Could not inspect store search forms", {
      websiteUrl,
      message: error.message,
    });
  }

  for (const searchUrl of Array.from(new Set(searchUrls)).slice(0, WEBSITE_STORE_SEARCH_FETCH_LIMIT)) {
    try {
      const html = await fetchHtml(searchUrl);
      const searchCandidates = extractProductLinksFromDiscoveryPage({
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

      candidates.push(...searchCandidates);
    } catch (error) {
      console.log("Store search URL unavailable", {
        searchUrl,
        message: error.message,
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

async function discoverShopifyProductsJson({ websiteUrl, campaignPrompt }) {
  const origin = getWebsiteOrigin(websiteUrl);

  if (!origin) {
    return [];
  }

  const discovered = [];

  for (let page = 1; page <= 3; page += 1) {
    const jsonUrl = `${origin}/products.json?limit=250&page=${page}`;

    try {
      const safeJsonUrl = await assertPublicHttpUrl(jsonUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
      const response = await fetch(safeJsonUrl, {
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
      const safeJsonUrl = await assertPublicHttpUrl(jsonUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
      const response = await fetch(safeJsonUrl, {
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
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, fastCampaignContinuation ? 45 : WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT);
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
    } catch (error) {
      console.log("Could not verify discovered product catalog candidate", {
        productUrl: candidate?.url,
        message: error.message,
      });
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

  if (!normalizedItem || !isValidCarouselProduct(normalizedItem)) {
    return null;
  }

  const enrichedItem = {
    ...item,
    ...normalizedItem,
    reason: item?.reason || "",
    source_page_url: item?.source_page_url || item?.source_search_url || "",
    source_search_url: item?.source_search_url || item?.source_page_url || "",
    campaign_fit_source: item?.campaign_fit_source || "campaign_search_pool",
  };

  return {
    ...enrichedItem,
    item_key: createItemKey(enrichedItem),
    selection_priority: Math.max(Number(item?.selection_priority || 0), selectionPriority),
    discovery_score: Math.max(
      Number(item?.discovery_score || 0),
      Number(item?.score || 0)
    ),
    campaign_fit_score: scoreCampaignFitForRule(enrichedItem, rule) + scoreBonus,
  };
}

function buildCampaignSearchPoolItems({
  verifiedItems,
  websiteUrl,
  rule,
  selectionPriority = 180,
  scoreBonus = 0,
}) {
  // Store-search cards are discovery hints, not verified campaign products.
  // Only concrete product pages that were fetched, verified and individually
  // evaluated may enter the relevance-first selection pool. Raw cards can have
  // attractive images/prices while the underlying result page is unrelated.
  return dedupeWebsiteItemsByUrlTitleAndImage(
    (verifiedItems || [])
      .filter((item) => item?.product_page_verified)
      .filter((item) => getAiCampaignFitScore(item) !== null)
      .filter((item) => !isExplicitCampaignFitRejected(item))
      .map((item) =>
        normalizeCampaignSearchPoolItem(item, websiteUrl, rule, {
          selectionPriority: Math.max(selectionPriority, 190),
          scoreBonus: scoreBonus + 10,
        })
      )
      .filter(Boolean)
  );
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
  const productSearchQueries = splitCampaignTermLine(rule?.product_search_queries).slice(0, CAMPAIGN_STORE_SEARCH_QUERY_LIMIT);
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
- Classify the campaign before searching: named theme/occasion, recipient/gift occasion, seasonal need/style, commercial promotion, category/product launch, identity/awareness or another suitable mode.
- First search the customer site for category, collection, campaign, search-result or landing pages that match the campaign/theme/occasion in the site's own language.
- Open the most relevant campaign/theme/category area and identify concrete product pages from there.
- For motif/title-led stores plus a named theme, try standalone motifs, symbols, characters, synonyms and title-like phrases before repeating generic product types.
- For recipient/gift occasions, search recipient names, relationships and title-like phrases that products may actually contain.
- For commercial promotions, do not search for merchandise depicting the promotion name; search real hero categories, popular product families and strong assortment areas.
- For seasonal campaigns, search the season's needs, styles, materials, activities and use cases.
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
  fitMinimumStrongProducts = CAROUSEL_MIN_PRODUCT_SLIDES,
}) {
  const attempts = ["best_match", "domain_site_search", "backup_broad"];
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
          price: websiteItem.price || null,
          priceSource: websiteItem.price_source || null,
          priceConfidence: websiteItem.price_confidence || null,
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

  const websiteUrl = getWebsiteProductSourceUrl(brandProfile, rule);
  const contentSourceScope = getRuleContentSourceScope(rule);
  const contentType = rule.content_type_id || "website_item";
  const productIntentScoped = isProductIntentScopedWebsiteRule(rule);

  if (!websiteUrl) {
    throw new Error("This automation requires a website URL in Brand profile");
  }

  if (contentSourceScope === "exact_product") {
    const exactProduct = await extractProductDataFromProductPage({
      productUrl: websiteUrl,
      websiteUrl,
      webSearchProduct: {
        title: rule.content_source_title || "",
        reason: "Customer selected this exact product URL.",
        source_page_url: websiteUrl,
        campaign_fit_source: "customer_selected_exact_product",
      },
    });

    if (!exactProduct?.url || !exactProduct?.title) {
      throw new Error("The exact product URL could not be verified as a usable product page.");
    }

    await upsertWebsiteProductCatalogItems({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      items: [exactProduct],
      discoverySource: "customer_selected_exact_product",
    });

    summary.website_items_found += 1;
    summary.website_content_success += 1;

    return {
      websiteItem: exactProduct,
      websiteSourceUrl: websiteUrl,
      websiteCycleNumber: 1,
      useWebsiteImage: Boolean(exactProduct.image_url),
      websiteRule: rule,
    };
  }

  const recentUsedItems = await getRecentUsedWebsiteItems({
    supabase,
    userId: rule.user_id,
    brandProfileId: rule.brand_profile_id,
    sourceUrl: websiteUrl,
    contentType,
    limit: WEBSITE_PRODUCT_REUSE_LIMIT,
  });

  if (contentSourceScope === "product_category" || contentSourceScope === "focus_page") {
    let focusedCategoryItems = await discoverProductsFromFocusedCategory({
      categoryUrl: websiteUrl,
      rule,
      limit: WEBSITE_TEXT_INTENT_STORE_VERIFY_LIMIT,
    });

    if (productIntentScoped && focusedCategoryItems.length) {
      focusedCategoryItems = await applyAiCampaignFitScores({
        openai,
        rule,
        brandProfile,
        items: focusedCategoryItems,
        maxItems: WEBSITE_TEXT_INTENT_STORE_VERIFY_LIMIT,
        model: PRODUCT_RESEARCH_FAST_MODEL,
        minimumStrongProducts: 1,
      });
    }

    const focusedSelection = await chooseUnusedWebsiteItem({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      contentType,
      items: focusedCategoryItems,
      rule,
      usedWebsiteImageUrlsThisRun,
      recentUsedItems,
      allowReuseWhenExhausted: true,
    });

    if (!focusedSelection?.item) {
      throw new Error(
        "No verified product could be selected from the customer-selected category or page. Spreelo will not search outside it."
      );
    }

    await upsertWebsiteProductCatalogItems({
      supabase,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      sourceUrl: websiteUrl,
      items: [focusedSelection.item],
      discoverySource: "customer_selected_category",
    });

    summary.website_items_found += 1;
    summary.website_content_success += 1;

    return {
      websiteItem: focusedSelection.item,
      websiteSourceUrl: websiteUrl,
      websiteCycleNumber: focusedSelection.cycleNumber,
      useWebsiteImage: focusedSelection.useWebsiteImage,
      websiteRule: rule,
    };
  }

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
  const authorizedOffer = getAuthorizedCampaignOffer(rule);
  const offerVisualRule = authorizedOffer
    ? `Show the exact authorized discount and campaign code from this offer as clear readable overlay text: ${authorizedOffer} Never change or invent any value.`
    : "Do not show prices or discount claims.";

  return `Create a premium square closing slide for a social media carousel. This is the final CTA slide after product slides for ${brandName}. Use a clean, polished marketing design with a subtle modern background and clear readable text overlay. Write the overlaid text in ${language}. Main overlay text: "${headline}". Supporting overlay text: "${supportingText}". ${campaignVisualContext}. ${offerVisualRule} If this carousel is connected to a campaign, holiday, season, shopping event or theme, the closing image must clearly match that theme and must not look generic or unrelated. The slide should feel like a professional final call-to-action and may use abstract shapes, elegant composition, soft shadows, geometric shapes, or a tasteful category-inspired scene. If you include any product-like objects, they must be generic, unbranded, non-specific, and not directly identifiable as exact products from the store. Never invent or depict specific catalog items, exact product prints, poster motifs, readable slogan text on products, apparel graphics, packaging artwork, or branded product designs. Do not place the store name or brand logo onto any depicted product. Avoid close-up hero shots of a single product. For stores that sell printed or text-based products such as posters, apparel, mugs, or accessories, do not generate new readable product text or new product artwork. Keep all non-overlay product details subtle, generic, and secondary to the CTA message. Do not use crowded text. Products featured earlier in the carousel: ${productNames || "selected website products"}.`;
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

${formatAuthorizedCampaignOfferForPrompt(rule)}

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
- If an exact authorized campaign offer is provided, make the final outro slide clearly show its exact discount and campaign code. Do not alter the values.

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

function websiteTextContainsAny(value, keywords = []) {
  const haystack = String(value || "").toLowerCase();
  return keywords.some((keyword) => haystack.includes(String(keyword || "").toLowerCase()));
}

function getWebsiteItemAdLayoutSeed(rule, postContent) {
  return [
    rule?.website_item?.item_key,
    rule?.website_item?.url,
    rule?.website_item?.title,
    rule?.brand_profile?.business_name,
    postContent,
  ]
    .filter(Boolean)
    .join(" | ");
}

function getDeterministicLayoutIndex(seed, count) {
  const safeCount = Math.max(1, Number(count || 1));
  const source = String(seed || "layout-seed");
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % safeCount;
}

function selectWebsiteItemAdLayoutFamily(rule, postContent) {
  const item = rule?.website_item || {};
  const productContext = [
    item?.title,
    item?.description,
    rule?.prompt,
    rule?.image_prompt,
    postContent,
    rule?.brand_profile?.business_name,
    rule?.brand_profile?.industry,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const seed = getWebsiteItemAdLayoutSeed(rule, postContent);

  const layoutFamilies = {
    feature_split: {
      key: "feature_split",
      name: "Feature split",
      instruction:
        "Use a structured ad layout with the product and text separated into clear zones. The product can be on the right or left. Use one strong headline, one short supporting line, up to 3 short callouts, and a clear CTA. This is the most practical feature-led layout.",
    },
    minimal_product_spotlight: {
      key: "minimal_product_spotlight",
      name: "Minimal product spotlight",
      instruction:
        "Let the product dominate the design with lots of negative space. Use a concise headline, very little extra copy, and a subtle CTA/domain. Avoid bullet lists unless absolutely necessary.",
    },
    bold_promo: {
      key: "bold_promo",
      name: "Bold promo",
      instruction:
        "Use a high-energy, attention-grabbing poster-like layout with bold typography and dramatic scale. Keep the copy short and impactful. Use at most 1 or 2 short callouts, not a dense feature list.",
    },
    premium_editorial: {
      key: "premium_editorial",
      name: "Premium editorial",
      instruction:
        "Use an elegant editorial style with generous spacing, refined typography, and a premium feel. Focus on polish rather than features. Avoid bullet lists and keep the copy minimal.",
    },
    lifestyle_focus: {
      key: "lifestyle_focus",
      name: "Lifestyle focus",
      instruction:
        "Use a more contextual or lifestyle-driven composition while keeping the exact product clearly recognizable. Text should be secondary and concise. Avoid forcing a structured three-point list unless truly helpful.",
    },
    playful_story: {
      key: "playful_story",
      name: "Playful story",
      instruction:
        "Use a fun, colorful composition tailored to festive, kid-friendly, costume, candy, or novelty items. Text can be lively but still brief. Use up to 2 or 3 short badges only if helpful.",
    },
  };

  const pickFrom = (keys) => {
    const safeKeys = keys.filter((key) => layoutFamilies[key]);
    return layoutFamilies[safeKeys[getDeterministicLayoutIndex(seed, safeKeys.length)]];
  };

  if (websiteTextContainsAny(productContext, [
    "halloween", "karneval", "carnival", "costume", "kostym", "maskerad", "party", "fest", "kids", "barn", "toy", "leksak", "candy", "godis", "cookie", "novelty", "sesam", "krümel", "monster"
  ])) {
    return pickFrom(["playful_story", "bold_promo"]);
  }

  if (websiteTextContainsAny(productContext, [
    "band", "rock", "metal", "music", "merch", "vinyl", "album", "punk", "concert", "mezmerize", "system of a down"
  ])) {
    return pickFrom(["bold_promo", "feature_split"]);
  }

  if (websiteTextContainsAny(productContext, [
    "skincare", "beauty", "serum", "cream", "cosmetic", "perfume", "parfum", "watch", "jewelry", "smycke", "luxury", "premium"
  ])) {
    return pickFrom(["premium_editorial", "minimal_product_spotlight"]);
  }

  if (websiteTextContainsAny(productContext, [
    "hoodie", "t-shirt", "tee", "shirt", "sweatshirt", "sweater", "apparel", "clothing", "fashion", "kläder", "tröja", "dress", "klänning"
  ])) {
    return pickFrom(["minimal_product_spotlight", "feature_split", "lifestyle_focus"]);
  }

  if (websiteTextContainsAny(productContext, [
    "home", "decor", "interior", "furniture", "outdoor", "sport", "fitness", "kitchen", "travel", "bag", "backpack"
  ])) {
    return pickFrom(["lifestyle_focus", "minimal_product_spotlight", "feature_split"]);
  }

  return pickFrom([
    "feature_split",
    "minimal_product_spotlight",
    "bold_promo",
    "premium_editorial",
    "lifestyle_focus",
  ]);
}

function buildWebsiteItemAdImagePrompt(rule, postContent) {
  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const websiteItemText = formatWebsiteItemForPrompt(rule.website_item);
  const customVisualDirection = String(rule?.image_prompt || "").trim();
  const selectedLayoutFamily = selectWebsiteItemAdLayoutFamily(rule, postContent);

  return `
Create one high-quality portrait 4:5 social media ad image using the provided product photo as the visual reference for the exact product.

Brand profile:
${brandProfileText}

Selected website item:
${websiteItemText}

Platform: ${rule.platform || "Facebook"}
Tone: ${rule.tone || "Professional"}
Language context: ${rule.language || "Auto"}
Website URL: ${rule.brand_profile?.website_url || "Not provided"}

${formatCampaignVisualContextForPrompt(rule)}

Selected ad layout family:
${selectedLayoutFamily?.name || "Feature split"}

Layout family instruction:
${selectedLayoutFamily?.instruction || "Use a clear product-focused ad layout with concise text and a strong CTA."}

User's post instruction:
${rule.prompt || "Not provided"}

Final post text this image should support:
${postContent || "Not provided"}

${customVisualDirection ? `Customer's visual direction:
${customVisualDirection}` : "No extra custom visual direction was provided."}

Rules:
- The provided product image is the real product reference. Keep the product clearly recognizable.
- Preserve the product's core identity, silhouette, dominant colors, print/design, and overall appearance.
- Preserve the exact visible product color from the verified source image.
- Do not recolor the product or create a new color variant that is not verified.
- If multiple colors exist on the website, still keep the exact source-image color unless a different verified color is explicitly selected.
- When uncertain, keep the exact source-image color and appearance.
- Build a unique ad-style composition around that product so the final result feels custom-made for this exact item.
- Follow the selected ad layout family above. Do not default to the same left-text/right-product feature-list layout unless that is the selected family.
- Let the chosen layout family influence the composition, text placement, product scale, and overall mood so different products can receive different visual treatments.
- Include readable marketing text in the image.
- Write all added marketing text in the selected post language.
- Use the exact verified product name when it appears in the image; do not rename the product.
- Preserve existing printed words or graphics on the product as accurately as possible.
- Keep the layout clean, simple, and spacious with fewer text elements and larger typography.
- Use one strong headline, one very short supporting line, and one short CTA.
- You may add up to 3 very short callout points or badges only if they are clearly supported by the website item and if they fit the selected layout family.
- If the selected layout family is more minimal, premium, or lifestyle-focused, prefer fewer callouts or no callouts at all.
- Do not write long paragraphs, dense body copy, or small filler text.
- Do not place compact text blocks, dense info cards, or small packed text boxes in the design.
- If callout boxes or badges are used, keep them short, bold, and easy to read, with one idea per element.
- Keep all added marketing text brief and highly legible on mobile. Prioritize bigger text over more text.
- Keep the total amount of added non-product text low.
- Do not include product prices, ratings, review stars or fake urgency. If an exact authorized customer-supplied campaign offer is provided above, show its discount and campaign code exactly as written; otherwise do not include discounts.
- Do not invent features, materials, delivery promises, guarantees, or claims that are not supported by the website item or post text.
- Keep the text concise, polished, and easy to read on social media.
- Do not add watermarks.
- Do not add unrelated UI or app screens.
- Avoid a generic template look; tailor the background, styling, and mood to this exact product.
- The image should feel premium and ready for a Facebook or Instagram feed post.

Output only the image.
`.trim();
}

async function generateWebsiteItemAdImage(openai, rule, postContent) {
  const sourceImageUrl = rule?.website_item?.image_url;

  if (!sourceImageUrl) {
    throw new Error("Website Text + Ad requires a verified website product image");
  }

  const prompt = buildWebsiteItemAdImagePrompt(rule, postContent);
  const sourceImageBuffer = await fetchImageBufferForOverlay(sourceImageUrl);
  const normalizedSourceImageBuffer = await sharp(sourceImageBuffer)
    .rotate()
    .resize({
      width: 1536,
      height: 1536,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const referenceFile = await toFile(
    normalizedSourceImageBuffer,
    "website-product-reference.png",
    { type: "image/png" }
  );

  const response = await openai.images.edit({
    model: IMAGE_MODEL,
    image: referenceFile,
    prompt,
    size: "1024x1280",
    quality: "medium",
  });

  const imageBase64 = response?.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI website ad image generation returned empty image data");
  }

  return {
    imageBase64,
    imagePrompt: prompt,
  };
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

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => clampColorChannel(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixRgb(color, target, amount) {
  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));

  return {
    r: color.r + (target.r - color.r) * ratio,
    g: color.g + (target.g - color.g) * ratio,
    b: color.b + (target.b - color.b) * ratio,
  };
}

async function getProductAccentColor(imageBuffer) {
  const fallbackStats = await sharp(imageBuffer).rotate().stats();
  const fallback = fallbackStats?.dominant || { r: 70, g: 85, b: 110 };
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .ensureAlpha()
    .resize({
      width: 96,
      height: 96,
      fit: "inside",
      withoutEnlargement: false,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = new Map();

  for (let index = 0; index < data.length; index += info.channels) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = info.channels > 3 ? data[index + 3] : 255;

    if (alpha < 100) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const brightness = (r + g + b) / 3;

    // Ignore transparent, white-background and near-black edge pixels so the
    // generated design follows the product itself rather than its photo canvas.
    if (brightness > 242 || brightness < 18) continue;
    if (saturation < 14 && brightness > 175) continue;

    const key = `${Math.floor(r / 32)}-${Math.floor(g / 32)}-${Math.floor(b / 32)}`;
    const entry = bins.get(key) || {
      count: 0,
      saturationTotal: 0,
      rTotal: 0,
      gTotal: 0,
      bTotal: 0,
    };

    entry.count += 1;
    entry.saturationTotal += saturation;
    entry.rTotal += r;
    entry.gTotal += g;
    entry.bTotal += b;
    bins.set(key, entry);
  }

  const ranked = [...bins.values()]
    .map((entry) => {
      const averageSaturation = entry.saturationTotal / entry.count;

      return {
        ...entry,
        score: entry.count * (1 + averageSaturation / 110),
      };
    })
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0];

  if (!selected || selected.count < 3) {
    return fallback;
  }

  return {
    r: selected.rTotal / selected.count,
    g: selected.gTotal / selected.count,
    b: selected.bTotal / selected.count,
  };
}

function getAnimatedProductBrightness(dominant) {
  const brightness = ((Number(dominant?.r) || 0) + (Number(dominant?.g) || 0) + (Number(dominant?.b) || 0)) / 3;
  if (brightness >= 178) return "light";
  if (brightness <= 82) return "dark";
  return "medium";
}

async function selectAnimatedVideoBackground({
  supabase,
  rule,
  dominantColor,
}) {
  const { data: assets, error: assetsError } = await supabase
    .from("video_background_assets")
    .select(
      "id, name, storage_path, public_url, poster_storage_path, poster_url, family, moods, industries, campaigns, colors, brightness, energy, season, text_safe, logo_safe, crop_safe_916, active, is_fallback, priority, duration_seconds, times_used"
    )
    .eq("active", true)
    .eq("crop_safe_916", true);

  if (assetsError) {
    throw new Error(
      `Could not load the video background library. Run supabase/video_background_library.sql first. ${assetsError.message}`
    );
  }

  if (!assets?.length) {
    throw new Error(
      "No active 9:16 background is available. Upload at least one background in Video backgrounds before creating an animated product Reel."
    );
  }

  const { data: recentUsage, error: recentError } = await supabase
    .from("posts")
    .select("video_background_asset_id, video_background_family, created_at")
    .eq("brand_profile_id", rule?.brand_profile?.id || rule?.brand_profile_id)
    .not("video_background_asset_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);

  if (recentError) {
    console.warn("Could not load recent background usage", {
      brandProfileId: rule?.brand_profile?.id || rule?.brand_profile_id || null,
      message: recentError.message,
    });
  }

  const profile = buildVideoBackgroundProfile({
    rule,
    dominantColor,
    productBrightness: getAnimatedProductBrightness(dominantColor),
  });
  const selected = chooseVideoBackground({
    assets,
    profile,
    recentUsage: recentUsage || [],
  });

  if (!selected?.asset) {
    throw new Error("Spreelo could not select a suitable active video background.");
  }

  return {
    asset: selected.asset,
    profile,
    score: selected.score,
    usedFallback: selected.usedFallback,
    reasons: selected.reasons,
    topCandidates: (selected.ranked || []).slice(0, 5).map((candidate) => ({
      id: candidate.asset?.id,
      name: candidate.asset?.name,
      family: candidate.asset?.family,
      score: candidate.score,
    })),
  };
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function estimateCornerBackgroundColor(data, width, height) {
  const sampleSize = Math.max(10, Math.min(24, Math.floor(Math.min(width, height) * 0.05)));
  const corners = [
    { startX: 0, startY: 0 },
    { startX: Math.max(0, width - sampleSize), startY: 0 },
    { startX: 0, startY: Math.max(0, height - sampleSize) },
    {
      startX: Math.max(0, width - sampleSize),
      startY: Math.max(0, height - sampleSize),
    },
  ];
  let rTotal = 0;
  let gTotal = 0;
  let bTotal = 0;
  let count = 0;

  for (const corner of corners) {
    for (let y = corner.startY; y < Math.min(height, corner.startY + sampleSize); y += 1) {
      for (let x = corner.startX; x < Math.min(width, corner.startX + sampleSize); x += 1) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];
        if (alpha < 8) continue;
        rTotal += data[index];
        gTotal += data[index + 1];
        bTotal += data[index + 2];
        count += 1;
      }
    }
  }

  if (!count) {
    return { r: 245, g: 245, b: 245 };
  }

  return {
    r: Math.round(rTotal / count),
    g: Math.round(gTotal / count),
    b: Math.round(bTotal / count),
  };
}

function findAlphaBounds(alphaChannel, width, height, threshold = 24) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = alphaChannel[y * width + x];
      if (alpha < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const padding = 12;
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);

  return {
    left,
    top,
    width: Math.max(1, right - left + 1),
    height: Math.max(1, bottom - top + 1),
  };
}


function getCornerBackgroundStats(data, width, height) {
  const sampleSize = Math.max(10, Math.min(28, Math.floor(Math.min(width, height) * 0.05)));
  const corners = [
    { left: 0, top: 0 },
    { left: Math.max(0, width - sampleSize), top: 0 },
    { left: 0, top: Math.max(0, height - sampleSize) },
    { left: Math.max(0, width - sampleSize), top: Math.max(0, height - sampleSize) },
  ];
  const averages = corners.map((corner) => {
    let rTotal = 0;
    let gTotal = 0;
    let bTotal = 0;
    let count = 0;
    for (let y = corner.top; y < Math.min(height, corner.top + sampleSize); y += 1) {
      for (let x = corner.left; x < Math.min(width, corner.left + sampleSize); x += 1) {
        const index = (y * width + x) * 4;
        if (data[index + 3] < 8) continue;
        rTotal += data[index];
        gTotal += data[index + 1];
        bTotal += data[index + 2];
        count += 1;
      }
    }
    return count
      ? {
          r: Math.round(rTotal / count),
          g: Math.round(gTotal / count),
          b: Math.round(bTotal / count),
        }
      : { r: 245, g: 245, b: 245 };
  });
  const background = {
    r: Math.round(averages.reduce((sum, color) => sum + color.r, 0) / averages.length),
    g: Math.round(averages.reduce((sum, color) => sum + color.g, 0) / averages.length),
    b: Math.round(averages.reduce((sum, color) => sum + color.b, 0) / averages.length),
  };
  let maximumDistance = 0;
  for (let first = 0; first < averages.length; first += 1) {
    for (let second = first + 1; second < averages.length; second += 1) {
      const a = averages[first];
      const b = averages[second];
      maximumDistance = Math.max(
        maximumDistance,
        Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
      );
    }
  }
  return { background, maximumDistance, averages };
}

function getAlphaEdgeRatio(alphaChannel, width, height, threshold = 48) {
  const edgeSize = Math.max(3, Math.round(Math.min(width, height) * 0.025));
  let visible = 0;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x >= edgeSize &&
        x < width - edgeSize &&
        y >= edgeSize &&
        y < height - edgeSize
      ) {
        continue;
      }
      area += 1;
      if (alphaChannel[y * width + x] >= threshold) visible += 1;
    }
  }
  return area ? visible / area : 0;
}

async function prepareAnimatedProductCutout(sourceImageBuffer) {
  const normalized = await sharp(sourceImageBuffer)
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { data, info } = await sharp(normalized)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const originalAlphaChannel = Buffer.alloc(pixelCount);
  let transparentPixelCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const alpha = data[pixel * 4 + 3];
    originalAlphaChannel[pixel] = alpha;
    if (alpha < 245) transparentPixelCount += 1;
  }

  const existingTransparencyRatio = pixelCount
    ? transparentPixelCount / pixelCount
    : 0;

  if (existingTransparencyRatio >= 0.005) {
    const existingBounds = findAlphaBounds(
      originalAlphaChannel,
      info.width,
      info.height,
      18
    );
    if (!existingBounds) {
      throw new Error("Product image transparency contained no visible product");
    }
    const boundsAreaRatio =
      (existingBounds.width * existingBounds.height) / Math.max(1, pixelCount);
    const edgeVisibleRatio = getAlphaEdgeRatio(
      originalAlphaChannel,
      info.width,
      info.height,
      48
    );
    if (boundsAreaRatio > 0.97 && edgeVisibleRatio > 0.22) {
      throw new Error("Product image still contained a full rectangular background");
    }
    return {
      cutoutBuffer: await sharp(normalized).extract(existingBounds).png().toBuffer(),
      score: 210 - boundsAreaRatio * 30 - edgeVisibleRatio * 40,
      analysis: {
        mode: "existing_transparency",
        existingTransparencyRatio,
        boundsAreaRatio,
        edgeVisibleRatio,
      },
    };
  }

  const cornerStats = getCornerBackgroundStats(data, info.width, info.height);
  if (cornerStats.maximumDistance > 62) {
    throw new Error(
      `Product image background was too complex to remove safely (corner distance ${Math.round(cornerStats.maximumDistance)})`
    );
  }

  const background = cornerStats.background;
  const rgba = Buffer.alloc(pixelCount * 4);
  const alphaChannel = Buffer.alloc(pixelCount);
  const fadeStart = 14;
  const fadeEnd = 62;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const originalAlpha = data[index + 3];
    const distance = Math.sqrt(
      (r - background.r) ** 2 + (g - background.g) ** 2 + (b - background.b) ** 2
    );
    let alpha = originalAlpha;
    if (distance <= fadeStart) {
      alpha = 0;
    } else if (distance < fadeEnd) {
      alpha = Math.min(
        originalAlpha,
        Math.max(0, Math.round(((distance - fadeStart) / (fadeEnd - fadeStart)) * 255))
      );
    }
    rgba[index] = r;
    rgba[index + 1] = g;
    rgba[index + 2] = b;
    rgba[index + 3] = alpha;
    alphaChannel[pixel] = alpha;
  }

  const bounds = findAlphaBounds(alphaChannel, info.width, info.height, 28);
  if (!bounds) {
    throw new Error("Product image background removal left no visible product");
  }

  let stronglyVisiblePixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (alphaChannel[pixel] >= 180) stronglyVisiblePixels += 1;
  }
  const stronglyVisibleRatio = pixelCount
    ? stronglyVisiblePixels / pixelCount
    : 0;
  const boundsAreaRatio = (bounds.width * bounds.height) / Math.max(1, pixelCount);
  const edgeVisibleRatio = getAlphaEdgeRatio(alphaChannel, info.width, info.height, 48);

  if (stronglyVisibleRatio < 0.08) {
    throw new Error("Product image background removal removed too much of the product");
  }
  if (boundsAreaRatio > 0.93 || edgeVisibleRatio > 0.08) {
    throw new Error("Product image still contained a visible rectangular or lifestyle background");
  }

  const cutoutBuffer = await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .extract(bounds)
    .png()
    .toBuffer();

  return {
    cutoutBuffer,
    score:
      150 -
      cornerStats.maximumDistance * 0.7 -
      boundsAreaRatio * 25 -
      edgeVisibleRatio * 80,
    analysis: {
      mode: "uniform_background_cutout",
      backgroundColor: rgbToHex(background),
      maximumCornerDistance: cornerStats.maximumDistance,
      stronglyVisibleRatio,
      boundsAreaRatio,
      edgeVisibleRatio,
    },
  };
}

async function extractAnimatedProductCutout(sourceImageBuffer) {
  const prepared = await prepareAnimatedProductCutout(sourceImageBuffer);
  return prepared.cutoutBuffer;
}

function animatedImageAltMatchesProduct(alt, title) {
  const altText = normalizeSearchText(alt || "");
  const titleTokens = normalizeSearchText(title || "")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  if (!altText || !titleTokens.length) return false;
  const matches = titleTokens.filter((token) => altText.includes(token)).length;
  return matches >= Math.min(2, titleTokens.length);
}

async function collectAnimatedProductImageCandidates(websiteItem) {
  const candidates = [];
  const seen = new Set();
  const add = (url, metadata = {}) => {
    const resolved = resolveUrl(url, websiteItem?.url || url);
    if (!resolved || !isHttpUrl(resolved) || isBadProductImageUrl(resolved)) return;
    const key = normalizeComparableValue(resolved);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ url: resolved, ...metadata });
  };

  add(websiteItem?.image_url, { source: "selected_product_image", identityScore: 120 });

  if (websiteItem?.url && isHttpUrl(websiteItem.url)) {
    try {
      const html = await fetchHtml(websiteItem.url);
      const jsonLdProduct = findBestJsonLdProduct(
        html,
        websiteItem.url,
        websiteItem?.title || ""
      );
      add(getProductImageFromJsonLd(jsonLdProduct, websiteItem.url), {
        source: "product_json_ld",
        identityScore: 105,
      });
      const ogImage = getMetaContent(html, ["og:image", "twitter:image"]);
      add(ogImage, { source: "product_meta_image", identityScore: 90 });

      for (const image of extractImageCandidates(html, websiteItem.url).slice(0, 60)) {
        const identityMatch =
          imageUrlMatchesProductIdentity(
            image.url,
            websiteItem.url,
            websiteItem?.title || ""
          ) || animatedImageAltMatchesProduct(image.alt, websiteItem?.title || "");
        if (!identityMatch) continue;
        add(image.url, {
          source: image.source || "product_gallery",
          identityScore: 95 + Number(image.score || 0),
          alt: image.alt || "",
        });
      }
    } catch (error) {
      console.warn("Could not inspect product gallery for a clean animated product image", {
        productUrl: websiteItem?.url || null,
        message: error?.message,
      });
    }
  }

  return candidates
    .sort((left, right) => Number(right.identityScore || 0) - Number(left.identityScore || 0))
    .slice(0, 12);
}

async function selectAnimatedProductImage(websiteItem) {
  const candidates = await collectAnimatedProductImageCandidates(websiteItem);
  const accepted = [];
  const rejected = [];

  for (const candidate of candidates.slice(0, 9)) {
    try {
      const sourceImageBuffer = await fetchImageBufferForOverlay(candidate.url);
      const prepared = await prepareAnimatedProductCutout(sourceImageBuffer);
      const metadata = await sharp(prepared.cutoutBuffer).metadata();
      const resolutionScore = Math.min(
        24,
        (Number(metadata.width || 0) * Number(metadata.height || 0)) / 70000
      );
      accepted.push({
        ...candidate,
        sourceImageBuffer,
        cutoutBuffer: prepared.cutoutBuffer,
        analysis: prepared.analysis,
        score: Number(candidate.identityScore || 0) + Number(prepared.score || 0) + resolutionScore,
      });
    } catch (error) {
      rejected.push({
        url: candidate.url,
        source: candidate.source,
        message: error?.message,
      });
    }
  }

  accepted.sort((left, right) => right.score - left.score);
  const selected = accepted[0];
  if (!selected) {
    console.warn("Animated product image candidates rejected", {
      productUrl: websiteItem?.url || null,
      rejected: rejected.slice(0, 8),
    });
    throw new Error(
      "No clean product image with a removable or transparent background was available for this animated Reel"
    );
  }

  console.log("Animated product image selected", {
    productUrl: websiteItem?.url || null,
    imageUrl: selected.url,
    source: selected.source,
    score: Number(selected.score.toFixed(2)),
    analysis: selected.analysis,
    rejectedCount: rejected.length,
  });

  return selected;
}

function getAnimatedOverlayChromaCandidates(dominantColor) {
  const productColor = dominantColor || { r: 70, g: 85, b: 110 };
  const candidates = [
    {
      name: "pure magenta",
      hex: "#FF00FF",
      rgb: { r: 255, g: 0, b: 255 },
      forbidden: "magenta, fuchsia, pink-purple or violet close to the chroma color",
    },
    {
      name: "pure green",
      hex: "#00FF00",
      rgb: { r: 0, g: 255, b: 0 },
      forbidden: "neon green, lime or yellow-green close to the chroma color",
    },
    {
      name: "pure cyan",
      hex: "#00FFFF",
      rgb: { r: 0, g: 255, b: 255 },
      forbidden: "cyan, aqua or turquoise close to the chroma color",
    },
  ];

  return candidates
    .map((candidate) => ({
      ...candidate,
      distance: Math.sqrt(
        (candidate.rgb.r - Number(productColor.r || 0)) ** 2 +
          (candidate.rgb.g - Number(productColor.g || 0)) ** 2 +
          (candidate.rgb.b - Number(productColor.b || 0)) ** 2
      ),
    }))
    .sort((left, right) => right.distance - left.distance);
}

function chooseAnimatedOverlayChroma(dominantColor) {
  return getAnimatedOverlayChromaCandidates(dominantColor)[0];
}

function getAnimatedOverlayThemeContext(rule, postContent) {
  return [
    rule?.campaign_name,
    rule?.campaign_phase,
    rule?.campaign_goal,
    rule?.content_type_label,
    rule?.prompt,
    postContent,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(" | ");
}

function buildAnimatedTextOverlayPrompt({
  rule,
  postContent,
  backgroundAsset,
  backgroundBrightness,
  dominantColor,
  chromaKey,
  attempt = 1,
}) {
  const websiteItem = rule?.website_item || {};
  const brand = rule?.brand_profile || {};
  const title = truncateText(
    sanitizeProductTitleForCard(
      websiteItem?.title || rule?.content_type_label || "Featured product"
    ) || "Featured product",
    110
  );
  const effectiveBackgroundBrightness = String(
    backgroundBrightness || backgroundAsset?.brightness || ""
  ).toLowerCase();
  const backgroundDescription = [
    backgroundAsset?.family,
    ...(backgroundAsset?.moods || []),
    ...(backgroundAsset?.colors || []),
    effectiveBackgroundBrightness,
  ]
    .filter(Boolean)
    .join(", ");
  const isDarkBackground = effectiveBackgroundBrightness === "dark";
  const contrastGuidance = isDarkBackground
    ? "Use bright premium high-contrast lettering such as warm ivory, champagne gold, soft silver, pale blue or one vivid accent. Do not use black, charcoal or very dark grey as the main title color."
    : "Use deep premium high-contrast lettering such as charcoal, dark navy, forest green, burgundy or one rich accent. Avoid very pale main lettering.";
  const contentLanguage =
    rule?.language || brand?.content_language || "the same language as the post";
  const productColorHex = rgbToHex(dominantColor || { r: 70, g: 85, b: 110 });
  const themeContext = truncateText(
    getAnimatedOverlayThemeContext(rule, postContent),
    850
  );
  const retryGuidance =
    attempt > 1
      ? `This is validation retry ${attempt}. Follow every zone boundary exactly, make the main title clearly visible, and keep the reserved product area completely empty. Every empty pixel, including all four corners and the complete space around the lettering, must remain the exact flat technical chroma color ${chromaKey.hex}. Do not add lighting, shadows, gradients, texture, a room, a wall, paper, fabric or any other background treatment.`
      : "";

  return `
Create a complete transparent-overlay design for a premium 9:16 product Reel.
The output is NOT the final ad. A real product will be placed later in the reserved center area and will zoom gently. Your design must frame that product without covering it.

Canvas and chroma background:
- Portrait 9:16 composition.
- Fill the entire canvas with one perfectly flat, uniform ${chromaKey.name} ${chromaKey.hex} background. It is a technical chroma color that Spreelo will remove afterward.
- No gradient, texture, vignette, shadow, pattern or object may appear in the chroma background.
- Never use ${chromaKey.forbidden} in any lettering or decorative detail.

Exact text:
- Write this exact product name without renaming or rewriting it:
"${title}"
- Do not write a product price, currency symbol, currency code or monetary amount.
- The product name must remain readable and correctly spelled.
- You may separate a descriptive suffix after a dash into a smaller secondary line, but do not omit or rewrite any words.

Unique marketing copy:
- In ${contentLanguage}, create one short, unique eyebrow of 2 to 5 words and one short supporting line of 3 to 8 words for this exact post.
- Base both lines only on the supplied product, caption and campaign context. Do not invent a feature, offer, price, discount, result or guarantee.
- Keep both lines clearly secondary to the exact product name. Do not copy hashtags, emojis or the full social caption.
- The wording and typographic treatment should feel created for this particular product rather than reused from another post.

Brand and visual context:
- Brand: ${brand?.business_name || "Not provided"}
- Product dominant color: ${productColorHex}
- Moving video background: ${backgroundDescription || "a premium neutral background"}
- Product/campaign/theme context: ${themeContext || "No additional theme context"}

MANDATORY SAFE-ZONE LAYOUT:
- TOP DESIGN ZONE: only the upper 4% to 14% of the canvas. Optional small brand name, category eyebrow, short part of the exact title, or restrained decoration may appear here.
- RESERVED PRODUCT ZONE: from 14% to 65% of the canvas height and from 9% to 91% of the canvas width. Keep this entire large center area completely empty. No text, brush stroke, border, glow, ornament, line or shadow may enter it.
- LOWER PREMIUM TEXT ZONE: from 66% to 83% of the canvas height and from 10% to 90% of the canvas width. The main product name must be clearly centered here.
- PLATFORM SAFE ZONE: the bottom 17% of the canvas must remain completely empty for Reel interface controls and captions.
- Keep generous left and right margins. Nothing may touch or approach the canvas edges.

Creative direction:
- Create a genuinely unique, premium treatment tailored to this product, its dominant color, the campaign/theme and the moving background. It must not look like a generic default template.
- Infer the visual language intelligently. For example, a Halloween product may use restrained eerie letterforms, a subtle scratched accent or a delicate cobweb detail; a festive product may use refined seasonal ornament; premium fashion may use editorial type; children’s products may use rounded playful premium lettering; a humorous statement product may use a bolder poster treatment.
- These are examples, not fixed templates. Choose the style that best fits this exact product.
- Use an elegant, highly legible display treatment: refined serif, modern geometric sans, condensed display, tasteful script accent, or a carefully balanced font pairing.
- Do not use plain Arial-like default typography.
- The main product name must be the visual focus and fit in one or two balanced lines.
- You may use one or two restrained premium devices such as a brush stroke, painterly swipe, thin linework, soft highlight shape, elegant underline, subtle seasonal ornament or small framing accent.
- Decorative elements must support the text, never compete with the product, and must stay inside the permitted top or lower zones.
- ${contrastGuidance}
- Use the product color as inspiration, not necessarily as the main text color. Choose complementary colors that remain readable over the described moving background.
- The word "T-shirt" must clearly read with a real capital T and unambiguous letterforms.
- No product image, logo, button, watermark, large panel or full-width opaque banner.
- Do not turn any text into a fake clickable button.
- The finished overlay remains static in the final video.
${retryGuidance}
`.trim();
}

function parseAnimatedTextPanelTitle(rawTitle) {
  const cleaned = truncateText(
    String(rawTitle || "Featured product").replace(/\s+/g, " ").trim(),
    110
  );
  const parts = cleaned
    .split(/\s+(?:[-\u2013\u2014|\u2022])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { mainTitle: cleaned, descriptor: "" };
  }

  return {
    mainTitle: parts[0],
    descriptor: parts.slice(1).join(" "),
  };
}

function buildAnimatedTextPanelPrompt({
  rule,
  postContent,
  backgroundAsset,
  backgroundBrightness,
  dominantColor,
  hasBackgroundReference,
  hasProductReference,
}) {
  const websiteItem = rule?.website_item || {};
  const brand = rule?.brand_profile || {};
  const rawTitle = truncateText(
    sanitizeProductTitleForCard(
      websiteItem?.title || rule?.content_type_label || "Featured product"
    ) || "Featured product",
    110
  );
  const { mainTitle, descriptor } = parseAnimatedTextPanelTitle(rawTitle);
  const secondaryLineContent = descriptor;
  const effectiveBackgroundBrightness = String(
    backgroundBrightness || backgroundAsset?.brightness || ""
  ).toLowerCase();
  const backgroundDescription = [
    backgroundAsset?.family,
    ...(backgroundAsset?.moods || []),
    ...(backgroundAsset?.colors || []),
    effectiveBackgroundBrightness,
  ]
    .filter(Boolean)
    .join(", ");
  const contentLanguage =
    rule?.language || brand?.content_language || "the same language as the post";
  const productColorHex = rgbToHex(dominantColor || { r: 70, g: 85, b: 110 });
  const themeContext = truncateText(
    stripDetectedPrices(getAnimatedOverlayThemeContext(rule, postContent)),
    850
  );
  const referenceGuidance = hasBackgroundReference && hasProductReference
    ? `- Reference image 1 is the actual moving-video poster. Use its palette, brightness and visual mood as design context only.\n- Reference image 2 is the actual product cutout. Use its color, category and visual character as design context only.`
    : hasProductReference
      ? "- Reference image 1 is the actual product cutout. Use its color, category and visual character as design context only."
      : hasBackgroundReference
        ? "- Reference image 1 is the actual moving-video poster. Use its palette, brightness and visual mood as design context only."
        : "- No visual reference image is available; use the written visual context below.";

  return `
Create only one finished horizontal typography card for a premium product Reel.
The returned image itself is the final visible card. Spreelo will keep every pixel of it and place it below a real product that zooms gently over a moving video background.

Visual references:
${referenceGuidance}
- Do not reproduce either reference image, and do not place the product or the background scene inside the card.

Canvas and permanent card:
- Wide horizontal ${ANIMATED_TEXT_PANEL_SOURCE_WIDTH} x ${ANIMATED_TEXT_PANEL_SOURCE_HEIGHT} composition.
- Fill the complete canvas edge to edge with one intentional opaque card background that visually harmonizes with the supplied product and moving background.
- Choose the card color intelligently: it may be a warm or cool neutral, a restrained complementary color, or a deep premium tone. It does not have to be white.
- A subtle paper, print or tonal texture is allowed when it improves the design, but the card must stay calm and highly legible.
- The complete background is an intentional part of the finished card. It will not be removed.
- Do not use transparency, chroma key, green screen, cyan screen, magenta screen, a room, a wall, a floor, a product photo or a background scene.
- Do not create a second card, inset mockup, photo frame or fake interface inside the canvas.

Product-name content:
- Main product name, with exact spelling and all words preserved: "${mainTitle}"
${secondaryLineContent
  ? `- Use exactly one clearly readable secondary line containing: "${secondaryLineContent}"`
  : `- Create at most one short secondary phrase of 2 to 4 words in ${contentLanguage}, based only on the supplied product and campaign context.`}
- Do not write a product price, currency symbol, currency code or monetary amount anywhere on the card.
- Treat separators from the source title as metadata separators, not as characters that must be printed.
- Never begin or end a line with a hyphen, dash, bullet, colon or other separator. Never print an isolated separator.
- You may choose capitalization and balanced line breaks, but do not rename, translate, omit, replace or invent a product-name word.
- Keep the main name dominant in one or two balanced lines.
- Use no more than two text blocks in the entire card: the large main headline and at most one secondary line above or below it.
- Do not create an eyebrow plus a supporting line. Do not add a third line of copy, fine print, slogan, caption, brand name or decorative pseudo-text.

Mobile Reel readability requirements:
- This design will be viewed primarily as a Facebook or Instagram Reel on a phone. Every word must remain immediately readable at small screen size.
- The main headline must occupy roughly 50 to 65 percent of the usable card height and be the unmistakable focal point.
- Render the main headline at the visual equivalent of approximately 112 to 168 px high on this ${ANIMATED_TEXT_PANEL_SOURCE_WIDTH} x ${ANIMATED_TEXT_PANEL_SOURCE_HEIGHT} canvas. If it needs two lines, keep both lines large and balanced.
- When a secondary line is used, render it at least 64 px high with normal readable spacing.
- Never render any text smaller than 58 px. No microcopy, tiny capitals, widely letter-spaced fine print or hairline lettering.
- If all supplied words do not fit at these readable sizes, simplify decoration and line breaks instead of shrinking the text.

Visual context:
- Product dominant color: ${productColorHex}
- Moving video background: ${backgroundDescription || "a premium neutral background"}
- Product, caption and campaign context: ${themeContext || "No additional theme context"}

Creative direction:
- Create a genuinely unique premium typography treatment tailored to the actual product, actual video palette and campaign theme.
- Infer the visual language intelligently. Premium fashion may use editorial type, a humorous statement product may use a bold poster treatment, and a seasonal product may use one restrained thematic accent.
- Choose the most suitable typography for this exact product: tall condensed display, refined serif, modern geometric sans, tasteful expressive display lettering, or a carefully balanced font pairing.
- Vary the composition between posts when appropriate: centered editorial, asymmetric magazine layout, refined stacked poster or another professional arrangement that suits the references.
- The product name must be the clear visual focus and feel deliberately composed rather than inserted into a fixed template.
- Keep every letter comfortably inside generous outer margins. No letter may touch or be clipped by an edge.
- Choose text colors with strong contrast against the card. Light lettering is allowed only on a clearly dark card; dark lettering is required on a light card.
- Never use white or near-white lettering on a white, cream or pale card.
- Use the product color as inspiration or a restrained accent when it remains clearly legible with the card and moving background.
- Make the card feel exclusive and art-directed rather than like a plain colored rectangle.
- Add one or two non-text premium devices that fit the product: for example elegant editorial linework, a tasteful border, foil-like accent, embossed or debossed shape, subtle fabric or paper texture, restrained abstract geometry, a refined print pattern or a small thematic ornament.
- Decoration may be visually expressive, but it must frame and support the large text rather than compete with it.
- Never simulate decoration with unreadable letters, glyphs, symbols or fake words.
- The word "T-shirt" must clearly read with a real capital T and unambiguous letterforms.
- Do not write the brand name. Spreelo adds the brand separately above the product.
- No product image, logo, button, watermark, mockup, packaging, frame around another scene or fake clickable element.
- No pixel font, bitmap font, arcade style, block lettering made from squares, jagged outline or colored fringe.
- Render clean smooth high-resolution letter edges suitable for a professional Scandinavian fashion advertisement.
`.trim();
}

function splitAnimatedOverlayTitle(title) {
  const cleaned = truncateText(
    String(title || "Featured product").replace(/\s+/g, " ").trim(),
    78
  );
  const normalized = cleaned.replace(/\s+-\s+|\s*[\u2013\u2014]\s*/g, " - ");
  const parts = normalized
    .split(/\s+-\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const primary = parts.shift() || normalized;
  const suffix = parts.join(" - ");
  const tokens = primary.split(/\s+/).filter(Boolean);
  const maxChars = 25;
  const lines = [];
  let current = "";

  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = token;
    }
  }

  if (current) lines.push(current);
  if (suffix) lines.push(suffix);

  return lines.slice(0, 3);
}

function getPremiumFallbackTextStyle({
  rule,
  dominantColor,
  backgroundAsset,
  backgroundBrightness,
}) {
  const seed = [
    rule?.website_item?.title,
    rule?.website_item?.url,
    rule?.brand_profile?.business_name,
    rule?.campaign_name,
    rule?.prompt,
  ]
    .filter(Boolean)
    .join("|");
  const index = getDeterministicLayoutIndex(seed, 5);
  const isDarkBackground =
    String(backgroundBrightness || backgroundAsset?.brightness || "").toLowerCase() ===
    "dark";
  const baseColor = dominantColor || { r: 80, g: 95, b: 120 };
  const mainRgb = isDarkBackground
    ? mixRgb(baseColor, { r: 255, g: 255, b: 255 }, 0.68)
    : mixRgb(baseColor, { r: 10, g: 18, b: 28 }, 0.7);
  const accentRgb = isDarkBackground
    ? mixRgb(baseColor, { r: 255, g: 210, b: 135 }, 0.45)
    : mixRgb(baseColor, { r: 130, g: 48, b: 30 }, 0.42);
  const styles = [
    { font: "Georgia, serif", fontStyle: "normal", weight: 700, decoration: "line" },
    { font: "Trebuchet MS, sans-serif", fontStyle: "normal", weight: 800, decoration: "brush" },
    { font: "Verdana, sans-serif", fontStyle: "normal", weight: 700, decoration: "frame" },
    { font: "Georgia, serif", fontStyle: "italic", weight: 700, decoration: "underline" },
    { font: "Trebuchet MS, sans-serif", fontStyle: "normal", weight: 900, decoration: "capsule" },
  ];

  return {
    ...styles[index],
    mainColor: rgbToHex(mainRgb),
    accentColor: rgbToHex(accentRgb),
    shadowColor: isDarkBackground ? "#111827" : "#ffffff",
  };
}

const ANIMATED_FALLBACK_GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "'": ["00100", "00100", "00010", "00000", "00000", "00000", "00000"],
};

function renderAnimatedFallbackVectorLine({
  text,
  centerX,
  top,
  maxWidth,
  maxPixelSize,
  fill,
  shadow,
}) {
  const characters = String(text || "")
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .split("");
  const characterWidths = characters.map((character) =>
    character === " " ? 3 : 5
  );
  const totalUnits = Math.max(
    1,
    characterWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, characters.length - 1)
  );
  const pixelSize = Math.max(
    3,
    Math.min(maxPixelSize, Math.floor(maxWidth / totalUnits))
  );
  const lineWidth = totalUnits * pixelSize;
  const startX = Math.round(centerX - lineWidth / 2);
  const glyphTop = top + pixelSize * 2;
  const pathCommands = [];
  let cursorUnits = 0;

  const addPixel = (unitX, unitY) => {
    const x = startX + unitX * pixelSize;
    const y = top + unitY * pixelSize;
    pathCommands.push(
      `M${x} ${y}h${pixelSize}v${pixelSize}h-${pixelSize}Z`
    );
  };

  characters.forEach((character, characterIndex) => {
    const width = characterWidths[characterIndex];
    if (character !== " ") {
      const accentCharacter = ["\u00c5", "\u00c4", "\u00d6"].includes(character);
      const baseCharacter =
        character === "\u00c5" || character === "\u00c4"
          ? "A"
          : character === "\u00d6"
            ? "O"
            : character;
      const glyph = ANIMATED_FALLBACK_GLYPHS[baseCharacter] || ANIMATED_FALLBACK_GLYPHS["?"];

      if (accentCharacter) {
        if (character === "\u00c5") {
          addPixel(cursorUnits + 2, 0);
          addPixel(cursorUnits + 1, 1);
          addPixel(cursorUnits + 3, 1);
        } else {
          addPixel(cursorUnits + 1, 0);
          addPixel(cursorUnits + 3, 0);
        }
      }

      glyph.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, columnIndex) => {
          if (pixel === "1") {
            addPixel(cursorUnits + columnIndex, rowIndex + 2);
          }
        });
      });
    }
    cursorUnits += width + 1;
  });

  const path = pathCommands.join("");
  const shadowOffset = Math.max(2, Math.round(pixelSize * 0.45));
  return {
    svg: path
      ? `<path d="${path}" fill="${shadow}" opacity="0.9" transform="translate(${shadowOffset} ${shadowOffset})"/><path d="${path}" fill="${fill}"/>`
      : "",
    height: glyphTop - top + 7 * pixelSize,
  };
}

async function createFallbackAnimatedTextOverlay({
  rule,
  backgroundAsset,
  backgroundBrightness,
  dominantColor,
}) {
  const websiteItem = rule?.website_item || {};
  const title = sanitizeProductTitleForCard(
    websiteItem?.title || rule?.content_type_label || "Featured product"
  ) || "Featured product";
  const titleLines = splitAnimatedOverlayTitle(title);
  const style = getPremiumFallbackTextStyle({
    rule,
    dominantColor,
    backgroundAsset,
    backgroundBrightness,
  });
  const titleStartY = titleLines.length >= 3 ? 1278 : 1320;
  let titleCursorY = titleStartY;
  const titleMarkup = titleLines
    .map((line) => {
      const renderedLine = renderAnimatedFallbackVectorLine({
        text: line,
        centerX: 540,
        top: titleCursorY,
        maxWidth: 760,
        maxPixelSize: titleLines.length >= 3 ? 6 : 7,
        fill: style.mainColor,
        shadow: style.shadowColor,
      });
      titleCursorY += renderedLine.height + 14;
      return renderedLine.svg;
    })
    .join("");
  const decoration = {
    line: `<line x1="360" y1="1270" x2="720" y2="1270" stroke="${style.accentColor}" stroke-width="5" stroke-linecap="round"/>`,
    brush: `<path d="M280 1328 C390 1290 690 1290 800 1330 C690 1365 385 1368 280 1328 Z" fill="${style.accentColor}" opacity="0.24"/>`,
    frame: `<path d="M280 1275 H365 M715 1275 H800 M280 1535 H365 M715 1535 H800" stroke="${style.accentColor}" stroke-width="5" stroke-linecap="round" fill="none"/>`,
    underline: `<path d="M350 1510 C465 1532 615 1532 730 1510" stroke="${style.accentColor}" stroke-width="7" stroke-linecap="round" fill="none"/>`,
    capsule: `<rect x="320" y="1285" width="440" height="46" rx="23" fill="${style.accentColor}" opacity="0.18"/>`,
  }[style.decoration];
  const svg = `
    <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#000000" flood-opacity="0.24"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        ${decoration}
        ${titleMarkup}
      </g>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createProfessionalFallbackAnimatedTextOverlay({
  rule,
  backgroundAsset,
  backgroundBrightness,
  dominantColor,
}) {
  const websiteItem = rule?.website_item || {};
  const title = sanitizeProductTitleForCard(
    websiteItem?.title || rule?.content_type_label || "Featured product"
  ) || "Featured product";
  const titleLines = splitAnimatedOverlayTitle(title);
  const style = getPremiumFallbackTextStyle({
    rule,
    dominantColor,
    backgroundAsset,
    backgroundBrightness,
  });
  const maxCharacters = Math.max(
    1,
    ...titleLines.map((line) => Array.from(line).length)
  );
  const baseFontSize = titleLines.length >= 3 ? 46 : titleLines.length === 2 ? 60 : 76;
  const fittedFontSize = Math.floor(
    (ANIMATED_TEXT_PANEL_WIDTH - 112) / Math.max(1, maxCharacters * 0.58)
  );
  const titleFontSize = Math.max(36, Math.min(baseFontSize, fittedFontSize));
  const titleLineHeight = Math.round(titleFontSize * 1.06);
  const textBlockHeight = titleLines.length * titleLineHeight;
  const firstBaseline = Math.round(
    ANIMATED_TEXT_PANEL_TOP +
      (ANIMATED_TEXT_PANEL_HEIGHT - textBlockHeight) / 2 +
      titleFontSize * 0.82
  );
  const titleMarkup = titleLines
    .map((line, index) => {
      return `<text x="540" y="${firstBaseline + index * titleLineHeight}" text-anchor="middle" font-family="${style.font}" font-size="${titleFontSize}" font-style="${style.fontStyle}" font-weight="${style.weight}" letter-spacing="1.5" fill="${style.mainColor}">${escapeSvgText(line)}</text>`;
    })
    .join("");
  const svg = `
    <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="panelShadow" x="-30%" y="-40%" width="160%" height="190%">
          <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <rect x="${ANIMATED_TEXT_PANEL_LEFT}" y="${ANIMATED_TEXT_PANEL_TOP}" width="${ANIMATED_TEXT_PANEL_WIDTH}" height="${ANIMATED_TEXT_PANEL_HEIGHT}" rx="28" fill="#f8f6f1" filter="url(#panelShadow)"/>
      ${titleMarkup}
      <line x1="390" y1="${ANIMATED_TEXT_PANEL_TOP + ANIMATED_TEXT_PANEL_HEIGHT - 21}" x2="690" y2="${ANIMATED_TEXT_PANEL_TOP + ANIMATED_TEXT_PANEL_HEIGHT - 21}" stroke="${style.accentColor}" stroke-width="3" stroke-linecap="round" opacity="0.72"/>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function getAnimatedOverlayBackgroundReference(backgroundAsset) {
  if (!backgroundAsset?.poster_url) return null;

  try {
    const backgroundBuffer = await fetchImageBufferForOverlay(
      backgroundAsset.poster_url
    );

    return sharp(backgroundBuffer)
      .rotate()
      .resize({ width: 1080, height: 1920, fit: "cover" })
      .png()
      .toBuffer();
  } catch (error) {
    console.warn("Could not load animated Reel background for text contrast", {
      backgroundAssetId: backgroundAsset?.id || null,
      message: error?.message,
    });
    return null;
  }
}

async function getAnimatedOverlayBackgroundLuminance(
  backgroundReferenceBuffer,
  backgroundAsset
) {
  if (backgroundReferenceBuffer) {
    const stats = await sharp(backgroundReferenceBuffer)
      .extract({ left: 108, top: 1248, width: 864, height: 360 })
      .stats();
    const red = Number(stats?.channels?.[0]?.mean || 0);
    const green = Number(stats?.channels?.[1]?.mean || 0);
    const blue = Number(stats?.channels?.[2]?.mean || 0);

    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  const brightness = String(backgroundAsset?.brightness || "").toLowerCase();
  if (brightness === "dark") return 55;
  if (brightness === "light") return 210;
  return 132;
}

function getAnimatedOverlayBrightnessLabel(luminance) {
  if (luminance <= 86) return "dark";
  if (luminance >= 166) return "light";
  return "medium";
}

async function addAnimatedOverlayContrastHalo(overlayBuffer, backgroundLuminance) {
  const normalizedOverlay = await sharp(overlayBuffer)
    .resize({ width: 1080, height: 1920, fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const haloColor =
    backgroundLuminance >= 132
      ? { r: 8, g: 15, b: 26 }
      : { r: 255, g: 252, b: 245 };
  const haloAlpha = await sharp(normalizedOverlay)
    .extractChannel(3)
    .dilate(5)
    .blur(1.2)
    .linear(0.58)
    .png()
    .toBuffer();
  const haloBuffer = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: haloColor,
    },
  })
    .joinChannel(haloAlpha)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: haloBuffer, left: 0, top: 0 },
      { input: normalizedOverlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

function countVisiblePixelsInRegion(data, info, region, alphaThreshold = 48) {
  const left = Math.max(0, Math.min(info.width, Math.round(region.left)));
  const top = Math.max(0, Math.min(info.height, Math.round(region.top)));
  const right = Math.max(left, Math.min(info.width, Math.round(region.right)));
  const bottom = Math.max(top, Math.min(info.height, Math.round(region.bottom)));
  let visible = 0;
  let strong = 0;
  let minX = right;
  let maxX = left;
  let minY = bottom;
  let maxY = top;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha < alphaThreshold) continue;
      visible += 1;
      if (alpha >= 150) strong += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    visible,
    strong,
    bounds:
      visible > 0
        ? {
            left: minX,
            top: minY,
            right: maxX + 1,
            bottom: maxY + 1,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            centerX: (minX + maxX + 1) / 2,
          }
        : null,
    area: Math.max(1, (right - left) * (bottom - top)),
  };
}


function analyzeTextLikeContent(data, info, region, alphaThreshold = 110) {
  const left = Math.max(0, Math.min(info.width, Math.round(region.left)));
  const top = Math.max(0, Math.min(info.height, Math.round(region.top)));
  const right = Math.max(left, Math.min(info.width, Math.round(region.right)));
  const bottom = Math.max(top, Math.min(info.height, Math.round(region.bottom)));
  const width = right - left;
  const height = bottom - top;
  const mask = new Uint8Array(Math.max(1, width * height));
  let occupiedRows = 0;
  let totalRuns = 0;

  for (let y = 0; y < height; y += 1) {
    let rowRuns = 0;
    let inRun = false;
    let rowVisible = false;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[((top + y) * info.width + (left + x)) * info.channels + 3];
      const visible = alpha >= alphaThreshold;
      if (visible) {
        mask[y * width + x] = 1;
        rowVisible = true;
        if (!inRun) rowRuns += 1;
      }
      inRun = visible;
    }
    if (rowVisible) {
      occupiedRows += 1;
      totalRuns += rowRuns;
    }
  }

  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let meaningfulComponents = 0;
  let largestComponent = 0;
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = index;
    visited[index] = 1;
    let area = 0;
    while (head < tail) {
      const current = queue[head++];
      area += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    largestComponent = Math.max(largestComponent, area);
    if (area >= 18) meaningfulComponents += 1;
  }

  const averageRuns = occupiedRows ? totalRuns / occupiedRows : 0;
  return {
    meaningfulComponents,
    largestComponent,
    occupiedRows,
    averageRuns,
    looksTextLike:
      meaningfulComponents >= 4 ||
      (meaningfulComponents >= 2 && averageRuns >= 4.5) ||
      averageRuns >= 7,
  };
}

function getAnimatedChromaChannelGroups(chromaRgb) {
  const values = [
    Number(chromaRgb?.r || 0),
    Number(chromaRgb?.g || 0),
    Number(chromaRgb?.b || 0),
  ];
  const active = [];
  const inactive = [];

  values.forEach((value, index) => {
    if (value >= 128) active.push(index);
    else inactive.push(index);
  });

  return {
    active: active.length ? active : [0, 1, 2],
    inactive,
  };
}

function getAnimatedChromaDominance(r, g, b, channelGroups) {
  const channels = [r, g, b];
  let activeFloor = 255;
  let inactiveCeiling = 0;

  for (const channel of channelGroups.active) {
    activeFloor = Math.min(activeFloor, channels[channel]);
  }
  for (const channel of channelGroups.inactive) {
    inactiveCeiling = Math.max(inactiveCeiling, channels[channel]);
  }

  return {
    activeFloor,
    dominance: channelGroups.inactive.length
      ? activeFloor - inactiveCeiling
      : 0,
  };
}

function getAnimatedRgbDistance(color, reference) {
  return Math.sqrt(
    (color.r - reference.r) ** 2 +
      (color.g - reference.g) ** 2 +
      (color.b - reference.b) ** 2
  );
}

function getAdaptiveAnimatedChromaRemovalStrength({
  r,
  g,
  b,
  channelGroups,
  referenceColors,
}) {
  let nearestReferenceDistance = Number.POSITIVE_INFINITY;
  const color = { r, g, b };

  for (const reference of referenceColors) {
    nearestReferenceDistance = Math.min(
      nearestReferenceDistance,
      getAnimatedRgbDistance(color, reference)
    );
  }

  const referenceStrength = Math.max(
    0,
    Math.min(1, (172 - nearestReferenceDistance) / 124)
  );
  const chroma = getAnimatedChromaDominance(r, g, b, channelGroups);
  const dominanceStrength =
    chroma.activeFloor >= 34
      ? Math.max(0, Math.min(1, (chroma.dominance - 10) / 68))
      : 0;

  return Math.max(referenceStrength, dominanceStrength);
}


async function extractGeneratedTextFromChromaBackground(generatedBuffer, chromaKey) {
  const normalized = await sharp(generatedBuffer)
    .rotate()
    .resize({
      width: 864,
      height: 1536,
      fit: "fill",
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { data, info } = await sharp(normalized)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cornerStats = getCornerBackgroundStats(data, info.width, info.height);
  const expectedChroma = chromaKey?.rgb || cornerStats.background;
  const channelGroups = getAnimatedChromaChannelGroups(expectedChroma);
  const referenceColors = [expectedChroma];

  for (const cornerColor of cornerStats.averages) {
    const cornerChroma = getAnimatedChromaDominance(
      cornerColor.r,
      cornerColor.g,
      cornerColor.b,
      channelGroups
    );
    if (
      cornerChroma.dominance >= 6 ||
      getAnimatedRgbDistance(cornerColor, expectedChroma) <= 210
    ) {
      referenceColors.push(cornerColor);
    }
  }

  const rgba = Buffer.from(data);
  const alphaChannel = Buffer.alloc(info.width * info.height);
  let removedPixels = 0;
  let softenedPixels = 0;

  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const index = pixel * 4;
    const originalAlpha = data[index + 3];
    const removalStrength = getAdaptiveAnimatedChromaRemovalStrength({
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
      channelGroups,
      referenceColors,
    });
    const alpha = Math.max(
      0,
      Math.min(255, Math.round(originalAlpha * (1 - removalStrength)))
    );

    if (originalAlpha >= 8 && alpha < 36) {
      removedPixels += 1;
    }
    if (alpha < originalAlpha) softenedPixels += 1;
    rgba[index + 3] = alpha;
    alphaChannel[pixel] = alpha;
  }

  const removedRatio = removedPixels / Math.max(1, info.width * info.height);
  if (removedRatio < 0.38) {
    throw new Error("Generated premium overlay background could not be cleanly separated from the design");
  }
  const bounds = findAlphaBounds(alphaChannel, info.width, info.height, 36);
  if (!bounds) {
    throw new Error("Generated premium overlay contained no visible design");
  }

  console.info("Generated premium overlay chroma background removed adaptively", {
    chromaKey: chromaKey?.hex || null,
    maximumCornerDistance: Number(cornerStats.maximumDistance.toFixed(2)),
    referenceColors: referenceColors.length,
    removedRatio: Number(removedRatio.toFixed(4)),
    softenedRatio: Number(
      (softenedPixels / Math.max(1, info.width * info.height)).toFixed(4)
    ),
  });

  return sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function validateGeneratedAnimatedTextOverlay(overlayBuffer) {
  const { data, info } = await sharp(overlayBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const entire = countVisiblePixelsInRegion(data, info, {
    left: 0,
    top: 0,
    right: 1080,
    bottom: 1920,
  });
  const productZone = countVisiblePixelsInRegion(data, info, {
    left: 96,
    top: 250,
    right: 984,
    bottom: 1248,
  });
  const lowerTextZone = countVisiblePixelsInRegion(data, info, {
    left: 108,
    top: 1260,
    right: 972,
    bottom: 1600,
  });
  const platformSafeZone = countVisiblePixelsInRegion(data, info, {
    left: 0,
    top: 1605,
    right: 1080,
    bottom: 1920,
  });
  const sideEdges =
    countVisiblePixelsInRegion(data, info, {
      left: 0,
      top: 0,
      right: 72,
      bottom: 1920,
    }).visible +
    countVisiblePixelsInRegion(data, info, {
      left: 1008,
      top: 0,
      right: 1080,
      bottom: 1920,
    }).visible;

  if (entire.visible < 8000 || entire.strong < 2800) {
    throw new Error("Generated premium overlay became too faint after chroma removal");
  }
  if (productZone.visible / productZone.area > 0.0045) {
    throw new Error("Generated premium overlay entered the reserved product zone");
  }
  if (lowerTextZone.visible < 5000 || lowerTextZone.strong < 1900) {
    throw new Error("Generated premium overlay did not contain a clear lower title design");
  }
  if (
    !lowerTextZone.bounds ||
    Math.abs(lowerTextZone.bounds.centerX - 540) > 95 ||
    lowerTextZone.bounds.width < 300 ||
    lowerTextZone.bounds.width > 840 ||
    lowerTextZone.bounds.height < 55 ||
    lowerTextZone.bounds.height > 330
  ) {
    throw new Error("Generated premium overlay title was not centered or correctly sized");
  }
  if (platformSafeZone.visible > 900) {
    throw new Error("Generated premium overlay entered the Reel platform safe zone");
  }
  if (sideEdges > 800) {
    throw new Error("Generated premium overlay was too close to the side edges");
  }
  const textShape = analyzeTextLikeContent(data, info, {
    left: 108,
    top: 1260,
    right: 972,
    bottom: 1600,
  });
  if (!textShape.looksTextLike) {
    throw new Error("Generated premium overlay contained decoration but no reliable title text");
  }
}

async function trimGeneratedAnimatedTextOverlayToSafeZones(overlayBuffer) {
  const { data, info } = await sharp(overlayBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.from(data);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const inTopTextZone = x >= 72 && x < 1008 && y >= 40 && y < 241;
      const inLowerTextZone = x >= 108 && x < 972 && y >= 1258 && y < 1594;

      if (!inTopTextZone && !inLowerTextZone) {
        rgba[(y * info.width + x) * 4 + 3] = 0;
      }
    }
  }

  return sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function normalizeGeneratedAnimatedTextOverlay(generatedBuffer, chromaKey) {
  const cutout = await extractGeneratedTextFromChromaBackground(
    generatedBuffer,
    chromaKey
  );
  const overlayBuffer = await sharp(cutout)
    .resize({ width: 1080, height: 1920, fit: "fill" })
    .png()
    .toBuffer();

  try {
    await validateGeneratedAnimatedTextOverlay(overlayBuffer);
    return {
      textOverlayBuffer: overlayBuffer,
      repaired: false,
      repairReason: null,
    };
  } catch (error) {
    const repairableZoneViolation =
      /reserved product zone|Reel platform safe zone|side edges/i.test(
        String(error?.message || "")
      );

    if (!repairableZoneViolation) {
      throw error;
    }

    const repairedOverlayBuffer =
      await trimGeneratedAnimatedTextOverlayToSafeZones(overlayBuffer);

    try {
      await validateGeneratedAnimatedTextOverlay(repairedOverlayBuffer);
    } catch (repairError) {
      throw new Error(
        `${error.message}; safe-zone repair failed: ${repairError.message}`
      );
    }

    return {
      textOverlayBuffer: repairedOverlayBuffer,
      repaired: true,
      repairReason: error.message,
    };
  }
}

async function normalizeGeneratedAnimatedTextPanel(generatedBuffer) {
  const normalizedPanel = await sharp(generatedBuffer)
    .rotate()
    .resize({
      width: ANIMATED_TEXT_PANEL_SOURCE_WIDTH,
      height: ANIMATED_TEXT_PANEL_SOURCE_HEIGHT,
      fit: "contain",
      background: { r: 248, g: 246, b: 241, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .removeAlpha()
    .png()
    .toBuffer();
  const { data, info } = await sharp(normalizedPanel)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let darkPixels = 0;
  let lightNeutralPixels = 0;

  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const index = pixel * info.channels;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);

    if (luminance <= 182) darkPixels += 1;
    if (luminance >= 205 && channelSpread <= 38) lightNeutralPixels += 1;
  }

  const pixelCount = Math.max(1, info.width * info.height);
  const darkRatio = darkPixels / pixelCount;
  const lightNeutralRatio = lightNeutralPixels / pixelCount;
  const panelStats = await sharp(normalizedPanel).stats();
  const tonalStdDev = panelStats.channels
    .slice(0, 3)
    .reduce((total, channel) => total + Number(channel.stdev || 0), 0) / 3;

  if (tonalStdDev < 2) {
    throw new Error("Generated premium text panel was visually blank");
  }

  const resizedPanel = await sharp(normalizedPanel)
    .resize({
      width: ANIMATED_TEXT_PANEL_WIDTH,
      height: ANIMATED_TEXT_PANEL_HEIGHT,
      fit: "contain",
      background: { r: 248, g: 246, b: 241, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const panelMask = Buffer.from(`
    <svg width="${ANIMATED_TEXT_PANEL_WIDTH}" height="${ANIMATED_TEXT_PANEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${ANIMATED_TEXT_PANEL_WIDTH}" height="${ANIMATED_TEXT_PANEL_HEIGHT}" rx="28" fill="#ffffff"/>
    </svg>
  `);
  const roundedPanel = await sharp(resizedPanel)
    .composite([{ input: panelMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const panelFrame = Buffer.from(`
    <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="panelShadow" x="-30%" y="-40%" width="160%" height="190%">
          <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <rect x="${ANIMATED_TEXT_PANEL_LEFT}" y="${ANIMATED_TEXT_PANEL_TOP}" width="${ANIMATED_TEXT_PANEL_WIDTH}" height="${ANIMATED_TEXT_PANEL_HEIGHT}" rx="28" fill="#f8f6f1" filter="url(#panelShadow)"/>
    </svg>
  `);
  const textOverlayBuffer = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: panelFrame, left: 0, top: 0 },
      {
        input: roundedPanel,
        left: ANIMATED_TEXT_PANEL_LEFT,
        top: ANIMATED_TEXT_PANEL_TOP,
      },
    ])
    .png()
    .toBuffer();

  return {
    textOverlayBuffer,
    analysis: {
      darkRatio: Number(darkRatio.toFixed(4)),
      lightNeutralRatio: Number(lightNeutralRatio.toFixed(4)),
      tonalStdDev: Number(tonalStdDev.toFixed(2)),
    },
  };
}

async function createAnimatedTextOverlay({
  openai,
  rule,
  postContent,
  backgroundAsset,
  dominantColor,
  productReferenceBuffer,
}) {
  const backgroundReferenceBuffer =
    await getAnimatedOverlayBackgroundReference(backgroundAsset);
  const backgroundLuminance = await getAnimatedOverlayBackgroundLuminance(
    backgroundReferenceBuffer,
    backgroundAsset
  );
  const backgroundBrightness =
    getAnimatedOverlayBrightnessLabel(backgroundLuminance);
  const prompt = buildAnimatedTextPanelPrompt({
    rule,
    postContent,
    backgroundAsset,
    backgroundBrightness,
    dominantColor,
    hasBackgroundReference: Boolean(backgroundReferenceBuffer),
    hasProductReference: Boolean(productReferenceBuffer),
  });

  try {
    const referenceFiles = [];

    if (backgroundReferenceBuffer) {
      const compactBackgroundReference = await sharp(backgroundReferenceBuffer)
        .resize({ width: 576, height: 1024, fit: "cover" })
        .png({ compressionLevel: 9 })
        .toBuffer();
      referenceFiles.push(
        await toFile(compactBackgroundReference, "reel-background-reference.png", {
          type: "image/png",
        })
      );
    }

    if (productReferenceBuffer) {
      const compactProductReference = await sharp(productReferenceBuffer)
        .rotate()
        .resize({
          width: 768,
          height: 768,
          fit: "contain",
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      referenceFiles.push(
        await toFile(compactProductReference, "product-reference.png", {
          type: "image/png",
        })
      );
    }

    if (referenceFiles.length === 0) {
      throw new Error("No visual reference was available for the premium text panel");
    }

    const response = await openai.images.edit({
      model: ANIMATED_OVERLAY_IMAGE_MODEL,
      image: referenceFiles,
      prompt,
      size: `${ANIMATED_TEXT_PANEL_SOURCE_WIDTH}x${ANIMATED_TEXT_PANEL_SOURCE_HEIGHT}`,
      quality: "medium",
      background: "opaque",
      output_format: "png",
    });
    const imageBase64 = response?.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("OpenAI returned no premium text panel image data");
    }

    const normalizedPanel = await normalizeGeneratedAnimatedTextPanel(
      Buffer.from(imageBase64, "base64")
    );

    console.info("OpenAI context-aware animated text panel created", {
      ruleId: rule?.id || null,
      model: ANIMATED_OVERLAY_IMAGE_MODEL,
      referenceCount: referenceFiles.length,
      ...normalizedPanel.analysis,
    });

    return {
      textOverlayBuffer: normalizedPanel.textOverlayBuffer,
      prompt,
      provider: "openai_premium_context_panel",
    };
  } catch (error) {
    console.warn("Single OpenAI context-aware text panel was unusable; using emergency fallback", {
      ruleId: rule?.id || null,
      message: error?.message,
    });

    return {
      textOverlayBuffer: await createProfessionalFallbackAnimatedTextOverlay({
        rule,
        backgroundAsset,
        backgroundBrightness,
        dominantColor,
      }),
      prompt,
      provider: "fallback_premium_type_panel",
    };
  }
}

async function createAnimatedProductLayer({ sourceImageBuffer, preparedCutoutBuffer = null }) {
  const cutoutBuffer = preparedCutoutBuffer || (await extractAnimatedProductCutout(sourceImageBuffer));
  const resizedProduct = await sharp(cutoutBuffer)
    .resize({
      width: 920,
      height: 920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(resizedProduct).metadata();
  const productWidth = Number(metadata.width || 760);
  const productHeight = Number(metadata.height || 760);
  const productLeft = Math.round((1080 - productWidth) / 2);
  const productTop = 255;
  const shadowWidth = Math.max(220, Math.round(productWidth * 0.56));
  const shadowHeight = Math.max(38, Math.round(productWidth * 0.09));
  const shadowSvg = `
    <svg width="${shadowWidth}" height="${shadowHeight}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${Math.round(shadowWidth / 2)}" cy="${Math.round(shadowHeight / 2)}" rx="${Math.round(shadowWidth / 2.15)}" ry="${Math.round(shadowHeight / 2.4)}" fill="#000000" opacity="0.22" />
    </svg>
  `;
  const shadowBuffer = await sharp(Buffer.from(shadowSvg))
    .png()
    .blur(16)
    .toBuffer();
  const shadowLeft = Math.round((1080 - shadowWidth) / 2);
  const shadowTop = productTop + productHeight - Math.round(shadowHeight * 0.25);
  const productLayerBuffer = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadowBuffer, left: shadowLeft, top: shadowTop },
      { input: resizedProduct, left: productLeft, top: productTop },
    ])
    .png()
    .toBuffer();

  // Version 77 animated the actual visible product inside an HTML5/GSAP layer.
  // Keep that proven mechanism, but make the inline asset much smaller than
  // Shotstack's request-body limit. A public URL proved unreliable inside the
  // HTML5 renderer, while a large Base64 asset triggers "Payload Too Large".
  const targetDataUriLength = 145_000;
  const maximumDataUriLength = 175_000;
  const candidates = [
    { width: 700, quality: 88, alphaQuality: 96 },
    { width: 620, quality: 86, alphaQuality: 95 },
    { width: 560, quality: 84, alphaQuality: 94 },
    { width: 500, quality: 82, alphaQuality: 93 },
    { width: 440, quality: 80, alphaQuality: 92 },
    { width: 380, quality: 78, alphaQuality: 90 },
  ];
  let motionBuffer = null;
  let motionMime = "image/webp";
  let motionMetadata = metadata;
  let productDataUri = "";

  for (const candidate of candidates) {
    motionBuffer = await sharp(cutoutBuffer)
      .resize({
        width: candidate.width,
        height: candidate.width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: candidate.quality,
        alphaQuality: candidate.alphaQuality,
        smartSubsample: true,
        effort: 5,
      })
      .toBuffer();
    motionMetadata = await sharp(motionBuffer).metadata();
    productDataUri = `data:${motionMime};base64,${motionBuffer.toString("base64")}`;
    if (productDataUri.length <= targetDataUriLength) break;
  }

  if (!motionBuffer || productDataUri.length > maximumDataUriLength) {
    throw new Error("Product asset is too large for reliable Shotstack HTML5 animation");
  }


  return {
    productLayerBuffer,
    productMotionBuffer: motionBuffer,
    productDataUri,
    productWidth,
    productHeight,
    motionSourceWidth: Number(motionMetadata.width || productWidth),
    motionSourceHeight: Number(motionMetadata.height || productHeight),
  };
}

async function createAnimatedLogoOverlay({ brandProfile, includeLogo }) {
  if (!includeLogo || !brandProfile?.logo_url) return null;

  try {
    const logoBuffer = await fetchImageBufferForOverlay(brandProfile.logo_url);
    const logoPng = await sharp(logoBuffer)
      .rotate()
      .trim({ threshold: 10 })
      .resize({
        width: 220,
        height: 100,
        fit: "inside",
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const metadata = await sharp(logoPng).metadata();
    const logoWidth = Number(metadata.width || 220);
    const logoHeight = Number(metadata.height || 100);
    const plateWidth = Math.max(logoWidth + 48, 150);
    const plateHeight = Math.max(logoHeight + 34, 74);
    const plate = Buffer.from(`
      <svg width="${plateWidth}" height="${plateHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${plateWidth}" height="${plateHeight}" rx="24" fill="#ffffff" opacity="0.82"/>
      </svg>
    `);
    return sharp({
      create: {
        width: 1080,
        height: 1920,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: plate, left: 54, top: 190 },
        { input: logoPng, left: 78, top: 207 },
      ])
      .png()
      .toBuffer();
  } catch (error) {
    console.warn("Animated Reel logo overlay skipped", {
      brandProfileId: brandProfile?.id || null,
      message: error.message,
    });
    return null;
  }
}

async function createAnimatedPoster({
  backgroundAsset,
  productLayerBuffer,
  textOverlayBuffer,
  logoOverlayBuffer,
}) {
  let baseBuffer = null;

  if (backgroundAsset?.poster_url) {
    try {
      baseBuffer = await fetchImageBufferForOverlay(backgroundAsset.poster_url);
    } catch (error) {
      console.warn("Could not fetch video background poster", {
        backgroundAssetId: backgroundAsset?.id,
        message: error.message,
      });
    }
  }

  const base = baseBuffer
    ? sharp(baseBuffer).rotate().resize({ width: 1080, height: 1920, fit: "cover" })
    : sharp({
        create: {
          width: 1080,
          height: 1920,
          channels: 4,
          background: { r: 24, g: 26, b: 32, alpha: 1 },
        },
      });
  const composites = [
    { input: productLayerBuffer, left: 0, top: 0 },
    { input: textOverlayBuffer, left: 0, top: 0 },
  ];
  if (logoOverlayBuffer) composites.push({ input: logoOverlayBuffer, left: 0, top: 0 });
  return base.composite(composites).jpeg({ quality: 90 }).toBuffer();
}

async function createAnimatedProductVideoAssets({
  openai,
  supabase,
  rule,
  postContent,
  userId,
  postId,
}) {
  const websiteItem = rule?.website_item || {};
  const brandProfile = rule?.brand_profile || {};
  const sourceImageUrl = websiteItem?.image_url;

  if (!sourceImageUrl) {
    throw new Error("Animated product Reel requires a verified website product image");
  }

  const selectedProductImage = await selectAnimatedProductImage(websiteItem);
  const sourceImageBuffer = selectedProductImage.sourceImageBuffer;
  const dominantColor = await getProductAccentColor(selectedProductImage.cutoutBuffer);
  const selection = await selectAnimatedVideoBackground({
    supabase,
    rule,
    dominantColor,
  });
  const includeLogo = shouldUseLogoForRule(rule, brandProfile);
  const [textOverlay, productLayer, logoOverlayBuffer] = await Promise.all([
    createAnimatedTextOverlay({
      openai,
      rule,
      postContent,
      backgroundAsset: selection.asset,
      dominantColor,
      productReferenceBuffer: selectedProductImage.cutoutBuffer,
    }),
    createAnimatedProductLayer({
      sourceImageBuffer,
      preparedCutoutBuffer: selectedProductImage.cutoutBuffer,
    }),
    createAnimatedLogoOverlay({ brandProfile, includeLogo }),
  ]);
  const { textOverlayBuffer, prompt, provider: textOverlayProvider } = textOverlay;
  const posterBuffer = await createAnimatedPoster({
    backgroundAsset: selection.asset,
    productLayerBuffer: productLayer.productLayerBuffer,
    textOverlayBuffer,
    logoOverlayBuffer,
  });

  const uploadTasks = [
    uploadGeneratedImageToStorage({
      supabase,
      imageBase64: productLayer.productLayerBuffer.toString("base64"),
      userId,
      postId,
      fileSuffix: "animation-product-layer",
    }),
    uploadGeneratedImageToStorage({
      supabase,
      imageBase64: productLayer.productMotionBuffer.toString("base64"),
      userId,
      postId,
      fileSuffix: "animation-product-motion",
    }),
    uploadGeneratedImageToStorage({
      supabase,
      imageBase64: textOverlayBuffer.toString("base64"),
      userId,
      postId,
      fileSuffix: "animation-text-overlay",
    }),
    uploadGeneratedImageToStorage({
      supabase,
      imageBase64: posterBuffer.toString("base64"),
      userId,
      postId,
      fileSuffix: "animation-poster",
    }),
  ];

  if (logoOverlayBuffer) {
    uploadTasks.push(
      uploadGeneratedImageToStorage({
        supabase,
        imageBase64: logoOverlayBuffer.toString("base64"),
        userId,
        postId,
        fileSuffix: "animation-logo-overlay",
      })
    );
  }

  const [
    productLayerUpload,
    productMotionUpload,
    textOverlayUpload,
    posterUpload,
    logoUpload = null,
  ] =
    await Promise.all(uploadTasks);

  if (
    !productLayerUpload.imageUrl ||
    !productMotionUpload.imageUrl ||
    !textOverlayUpload.imageUrl ||
    !posterUpload.imageUrl
  ) {
    throw new Error("Could not create public animated Reel asset URLs");
  }

  return {
    backgroundVideoUrl: selection.asset.public_url,
    productUrl: productMotionUpload.imageUrl,
    productDataUri: productLayer.productDataUri,
    productWidth: productLayer.productWidth,
    productHeight: productLayer.productHeight,
    textOverlayUrl: textOverlayUpload.imageUrl,
    logoOverlayUrl: logoUpload?.imageUrl || null,
    posterUrl: posterUpload.imageUrl,
    posterStoragePath: posterUpload.imageStoragePath,
    foregroundPrompt: prompt,
    textOverlayProvider,
    backgroundAsset: selection.asset,
    backgroundSelection: {
      profile: selection.profile,
      score: selection.score,
      used_fallback: selection.usedFallback,
      reasons: selection.reasons,
      top_candidates: selection.topCandidates,
    },
  };
}

async function uploadRenderedVideoToStorage({
  supabase,
  videoUrl,
  userId,
  postId,
}) {
  const safeVideoUrl = await assertPublicHttpUrl(videoUrl);
  const response = await fetch(safeVideoUrl);

  if (!response.ok) {
    throw new Error(`Could not download rendered video: ${response.status}`);
  }

  const videoBuffer = Buffer.from(await response.arrayBuffer());
  const filePath = `${userId}/${postId}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from(POST_VIDEOS_BUCKET)
    .upload(filePath, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Could not upload rendered video");
  }

  const { data: publicUrlData } = supabase.storage
    .from(POST_VIDEOS_BUCKET)
    .getPublicUrl(filePath);

  if (!publicUrlData?.publicUrl) {
    throw new Error("Could not create a public URL for the rendered video");
  }

  return {
    videoUrl: publicUrlData.publicUrl,
    videoStoragePath: filePath,
  };
}

async function generateAnimatedProductVideo({
  openai,
  supabase,
  rule,
  postContent,
  userId,
  postId,
}) {
  const assets = await createAnimatedProductVideoAssets({
    openai,
    supabase,
    rule,
    postContent,
    userId,
    postId,
  });
  const edit = buildProductPushEdit({
    backgroundVideoUrl: assets.backgroundVideoUrl,
    productDataUri: assets.productDataUri,
    productWidth: assets.productWidth,
    productHeight: assets.productHeight,
    textOverlayUrl: assets.textOverlayUrl,
    logoOverlayUrl: assets.logoOverlayUrl,
    durationSeconds: ANIMATED_VIDEO_DURATION_SECONDS,
  });
  const renderId = await queueShotstackRender(edit);

  await supabase
    .from("posts")
    .update({
      video_render_id: renderId,
      video_status: "rendering",
      video_background_asset_id: assets.backgroundAsset.id,
      video_background_family: assets.backgroundAsset.family,
      video_background_selection: assets.backgroundSelection,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  const render = await waitForShotstackRender({ renderId });
  const storedVideo = await uploadRenderedVideoToStorage({
    supabase,
    videoUrl: render.url,
    userId,
    postId,
  });

  await supabase
    .from("video_background_assets")
    .update({
      times_used: Number(assets.backgroundAsset.times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assets.backgroundAsset.id);

  return {
    ...assets,
    ...storedVideo,
    renderId,
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Spreelo/1.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
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


async function getNextRuleInPlan({ supabase, rule }) {
  const planName = String(rule?.name || "").trim();
  const scheduledPublishAtIso = getScheduledPublishAtIso(rule);

  if (!planName || !rule?.user_id || !rule?.brand_profile_id) {
    return null;
  }

  const { data, error } = await supabase
    .from("automation_rules")
    .select(
      "id, name, platform, post_type, content_type_id, content_type_label, content_format, generate_image, uses_website_content, campaign_post_index, campaign_post_count, publish_time, timezone, next_run_at, queue_priority"
    )
    .eq("user_id", rule.user_id)
    .eq("brand_profile_id", rule.brand_profile_id)
    .eq("name", planName)
    .eq("is_active", true)
    .neq("id", rule.id)
    .gt("next_run_at", scheduledPublishAtIso)
    .order("next_run_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Could not load next planned post for approval email", {
      ruleId: rule.id,
      message: error.message,
    });
    return null;
  }

  return data || null;
}


function getInitialPlanSlotSortValue(rule) {
  const date = String(rule?.run_date || "").trim();
  const time = String(rule?.publish_time || "00:00").slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T${time}`;
  const weekdayIndex = WEEKDAYS.findIndex(
    (weekday) => weekday.toLowerCase() === String(rule?.weekday || "").toLowerCase()
  );
  return `${String(weekdayIndex === -1 ? 99 : weekdayIndex).padStart(2, "0")}-${time}`;
}

async function getUpcomingPlanUrlForFinalWeeklyRule({ supabase, rule, locale }) {
  const planName = String(rule?.name || "").trim();
  if (
    rule?.schedule_type !== "weekly" ||
    !planName ||
    !rule?.user_id ||
    !rule?.brand_profile_id
  ) {
    return "";
  }

  const { data: planRules, error } = await supabase
    .from("automation_rules")
    .select("id, run_date, weekday, publish_time")
    .eq("user_id", rule.user_id)
    .eq("brand_profile_id", rule.brand_profile_id)
    .eq("name", planName)
    .eq("schedule_type", "weekly")
    .eq("is_active", true);

  if (error || !planRules?.length) {
    if (error) {
      console.warn("Could not determine final weekly rule for upcoming plan link", {
        ruleId: rule.id,
        message: error.message,
      });
    }
    return "";
  }

  const orderedRules = planRules
    .slice()
    .sort((a, b) => getInitialPlanSlotSortValue(a).localeCompare(getInitialPlanSlotSortValue(b)));
  if (orderedRules.at(-1)?.id !== rule.id) return "";

  try {
    const token = createPlanPreviewToken({
      userId: rule.user_id,
      brandId: rule.brand_profile_id,
      planName,
    });
    return `${APP_URL}/upcoming-plan?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale || "en")}`;
  } catch (tokenError) {
    console.warn("Could not create upcoming plan link", {
      ruleId: rule.id,
      message: tokenError.message,
    });
    return "";
  }
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
  const rejectUrl = `${APP_URL}/api/reject-post?token=${approvalToken}&lang=${locale}`;

  const nextRule = await getNextRuleInPlan({ supabase, rule });
  const upcomingPlanUrl = await getUpcomingPlanUrlForFinalWeeklyRule({
    supabase,
    rule,
    locale,
  });

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
        rejectUrl,
        imageUrl,
        carouselSlides,
        isCarouselDraft,
        nextRule,
        upcomingPlanUrl,
      }),
      text: buildApprovalEmailText({
        locale,
        t,
        rule,
        postContent,
        approveUrl,
        rejectUrl,
        imageUrl,
        carouselSlides,
        isCarouselDraft,
        nextRule,
        upcomingPlanUrl,
      }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Resend email request failed");
  }

  if (postId) {
    await supabase
      .from("posts")
      .update({
        approval_email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
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

async function publishVideoPostToFacebook({
  pageId,
  pageAccessToken,
  videoUrl,
  caption,
}) {
  const startResponse = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/video_reels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "start",
        access_token: pageAccessToken,
      }),
    }
  );
  const startResult = await startResponse.json();
  const videoId = startResult?.video_id;
  const uploadUrl = startResult?.upload_url;

  if (!startResponse.ok || !videoId || !uploadUrl) {
    throw new Error(
      getMetaErrorMessage(startResult, "Facebook Reel upload could not be started")
    );
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${pageAccessToken}`,
      file_url: videoUrl,
    },
  });
  const uploadResult = await uploadResponse.json();

  if (!uploadResponse.ok || uploadResult?.success !== true) {
    throw new Error(
      getMetaErrorMessage(uploadResult, "Facebook Reel video upload failed")
    );
  }

  const finishResponse = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/video_reels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "finish",
        video_id: videoId,
        video_state: "PUBLISHED",
        description: caption,
        access_token: pageAccessToken,
      }),
    }
  );
  const finishResult = await finishResponse.json();

  if (!finishResponse.ok || finishResult?.success !== true) {
    throw new Error(
      getMetaErrorMessage(finishResult, "Facebook Reel publishing failed")
    );
  }

  return {
    id: videoId,
    success: true,
  };
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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCaptionLineIntoSentenceChunks(line) {
  const chunks = String(line || "").match(/[^.!?…]+(?:[.!?…]+|$)/gu);
  return chunks?.length ? chunks : [String(line || "")];
}

function dedupeVisibleDestinationDomain(content, destinationUrl) {
  const host = getHostnameFromUrl(destinationUrl).replace(/^www\./, "");

  if (!host) {
    return String(content || "");
  }

  const hostPattern = escapeRegExp(host);
  const createDomainRegex = () =>
    new RegExp(
      String.raw`(?:https?:\/\/)?(?:www\.)?${hostPattern}(?:\/[^\s]*)?`,
      "gi"
    );
  const domainToken = "__SPREELO_DESTINATION_DOMAIN__";
  const tokenizeDomains = (line) =>
    String(line || "").replace(createDomainRegex(), (match) => {
      const trailing = match.match(/[).,!?:;]+$/)?.[0] || "";
      return `${domainToken}${trailing}`;
    });
  const originalLines = String(content || "").split("\n");
  const tokenizedLines = originalLines.map(tokenizeDomains);
  const domainLineIndexes = tokenizedLines
    .map((line, index) => (line.includes(domainToken) ? index : -1))
    .filter((index) => index >= 0);

  if (!domainLineIndexes.length) {
    return String(content || "").trim();
  }

  // The prompt places the domain in the final CTA. Keeping the last
  // occurrence preserves the AI-written, language-specific CTA instead of
  // replacing it with a hardcoded phrase.
  const canonicalLineIndex = domainLineIndexes.at(-1);
  const cleanedLines = tokenizedLines.map((line, lineIndex) => {
    if (!line.includes(domainToken)) {
      return line;
    }

    const chunks = splitCaptionLineIntoSentenceChunks(line);
    const domainChunkIndexes = chunks
      .map((chunk, chunkIndex) =>
        chunk.includes(domainToken) ? chunkIndex : -1
      )
      .filter((chunkIndex) => chunkIndex >= 0);

    if (lineIndex !== canonicalLineIndex) {
      // Remove the complete earlier sentence containing the duplicate domain.
      // This avoids leftovers such as "See the product here" in any language.
      return chunks
        .filter((_, chunkIndex) => !domainChunkIndexes.includes(chunkIndex))
        .join(" ")
        .trim();
    }

    const canonicalChunkIndex = domainChunkIndexes.at(-1);
    return chunks
      .map((chunk, chunkIndex) => ({ chunk, chunkIndex }))
      .filter(({ chunkIndex }) => {
        if (!domainChunkIndexes.includes(chunkIndex)) return true;
        return chunkIndex === canonicalChunkIndex;
      })
      .map(({ chunk, chunkIndex }) => {
        if (chunkIndex !== canonicalChunkIndex) return chunk;

        let seen = false;
        return chunk.replaceAll(domainToken, () => {
          if (seen) return "";
          seen = true;
          return host;
        });
      })
      .join(" ")
      .trim();
  });

  return cleanedLines
    .join("\n")
    .replace(/[ \t]+([,.;!?])/g, "$1")
    .replace(/[ \t]*[:\-–—]+[ \t]*([,.;!?])/g, "$1")
    .replace(/[ \t]*[:\-–—]+[ \t]*(?=\n|$)/gm, "")
    .replace(/^\s*[,:;\-–—]+\s*$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanPostContentUrls(content, destinationUrl = "") {
  const cleanedUrls = String(content || "").replace(/https?:\/\/\S+/gi, (match) =>
    cleanUrlForCaption(match)
  );

  return dedupeVisibleDestinationDomain(cleanedUrls, destinationUrl);
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
  maxAttempts = 6,
  delayMs = 1500,
}) {
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

async function publishVideoPostToInstagram({
  instagramUserId,
  accessToken,
  videoUrl,
  caption,
}) {
  const createResponse = await fetch(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${instagramUserId}/media`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: false,
        access_token: accessToken,
      }),
    }
  );

  const createResult = await createResponse.json();

  if (!createResponse.ok || !createResult?.id) {
    throw new Error(
      getMetaErrorMessage(createResult, "Instagram Reel container creation failed")
    );
  }

  await waitForInstagramContainerReady({
    creationId: createResult.id,
    accessToken,
    instagramUserId,
    maxAttempts: 30,
    delayMs: 3000,
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
      getMetaErrorMessage(publishResult, "Instagram Reel publishing failed")
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
      "id, user_id, brand_profile_id, content, platform, status, published_at, approved_at, scheduled_for, image_url, video_url, video_status, content_format, publish_locked_until, publish_attempts, next_publish_attempt_at, last_publish_error"
    )
    .eq("status", "approved")
    .is("published_at", null)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .order("approved_at", { ascending: true })
    .limit(PUBLISH_BATCH_SIZE * 3);

  if (error) {
    console.error("Could not load approved social posts", {
      message: error.message,
    });

    summary.social_publish_failed += 1;
    return;
  }

  const approvedPosts = (posts || []).filter((post) => {
    const format = normalizeContentFormat(post.content_format);
    const lockUntilMs = new Date(post.publish_locked_until || 0).getTime();
    const nextAttemptMs = new Date(post.next_publish_attempt_at || 0).getTime();
    const lockAvailable = !lockUntilMs || lockUntilMs <= new Date(nowIso).getTime();
    const retryReady = !nextAttemptMs || nextAttemptMs <= new Date(nowIso).getTime();

    return (
      ["single_image", "carousel", "animated_video"].includes(format) &&
      getPublishTargets(post.platform).length > 0 &&
      lockAvailable &&
      retryReady
    );
  }).slice(0, PUBLISH_BATCH_SIZE);

  summary.social_publish_checked += approvedPosts.length;
  let animatedVideoPublishesThisRun = 0;

  for (const post of approvedPosts) {
    const targets = getPublishTargets(post.platform);
    const normalizedFormat = normalizeContentFormat(post.content_format);

    if (
      normalizedFormat === "animated_video" &&
      animatedVideoPublishesThisRun >= MAX_ANIMATED_VIDEO_PUBLISHES_PER_RUN
    ) {
      summary.video_publish_deferred =
        Number(summary.video_publish_deferred || 0) + 1;
      continue;
    }

    if (normalizedFormat === "animated_video") {
      animatedVideoPublishesThisRun += 1;
    }

    const publishAttempt = Number(post.publish_attempts || 0) + 1;
    const publishLockUntilIso = addMinutesIso(new Date(), PUBLISH_LOCK_MINUTES);
    const claimStartedIso = new Date().toISOString();
    const { data: claimedPost, error: claimError } = await supabase
      .from("posts")
      .update({
        publish_locked_until: publishLockUntilIso,
        publish_attempts: publishAttempt,
        last_publish_error: null,
        updated_at: claimStartedIso,
      })
      .eq("id", post.id)
      .eq("status", "approved")
      .is("published_at", null)
      .or(`publish_locked_until.is.null,publish_locked_until.lte.${claimStartedIso}`)
      .select("id")
      .maybeSingle();

    if (claimError || !claimedPost?.id) {
      continue;
    }

    let facebookConnectionForPost = null;
    let instagramConnectionForPost = null;
    let activePublishTarget = null;

    try {
      if (!post.content) {
        await supabase
          .from("posts")
          .update({
            status: "failed",
            publish_locked_until: null,
            next_publish_attempt_at: null,
            last_publish_error: "Post content is missing",
            updated_at: nowIso,
          })
          .eq("id", post.id);
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
            publish_locked_until: null,
            next_publish_attempt_at: null,
            last_publish_error: "Post is missing required publishing data",
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
            publish_locked_until: null,
            next_publish_attempt_at: null,
            last_publish_error: "Post is missing required publishing data",
            updated_at: nowIso,
          })
          .eq("id", post.id);

        summary.instagram_publish_skipped_no_image += 1;
        summary.social_publish_failed += 1;
        continue;
      }

      if (normalizedFormat === "animated_video" && !post.video_url) {
        console.error("Video publish skipped because post has no video URL", {
          postId: post.id,
          userId: post.user_id,
          brandProfileId: post.brand_profile_id,
          platform: post.platform,
          videoStatus: post.video_status || null,
        });

        await supabase
          .from("posts")
          .update({
            status: "failed",
            publish_locked_until: null,
            next_publish_attempt_at: null,
            last_publish_error: "Post is missing required publishing data",
            updated_at: nowIso,
          })
          .eq("id", post.id);

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

        if (normalizedFormat === "animated_video") {
          await publishVideoPostToFacebook({
            pageId: facebookConnection.page_id,
            pageAccessToken: facebookConnection.page_access_token,
            videoUrl: post.video_url,
            caption: post.content,
          });
        } else if (normalizedFormat === "carousel") {
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

        if (normalizedFormat === "animated_video") {
          await publishVideoPostToInstagram({
            instagramUserId: instagramConnection.page_id,
            accessToken: instagramConnection.page_access_token,
            videoUrl: post.video_url,
            caption: buildInstagramCaptionFromPostContent(post.content),
          });
        } else if (normalizedFormat === "carousel") {
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
          publish_locked_until: null,
          next_publish_attempt_at: null,
          last_publish_error: null,
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

      const authFailure = isConnectionAuthFailure(error);
      const shouldRetry = !authFailure && publishAttempt < MAX_PUBLISH_ATTEMPTS;
      const retryDelayMinutes = Math.min(60, 5 * 2 ** Math.max(0, publishAttempt - 1));

      await supabase
        .from("posts")
        .update({
          status: shouldRetry ? "approved" : "failed",
          publish_locked_until: null,
          next_publish_attempt_at: shouldRetry
            ? addMinutesIso(new Date(nowIso), retryDelayMinutes)
            : null,
          last_publish_error: String(error.message || "Social publishing failed").slice(0, 1200),
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

async function getRulesToProcess({
  supabase,
  nowIso,
  now,
  batchSize = SMART_QUEUE_BATCH_SIZE,
  workerCount = SMART_QUEUE_WORKER_COUNT,
}) {
  const horizonIso = addHoursIso(now, SMART_QUEUE_HORIZON_HOURS);
  const claimScanLimit = Math.max(
    batchSize,
    Math.min(
      SMART_QUEUE_CANDIDATE_LIMIT,
      batchSize * Math.max(1, Number(workerCount) || 1) *
        SMART_QUEUE_CLAIM_SCAN_MULTIPLIER
    )
  );

  const { data: upcomingRules, error: upcomingRulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", horizonIso)
    .or(`queue_locked_until.is.null,queue_locked_until.lte.${nowIso}`)
    .order("queue_priority", { ascending: false })
    .order("next_run_at", { ascending: true })
    .limit(SMART_QUEUE_CANDIDATE_LIMIT);

  if (upcomingRulesError) {
    throw new Error(upcomingRulesError.message);
  }

  const readyRules = (upcomingRules || [])
    .filter((rule) => isRuleReadyForGeneration(rule, now))
    .sort((a, b) => {
      const priorityDifference =
        getQueuePriorityScore(b, now) - getQueuePriorityScore(a, now);
      if (priorityDifference !== 0) return priorityDifference;

      return (
        new Date(getScheduledPublishAtIso(a, now)).getTime() -
        new Date(getScheduledPublishAtIso(b, now)).getTime()
      );
    });

  if (readyRules.length >= claimScanLimit) {
    return selectFairQueuedRules(readyRules, claimScanLimit);
  }

  const { data: fallbackRules, error: fallbackRulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .is("next_run_at", null)
    .or(`queue_locked_until.is.null,queue_locked_until.lte.${nowIso}`)
    .limit(SMART_QUEUE_CANDIDATE_LIMIT);

  if (fallbackRulesError) {
    throw new Error(fallbackRulesError.message);
  }

  const oldRulesThatAreDue = (fallbackRules || [])
    .filter((rule) => isRuleDueByOldSchedule(rule, now));

  const uniqueRules = new Map();
  for (const rule of [...readyRules, ...oldRulesThatAreDue]) {
    uniqueRules.set(rule.id, rule);
  }

  const sorted = Array.from(uniqueRules.values()).sort((a, b) => {
    const priorityDifference =
      getQueuePriorityScore(b, now) - getQueuePriorityScore(a, now);
    if (priorityDifference !== 0) return priorityDifference;
    return String(a.id).localeCompare(String(b.id));
  });

  return selectFairQueuedRules(sorted, claimScanLimit);
}

function isAuthorizedCronRequest(request, cronSecret) {
  const authorizationHeader = request.headers.get("authorization");
  const expectedAuthorizationHeader = `Bearer ${cronSecret}`;

  return authorizationHeader === expectedAuthorizationHeader;
}

async function runAutomationCron(request, options = {}) {
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
    const workerCount = Math.max(
      1,
      Number(options.workerCount || SMART_QUEUE_WORKER_COUNT) ||
        SMART_QUEUE_WORKER_COUNT
    );
    const workerName = String(options.workerName || "manual-worker");

    console.info("Shared automation queue started", {
      workerName,
      workerCount,
      checkedAt: nowIso,
    });

    const summary = createEmptySummary();
    const usedWebsiteImageUrlsThisRun = new Set();
    let animatedVideoRendersThisRun = 0;

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
      batchSize: SMART_QUEUE_BATCH_SIZE,
      workerCount,
    });
    summary.queue_candidates = rules?.length || 0;

    console.info("Shared automation queue candidates selected", {
      workerName,
      candidateCount: summary.queue_candidates,
      candidateIds: (rules || []).slice(0, 10).map((rule) => rule.id),
    });

    let claimedRulesThisRun = 0;

    for (const queuedRule of rules || []) {
      if (claimedRulesThisRun >= SMART_QUEUE_BATCH_SIZE) {
        break;
      }

      const scheduledPublishAtIso = getScheduledPublishAtIso(queuedRule, now);
      const rule = resolveAdaptiveWeeklyRule(
        queuedRule,
        scheduledPublishAtIso
      );

      if (
        isAnimatedVideoRule(rule) &&
        animatedVideoRendersThisRun >= MAX_ANIMATED_VIDEO_RENDERS_PER_RUN
      ) {
        summary.skipped += 1;
        summary.video_render_deferred =
          Number(summary.video_render_deferred || 0) + 1;
        continue;
      }

      let automationRunStartedAtIso = null;
      let automationRunLogId = null;
      let automationRunFinished = false;
      let automationRunPostId = null;
      let automationRunWebsiteItem = null;
      let automationRunWebsiteItems = [];

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

        claimedRulesThisRun += 1;
        summary.queue_claimed += 1;
        summary.processed += 1;

        automationRunStartedAtIso = new Date().toISOString();
        automationRunLogId = await createAutomationRunLog({
          supabase,
          rule,
          startedAtIso: automationRunStartedAtIso,
        });

        if (automationRunLogId) {
          summary.automation_run_logs_started += 1;
        }

        let automationDrafts = await findAutomationDraftsForRule({
          supabase,
          ruleId: rule.id,
        });

        const staleIncompleteAnimatedVideoDrafts = automationDrafts.filter(
          (post) => isStaleIncompleteAnimatedVideoDraft(post, now)
        );

        if (staleIncompleteAnimatedVideoDrafts.length > 0) {
          const cleanedAnimatedDraftCount =
            await deleteIncompleteAnimatedVideoDrafts({
              supabase,
              posts: staleIncompleteAnimatedVideoDrafts,
            });

          automationDrafts = automationDrafts.filter(
            (post) =>
              !staleIncompleteAnimatedVideoDrafts.some(
                (stalePost) => stalePost.id === post.id
              )
          );
          summary.cleaned_incomplete_animated_video_drafts =
            Number(summary.cleaned_incomplete_animated_video_drafts || 0) +
            cleanedAnimatedDraftCount;
        }

        const activeIncompleteAnimatedVideoDrafts = automationDrafts.filter(
          (post) =>
            isIncompleteAnimatedVideoDraftPost(post) &&
            !isStaleIncompleteAnimatedVideoDraft(post, now)
        );

        if (activeIncompleteAnimatedVideoDrafts.length > 0) {
          const message =
            `Skipped temporarily because this automation rule has an animated video still rendering. Spreelo will retry automatically after ${INCOMPLETE_ANIMATED_VIDEO_GRACE_MINUTES} minutes if it becomes stale.`;

          await setRuleError(supabase, rule.id, message);
          await finishRunLog("skipped", message, {
            stage: "active_incomplete_animated_video_draft",
            incomplete_animated_video_drafts:
              activeIncompleteAnimatedVideoDrafts.length,
            automatic_retry_after_minutes:
              INCOMPLETE_ANIMATED_VIDEO_GRACE_MINUTES,
          });
          summary.skipped += 1;
          summary.skipped_existing_draft += 1;
          continue;
        }

        const staleIncompleteDrafts = automationDrafts.filter((post) =>
          isStaleIncompleteCarouselDraft(post, now)
        );

        if (staleIncompleteDrafts.length > 0) {
          const recoveryState = await getStaleCarouselRecoveryState({
            supabase,
            ruleId: rule.id,
            currentRunLogId: automationRunLogId,
            now,
          });
          const recoveryAttempt = recoveryState.recoveryCount + 1;
          const automaticRetryScheduled =
            recoveryAttempt <= MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES;

          const cleanedDraftCount = await deleteIncompleteCarouselDrafts({
            supabase,
            posts: staleIncompleteDrafts,
          });

          summary.cleaned_incomplete_carousel_drafts += cleanedDraftCount;

          const staleBeforeIso = new Date(
            now.getTime() - INCOMPLETE_CAROUSEL_DRAFT_GRACE_MINUTES * 60 * 1000
          ).toISOString();

          const recoveredRunLogs = await markAbandonedAutomationRunsRecovered({
            supabase,
            ruleId: rule.id,
            staleBeforeIso,
            deletedDraftCount: cleanedDraftCount,
            recoveryAttempt,
            automaticRetryScheduled,
          });

          automationDrafts = automationDrafts.filter(
            (post) => !staleIncompleteDrafts.some((stalePost) => stalePost.id === post.id)
          );

          if (!automaticRetryScheduled) {
            const message =
              `Automation paused after ${MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES} automatic retries because incomplete carousel drafts kept becoming stale within ${STALE_CAROUSEL_RECOVERY_WINDOW_HOURS} hours. Review the automation logs before reactivating it.`;

            await stopRuleAfterCostProtectedCarouselFailure(
              supabase,
              rule.id,
              message
            );

            await finishRunLog("failed", message, {
              stage: "stale_incomplete_carousel_retry_limit",
              automatic_retry_paused: true,
              recovery_attempt: recoveryAttempt,
              recovery_limit: MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES,
              recovery_window_hours: STALE_CAROUSEL_RECOVERY_WINDOW_HOURS,
              previous_recoveries_in_window: recoveryState.recoveryCount,
              recovery_history_available: recoveryState.historyAvailable,
              latest_recovery_at: recoveryState.latestRecoveryAt,
              deleted_incomplete_drafts: cleanedDraftCount,
              stale_draft_ids: staleIncompleteDrafts.map((post) => post.id),
              recovered_abandoned_run_logs: recoveredRunLogs,
            });

            console.error("Paused automation after repeated stale carousel drafts", {
              ruleId: rule.id,
              recoveryAttempt,
              recoveryLimit: MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES,
              deletedDraftCount: cleanedDraftCount,
              recoveredRunLogs,
              staleDraftIds: staleIncompleteDrafts.map((post) => post.id),
            });

            summary.skipped += 1;
            summary.errors += 1;
            continue;
          }

          console.warn("Recovered stale incomplete carousel draft automatically", {
            ruleId: rule.id,
            recoveryAttempt,
            recoveryLimit: MAX_STALE_CAROUSEL_AUTOMATIC_RECOVERIES,
            recoveryWindowHours: STALE_CAROUSEL_RECOVERY_WINDOW_HOURS,
            deletedDraftCount: cleanedDraftCount,
            recoveredRunLogs,
            staleDraftIds: staleIncompleteDrafts.map((post) => post.id),
          });
        }

        const activeIncompleteDrafts = automationDrafts.filter(
          (post) =>
            isIncompleteCarouselDraftPost(post) &&
            !isStaleIncompleteCarouselDraft(post, now)
        );
        const incompleteCarouselDrafts = countIncompleteCarouselDrafts(activeIncompleteDrafts);

        if (incompleteCarouselDrafts > 0) {
          const message =
            `Skipped temporarily because this automation rule has an incomplete carousel draft newer than ${INCOMPLETE_CAROUSEL_DRAFT_GRACE_MINUTES} minutes. Spreelo will retry automatically if the draft becomes stale.`;

          await setRuleError(supabase, rule.id, message);

          await finishRunLog("skipped", message, {
            stage: "active_incomplete_carousel_draft",
            incomplete_carousel_drafts: incompleteCarouselDrafts,
            automatic_retry_after_minutes: INCOMPLETE_CAROUSEL_DRAFT_GRACE_MINUTES,
          });

          summary.skipped += 1;
          summary.skipped_existing_draft += 1;
          continue;
        }

        const existingCompleteDraft = automationDrafts.find(
          (post) => isCompleteAutomationDraft(post) && isRecentAutomationDraft(post, now)
        );

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

        if (isAnimatedVideoRule(rule)) {
          animatedVideoRendersThisRun += 1;
        }


        const creditCost = Number(rule.credit_cost || 1);
        const hasReservedCredits =
          rule.credit_reservation_status === "reserved" &&
          Number(rule.credit_reserved_amount || 0) >= creditCost;

        let creditsRemaining = 0;

        if (!hasReservedCredits) {
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

          creditsRemaining = Number(balance.credits_remaining || 0);

          if (creditsRemaining < creditCost) {
            const message = "Not enough credits";

            await setRuleError(supabase, rule.id, message);

            await finishRunLog("skipped", message, { stage: "credits" });

            summary.skipped += 1;
            summary.not_enough_credits += 1;
            continue;
          }
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
const focusedPageContext = await prepareFocusedPageContextForRule(rule);

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
            websitePreparedRule = preparedCarouselProducts.websiteRule || rule;
            automationRunWebsiteItem = websiteItem;
            automationRunWebsiteItems = websiteItems;
          } catch (carouselError) {
            const message = carouselError.message ||
              `Website carousel needs at least ${CAROUSEL_MIN_PRODUCT_SLIDES} products with product images.`;

            await stopRuleAfterCostProtectedCarouselFailure(supabase, rule.id, message);

            await finishRunLog("failed", message, {
              stage: "carousel_product_prepare",
              retry_disabled: true,
              cost_protection: true,
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
          focused_page_context: focusedPageContext,
        };

        if (isWebsiteTextAdRule(ruleWithBrandProfile) && !websiteItem?.image_url) {
          throw new Error(
            "Text + ad from website needs a verified product image. No usable image was found for the selected website item."
          );
        }

        if (isAnimatedVideoRule(ruleWithBrandProfile) && !websiteItem?.image_url) {
          throw new Error(
            "Animated product video needs a verified product image. No usable image was found for the selected website item."
          );
        }

        const rawGeneratedContent = await generateAutomationPost(
          openai,
          ruleWithBrandProfile
        );

        const sanitizedGeneratedContent = sanitizeUnsupportedOfferLanguage(
          rawGeneratedContent,
          websiteItem
        );
        const generatedContent = cleanPostContentUrls(
          removePricesFromAnimatedCaption(
            sanitizedGeneratedContent,
            ruleWithBrandProfile
          ),
          getPostDestinationUrl(ruleWithBrandProfile)
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
const postStatus =
  isCarouselRule(rule) || isAnimatedVideoRule(rule)
    ? "generating"
    : "pending_approval";
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
  getRuleContentSourceUrl(ruleWithBrandProfile) ||
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
            source_label: getRuleContentSourceUrl(ruleWithBrandProfile)
              ? "Generated from selected website page"
              : rule.uses_website_content
              ? "Generated from website"
              : "Generated by automation",
            automation_rule_id: rule.id,

        status: postStatus,
approval_required: true,
approval_token: approvalToken,
approved_at: null,
scheduled_for: scheduledPublishAtIso,
            image_status: wantsImage ? "generating" : "none",
            image_prompt: wantsImage ? rule.image_prompt || null : null,
            content_format: normalizeContentFormat(rule.content_format),
            video_status: isAnimatedVideoRule(rule) ? "rendering" : "none",
            video_provider: isAnimatedVideoRule(rule) ? "shotstack" : null,
            video_duration_seconds: isAnimatedVideoRule(rule)
              ? ANIMATED_VIDEO_DURATION_SECONDS
              : null,
    text_model_used: POST_TEXT_MODEL,
image_model_used:
  wantsImage && rule.image_source !== "uploaded"
    ? isAnimatedVideoRule(rule)
      ? ANIMATED_OVERLAY_IMAGE_MODEL
      : IMAGE_MODEL
    : null,
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
        let videoUrl = null;
        let videoStoragePath = null;
        let videoRenderId = null;

        const isWebsiteBasedPost = Boolean(rule.uses_website_content || websiteItem || websiteSourceUrl);
        const ruleImageSource = String(rule.image_source || "").trim().toLowerCase();

        if (wantsImage && ruleImageSource === "uploaded") {
          if (!rule.uploaded_image_url) {
            throw new Error(
              "Custom post is configured to use an uploaded image, but the image URL is missing."
            );
          }

          const sourceImageBuffer = await fetchImageBufferForOverlay(
            rule.uploaded_image_url
          );
          const normalizedUploadedImageBuffer = await sharp(sourceImageBuffer)
            .rotate()
            .resize({
              width: 2048,
              height: 2048,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer();
          const uploadedPostImagePath = `${rule.user_id}/${post.id}-uploaded.png`;

          const { error: uploadedPostImageError } = await supabase.storage
            .from("post-images")
            .upload(uploadedPostImagePath, normalizedUploadedImageBuffer, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadedPostImageError) {
            throw new Error(
              uploadedPostImageError.message ||
                "Could not copy uploaded image for the generated post"
            );
          }

          const { data: uploadedPostPublicUrlData } = supabase.storage
            .from("post-images")
            .getPublicUrl(uploadedPostImagePath);

          imageUrl = uploadedPostPublicUrlData?.publicUrl || null;
          imageStoragePath = uploadedPostImagePath;
          finalImagePrompt = "Customer-uploaded image used without AI generation.";

          if (!imageUrl) {
            throw new Error("Could not create a public URL for the uploaded image");
          }

          const { error: uploadedImageUpdateError } = await supabase
            .from("posts")
            .update({
              image_url: imageUrl,
              image_storage_path: imageStoragePath,
              image_status: "ready",
              image_prompt: finalImagePrompt,
              include_logo: false,
              logo_url: null,
              updated_at: nowIso,
            })
            .eq("id", post.id);

          if (uploadedImageUpdateError) {
            throw new Error(
              uploadedImageUpdateError.message ||
                "Could not attach uploaded image to post"
            );
          }

          summary.uploaded_image_used =
            Number(summary.uploaded_image_used || 0) + 1;
        } else if (wantsImage && isAnimatedVideoRule(ruleWithBrandProfile)) {
          try {
            finalImagePrompt =
              "9:16 animated product Reel using an automatically selected uploaded MP4 background, the unchanged original website product, a separate OpenAI text overlay and Shotstack HTML5 zoom motion.";

            const animatedVideo = await generateAnimatedProductVideo({
              openai,
              supabase,
              rule: ruleWithBrandProfile,
              postContent: generatedContent,
              userId: rule.user_id,
              postId: post.id,
            });

            imageUrl = animatedVideo.posterUrl;
            imageStoragePath = animatedVideo.posterStoragePath;
            videoUrl = animatedVideo.videoUrl;
            videoStoragePath = animatedVideo.videoStoragePath;
            videoRenderId = animatedVideo.renderId;

            const { error: animatedVideoUpdateError } = await supabase
              .from("posts")
              .update({
                image_url: imageUrl,
                image_storage_path: imageStoragePath,
                image_status: "ready",
                image_prompt: finalImagePrompt,
                video_url: videoUrl,
                video_storage_path: videoStoragePath,
                video_status: "ready",
                video_render_id: videoRenderId,
                video_provider: "shotstack",
                video_duration_seconds: ANIMATED_VIDEO_DURATION_SECONDS,
                video_error: null,
                include_logo: shouldUseLogoForRule(rule, brandProfile),
                logo_url: shouldUseLogoForRule(rule, brandProfile)
                  ? brandProfile?.logo_url || null
                  : null,
                video_background_asset_id: animatedVideo.backgroundAsset?.id || null,
                video_background_family: animatedVideo.backgroundAsset?.family || null,
                video_background_selection: animatedVideo.backgroundSelection || null,
                updated_at: nowIso,
              })
              .eq("id", post.id);

            if (animatedVideoUpdateError) {
              throw new Error(
                animatedVideoUpdateError.message ||
                  "Could not attach animated product video to post"
              );
            }

            usedWebsiteImageUrlsThisRun.add(
              normalizeComparableValue(websiteItem?.image_url)
            );
            summary.video_generated = Number(summary.video_generated || 0) + 1;
            summary.website_image_used += 1;
          } catch (videoError) {
            console.error("Animated product video generation failed", {
              ruleId: rule.id,
              postId: post.id,
              message: videoError.message,
            });

            await Promise.allSettled([
              supabase.storage.from("post-images").remove([
                `${rule.user_id}/${post.id}-animation-product-layer.png`,
                `${rule.user_id}/${post.id}-animation-text-overlay.png`,
                `${rule.user_id}/${post.id}-animation-logo-overlay.png`,
                `${rule.user_id}/${post.id}-animation-poster.png`,
              ]),
              supabase.storage
                .from(POST_VIDEOS_BUCKET)
                .remove([`${rule.user_id}/${post.id}.mp4`]),
            ]);

            imageUrl = null;
            imageStoragePath = null;
            videoUrl = null;
            videoStoragePath = null;
            videoRenderId = null;

            await supabase
              .from("posts")
              .update({
                image_url: null,
                image_storage_path: null,
                image_status: "failed",
                image_prompt: finalImagePrompt,
                video_url: null,
                video_storage_path: null,
                video_status: "failed",
                video_error: truncateText(videoError.message || "Video generation failed", 1000),
                updated_at: nowIso,
              })
              .eq("id", post.id);

            summary.video_generation_failed =
              Number(summary.video_generation_failed || 0) + 1;
            summary.warnings += 1;
          }
        } else if (wantsImage && isWebsiteTextAdRule(ruleWithBrandProfile)) {
          try {
            const { imageBase64, imagePrompt } = await generateWebsiteItemAdImage(
              openai,
              ruleWithBrandProfile,
              generatedContent
            );

            const uploadedImage = await uploadGeneratedImageToStorage({
              supabase,
              imageBase64,
              userId: rule.user_id,
              postId: post.id,
              fileSuffix: "website-text-ad",
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
                imageUpdateError.message || "Could not update post with website text ad image"
              );
            }

            usedWebsiteImageUrlsThisRun.add(
              normalizeComparableValue(websiteItem?.image_url)
            );
            summary.image_generated += 1;
            summary.website_image_used += 1;
          } catch (imageError) {
            console.error("Website Text + Ad image generation failed", {
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
        } else if (wantsImage && websiteItem?.image_url && useWebsiteImage) {
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

        if (isAnimatedVideoRule(rule)) {
          if (!videoUrl) {
            const message = "Animated product video could not be rendered.";

            await supabase
              .from("posts")
              .update({
                status: "failed",
                video_status: "failed",
                video_error: message,
                updated_at: new Date().toISOString(),
              })
              .eq("id", post.id);

            await setRuleError(supabase, rule.id, message);
            await finishRunLog("failed", message, {
              stage: "animated_video_render",
            });
            summary.errors += 1;
            continue;
          }

          const { error: animatedReadyStatusError } = await supabase
            .from("posts")
            .update({
              status: "pending_approval",
              updated_at: new Date().toISOString(),
            })
            .eq("id", post.id);

          if (animatedReadyStatusError) {
            const message =
              animatedReadyStatusError.message ||
              "Could not mark animated video ready for approval";
            await setRuleError(supabase, rule.id, message);
            await finishRunLog("failed", message, {
              stage: "animated_video_ready",
            });
            summary.errors += 1;
            continue;
          }

          effectivePostStatus = "pending_approval";
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

        if (!hasReservedCredits) {
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
        }

        const ruleUpdatePayload = getRuleUpdatePayloadAfterSuccess(
          rule,
          nowIso,
          now,
          scheduledPublishAtIso
        );

        if (rule.schedule_type === "weekly" && ruleUpdatePayload.next_run_at) {
          const nextAdaptiveRule = resolveAdaptiveWeeklyRule(
            queuedRule,
            ruleUpdatePayload.next_run_at
          );
          ruleUpdatePayload.credit_cost = Number(
            nextAdaptiveRule?.credit_cost || queuedRule.credit_cost || rule.credit_cost || 1
          );
        }

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

        let reservedCreditResult = null;
        if (hasReservedCredits) {
          const { data: consumedReservation, error: consumeReservationError } =
            await supabase.rpc("consume_reserved_automation_credit", {
              p_rule_id: rule.id,
              p_post_id: post.id,
            });

          if (consumeReservationError) {
            console.error("Could not consume or renew reserved automation credits", {
              ruleId: rule.id,
              postId: post.id,
              message: consumeReservationError.message,
            });
            summary.warnings += 1;
          } else {
            reservedCreditResult = consumedReservation;
          }
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
          credits_were_reserved: hasReservedCredits,
          next_recurring_credit_reserved: Boolean(reservedCreditResult?.next_reserved),
          recurring_plan_paused_for_credits: Boolean(reservedCreditResult?.paused),
        });
      } catch (error) {
        const message = error.message || "Unknown automation error";

        await setRuleError(supabase, rule.id, message);

        await finishRunLog("failed", message, { stage: "unhandled" });

        summary.errors += 1;
      }
    }

    console.info("Shared automation queue finished", {
      workerName,
      fetchedRules: rules?.length || 0,
      claimedRules: claimedRulesThisRun,
      generated: summary.generated,
      published: summary.social_published,
      skipped: summary.skipped,
      errors: summary.errors,
    });

    return Response.json({
      ok: true,
      mode: "live_text_image_facebook_brand_profile_website_content_history",
      checked_at: nowIso,
      batch_size: SMART_QUEUE_BATCH_SIZE,
      queue_mode: "shared_atomic_claim",
      worker_name: workerName,
      worker_count: workerCount,
      fetched_rules: rules?.length || 0,
      claimed_rules: claimedRulesThisRun,
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


export async function GET(request) {
  const requestUrl = new URL(request.url);
  const requestedWorkerCount = Math.max(
    1,
    Number(
      requestUrl.searchParams.get("workerCount") || SMART_QUEUE_WORKER_COUNT
    ) || SMART_QUEUE_WORKER_COUNT
  );

  return runAutomationCron(request, {
    workerCount: requestedWorkerCount,
    workerName:
      requestUrl.searchParams.get("workerName") || "manual-worker",
  });
}
