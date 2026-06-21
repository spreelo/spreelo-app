"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_TIME_ZONE = "Europe/Stockholm";
const AUTO_PLAN_IMAGE_COUNT = 2;
const DEFAULT_AUTO_PLAN_POST_COUNT = 5;
const autoPlanPostCountOptions = [3, 5, 7];

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const dayOrder = weekdays;

const recommendedWeeklySchedule = [
  {
    weekday: "Monday",
    publishTime: "09:00",
  },
  {
    weekday: "Tuesday",
    publishTime: "10:00",
  },
  {
    weekday: "Wednesday",
    publishTime: "11:00",
  },
  {
    weekday: "Thursday",
    publishTime: "10:00",
  },
  {
    weekday: "Friday",
    publishTime: "09:00",
  },
];

const recommendedTimesByWeekday = recommendedWeeklySchedule.reduce(
  (result, item) => ({
    ...result,
    [item.weekday]: item.publishTime,
  }),
  {}
);

function createTimeOptions() {
  const options = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const hourLabel = String(hour).padStart(2, "0");
      const minuteLabel = String(minute).padStart(2, "0");

      options.push(`${hourLabel}:${minuteLabel}`);
    }
  }

  return options;
}

const timeOptions = createTimeOptions();

const commonTimeZones = [
  "Europe/Stockholm",
  "Europe/Copenhagen",
  "Europe/Oslo",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const contentTypes = [
  {
    id: "website_item",
    label: "Sell something from my website",
    shortLabel: "Website item",
    description:
      "Pick a product, service, listing or offer from your website and turn it into a post.",
    prompt:
      "Use the website URL from the brand profile. Identify one concrete product, service, listing, offer or other sellable item from the website. Create a social media post that promotes that specific item in a helpful, trustworthy and sales-focused way. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, opening hours, features or availability.",
    imagePrompt:
      "Use a relevant image connected to the selected website item if one can be found. Avoid logos, banners, hero images, decorative icons and unrelated images. If no clearly relevant product, service, listing or offer image can be found, create a professional AI image based on the selected item instead.",
    usesWebsiteContent: true,
  },
    {
    id: "problem_solution",
    label: "Problem → Solution",
    shortLabel: "Problem solved",
    description: "Highlight a customer problem and show how your business solves it.",
    prompt:
      "Create a social media post that starts from a real customer problem, frustration, need or question related to this business. Then explain how the business, service or offer helps solve that problem. Make it useful, trustworthy and specific. Do not exaggerate, scare the audience or invent guarantees.",
    imagePrompt:
      "Create a professional image that visualizes a customer problem being solved in a natural and trustworthy way. Make it relevant to the business, polished and believable. Do not include readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "tips",
    label: "Tips & advice",
    shortLabel: "Tips",
    description: "Teach the audience something useful.",
    prompt:
      "Create a useful social media post that teaches the audience one practical tip related to this business. Make it specific, helpful and easy to understand. Avoid sounding like an advertisement.",
    imagePrompt:
      "Create a professional image that visually supports a helpful tip. Make it relevant to the business, clear, polished and not generic.",
    usesWebsiteContent: false,
  },
  {
    id: "mistakes",
    label: "Common mistakes",
    shortLabel: "Mistakes",
    description: "Show expertise and help customers avoid problems.",
    prompt:
      "Create a social media post about common mistakes customers often make related to this business, product or service. Explain them in a helpful and non-judgmental way, and position the business as knowledgeable and trustworthy.",
    imagePrompt:
      "Create a professional image that suggests common mistakes or things to avoid in a tasteful, helpful and non-negative way.",
    usesWebsiteContent: false,
  },
  {
    id: "faq",
    label: "FAQ / Questions",
    shortLabel: "FAQ",
    description: "Answer a common customer question.",
    prompt:
      "Create a social media post that answers a common customer question related to this business. Make the answer clear, trustworthy and useful. The post should reduce uncertainty and make it easier for the customer to take the next step.",
    imagePrompt:
      "Create a professional image that supports a question-and-answer or guidance theme, without adding readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "behind_scenes",
    label: "Behind the scenes",
    shortLabel: "Behind scenes",
    description: "Build trust by showing the process.",
    prompt:
      "Create a behind-the-scenes social media post for this business. Show what happens in the process, preparation, workday or service delivery. Make it feel authentic, trustworthy and interesting.",
    imagePrompt:
      "Create an authentic behind-the-scenes style image connected to the business or service. Make it natural, professional and trustworthy.",
    usesWebsiteContent: false,
  },
  {
    id: "checklist",
    label: "Checklist",
    shortLabel: "Checklist",
    description: "Create a save-worthy post.",
    prompt:
      "Create a practical checklist-style social media post related to this business. Make it easy to save, useful and specific. Keep the structure clear and helpful.",
    imagePrompt:
      "Create a professional image that visually supports a checklist or preparation theme, without adding readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "service_focus",
    label: "Service in focus",
    shortLabel: "Service",
    description: "Explain one service without hard selling.",
    prompt:
      "Create a social media post that explains one service or offer from this business in a clear and helpful way. Focus on the value for the customer, not hard selling.",
    imagePrompt:
      "Create a professional image that visualizes the service or customer benefit in a believable and polished way.",
    usesWebsiteContent: false,
  },
  {
    id: "case_example",
    label: "Customer case / example",
    shortLabel: "Case",
    description: "Use examples to build trust.",
    prompt:
      "Create a social media post based on a realistic customer case or example for this business. Do not invent sensitive personal details. Make it feel credible, useful and trust-building.",
    imagePrompt:
      "Create a professional image that supports a customer example or real-life scenario, without showing private or sensitive details.",
    usesWebsiteContent: false,
  },
  {
    id: "myth_fact",
    label: "Myth vs fact",
    shortLabel: "Myth vs fact",
    description: "Correct misunderstandings.",
    prompt:
      "Create a myth-vs-fact style social media post related to this business or industry. Correct a common misunderstanding and explain the truth in a simple, trustworthy way.",
    imagePrompt:
      "Create a professional image that suggests clarity, understanding or comparison, without adding readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "local",
    label: "Local connection",
    shortLabel: "Local",
    description: "Make the post feel locally relevant.",
    prompt:
      "Create a social media post with a local angle for this business. Make it feel relevant to the local community, season, area or everyday customer situation. Keep it natural and not forced.",
    imagePrompt:
      "Create a professional image with a local or community feeling that fits the business, without using specific landmarks unless clearly provided.",
    usesWebsiteContent: false,
  },
  {
    id: "seasonal",
    label: "Seasonal post",
    shortLabel: "Seasonal",
    description: "Connect content to current timing.",
    prompt:
      "Create a seasonal or timely social media post for this business. Connect the message to the current season, common customer needs or relevant timing in a natural way.",
    imagePrompt:
      "Create a professional seasonal image that fits the business and timing, avoiding clichés and readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "comparison",
    label: "Comparison",
    shortLabel: "Comparison",
    description: "Explain differences clearly.",
    prompt:
      "Create a social media post that compares two options, approaches or choices related to this business. Help the customer understand the difference and make a better decision.",
    imagePrompt:
      "Create a professional image that suggests comparison or decision-making in a clean and tasteful way, without split-screen text.",
    usesWebsiteContent: false,
  },
   {
    id: "mini_guide",
    label: "Mini-guide",
    shortLabel: "Mini-guide",
    description: "Give deeper value in one post.",
    prompt:
      "Create a mini-guide social media post related to this business. Teach the audience something useful in a structured way with clear steps or sections.",
    imagePrompt:
      "Create a professional image that supports a guide or learning theme, clean and easy to understand without readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "manual_prompt",
    label: "Manual prompt",
    shortLabel: "Manual",
    description: "Write your own instructions for this post.",
    prompt: "",
    imagePrompt: "",
    usesWebsiteContent: false,
    isManualPrompt: true,
  },
];

const recommendedContentTypeIds = [
  "website_item",
  "tips",
  "mistakes",
  "behind_scenes",
  "faq",
];

const autoPlanGoals = [
  {
    id: "sell_more",
    icon: "💰",
    label: "Sell more",
    description:
      "More product, service and offer focused posts that help people take action.",
  },
  {
    id: "get_followers",
    icon: "📈",
    label: "Get more followers",
    description:
      "Useful, save-worthy and share-friendly posts that make the account worth following.",
  },
  {
    id: "build_trust",
    icon: "🤝",
    label: "Build trust",
    description:
      "Posts that show expertise, process, examples and answers to common questions.",
  },
  {
    id: "educate_customers",
    icon: "🎓",
    label: "Educate customers",
    description:
      "Helpful posts that teach customers what they should know before they buy.",
  },
  {
    id: "stay_visible",
    icon: "📅",
    label: "Stay visible",
    description:
      "A balanced weekly mix that keeps the business active and consistent.",
  },
];

const autoPlanStrategies = {
  sell_more: {
    label: "Sell more",
    contentTypeIds: [
      "website_item",
      "website_item",
      "website_item",
      "tips",
      "mistakes",
      "behind_scenes",
      "faq",
    ],
    imageCount: 4,
  },
  get_followers: {
    label: "Get more followers",
    contentTypeIds: [
      "tips",
      "checklist",
      "myth_fact",
      "seasonal",
      "local",
      "comparison",
      "faq",
    ],
    imageCount: 3,
  },
  build_trust: {
    label: "Build trust",
    contentTypeIds: [
      "case_example",
      "behind_scenes",
      "faq",
      "problem_solution",
      "service_focus",
      "case_example",
      "tips",
    ],
    imageCount: 3,
  },
  educate_customers: {
    label: "Educate customers",
    contentTypeIds: [
      "tips",
      "mini_guide",
      "faq",
      "comparison",
      "mistakes",
      "checklist",
      "myth_fact",
    ],
    imageCount: 2,
  },
  stay_visible: {
    label: "Stay visible",
    contentTypeIds: [
      "problem_solution",
      "tips",
      "behind_scenes",
      "faq",
      "seasonal",
      "case_example",
      "local",
    ],
    imageCount: 2,
  },
};

function makeSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getContentTypeById(typeId) {
  return contentTypes.find((type) => type.id === typeId) || null;
}
function getBrandSafeContentTypeId(typeId, websiteProductModeAvailable) {
  if (typeId === "website_item" && !websiteProductModeAvailable) {
    return "problem_solution";
  }

  return typeId;
}

function getBrandSafeContentTypeIds(typeIds, websiteProductModeAvailable) {
  return typeIds.map((typeId) =>
    getBrandSafeContentTypeId(typeId, websiteProductModeAvailable)
  );
}
function getGoalContentTypeIds({
  goalId,
  postCount,
  websiteProductModeAvailable,
}) {
  if (!goalId) return [];

  const strategy = getAutoPlanStrategy(goalId);

  const safeContentTypeIds = getBrandSafeContentTypeIds(
    strategy.contentTypeIds,
    websiteProductModeAvailable
  );

  const count = Number(postCount) || DEFAULT_AUTO_PLAN_POST_COUNT;

  return Array.from({ length: count }).map((_, index) => {
    return safeContentTypeIds[index % safeContentTypeIds.length];
  });
}
function getVisibleContentTypes(websiteProductModeAvailable) {
  return contentTypes.filter((type) => {
    if (type.id === "website_item") {
      return Boolean(websiteProductModeAvailable);
    }

    return true;
  });
}
function getAutoPlanStrategy(goalId) {
  return autoPlanStrategies[goalId] || autoPlanStrategies.stay_visible;
}

function getAutoPlanGoalLabel(goalId) {
  if (!goalId) return "Choose a goal";
  return getAutoPlanStrategy(goalId).label;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getDateInputValueInTimeZone(
  date = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateString(dateString, daysToAdd) {
  const [yearValue, monthValue, dayValue] = String(dateString || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));

  return `${date.getUTCFullYear()}-${padNumber(
    date.getUTCMonth() + 1
  )}-${padNumber(date.getUTCDate())}`;
}

function getDatePartsFromDateString(dateString) {
  const [yearValue, monthValue, dayValue] = String(dateString || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  return { year, month, day };
}

function getMonthStartDateString(dateString) {
  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return getDateInputValueInTimeZone(new Date(), DEFAULT_TIME_ZONE).slice(
      0,
      8
    ) + "01";
  }

  return `${parts.year}-${padNumber(parts.month)}-01`;
}

function getMonthLabel(dateString) {
  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return "";
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, 1));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function moveMonth(dateString, amount) {
  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return dateString;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));

  return `${date.getUTCFullYear()}-${padNumber(
    date.getUTCMonth() + 1
  )}-01`;
}

function buildCalendarDays(monthStartDateString) {
  const parts = getDatePartsFromDateString(monthStartDateString);

  if (!parts) {
    return [];
  }

  const firstDay = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const firstDayIndex = firstDay.getUTCDay();
  const mondayBasedOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const calendarStart = new Date(
    Date.UTC(parts.year, parts.month - 1, 1 - mondayBasedOffset)
  );

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(calendarStart);
    date.setUTCDate(calendarStart.getUTCDate() + index);

    return {
      dateString: `${date.getUTCFullYear()}-${padNumber(
        date.getUTCMonth() + 1
      )}-${padNumber(date.getUTCDate())}`,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === parts.month - 1,
    };
  });
}

function getWeekdayInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(date);
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

function getWeekdayFromDateString(dateString, timeZone = DEFAULT_TIME_ZONE) {
  if (!dateString) {
    return "Monday";
  }

  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return "Monday";
  }

  const date = zonedLocalToUtcDate({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone,
  });

  return getWeekdayInTimeZone(date, timeZone);
}

function formatStartDateLabel(dateString, timeZone = DEFAULT_TIME_ZONE) {
  if (!dateString) {
    return "No start date";
  }

  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return "No start date";
  }

  const date = zonedLocalToUtcDate({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone,
  });

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

function getRecommendedTimeForWeekday(weekday) {
  return recommendedTimesByWeekday[weekday] || "09:00";
}

function getRecommendedTimeForDate(dateString, timeZone = DEFAULT_TIME_ZONE) {
  const weekday = getWeekdayFromDateString(dateString, timeZone);

  return getRecommendedTimeForWeekday(weekday);
}

