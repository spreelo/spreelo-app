"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { CampaignGlyph } from "../../components/SpreeloIcons";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const CAMPAIGN_HANDOFF_STORAGE_KEY = "spreelo_calendar_campaign_handoff";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function formatDate(value, locale = "en") {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat(locale || "en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function getCampaignDateLabel(campaign, t, locale = "en") {
  const eventType = String(campaign?.event_type || "").toLowerCase();

  const isFullYearFlexibleCampaign =
    campaign?.start_date &&
    campaign?.end_date &&
    String(campaign.start_date).endsWith("-01-01") &&
    String(campaign.end_date).endsWith("-12-31") &&
    ["custom_campaign", "campaign", "seasonal"].includes(eventType);

  if (campaign.event_date) {
    return formatDate(campaign.event_date, locale);
  }

  if (isFullYearFlexibleCampaign && campaign.event_year) {
    return t("calendar.flexibleCampaignWithYear", {
      year: campaign.event_year,
    });
  }

  if (campaign.start_date && campaign.end_date) {
    return t("calendar.dateRange", {
      startDate: formatDate(campaign.start_date, locale),
      endDate: formatDate(campaign.end_date, locale),
    });
  }

  if (campaign.start_date) {
    return t("calendar.fromDate", {
      date: formatDate(campaign.start_date, locale),
    });
  }

  if (campaign.event_year) {
    return t("calendar.flexibleCampaignWithYear", {
      year: campaign.event_year,
    });
  }

  return t("calendar.flexibleCampaign");
}

