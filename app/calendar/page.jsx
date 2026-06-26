"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

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

function getEventTypeLabel(value) {
  return String(value || "campaign")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getConfidenceLabel(value, t) {
  const confidence = String(value || "medium").toLowerCase();

  if (confidence === "high") return t("calendar.highConfidence");
  if (confidence === "low") return t("calendar.lowConfidence");

  return t("calendar.mediumConfidence");
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
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCampaignLeadTimeProfile(campaign) {
  const text = getCampaignStrategicText(campaign);
  const hasDeliveryOrProductionSignals = /custom|personal|personalized|personalised|made[\s-]?to[\s-]?order|bespoke|tailor|tailored|print|printed|portrait|engraved|engraving|production|produce|delivery|deliver|shipping|ship|order in time|pre[\s-]?order|lead time|appointment|booking|bookable|reservation|consultation|quote|install|installation|kurs|bokning|beställ|leverans|personlig|personliga|anpassad|skräddarsydd|tryck|porträtt|gravyr|produktion|leveranstid|beställningstid/.test(text);
  const hasFastCommerceSignals = /instant|digital download|same[\s-]?day|pickup|pick[\s-]?up|walk[\s-]?in|in stock|ready[\s-]?made|available now|retail|restaurant|cafe|menu|drop[\s-]?in/.test(text);

  return {
    isLeadTimeSensitive: hasDeliveryOrProductionSignals && !hasFastCommerceSignals,
  };
}

function isCustomerActionDeadlineSensitiveCampaign(campaign) {
  const text = getCampaignStrategicText(campaign);
  return /gift|gifts|present|presents|gåva|gåvor|presenter|order|orders|booking|bookings|appointment|reservation|delivery|shipping|ship|printed|print|portrait|custom|personal|personalized|personalised|made[\s-]?to[\s-]?order|bespoke|handmade|limited availability|limited capacity|beställ|bokning|leverans|tryck|porträtt|personlig|personliga|anpassad|skräddarsydd/.test(text);
}

function shouldUseEventGreetingPost(campaign, count) {
  const safeCount = Math.max(Math.round(Number(count) || 1), 1);
  return Boolean(campaign?.event_date) && safeCount >= 4;
}

function getBestPracticeDaysBeforeEvent(campaign, count) {
  const safeCount = Math.max(Math.min(Math.round(Number(count) || 1), 7), 1);
  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);
  const isActionDeadlineSensitive =
    leadTimeProfile.isLeadTimeSensitive ||
    isCustomerActionDeadlineSensitiveCampaign(campaign);
  const includeEventGreeting = shouldUseEventGreetingPost(campaign, safeCount);

  if (isActionDeadlineSensitive) {
    if (includeEventGreeting) {
      const patterns = {
        4: [21, 14, 8, 0],
        5: [28, 21, 14, 8, 0],
        6: [30, 21, 16, 12, 8, 0],
        7: [35, 28, 21, 16, 12, 8, 0],
      };
      return patterns[safeCount] || patterns[5];
    }

    const patterns = {
      1: [8],
      2: [14, 8],
      3: [21, 14, 8],
    };
    return patterns[safeCount] || patterns[3];
  }

  if (includeEventGreeting) {
    const patterns = {
      4: [14, 10, 4, 0],
      5: [21, 14, 7, 3, 0],
      6: [21, 14, 10, 7, 3, 0],
      7: [28, 21, 14, 10, 7, 3, 0],
    };
    return patterns[safeCount] || patterns[5];
  }

  const patterns = {
    1: [2],
    2: [7, 2],
    3: [14, 7, 3],
  };
  return patterns[safeCount] || patterns[3];
}

function getBestPracticeTimingAnchor(index, total) {
  if (shouldUseEventGreetingPost({ event_date: true }, total) && index === total - 1) {
    return "relationship_event";
  }

  if (index === total - 1 || index === total - 2) {
    return "deadline_before_event";
  }

  if (index >= Math.max(1, total - 3)) {
    return "conversion_before_deadline";
  }

  return "start";
}

function buildCampaignPostPlan(campaign, recommendedCount, t) {
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

  const fallbackPostPlan = buildFallbackCampaignPlan(recommendedCount, t);

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

  const sortedMergedPlan = mergedPlan.sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });

  if (!campaign?.event_date) {
    return sortedMergedPlan;
  }

  const bestPracticeDays = getBestPracticeDaysBeforeEvent(
    campaign,
    recommendedCount
  );

  return sortedMergedPlan.map((post, index) => {
    const daysBeforeEvent = bestPracticeDays[index] ?? 0;
    return {
      ...post,
      days_before_event: daysBeforeEvent,
      timing_anchor:
        post.timing_anchor || getBestPracticeTimingAnchor(index, recommendedCount),
    };
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

function getCampaignPostTimingLabel(campaign, post, index, total, t, locale = "en") {
  const daysBeforeEvent =
    typeof post?.days_before_event === "number" ? post.days_before_event : null;

  if (campaign?.event_date && typeof daysBeforeEvent === "number") {
    const publishDate = addDaysToDateString(campaign.event_date, -daysBeforeEvent);
    const publishDateLabel = formatDate(publishDate, locale);
    const timingAnchor = getCampaignPlanTimingAnchor(post, index, total);

    if (daysBeforeEvent === 0) {
      const greetingLabel = getSafeUiLabel(
        t,
        "calendar.publishEventGreeting",
        locale === "sv" ? "högtidsdagen som hälsning" : "main date as a greeting"
      );

      return `${publishDateLabel} · ${greetingLabel}`;
    }

    const daysLabel = getSafeUiLabel(
      t,
      "common.daysBefore",
      locale === "sv" ? `${daysBeforeEvent} dagar innan` : `${daysBeforeEvent} days before`,
      { days: daysBeforeEvent }
    );

    if (timingAnchor === "deadline_before_event") {
      return `${publishDateLabel} · ${daysLabel} · ${
        locale === "sv" ? "sista beställningspåminnelse" : "final order reminder"
      }`;
    }

    return `${publishDateLabel} · ${daysLabel}`;
  }

  if (campaign?.start_date && campaign?.end_date) {
    const timingAnchor = getCampaignPlanTimingAnchor(post, index, total);

    if (timingAnchor === "relationship_event") {
      return getSafeUiLabel(
        t,
        "calendar.publishSoftFinalDate",
        locale === "sv"
          ? "Publicera på slutdatumet som mjuk relationspost"
          : "Publish on the final date as a softer relationship post"
      );
    }

    if (timingAnchor === "deadline_before_event") {
      return getSafeUiLabel(
        t,
        "calendar.publishBeforeDeadline",
        locale === "sv"
          ? "Publicera före den realistiska deadline som gäller"
          : "Publish before the realistic deadline"
      );
    }

    return getSafeUiLabel(
      t,
      "calendar.publishWarmupCampaign",
      locale === "sv" ? "Publicera som uppvärmning" : "Publish as a warm-up post"
    );
  }

  return "";
}


export default function Calendar() {
  const { t, locale } = useUiText(["calendar"]);
  const [user, setUser] = useState(null);
  const [brandProfileId, setBrandProfileId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const todayDateString = getTodayDateString();
  const calendarYearNotice = getCalendarYearNotice(todayDateString, t);

  const selectedCampaign = useMemo(() => {
    return (
      campaigns.find((campaign) => campaign.id === selectedCampaignId) ||
      campaigns[0] ||
      null
    );
  }, [campaigns, selectedCampaignId]);

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
          "id, title, slug, description, country_code, market, language, industry, event_type, event_date, event_year, start_date, end_date, relevance_reason, relevance_score, sales_score, engagement_score, recommended_post_count, prompt_context, campaign_angles, post_plan, date_confidence, is_ai_generated, is_hidden, is_active, is_archived, generated_at, created_at, updated_at"
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

    const params = new URLSearchParams({
      campaignOpportunityId: campaign.id,
      brandProfileId,
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

                <div className="campaign-card-grid">
                  {campaigns.map((campaign) => {
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
                        <div className="campaign-card-top">
                          <span>{getEventTypeLabel(campaign.event_type)}</span>
                          <strong>{getCampaignDateLabel(campaign, t, locale)}</strong>
                        </div>

                        <h4>{campaign.title}</h4>

                        <p>{campaign.description}</p>

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
                      </article>
                    );
                  })}
                </div>
              </div>

              <aside className="campaign-calendar-sidebar">
                {selectedCampaign && (
                  <div className="campaign-detail-card">
                    <div className="campaign-detail-header">
                      <div>
                        <p className="dashboard-eyebrow">{t("calendar.selectedCampaign")}</p>
                        <h3>{selectedCampaign.title}</h3>
                      </div>

                      <span>{getEventTypeLabel(selectedCampaign.event_type)}</span>
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