function buildSmartSlotSchedule({
  startDate,
  count,
  timeZone = DEFAULT_TIME_ZONE,
  firstPublishTime = null,
}) {
  const startWeekday = getWeekdayFromDateString(startDate, timeZone);
  const startWeekdayIndex = dayOrder.indexOf(startWeekday);

  if (!startDate || startWeekdayIndex === -1 || count <= 0) {
    return [];
  }

  const result = [
    {
      startDate,
      weekday: startWeekday,
      publishTime:
        firstPublishTime || getRecommendedTimeForWeekday(startWeekday),
    },
  ];

  if (count === 1) {
    return result;
  }

  let weekOffset = 0;

  while (result.length < count && weekOffset < 20) {
    const candidates = recommendedWeeklySchedule
      .map((item) => {
        const targetWeekdayIndex = dayOrder.indexOf(item.weekday);

        let daysUntilTarget =
          ((targetWeekdayIndex - startWeekdayIndex + 7) % 7) +
          weekOffset * 7;

        if (daysUntilTarget === 0) {
          daysUntilTarget = 7;
        }

        const itemStartDate = addDaysToDateString(startDate, daysUntilTarget);

        return {
          startDate: itemStartDate,
          weekday: item.weekday,
          publishTime: item.publishTime,
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const candidate of candidates) {
      const alreadyExists = result.some(
        (item) => item.startDate === candidate.startDate
      );

      if (alreadyExists) {
        continue;
      }

      if (result.length >= count) {
        break;
      }

      result.push(candidate);
    }

    weekOffset += 1;
  }

  return result;
}

function applySmartScheduleToSlots(
  currentSlots,
  startDate,
  timeZone = DEFAULT_TIME_ZONE,
  firstPublishTime = null
) {
  const smartSchedule = buildSmartSlotSchedule({
    startDate,
    count: currentSlots.length,
    timeZone,
    firstPublishTime,
  });

  return currentSlots.map((slot, index) => {
    const schedule = smartSchedule[index];

    if (!schedule) {
      return slot;
    }

    return {
      ...slot,
      startDate: schedule.startDate,
      weekday: schedule.weekday,
      publishTime: schedule.publishTime,
    };
  });
}

function createSlot(overrides = {}) {
  const timeZone = overrides.timeZone || DEFAULT_TIME_ZONE;
  const startDate =
    overrides.startDate || getDateInputValueInTimeZone(new Date(), timeZone);
  const weekday =
    overrides.weekday || getWeekdayFromDateString(startDate, timeZone);
  const publishTime =
    overrides.publishTime || getRecommendedTimeForWeekday(weekday);

  return {
    id: makeSlotId(),
    weekday,
    startDate,
    publishTime,
    prompt: overrides.prompt || "",
    generateImage: Boolean(overrides.generateImage),
    imagePrompt: overrides.imagePrompt || "",
    includeEmojis:
      typeof overrides.includeEmojis === "boolean"
        ? overrides.includeEmojis
        : true,
    includeHashtags:
      typeof overrides.includeHashtags === "boolean"
        ? overrides.includeHashtags
        : true,
contentTypeId: overrides.contentTypeId || null,
contentTypeLabel: overrides.contentTypeLabel || null,
usesWebsiteContent: Boolean(overrides.usesWebsiteContent),
isCampaignSlot: Boolean(overrides.isCampaignSlot),
campaignRole: overrides.campaignRole || "",
campaignSummary: overrides.campaignSummary || "",
campaignPhase: overrides.campaignPhase || "",
marketingAngle: overrides.marketingAngle || "",
customerStage: overrides.customerStage || "",
ctaStrength: overrides.ctaStrength || "",
campaignPostIndex: overrides.campaignPostIndex || null,
campaignPostCount: overrides.campaignPostCount || null,
campaignGoal: overrides.campaignGoal || "",
targetCustomerNeed: overrides.targetCustomerNeed || "",
strategyNotes: overrides.strategyNotes || "",
dateLocked: Boolean(overrides.dateLocked),
  };
}

function createSlotFromContentType(type, index = 0, options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const startDate =
    options.startDate || getDateInputValueInTimeZone(new Date(), timeZone);

  const smartSchedule = buildSmartSlotSchedule({
    startDate,
    count: index + 1,
    timeZone,
    firstPublishTime: options.firstPublishTime || null,
  });

  const schedule = smartSchedule[index] || {
    startDate,
    weekday: getWeekdayFromDateString(startDate, timeZone),
    publishTime: getRecommendedTimeForDate(startDate, timeZone),
  };

  const shouldGenerateImage =
    typeof options.generateImage === "boolean"
      ? options.generateImage
      : type.id === "manual_prompt"
      ? false
      : true;

  return createSlot({
    weekday: schedule.weekday,
    startDate: schedule.startDate,
    publishTime: schedule.publishTime,
    prompt: type.prompt,
    imagePrompt: type.imagePrompt,
    generateImage: shouldGenerateImage,
    contentTypeId: type.id,
    contentTypeLabel: type.label,
    usesWebsiteContent: Boolean(type.usesWebsiteContent),
    timeZone,
  });
}

function shouldAutoPlanGenerateImage(index, imageCount = AUTO_PLAN_IMAGE_COUNT) {
  return index < imageCount;
}

function createRecommendedSlots(options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const startDate =
    options.startDate || getDateInputValueInTimeZone(new Date(), timeZone);
  const strategy = getAutoPlanStrategy(options.autoPlanGoal);
  const postCount = options.postCount || DEFAULT_AUTO_PLAN_POST_COUNT;

   const repeatedTypeIds = getGoalContentTypeIds({
  goalId: options.autoPlanGoal,
  postCount,
  websiteProductModeAvailable: options.websiteProductModeAvailable !== false,
});

  const types = repeatedTypeIds.map(getContentTypeById).filter(Boolean);

  const smartSchedule = buildSmartSlotSchedule({
    startDate,
    count: types.length,
    timeZone,
    firstPublishTime: options.firstPublishTime || null,
  });

  return types.map((type, index) => {
    const schedule = smartSchedule[index] || {
      startDate,
      weekday: getWeekdayFromDateString(startDate, timeZone),
      publishTime: getRecommendedTimeForDate(startDate, timeZone),
    };

    return createSlot({
      weekday: schedule.weekday,
      startDate: schedule.startDate,
      publishTime: schedule.publishTime,
      prompt: type.prompt,
      imagePrompt: type.imagePrompt,
      generateImage:
  type.id === "website_item"
    ? true
    : shouldAutoPlanGenerateImage(index, strategy.imageCount),
      contentTypeId: type.id,
      contentTypeLabel: type.label,
      usesWebsiteContent: Boolean(type.usesWebsiteContent),
      timeZone,
    });
  });
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function getBrowserTimeZone() {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
    );
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function getOneTimeRunAtIso(
  runDate,
  publishTime,
  timeZone = DEFAULT_TIME_ZONE
) {
  const normalizedPublishTime = normalizeTime(publishTime);

  if (!runDate || !normalizedPublishTime) {
    return null;
  }

  const [yearValue, monthValue, dayValue] = runDate.split("-");
  const [hourValue, minuteValue] = normalizedPublishTime.split(":");

  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  const runUtcDate = zonedLocalToUtcDate({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    timeZone,
  });

  return runUtcDate.toISOString();
}

function getInitialWeeklyRunAtIsoFromStartDate(
  startDate,
  publishTime,
  timeZone = DEFAULT_TIME_ZONE,
  now = new Date()
) {
  let candidateDate = startDate;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidateIso = getOneTimeRunAtIso(
      candidateDate,
      publishTime,
      timeZone
    );

    if (!candidateIso) {
      return null;
    }

    if (new Date(candidateIso) > now) {
      return candidateIso;
    }

    candidateDate = addDaysToDateString(candidateDate, 7);
  }

  return null;
}

function getInitialNextRunAtIso({
  scheduleType,
  publishTime,
  startDate,
  timeZone,
}) {
  if (scheduleType === "once") {
    return getOneTimeRunAtIso(startDate, publishTime, timeZone);
  }

  if (scheduleType === "weekly") {
    return getInitialWeeklyRunAtIsoFromStartDate(
      startDate,
      publishTime,
      timeZone
    );
  }

  return null;
}

function formatDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatLanguage(value) {
  if (!value || value === "Auto") return "Auto-detect from prompt";
  return value;
}

function formatSubscriptionPlan(value) {
  if (!value) return "Starter";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatRenewDate(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return "Not set yet";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function getSubscriptionStatusLabel(value) {
  if (value === "trialing") return "Trial period";
  if (value === "active") return "Active subscription";
  if (value === "past_due") return "Payment issue";
  if (value === "canceled") return "Canceled";
  if (value === "expired") return "Expired";
  if (value === "incomplete") return "Payment required";
  if (value === "paused") return "Paused";

  return formatSubscriptionPlan(value || "trialing");
}

function getPlanBadgeLabel(balance) {
  const planLabel = formatSubscriptionPlan(
    balance?.subscription_plan || balance?.plan_name || "starter"
  );

  if (balance?.subscription_status === "trialing") {
    return `${planLabel} trial`;
  }

  return planLabel;
}

function getSubscriptionDateLabel(balance) {
  if (!balance) return "Renews";

  if (balance.subscription_status === "trialing") return "Trial ends";

  if (balance.cancel_at_period_end) {
    return "Access until";
  }

  if (balance.subscription_status === "active") return "Renews";
  if (balance.subscription_status === "past_due") return "Payment due";
  if (balance.subscription_status === "canceled") return "Ended";
  if (balance.subscription_status === "expired") return "Expired";

  return "Renews";
}

function getSubscriptionDateValue(balance, timeZone = DEFAULT_TIME_ZONE) {
  if (!balance) return "Not set yet";

  if (balance.subscription_status === "trialing") {
    return formatRenewDate(
      balance.trial_end || balance.current_period_end,
      timeZone
    );
  }

  return formatRenewDate(
    balance.current_period_end || balance.trial_end,
    timeZone
  );
}

function getSubscriptionNextStepText(balance) {
  if (!balance) return "Not set yet";

  const amount = balance.subscription_price_amount;
  const currency = balance.subscription_currency || "SEK";

  if (balance.cancel_at_period_end) {
    return "Will not renew";
  }

  if (balance.subscription_status === "trialing") {
    if (amount) {
      return `Then ${amount} ${currency}/month`;
    }

    return "Then monthly subscription";
  }

  if (balance.subscription_status === "active") return "Renews monthly";
  if (balance.subscription_status === "past_due") return "Update payment method";
  if (balance.subscription_status === "canceled") return "Subscription canceled";
  if (balance.subscription_status === "expired") return "Trial expired";

  return "Subscription";
}

function formatPlanMode(value) {
  if (value === "campaign") return "Campaign plan";
  if (value === "auto") return "Auto-plan";
  if (value === "select") return "Choose content types";
  return "Manual prompt";
}

function getWizardStepOneLabel(value) {
  if (value === "auto") return "Choose goal";
  if (value === "select") return "Choose content types";
  if (value === "manual") return "Write prompt";
  return "Choose strategy";
}

function getWizardStepOneDescription(value) {
  if (value === "auto") {
    return "Choose a goal and let Spreelo build the strategy.";
  }

  if (value === "select") {
    return "Choose the content types you want in the plan.";
  }

  if (value === "manual") {
    return "Write your own instructions for the planned post.";
  }

  return "Choose how Spreelo should build the plan.";
}

function getSlotDisplayLabel(slot) {
  if (slot.contentTypeLabel) return slot.contentTypeLabel;

  const contentType = getContentTypeById(slot.contentTypeId);
  if (contentType?.label) return contentType.label;

  return "Custom post";
}

function getSlotDisplayDescription(slot) {
  if (slot.isCampaignSlot && slot.campaignSummary) {
  return slot.campaignSummary;
}
  const contentType = getContentTypeById(slot.contentTypeId);

  if (contentType?.description) {
    return contentType.description;
  }

  if (slot.prompt?.trim()) {
    return slot.prompt.trim().slice(0, 120);
  }

  return "Write your own instructions for this post.";
}

function getSlotImageLabel(slot) {
  if (slot.usesWebsiteContent) {
    return "Website image / AI fallback";
  }

  return "AI image";
}

function getSlotCreditLabel(slot) {
  if (slot.generateImage) {
    return "3 credits";
  }

  return "1 credit";
}

function getContentTypeIcon(typeId) {
  const icons = {
    website_item: "🛒",
    problem_solution: "⚡",
    tips: "💡",
    mistakes: "!",
    faq: "?",
    behind_scenes: "🎥",
    checklist: "✓",
    service_focus: "✦",
    case_example: "👥",
    myth_fact: "↔",
    local: "⌖",
    seasonal: "☀",
    comparison: "⇄",
    mini_guide: "▤",
    manual_prompt: "✎",
  };

  return icons[typeId] || "✦";
}
function getSlotFormatLabel(slot) {
  if (slot.usesWebsiteContent && slot.generateImage) {
    return "Text + website image";
  }

  if (slot.generateImage) {
    return "Text + image";
  }

  return "Text only";
}
function sortAutomationRules(rulesToSort = []) {
  return (rulesToSort || []).slice().sort((a, b) => {
    if (a.next_run_at && b.next_run_at) {
      return new Date(a.next_run_at) - new Date(b.next_run_at);
    }

    if (a.next_run_at && !b.next_run_at) return -1;
    if (!a.next_run_at && b.next_run_at) return 1;

    const dayDiff =
      dayOrder.indexOf(a.weekday) - dayOrder.indexOf(b.weekday);

    if (dayDiff !== 0) return dayDiff;

    return String(a.publish_time).localeCompare(String(b.publish_time));
  });
}
function getPlanIncludedContentTypes({
  planCreationMode,
  autoPlanGoal,
  autoPlanPostCount,
  selectedContentTypeIds,
  websiteProductModeAvailable,
}) {
  if (planCreationMode === "campaign") {
    return [getContentTypeById("manual_prompt")].filter(Boolean);
  }

  if (planCreationMode === "manual") {
    return [getContentTypeById("manual_prompt")].filter(Boolean);
  }

  if (planCreationMode === "select") {
    return selectedContentTypeIds.map(getContentTypeById).filter(Boolean);
  }

  if (!autoPlanGoal) {
    return [];
  }

  return getGoalContentTypeIds({
    goalId: autoPlanGoal,
    postCount: autoPlanPostCount,
    websiteProductModeAvailable,
  })
    .map(getContentTypeById)
    .filter(Boolean);
}
function getSlotScheduleSummary(slot, scheduleType, timeZone) {
  const startLabel = formatStartDateLabel(slot.startDate, timeZone);
  const weekday = getWeekdayFromDateString(slot.startDate, timeZone);
  const time = normalizeTime(slot.publishTime);

  if (scheduleType === "once") {
    return `Runs once on ${startLabel} at ${time}`;
  }

  return `Starts ${startLabel} · Repeats every ${weekday} at ${time}`;
}

function DatePickerField({
  label,
  value,
  onChange,
  pickerId,
  openPickerId,
  setOpenPickerId,
  timeZone,
  compact = false,
}) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getMonthStartDateString(value)
  );

  useEffect(() => {
    setVisibleMonth(getMonthStartDateString(value));
  }, [value]);

  const isOpen = openPickerId === pickerId;
  const calendarDays = buildCalendarDays(visibleMonth);
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);

  return (
    <div className={`custom-picker-field ${compact ? "compact" : ""}`}>
      {label && <label>{label}</label>}

      <div className="custom-picker-anchor">
        <button
          type="button"
          className="custom-picker-button"
          onClick={() => setOpenPickerId(isOpen ? null : pickerId)}
        >
          <span>{formatStartDateLabel(value, timeZone)}</span>
          <strong>📅</strong>
        </button>

        {isOpen && (
          <div className="custom-calendar-popover">
            <div className="custom-calendar-header">
              <button
                type="button"
                onClick={() => setVisibleMonth(moveMonth(visibleMonth, -1))}
              >
                ‹
              </button>

              <strong>{getMonthLabel(visibleMonth)}</strong>

              <button
                type="button"
                onClick={() => setVisibleMonth(moveMonth(visibleMonth, 1))}
              >
                ›
              </button>
            </div>

            <div className="custom-calendar-weekdays">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            <div className="custom-calendar-grid">
              {calendarDays.map((day) => {
                const isSelected = day.dateString === value;
                const isToday = day.dateString === todayDateString;

                return (
                  <button
                    type="button"
                    key={day.dateString}
                    className={[
                      "custom-calendar-day",
                      day.isCurrentMonth ? "" : "muted",
                      isSelected ? "selected" : "",
                      isToday ? "today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      onChange(day.dateString);
                      setOpenPickerId(null);
                    }}
                  >
                    {day.dayNumber}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimePickerField({
  label,
  value,
  onChange,
  pickerId,
  openPickerId,
  setOpenPickerId,
  compact = false,
}) {
  const isOpen = openPickerId === pickerId;

  return (
    <div className={`custom-picker-field ${compact ? "compact" : ""}`}>
      {label && <label>{label}</label>}

      <div className="custom-picker-anchor">
        <button
          type="button"
          className="custom-picker-button time"
          onClick={() => setOpenPickerId(isOpen ? null : pickerId)}
        >
          <span>{normalizeTime(value)}</span>
          <strong>⌄</strong>
        </button>

        {isOpen && (
          <div className="custom-time-popover">
            {timeOptions.map((timeOption) => (
              <button
                type="button"
                key={timeOption}
                className={timeOption === value ? "selected" : ""}
                onClick={() => {
                  onChange(timeOption);
                  setOpenPickerId(null);
                }}
              >
                {timeOption}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function getCampaignAngleLabel(value) {
  const labels = {
    main: "Main campaign post",
    awareness: "Inspiration",
    engagement: "Engagement",
    product_discovery: "Product idea",
    product_push: "Product push",
    trust: "Trust",
    offer: "Offer",
    urgency: "Last chance",
  };

  return labels[value] || "Campaign post";
}

function getCustomerStageLabel(value) {
  if (value === "cold") return "Build interest";
  if (value === "warm") return "Create confidence";
  if (value === "ready_to_buy") return "Drive action";

  return "Campaign strategy";
}

function getCustomerStageDotClass(value) {
  if (value === "cold") return "cold";
  if (value === "warm") return "warm";
  if (value === "ready_to_buy") return "ready";

  return "neutral";
}

function normalizeStrategyValue(value) {
  return String(value || "").toLowerCase().trim();
}

function getStrategicCampaignSequence(count) {
  const safeCount = Math.min(Math.max(Math.round(Number(count) || 1), 1), 7);

  const sequences = {
    1: [
      {
        campaign_phase: "main",
        marketing_angle: "main",
        customer_stage: "warm",
        cta_strength: "medium",
      },
    ],
    2: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    3: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    4: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_discovery",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    5: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "early_middle",
        marketing_angle: "engagement",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    6: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "early_middle",
        marketing_angle: "engagement",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_discovery",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "last_chance",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    7: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "early_middle",
        marketing_angle: "engagement",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_discovery",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "offer",
        marketing_angle: "offer",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
      {
        campaign_phase: "last_chance",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
  };

  return sequences[safeCount] || sequences[3];
}

function getStrategicCampaignStep(count, index, postPlanItem = {}) {
  const sequence = getStrategicCampaignSequence(count);
  const fallbackStep = sequence[index] || sequence[sequence.length - 1];

  return {
    campaign_phase:
      normalizeStrategyValue(postPlanItem?.campaign_phase) ||
      fallbackStep.campaign_phase,
    marketing_angle:
      normalizeStrategyValue(postPlanItem?.marketing_angle) ||
      fallbackStep.marketing_angle,
    customer_stage:
      normalizeStrategyValue(postPlanItem?.customer_stage) ||
      fallbackStep.customer_stage,
    cta_strength:
      normalizeStrategyValue(postPlanItem?.cta_strength) ||
      fallbackStep.cta_strength,
  };
}

function getCampaignStrategyPurpose(marketingAngle) {
  const purposes = {
    main:
      "Combine campaign relevance, audience need and a clear next step in one strong post.",
    awareness:
      "Introduce the campaign and make the audience understand why it matters.",
    engagement:
      "Encourage the audience to react, comment, choose or recognize themselves in the campaign.",
    product_discovery:
      "Help the audience discover relevant products, services, ideas or options connected to the campaign.",
    product_push:
      "Recommend or highlight a relevant product, service or offer connected to the campaign.",
    trust:
      "Build confidence with reassurance, useful explanation, proof, examples or quality signals.",
    offer:
      "Give the audience a clear buying reason connected to the campaign.",
    urgency:
      "Create a timely reason to act now because the campaign date or opportunity is close.",
  };

  return (
    purposes[marketingAngle] ||
    "Create a useful campaign-related social media post."
  );
}

function getCampaignStrategyInstruction(postPlanItem) {
  const marketingAngle = postPlanItem?.marketing_angle || "main";
  const ctaStrength = postPlanItem?.cta_strength || "medium";

  const angleInstructions = {
    main:
      "This is the only post in the campaign. Combine inspiration, relevance, product/service value and a natural call to action.",
    awareness:
      "Do not sell too hard. Focus on recognition, timing, need, emotion or inspiration.",
    engagement:
      "Make the post easy to react to. Use a simple question, choice, comparison or relatable situation.",
    product_discovery:
      "Help the audience explore suitable options connected to the campaign.",
    product_push:
      "Make the product, service or offer more concrete and explain why it fits the campaign context.",
    trust:
      "Reduce doubt and build confidence. Do not invent reviews or claims.",
    offer:
      "Connect the offer to the audience need and campaign timing. Do not invent discounts.",
    urgency:
      "Make the timing matter and give the audience a clear reason to act now.",
  };

  const ctaInstructions = {
    soft: "Use a soft CTA that invites interest, comments or exploration.",
    medium: "Use a clear but natural CTA.",
    strong: "Use a stronger CTA that encourages action now.",
  };

  return [
    angleInstructions[marketingAngle] || angleInstructions.main,
    ctaInstructions[ctaStrength] || ctaInstructions.medium,
  ]
    .filter(Boolean)
    .join(" ");
}

function getCampaignDateLabel(campaign) {
  if (campaign?.event_date) {
    return campaign.event_date;
  }

  if (campaign?.start_date && campaign?.end_date) {
    return `${campaign.start_date} – ${campaign.end_date}`;
  }

  if (campaign?.start_date) {
    return campaign.start_date;
  }

  return "Flexible date";
}

function buildFallbackCampaignPlan(count) {
  const safeCount = Math.min(Math.max(Math.round(Number(count) || 1), 1), 7);

  return Array.from({ length: safeCount }).map((_, index) => {
    const strategy = getStrategicCampaignStep(safeCount, index);

    return {
      role: getCampaignAngleLabel(strategy.marketing_angle),
      purpose: getCampaignStrategyPurpose(strategy.marketing_angle),
      days_before_event:
        getDefaultCampaignDaysBeforeEvent(safeCount)[index] ?? 0,
      ...strategy,
    };
  });
}

function getCampaignRecommendedPostCount(campaign, fallbackCount = 3) {
  const rawRecommendedCount = Number(campaign?.recommended_post_count);

  const count = Number.isFinite(rawRecommendedCount)
    ? rawRecommendedCount
    : fallbackCount;

  return Math.min(Math.max(Math.round(count), 1), 7);
}

function buildCampaignPostPlan(campaign, recommendedCount) {
  const rawPostPlan = Array.isArray(campaign?.post_plan)
    ? campaign.post_plan
    : [];

  const sortedRawPostPlan = [...rawPostPlan].sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });

  const fallbackPostPlan = buildFallbackCampaignPlan(recommendedCount);

  const mergedPlan = Array.from({ length: recommendedCount }).map((_, index) => {
    const fallbackPost = fallbackPostPlan[index] || {};
    const aiPost = sortedRawPostPlan[index] || {};

    const role =
      aiPost.role && !/^campaign post/i.test(aiPost.role)
        ? aiPost.role
        : fallbackPost.role;

    return {
      ...fallbackPost,
      ...aiPost,
      role,
      purpose: aiPost.purpose || fallbackPost.purpose,
      days_before_event:
        typeof aiPost.days_before_event === "number"
          ? aiPost.days_before_event
          : fallbackPost.days_before_event,
    };
  });

  return mergedPlan.sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });
}

function getDefaultCampaignDaysBeforeEvent(count) {
  if (count <= 1) return [0];
  if (count === 2) return [7, 0];
  if (count === 3) return [14, 7, 0];
  if (count === 4) return [21, 14, 7, 0];
  if (count === 5) return [21, 14, 7, 3, 0];
  if (count === 6) return [28, 21, 14, 7, 3, 0];
  if (count === 7) return [30, 21, 14, 10, 7, 3, 0];

  return Array.from({ length: count }).map((_, index) => {
    if (index === count - 1) return 0;

    return Math.max((count - 1 - index) * 4, 1);
  });
}

function getFutureCampaignDaysBeforeEvent(count, daysUntilEvent) {
  const postCount = Math.max(Math.round(Number(count) || 0), 0);

  if (postCount <= 0) {
    return [];
  }

  const safeDaysUntilEvent = Math.max(
    Math.floor(Number(daysUntilEvent) || 0),
    0
  );

  if (postCount === 1) {
    return [0];
  }

  const preferredByCount = {
    2: [7, 0],
    3: [14, 7, 0],
    4: [21, 14, 7, 0],
    5: [28, 21, 14, 7, 0],
    6: [35, 28, 21, 14, 7, 0],
    7: [42, 35, 28, 21, 14, 7, 0],
  };

  const preferredDays =
    preferredByCount[Math.min(postCount, 7)] ||
    getDefaultCampaignDaysBeforeEvent(postCount);

  const futurePreferredDays = preferredDays.filter(
    (daysBeforeEvent) => daysBeforeEvent <= safeDaysUntilEvent
  );

  if (futurePreferredDays.length >= postCount) {
    return futurePreferredDays.slice(0, postCount);
  }

  const availableDaysBeforeEvent = Array.from({
    length: safeDaysUntilEvent + 1,
  }).map((_, index) => safeDaysUntilEvent - index);

  const combinedDays = Array.from(
    new Set([...futurePreferredDays, ...availableDaysBeforeEvent, 0])
  )
    .filter((daysBeforeEvent) => daysBeforeEvent <= safeDaysUntilEvent)
    .sort((a, b) => b - a);

  if (combinedDays.length >= postCount) {
    return combinedDays.slice(0, postCount);
  }

  return [
    ...combinedDays,
    ...Array.from({ length: postCount - combinedDays.length }, () => 0),
  ];
}

function getCampaignSearchText(campaign) {
  return [
    campaign?.title,
    campaign?.description,
    campaign?.prompt_context,
    campaign?.website_product_selection_hint,
    campaign?.industry,
    campaign?.event_type,
    campaign?.market,
    Array.isArray(campaign?.campaign_angles)
      ? campaign.campaign_angles.join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function getCampaignProductSelectionHint(campaign) {
  return String(campaign?.website_product_selection_hint || "").trim();
}
function getDaysBetweenDateStrings(startDateString, endDateString) {
  const startParts = getDatePartsFromDateString(startDateString);
  const endParts = getDatePartsFromDateString(endDateString);

  if (!startParts || !endParts) return null;

  const startDate = Date.UTC(
    startParts.year,
    startParts.month - 1,
    startParts.day
  );
  const endDate = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
}

function getCampaignContentSourceMode(campaign, postPlanItem, index, total) {
  const websiteContentFit = String(
    campaign?.website_content_fit || ""
  ).toLowerCase();

  const websiteContentStrategy = String(
    campaign?.website_content_strategy || ""
  ).toLowerCase();

  const roleText = `${postPlanItem?.role || ""} ${
    postPlanItem?.purpose || ""
  }`.toLowerCase();

  const isLaterCampaignPost =
    index >= Math.max(1, Math.floor(total / 2)) ||
    /reminder|final|push|spotlight|highlight|cta|offer|gift|book|buy|order|shop/.test(
      roleText
    );

  if (websiteContentFit === "weak" || websiteContentStrategy === "none") {
    return "generic_campaign";
  }

  if (websiteContentFit === "strong") {
    if (websiteContentStrategy === "product") {
      return isLaterCampaignPost
        ? "website_product"
        : "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "service") {
      return isLaterCampaignPost
        ? "website_service"
        : "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "support") {
      return "mixed_campaign_and_website";
    }
  }

  if (websiteContentFit === "medium") {
    if (websiteContentStrategy === "product" && isLaterCampaignPost) {
      return "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "service" && isLaterCampaignPost) {
      return "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "support") {
      return "mixed_campaign_and_website";
    }

    return "generic_campaign";
  }

  const campaignText = getCampaignSearchText(campaign);

  const hasProductIntent =
    /shop|store|ecommerce|e-commerce|product|products|gift|gifts|present|sale|discount|offer|black friday|christmas|valentine|mother|father|holiday|seasonal|collection|launch|buy|order/.test(
      campaignText
    );

  const hasServiceIntent =
    /service|services|book|booking|appointment|treatment|consultation|cleaning|clearing|repair|quote|visit|call|contact/.test(
      campaignText
    );

  if (hasProductIntent && isLaterCampaignPost) {
    return "website_product";
  }

  if (hasProductIntent) {
    return "mixed_campaign_and_website";
  }

  if (hasServiceIntent && isLaterCampaignPost) {
    return "website_service";
  }

  if (hasServiceIntent) {
    return "mixed_campaign_and_website";
  }

  return "generic_campaign";
}

function shouldUseWebsiteContentForCampaign(sourceMode, campaign = null) {
  const websiteContentFit = String(
    campaign?.website_content_fit || ""
  ).toLowerCase();

  const websiteContentStrategy = String(
    campaign?.website_content_strategy || ""
  ).toLowerCase();

  if (websiteContentFit === "weak" || websiteContentStrategy === "none") {
    return false;
  }

  return ["website_product", "website_service"].includes(sourceMode);
}

function getCampaignSourceInstruction(sourceMode, campaign = null) {
  const websiteContentFit = String(
    campaign?.website_content_fit || ""
  ).toLowerCase();

  const websiteContentStrategy = String(
    campaign?.website_content_strategy || ""
  ).toLowerCase();

  const productSelectionHint = getCampaignProductSelectionHint(campaign);

  const productSelectionInstruction = productSelectionHint
    ? ` Product selection hint: ${productSelectionHint}. Use this hint when choosing website content. Do not pick a random product or service just because it exists on the website.`
    : "";

  if (websiteContentFit === "weak" || websiteContentStrategy === "none") {
    return "Do not use website products or services for this post. The website content match is weak, so keep the post focused on the campaign theme and audience value.";
  }

  if (sourceMode === "website_product") {
    return `Use a relevant product from the brand website if available. Connect the product naturally to the campaign. Use only product details that clearly exist on the website. If no relevant product is found, fall back to a general campaign post.${productSelectionInstruction}`;
  }

  if (sourceMode === "website_service") {
    return `Use a relevant service or offer from the brand website if available. Connect the service naturally to the campaign. Use only details that clearly exist on the website. If no relevant service is found, fall back to a general campaign post.${productSelectionInstruction}`;
  }

  if (sourceMode === "mixed_campaign_and_website") {
    return `If relevant website content is available, use it as supporting context, but keep the main focus on the campaign theme. Do not force a product or service if the match is not natural.${productSelectionInstruction}`;
  }

  return "Do not force a product or service into this post. Keep the focus on the campaign theme and the audience value.";
}

function getCampaignTimingInstruction(campaign, daysBeforeEvent) {
  const campaignTitle = campaign?.title || "the campaign";

  if (!campaign?.event_date || typeof daysBeforeEvent !== "number") {
    return `This campaign has a flexible date. Do not mention days left. Instead, give this post a clear campaign role and make it different from the other posts.`;
  }

  if (daysBeforeEvent === 0) {
    return `This post is for the day itself. Clearly lift up that today is ${campaignTitle}. Make the day feel important, timely and worth noticing.`;
  }

  if (daysBeforeEvent === 1) {
    return `This post is for the day before ${campaignTitle}. Mention that it is tomorrow and create a natural final reminder.`;
  }

  return `This post is ${daysBeforeEvent} days before ${campaignTitle}. Mention the timing naturally, for example that ${campaignTitle} is coming soon or that there are ${daysBeforeEvent} days left.`;
}

function buildCampaignPostPlanItem({
  campaign,
  postPlanItem,
  index,
  total,
  daysBeforeEvent = null,
}) {
  const campaignTitle = campaign?.title || "Campaign";
  const hasFixedDate = Boolean(campaign?.event_date);
  const strategy = getStrategicCampaignStep(total, index, postPlanItem);

  const aiRoleIsUseful =
    postPlanItem?.role && !/^campaign post/i.test(postPlanItem.role);

  const role = aiRoleIsUseful
    ? postPlanItem.role
    : getCampaignAngleLabel(strategy.marketing_angle);

  const purpose =
    postPlanItem?.purpose || getCampaignStrategyPurpose(strategy.marketing_angle);

  let timingNote =
    "This campaign has a flexible date. Focus on the post role and make it different from the other campaign posts.";

  if (hasFixedDate) {
    if (daysBeforeEvent === 0) {
      timingNote = `This post is scheduled for ${campaignTitle} itself. Make it feel timely and relevant today.`;
    } else if (daysBeforeEvent === 1) {
      timingNote = `This post is scheduled the day before ${campaignTitle}. It can work as a final reminder.`;
    } else if (daysBeforeEvent <= 3) {
      timingNote = `This post is scheduled close to ${campaignTitle}. Make the timing feel important without exaggerating.`;
    } else if (daysBeforeEvent <= 7) {
      timingNote = `This post is scheduled about a week before ${campaignTitle}. Connect the campaign to a useful idea, product, service or action.`;
    } else {
      timingNote = `This post is scheduled early in the campaign. Build interest before the campaign date gets close.`;
    }
  }

  return {
    ...postPlanItem,
    role,
    purpose,
    campaign_phase: strategy.campaign_phase,
    marketing_angle: strategy.marketing_angle,
    customer_stage: strategy.customer_stage,
    cta_strength: strategy.cta_strength,
    campaign_post_index: index + 1,
    campaign_post_count: total,
    campaign_goal: campaign?.campaign_goal || "",
    target_customer_need: campaign?.target_customer_need || "",
    strategy_notes: getCampaignStrategyInstruction(strategy),
    timing_note: timingNote,
    days_before_event: hasFixedDate ? daysBeforeEvent : null,
  };
}

function buildCampaignPrompt(campaign, postPlanItem, index) {
  const campaignTitle = campaign?.title || "Campaign";
  const campaignDate = getCampaignDateLabel(campaign);
  const campaignContext =
    campaign?.prompt_context ||
    campaign?.description ||
    "Create a campaign-related social media post.";

  const postRole = postPlanItem?.role || `Campaign post ${index + 1}`;
  const postPurpose =
    postPlanItem?.purpose || "Create a useful campaign-related post.";

  const relevanceReason = campaign?.relevance_reason || "";
  const daysBeforeEvent =
    typeof postPlanItem?.days_before_event === "number"
      ? postPlanItem.days_before_event
      : null;

  const sourceMode =
    postPlanItem?.content_source_mode ||
    getCampaignContentSourceMode(campaign, postPlanItem, index, 5);

  const languageInstruction = campaign?.language
    ? `Write the post in ${campaign.language}.`
    : "Use the best language for the brand.";

  const timingInstruction = getCampaignTimingInstruction(
    campaign,
    daysBeforeEvent
  );

  const visibleOpening = campaign?.event_date
    ? daysBeforeEvent === 0
      ? `This is the campaign-day post for ${campaignTitle}. Clearly highlight that today is ${campaignTitle}.`
      : daysBeforeEvent === 1
      ? `This is the final reminder before ${campaignTitle}. Mention that ${campaignTitle} is tomorrow.`
      : `This post is ${daysBeforeEvent} days before ${campaignTitle}. Use that timing as the main angle.`
    : `This is a flexible-date campaign post. Do not mention days left. Focus on this specific role: ${postRole}.`;

  return [
    visibleOpening,
    `This is post ${postPlanItem?.campaign_post_index || index + 1} of ${
      postPlanItem?.campaign_post_count || "the campaign sequence"
    }.`,
    `Campaign phase: ${postPlanItem?.campaign_phase || "campaign_post"}.`,
    `Marketing angle: ${postPlanItem?.marketing_angle || "main"}.`,
    `Customer stage: ${postPlanItem?.customer_stage || "warm"}.`,
    `CTA strength: ${postPlanItem?.cta_strength || "medium"}.`,
    postPlanItem?.campaign_goal
      ? `Campaign goal: ${postPlanItem.campaign_goal}.`
      : "",
    postPlanItem?.target_customer_need
      ? `Target customer need: ${postPlanItem.target_customer_need}.`
      : "",
    postPlanItem?.strategy_notes
      ? `Strategic instruction: ${postPlanItem.strategy_notes}`
      : "",
    postPlanItem?.timing_note ? `Timing note: ${postPlanItem.timing_note}` : "",
    `Post role: ${postRole}.`,
    `Post purpose: ${postPurpose}.`,
    `Campaign: ${campaignTitle}.`,
    `Campaign timing: ${campaignDate}.`,
    timingInstruction,
    `Campaign context: ${campaignContext}`,
    getCampaignSourceInstruction(sourceMode, campaign),
    relevanceReason ? `Why this fits the brand: ${relevanceReason}` : "",
    languageInstruction,
    "This post must clearly lift up the campaign theme, day or celebration.",
    "Make this post different from the other campaign posts. Do not repeat the same angle.",
    "Do not invent discounts, prices, events, guarantees, delivery promises, opening hours, locations or product claims that are not known.",
    "Make it useful, trustworthy, natural and suitable for social media.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCampaignSummary(campaign, postPlanItem, index) {
  const campaignTitle = campaign?.title || "campaign";
  const marketingAngle = postPlanItem?.marketing_angle || "main";
  const angleLabel = getCampaignAngleLabel(marketingAngle);
  const stageLabel = getCustomerStageLabel(postPlanItem?.customer_stage);
  const ctaStrength = postPlanItem?.cta_strength || "medium";

  const purpose =
    postPlanItem?.purpose || getCampaignStrategyPurpose(marketingAngle);

  const daysBeforeEvent =
    typeof postPlanItem?.days_before_event === "number"
      ? postPlanItem.days_before_event
      : null;

  let timingText = "";

  if (campaign?.event_date && typeof daysBeforeEvent === "number") {
    if (daysBeforeEvent === 0) {
      timingText = ` Scheduled for ${campaignTitle} itself.`;
    } else if (daysBeforeEvent === 1) {
      timingText = ` Scheduled as a final reminder the day before ${campaignTitle}.`;
    } else {
      timingText = ` Scheduled ${daysBeforeEvent} days before ${campaignTitle}.`;
    }
  }

  return `${angleLabel}: ${purpose} ${stageLabel}. CTA: ${ctaStrength}.${timingText}`;
}

function createCampaignSlotsFromOpportunity({
  campaign,
  timeZone = DEFAULT_TIME_ZONE,
  defaultPublishTime = "09:00",
}) {
  const recommendedCount = getCampaignRecommendedPostCount(campaign);
  const postPlan = buildCampaignPostPlan(campaign, recommendedCount);

  const hasFixedCampaignDate = Boolean(campaign?.event_date);

 if (hasFixedCampaignDate) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const daysUntilEvent = getDaysBetweenDateStrings(
    todayDateString,
    campaign.event_date
  );

  const futureDaysBeforeEvent = getFutureCampaignDaysBeforeEvent(
    postPlan.length,
    daysUntilEvent
  );

  return postPlan.map((postPlanItem, index) => {
    const daysBeforeEvent = futureDaysBeforeEvent[index] ?? 0;

    const startDate = addDaysToDateString(
      campaign.event_date,
      -daysBeforeEvent
    );

    const enhancedPostPlanItem = buildCampaignPostPlanItem({
      campaign,
      postPlanItem,
      index,
      total: postPlan.length,
      daysBeforeEvent,
    });

    const contentSourceMode = getCampaignContentSourceMode(
      campaign,
      enhancedPostPlanItem,
      index,
      postPlan.length
    );

    enhancedPostPlanItem.content_source_mode = contentSourceMode;

    return createSlot({
      startDate,
      weekday: getWeekdayFromDateString(startDate, timeZone),
      publishTime: defaultPublishTime,
      prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
      imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
      generateImage:
        index < 2 ||
        shouldUseWebsiteContentForCampaign(contentSourceMode, campaign),
      contentTypeId: "manual_prompt",
      contentTypeLabel: campaign?.title || "Campaign post",
      usesWebsiteContent: shouldUseWebsiteContentForCampaign(
        contentSourceMode,
        campaign
      ),
      isCampaignSlot: true,
   campaignRole: enhancedPostPlanItem.role || "Campaign post",
campaignSummary: buildCampaignSummary(
  campaign,
  enhancedPostPlanItem,
  index
),
campaignPhase: enhancedPostPlanItem.campaign_phase || "",
marketingAngle: enhancedPostPlanItem.marketing_angle || "",
customerStage: enhancedPostPlanItem.customer_stage || "",
ctaStrength: enhancedPostPlanItem.cta_strength || "",
campaignPostIndex: enhancedPostPlanItem.campaign_post_index || index + 1,
campaignPostCount: enhancedPostPlanItem.campaign_post_count || postPlan.length,
campaignGoal: enhancedPostPlanItem.campaign_goal || "",
targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
strategyNotes: enhancedPostPlanItem.strategy_notes || "",
dateLocked: true,
timeZone,
    });
  });
}

  const fallbackStartDate =
    campaign?.start_date ||
    getDateInputValueInTimeZone(new Date(), timeZone);

  const smartSchedule = buildSmartSlotSchedule({
    startDate: fallbackStartDate,
    count: postPlan.length,
    timeZone,
    firstPublishTime: defaultPublishTime,
  });

  return postPlan.map((postPlanItem, index) => {
    const schedule = smartSchedule[index] || {
      startDate: fallbackStartDate,
      weekday: getWeekdayFromDateString(fallbackStartDate, timeZone),
      publishTime: defaultPublishTime,
    };

    const enhancedPostPlanItem = buildCampaignPostPlanItem({
      campaign,
      postPlanItem,
      index,
      total: postPlan.length,
      daysBeforeEvent: null,
    });

    const contentSourceMode = getCampaignContentSourceMode(
      campaign,
      enhancedPostPlanItem,
      index,
      postPlan.length
    );

    enhancedPostPlanItem.content_source_mode = contentSourceMode;

    return createSlot({
      startDate: schedule.startDate,
      weekday: schedule.weekday,
      publishTime: schedule.publishTime,
      prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
      imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
    generateImage:
  index < 2 ||
  shouldUseWebsiteContentForCampaign(contentSourceMode, campaign),
contentTypeId: "manual_prompt",
contentTypeLabel: campaign?.title || "Campaign post",
usesWebsiteContent: shouldUseWebsiteContentForCampaign(
  contentSourceMode,
  campaign
),
isCampaignSlot: true,
campaignRole: enhancedPostPlanItem.role || "Campaign post",
campaignSummary: buildCampaignSummary(
  campaign,
  enhancedPostPlanItem,
  index
),
campaignPhase: enhancedPostPlanItem.campaign_phase || "",
marketingAngle: enhancedPostPlanItem.marketing_angle || "",
customerStage: enhancedPostPlanItem.customer_stage || "",
ctaStrength: enhancedPostPlanItem.cta_strength || "",
campaignPostIndex: enhancedPostPlanItem.campaign_post_index || index + 1,
campaignPostCount: enhancedPostPlanItem.campaign_post_count || postPlan.length,
campaignGoal: enhancedPostPlanItem.campaign_goal || "",
targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
strategyNotes: enhancedPostPlanItem.strategy_notes || "",
dateLocked: true,
timeZone,
    });
  });
}

function formatConnectedPlatformLabel(platformValue) {
  const value = String(platformValue || "").toLowerCase();

  if (value === "facebook") return "Facebook";
  if (value === "instagram") return "Instagram";
  if (value === "linkedin") return "LinkedIn";

  return platformValue;
}

export default function AutomationPage() {
  const initialStartDate = getDateInputValueInTimeZone(
    new Date(),
    DEFAULT_TIME_ZONE
  );

  const initialRecommendedTime = getRecommendedTimeForDate(
    initialStartDate,
    DEFAULT_TIME_ZONE
  );

const [rules, setRules] = useState([]);
const [creditBalance, setCreditBalance] = useState(null);
const [currentBrandId, setCurrentBrandId] = useState("");
const [currentBrandProfile, setCurrentBrandProfile] = useState(null);
const [campaignOpportunity, setCampaignOpportunity] = useState(null);

  const [planStartDate, setPlanStartDate] = useState(initialStartDate);
  const [defaultPublishTime, setDefaultPublishTime] = useState(
    initialRecommendedTime
  );
const [autoPlanGoal, setAutoPlanGoal] = useState("");
const [autoPlanPostCount, setAutoPlanPostCount] = useState(
  DEFAULT_AUTO_PLAN_POST_COUNT
);
const [showAddPostModal, setShowAddPostModal] = useState(false);
const [slots, setSlots] = useState([]);
  const [planCreationMode, setPlanCreationMode] = useState("auto");
  const [selectedContentTypeIds, setSelectedContentTypeIds] = useState(
    recommendedContentTypeIds
  );

  const [message, setMessage] = useState("");
  const [savedPlanSummary, setSavedPlanSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleType, setScheduleType] = useState("weekly");

  const [planName, setPlanName] = useState("");
  const [platform, setPlatform] = useState("");
const [connectedPlatforms, setConnectedPlatforms] = useState([]);
const [loadingConnectedPlatforms, setLoadingConnectedPlatforms] = useState(false);
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("Auto");
  const [postType, setPostType] = useState("Offer");
  const [length, setLength] = useState("Medium");
  const [ctaType, setCtaType] = useState("Learn more");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [showSavedRules, setShowSavedRules] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showLearnMoreModal, setShowLearnMoreModal] = useState(false);
  const [recentlyAddedContentTypeId, setRecentlyAddedContentTypeId] =
  useState("");
  const [expandedInstructionSlotIds, setExpandedInstructionSlotIds] = useState(
    []
  );

  const [selectedRuleIds, setSelectedRuleIds] = useState([]);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [confirmingSingleDeleteId, setConfirmingSingleDeleteId] =
    useState(null);
  const [deletingRules, setDeletingRules] = useState(false);
  const [openPickerId, setOpenPickerId] = useState(null);

  useEffect(() => {
    const browserTimeZone = getBrowserTimeZone();
    const browserStartDate = getDateInputValueInTimeZone(
      new Date(),
      browserTimeZone
    );
    const browserRecommendedTime = getRecommendedTimeForDate(
      browserStartDate,
      browserTimeZone
    );

    setTimeZone(browserTimeZone);
    setPlanStartDate(browserStartDate);
    setDefaultPublishTime(browserRecommendedTime);
    setSlots((currentSlots) =>
      applySmartScheduleToSlots(
        currentSlots,
        browserStartDate,
        browserTimeZone,
        browserRecommendedTime
      )
    );

    loadRules();
  }, []);

  const timeZoneOptions = useMemo(() => {
    const options = new Set([timeZone, DEFAULT_TIME_ZONE, ...commonTimeZones]);

    return Array.from(options).filter(Boolean);
  }, [timeZone]);

  const plannedCredits = useMemo(() => {
    return slots.reduce(
      (total, slot) => total + (slot.generateImage ? 3 : 1),
      0
    );
  }, [slots]);

  const textOnlyCount = useMemo(() => {
    return slots.filter((slot) => !slot.generateImage).length;
  }, [slots]);

  const imageCount = useMemo(() => {
    return slots.filter((slot) => slot.generateImage).length;
  }, [slots]);

  const websiteContentCount = useMemo(() => {
    return slots.filter((slot) => slot.usesWebsiteContent).length;
  }, [slots]);

  const existingWeeklyCredits = useMemo(() => {
    return rules.reduce((total, rule) => {
      if (!rule.is_active) return total;
      if (rule.schedule_type === "once") return total;

      return total + (rule.credit_cost || 1);
    }, 0);
  }, [rules]);

  const monthlyEstimate =
    scheduleType === "weekly"
      ? (existingWeeklyCredits + plannedCredits) * 4
      : existingWeeklyCredits * 4 + plannedCredits;

  const hasEnoughCredits =
    !creditBalance || plannedCredits <= creditBalance.credits_remaining;

  const creditsRemaining = creditBalance?.credits_remaining ?? 0;
  const monthlyCreditLimit = creditBalance?.monthly_credit_limit ?? 0;
  const creditsAfterSaving = creditBalance
    ? Math.max(creditsRemaining - plannedCredits, 0)
    : 0;
  const creditUsagePercent =
    monthlyCreditLimit > 0
      ? Math.min(100, Math.round((creditsRemaining / monthlyCreditLimit) * 100))
      : 0;
const subscriptionPlanLabel = getPlanBadgeLabel(creditBalance);
  const subscriptionDateLabel = getSubscriptionDateLabel(creditBalance);
  const subscriptionDateValue = getSubscriptionDateValue(
    creditBalance,
    timeZone
  );
  const subscriptionNextStepText = getSubscriptionNextStepText(creditBalance);
  const subscriptionStatusLabel = getSubscriptionStatusLabel(
    creditBalance?.subscription_status
  );

  const savedRulesPreview = rules.slice(0, 3);
  const visibleRules = showSavedRules ? rules : savedRulesPreview;
  const visibleRuleIds = visibleRules.map((rule) => rule.id);
  const allVisibleRulesSelected =
    visibleRuleIds.length > 0 &&
    visibleRuleIds.every((ruleId) => selectedRuleIds.includes(ruleId));
    const websiteProductModeAvailable = Boolean(
    currentBrandProfile?.website_product_mode_available
  );

  const visibleContentTypes = useMemo(() => {
    return getVisibleContentTypes(websiteProductModeAvailable);
  }, [websiteProductModeAvailable]);
  const includedContentTypes = useMemo(() => {
  return getPlanIncludedContentTypes({
    planCreationMode,
    autoPlanGoal,
    autoPlanPostCount,
    selectedContentTypeIds,
    websiteProductModeAvailable,
  });
}, [
  planCreationMode,
  autoPlanGoal,
  autoPlanPostCount,
  selectedContentTypeIds,
  websiteProductModeAvailable,
]);
const planWasSaved = Boolean(savedPlanSummary);

const shouldShowPlannerDetails =
  !planWasSaved &&
  (planCreationMode === "campaign" ||
    (planCreationMode === "select" && slots.length > 0) ||
    (planCreationMode === "manual" && slots.length > 0) ||
    Boolean(autoPlanGoal));
async function getCurrentBrandIdForUser(currentUser, preferredBrandId = "") {
  if (preferredBrandId) {
    const { data: preferredBrand, error: preferredBrandError } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("id", preferredBrandId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!preferredBrandError && preferredBrand?.id) {
      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(currentUser.id), preferredBrand.id);
      }

      return preferredBrand.id;
    }
  }

  const savedBrandId =
    typeof window !== "undefined"
      ? localStorage.getItem(getBrandStorageKey(currentUser.id))
      : "";

  if (savedBrandId) {
    const { data: savedBrand, error: savedBrandError } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("id", savedBrandId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!savedBrandError && savedBrand?.id) {
      return savedBrand.id;
    }
  }

  const { data: defaultBrand, error: defaultBrandError } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("user_id", currentUser.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (defaultBrandError) {
    throw defaultBrandError;
  }

  if (defaultBrand?.id && typeof window !== "undefined") {
    localStorage.setItem(getBrandStorageKey(currentUser.id), defaultBrand.id);
  }

  return defaultBrand?.id || "";
}
  async function loadCampaignOpportunityIntoPlanner({
  currentUser,
  selectedBrandId,
  campaignOpportunityId,
  selectedTimeZone,
}) {
  if (!campaignOpportunityId || !selectedBrandId) {
    return;
  }

  const { data: campaign, error } = await supabase
    .from("brand_campaign_opportunities")
    .select("*")
    .eq("id", campaignOpportunityId)
    .eq("user_id", currentUser.id)
    .eq("brand_profile_id", selectedBrandId)
    .eq("is_active", true)
    .eq("is_hidden", false)
    .eq("is_archived", false)
    .maybeSingle();

  if (error) {
    setMessage(error.message);
    return;
  }

  if (!campaign) {
    setMessage("Could not find this campaign opportunity for the selected brand.");
    return;
  }

  const campaignTimeZone = selectedTimeZone || timeZone || DEFAULT_TIME_ZONE;

  const campaignStartDate =
    campaign.event_date ||
    campaign.start_date ||
    getDateInputValueInTimeZone(new Date(), campaignTimeZone);

  const campaignPublishTime = getRecommendedTimeForDate(
    campaignStartDate,
    campaignTimeZone
  );

  const campaignSlots = createCampaignSlotsFromOpportunity({
    campaign,
    timeZone: campaignTimeZone,
    defaultPublishTime: campaignPublishTime,
  });

  setCampaignOpportunity(campaign);
  setPlanCreationMode("campaign");
  setScheduleType("once");
  setPlanName(campaign.title || "Campaign plan");
  setLanguage(campaign.language || "Auto");
  setPostType("Campaign");
  setTone("Friendly");
  setCtaType("Learn more");
  setPlanStartDate(campaignSlots[0]?.startDate || campaignStartDate);
  setDefaultPublishTime(campaignPublishTime);
    setSlots(campaignSlots);
  setExpandedInstructionSlotIds([]);
  setSavedPlanSummary(null);
  setMessage("");
}

async function loadConnectedPlatformsForBrand(userId, brandProfileId) {
  if (!userId || !brandProfileId) {
    setConnectedPlatforms([]);
    setPlatform("");
    return;
  }

  setLoadingConnectedPlatforms(true);

  const { data, error } = await supabase
    .from("social_connections")
    .select("platform, status")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "connected");

  if (error) {
    console.error("Could not load connected platforms:", error);
    setConnectedPlatforms([]);
    setPlatform("");
    setLoadingConnectedPlatforms(false);
    return;
  }

  const uniquePlatforms = Array.from(
    new Set(
      (data || []).map((item) =>
        String(item.platform || "").toLowerCase()
      )
    )
  )
    .filter(Boolean)
    .map((value) => ({
      value,
      label: formatConnectedPlatformLabel(value),
    }));

  setConnectedPlatforms(uniquePlatforms);

  setPlatform((currentValue) => {
    const currentValueLower = String(currentValue || "").toLowerCase();

    const currentStillExists = uniquePlatforms.some(
      (item) =>
        item.value === currentValueLower ||
        item.label.toLowerCase() === currentValueLower
    );

    if (currentStillExists) {
      return currentValue;
    }

    return uniquePlatforms[0]?.label || "";
  });

  setLoadingConnectedPlatforms(false);
}

async function loadRules() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

const searchParams =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;

const campaignOpportunityId = searchParams?.get("campaignOpportunityId") || "";
const requestedBrandProfileId = searchParams?.get("brandProfileId") || "";

let selectedBrandId = "";

try {
    selectedBrandId = await getCurrentBrandIdForUser(
    user,
    requestedBrandProfileId
  );
  setCurrentBrandId(selectedBrandId);
  await loadConnectedPlatformsForBrand(user.id, selectedBrandId);
} catch (error) {
  setMessage(error.message || "Could not load selected brand.");
  setRules([]);
  setLoading(false);
  return;
}

if (!selectedBrandId) {
  setRules([]);
  setLoading(false);
  return;
}

const { data: brandProfileData, error: brandProfileError } = await supabase
  .from("brand_profiles")
  .select("id, website_product_mode_available")
  .eq("id", selectedBrandId)
  .eq("user_id", user.id)
  .maybeSingle();

if (brandProfileError) {
  setMessage(brandProfileError.message);
  setCurrentBrandProfile(null);
} else {
  setCurrentBrandProfile(brandProfileData || null);

  const brandAllowsWebsiteProductMode = Boolean(
    brandProfileData?.website_product_mode_available
  );

  if (!brandAllowsWebsiteProductMode) {
    const problemSolutionType = getContentTypeById("problem_solution");

    setSelectedContentTypeIds((currentTypeIds) =>
      getBrandSafeContentTypeIds(currentTypeIds, false)
    );

    setSlots((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.contentTypeId !== "website_item" || !problemSolutionType) {
          return slot;
        }

        return {
          ...slot,
          prompt: problemSolutionType.prompt,
          imagePrompt: problemSolutionType.imagePrompt,
          contentTypeId: problemSolutionType.id,
          contentTypeLabel: problemSolutionType.label,
          usesWebsiteContent: false,
          generateImage: true,
        };
      })
    );
  }
}
if (campaignOpportunityId) {
  await loadCampaignOpportunityIntoPlanner({
    currentUser: user,
    selectedBrandId,
    campaignOpportunityId,
    selectedTimeZone: timeZone || DEFAULT_TIME_ZONE,
  });
}

const { data, error } = await supabase
  .from("automation_rules")
  .select("*")
  .eq("user_id", user.id)
  .eq("brand_profile_id", selectedBrandId);
    if (error) {
      setMessage(error.message);
    } else {
    const sortedRules = sortAutomationRules(data || []);

      setRules(sortedRules);
      setSelectedRuleIds((currentIds) =>
        currentIds.filter((ruleId) =>
          sortedRules.some((rule) => rule.id === ruleId)
        )
      );
    }

    const { data: balanceData, error: balanceError } = await supabase
      .from("user_credit_balances")
      .select(
  "credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, current_period_start, current_period_end, credits_renewed_at, trial_start, trial_end, cancel_at_period_end, payment_provider, provider_customer_id, provider_subscription_id, subscription_price_amount, subscription_currency"
)
      .eq("user_id", user.id)
      .single();

    if (!balanceError && balanceData) {
      setCreditBalance(balanceData);
    }

    setLoading(false);
  }

  function updateSlot(slotId, field, value) {
    setSlots((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.id !== slotId) {
          return slot;
        }

        if (field === "startDate") {
          const nextWeekday = getWeekdayFromDateString(value, timeZone);

          return {
            ...slot,
            startDate: value,
            weekday: nextWeekday,
            publishTime: getRecommendedTimeForWeekday(nextWeekday),
          };
        }

        return { ...slot, [field]: value };
      })
    );
  }

  function updatePlanStartDate(value) {
    setPlanStartDate(value);
    setSlots((currentSlots) =>
      applySmartScheduleToSlots(
        currentSlots,
        value,
        timeZone,
        defaultPublishTime
      )
    );
  }

  function updateDefaultPublishTime(value) {
    setDefaultPublishTime(value);

    setSlots((currentSlots) =>
      applySmartScheduleToSlots(currentSlots, planStartDate, timeZone, value)
    );
  }

  function toggleSlotInstructions(slotId) {
    setExpandedInstructionSlotIds((currentIds) =>
      currentIds.includes(slotId)
        ? currentIds.filter((id) => id !== slotId)
        : [...currentIds, slotId]
    );
  }

function addCampaignSlot() {
  if (!campaignOpportunity) {
    setMessage("No campaign opportunity is loaded.");
    return;
  }

  setMessage("");

  setSlots((currentSlots) => {
    const nextIndex = currentSlots.length;
    const nextTotal = currentSlots.length + 1;
    const selectedTimeZone = timeZone || DEFAULT_TIME_ZONE;
    const hasFixedCampaignDate = Boolean(campaignOpportunity.event_date);

    let startDate = planStartDate;
    let publishTime = defaultPublishTime;
    let daysBeforeEvent = null;

    if (hasFixedCampaignDate) {
      const usedDaysBeforeEvent = currentSlots
        .map((slot) =>
          getDaysBetweenDateStrings(slot.startDate, campaignOpportunity.event_date)
        )
        .filter((value) => typeof value === "number" && value >= 0);

const todayDateString = getDateInputValueInTimeZone(
  new Date(),
  selectedTimeZone
);

const daysUntilEvent = getDaysBetweenDateStrings(
  todayDateString,
  campaignOpportunity.event_date
);

const maxFutureDaysBeforeEvent = Math.max(
  Math.floor(Number(daysUntilEvent) || 0),
  0
);

const futureDaysBeforeEvent = getFutureCampaignDaysBeforeEvent(
  nextTotal,
  maxFutureDaysBeforeEvent
);

const allFutureDaysBeforeEvent = Array.from({
  length: maxFutureDaysBeforeEvent + 1,
}).map((_, index) => maxFutureDaysBeforeEvent - index);

const preferredDays = Array.from(
  new Set([...futureDaysBeforeEvent, ...allFutureDaysBeforeEvent, 0])
);

daysBeforeEvent =
  preferredDays.find(
    (value) => !usedDaysBeforeEvent.includes(value)
  ) ?? 0;

startDate = addDaysToDateString(
  campaignOpportunity.event_date,
  -daysBeforeEvent
);

publishTime = getRecommendedTimeForDate(startDate, selectedTimeZone);
      
    } else {
      const sortedSlots = currentSlots
        .slice()
        .sort((a, b) =>
          `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
            `${b.startDate || ""} ${b.publishTime || ""}`
          )
        );

      const lastSlot = sortedSlots[sortedSlots.length - 1];
      const fallbackStartDate =
        lastSlot?.startDate ||
        campaignOpportunity.start_date ||
        planStartDate ||
        getDateInputValueInTimeZone(new Date(), selectedTimeZone);

      const smartSchedule = buildSmartSlotSchedule({
        startDate: fallbackStartDate,
        count: 2,
        timeZone: selectedTimeZone,
        firstPublishTime: lastSlot?.publishTime || defaultPublishTime,
      });

      const nextSchedule = smartSchedule[1] || {
        startDate: addDaysToDateString(fallbackStartDate, 3),
        weekday: getWeekdayFromDateString(fallbackStartDate, selectedTimeZone),
        publishTime: defaultPublishTime,
      };

      startDate = nextSchedule.startDate;
      publishTime = nextSchedule.publishTime;
    }

    const postPlanItem = buildCampaignPostPlanItem({
      campaign: campaignOpportunity,
      postPlanItem: {},
      index: nextIndex,
      total: nextTotal,
      daysBeforeEvent,
    });

    const contentSourceMode = getCampaignContentSourceMode(
      campaignOpportunity,
      postPlanItem,
      nextIndex,
      nextTotal
    );

    postPlanItem.content_source_mode = contentSourceMode;

    const newSlot = createSlot({
      startDate,
      weekday: getWeekdayFromDateString(startDate, selectedTimeZone),
      publishTime,
      prompt: buildCampaignPrompt(campaignOpportunity, postPlanItem, nextIndex),
      imagePrompt: buildCampaignImagePrompt(campaignOpportunity, postPlanItem),
     generateImage: true,
     contentTypeId: "manual_prompt",
contentTypeLabel: campaignOpportunity.title || "Campaign post",
usesWebsiteContent: shouldUseWebsiteContentForCampaign(
  contentSourceMode,
  campaignOpportunity
),
isCampaignSlot: true,
campaignRole: postPlanItem.role || "Campaign post",
campaignSummary: buildCampaignSummary(
  campaignOpportunity,
  postPlanItem,
  nextIndex
),
dateLocked: false,
timeZone: selectedTimeZone,
    });


    return [...currentSlots, newSlot].sort((a, b) =>
      `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
        `${b.startDate || ""} ${b.publishTime || ""}`
      )
    );
  });
}
function scrollToPlannerSchedule() {
  setTimeout(() => {
    const scheduleElement = document.querySelector(".planner-schedule-card");

    if (scheduleElement) {
      scheduleElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, 120);
}
  function addManualSlot() {
  setMessage("");

  const manualType = getContentTypeById("manual_prompt");
  const nextIndex = slots.length;

  const newSlot = createSlotFromContentType(
    manualType || {
      id: "manual_prompt",
      label: "Manual prompt",
      prompt: "",
      imagePrompt: "",
      usesWebsiteContent: false,
    },
    nextIndex,
    {
      startDate: planStartDate,
      timeZone,
      firstPublishTime: defaultPublishTime,
      generateImage: true,
    }
  );

  const preparedSlot = {
    ...newSlot,
    prompt: "",
    imagePrompt: "",
    generateImage: true,
    contentTypeId: "manual_prompt",
    contentTypeLabel: "Manual prompt",
    usesWebsiteContent: false,
  };

  setSlots((currentSlots) => [...currentSlots, preparedSlot]);
  setExpandedInstructionSlotIds((currentIds) => [
    ...currentIds,
    preparedSlot.id,
  ]);

  scrollToPlannerSchedule();
}
function addSlot() {
  setMessage("");

  if (planCreationMode === "campaign") {
    addCampaignSlot();
    return;
  }

  if (planCreationMode === "manual") {
    addManualSlot();
    return;
  }

  setShowAddPostModal(true);
}

  function addSlotFromContentType(typeId) {
    const selectedType = getContentTypeById(typeId);

    if (!selectedType) {
      return;
    }

    setSlots((currentSlots) => {
      const smartSchedule = buildSmartSlotSchedule({
        startDate: planStartDate,
        count: currentSlots.length + 1,
        timeZone,
        firstPublishTime: defaultPublishTime,
      });

      const schedule = smartSchedule[currentSlots.length] || {
        startDate: planStartDate,
        weekday: getWeekdayFromDateString(planStartDate, timeZone),
        publishTime: getRecommendedTimeForDate(planStartDate, timeZone),
      };

      const newSlot = createSlot({
        startDate: schedule.startDate,
        publishTime: schedule.publishTime,
        weekday: schedule.weekday,
        prompt: selectedType.prompt,
        imagePrompt: selectedType.imagePrompt,
        generateImage: selectedType.id === "manual_prompt" ? false : true,
        contentTypeId: selectedType.id,
        contentTypeLabel: selectedType.label,
        usesWebsiteContent: Boolean(selectedType.usesWebsiteContent),
        timeZone,
      });

      if (selectedType.id === "manual_prompt") {
        setExpandedInstructionSlotIds((currentIds) => [
          ...currentIds,
          newSlot.id,
        ]);
      }

      return [...currentSlots, newSlot];
    });

    setShowAddPostModal(false);
  }
  function duplicateSlot(slotId) {
    const slotToCopy = slots.find((slot) => slot.id === slotId);
    if (!slotToCopy) return;

    setSlots((currentSlots) => [
      ...currentSlots,
      {
        ...slotToCopy,
        id: makeSlotId(),
      },
    ]);
  }

  function removeSlot(slotId) {
  if (slots.length === 1) {
    setMessage("You need at least one planned post.");
    return;
  }

  const slotIndex = slots.findIndex((slot) => slot.id === slotId);

  setSlots((currentSlots) =>
    currentSlots.filter((slot) => slot.id !== slotId)
  );

  if (planCreationMode === "select" && slotIndex >= 0) {
    setSelectedContentTypeIds((currentTypeIds) =>
      currentTypeIds.filter((_, index) => index !== slotIndex)
    );
  }
}

function changeAutoPlanGoal(goalId) {
  if (!goalId) {
    setAutoPlanGoal("");
    setSelectedContentTypeIds([]);
    setSlots([]);
    return;
  }

  const goalContentTypeIds = getGoalContentTypeIds({
    goalId,
    postCount: autoPlanPostCount,
    websiteProductModeAvailable,
  });

  setMessage("");
  setSavedPlanSummary(null);
  setAutoPlanGoal(goalId);
  
  if (planCreationMode === "select") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

  setSelectedContentTypeIds(goalContentTypeIds);

  setSlots(
    createRecommendedSlots({
      startDate: planStartDate,
      timeZone,
      autoPlanGoal: goalId,
      firstPublishTime: defaultPublishTime,
      postCount: autoPlanPostCount,
      websiteProductModeAvailable,
    })
  );
}
 function changeAutoPlanPostCount(nextCount) {
  setMessage("");
  setAutoPlanPostCount(nextCount);

   if (planCreationMode === "select") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

  if (!autoPlanGoal) {
    setSlots([]);
    setSelectedContentTypeIds([]);
    return;
  }

  const goalContentTypeIds = getGoalContentTypeIds({
    goalId: autoPlanGoal,
    postCount: nextCount,
    websiteProductModeAvailable,
  });

  setSelectedContentTypeIds(goalContentTypeIds);

  setSlots(
    createRecommendedSlots({
      startDate: planStartDate,
      timeZone,
      autoPlanGoal,
      firstPublishTime: defaultPublishTime,
      postCount: nextCount,
      websiteProductModeAvailable,
    })
  );
}
  function changePlanCreationMode(mode) {
    setMessage("");
    setPlanCreationMode(mode);

 if (mode === "auto") {
  if (!autoPlanGoal) {
    setSelectedContentTypeIds([]);
    setSlots([]);
    return;
  }

  const goalContentTypeIds = getGoalContentTypeIds({
    goalId: autoPlanGoal,
    postCount: autoPlanPostCount,
    websiteProductModeAvailable,
  });

  setSelectedContentTypeIds(goalContentTypeIds);

  setSlots(
    createRecommendedSlots({
      startDate: planStartDate,
      timeZone,
      autoPlanGoal,
      firstPublishTime: defaultPublishTime,
      postCount: autoPlanPostCount,
      websiteProductModeAvailable,
    })
  );

  return;
}

  if (mode === "select") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

  if (mode === "manual") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

if (mode === "manual") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

setSelectedContentTypeIds([]);
setSlots([
  createSlot({
    startDate: planStartDate,
    weekday: getWeekdayFromDateString(planStartDate, timeZone),
    publishTime: defaultPublishTime,
    timeZone,
  }),
]);
  }

function toggleContentType(typeId) {
  setMessage("");

  if (typeId === "website_item" && !websiteProductModeAvailable) {
    return;
  }

  if (selectedContentTypeIds.length >= autoPlanPostCount) {
    setMessage(
      `You have already selected ${autoPlanPostCount} posts. Remove a post below or change posts per week.`
    );
    return;
  }

  const selectedType = getContentTypeById(typeId);

  if (!selectedType) {
    return;
  }

  const nextIndex = selectedContentTypeIds.length;

  const newSlot = createSlotFromContentType(selectedType, nextIndex, {
    startDate: planStartDate,
    timeZone,
    firstPublishTime: defaultPublishTime,
  });

  setSelectedContentTypeIds((currentTypeIds) => [...currentTypeIds, typeId]);
  setSlots((currentSlots) => [...currentSlots, newSlot]);

  setRecentlyAddedContentTypeId(typeId);

  setTimeout(() => {
    setRecentlyAddedContentTypeId("");
  }, 450);

  if (nextIndex + 1 >= autoPlanPostCount) {
    scrollToPlannerSchedule();
  }
}

  function toggleRuleSelection(ruleId) {
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);

    setSelectedRuleIds((currentIds) =>
      currentIds.includes(ruleId)
        ? currentIds.filter((id) => id !== ruleId)
        : [...currentIds, ruleId]
    );
  }

  function toggleSelectVisibleRules() {
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);

    if (allVisibleRulesSelected) {
      setSelectedRuleIds((currentIds) =>
        currentIds.filter((ruleId) => !visibleRuleIds.includes(ruleId))
      );
      return;
    }

    setSelectedRuleIds((currentIds) =>
      Array.from(new Set([...currentIds, ...visibleRuleIds]))
    );
  }

  function clearSelectedRules() {
    setSelectedRuleIds([]);
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);
  }

  async function deleteRulesByIds(ruleIds) {
    if (!ruleIds.length) return;

    setDeletingRules(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const selectedBrandId =
  currentBrandId || (await getCurrentBrandIdForUser(user));

const { error } = await supabase
  .from("automation_rules")
  .delete()
  .eq("user_id", user.id)
  .eq("brand_profile_id", selectedBrandId)
  .in("id", ruleIds);

    if (error) {
      setMessage(error.message);
      setDeletingRules(false);
      return;
    }

    setRules((currentRules) =>
      currentRules.filter((rule) => !ruleIds.includes(rule.id))
    );
    setSelectedRuleIds((currentIds) =>
      currentIds.filter((ruleId) => !ruleIds.includes(ruleId))
    );
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);
    setMessage(
      `${ruleIds.length} automation rule${
        ruleIds.length === 1 ? "" : "s"
      } deleted.`
    );

    setDeletingRules(false);
  }

  async function deleteSelectedRules() {
    if (!selectedRuleIds.length) return;

    if (!confirmingBulkDelete) {
      setConfirmingBulkDelete(true);
      setConfirmingSingleDeleteId(null);
      return;
    }

    await deleteRulesByIds(selectedRuleIds);
  }

  async function deleteSingleRule(ruleId) {
    if (confirmingSingleDeleteId !== ruleId) {
      setConfirmingSingleDeleteId(ruleId);
      setConfirmingBulkDelete(false);
      return;
    }

    await deleteRulesByIds([ruleId]);
  }

  async function savePlan() {
    setMessage("");
    setSavedPlanSummary(null);

    if (!slots.length) {
  setMessage("Choose a goal before saving a content plan.");
  return;
}

    const invalidDateSlot = slots.find((slot) => !slot.startDate);

    if (invalidDateSlot) {
      setMessage("Every planned post needs a start date.");
      return;
    }

    const invalidTimeSlot = slots.find((slot) => !slot.publishTime);

    if (invalidTimeSlot) {
      setMessage("Every planned post needs a publishing time.");
      return;
    }

    const invalidSlot = slots.find((slot) => !slot.prompt.trim());

    if (invalidSlot) {
      setMessage(
        "Every planned post needs its own prompt. Choose a content type or write a manual prompt."
      );
      return;
    }

       if (creditBalance && plannedCredits > creditBalance.credits_remaining) {
      setMessage(
        `This plan needs ${plannedCredits} credits, but you only have ${creditBalance.credits_remaining} credits remaining.`
      );
      return;
    }

    if (!platform) {
      setMessage(
        "Connect a social channel before saving this content plan."
      );
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

  const selectedBrandId =
  currentBrandId || (await getCurrentBrandIdForUser(user));

if (!selectedBrandId) {
  setMessage("Choose or create a brand before saving an automation plan.");
  setSaving(false);
  return;
}

setCurrentBrandId(selectedBrandId);

const selectedTimeZone = timeZone || DEFAULT_TIME_ZONE;

const rows = slots.map((slot) => {
      const slotWeekday = getWeekdayFromDateString(
        slot.startDate,
        selectedTimeZone
      );

      return {
        user_id: user.id,
        brand_profile_id: selectedBrandId,
        name:
          planName ||
          slot.contentTypeLabel ||
          `${slotWeekday} ${slot.publishTime}`,
        weekday: slotWeekday,
        publish_time: slot.publishTime,
        prompt:
  slot.isCampaignSlot && slot.campaignSummary
    ? `${slot.prompt}

Post idea visible to customer:
${slot.campaignSummary}`
    : slot.prompt,
        platform,
        tone,
        language,
        post_type: postType,
        length,
        cta_type: ctaType,
        generate_image: slot.generateImage,
        image_prompt: slot.imagePrompt,
        include_emojis: slot.includeEmojis,
        include_hashtags: slot.includeHashtags,
        credit_cost: slot.generateImage ? 3 : 1,
        schedule_type: scheduleType,
        run_date: slot.startDate,
        timezone: selectedTimeZone,
        next_run_at: getInitialNextRunAtIso({
          scheduleType,
          publishTime: slot.publishTime,
          startDate: slot.startDate,
          timeZone: selectedTimeZone,
        }),
        approval_required: approvalRequired,
        is_active: true,
        content_type_id: slot.contentTypeId,
        content_type_label: slot.contentTypeLabel,
        uses_website_content: Boolean(slot.usesWebsiteContent),
        updated_at: new Date().toISOString(),
      };
    });

    const { data: insertedRules, error } = await supabase
  .from("automation_rules")
  .insert(rows)
  .select("*");

      if (error) {
      setMessage(error.message);
    } else {
      const nextRunDates = rows
        .map((row) => row.next_run_at)
        .filter(Boolean)
        .sort((a, b) => new Date(a) - new Date(b));

      const firstSlot = slots
        .slice()
        .sort((a, b) =>
          `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
            `${b.startDate || ""} ${b.publishTime || ""}`
          )
        )[0];

      const firstPostLabel = nextRunDates[0]
        ? formatDateTime(nextRunDates[0], selectedTimeZone)
        : firstSlot
        ? `${formatStartDateLabel(
            firstSlot.startDate,
            selectedTimeZone
          )} at ${normalizeTime(firstSlot.publishTime)}`
        : "Not set";

      setMessage("");

      setSavedPlanSummary({
        name: planName.trim() || "Content plan",
        totalPosts: rows.length,
        scheduleType,
        postsPerWeek: scheduleType === "weekly" ? rows.length : null,
        firstPostLabel,
        publishingMode: approvalRequired
          ? "Review before publishing"
          : "Publish automatically",
        credits: plannedCredits,
        method: formatPlanMode(planCreationMode),
      });

setPlanName("");
setLanguage("Auto");

setRules((currentRules) =>
  sortAutomationRules([...(insertedRules || []), ...currentRules])
);
    }

    setSaving(false);
  }
 function startAnotherPlan() {
  setMessage("");
  setSavedPlanSummary(null);
  setCampaignOpportunity(null);

  setPlanCreationMode("auto");
  setAutoPlanGoal("");
  setAutoPlanPostCount(DEFAULT_AUTO_PLAN_POST_COUNT);
  setSelectedContentTypeIds([]);
  setSlots([]);

  setPlanName("");
  setLanguage("Auto");
  setTone("Friendly");
  setPostType("Offer");
  setLength("Medium");
  setCtaType("Learn more");
  setApprovalRequired(true);
  setScheduleType("weekly");
  setShowAdvancedSettings(false);

  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.delete("campaignOpportunityId");
    url.searchParams.delete("brandProfileId");
    window.history.replaceState({}, "", url.toString());
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
  return (
    <AppLayout active="automation">
      <div
        className="automation-page planner-wizard-page"
        onClick={(event) => {
          if (!event.target.closest(".custom-picker-field")) {
            setOpenPickerId(null);
          }
        }}
      >
     <header className="planner-hero">
  <div>
    <h2>
      {campaignOpportunity
        ? `Create campaign: ${campaignOpportunity.title}`
        : "Create your social content"}
    </h2>
    <p>
      {campaignOpportunity
        ? "Spreelo has prepared a focused campaign plan from your campaign calendar."
        : "Plan and create posts for your social channels."}
    </p>
  </div>

<button
  type="button"
  className="learn-more-button"
  onClick={() => setShowLearnMoreModal(true)}
>
  ⓘ Learn more
</button>
</header>

{campaignOpportunity && (
  <section className="campaign-mode-banner">
    <div>
      <p className="dashboard-eyebrow">Campaign mode</p>
      <h3>{campaignOpportunity.title}</h3>
      <span>
        {campaignOpportunity.description ||
          "This plan is connected to a selected campaign opportunity."}
      </span>
    </div>

      <div className="campaign-mode-meta">
      <span>Campaign date</span>
      <strong>{getCampaignDateLabel(campaignOpportunity)}</strong>

      <span>Recommended plan</span>
      <strong>
        {getCampaignRecommendedPostCount(campaignOpportunity, slots.length)} posts
      </strong>
    </div>
  </section>
)}

<div className="wizard-layout">
          <main className="wizard-main">
            <section className="planner-setup-grid">
<div className="planner-setup-card">
  <div className="setup-step-title">
    <span>1</span>
    <div>
      <strong>
        {planCreationMode === "campaign" ? "Campaign goal" : "Choose goal"}
      </strong>
      <small>
        {planCreationMode === "campaign"
          ? "This plan is based on your selected campaign."
          : "What is your main objective?"}
      </small>
    </div>
  </div>

  {planCreationMode === "campaign" ? (
    <div className="planner-campaign-count-box">
      <strong>🎯</strong>
      <span>Focused campaign from calendar</span>
    </div>
  ) : (
   <select
  className="planner-select-control"
  value={planCreationMode === "manual" ? "" : autoPlanGoal}
  disabled={planCreationMode === "manual"}
  onChange={(event) => {
    changeAutoPlanGoal(event.target.value);
  }}
>
 <option value="" disabled>
  {planCreationMode === "manual"
    ? "Not used for manual prompt"
    : "Choose a goal to build your plan"}
</option>
      {autoPlanGoals.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {goal.label}
        </option>
      ))}
    </select>
  )}

  <p>
    {planCreationMode === "campaign"
      ? "Spreelo keeps this plan connected to the campaign opportunity."
      : "Spreelo tailors the content mix to match the goal you choose."}
  </p>
</div>

              <div className="planner-setup-card">
                <div className="setup-step-title">
                  <span>2</span>
                  <div>
                    <strong>
                      {planCreationMode === "campaign"
                        ? "Campaign posts"
                        : "Posts per week"}
                    </strong>
                    <small>
                      {planCreationMode === "campaign"
                        ? "How many posts are included in this campaign?"
                        : "How often should Spreelo post?"}
                    </small>
                  </div>
                </div>

                {planCreationMode === "campaign" ? (
                  <div className="planner-campaign-count-box">
                    <strong>{slots.length}</strong>
                    <span>planned campaign posts</span>
                  </div>
                ) : (
                  <div className="planner-segmented-buttons">
                    {autoPlanPostCountOptions.map((option) => (
                   <button
  type="button"
  key={option}
  disabled={planCreationMode === "manual"}
  className={
    planCreationMode !== "manual" && autoPlanPostCount === option
      ? "active"
      : ""
  }
  onClick={() => {
    if (planCreationMode === "manual") return;
    changeAutoPlanPostCount(option);
  }}
>
  {option}
</button>
                    ))}
                  </div>
                )}

                <p>
                 {planCreationMode === "campaign"
  ? `${slots.length} posts are prepared for this campaign.`
  : planCreationMode === "manual"
  ? "Manual posts are added one by one."
  : "Recommended for steady growth and consistent visibility."}
                </p>
              </div>

              <div className="planner-setup-card">
                <div className="setup-step-title">
                  <span>3</span>
                  <div>
                    <strong>Start date & time</strong>
                    <small>When should we start?</small>
                  </div>
                </div>

                <div className="planner-date-time-row">
                  <DatePickerField
                    value={planStartDate}
                    onChange={updatePlanStartDate}
                    pickerId="top-start-date"
                    openPickerId={openPickerId}
                    setOpenPickerId={setOpenPickerId}
                    timeZone={timeZone}
                    compact
                  />

                  <TimePickerField
                    value={defaultPublishTime}
                    onChange={updateDefaultPublishTime}
                    pickerId="top-start-time"
                    openPickerId={openPickerId}
                    setOpenPickerId={setOpenPickerId}
                    compact
                  />
                </div>

                <p>Spreelo builds the schedule from this date and time.</p>
              </div>
            </section>

            {planCreationMode === "campaign" ? (
  <section className="planner-mode-card">
    <div className="planner-included-card">
      <div className="planner-section-heading compact">
        <div>
          <h3>Campaign posts</h3>
          <p>
            Spreelo has created a campaign-specific sequence based on the
            selected opportunity.
          </p>
        </div>
      </div>

      <div className="planner-included-grid">
        <div className="planner-included-type">
          <span>🎯</span>
          <strong>Campaign plan</strong>
        </div>

        <div className="planner-included-type">
          <span>{slots.length}</span>
          <strong>Planned posts</strong>
        </div>
      </div>
    </div>
  </section>
) : (
  <section className="planner-mode-card">
    <div className="planner-mode-grid">
      <button
        type="button"
        className={`planner-mode-option ${
          planCreationMode === "auto" ? "active" : ""
        }`}
        onClick={() => changePlanCreationMode("auto")}
      >
        <span className="mode-radio">
          {planCreationMode === "auto" ? "✓" : ""}
        </span>
        <div className="mode-big-icon">✦</div>
        <strong>Auto-plan</strong>
        <p>AI creates the optimal plan for your goal.</p>
        <small>Recommended</small>
      </button>

      <button
        type="button"
        className={`planner-mode-option ${
          planCreationMode === "select" ? "active" : ""
        }`}
        onClick={() => changePlanCreationMode("select")}
      >
        <span className="mode-radio">
          {planCreationMode === "select" ? "✓" : ""}
        </span>
        <div className="mode-big-icon neutral">▦</div>
        <strong>Choose content types</strong>
        <p>Pick the post types you want to include.</p>
      </button>

      <button
        type="button"
        className={`planner-mode-option ${
          planCreationMode === "manual" ? "active" : ""
        }`}
        onClick={() => changePlanCreationMode("manual")}
      >
        <span className="mode-radio">
          {planCreationMode === "manual" ? "✓" : ""}
        </span>
        <div className="mode-big-icon neutral">✎</div>
        <strong>Manual prompt</strong>
        <p>Guide the AI with a few words about what you want.</p>
      </button>
    </div>

    {planCreationMode === "select" && (
      <div className="planner-content-picker">
        <div className="planner-section-heading">
          <div>
         <h3>Choose {autoPlanPostCount} post types</h3>
<p>
  Click a post type to add it to your plan. You can choose the same
  type more than once.
</p>
          </div>

          <span>
  {Math.min(selectedContentTypeIds.length, autoPlanPostCount)}/
  {autoPlanPostCount} selected
</span>
        </div>

        <div className="planner-content-grid">
                    {visibleContentTypes.map((type) => {
            const isRecentlyAdded = recentlyAddedContentTypeId === type.id;

            return (
              <button
                type="button"
                key={type.id}
               className={`planner-content-chip ${
  isRecentlyAdded ? "just-added" : ""
}`}
                onClick={() => toggleContentType(type.id)}
              >
                <span>{getContentTypeIcon(type.id)}</span>
                <strong>{type.shortLabel || type.label}</strong>
                <p>{type.description}</p>
              </button>
            );
          })}
        </div>
        <div className="content-picker-progress-note">
  {selectedContentTypeIds.length < autoPlanPostCount ? (
    <span>
      Choose {autoPlanPostCount - selectedContentTypeIds.length} more post
      {autoPlanPostCount - selectedContentTypeIds.length === 1 ? "" : "s"} to
      complete this plan.
    </span>
  ) : (
    <span>Your plan is ready. Review the schedule below.</span>
  )}
</div>
      </div>
    )}

  </section>
)}
            {planCreationMode === "manual" && !planWasSaved && (
  <section className="planner-manual-intro-card">
    <div>
      <h3>Manual prompt</h3>
      <p>
        Add one or more manual posts. Each post can have its own instructions
        and optional image direction.
      </p>
    </div>

    <button type="button" className="add-plan-button" onClick={addManualSlot}>
      + Add manual post
    </button>
  </section>
)}
{shouldShowPlannerDetails && (
  <>
              {planWasSaved ? (
  <section className="planner-schedule-card campaign-saved-card">
    <div className="campaign-saved-icon">✓</div>

    <div>
      <p className="dashboard-eyebrow">Campaign scheduled</p>
      <h3>{savedPlanSummary.name} is ready</h3>
      <p>
        Spreelo has saved this campaign as content plan. The planned posts
        are now scheduled and will follow the publishing mode you selected.
      </p>

      <div className="campaign-saved-grid">
        <div>
          <span>Planned posts</span>
          <strong>{savedPlanSummary.totalPosts}</strong>
        </div>

        <div>
          <span>First post</span>
          <strong>{savedPlanSummary.firstPostLabel}</strong>
        </div>

        <div>
          <span>Publishing mode</span>
          <strong>{savedPlanSummary.publishingMode}</strong>
        </div>

        <div>
          <span>Credits</span>
          <strong>{savedPlanSummary.credits}</strong>
        </div>
      </div>

      <div className="campaign-saved-actions">
        <button type="button" onClick={() => setShowSavedRules(true)}>
          View content plans
        </button>

        <a href="/">Go to dashboard</a>
      </div>
    </div>
  </section>
) : (
  <section className="planner-schedule-card">
    <div className="planner-schedule-header">
      <div>
        <h3>Posts & schedule</h3>
        <span>{slots.length} posts planned</span>
      </div>

       <div className="planner-schedule-actions">
        <a className="view-calendar-button" href="/calendar">
          View calendar
        </a>
      </div>
    </div>

    <div className="planner-post-table">
      {slots.map((slot, index) => {
        const instructionsAreExpanded =
          expandedInstructionSlotIds.includes(slot.id);
        const displayLabel = getSlotDisplayLabel(slot);
        const displayDescription = getSlotDisplayDescription(slot);
        const formatLabel = getSlotFormatLabel(slot);

        return (
          <article
          className={`planner-post-row type-${slot.contentTypeId || "custom"} ${
  instructionsAreExpanded ? "expanded" : ""
}`}
            key={slot.id}
          >
            <div className="planner-post-mainline">
              <div className="planner-post-index">{index + 1}</div>

              <div className="planner-post-title">
                <strong>{displayLabel}</strong>
                <span>{displayDescription}</span>
              </div>

              <div className="planner-post-date">
                {slot.dateLocked ? (
                  <div className="locked-campaign-date">
                    <strong>{formatStartDateLabel(slot.startDate, timeZone)}</strong>
                    <span>Locked campaign date</span>

                    <button
                      type="button"
                      className="unlock-campaign-date-button"
                      onClick={() => updateSlot(slot.id, "dateLocked", false)}
                    >
                      Unlock
                    </button>
                  </div>
                ) : (
                  <DatePickerField
                    value={slot.startDate}
                    onChange={(value) =>
                      updateSlot(slot.id, "startDate", value)
                    }
                    pickerId={`slot-date-${slot.id}`}
                    openPickerId={openPickerId}
                    setOpenPickerId={setOpenPickerId}
                    timeZone={timeZone}
                    compact
                  />
                )}
              </div>

              <div className="planner-post-time">
                <TimePickerField
                  value={slot.publishTime}
                  onChange={(value) =>
                    updateSlot(slot.id, "publishTime", value)
                  }
                  pickerId={`slot-time-${slot.id}`}
                  openPickerId={openPickerId}
                  setOpenPickerId={setOpenPickerId}
                  compact
                />
              </div>

              <div className="planner-post-format">
                <span>{slot.generateImage ? "▧" : "T"}</span>
                {formatLabel}
              </div>

              <div className="planner-post-actions">
                <button
                  type="button"
                  onClick={() => toggleSlotInstructions(slot.id)}
                >
                  {instructionsAreExpanded ? "Hide" : "Edit"}
                </button>

                <button
                  type="button"
                  title="Duplicate"
                  onClick={() => duplicateSlot(slot.id)}
                >
                  ⧉
                </button>

              <button
  type="button"
  title="Remove"
  aria-label="Remove post"
  className="planner-post-delete-button"
  onClick={() => removeSlot(slot.id)}
>
  🗑
</button>
              </div>
            </div>

            {(instructionsAreExpanded ||
              planCreationMode === "manual" ||
              (!slot.isCampaignSlot && slot.contentTypeId === "manual_prompt")) && (
              <div className="planner-post-expanded">
                <div className="planner-post-expanded-copy">
                  <label>{slot.isCampaignSlot ? "Post idea" : "Instructions"}</label>

                  <textarea
                    className="input prompt-textarea"
                    value={slot.isCampaignSlot ? slot.campaignSummary : slot.prompt}
                    onChange={(event) =>
                      updateSlot(
                        slot.id,
                        slot.isCampaignSlot ? "campaignSummary" : "prompt",
                        event.target.value
                      )
                    }
                    placeholder={
  slot.isCampaignSlot
    ? "Describe what this campaign post should be about"
    : "Tell Spreelo what this post should be about."
}
                  />

                  {slot.generateImage && (
                    <>
                      <label>Image direction</label>
                      <textarea
                        className="input prompt-textarea"
                        value={slot.imagePrompt}
                        onChange={(event) =>
                          updateSlot(slot.id, "imagePrompt", event.target.value)
                        }
                        placeholder="Optional: describe what the image should show."
                      />
                    </>
                  )}
                </div>

                <div className="planner-post-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={slot.generateImage}
                      onChange={(event) =>
                        updateSlot(slot.id, "generateImage", event.target.checked)
                      }
                    />
                    {slot.usesWebsiteContent
                      ? "Website image / AI fallback"
                      : "AI image"}
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={slot.includeEmojis}
                      onChange={(event) =>
                        updateSlot(slot.id, "includeEmojis", event.target.checked)
                      }
                    />
                    Emojis
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={slot.includeHashtags}
                      onChange={(event) =>
                        updateSlot(slot.id, "includeHashtags", event.target.checked)
                      }
                    />
                    Hashtags
                  </label>

                  <span>{getSlotCreditLabel(slot)}</span>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>

       <button
      type="button"
      className="planner-add-post-bottom"
      onClick={addSlot}
    >
      {planCreationMode === "campaign"
        ? "Add another campaign post"
        : planCreationMode === "manual"
        ? "Add another manual post"
        : "Add another post"}
    </button>
  </section>
)}

                        <section className="planner-settings-card">
              <div className="planner-section-heading">
                <div>
                  <h3>Settings</h3>
                  <p>
                    These settings apply to all planned posts. You can keep the
                    recommended defaults.
                  </p>
                </div>

                <span>Recommended</span>
              </div>

            <div className="planner-settings-grid simple">
  {loadingConnectedPlatforms ? (
    <div className="planner-setting-field planner-setting-connect-box">
      <span>Platform</span>
      <div className="input">Loading connected channels...</div>
    </div>
  ) : connectedPlatforms.length > 0 ? (
    <label className="planner-setting-field">
      <span>Platform</span>
      <select
        value={platform}
        onChange={(event) => setPlatform(event.target.value)}
      >
        {connectedPlatforms.map((item) => (
          <option key={item.value} value={item.label}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <div className="planner-setting-field planner-setting-connect-box">
      <span>Platform</span>

      <div className="planner-connect-first-card">
        <strong>Connect a social channel first</strong>
        <p>
          You need to connect a publishing channel for this brand before saving
          this plan.
        </p>

        <a href="/social-channels" className="planner-connect-first-link">
          Go to Social channels
        </a>
      </div>
    </div>
  )}

  <label className="planner-setting-field">
    <span>Language</span>
    <select
      value={language}
      onChange={(event) => setLanguage(event.target.value)}
    >
      <option value="Auto">Auto-detect</option>
      <option value="English">English</option>
    </select>
  </label>

  <label className="planner-setting-field">
    <span>Publishing mode</span>
    <select
      value={approvalRequired ? "review" : "auto"}
      onChange={(event) =>
        setApprovalRequired(event.target.value === "review")
      }
    >
      <option value="review">Review before publishing</option>
      <option value="auto">Publish automatically</option>
    </select>
  </label>

  <label className="planner-setting-field">
    <span>Repeat</span>
    <select
      value={scheduleType}
      onChange={(event) => setScheduleType(event.target.value)}
    >
      <option value="weekly">Weekly</option>
      <option value="once">One time</option>
    </select>
  </label>
</div>

<div className="planner-advanced-toggle-row">
  <button
    type="button"
    className="planner-advanced-toggle"
    onClick={() => setShowAdvancedSettings((current) => !current)}
  >
    {showAdvancedSettings ? "Hide advanced settings" : "Advanced settings"}
  </button>
</div>

{showAdvancedSettings && (
  <div className="planner-settings-grid advanced">
    <label className="planner-setting-field">
      <span>Tone</span>
      <select
        value={tone}
        onChange={(event) => setTone(event.target.value)}
      >
        <option>Friendly</option>
        <option>Professional</option>
        <option>Sales-focused</option>
        <option>Premium</option>
      </select>
    </label>

    <label className="planner-setting-field">
      <span>Post type</span>
      <select
        value={postType}
        onChange={(event) => setPostType(event.target.value)}
      >
        <option>Offer</option>
        <option>News</option>
        <option>Educational</option>
        <option>Reminder</option>
      </select>
    </label>

    <label className="planner-setting-field">
      <span>Length</span>
      <select
        value={length}
        onChange={(event) => setLength(event.target.value)}
      >
        <option>Short</option>
        <option>Medium</option>
        <option>Long</option>
      </select>
    </label>

    <label className="planner-setting-field">
      <span>CTA style</span>
      <select
        value={ctaType}
        onChange={(event) => setCtaType(event.target.value)}
      >
        <option>Learn more</option>
        <option>Visit website</option>
        <option>Contact us</option>
        <option>Book now</option>
        <option>Shop now</option>
      </select>
    </label>

    <label className="planner-setting-field">
      <span>Timezone</span>
      <select
        value={timeZone}
        onChange={(event) => setTimeZone(event.target.value)}
      >
        {timeZoneOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  </div>
)}
            </section>
  </>
)}
            <section className="planner-save-card">
              <div>
  <h3>{savedPlanSummary ? "Plan saved" : "Step 4: Save plan"}</h3>
  <p>
    {savedPlanSummary
      ? "Your automation plan is ready. Create another plan when you want."
      : "Give your plan a name so you can find it later."}
  </p>
</div>
         {savedPlanSummary ? (
  <div className="planner-create-another-panel">
    <button
      type="button"
      className="planner-create-another-button"
      onClick={startAnotherPlan}
    >
      Create another plan
    </button>
  </div>
) : (
  <>
    <input
      className="planner-save-input"
      value={planName}
      onChange={(event) => setPlanName(event.target.value)}
      placeholder="e.g., Weekly awareness plan"
    />

    <button
      type="button"
      className="planner-save-button"
      onClick={savePlan}
      disabled={saving || !hasEnoughCredits}
    >
      {saving ? "Saving..." : "Save content plan"}
    </button>
  </>
)}

                          {message && <p className="planner-save-message">{message}</p>}

              {savedPlanSummary && (
                <div className="planner-save-success">
                  <div className="planner-save-success-icon">✓</div>

                  <div className="planner-save-success-content">
                    <div className="planner-save-success-header">
                      <div>
                        <p>Your content plan is saved</p>
                        <h4>{savedPlanSummary.name}</h4>
                      </div>

                      <span>{savedPlanSummary.method}</span>
                    </div>

                    <div className="planner-save-success-grid">
                      <div>
                        <span>
                          {savedPlanSummary.scheduleType === "weekly"
                            ? "Posts per week"
                            : "Planned posts"}
                        </span>
                        <strong>
                          {savedPlanSummary.scheduleType === "weekly"
                            ? `${savedPlanSummary.postsPerWeek} posts`
                            : `${savedPlanSummary.totalPosts} post${
                                savedPlanSummary.totalPosts === 1 ? "" : "s"
                              }`}
                        </strong>
                      </div>

                      <div>
                        <span>First post</span>
                        <strong>{savedPlanSummary.firstPostLabel}</strong>
                      </div>

                      <div>
                        <span>Publishing mode</span>
                        <strong>{savedPlanSummary.publishingMode}</strong>
                      </div>

                      <div>
                        <span>Credits</span>
                        <strong>
                          {savedPlanSummary.credits} credits used when generated
                        </strong>
                      </div>
                    </div>

                    <div className="planner-save-success-actions">
                      <button
                        type="button"
                        onClick={() => setShowSavedRules(true)}
                      >
                        View content plans
                      </button>

                      <a href="/">Go to dashboard</a>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section className="saved-card saved-card-compact">
              <div className="saved-header">
                <div>
                  <p>Saved plans</p>
                  <h3>Content plans</h3>
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => setShowSavedRules((current) => !current)}
                  >
                    {showSavedRules ? "Hide" : "Show all"}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="automation-empty">
                  <h4>Loading content plans...</h4>
                  <p>Please wait while Spreelo loads your saved plans.</p>
                </div>
              ) : rules.length === 0 ? (
                <div className="automation-empty">
                  <div className="folder-icon">📁</div>
                  <div>
                    <h4>No content plans yet</h4>
                    <p>
                      Add your first content plan above. Each planned post will
                      be saved as its own automation rule.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="saved-bulk-actions">
                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={allVisibleRulesSelected}
                        onChange={toggleSelectVisibleRules}
                      />
                      Select visible
                    </label>

                    <span>
                      {selectedRuleIds.length} selected
                      {!showSavedRules && rules.length > 3
                        ? ` · showing ${visibleRules.length} of ${rules.length}`
                        : ""}
                    </span>

                    {selectedRuleIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={clearSelectedRules}
                          disabled={deletingRules}
                        >
                          Clear
                        </button>

                        <button
                          type="button"
                          className="danger-button"
                          onClick={deleteSelectedRules}
                          disabled={deletingRules}
                        >
                          {deletingRules
                            ? "Deleting..."
                            : confirmingBulkDelete
                            ? `Confirm delete ${selectedRuleIds.length}`
                            : `Delete selected (${selectedRuleIds.length})`}
                        </button>
                      </>
                    )}

                    {confirmingBulkDelete && (
                      <span className="delete-confirm-note">
                        Click confirm to permanently delete selected rules.
                      </span>
                    )}
                  </div>

                  <div className="saved-rule-list">
                    {visibleRules.map((rule) => {
                      const ruleTimeZone = rule.timezone || DEFAULT_TIME_ZONE;
                      const isSelected = selectedRuleIds.includes(rule.id);
                      const isConfirmingDelete =
                        confirmingSingleDeleteId === rule.id;

                      return (
                        <article
                          className={`saved-rule-card ${
                            isSelected ? "selected" : ""
                          }`}
                          key={rule.id}
                        >
                          <label className="image-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRuleSelection(rule.id)}
                            />
                          </label>

                          <div>
                            <h4>
                              {rule.schedule_type === "once"
                                ? rule.run_date
                                : rule.weekday}{" "}
                              · {rule.publish_time?.slice(0, 5)}
                            </h4>
                            <p>
                              {rule.platform} ·{" "}
                              {rule.content_type_label || rule.post_type} ·{" "}
                              {rule.uses_website_content
                                ? "Website content"
                                : rule.generate_image
                                ? "Text + image"
                                : "Text only"}{" "}
                              ·{" "}
                              {rule.approval_required
                                ? "Review first"
                                : "Auto publish"}
                            </p>
                            <small>
                              Next run:{" "}
                              {formatDateTime(rule.next_run_at, ruleTimeZone)}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => deleteSingleRule(rule.id)}
                            disabled={deletingRules}
                          >
                            {isConfirmingDelete ? "Confirm" : "Delete"}
                          </button>
                        </article>
                      );
                    })}

                    {!showSavedRules && rules.length > 3 && (
                      <button
                        type="button"
                        className="show-more-rules"
                        onClick={() => setShowSavedRules(true)}
                      >
                        Show {rules.length - 3} more saved rules
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          </main>

                   <aside className="planner-sidebar">
                      <section className="planner-summary-card">
              <div className="planner-sidebar-title planner-summary-title">
                <span>▤</span>
                <div>
                  <h3>Plan summary</h3>
                  <p>Ready to create</p>
                </div>
              </div>

              <div className="planner-summary-list premium">
                {planCreationMode === "auto" && (
                  <div>
                    <span>Goal</span>
                    <strong>{getAutoPlanGoalLabel(autoPlanGoal)}</strong>
                  </div>
                )}

                <div>
                  <span>Method</span>
                  <strong>{formatPlanMode(planCreationMode)}</strong>
                </div>

<div>
  <span>
    {planCreationMode === "campaign"
      ? "Planned posts"
      : scheduleType === "weekly"
      ? "Posts per week"
      : "Planned posts"}
  </span>
  <strong>
    {planCreationMode === "campaign"
      ? `${slots.length} posts`
      : scheduleType === "weekly"
      ? `${slots.length} posts`
      : `${slots.length} post${slots.length === 1 ? "" : "s"}`}
  </strong>
</div>

                <div>
                  <span>Start</span>
                  <strong>
                    {formatStartDateLabel(planStartDate, timeZone)},{" "}
                    {defaultPublishTime}
                  </strong>
                </div>

                <div>
                  <span>Time period</span>
                  <strong>
                    {scheduleType === "weekly" ? "Weekly" : "Once"}
                  </strong>
                </div>

                <div>
                  <span>Total posts</span>
                  <strong>{slots.length}</strong>
                </div>

                <div>
                  <span>Credits</span>
                  <strong>{plannedCredits}</strong>
                </div>
              </div>

              <div className="planner-summary-status">
                <span>✓</span>
                <div>
                  <strong>Plan is ready</strong>
                  <p>You can adjust posts or save the content plan.</p>
                </div>
              </div>

              {creditBalance && !hasEnoughCredits && (
                <div className="planner-sidebar-warning">
                  This plan needs {plannedCredits} credits, but you only have{" "}
                  {creditBalance.credits_remaining} credits remaining.
                </div>
              )}
            </section>

            <section className="planner-credits-card">
              <div className="planner-sidebar-title">
                <span>ⓘ</span>
                <h3>Credits</h3>
              </div>

              {creditBalance ? (
                <>
                  <div className="planner-credit-number">
                    <strong>{creditsRemaining}</strong>
                    <span>/ {monthlyCreditLimit || "—"} credits left</span>
                  </div>

                  <div className="planner-credit-progress">
                    <div style={{ width: `${creditUsagePercent}%` }} />
                  </div>

                            <p className="planner-credit-reset">
                    {subscriptionDateLabel}: {subscriptionDateValue}
                  </p>

                  <div className="planner-credit-included">
                    <span className="planner-credit-included-icon">✓</span>
                    <span>
                      Credits included in{" "}
                      {creditBalance.subscription_status === "trialing"
                        ? "Starter trial"
                        : subscriptionPlanLabel}
                    </span>
                  </div>

                  <div className="planner-credit-wave" />

                  <div className="planner-credit-help">
                    <strong>Need more credits?</strong>
                    <p>Upgrade your plan for more posts and features.</p>
                  </div>

                  <button type="button" className="planner-upgrade-button">
                    Upgrade plan
                  </button>
                </>
              ) : (
                <div className="summary-note">
                  <strong>No credit balance found</strong>
                  <p>
                    Credits will appear here when the account has an active
                    balance.
                  </p>
                </div>
              )}
            </section>
          </aside>
            </div>

        {showAddPostModal && (
          <div
            className="add-post-modal-backdrop"
            onClick={() => setShowAddPostModal(false)}
          >
            <div
              className="add-post-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="add-post-modal-header">
                <div>
                  <p>Add planned post</p>
                  <h3>Choose content type</h3>
                  <span>
                    Select what this new post should be about before it is added
                    to the plan.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddPostModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="add-post-modal-grid">
                              {visibleContentTypes.map((type) => (
                  <button
                    type="button"
                    key={type.id}
                    className="add-post-type-card"
                    onClick={() => addSlotFromContentType(type.id)}
                  >
                    <strong>{type.label}</strong>
                    <p>{type.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {showLearnMoreModal && (
  <div
    className="learn-more-modal-backdrop"
    onClick={() => setShowLearnMoreModal(false)}
  >
    <div
      className="learn-more-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="learn-more-modal-header">
        <div>
          <p>
            {campaignOpportunity ? "Campaign plan help" : "Content Creator help"}
          </p>
          <h3>
            {campaignOpportunity
              ? "About this campaign plan"
              : "How Content Creator works"}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setShowLearnMoreModal(false)}
        >
          ✕
        </button>
      </div>

      {campaignOpportunity ? (
        <div className="learn-more-modal-content">
          <p>
            Spreelo creates a focused content plan from the selected campaign in
            your campaign calendar.
          </p>

          <div className="learn-more-steps">
            <div>
              <span>1</span>
              <strong>Campaign date</strong>
              <p>
                The campaign date controls when the planned posts should be
                published.
              </p>
            </div>

            <div>
              <span>2</span>
              <strong>Recommended plan</strong>
              <p>
                Spreelo uses the recommended number of posts to prepare the full
                campaign sequence.
              </p>
            </div>

            <div>
              <span>3</span>
              <strong>Edit before saving</strong>
              <p>
                You can edit, add, remove and adjust posts before saving the
                final content plan.
              </p>
            </div>

            <div>
              <span>4</span>
              <strong>Nothing is published yet</strong>
              <p>
                Posts are only scheduled after you click Save content plan.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="learn-more-modal-content">
          <p>
            Spreelo helps you create a complete social content plan in a few
            simple steps.
          </p>

          <div className="learn-more-steps">
            <div>
              <span>1</span>
              <strong>Choose a goal</strong>
              <p>
                Pick what you want your content to achieve, such as awareness,
                trust, engagement or sales.
              </p>
            </div>

            <div>
              <span>2</span>
              <strong>Choose post amount</strong>
              <p>
                Select how many posts Spreelo should prepare for your plan.
              </p>
            </div>

            <div>
              <span>3</span>
              <strong>Review the schedule</strong>
              <p>
                Adjust dates, times, images and instructions before saving.
              </p>
            </div>

            <div>
              <span>4</span>
              <strong>Save the plan</strong>
              <p>
                Saved posts are added to your content plan and follow your
                publishing settings.
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="primary-button full"
        onClick={() => setShowLearnMoreModal(false)}
      >
        Got it
      </button>
    </div>
  </div>
)}
      </div>
    </AppLayout>
  );
}
