"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

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
    label: "Reach more customers",
    description:
      "Shareable, useful and visible posts that help more potential customers discover the business.",
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
    label: "Give tips & advice",
    description:
      "Helpful posts that guide customers, answer questions and make it easier to choose.",
  },
  {
    id: "stay_visible",
    icon: "📅",
    label: "Keep the account active",
    description:
      "A balanced weekly mix that keeps the business visible, useful and consistent.",
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
    label: "Reach more customers",
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
    label: "Give tips & advice",
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
    label: "Keep the account active",
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

function getLaterDateString(dateStringA, dateStringB) {
  const firstDate = String(dateStringA || "").trim();
  const secondDate = String(dateStringB || "").trim();

  if (!firstDate) return secondDate;
  if (!secondDate) return firstDate;

  return firstDate >= secondDate ? firstDate : secondDate;
}

function getSafeCampaignStartDate(campaign, timeZone = DEFAULT_TIME_ZONE) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);

  const campaignStartDate =
    campaign?.event_date ||
    campaign?.start_date ||
    todayDateString;

  return getLaterDateString(campaignStartDate, todayDateString);
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

function getRecommendedCampaignPublishTime(intent, timingAnchor) {
  const normalizedIntent = String(intent || "").toLowerCase();
  const normalizedAnchor = String(timingAnchor || "").toLowerCase();

  if (normalizedAnchor === "relationship_event" || normalizedIntent === "event") {
    return "09:00";
  }

  if (normalizedAnchor === "deadline_before_event" || normalizedIntent === "deadline") {
    return "18:30";
  }

  if (normalizedIntent === "engagement") {
    return "19:00";
  }

  if (normalizedIntent === "conversion" || normalizedAnchor === "conversion_before_deadline") {
    return "12:00";
  }

  if (normalizedIntent === "trust") {
    return "10:00";
  }

  if (normalizedIntent === "inspiration") {
    return "11:30";
  }

  return "10:00";
}

function getCampaignPublishTime(baseTime = "09:00", sameDayIndex = 0) {
  const offsets = [0, 120, 240, -90, 360, 480];
  const offset = offsets[sameDayIndex] ?? sameDayIndex * 120;

  return addMinutesToTimeString(baseTime, offset);
}


function addMinutesToTimeString(timeString, minutesToAdd) {
  const [hourValue, minuteValue] = String(timeString || "09:00").split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return "09:00";
  }

  const totalMinutes = Math.min(
    Math.max(hour * 60 + minute + minutesToAdd, 7 * 60),
    21 * 60
  );

  return `${padNumber(Math.floor(totalMinutes / 60))}:${padNumber(
    totalMinutes % 60
  )}`;
}

function getCampaignPublishTimeForDate(
  dateString,
  timeZone = DEFAULT_TIME_ZONE,
  sameDayIndex = 0
) {
  const baseTime = getRecommendedTimeForDate(dateString, timeZone);
  const offsets = [0, 240, 480, -120, 120, 360];
  const offset = offsets[sameDayIndex] ?? sameDayIndex * 120;

  return addMinutesToTimeString(baseTime, offset);
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

function shouldAutoPlanGenerateImage() {
  return true;
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

function getContentPreviewCardId(typeId) {
  const map = {
    website_item: "product_focus",
    problem_solution: "problem_solution",
    tips: "tips_advice",
    mistakes: "common_mistakes",
    faq: "faq",
    behind_scenes: "customer_inspiration",
    checklist: "checklist",
    service_focus: "product_focus",
    case_example: "customer_inspiration",
    myth_fact: "tips_advice",
    local: "local_relevance",
    seasonal: "seasonal",
    comparison: "mini_guide",
    mini_guide: "mini_guide",
    manual_prompt: "custom_prompt",
  };

  return map[typeId] || "content_mix";
}

function getContentPreviewCardIcon(cardId) {
  const icons = {
    product_focus: "🛍️",
    offers: "💝",
    tips_advice: "💡",
    customer_inspiration: "💬",
    faq: "❓",
    reminders: "🔔",
    common_mistakes: "⚠️",
    mini_guide: "📘",
    checklist: "✅",
    seasonal: "☀️",
    local_relevance: "📍",
    problem_solution: "⚡",
    custom_prompt: "✎",
    content_mix: "✦",
  };

  return icons[cardId] || "✦";
}

function getGoalBonusPreviewCardIds(goalId) {
  if (goalId === "sell_more") return ["offers", "reminders"];
  if (goalId === "get_followers") return ["customer_inspiration", "local_relevance"];
  if (goalId === "build_trust") return ["customer_inspiration", "faq"];
  if (goalId === "educate_customers") return ["tips_advice", "mini_guide"];
  if (goalId === "stay_visible") return ["seasonal", "reminders"];

  return [];
}

function getPlanPreviewCardsFromTypes(types = [], goalId = "") {
  const ids = [];

  for (const type of types) {
    const cardId = getContentPreviewCardId(type?.id);
    if (cardId && !ids.includes(cardId)) ids.push(cardId);
  }

  for (const cardId of getGoalBonusPreviewCardIds(goalId)) {
    if (!ids.includes(cardId)) ids.push(cardId);
  }

  return ids.slice(0, 6).map((id) => ({ id, icon: getContentPreviewCardIcon(id) }));
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
  weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
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
              {weekdayLabels.map((weekdayLabel) => (
                <span key={weekdayLabel}>{weekdayLabel}</span>
              ))}
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


function getCtaStrengthLabel(value) {
  if (value === "soft") return "Soft CTA";
  if (value === "medium") return "Medium CTA";
  if (value === "strong") return "Strong CTA";

  return "CTA";
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
  const postCount = Math.max(Math.round(Number(count) || 0), 0);

  if (postCount <= 0) return [];
  if (postCount === 1) return [0];

  const maxLeadDays = Math.max(7, postCount * 5);

  return Array.from({ length: postCount }).map((_, index) => {
    if (index === postCount - 1) return 0;

    const progress = index / Math.max(postCount - 1, 1);
    return Math.max(Math.round(maxLeadDays * (1 - progress)), 1);
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
    return [Math.min(safeDaysUntilEvent, 0)];
  }

  const maxUsableLead = Math.max(safeDaysUntilEvent, 0);

  if (maxUsableLead === 0) {
    return Array.from({ length: postCount }, () => 0);
  }

  const generatedDays = Array.from({ length: postCount }).map((_, index) => {
    if (index === postCount - 1) return 0;

    const progress = index / Math.max(postCount - 1, 1);
    return Math.max(Math.round(maxUsableLead * (1 - progress)), 1);
  });

  const uniqueDays = [];

  for (const daysBeforeEvent of generatedDays) {
    let candidate = Math.min(daysBeforeEvent, maxUsableLead);

    while (candidate > 0 && uniqueDays.includes(candidate)) {
      candidate -= 1;
    }

    uniqueDays.push(candidate);
  }

  return uniqueDays;
}

function getCampaignPlanTimingAnchor(postPlanItem, index = 0, total = 1) {
  const explicitAnchor = String(
    postPlanItem?.timing_anchor ||
      postPlanItem?.schedule_anchor ||
      postPlanItem?.anchor ||
      ""
  )
    .trim()
    .toLowerCase();

  if (/relationship|soft|community|gratitude|event|day|huvuddatum|relations/.test(explicitAnchor)) {
    return "relationship_event";
  }

  if (/end|last|final|deadline|slut|sista/.test(explicitAnchor)) {
    return "deadline";
  }

  if (/middle|during|mid|under|mitt/.test(explicitAnchor)) {
    return "middle";
  }

  if (/before|pre|start|begin|launch|början|innan/.test(explicitAnchor)) {
    return "start";
  }

  const intent = getCampaignPostIntent(postPlanItem, index, total);

  if (intent === "event") return "relationship_event";
  if (intent === "deadline") return "deadline";
  if (intent === "conversion") return "conversion";
  if (intent === "trust") return "trust";
  if (intent === "engagement") return "engagement";

  return "start";
}

function getClampedFutureDateString(dateString, timeZone = DEFAULT_TIME_ZONE) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);

  if (!dateString) {
    return todayDateString;
  }

  return dateString < todayDateString ? todayDateString : dateString;
}

function getUniqueDateNearTarget({
  targetDate,
  usedDates,
  minDate,
  maxDate,
  preferBackward = false,
}) {
  const safeTarget = targetDate || minDate || maxDate;

  if (!safeTarget) {
    return "";
  }

  const lowerBound = minDate || safeTarget;
  const upperBound = maxDate || safeTarget;

  const clamp = (dateString) => {
    if (lowerBound && dateString < lowerBound) return lowerBound;
    if (upperBound && dateString > upperBound) return upperBound;
    return dateString;
  };

  const first = clamp(safeTarget);

  if (!usedDates.has(first)) {
    return first;
  }

  for (let offset = 1; offset <= 45; offset += 1) {
    const candidates = preferBackward
      ? [addDaysToDateString(first, -offset), addDaysToDateString(first, offset)]
      : [addDaysToDateString(first, offset), addDaysToDateString(first, -offset)];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const clampedCandidate = clamp(candidate);

      if (!usedDates.has(clampedCandidate)) {
        return clampedCandidate;
      }
    }
  }

  return first;
}

function getEventCampaignDaysBeforeEvent({
  campaign,
  postPlan,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const daysUntilEvent = getDaysBetweenDateStrings(
    todayDateString,
    campaign?.event_date
  );

  const maxFutureDaysBeforeEvent = Math.max(
    Math.floor(Number(daysUntilEvent) || 0),
    0
  );

  const defaultDays = getFutureCampaignDaysBeforeEvent(
    postPlan.length,
    maxFutureDaysBeforeEvent
  );

  return postPlan.map((postPlanItem, index) => {
    const rawDays = Number(postPlanItem?.days_before_event);
    const preferredDays = Number.isFinite(rawDays)
      ? Math.max(Math.round(rawDays), 0)
      : defaultDays[index] ?? 0;

    return Math.min(preferredDays, maxFutureDaysBeforeEvent);
  });
}

function clampNumberValue(value, min, max) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return min;
  }

  return Math.min(Math.max(numericValue, min), max);
}