function getEventTypeLabel(value, t) {
  const eventType = String(value || "campaign").toLowerCase().trim();

  const labelKeyByType = {
    seasonal: "calendar.eventType.seasonal",
    shopping: "calendar.eventType.shopping",
    industry_day: "calendar.eventType.industryDay",
    local_event: "calendar.eventType.localEvent",
    holiday: "calendar.eventType.holiday",
    social_day: "calendar.eventType.socialDay",
    awareness_day: "calendar.eventType.awarenessDay",
    ecommerce: "calendar.eventType.ecommerce",
    retail: "calendar.eventType.retail",
    campaign: "calendar.eventType.campaign",
    custom_campaign: "calendar.eventType.campaign",
  };

  const labelKey = labelKeyByType[eventType];

  if (labelKey) {
    return t(labelKey);
  }

  return eventType
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getConfidenceLabel(value, t) {
  const confidence = String(value || "medium").toLowerCase();

  if (confidence === "high") return t("calendar.highRelevance");
  if (confidence === "low") return t("calendar.lowRelevance");

  return t("calendar.mediumRelevance");
}

function getSortDate(campaign) {
  const value =
    campaign.event_date || campaign.start_date || `${campaign.event_year}-12-31`;

  const timestamp = new Date(`${value}T00:00:00`).getTime();

  if (Number.isNaN(timestamp)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return timestamp;
}

function getTodayDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCalendarYearsToShow(todayDateString) {
  const currentYear = Number(todayDateString.slice(0, 4));
  const monthDay = todayDateString.slice(5);

  if (!Number.isFinite(currentYear)) {
    return [new Date().getFullYear()];
  }

  if (monthDay >= "12-01") {
    return [currentYear, currentYear + 1];
  }

  return [currentYear];
}

function getNextCalendarYear(todayDateString) {
  const currentYear = Number(todayDateString.slice(0, 4));

  if (!Number.isFinite(currentYear)) {
    return new Date().getFullYear() + 1;
  }

  return currentYear + 1;
}

function getCalendarYearNotice(todayDateString, t) {
  const nextYear = getNextCalendarYear(todayDateString);
  const monthDay = todayDateString.slice(5);

  if (monthDay >= "12-01") {
    return t("calendar.nextYearReady", {
      year: nextYear,
    });
  }

  return t("calendar.nextYearLater", {
    year: nextYear,
  });
}

function isUpcomingCampaign(campaign, todayDateString, visibleYears = []) {
  if (!campaign) return false;

  const currentYear = Number(todayDateString.slice(0, 4));
  const campaignYear = Number(campaign.event_year);

  if (
    Number.isFinite(campaignYear) &&
    visibleYears.length > 0 &&
    !visibleYears.includes(campaignYear)
  ) {
    return false;
  }

  if (Number.isFinite(campaignYear) && campaignYear > currentYear) {
    return true;
  }

  if (campaign.event_date) {
    return campaign.event_date >= todayDateString;
  }

  if (campaign.end_date) {
    return campaign.end_date >= todayDateString;
  }

  if (campaign.start_date) {
    return campaign.start_date >= todayDateString;
  }

  if (Number.isFinite(campaignYear)) {
    return visibleYears.includes(campaignYear);
  }

  return true;
}

function getCampaignRecommendedPostCount(campaign, fallbackCount = 3) {
  const rawRecommendedCount = Number(campaign?.recommended_post_count);

  const count = Number.isFinite(rawRecommendedCount)
    ? rawRecommendedCount
    : fallbackCount;

  return Math.min(Math.max(Math.round(count), 1), 7);
}


function normalizeCampaignForStudioHandoff(campaign) {
  if (!campaign) return campaign;

  const singleDate =
    campaign.event_date ||
    (campaign.start_date && !campaign.end_date ? campaign.start_date : "") ||
    (campaign.start_date && campaign.end_date && campaign.start_date === campaign.end_date
      ? campaign.start_date
      : "");

  if (!singleDate) {
    return campaign;
  }

  return {
    ...campaign,
    event_date: campaign.event_date || singleDate,
    start_date: campaign.start_date || singleDate,
    end_date: campaign.end_date || singleDate,
    recommended_post_count: getCampaignRecommendedPostCount(campaign),
  };
}

function buildFallbackCampaignPlan(count, t) {
  const templates = [
    {
      role: t("calendar.fallback.awarenessRole"),
      purpose: t("calendar.fallback.awarenessPurpose"),
    },
    {
      role: t("calendar.fallback.educationRole"),
      purpose: t("calendar.fallback.educationPurpose"),
    },
    {
      role: t("calendar.fallback.valueRole"),
      purpose: t("calendar.fallback.valuePurpose"),
    },
    {
      role: t("calendar.fallback.trustRole"),
      purpose: t("calendar.fallback.trustPurpose"),
    },
    {
      role: t("calendar.fallback.engagementRole"),
      purpose: t("calendar.fallback.engagementPurpose"),
    },
    {
      role: t("calendar.fallback.reminderRole"),
      purpose: t("calendar.fallback.reminderPurpose"),
    },
    {
      role: t("calendar.fallback.finalReminderRole"),
      purpose: t("calendar.fallback.finalReminderPurpose"),
    },
  ];

  return Array.from({ length: count }).map((_, index) => {
    const isLast = index === count - 1;
    const template =
      templates[index] ||
      templates[templates.length - 2] ||
      templates[0];

    return {
      role: isLast ? t("calendar.fallback.finalReminderRole") : template.role,
      purpose: isLast
        ? t("calendar.fallback.finalReminderPurpose")
        : template.purpose,
      days_before_event: isLast ? 0 : Math.max((count - 1 - index) * 3, 1),
    };
  });
}


function addDaysToDateString(dateString, daysToAdd) {
  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
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

function shouldUseEventGreetingPost(campaign, count) {
  const safeCount = Math.max(Math.round(Number(count) || 1), 1);
  return Boolean(campaign?.event_date) && safeCount >= 4;
}

function getFallbackDaysBeforeEventForAnchor(campaign, post, index, total) {
  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);
  const anchor = String(post?.timing_anchor || "").toLowerCase();
  const text = getCampaignStrategicText(campaign, post);

  if (
    shouldUseEventGreetingPost(campaign, total) &&
    /relationship|event|main day|day of|celebrate|thank|gratitude|hälsning|fira|relations/.test(`${anchor} ${text}`)
  ) {
    return 0;
  }

  if (/deadline|last|final|slut|sista|urgency/.test(`${anchor} ${text}`)) {
    return leadTimeProfile.deadlineLeadDays;
  }

  if (/conversion|product|buy|order|book|offer|sale|köp|beställ|boka/.test(`${anchor} ${text}`)) {
    return leadTimeProfile.conversionLeadDays;
  }

  if (/trust|proof|review|process|quality|trygg|förtroende/.test(`${anchor} ${text}`)) {
    return leadTimeProfile.trustLeadDays;
  }

  if (/engagement|comment|react|question|kommentera|fråga/.test(`${anchor} ${text}`)) {
    return leadTimeProfile.engagementLeadDays;
  }

  if (index === 0) return leadTimeProfile.inspirationLeadDays;
  if (index === total - 1) return leadTimeProfile.deadlineLeadDays;

  const progress = total <= 1 ? 0.5 : index / Math.max(total - 1, 1);
  return Math.max(
    leadTimeProfile.deadlineLeadDays,
    Math.round(leadTimeProfile.inspirationLeadDays * (1 - progress))
  );
}

function buildCampaignPostPlan(campaign, recommendedCount, t) {
  const rawPostPlan = Array.isArray(campaign?.post_plan)
    ? campaign.post_plan
    : [];

  const fallbackPostPlan = buildFallbackCampaignPlan(recommendedCount, t);

  const mergedPlan = Array.from({ length: recommendedCount }).map((_, index) => {
    const fallbackPost = fallbackPostPlan[index] || {};
    const aiPost = rawPostPlan[index] || {};

    const role =
      aiPost.role && !/^campaign post/i.test(aiPost.role)
        ? aiPost.role
        : fallbackPost.role;

    const verifiedDaysBeforeEvent = getVerifiedDaysBeforeCampaignMainDate(
      campaign,
      aiPost
    );
    const daysBeforeEvent =
      typeof verifiedDaysBeforeEvent === "number"
        ? verifiedDaysBeforeEvent
        : typeof aiPost.days_before_event === "number" && aiPost.days_before_event >= 0
        ? Math.min(Math.round(aiPost.days_before_event), 365)
        : getFallbackDaysBeforeEventForAnchor(campaign, aiPost, index, recommendedCount);

    return {
      ...fallbackPost,
      ...aiPost,
      role,
      purpose: aiPost.purpose || fallbackPost.purpose,
      days_before_event: daysBeforeEvent,
      timing_anchor: aiPost.timing_anchor || fallbackPost.timing_anchor || "start",
    };
  });

  if (!campaign?.event_date) {
    return mergedPlan;
  }

  return mergedPlan.sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });
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

  if (/deadline|last|final|slut|sista/.test(explicitAnchor)) {
    return "deadline_before_event";
  }

  if (/conversion|product|buy|order|book|köp|beställ|boka/.test(explicitAnchor)) {
    return "conversion_before_deadline";
  }

  if (/trust|proof|trygg|förtroende/.test(explicitAnchor)) {
    return "trust";
  }

  if (/engagement|comment|react|kommentera|fråga/.test(explicitAnchor)) {
    return "engagement";
  }

  if (/middle|during|mid|under|mitt/.test(explicitAnchor)) {
    return "middle";
  }

  const text = [
    postPlanItem?.campaign_phase,
    postPlanItem?.marketing_angle,
    postPlanItem?.role,
    postPlanItem?.purpose,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/event|day of|main day|relationship|brand|thank|gratitude|hälsning|fira/.test(text)) {
    return "relationship_event";
  }

  if (/last[_\s-]?chance|last call|final|deadline|urgency|urgent|sista|slutlig|act now/.test(text)) {
    return "deadline_before_event";
  }

  if (/product[_\s-]?push|offer|sale|discount|buy|order|shop|book|conversion|köp|beställ|boka|köptryck/.test(text)) {
    return "conversion_before_deadline";
  }

  if (/trust|proof|review|process|quality|trygg|förtroende/.test(text)) {
    return "trust";
  }

  if (/engagement|question|comment|share|save|poll|react|kommentera|fråga|reflektera/.test(text)) {
    return "engagement";
  }

  return "start";
}

function getSafeUiLabel(t, key, fallback, variables = {}) {
  const value = t(key, variables);

  if (!value || value === key || value.includes(".")) {
    return fallback;
  }

  return value;
}


function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function getDaysBetweenDateStrings(startDateString, endDateString) {
  const startDate = new Date(`${startDateString}T00:00:00`);
  const endDate = new Date(`${endDateString}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function getCampaignMainDateString(campaign) {
  return campaign?.event_date || campaign?.end_date || campaign?.start_date || "";
}

function getExplicitPostDate(post) {
  const value = post?.scheduled_date || post?.publish_date || post?.recommended_date;
  return isValidDateString(value) ? value : "";
}

function getVerifiedDaysBeforeCampaignMainDate(campaign, post) {
  const explicitDate = getExplicitPostDate(post);
  const mainDate = getCampaignMainDateString(campaign);

  if (!explicitDate || !mainDate) return null;

  const days = getDaysBetweenDateStrings(explicitDate, mainDate);

  if (typeof days !== "number" || Number.isNaN(days)) return null;

  return Math.max(days, 0);
}

function clampDateString(dateString, minDate, maxDate) {
  let result = dateString;

  if (minDate && result < minDate) result = minDate;
  if (maxDate && result > maxDate) result = maxDate;

  return result;
}

function getDateRangePostPublishDate(campaign, post, index, total) {
  const explicitDate =
    post?.scheduled_date || post?.publish_date || post?.recommended_date;

  if (isValidDateString(explicitDate)) {
    return clampDateString(explicitDate, campaign.start_date, campaign.end_date);
  }

  const periodStart = campaign.start_date;
  const periodEnd = campaign.end_date;
  const periodLengthDays = Math.max(getDaysBetweenDateStrings(periodStart, periodEnd), 0);
  const timingAnchor = getCampaignPlanTimingAnchor(post, index, total);
  const daysBeforeEvent =
    typeof post?.days_before_event === "number" ? Math.max(Math.round(post.days_before_event), 0) : null;

  if (typeof daysBeforeEvent === "number") {
    return clampDateString(addDaysToDateString(periodEnd, -daysBeforeEvent), periodStart, periodEnd);
  }

  if (timingAnchor === "relationship_event" || timingAnchor === "end") {
    return periodEnd;
  }

  if (timingAnchor === "deadline_before_event") {
    return clampDateString(addDaysToDateString(periodEnd, -7), periodStart, periodEnd);
  }

  if (timingAnchor === "conversion_before_deadline") {
    return clampDateString(addDaysToDateString(periodEnd, -14), periodStart, periodEnd);
  }

  if (timingAnchor === "trust") {
    return addDaysToDateString(periodStart, Math.round(periodLengthDays * 0.55));
  }

  if (timingAnchor === "engagement" || timingAnchor === "middle") {
    return addDaysToDateString(periodStart, Math.round(periodLengthDays * 0.35));
  }

  if (timingAnchor === "before_start") {
    return periodStart;
  }

  if (total <= 1) {
    return periodStart;
  }

  return addDaysToDateString(
    periodStart,
    Math.round(periodLengthDays * (index / Math.max(total - 1, 1)))
  );
}

function getTimingAnchorHumanLabel(timingAnchor, locale = "en") {
  const labelsSv = {
    relationship_event: "relationspost",
    deadline_before_event: "sista realistiska påminnelse",
    conversion_before_deadline: "köpfönster",
    trust: "förtroende/process",
    engagement: "engagemang",
    middle: "mitt i kampanjen",
    start: "kampanjstart",
    before_start: "förberedande start",
    end: "avslutning",
  };

  const labelsEn = {
    relationship_event: "relationship post",
    deadline_before_event: "final realistic reminder",
    conversion_before_deadline: "buying window",
    trust: "trust/process",
    engagement: "engagement",
    middle: "mid-campaign",
    start: "campaign launch",
    before_start: "pre-launch",
    end: "closing post",
  };

  const labels = locale === "sv" ? labelsSv : labelsEn;
  return labels[timingAnchor] || labels.start;
}

function getPostPlanTimeLabel(post) {
  const time = post?.publish_time || post?.recommended_publish_time || post?.preferred_publish_time;

  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ""))) {
    return time;
  }

  return "";
}

function getCampaignPostTimingLabel(campaign, post, index, total, t, locale = "en") {
  const verifiedDaysBeforeEvent = getVerifiedDaysBeforeCampaignMainDate(
    campaign,
    post
  );
  const daysBeforeEvent =
    typeof verifiedDaysBeforeEvent === "number"
      ? verifiedDaysBeforeEvent
      : typeof post?.days_before_event === "number"
      ? post.days_before_event
      : null;

  if (campaign?.event_date && typeof daysBeforeEvent === "number") {
    const explicitPublishDate = getExplicitPostDate(post);
    const publishDate = explicitPublishDate || addDaysToDateString(campaign.event_date, -daysBeforeEvent);
    const publishDateLabel = formatDate(publishDate, locale);
    const timingAnchor = getCampaignPlanTimingAnchor(post, index, total);

    const timeLabel = getPostPlanTimeLabel(post);

    if (daysBeforeEvent === 0) {
      const greetingLabel = getSafeUiLabel(
        t,
        "calendar.publishEventGreeting",
        locale === "sv" ? "högtidsdagen som hälsning" : "main date as a greeting"
      );

      return [
        publishDateLabel,
        timeLabel ? `${locale === "sv" ? "kl" : "at"} ${timeLabel}` : "",
        greetingLabel,
      ]
        .filter(Boolean)
        .join(" · ");
    }

    const daysLabel = getSafeUiLabel(
      t,
      "common.daysBefore",
      locale === "sv" ? `${daysBeforeEvent} dagar innan` : `${daysBeforeEvent} days before`,
      { days: daysBeforeEvent }
    );

    if (timingAnchor === "deadline_before_event") {
      return [
        publishDateLabel,
        timeLabel ? `${locale === "sv" ? "kl" : "at"} ${timeLabel}` : "",
        daysLabel,
        locale === "sv" ? "sista beställningspåminnelse" : "final order reminder",
      ]
        .filter(Boolean)
        .join(" · ");
    }

    return [
      publishDateLabel,
      timeLabel ? `${locale === "sv" ? "kl" : "at"} ${timeLabel}` : "",
      daysLabel,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (campaign?.start_date && campaign?.end_date) {
    const timingAnchor = getCampaignPlanTimingAnchor(post, index, total);
    const publishDate = getDateRangePostPublishDate(campaign, post, index, total);
    const publishDateLabel = formatDate(publishDate, locale);
    const timeLabel = getPostPlanTimeLabel(post);
    const timingLabel = getTimingAnchorHumanLabel(timingAnchor, locale);
    const actualDaysBefore = Math.max(
      getDaysBetweenDateStrings(publishDate, campaign.end_date) || 0,
      0
    );
    const daysLabel = actualDaysBefore > 0
      ? locale === "sv"
        ? `${actualDaysBefore} dagar innan slutdatumet`
        : `${actualDaysBefore} days before final date`
      : "";

    return [
      publishDateLabel,
      timeLabel ? `${locale === "sv" ? "kl" : "at"} ${timeLabel}` : "",
      daysLabel,
      timingLabel,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return "";
}

const calendarFilterOptions = [
  { id: "all", label: "All campaigns" },
  { id: "fixed", label: "Fixed dates" },
  { id: "seasonal", label: "Seasonal" },
  { id: "theme", label: "Theme days" },
  { id: "shopping", label: "Shopping" },
];

function campaignMatchesCalendarFilter(campaign, filterId) {
  if (filterId === "all") return true;
  if (filterId === "fixed") return Boolean(campaign?.event_date);

  const eventType = String(campaign?.event_type || "").toLowerCase();
  const title = String(campaign?.title || "").toLowerCase();
  const text = `${eventType} ${title}`;

  if (filterId === "seasonal") {
    return /season|holiday|jul|christmas|summer|winter|autumn|spring/.test(text);
  }

  if (filterId === "theme") {
    return /theme|awareness|social|industry|local|day|temadag/.test(text);
  }

  if (filterId === "shopping") {
    return /shopping|retail|ecommerce|e-commerce|sale|black friday|cyber monday|gift|offer/.test(text);
  }

  return true;
}


export default function Calendar() {
  const { t, locale } = useUiText(["calendar"]);
  const [user, setUser] = useState(null);
  const [brandProfileId, setBrandProfileId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const todayDateString = getTodayDateString();
  const calendarYearNotice = getCalendarYearNotice(todayDateString, t);

  const visibleCampaigns = useMemo(() => {
    return campaigns.filter((campaign) =>
      campaignMatchesCalendarFilter(campaign, campaignFilter)
    );
  }, [campaigns, campaignFilter]);

  const selectedCampaign = useMemo(() => {
    return (
      visibleCampaigns.find((campaign) => campaign.id === selectedCampaignId) ||
      visibleCampaigns[0] ||
      null
    );
  }, [visibleCampaigns, selectedCampaignId]);

  const selectedCampaignPostPlan = useMemo(() => {
    if (!selectedCampaign) {
      return [];
    }

    return buildCampaignPostPlan(
      selectedCampaign,
      getCampaignRecommendedPostCount(selectedCampaign),
      t
    );
  }, [selectedCampaign, t]);

  const campaignStats = useMemo(() => {
    const total = campaigns.length;
    const fixedDate = campaigns.filter((campaign) => campaign.event_date).length;
    const flexible = campaigns.filter((campaign) => !campaign.event_date).length;

    return {
      total,
      fixedDate,
      flexible,
    };
  }, [campaigns]);

  useEffect(() => {
    async function loadCampaignPlanner() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUser(user);

      const { data: brands, error: brandListError } = await supabase
        .from("brand_profiles")
        .select("id, business_name, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (brandListError) {
        setMessage(brandListError.message);
        setLoading(false);
        return;
      }

      const brandList = brands || [];

      const selectedBrandId =
        typeof window !== "undefined"
          ? localStorage.getItem(getBrandStorageKey(user.id))
          : "";

      const selectedBrandExists = brandList.some(
        (brand) => brand.id === selectedBrandId
      );

      const fallbackBrand =
        brandList.find((brand) => brand.is_default) || brandList[0] || null;

      const brandToLoad = selectedBrandExists
        ? brandList.find((brand) => brand.id === selectedBrandId)
        : fallbackBrand;

      if (!brandToLoad?.id) {
        setMessage(t("calendar.noBrandProfile"));
        setLoading(false);
        return;
      }

      setBrandProfileId(brandToLoad.id);
      setBrandName(brandToLoad.business_name || t("common.currentBrand"));

      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(user.id), brandToLoad.id);
      }

      const todayDateString = getTodayDateString();
      const calendarYearsToShow = getCalendarYearsToShow(todayDateString);

      const { data, error } = await supabase
        .from("brand_campaign_opportunities")
        .select(
          "id, brand_profile_id, title, slug, description, country_code, market, language, industry, event_type, event_date, event_year, start_date, end_date, relevance_reason, relevance_score, sales_score, engagement_score, recommended_post_count, prompt_context, campaign_angles, post_plan, date_confidence, is_ai_generated, is_hidden, is_active, is_archived, generated_at, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .eq("brand_profile_id", brandToLoad.id)
        .eq("is_active", true)
        .eq("is_hidden", false)
        .eq("is_archived", false)
        .in("event_year", calendarYearsToShow)
        .order("event_year", { ascending: true })
        .order("event_date", { ascending: true, nullsFirst: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const upcomingCampaigns = (data || [])
        .filter((campaign) =>
          isUpcomingCampaign(campaign, todayDateString, calendarYearsToShow)
        )
        .sort(
          (firstCampaign, secondCampaign) =>
            getSortDate(firstCampaign) - getSortDate(secondCampaign)
        );

      setCampaigns(upcomingCampaigns);
      setSelectedCampaignId(upcomingCampaigns[0]?.id || "");
      setLoading(false);
    }

    loadCampaignPlanner();
  }, []);

  function handleCreateCampaign(campaign) {
    if (!campaign?.id) return;

    const normalizedCampaign = normalizeCampaignForStudioHandoff(campaign);
    const handoffBrandProfileId = normalizedCampaign.brand_profile_id || brandProfileId;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          CAMPAIGN_HANDOFF_STORAGE_KEY,
          JSON.stringify({
            campaign: {
              ...normalizedCampaign,
              brand_profile_id: handoffBrandProfileId,
            },
            brandProfileId: handoffBrandProfileId,
            createdAt: new Date().toISOString(),
          })
        );
      } catch {
        // URL parameters below are still enough for the normal database handoff.
      }
    }

    const params = new URLSearchParams({
      campaignOpportunityId: campaign.id,
      campaignId: campaign.id,
      brandProfileId: handoffBrandProfileId,
      mode: "campaign",
    });

    window.location.href = `/automation?${params.toString()}`;
  }

  if (loading) {
    return (
      <AppLayout active="calendar">
        <section className="empty-card">
          <h3>{t("calendar.loadingTitle")}</h3>
          <p>{t("calendar.loadingText")}</p>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="calendar">
      <div className="campaign-calendar-page">
        <header className="campaign-calendar-hero">
          <div>
            <p className="dashboard-eyebrow">{t("calendar.eyebrow")}</p>
            <h2>{t("calendar.heroTitle", { brandName })}</h2>
            <span>{t("calendar.heroText")}</span>
          </div>

          <div className="campaign-calendar-hero-card">
            <strong>{campaignStats.total}</strong>
            <span>{t("calendar.heroCardLabel")}</span>
            <p>{t("calendar.heroCardNote")}</p>
          </div>
        </header>

        {message && <p className="campaign-calendar-message">{message}</p>}

        <section className="campaign-calendar-year-note">
          <div>
            <p className="dashboard-eyebrow">{t("calendar.updateEyebrow")}</p>
            <strong>{calendarYearNotice}</strong>
          </div>
        </section>

        {campaigns.length === 0 ? (
          <section className="campaign-calendar-empty">
            <div>
              <p className="dashboard-eyebrow">{t("calendar.noUpcomingEyebrow")}</p>
              <h3>{t("calendar.noUpcomingTitle")}</h3>
              <p>{t("calendar.noUpcomingText")}</p>
            </div>

            <a href="/brand">{t("calendar.generateCalendar")}</a>
          </section>
        ) : (
          <>
            <section className="campaign-calendar-stat-grid">
              <div>
                <span>{t("calendar.statUpcoming")}</span>
                <strong>{campaignStats.total}</strong>
                <p>{t("calendar.statUpcomingText")}</p>
              </div>

              <div>
                <span>{t("calendar.statFixedDates")}</span>
                <strong>{campaignStats.fixedDate}</strong>
                <p>{t("calendar.statFixedDatesText")}</p>
              </div>

              <div>
                <span>{t("calendar.statFlexible")}</span>
                <strong>{campaignStats.flexible}</strong>
                <p>{t("calendar.statFlexibleText")}</p>
              </div>
            </section>

            <section className="campaign-calendar-layout">
              <div className="campaign-calendar-main">
                <div className="campaign-calendar-section-heading">
                  <div>
                    <p className="dashboard-eyebrow">{t("calendar.opportunitiesEyebrow")}</p>
                    <h3>{t("calendar.chooseCampaignTitle")}</h3>
                  </div>

                  <span>{brandName}</span>
                </div>

                <div className="campaign-calendar-filter-row">
                  {calendarFilterOptions.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={campaignFilter === option.id ? "active" : ""}
                      onClick={() => setCampaignFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="campaign-card-grid">
                  {visibleCampaigns.length === 0 && (
                    <div className="campaign-calendar-filter-empty">
                      <strong>No campaigns in this filter</strong>
                      <p>Choose another filter to see more campaign opportunities.</p>
                    </div>
                  )}

                  {visibleCampaigns.map((campaign) => {
                    const isSelected = selectedCampaign?.id === campaign.id;

                    return (
                      <article
                        key={campaign.id}
                        className={`campaign-card ${isSelected ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedCampaignId(campaign.id);
                          }
                        }}
                      >
                        <div className="campaign-card-content">
                          <CampaignGlyph campaign={campaign} />

                          <div className="campaign-card-copy">
                            <div className="campaign-card-tags">
                              <span>{getEventTypeLabel(campaign.event_type, t)}</span>
                            </div>
                            <h4>{campaign.title}</h4>
                            <p>{campaign.description}</p>
                          </div>
                        </div>

                        <div className="campaign-card-side">
                          <strong className="campaign-card-date">
                            {getCampaignDateLabel(campaign, t, locale)}
                          </strong>

                          <div className="campaign-card-meta">
                            <span>
                              {getCampaignRecommendedPostCount(campaign)} {t("common.posts")}
                            </span>
                            <span>{getConfidenceLabel(campaign.date_confidence, t)}</span>
                          </div>

                          <button
                            type="button"
                            className="campaign-card-create-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCreateCampaign(campaign);
                            }}
                          >
                            {t("common.createPosts")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <aside className="campaign-calendar-sidebar">
                {selectedCampaign && (
                  <div className="campaign-detail-card">
                    <div className="campaign-detail-header">
                      <CampaignGlyph
                        campaign={selectedCampaign}
                        className="campaign-detail-glyph"
                      />

                      <div>
                        <p className="dashboard-eyebrow">{t("calendar.selectedCampaign")}</p>
                        <h3>{selectedCampaign.title}</h3>
                      </div>

                      <span>{getEventTypeLabel(selectedCampaign.event_type, t)}</span>
                    </div>

                    <div className="campaign-detail-date">
                      <strong>{getCampaignDateLabel(selectedCampaign, t, locale)}</strong>
                      <span>
                        {getConfidenceLabel(selectedCampaign.date_confidence, t)}
                      </span>
                    </div>

                    <div className="campaign-detail-score-grid">
                      <div>
                        <span>{t("calendar.relevance")}</span>
                        <strong>{selectedCampaign.relevance_score || 3}/5</strong>
                      </div>

                      <div>
                        <span>{t("calendar.sales")}</span>
                        <strong>{selectedCampaign.sales_score || 3}/5</strong>
                      </div>

                      <div>
                        <span>{t("calendar.engagement")}</span>
                        <strong>
                          {selectedCampaign.engagement_score || 3}/5
                        </strong>
                      </div>
                    </div>

                    <div className="campaign-detail-section">
                      <h4>{t("calendar.whyItFits")}</h4>
                      <p>
                        {selectedCampaign.relevance_reason ||
                          t("calendar.whyItFitsFallback")}
                      </p>
                    </div>

                    <div className="campaign-detail-section">
                      <h4>{t("calendar.campaignInstruction")}</h4>
                      <p>
                        {selectedCampaign.prompt_context ||
                          t("calendar.campaignInstructionFallback")}
                      </p>
                    </div>

                    {Array.isArray(selectedCampaign.campaign_angles) &&
                      selectedCampaign.campaign_angles.length > 0 && (
                        <div className="campaign-detail-section">
                          <h4>{t("calendar.suggestedAngles")}</h4>

                          <div className="campaign-angle-list">
                            {selectedCampaign.campaign_angles
                              .slice(0, 5)
                              .map((angle, index) => (
                                <span key={`${angle}-${index}`}>{angle}</span>
                              ))}
                          </div>
                        </div>
                      )}

                    <div className="campaign-detail-section">
                      <h4>{t("calendar.recommendedPostPlan")}</h4>

                      <p className="campaign-post-plan-note">
                        {t("calendar.recommendedPostPlanNote", {
                          count: getCampaignRecommendedPostCount(selectedCampaign),
                        })}
                      </p>

                      <div className="campaign-post-plan">
                        {selectedCampaignPostPlan.map((post, index) => (
                          <div key={`${post.role || "campaign-post"}-${index}`}>
                            <span>{index + 1}</span>
                            <div>
                              <strong>{post.role || t("common.post", { number: index + 1 })}</strong>
                              <p>{post.purpose || t("calendar.postPurposeFallback")}</p>

                              {getCampaignPostTimingLabel(
                                selectedCampaign,
                                post,
                                index,
                                selectedCampaignPostPlan.length,
                                t,
                                locale
                              ) && (
                                <small>
                                  {getCampaignPostTimingLabel(
                                    selectedCampaign,
                                    post,
                                    index,
                                    selectedCampaignPostPlan.length,
                                    t,
                                    locale
                                  )}
                                </small>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="campaign-create-button"
                      onClick={() => handleCreateCampaign(selectedCampaign)}
                    >
                      {t("common.createPosts")}
                    </button>

                    <p className="campaign-calendar-disclaimer">
                      {t("calendar.disclaimer")}
                    </p>
                  </div>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