function getCampaignStrategicText(campaign, postPlanItem = null) {
  return [
    campaign?.title,
    campaign?.description,
    campaign?.prompt_context,
    campaign?.campaign_category,
    campaign?.event_type,
    campaign?.campaign_goal,
    campaign?.target_customer_need,
    campaign?.product_selection_guidance,
    campaign?.website_product_selection_hint,
    campaign?.website_content_strategy,
    postPlanItem?.role,
    postPlanItem?.purpose,
    postPlanItem?.marketing_angle,
    postPlanItem?.campaign_phase,
    postPlanItem?.timing_anchor,
    postPlanItem?.schedule_reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCampaignLeadTimeProfile(campaign) {
  const text = getCampaignStrategicText(campaign);
  const hasLongLeadTimeSignals = /custom|personal|personalized|personalised|made[\s-]?to[\s-]?order|bespoke|tailor|tailored|print|printed|portrait|engraved|engraving|production|produce|delivery|deliver|shipping|ship|order in time|pre[\s-]?order|lead time|appointment|booking|bookable|reservation|limited seats|limited availability|limited capacity|consultation|quote|install|installation|service area|gift|gifts|present|presents|kurs|bokning|beställ|leverans|personlig|personliga|anpassad|skräddarsydd|tryck|porträtt|gravyr|produktion|leveranstid|beställningstid|gåva|gåvor|presenter/.test(text);
  const hasFastActionSignals = /instant|digital download|same[\s-]?day|pickup|pick[\s-]?up|walk[\s-]?in|in stock|ready[\s-]?made|available now|retail|restaurant|cafe|menu|drop[\s-]?in|flash sale|limited[\s-]?time|today only/.test(text);

  if (hasLongLeadTimeSignals && !hasFastActionSignals) {
    return {
      isLeadTimeSensitive: true,
      deadlineLeadDays: 10,
      conversionLeadDays: 16,
      trustLeadDays: 23,
      engagementLeadDays: 30,
      inspirationLeadDays: 38,
    };
  }

  if (hasLongLeadTimeSignals) {
    return {
      isLeadTimeSensitive: true,
      deadlineLeadDays: 5,
      conversionLeadDays: 10,
      trustLeadDays: 16,
      engagementLeadDays: 22,
      inspirationLeadDays: 28,
    };
  }

  return {
    isLeadTimeSensitive: false,
    deadlineLeadDays: 1,
    conversionLeadDays: 3,
    trustLeadDays: 6,
    engagementLeadDays: 9,
    inspirationLeadDays: 14,
  };
}

function getCampaignPostIntent(postPlanItem, index, total) {
  const explicitAnchor = String(
    postPlanItem?.timing_anchor || postPlanItem?.schedule_anchor || ""
  ).toLowerCase();
  const text = getCampaignStrategicText(null, postPlanItem);
  const combinedText = `${explicitAnchor} ${text}`;

  if (/relationship|soft|community|gratitude|event|main day|day of|celebrate|thank|hälsning|fira|relations/.test(combinedText)) {
    return "event";
  }

  if (/last[_\s-]?chance|last call|final|deadline|urgent|urgency|sista|slutlig|act now|deadline_before_event/.test(combinedText)) {
    return "deadline";
  }

  if (/offer|sale|discount|deal|buy|order|shop|book|product[_\s-]?push|product push|ready[_\s-]?to[_\s-]?buy|conversion|köp|beställ|boka|köptryck/.test(combinedText)) {
    return "conversion";
  }

  if (/trust|proof|review|testimonial|process|quality|faq|guide|confidence|trygg|förtroende|reassurance/.test(combinedText)) {
    return "trust";
  }

  if (/engagement|question|comment|share|save|poll|react|conversation|kommentera|fråga|reflektera|publiken/.test(combinedText)) {
    return "engagement";
  }

  if (/product[_\s-]?discovery|product[_\s-]?idea|discover|inspiration|awareness|idea|tips|guide|inspir/.test(combinedText)) {
    return "inspiration";
  }

  if (index === 0) return "inspiration";
  if (index === total - 1) return "deadline";

  return "middle";
}

function shouldUseEventGreetingPost(campaign, count) {
  const safeCount = Math.max(Math.round(Number(count) || 1), 1);
  return Boolean(campaign?.event_date) && safeCount >= 4;
}

function getTimingAnchorForIntent(intent) {
  if (intent === "event") return "relationship_event";
  if (intent === "deadline") return "deadline_before_event";
  if (intent === "conversion") return "conversion_before_deadline";
  return intent || "start";
}

function getMarketingAngleForIntent(intent, fallback = "main") {
  if (intent === "event") return "main";
  if (intent === "deadline") return "urgency";
  if (intent === "conversion") return "product_push";
  if (intent === "trust") return "trust";
  if (intent === "engagement") return "engagement";
  if (intent === "inspiration") return "awareness";
  return fallback;
}

function normalizeCampaignPlanForTiming(campaign, postPlan) {
  const items = Array.isArray(postPlan) ? postPlan : [];
  const total = items.length;

  return items.map((item, index) => {
    const intent = getCampaignPostIntent(item, index, total);
    const strategy = getStrategicCampaignStep(total, index, item || {});

    return {
      ...(item || {}),
      intended_intent: intent,
      timing_anchor:
        item?.timing_anchor || getTimingAnchorForIntent(intent),
      marketing_angle:
        normalizeStrategyValue(item?.marketing_angle) ||
        getMarketingAngleForIntent(intent, strategy.marketing_angle),
      campaign_phase:
        normalizeStrategyValue(item?.campaign_phase) ||
        (intent === "event"
          ? "relationship_event"
          : intent === "deadline"
          ? "last_chance"
          : strategy.campaign_phase),
      customer_stage:
        normalizeStrategyValue(item?.customer_stage) || strategy.customer_stage,
      cta_strength:
        normalizeStrategyValue(item?.cta_strength) || strategy.cta_strength,
    };
  });
}

function getFallbackDaysBeforeEventForIntent(campaign, intent, index, total) {
  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);

  if (intent === "event" && shouldUseEventGreetingPost(campaign, total)) {
    return 0;
  }

  if (intent === "deadline") return leadTimeProfile.deadlineLeadDays;
  if (intent === "conversion") return leadTimeProfile.conversionLeadDays;
  if (intent === "trust") return leadTimeProfile.trustLeadDays;
  if (intent === "engagement") return leadTimeProfile.engagementLeadDays;
  if (intent === "inspiration") return leadTimeProfile.inspirationLeadDays;

  const progress = total <= 1 ? 0.5 : index / Math.max(total - 1, 1);
  const maxLeadDays = leadTimeProfile.isLeadTimeSensitive
    ? leadTimeProfile.inspirationLeadDays
    : Math.max(leadTimeProfile.inspirationLeadDays, total * 2);

  return Math.max(
    leadTimeProfile.deadlineLeadDays,
    Math.round(maxLeadDays * (1 - progress))
  );
}

function getPostPlanDaysBeforeEvent(campaign, postPlanItem, index, total) {
  const explicitDays = Number(postPlanItem?.days_before_event);

  if (Number.isFinite(explicitDays) && explicitDays >= 0) {
    return Math.min(Math.round(explicitDays), 365);
  }

  return getFallbackDaysBeforeEventForIntent(
    campaign,
    postPlanItem?.intended_intent || getCampaignPostIntent(postPlanItem, index, total),
    index,
    total
  );
}

function isValidCampaignTimeString(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function getPostPlanPublishTime(postPlanItem, intent, timingAnchor) {
  const candidates = [
    postPlanItem?.publish_time,
    postPlanItem?.recommended_publish_time,
    postPlanItem?.preferred_publish_time,
  ];

  const validTime = candidates.find(isValidCampaignTimeString);

  if (validTime) {
    return validTime;
  }

  return getRecommendedCampaignPublishTime(intent, timingAnchor);
}

function getCampaignTargetDateForIntent({
  intent,
  safePeriodStartDate,
  safePeriodEndDate,
  purchaseDeadlineDate,
  leadTimeProfile,
  periodLengthDays,
  index,
  total,
  postPlanItem,
}) {
  const explicitDate =
    postPlanItem?.scheduled_date ||
    postPlanItem?.publish_date ||
    postPlanItem?.recommended_date;

  if (explicitDate && getDatePartsFromDateString(explicitDate)) {
    return explicitDate;
  }

  const explicitDays = Number(postPlanItem?.days_before_event);

  if (Number.isFinite(explicitDays) && explicitDays >= 0) {
    return addDaysToDateString(
      safePeriodEndDate,
      -Math.min(Math.round(explicitDays), Math.max(periodLengthDays, 0))
    );
  }

  const daysBeforeEnd = (days) =>
    addDaysToDateString(
      safePeriodEndDate,
      -Math.min(days, Math.max(periodLengthDays, 0))
    );
  const daysAfterStart = (ratio) =>
    addDaysToDateString(
      safePeriodStartDate,
      Math.max(0, Math.round(periodLengthDays * ratio))
    );

  if (intent === "event") return safePeriodEndDate;
  if (intent === "deadline") return purchaseDeadlineDate;
  if (intent === "conversion") return daysBeforeEnd(leadTimeProfile.conversionLeadDays);
  if (intent === "trust") return leadTimeProfile.isLeadTimeSensitive ? daysBeforeEnd(leadTimeProfile.trustLeadDays) : daysAfterStart(0.45);
  if (intent === "engagement") return leadTimeProfile.isLeadTimeSensitive ? daysBeforeEnd(leadTimeProfile.engagementLeadDays) : daysAfterStart(0.28);
  if (intent === "inspiration") return leadTimeProfile.isLeadTimeSensitive ? daysBeforeEnd(leadTimeProfile.inspirationLeadDays) : safePeriodStartDate;

  return daysAfterStart(total <= 1 ? 0 : index / Math.max(total - 1, 1));
}

function buildFixedEventCampaignSchedule({
  campaign,
  postPlan,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const normalizedPostPlan = normalizeCampaignPlanForTiming(campaign, postPlan);
  const total = normalizedPostPlan.length;
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const eventDate = campaign?.event_date || todayDateString;
  const safeMinDate = getLaterDateString(
    todayDateString,
    addDaysToDateString(eventDate, -365)
  );
  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);
  const purchaseDeadlineDate = leadTimeProfile.isLeadTimeSensitive
    ? getLaterDateString(
        safeMinDate,
        addDaysToDateString(eventDate, -leadTimeProfile.deadlineLeadDays)
      )
    : eventDate;
  const usedDates = new Set();

  const scheduledItems = normalizedPostPlan.map((postPlanItem, index) => {
    const intent = postPlanItem.intended_intent || getCampaignPostIntent(postPlanItem, index, total);
    const timingAnchor = postPlanItem.timing_anchor || getTimingAnchorForIntent(intent);
    const daysBeforeEvent = getPostPlanDaysBeforeEvent(campaign, postPlanItem, index, total);
    const targetDate = addDaysToDateString(eventDate, -daysBeforeEvent);
    const isFinalRelationshipPost = intent === "event" || timingAnchor === "relationship_event";
    const maxDate =
      !isFinalRelationshipPost && leadTimeProfile.isLeadTimeSensitive
        ? purchaseDeadlineDate
        : eventDate;
    const scheduledDate = getUniqueDateNearTarget({
      targetDate,
      usedDates,
      minDate: safeMinDate,
      maxDate: getLaterDateString(maxDate, safeMinDate),
      preferBackward: intent === "deadline" || isFinalRelationshipPost,
    });
    const actualDaysBeforeEvent = Math.max(
      getDaysBetweenDateStrings(scheduledDate, eventDate) || 0,
      0
    );

    usedDates.add(scheduledDate);

    return {
      startDate: scheduledDate,
      weekday: getWeekdayFromDateString(scheduledDate, timeZone),
      publishTime: getPostPlanPublishTime(postPlanItem, intent, timingAnchor),
      daysBeforeEvent: actualDaysBeforeEvent,
      timingAnchor,
      originalIndex: index,
      postPlanItem: {
        ...postPlanItem,
        days_before_event: actualDaysBeforeEvent,
        timing_anchor: timingAnchor,
      },
      intent,
    };
  });

  return scheduledItems.sort((a, b) => {
    if (a.startDate === b.startDate) return a.originalIndex - b.originalIndex;
    return a.startDate < b.startDate ? -1 : 1;
  });
}

function buildDateRangeCampaignSchedule({
  campaign,
  postPlan,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const periodStartDate = campaign?.start_date || campaign?.event_date || todayDateString;
  const periodEndDate = campaign?.end_date || campaign?.event_date || periodStartDate;
  const safePeriodStartDate = getClampedFutureDateString(periodStartDate, timeZone);
  const safePeriodEndDate = getLaterDateString(periodEndDate, safePeriodStartDate);
  const periodLengthDays = Math.max(
    getDaysBetweenDateStrings(safePeriodStartDate, safePeriodEndDate) || 0,
    0
  );

  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);
  const deadlineOffset = Math.min(
    leadTimeProfile.deadlineLeadDays,
    Math.max(periodLengthDays - 1, 0)
  );
  const purchaseDeadlineDate = getLaterDateString(
    safePeriodStartDate,
    addDaysToDateString(safePeriodEndDate, -deadlineOffset)
  );
  const normalizedPostPlan = normalizeCampaignPlanForTiming(campaign, postPlan);
  const usedDates = new Set();
  const total = normalizedPostPlan.length;

  const scheduledItems = normalizedPostPlan.map((postPlanItem, index) => {
    const intent = postPlanItem.intended_intent || getCampaignPostIntent(postPlanItem, index, total);
    const timingAnchor = postPlanItem.timing_anchor || getTimingAnchorForIntent(intent);
    const isFinalRelationshipPost = intent === "event" || timingAnchor === "relationship_event" || timingAnchor === "end";
    const maxDate = isFinalRelationshipPost ? safePeriodEndDate : purchaseDeadlineDate;
    const minDate = safePeriodStartDate;
    const targetDate = getCampaignTargetDateForIntent({
      intent,
      safePeriodStartDate,
      safePeriodEndDate,
      purchaseDeadlineDate,
      leadTimeProfile,
      periodLengthDays,
      index,
      total,
      postPlanItem,
    });

    const scheduledDate = getUniqueDateNearTarget({
      targetDate,
      usedDates,
      minDate,
      maxDate: getLaterDateString(maxDate, minDate),
      preferBackward: intent === "deadline" || isFinalRelationshipPost,
    });

    usedDates.add(scheduledDate);

    const daysBeforeCampaignEnd = Math.max(
      getDaysBetweenDateStrings(scheduledDate, safePeriodEndDate) || 0,
      0
    );

    return {
      startDate: scheduledDate,
      weekday: getWeekdayFromDateString(scheduledDate, timeZone),
      publishTime: getPostPlanPublishTime(postPlanItem, intent, timingAnchor),
      daysBeforeEvent: daysBeforeCampaignEnd,
      timingAnchor,
      originalIndex: index,
      postPlanItem: {
        ...postPlanItem,
        days_before_event: daysBeforeCampaignEnd,
        timing_anchor: timingAnchor,
      },
      intent,
    };
  });

  return scheduledItems.sort((a, b) => {
    if (a.startDate === b.startDate) return a.originalIndex - b.originalIndex;
    return a.startDate < b.startDate ? -1 : 1;
  });
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

function getCampaignMainDateString(campaign) {
  return campaign?.event_date || campaign?.end_date || campaign?.start_date || "";
}

function getVerifiedDaysBeforeCampaignMainDate(campaign, scheduledDate) {
  const mainDate = getCampaignMainDateString(campaign);

  if (!scheduledDate || !mainDate) return null;

  const days = getDaysBetweenDateStrings(scheduledDate, mainDate);

  if (typeof days !== "number" || Number.isNaN(days)) return null;

  return Math.max(days, 0);
}

function getCampaignScheduleFacts(campaign, postPlanItem = {}) {
  const scheduledDate =
    postPlanItem?.scheduled_date ||
    postPlanItem?.publish_date ||
    postPlanItem?.recommended_date ||
    "";
  const mainDate = getCampaignMainDateString(campaign);
  const verifiedDaysBefore = getVerifiedDaysBeforeCampaignMainDate(
    campaign,
    scheduledDate
  );

  return {
    scheduledDate,
    mainDate,
    verifiedDaysBefore,
  };
}

function getCampaignScheduleFactText(campaign, postPlanItem = {}) {
  const { scheduledDate, mainDate, verifiedDaysBefore } =
    getCampaignScheduleFacts(campaign, postPlanItem);

  if (!scheduledDate || !mainDate) return "";

  return [
    `Scheduled post date: ${scheduledDate}.`,
    `Main campaign date: ${mainDate}.`,
    typeof verifiedDaysBefore === "number"
      ? `Exact calendar distance to main campaign date: ${verifiedDaysBefore} days.`
      : "",
    "If the post or image mentions a countdown, days left or days remaining, it must use the exact calendar distance above. Do not use campaign sequence distance or distance to another post.",
    "If there is any uncertainty about the exact countdown, do not include a day-countdown number in the post or image.",
  ]
    .filter(Boolean)
    .join("\n");
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
    /shop|store|ecommerce|e-commerce|product|products|gift|gifts|present|sale|discount|offer|commercial|shopping|seasonal|collection|launch|buy|order/.test(
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
    return `Use a relevant product from the brand website. Connect the product naturally to the campaign. Use only product details that clearly exist on the website. Do not invent product details, prices, stock, delivery promises or discounts. If no verified matching product can be found, the automation should stop with an error instead of silently creating a generic AI fallback.${productSelectionInstruction}`;
  }

  if (sourceMode === "website_service") {
    return `Use a relevant service or offer from the brand website. Connect the service naturally to the campaign. Use only details that clearly exist on the website. If no verified matching website item can be found, the automation should stop with an error instead of silently creating a generic AI fallback.${productSelectionInstruction}`;
  }

  if (sourceMode === "mixed_campaign_and_website") {
    return `If relevant website content is available, use it as supporting context, but keep the main focus on the campaign theme. Do not force a product or service if the match is not natural.${productSelectionInstruction}`;
  }

  return "Do not force a product or service into this post. Keep the focus on the campaign theme and the audience value.";
}

function getCampaignTimingInstruction(campaign, postPlanItemOrDaysBeforeEvent) {
  const campaignTitle = campaign?.title || "the campaign";
  const hasDateRange = Boolean(campaign?.start_date && campaign?.end_date);
  const daysBeforeEvent =
    typeof postPlanItemOrDaysBeforeEvent === "number"
      ? postPlanItemOrDaysBeforeEvent
      : typeof postPlanItemOrDaysBeforeEvent?.days_before_event === "number"
      ? postPlanItemOrDaysBeforeEvent.days_before_event
      : null;
  const timingAnchor =
    typeof postPlanItemOrDaysBeforeEvent === "object"
      ? postPlanItemOrDaysBeforeEvent?.timing_anchor
      : null;

  if (campaign?.event_date && typeof daysBeforeEvent === "number") {
    if (timingAnchor === "relationship_event" || daysBeforeEvent === 0) {
      return `This post is for the main campaign date itself. If buying, booking or delivery may now be too late, make it a warm greeting, thank-you, celebration or relationship-building post rather than a hard sales push.`;
    }

    if (timingAnchor === "deadline_before_event") {
      return `This post is the final realistic action reminder before ${campaignTitle}. Make the deadline clear without pretending customers can wait until the main date if ordering, booking or delivery needs lead time.`;
    }

    if (timingAnchor === "conversion_before_deadline") {
      return `This post is placed while customers still have time to act before ${campaignTitle}. Make the product, service or next step concrete.`;
    }

    if (daysBeforeEvent === 1) {
      return `This post is for the day before ${campaignTitle}. Mention that it is tomorrow only if same-day action is realistic; otherwise keep it softer.`;
    }

    return `This post is ${daysBeforeEvent} days before ${campaignTitle}. Mention the timing naturally and keep the message aligned with whether customers still have time to act.`;
  }

  if (hasDateRange) {
    if (timingAnchor === "deadline_before_event") {
      return `This post is placed before the final campaign date because the audience may need time to order, book, decide, receive delivery or prepare. Make it a clear final reminder without pretending it is still possible later if timing would be unrealistic.`;
    }

    if (timingAnchor === "conversion_before_deadline") {
      return `This post is placed in the active decision window before the final campaign date. Make the product, service or next step feel concrete while the audience still has time to act.`;
    }

    if (timingAnchor === "relationship_event") {
      return `This post is placed on or near the final campaign date. Because buying or booking may be too late, make it a softer relationship-building post rather than a hard sales push.`;
    }

    if (timingAnchor === "trust") {
      return `This post is placed before the buying decision window. Build trust, reduce doubt and make the audience feel safe taking the next step later.`;
    }

    if (timingAnchor === "engagement") {
      return `This post is placed early or mid campaign. Encourage recognition, comments, saves or reflection so the audience becomes warmer before sales-focused posts.`;
    }

    if (timingAnchor === "end") {
      return `This post is placed near the end of the campaign period. Use it only as a final reminder when the audience still has a realistic chance to act.`;
    }

    if (timingAnchor === "middle") {
      return `This post is placed during the campaign period. Build interest, trust or product/service consideration connected to the campaign.`;
    }

    if (typeof daysBeforeEvent === "number" && daysBeforeEvent > 0) {
      return `This post is ${daysBeforeEvent} days before the final campaign date. Use the timing naturally and keep the message aligned with whether the audience still has time to act.`;
    }

    return `This post is placed at the start of the campaign period. Introduce the campaign clearly and make the timing feel relevant.`;
  }

  return `This campaign has a flexible date. Do not mention days left. Instead, give this post a clear campaign role and make it different from the other posts.`;
}

function buildCampaignPostPlanItem({
  campaign,
  postPlanItem,
  index,
  total,
  daysBeforeEvent = null,
  timingAnchor = null,
}) {
  const campaignTitle = campaign?.title || "Campaign";
  const hasFixedDate = Boolean(campaign?.event_date);
  const hasDateRange = Boolean(campaign?.start_date && campaign?.end_date);
  const resolvedTimingAnchor =
    timingAnchor || getCampaignPlanTimingAnchor(postPlanItem, index, total);
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
  } else if (hasDateRange) {
    if (resolvedTimingAnchor === "relationship_event") {
      timingNote = `This post is scheduled for the main/final campaign date for ${campaignTitle}. Make it softer, emotional and relationship-building rather than a hard sales push.`;
    } else if (resolvedTimingAnchor === "deadline_before_event") {
      timingNote = `This post is scheduled before the final campaign date because the audience may need time to order, book, decide, receive delivery or prepare. Make it a clear final reminder.`;
    } else if (resolvedTimingAnchor === "conversion_before_deadline") {
      timingNote = `This post is scheduled while the audience still has time to act. Make the product, service or next step concrete.`;
    } else if (resolvedTimingAnchor === "trust") {
      timingNote = `This post is scheduled before the active buying window. Build reassurance, proof and confidence.`;
    } else if (resolvedTimingAnchor === "engagement") {
      timingNote = `This post is scheduled early or mid campaign. Warm up the audience through recognition, comments or reflection.`;
    } else {
      timingNote = `This post is scheduled early in the campaign period for ${campaignTitle}. Introduce the need, idea or opportunity clearly.`;
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
    days_before_event: hasFixedDate || hasDateRange ? daysBeforeEvent : null,
    timing_anchor: resolvedTimingAnchor,
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
    postPlanItem
  );
  const scheduleFactText = getCampaignScheduleFactText(
    campaign,
    postPlanItem
  );
  const scheduleFacts = getCampaignScheduleFacts(campaign, postPlanItem);
  const verifiedDaysBeforeEvent =
    typeof scheduleFacts.verifiedDaysBefore === "number"
      ? scheduleFacts.verifiedDaysBefore
      : daysBeforeEvent;

  const visibleOpening = campaign?.event_date
    ? verifiedDaysBeforeEvent === 0
      ? `This is the campaign-day post for ${campaignTitle}. Clearly highlight that today is ${campaignTitle}. Do not say it is before ${campaignTitle}.`
      : postPlanItem?.timing_anchor === "relationship_event"
      ? `This is the main-date relationship post for ${campaignTitle}. Make it a warm greeting, thank-you or brand-building post rather than hard selling.`
      : postPlanItem?.timing_anchor === "deadline_before_event"
      ? `This is the final realistic action reminder before ${campaignTitle}. Do not place the buying pressure on the main date if customers need lead time.`
      : postPlanItem?.timing_anchor === "conversion_before_deadline"
      ? `This post is placed while customers still have time to act before ${campaignTitle}. Make the product or next step concrete without inventing offers.`
      : verifiedDaysBeforeEvent === 1
      ? `This is the day before ${campaignTitle}. Mention that ${campaignTitle} is tomorrow only if that is useful and realistic.`
      : typeof verifiedDaysBeforeEvent === "number"
      ? `This post is ${verifiedDaysBeforeEvent} days before ${campaignTitle}. Use that exact timing as the main angle.`
      : `This is a campaign post before ${campaignTitle}. Do not mention an exact day-countdown unless the exact dates are provided.`
    : campaign?.start_date && campaign?.end_date
    ? postPlanItem?.timing_anchor === "relationship_event"
      ? `This is the soft main/final date post for ${campaignTitle}. Focus on emotion, relationship and brand warmth rather than hard selling.`
      : postPlanItem?.timing_anchor === "deadline_before_event"
      ? `This is the final realistic action reminder before the main/final campaign date for ${campaignTitle}.`
      : postPlanItem?.timing_anchor === "conversion_before_deadline"
      ? `This is a product/service decision post while the audience still has time to act.`
      : postPlanItem?.timing_anchor === "trust"
      ? `This is a trust-building post before the buying decision window.`
      : postPlanItem?.timing_anchor === "engagement"
      ? `This is an engagement post early or mid campaign to warm up the audience.`
      : `This is an early campaign post for ${campaignTitle}. Introduce the idea clearly.`
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
    scheduleFactText,
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
  } else if (campaign?.start_date && campaign?.end_date) {
    if (postPlanItem?.timing_anchor === "relationship_event") {
      timingText = " Scheduled as a soft main/final date post.";
    } else if (postPlanItem?.timing_anchor === "deadline_before_event") {
      timingText = " Scheduled before the final date while action is still realistic.";
    } else if (postPlanItem?.timing_anchor === "conversion_before_deadline") {
      timingText = " Scheduled in the active decision window.";
    } else if (postPlanItem?.timing_anchor === "trust") {
      timingText = " Scheduled before the buying decision window.";
    } else if (postPlanItem?.timing_anchor === "engagement") {
      timingText = " Scheduled early or mid campaign to warm up the audience.";
    } else {
      timingText = " Scheduled early in the campaign period.";
    }
  }

  return `${angleLabel}: ${purpose} ${stageLabel}. CTA: ${ctaStrength}.${timingText}`;
}

function buildCampaignImagePrompt(campaign, postPlanItem, index) {
  const campaignTitle = campaign?.title || "campaign";
  const postRole = postPlanItem?.role || `Campaign post ${index + 1}`;
  const postPurpose =
    postPlanItem?.purpose || getCampaignStrategyPurpose(postPlanItem?.marketing_angle);

  const marketingAngle = postPlanItem?.marketing_angle || "main";
  const customerStage = postPlanItem?.customer_stage || "warm";
  const ctaStrength = postPlanItem?.cta_strength || "medium";
  const scheduleFactText = getCampaignScheduleFactText(
    campaign,
    postPlanItem
  );

  return [
    `Create a high-quality social media image for the campaign "${campaignTitle}".`,
    `This image belongs to post ${postPlanItem?.campaign_post_index || index + 1} of ${
      postPlanItem?.campaign_post_count || "the campaign sequence"
    }.`,
    `Post role: ${postRole}.`,
    `Post purpose: ${postPurpose}.`,
    `Marketing angle: ${marketingAngle}.`,
    `Customer stage: ${customerStage}.`,
    `CTA strength: ${ctaStrength}.`,
    scheduleFactText,
    "Countdown accuracy rule: If the image includes readable countdown text such as '7 days left', 'dagar kvar' or similar, it must match the exact calendar distance from the scheduled post date to the main campaign date. Never base countdown text on the distance to another post in the sequence.",
    "Safer visual rule: Prefer campaign visuals without exact day-countdown numbers unless the schedule facts above make the number completely certain.",
    campaign?.image_guidance ? `Campaign image guidance: ${campaign.image_guidance}.` : "",
    campaign?.tone_guidance ? `Tone guidance: ${campaign.tone_guidance}.` : "",
    campaign?.product_selection_guidance
      ? `Product selection guidance: ${campaign.product_selection_guidance}.`
      : "",
    "Make the image feel professional, clean and suitable for a small business social media post.",
    "Do not include fake logos, fake discounts, fake reviews or fake guarantees.",
    "If text is used in the image, keep it short, clear and correctly spelled.",
  ]
    .filter(Boolean)
    .join("\n");
}

function createCampaignSlotsFromOpportunity({
  campaign,
  timeZone = DEFAULT_TIME_ZONE,
  defaultPublishTime = "09:00",
}) {
  const recommendedCount = getCampaignRecommendedPostCount(campaign);
  const postPlan = buildCampaignPostPlan(campaign, recommendedCount);
  const hasFixedCampaignDate = Boolean(campaign?.event_date);
  const hasCampaignDateRange = Boolean(campaign?.start_date && campaign?.end_date);

  if (hasFixedCampaignDate) {
    const fixedSchedule = buildFixedEventCampaignSchedule({
      campaign,
      postPlan,
      timeZone,
    });

    const dateUseCounts = {};

    return fixedSchedule.map((schedule, index) => {
      const postPlanItem = schedule.postPlanItem || postPlan[index] || {};
      const startDate = schedule.startDate || campaign.event_date;
      const daysBeforeEvent =
        typeof schedule.daysBeforeEvent === "number" ? schedule.daysBeforeEvent : 0;

      const sameDayIndex = dateUseCounts[startDate] || 0;
      dateUseCounts[startDate] = sameDayIndex + 1;

      const enhancedPostPlanItem = buildCampaignPostPlanItem({
        campaign,
        postPlanItem,
        index,
        total: fixedSchedule.length,
        daysBeforeEvent,
        timingAnchor: schedule.timingAnchor,
      });

      enhancedPostPlanItem.scheduled_date = startDate;
      enhancedPostPlanItem.campaign_main_date = campaign.event_date || null;
      const verifiedFixedDaysBefore = getVerifiedDaysBeforeCampaignMainDate(
        campaign,
        startDate
      );
      if (typeof verifiedFixedDaysBefore === "number") {
        enhancedPostPlanItem.days_before_event = verifiedFixedDaysBefore;
      }

      const contentSourceMode = getCampaignContentSourceMode(
        campaign,
        enhancedPostPlanItem,
        index,
        fixedSchedule.length
      );

      enhancedPostPlanItem.content_source_mode = contentSourceMode;

      return createSlot({
        startDate,
        weekday: schedule.weekday || getWeekdayFromDateString(startDate, timeZone),
        publishTime: getCampaignPublishTime(schedule.publishTime || getRecommendedCampaignPublishTime(schedule.intent, schedule.timingAnchor), sameDayIndex),
        prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
        imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
        generateImage: true,
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
        campaignPostCount: enhancedPostPlanItem.campaign_post_count || fixedSchedule.length,
        campaignGoal: enhancedPostPlanItem.campaign_goal || "",
        targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
        strategyNotes: enhancedPostPlanItem.strategy_notes || "",
        dateLocked: true,
        timeZone,
      });
    });
  }

  if (hasCampaignDateRange) {
    const rangeSchedule = buildDateRangeCampaignSchedule({
      campaign,
      postPlan,
      timeZone,
    });

    return rangeSchedule.map((schedule, index) => {
      const postPlanItem = schedule.postPlanItem || postPlan[index] || {};
      const startDate = schedule.startDate || getSafeCampaignStartDate(campaign, timeZone);
      const enhancedPostPlanItem = buildCampaignPostPlanItem({
        campaign,
        postPlanItem,
        index,
        total: postPlan.length,
        daysBeforeEvent: schedule.daysBeforeEvent,
        timingAnchor: schedule.timingAnchor,
      });

      enhancedPostPlanItem.scheduled_date = startDate;
      enhancedPostPlanItem.campaign_main_date = campaign.end_date || campaign.start_date || null;
      const verifiedRangeDaysBefore = getVerifiedDaysBeforeCampaignMainDate(
        campaign,
        startDate
      );
      if (typeof verifiedRangeDaysBefore === "number") {
        enhancedPostPlanItem.days_before_event = verifiedRangeDaysBefore;
      }

      const contentSourceMode = getCampaignContentSourceMode(
        campaign,
        enhancedPostPlanItem,
        index,
        postPlan.length
      );

      enhancedPostPlanItem.content_source_mode = contentSourceMode;

      return createSlot({
        startDate,
        weekday: schedule.weekday || getWeekdayFromDateString(startDate, timeZone),
        publishTime: schedule.publishTime || getRecommendedTimeForDate(startDate, timeZone),
        prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
        imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
        generateImage: true,
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

  const fallbackStartDate = getSafeCampaignStartDate(campaign, timeZone);

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
      timingAnchor: null,
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
      generateImage: true,
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

const platformIconSources = {
  facebook: "/social-icons/facebook.png",
  instagram: "/social-icons/instagram.png",
  linkedin: "/social-icons/linkedin.png",
  pinterest: "/social-icons/pinterest.png",
  tiktok: "/social-icons/tiktok.png",
  x: "/social-icons/x.png",
  youtube: "/social-icons/youtube.png",
};

function normalizePlatformKey(platformValue) {
  const value = String(platformValue || "").trim().toLowerCase();

  if (!value) return "";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("linkedin") || value.includes("linked in")) return "linkedin";
  if (value.includes("pinterest")) return "pinterest";
  if (value.includes("tiktok") || value.includes("tik tok")) return "tiktok";
  if (value === "x" || value.includes("twitter")) return "x";
  if (value.includes("youtube")) return "youtube";

  return value.replace(/[^a-z0-9_-]+/g, "_");
}

function formatConnectedPlatformLabel(platformValue) {
  const value = normalizePlatformKey(platformValue);

  if (value === "facebook") return "Facebook";
  if (value === "instagram") return "Instagram";
  if (value === "linkedin") return "LinkedIn";
  if (value === "pinterest") return "Pinterest";
  if (value === "tiktok") return "TikTok";
  if (value === "x") return "X";
  if (value === "youtube") return "YouTube";

  return String(platformValue || "").trim() || value;
}

function getPlatformIconSource(platformValue) {
  return platformIconSources[normalizePlatformKey(platformValue)] || "";
}

function getConnectedPlatformOptions(connectedPlatforms) {
  const seen = new Set();
  const options = [];

  for (const item of connectedPlatforms || []) {
    const key = normalizePlatformKey(item?.value || item?.label);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);

    options.push({
      value: key,
      label: formatConnectedPlatformLabel(item?.label || item?.value || key),
      platforms: [key],
      icon: getPlatformIconSource(key),
    });
  }

  return options;
}

function getSelectedPlatformKeys(platformValue, platformOptions = []) {
  const normalizedInput = String(platformValue || "").toLowerCase();

  const keys = platformOptions
    .map((item) => item.value)
    .filter((key) => normalizedInput.includes(key));

  if (keys.length > 0) {
    return Array.from(new Set(keys));
  }

  const directKey = normalizePlatformKey(platformValue);

  if (directKey && platformOptions.some((item) => item.value === directKey)) {
    return [directKey];
  }

  return [];
}

function formatPlatformSelectionFromKeys(keys = [], platformOptions = []) {
  return keys
    .map((key) => platformOptions.find((item) => item.value === key)?.label || formatConnectedPlatformLabel(key))
    .filter(Boolean)
    .join(" + ");
}

export default function AutomationPage() {
  const { t, locale } = useUiText(["automation"]);

  function translateContentTypeLabel(type) {
    return t(`automation.contentType.${type.id}.label`);
  }

  function translateContentTypeShortLabel(type) {
    return t(`automation.contentType.${type.id}.shortLabel`);
  }

  function translateContentTypeDescription(type) {
    return t(`automation.contentType.${type.id}.description`);
  }

  const plannerLocaleIsSwedish = String(locale || "").toLowerCase().startsWith("sv");

  const plannerGoalCopy = {
    sell_more: {
      label: plannerLocaleIsSwedish ? "Sälj mer" : "Sell more",
      description: plannerLocaleIsSwedish
        ? "Fokus på produkter, köpinspiration och tydligare uppmaningar som driver försäljning."
        : "Product posts, buying inspiration and clearer calls to action that drive sales.",
    },
    get_followers: {
      label: plannerLocaleIsSwedish ? "Nå fler kunder" : "Reach more customers",
      description: plannerLocaleIsSwedish
        ? "Delbart och lätt innehåll som skapar igenkänning, synlighet och engagemang."
        : "Shareable, easy content that builds recognition, visibility and engagement.",
    },
    build_trust: {
      label: plannerLocaleIsSwedish ? "Bygg förtroende" : "Build trust",
      description: plannerLocaleIsSwedish
        ? "Visar expertis, svarar på frågor och ger kunderna fler skäl att välja dig."
        : "Shows expertise, answers questions and gives customers more reasons to choose you.",
    },
    educate_customers: {
      label: plannerLocaleIsSwedish ? "Ge tips & råd" : "Give tips & advice",
      description: plannerLocaleIsSwedish
        ? "Lärande inlägg som hjälper kunderna och gör företaget relevant."
        : "Helpful educational posts that guide customers and make the business relevant.",
    },
    stay_visible: {
      label: plannerLocaleIsSwedish ? "Håll kontot aktivt" : "Keep the account active",
      description: plannerLocaleIsSwedish
        ? "En trygg blandning som håller företaget synligt när kunden inte vill välja själv."
        : "A safe content mix that keeps the business visible when the customer does not want to choose manually.",
    },
  };

  const plannerUiCopy = {
    planSummary: plannerLocaleIsSwedish ? "Din plan" : "Your plan",
    readyToCreate: plannerLocaleIsSwedish ? "Redo att skapa" : "Ready to create",
    spreeloChoosesLanguage: plannerLocaleIsSwedish ? "Spreelo väljer automatiskt" : "Spreelo chooses automatically",
    platformHelp: plannerLocaleIsSwedish ? "Här kommer dina inlägg publiceras." : "This is where your posts will be published.",
    languageForPosts: plannerLocaleIsSwedish ? "Språk för inläggen" : "Post language",
    repeatFull: plannerLocaleIsSwedish ? "Upprepning" : "Repeat",
    languageHelpSmart: plannerLocaleIsSwedish ? "Spreelo kan välja språk utifrån din varumärkesanalys." : "Spreelo can choose the language from your brand analysis.",
    repeatHelpSmart: plannerLocaleIsSwedish ? "Bestämmer hur ofta planen skapas och upprepas." : "Controls how often the plan is created and repeated.",
    timezoneHelpSmart: plannerLocaleIsSwedish ? "Används för att planera inlägg i rätt lokal tid." : "Used to schedule posts in the correct local time.",
    planIncludesText: plannerLocaleIsSwedish
      ? "Inläggstyper väljs automatiskt för att matcha ditt mål."
      : "Post types are chosen automatically to match your goal.",
  };

  const previewCardCopy = {
    product_focus: {
      label: plannerLocaleIsSwedish ? "Produktfokus" : "Product focus",
      description: plannerLocaleIsSwedish ? "Framhäver relevanta produkter eller tjänster." : "Highlights relevant products or services.",
    },
    offers: {
      label: plannerLocaleIsSwedish ? "Kampanjer & erbjudanden" : "Campaigns & offers",
      description: plannerLocaleIsSwedish ? "Använder köptillfällen endast när det passar." : "Uses buying moments only when they fit.",
    },
    tips_advice: {
      label: plannerLocaleIsSwedish ? "Tips & råd" : "Tips & advice",
      description: plannerLocaleIsSwedish ? "Hjälpsamma inlägg som bygger värde och förtroende." : "Helpful posts that build value and trust.",
    },
    customer_inspiration: {
      label: plannerLocaleIsSwedish ? "Kundinspiration" : "Customer inspiration",
      description: plannerLocaleIsSwedish ? "Visar exempel, användningsfall och skäl att välja företaget." : "Shows examples, use cases and reasons to choose the business.",
    },
    faq: {
      label: plannerLocaleIsSwedish ? "FAQ / Frågor" : "FAQ / Questions",
      description: plannerLocaleIsSwedish ? "Besvarar vanliga frågor innan kunder behöver fråga." : "Answers common questions before customers need to ask.",
    },
    reminders: {
      label: plannerLocaleIsSwedish ? "Påminnelser" : "Reminders",
      description: plannerLocaleIsSwedish ? "Håller företaget synligt vid viktiga tillfällen." : "Keeps the business visible around important moments.",
    },
    common_mistakes: {
      label: plannerLocaleIsSwedish ? "Vanliga misstag" : "Common mistakes",
      description: plannerLocaleIsSwedish ? "Visar expertis genom att hjälpa kunder undvika problem." : "Shows expertise by helping customers avoid problems.",
    },
    mini_guide: {
      label: plannerLocaleIsSwedish ? "Mini-guide" : "Mini-guide",
      description: plannerLocaleIsSwedish ? "Lär ut något användbart i ett kort format." : "Teaches something useful in a short format.",
    },
    checklist: {
      label: plannerLocaleIsSwedish ? "Checklista" : "Checklist",
      description: plannerLocaleIsSwedish ? "Skapar tydliga steg och saker att komma ihåg." : "Creates clear steps and things to remember.",
    },
    seasonal: {
      label: plannerLocaleIsSwedish ? "Säsongsinnehåll" : "Seasonal content",
      description: plannerLocaleIsSwedish ? "Kopplar företaget till aktuell tid och kundbehov." : "Connects the business to current timing and needs.",
    },
    local_relevance: {
      label: plannerLocaleIsSwedish ? "Lokal relevans" : "Local relevance",
      description: plannerLocaleIsSwedish ? "Gör innehållet närmare och mer relevant lokalt." : "Makes the content feel more locally relevant.",
    },
    problem_solution: {
      label: plannerLocaleIsSwedish ? "Problem → lösning" : "Problem → solution",
      description: plannerLocaleIsSwedish ? "Utgår från ett kundbehov och visar hur företaget hjälper." : "Starts from a customer need and shows how the business helps.",
    },
    custom_prompt: {
      label: plannerLocaleIsSwedish ? "Egen idé" : "Custom idea",
      description: plannerLocaleIsSwedish ? "Använder din egen instruktion som grund." : "Uses your own instruction as the base.",
    },
    content_mix: {
      label: plannerLocaleIsSwedish ? "Innehållsmix" : "Content mix",
      description: plannerLocaleIsSwedish ? "Ger variation så planen inte känns upprepande." : "Adds variety so the plan does not feel repetitive.",
    },
  };

  function translateAutoPlanGoalLabel(goalId) {
    if (!goalId) return t("automation.chooseGoal");
    return plannerGoalCopy[goalId]?.label || t(`automation.planGoal.${goalId}.label`);
  }

  function translateAutoPlanGoalDescription(goalId) {
    return plannerGoalCopy[goalId]?.description || "";
  }

  function safePlannerText(key) {
    return plannerUiCopy[key] || t(`automation.${key}`);
  }

  function getLanguageDisplayLabel(value) {
    return value === "Auto" ? safePlannerText("spreeloChoosesLanguage") : value;
  }

  function getPlatformIconLabel(value) {
    const name = String(value || "").toLowerCase();
    if (name.includes("instagram")) return "📸";
    if (name.includes("linkedin")) return "in";
    if (name.includes("tiktok")) return "♪";
    if (name.includes("facebook")) return "f";
    return "●";
  }

  function translatePlanMode(value) {
    return t(`automation.planMode.${value || "manual"}`);
  }

  function translateScheduleType(value) {
    return value === "weekly" ? t("automation.weekly") : t("automation.once");
  }
  function translatePreviewCardLabel(cardId) {
    return previewCardCopy[cardId]?.label || t(`automation.previewCard.${cardId}.label`);
  }

  function translatePreviewCardDescription(cardId) {
    return previewCardCopy[cardId]?.description || t(`automation.previewCard.${cardId}.description`);
  }

  function getCustomerSlotLabel(slot) {
    const cardId = getContentPreviewCardId(slot?.contentTypeId);
    if (slot?.isCampaignSlot && slot.marketingAngle) return getCampaignAngleLabel(slot.marketingAngle);
    return translatePreviewCardLabel(cardId);
  }

  function getCustomerSlotPurpose(slot) {
    const cardId = getContentPreviewCardId(slot?.contentTypeId);
    if (slot?.isCampaignSlot && slot.campaignSummary) return slot.campaignSummary;
    return translatePreviewCardDescription(cardId);
  }


  const weekdayLabels = [
    t("automation.weekday.short.monday"),
    t("automation.weekday.short.tuesday"),
    t("automation.weekday.short.wednesday"),
    t("automation.weekday.short.thursday"),
    t("automation.weekday.short.friday"),
    t("automation.weekday.short.saturday"),
    t("automation.weekday.short.sunday"),
  ];

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
const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);
const [connectedPlatforms, setConnectedPlatforms] = useState([]);
const [loadingConnectedPlatforms, setLoadingConnectedPlatforms] = useState(false);
const connectedPlatformOptions = getConnectedPlatformOptions(connectedPlatforms);
const selectedPlatformKeys = getSelectedPlatformKeys(platform, connectedPlatformOptions);
const selectedPlatformOptions = selectedPlatformKeys
  .map((key) => connectedPlatformOptions.find((item) => item.value === key))
  .filter(Boolean);
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("Auto");
const languageOptions = [
  { value: "Auto", label: safePlannerText("spreeloChoosesLanguage") },
  { value: "Svenska", label: "Svenska" },
  { value: "English", label: "English" },
  { value: "Dansk", label: "Dansk" },
  { value: "Norsk", label: "Norsk" },
  { value: "Deutsch", label: "Deutsch" },
  { value: "Español", label: "Español" },
  { value: "Français", label: "Français" },
  { value: "Italiano", label: "Italiano" },
  { value: "Nederlands", label: "Nederlands" },
  { value: "Português", label: "Português" },
  { value: "Suomi", label: "Suomi" },
  { value: "Polski", label: "Polski" },
  { value: "العربية", label: "العربية" },
  { value: "日本語", label: "日本語" },
  { value: "中文", label: "中文" },
];
  const [postType, setPostType] = useState("Offer");
  const [length, setLength] = useState("Medium");
  const [ctaType, setCtaType] = useState("Learn more");
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
    setMessage(t("automation.errorCampaignNotFound"));
    return;
  }

  const campaignTimeZone = selectedTimeZone || timeZone || DEFAULT_TIME_ZONE;

 const campaignStartDate = getSafeCampaignStartDate(
  campaign,
  campaignTimeZone
);
    
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

  const platformOptions = getConnectedPlatformOptions(uniquePlatforms);

  setPlatform((currentValue) => {
    const currentKeys = getSelectedPlatformKeys(currentValue, platformOptions);

    if (currentKeys.length > 0) {
      return formatPlatformSelectionFromKeys(currentKeys, platformOptions);
    }

    return formatPlatformSelectionFromKeys(
      platformOptions.map((item) => item.value),
      platformOptions
    );
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
  setMessage(error.message || t("automation.errorLoadBrand"));
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
    setMessage(t("automation.errorNoCampaignLoaded"));
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
    let timingAnchor = null;

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
      
    } else if (campaignOpportunity.start_date && campaignOpportunity.end_date) {
      const temporaryPostPlan = buildCampaignPostPlan(
        campaignOpportunity,
        nextTotal
      );
      const temporarySchedule = buildDateRangeCampaignSchedule({
        campaign: campaignOpportunity,
        postPlan: temporaryPostPlan,
        timeZone: selectedTimeZone,
      });
      const usedDates = currentSlots.map((slot) => slot.startDate);
      const nextSchedule =
        temporarySchedule.find((item) => !usedDates.includes(item.startDate)) ||
        temporarySchedule[temporarySchedule.length - 1];

      startDate = nextSchedule?.startDate || planStartDate;
      publishTime = nextSchedule?.publishTime || getRecommendedTimeForDate(startDate, selectedTimeZone);
      daysBeforeEvent = nextSchedule?.daysBeforeEvent ?? null;
      timingAnchor = nextSchedule?.timingAnchor || null;
    } else {
      const sortedSlots = currentSlots
        .slice()
        .sort((a, b) =>
          `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
            `${b.startDate || ""} ${b.publishTime || ""}`
          )
        );

const lastSlot = sortedSlots[sortedSlots.length - 1];

const safeCampaignStartDate = getSafeCampaignStartDate(
  campaignOpportunity,
  selectedTimeZone
);

const fallbackStartDate =
  lastSlot?.startDate ||
  planStartDate ||
  safeCampaignStartDate;

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
      timingAnchor,
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
campaignPhase: postPlanItem.campaign_phase || "",
marketingAngle: postPlanItem.marketing_angle || "",
customerStage: postPlanItem.customer_stage || "",
ctaStrength: postPlanItem.cta_strength || "",
campaignPostIndex: postPlanItem.campaign_post_index || nextIndex + 1,
campaignPostCount: postPlanItem.campaign_post_count || nextTotal,
campaignGoal: postPlanItem.campaign_goal || "",
targetCustomerNeed: postPlanItem.target_customer_need || "",
strategyNotes: postPlanItem.strategy_notes || "",
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
    setMessage(t("automation.errorNeedOnePost"));
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
      t("automation.errorAlreadySelectedPosts", { count: autoPlanPostCount })
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
  setMessage(t("automation.errorChooseGoalBeforeSaving"));
  return;
}

    const invalidDateSlot = slots.find((slot) => !slot.startDate);

    if (invalidDateSlot) {
      setMessage(t("automation.errorStartDate"));
      return;
    }

    const invalidTimeSlot = slots.find((slot) => !slot.publishTime);

    if (invalidTimeSlot) {
      setMessage(t("automation.errorPublishTime"));
      return;
    }

    const invalidSlot = slots.find((slot) => !slot.prompt.trim());

    if (invalidSlot) {
      setMessage(t("automation.errorPrompt"));
      return;
    }

       if (creditBalance && plannedCredits > creditBalance.credits_remaining) {
      setMessage(t("automation.errorCredits", { credits: plannedCredits, remaining: creditBalance.credits_remaining }));
      return;
    }

    if (!platform) {
      setMessage(t("automation.errorConnectChannel"));
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
  setMessage(t("automation.errorChooseBrand"));
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
        approval_required: true,
        is_active: true,
               content_type_id: slot.contentTypeId,
        content_type_label: slot.contentTypeLabel,
        uses_website_content: Boolean(slot.usesWebsiteContent),

        campaign_phase: slot.campaignPhase || null,
        marketing_angle: slot.marketingAngle || null,
        customer_stage: slot.customerStage || null,
        cta_strength: slot.ctaStrength || null,
        campaign_post_index: slot.campaignPostIndex || null,
        campaign_post_count: slot.campaignPostCount || null,
        campaign_goal: slot.campaignGoal || null,
        target_customer_need: slot.targetCustomerNeed || null,
        strategy_notes: slot.strategyNotes || null,

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
        name: planName.trim() || t("automation.contentPlan"),
        totalPosts: rows.length,
        scheduleType,
        postsPerWeek: scheduleType === "weekly" ? rows.length : null,
        firstPostLabel,
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

          if (!event.target.closest(".platform-multiselect")) {
            setPlatformDropdownOpen(false);
          }
        }}
      >
     <header className="planner-hero planner-hero-final">
  <div className="planner-hero-copy">
    <h2>
      {campaignOpportunity
        ? `Create campaign: ${campaignOpportunity.title}`
        : t("automation.heroSmartTitle")}
    </h2>
    <p>
      {campaignOpportunity
        ? t("automation.heroCampaignText")
        : t("automation.heroTextSmartPlan")}
    </p>
  </div>

  <div className="planner-hero-visual" aria-hidden="true">
    <div className="planner-hero-orb" />
    <div className="planner-hero-calendar">
      <span />
      <span className="checked">✓</span>
      <span />
      <span className="checked">✓</span>
      <span />
      <span className="checked">✓</span>
      <span />
      <span />
      <span className="checked">✓</span>
    </div>
    <div className="planner-hero-mascot">✦</div>
  </div>

  <button
    type="button"
    className="learn-more-button planner-hero-learn"
    onClick={() => setShowLearnMoreModal(true)}
  >
    ⓘ {t("automation.learnMore")}
  </button>
</header>

{campaignOpportunity && (
  <section className="campaign-mode-banner">
    <div>
      <p className="dashboard-eyebrow">{t("automation.campaignMode")}</p>
      <h3>{campaignOpportunity.title}</h3>
      <span>
        {campaignOpportunity.description ||
          t("automation.campaignDescriptionFallback")}
      </span>
    </div>

      <div className="campaign-mode-meta">
      <span>{t("automation.campaignDate")}</span>
      <strong>{getCampaignDateLabel(campaignOpportunity)}</strong>

      <span>{t("automation.recommendedPlan")}</span>
      <strong>
        {t("automation.postCount", { count: getCampaignRecommendedPostCount(campaignOpportunity, slots.length) })}
      </strong>
    </div>
  </section>
)}

<div className="wizard-layout">
          <main className="wizard-main">
            <section className="planner-builder-card planner-primary-builder">
              <div className="planner-builder-header">
                <div className="planner-builder-step-badge">1</div>
                <div>
                  <h3>{t("automation.chooseGoalAndSchedule")}</h3>
                  <p>{t("automation.mainObjectiveSmart")}</p>
                </div>
              </div>

              <div className="planner-setup-grid">
<div className="planner-setup-card">
  <div className="setup-step-title">
    <span>1</span>
    <div>
      <strong>
        {planCreationMode === "campaign" ? t("automation.campaignGoal") : t("automation.goal")}
      </strong>
      <small>
        {planCreationMode === "campaign"
          ? t("automation.campaignGoalHelp")
          : t("automation.mainObjectiveSmart")}
      </small>
    </div>
  </div>

  {planCreationMode === "campaign" ? (
    <div className="planner-campaign-count-box">
      <strong>🎯</strong>
      <span>{t("automation.focusedCampaignFromCalendar")}</span>
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
    ? t("automation.notUsedForManual")
    : t("automation.chooseGoalToBuild")}
</option>
      {autoPlanGoals.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {translateAutoPlanGoalLabel(goal.id)}
        </option>
      ))}
    </select>
  )}

  <p>
    {planCreationMode === "campaign"
      ? t("automation.campaignConnectedText")
      : translateAutoPlanGoalDescription(autoPlanGoal)}
  </p>
</div>

              <div className="planner-setup-card">
                <div className="setup-step-title">
                  <span>2</span>
                  <div>
                    <strong>
                      {planCreationMode === "campaign"
                        ? t("automation.campaignPosts")
                        : t("automation.postsPerWeek")}
                    </strong>
                    <small>
                      {planCreationMode === "campaign"
                        ? t("automation.howManyCampaignPosts")
                        : t("automation.howOftenPost")}
                    </small>
                  </div>
                </div>

                {planCreationMode === "campaign" ? (
                  <div className="planner-campaign-count-box">
                    <strong>{slots.length}</strong>
                    <span>{t("automation.plannedCampaignPosts")}</span>
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
  ? t("automation.campaignPostsPrepared", { count: slots.length })
  : planCreationMode === "manual"
  ? t("automation.manualPostsAdded")
  : t("automation.recommendedGrowthSmart")}
                </p>
              </div>

              <div className="planner-setup-card">
                <div className="setup-step-title">
                  <span>3</span>
                  <div>
                    <strong>{t("automation.startDateTime")}</strong>
                    <small>{t("automation.whenStart")}</small>
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
                    weekdayLabels={weekdayLabels}
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

                <p>{t("automation.scheduleFromDateTime")}</p>
              </div>
              </div>
            </section>

            {planCreationMode === "campaign" ? (
  <section className="planner-mode-card">
    <div className="planner-included-card">
      <div className="planner-section-heading compact">
        <div>
          <h3>{t("automation.campaignPosts")}</h3>
          <p>
            {t("automation.campaignSequenceText")}
          </p>
        </div>
      </div>

      <div className="planner-included-grid">
        <div className="planner-included-type">
          <span>🎯</span>
          <strong>{t("automation.campaignPlan")}</strong>
        </div>

        <div className="planner-included-type">
          <span>{slots.length}</span>
          <strong>{t("automation.plannedPosts")}</strong>
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
        <strong>{t("automation.autoPlan")}</strong>
        <p>{t("automation.autoPlanText")}</p>
        <small>{t("automation.recommended")}</small>
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
        <strong>{t("automation.chooseContentTypes")}</strong>
        <p>{t("automation.chooseContentTypesText")}</p>
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
        <strong>{t("automation.manualPrompt")}</strong>
        <p>{t("automation.manualPromptText")}</p>
      </button>
    </div>

    {planCreationMode === "select" && (
      <div className="planner-content-picker">
        <div className="planner-section-heading">
          <div>
         <h3>{t("automation.choosePostTypes", { count: autoPlanPostCount })}</h3>
<p>
  {t("automation.choosePostTypesText")}
</p>
          </div>

          <span>
  {Math.min(selectedContentTypeIds.length, autoPlanPostCount)}/
  {autoPlanPostCount} {t("automation.selected")}
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
                <strong>{translateContentTypeShortLabel(type)}</strong>
                <p>{translateContentTypeDescription(type)}</p>
              </button>
            );
          })}
        </div>
        <div className="content-picker-progress-note">
  {selectedContentTypeIds.length < autoPlanPostCount ? (
    <span>
      {t("automation.chooseMorePosts", { count: autoPlanPostCount - selectedContentTypeIds.length })}
    </span>
  ) : (
    <span>{t("automation.planReadyReview")}</span>
  )}
</div>
      </div>
    )}

  </section>
)}
            {planCreationMode === "manual" && !planWasSaved && (
  <section className="planner-manual-intro-card">
    <div>
      <h3>{t("automation.manualPrompt")}</h3>
      <p>
        {t("automation.manualIntroText")}
      </p>
    </div>

    <button type="button" className="add-plan-button" onClick={addManualSlot}>
      {t("automation.addManualPost")}
    </button>
  </section>
)}
{shouldShowPlannerDetails && (
  <>
              {planWasSaved ? (
  <section className="planner-schedule-card campaign-saved-card">
    <div className="campaign-saved-icon">✓</div>

    <div>
      <p className="dashboard-eyebrow">{t("automation.campaignScheduled")}</p>
      <h3>{t("automation.savedPlanReady", { name: savedPlanSummary.name })}</h3>
      <p>
        {t("automation.savedPlanText")}
      </p>

      <div className="campaign-saved-grid">
        <div>
          <span>{t("automation.plannedPosts")}</span>
          <strong>{savedPlanSummary.totalPosts}</strong>
        </div>

        <div>
          <span>{t("automation.firstPost")}</span>
          <strong>{savedPlanSummary.firstPostLabel}</strong>
        </div>


        <div>
          <span>{t("automation.credits")}</span>
          <strong>{savedPlanSummary.credits}</strong>
        </div>
      </div>

      <div className="campaign-saved-actions">
        <button type="button" onClick={() => setShowSavedRules(true)}>
          {t("automation.viewContentPlans")}
        </button>

        <a href="/">{t("automation.goToDashboard")}</a>
      </div>
    </div>
  </section>
) : (
  <section className="planner-schedule-card">
    <div className="planner-schedule-header">
      <div>
        <h3>{t("automation.plannedFirstWeekTitle")}</h3>
        <span>{t("automation.plannedFirstWeekText")}</span>
      </div>

       <div className="planner-schedule-actions">
        <a className="view-calendar-button" href="/calendar">
          {t("automation.viewCalendar")}
        </a>
      </div>
    </div>

    <div className="planner-post-table">
      {slots.map((slot, index) => {
        const instructionsAreExpanded =
          expandedInstructionSlotIds.includes(slot.id);
        const displayLabel = getCustomerSlotLabel(slot);
        const displayDescription = getCustomerSlotPurpose(slot);
        const formatLabel = getSlotFormatLabel(slot);
        const hasStrategyInfo =
          slot.isCampaignSlot &&
          (slot.marketingAngle ||
            slot.customerStage ||
            slot.ctaStrength ||
            slot.campaignPhase ||
            slot.strategyNotes);


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
                <div className="planner-post-title-row">
                  {slot.isCampaignSlot && (
                    <span
                      className={`strategy-stage-dot ${getCustomerStageDotClass(
                        slot.customerStage
                      )}`}
                      title={getCustomerStageLabel(slot.customerStage)}
                    />
                  )}

                  <strong>
                    {slot.isCampaignSlot && slot.marketingAngle
                      ? getCampaignAngleLabel(slot.marketingAngle)
                      : displayLabel}
                  </strong>

                  {hasStrategyInfo && (
                    <button
                      type="button"
                      className="strategy-info-button"
                      aria-label={t("automation.showCampaignStrategy")}
                    >
                      i
                      <span className="strategy-info-popover">
                        <span className="strategy-info-title">
                          {t("automation.strategyForThisPost")}
                        </span>

                        <span>
                          <strong>{t("automation.audience")}:</strong>{" "}
                          {getCustomerStageLabel(slot.customerStage)}
                        </span>

                        <span>
                          <strong>{t("automation.angle")}:</strong>{" "}
                          {getCampaignAngleLabel(slot.marketingAngle)}
                        </span>

                        <span>
                          <strong>{t("automation.cta")}:</strong>{" "}
                          {getCtaStrengthLabel(slot.ctaStrength)}
                        </span>

                        {slot.campaignPhase && (
                          <span>
                            <strong>{t("automation.phase")}:</strong> {slot.campaignPhase}
                          </span>
                        )}

                        {slot.strategyNotes && (
                          <span className="strategy-info-note">
                            {slot.strategyNotes}
                          </span>
                        )}
                      </span>
                    </button>
                  )}
                </div>

                <span>{displayDescription}</span>
              </div>
              <div className="planner-post-date">
                {slot.dateLocked ? (
                  <div className="locked-campaign-date">
                    <strong>{formatStartDateLabel(slot.startDate, timeZone)}</strong>
                    <span>{t("automation.lockedCampaignDate")}</span>

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
                    weekdayLabels={weekdayLabels}
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
                  {instructionsAreExpanded ? t("automation.hide") : t("automation.edit")}
                </button>

                <button
                  type="button"
                  title={t("automation.duplicate")}
                  onClick={() => duplicateSlot(slot.id)}
                >
                  ⧉
                </button>

              <button
  type="button"
  title={t("automation.remove")}
  aria-label={t("automation.removePost")}
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
                  <label>{slot.isCampaignSlot ? t("automation.postIdea") : t("automation.instructions")}</label>

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
    ? t("automation.placeholderCampaignPost")
    : t("automation.placeholderPostInstructions")
}
                  />

                  {slot.generateImage && (
                    <>
                      <label>{t("automation.imageDirection")}</label>
                      <textarea
                        className="input prompt-textarea"
                        value={slot.imagePrompt}
                        onChange={(event) =>
                          updateSlot(slot.id, "imagePrompt", event.target.value)
                        }
                        placeholder={t("automation.placeholderImageDirection")}
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
                      ? t("automation.websiteImageFallback")
                      : t("automation.aiImage")}
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={slot.includeEmojis}
                      onChange={(event) =>
                        updateSlot(slot.id, "includeEmojis", event.target.checked)
                      }
                    />
                    {t("automation.emojis")}
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={slot.includeHashtags}
                      onChange={(event) =>
                        updateSlot(slot.id, "includeHashtags", event.target.checked)
                      }
                    />
                    {t("automation.hashtags")}
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
        ? t("automation.addAnotherCampaignPost")
        : planCreationMode === "manual"
        ? t("automation.addAnotherManualPost")
        : t("automation.addAnotherPost")}
    </button>
  </section>
)}

                        <section className="planner-settings-card planner-builder-card planner-settings-builder">
              <div className="planner-builder-header">
                <div className="planner-builder-step-badge">2</div>
                <div>
                  <h3>{t("automation.settings")}</h3>
                  <p>{t("automation.settingsHelp")}</p>
                </div>
                <span className="planner-recommended-pill">{t("automation.recommended")}</span>
              </div>

            <div className="planner-settings-grid simple">
  {loadingConnectedPlatforms ? (
    <div className="planner-setting-field planner-setting-connect-box">
      <div className="planner-setting-head">
        <span className="planner-setting-icon">🌐</span>
        <strong>{t("automation.platform")}</strong>
      </div>
      <div className="input">{t("automation.loadingConnectedChannels")}</div>
    </div>
  ) : connectedPlatformOptions.length > 0 ? (
    <div className="planner-setting-field">
      <div className="planner-setting-head">
        <span className="planner-setting-icon">🌐</span>
        <strong>{t("automation.platform")}</strong>
      </div>

      <div className={`platform-multiselect ${platformDropdownOpen ? "open" : ""}`}>
        <button
          type="button"
          className="platform-multiselect-button"
          onClick={(event) => {
            event.stopPropagation();
            setPlatformDropdownOpen((current) => !current);
          }}
        >
          <span className="platform-selected-icons">
            {selectedPlatformOptions.length > 0 ? (
              selectedPlatformOptions.map((item) => (
                <img
                  key={item.value}
                  src={item.icon}
                  alt={item.label}
                  className="platform-icon-img"
                />
              ))
            ) : (
              <span className="platform-placeholder">{t("automation.choosePlatform")}</span>
            )}
          </span>
          <span className="platform-caret">⌄</span>
        </button>

        {platformDropdownOpen && (
          <div className="platform-multiselect-menu" onClick={(event) => event.stopPropagation()}>
            {connectedPlatformOptions.map((item) => {
              const checked = selectedPlatformKeys.includes(item.value);

              return (
                <label key={item.value} className="platform-multiselect-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const nextKeys = checked
                        ? selectedPlatformKeys.filter((key) => key !== item.value)
                        : [...selectedPlatformKeys, item.value];

                      setPlatform(formatPlatformSelectionFromKeys(nextKeys, connectedPlatformOptions));
                    }}
                  />
                  <img src={item.icon} alt="" className="platform-icon-img" />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <p>{safePlannerText("platformHelp")}</p>
    </div>
  ) : (
    <div className="planner-setting-field planner-setting-connect-box">
      <div className="planner-setting-head">
        <span className="planner-setting-icon">🌐</span>
        <strong>{t("automation.platform")}</strong>
      </div>

      <div className="planner-connect-first-card">
        <strong>{t("automation.connectSocialChannelFirst")}</strong>
        <p>{t("automation.connectSocialChannelFirstText")}</p>

        <a href="/social-channels" className="planner-connect-first-link">
          {t("automation.goToSocialChannels")}
        </a>
      </div>
    </div>
  )}

  <label className="planner-setting-field">
    <div className="planner-setting-head">
      <span className="planner-setting-icon">✧</span>
      <strong>{safePlannerText("languageForPosts")}</strong>
    </div>
    <select
      value={language}
      onChange={(event) => setLanguage(event.target.value)}
    >
      {languageOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <p>{safePlannerText("languageHelpSmart")}</p>
  </label>


  <label className="planner-setting-field">
    <div className="planner-setting-head">
      <span className="planner-setting-icon">↻</span>
      <strong>{safePlannerText("repeatFull")}</strong>
    </div>
    <select
      value={scheduleType}
      onChange={(event) => setScheduleType(event.target.value)}
    >
      <option value="weekly">{t("automation.weekly")}</option>
      <option value="once">{t("automation.oneTime")}</option>
    </select>
    <p>{safePlannerText("repeatHelpSmart")}</p>
  </label>


  <label className="planner-setting-field">
    <div className="planner-setting-head">
      <span className="planner-setting-icon">⏱</span>
      <strong>{t("automation.timezone")}</strong>
    </div>
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
    <p>{safePlannerText("timezoneHelpSmart")}</p>
  </label>
</div>
            </section>

            {shouldShowPlannerDetails && !planWasSaved && (
              <section className="planner-includes-preview-card">
                <div className="planner-preview-panel">
                  <div className="planner-section-heading compact">
                    <div>
                      <h3>{t("automation.planIncludesTitle")}</h3>
                      <p>{safePlannerText("planIncludesText")}</p>
                    </div>
                  </div>

                  <div className="planner-includes-chip-grid">
                    {getPlanPreviewCardsFromTypes(includedContentTypes, autoPlanGoal).map((card) => (
                      <div className={`planner-includes-chip preview-${card.id}`} key={card.id}>
                        <span>{card.icon}</span>
                        <strong>{translatePreviewCardLabel(card.id)}</strong>
                        <small>{translatePreviewCardDescription(card.id)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
  </>
)}
            <section className="planner-save-card">
              <div>
  <h3>{savedPlanSummary ? t("automation.planSaved") : t("automation.generatePlanTitle")}</h3>
  <p>
    {savedPlanSummary
      ? t("automation.automationPlanReady")
      : t("automation.generatePlanHelp")}
  </p>
</div>
         {savedPlanSummary ? (
  <div className="planner-create-another-panel">
    <button
      type="button"
      className="planner-create-another-button"
      onClick={startAnotherPlan}
    >
      {t("automation.createAnotherPlan")}
    </button>
  </div>
) : (
  <>
    <input
      className="planner-save-input"
      value={planName}
      onChange={(event) => setPlanName(event.target.value)}
      placeholder={t("automation.planNamePlaceholderShort")}
    />

    <button
      type="button"
      className="planner-save-button"
      onClick={savePlan}
      disabled={saving || !hasEnoughCredits}
    >
      {saving ? t("automation.saving") : t("automation.generatePostPlan")}
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
                        <p>{t("automation.yourContentPlanSaved")}</p>
                        <h4>{savedPlanSummary.name}</h4>
                      </div>

                      <span>{savedPlanSummary.method}</span>
                    </div>

                    <div className="planner-save-success-grid">
                      <div>
                        <span>
                          {savedPlanSummary.scheduleType === "weekly"
                            ? t("automation.postsPerWeek")
                            : t("automation.plannedPosts")}
                        </span>
                        <strong>
                          {savedPlanSummary.scheduleType === "weekly"
                            ? t("automation.postCount", { count: savedPlanSummary.postsPerWeek })
                            : t("automation.postCount", { count: savedPlanSummary.totalPosts })}
                        </strong>
                      </div>

                      <div>
                        <span>{t("automation.firstPost")}</span>
                        <strong>{savedPlanSummary.firstPostLabel}</strong>
                      </div>


                      <div>
                        <span>{t("automation.credits")}</span>
                        <strong>
                          {savedPlanSummary.credits} {t("automation.creditsUsedWhenGenerated")}
                        </strong>
                      </div>
                    </div>

                    <div className="planner-save-success-actions">
                      <button
                        type="button"
                        onClick={() => setShowSavedRules(true)}
                      >
                        {t("automation.viewContentPlans")}
                      </button>

                      <a href="/">{t("automation.goToDashboard")}</a>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section className="saved-card saved-card-compact">
              <div className="saved-header">
                <div>
                  <p>{t("automation.savedPlans")}</p>
                  <h3>{t("automation.contentPlans")}</h3>
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => setShowSavedRules((current) => !current)}
                  >
                    {showSavedRules ? t("automation.hide") : t("automation.showAll")}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="automation-empty">
                  <h4>{t("automation.loadingContentPlans")}</h4>
                  <p>{t("automation.loadingContentPlansText")}</p>
                </div>
              ) : rules.length === 0 ? (
                <div className="automation-empty">
                  <div className="folder-icon">📁</div>
                  <div>
                    <h4>{t("automation.noContentPlansYet")}</h4>
                    <p>{t("automation.noContentPlansText")}</p>
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
                      {t("automation.selectVisible")}
                    </label>

                    <span>
                      {t("automation.selectedRulesCount", { count: selectedRuleIds.length })}
                      {!showSavedRules && rules.length > 3
                        ? ` · ${t("automation.showingRulesCount", { visible: visibleRules.length, total: rules.length })}`
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
                          {t("automation.clear")}
                        </button>

                        <button
                          type="button"
                          className="danger-button"
                          onClick={deleteSelectedRules}
                          disabled={deletingRules}
                        >
                          {deletingRules
                            ? t("automation.deleting")
                            : confirmingBulkDelete
                            ? t("automation.confirmDeleteCount", { count: selectedRuleIds.length })
                            : t("automation.deleteSelectedCount", { count: selectedRuleIds.length })}
                        </button>
                      </>
                    )}

                    {confirmingBulkDelete && (
                      <span className="delete-confirm-note">
                        {t("automation.confirmDeleteSelectedRules")}
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
                                ? t("automation.websiteContent")
                                : rule.generate_image
                                ? t("automation.textImage")
                                : t("automation.textOnly")}
                            </p>
                            <small>
                              {t("automation.nextRun")}: {" "}
                              {formatDateTime(rule.next_run_at, ruleTimeZone)}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => deleteSingleRule(rule.id)}
                            disabled={deletingRules}
                          >
                            {isConfirmingDelete ? t("automation.confirm") : t("automation.delete")}
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
                        {t("automation.showMoreSavedRules", { count: rules.length - 3 })}
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
                  <h3>{safePlannerText("planSummary")}</h3>
                  <p>{safePlannerText("readyToCreate")}</p>
                </div>
              </div>

              <div className="planner-summary-list premium">
                {planCreationMode === "auto" && (
                  <div className="planner-summary-item">
                    <span className="planner-summary-icon">◎</span>
                    <div>
                      <span>{t("automation.goal")}</span>
                      <strong>{translateAutoPlanGoalLabel(autoPlanGoal)}</strong>
                    </div>
                  </div>
                )}


<div className="planner-summary-item">
  <span className="planner-summary-icon">▦</span>
  <div>
    <span>
      {scheduleType === "weekly" && planCreationMode !== "campaign"
        ? t("automation.postsPerWeek")
        : t("common.posts")}
    </span>
    <strong>
      {t("automation.postCount", { count: slots.length })}
    </strong>
  </div>
</div>
                <div className="planner-summary-item">
                  <span className="planner-summary-icon">◷</span>
                  <div>
                    <span>{t("automation.start")}</span>
                    <strong>
                      {formatStartDateLabel(planStartDate, timeZone)},{" "}
                      {defaultPublishTime}
                    </strong>
                  </div>
                </div>


                <div className="planner-summary-item">
                  <span className="planner-summary-icon">🌐</span>
                  <div>
                    <span>{t("automation.platform")}</span>
                    <div className="planner-social-icon-row mini">
                      {selectedPlatformOptions.length > 0 ? (
                        selectedPlatformOptions.map((item) => (
                          <img
                            key={item.value}
                            src={item.icon}
                            alt={item.label}
                            className="platform-icon-img"
                          />
                        ))
                      ) : (
                        <strong>{t("automation.choosePlatform")}</strong>
                      )}
                    </div>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon">✧</span>
                  <div>
                    <span>{safePlannerText("languageForPosts")}</span>
                    <strong>{getLanguageDisplayLabel(language)}</strong>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon">↻</span>
                  <div>
                    <span>{safePlannerText("repeatFull")}</span>
                    <strong>{translateScheduleType(scheduleType)}</strong>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon">⏱</span>
                  <div>
                    <span>{t("automation.timezone")}</span>
                    <strong>{timeZone}</strong>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon success">✓</span>
                  <div>
                    <span>{t("automation.approval")}</span>
                    <strong>{t("automation.approvalAlwaysRequired")}</strong>
                  </div>
                </div>

              </div>

              <div className="planner-summary-status">
                <span>✓</span>
                <div>
                  <strong>{t("automation.planIsReady")}</strong>
                  <p>{t("automation.planReadyText")}</p>
                </div>
              </div>

              {creditBalance && !hasEnoughCredits && (
                <div className="planner-sidebar-warning">
                  {t("automation.sidebarCreditWarning", { credits: plannedCredits, remaining: creditBalance.credits_remaining })}
                </div>
              )}
            </section>

            <section className="planner-credits-card">
              <div className="planner-sidebar-title">
                <span>ⓘ</span>
                <h3>{t("automation.credits")}</h3>
              </div>

              {creditBalance ? (
                <>
                  <div className="planner-credit-number">
                    <strong>{creditsRemaining}</strong>
                    <span>/ {monthlyCreditLimit || "—"} {t("automation.creditsLeft")}</span>
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
                      {t("automation.creditsIncludedIn")} 
                      {creditBalance.subscription_status === "trialing"
                        ? t("automation.starterTrial")
                        : subscriptionPlanLabel}
                    </span>
                  </div>

                  <div className="planner-credit-wave" />

                  <div className="planner-credit-help">
                    <strong>{t("automation.needMoreCredits")}</strong>
                    <p>{t("automation.upgradeText")}</p>
                  </div>

                  <button type="button" className="planner-upgrade-button">
                    {t("automation.upgradePlan")}
                  </button>
                </>
              ) : (
                <div className="summary-note">
                  <strong>{t("automation.noCreditBalance")}</strong>
                  <p>
                    {t("automation.noCreditBalanceText")}
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
                  <p>{t("automation.addPlannedPost")}</p>
                  <h3>{t("automation.chooseContentType")}</h3>
                  <span>
                    {t("automation.chooseContentTypeText")}
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
                    <strong>{translateContentTypeLabel(type)}</strong>
                    <p>{translateContentTypeDescription(type)}</p>
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
            {campaignOpportunity ? t("automation.campaignPlanHelp") : t("automation.contentCreatorHelp")}
          </p>
          <h3>
            {campaignOpportunity
              ? t("automation.aboutCampaignPlan")
              : t("automation.howContentCreatorWorks")}
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
            {t("automation.campaignHelpIntro")}
          </p>

          <div className="learn-more-steps">
            <div>
              <span>1</span>
              <strong>{t("automation.campaignDate")}</strong>
              <p>
                {t("automation.campaignDateHelp")}
              </p>
            </div>

            <div>
              <span>2</span>
              <strong>{t("automation.recommendedPlan")}</strong>
              <p>
                {t("automation.recommendedPlanHelp")}
              </p>
            </div>

            <div>
              <span>3</span>
              <strong>{t("automation.editBeforeSaving")}</strong>
              <p>
                {t("automation.editBeforeSavingHelp")}
              </p>
            </div>

            <div>
              <span>4</span>
              <strong>{t("automation.nothingPublishedYet")}</strong>
              <p>
                {t("automation.nothingPublishedYetHelp")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="learn-more-modal-content">
          <p>
            {t("automation.creatorHelpIntro")}
          </p>

          <div className="learn-more-steps">
            <div>
              <span>1</span>
              <strong>{t("automation.chooseGoal")}</strong>
              <p>
                {t("automation.chooseGoalHelpModal")}
              </p>
            </div>

            <div>
              <span>2</span>
              <strong>{t("automation.choosePostAmount")}</strong>
              <p>
                {t("automation.choosePostAmountHelp")}
              </p>
            </div>

            <div>
              <span>3</span>
              <strong>{t("automation.reviewSchedule")}</strong>
              <p>
                {t("automation.reviewScheduleHelp")}
              </p>
            </div>

            <div>
              <span>4</span>
              <strong>{t("automation.saveThePlan")}</strong>
              <p>
                {t("automation.saveThePlanHelp")}
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
        {t("automation.gotIt")}
      </button>
    </div>
  </div>
)}
      </div>
    </AppLayout>
  );
}
