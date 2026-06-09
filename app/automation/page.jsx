"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_TIME_ZONE = "Europe/Stockholm";

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
    id: "tips",
    label: "Tips & advice",
    description: "Teach the audience something useful.",
    prompt:
      "Create a useful social media post that teaches the audience one practical tip related to this business. Make it specific, helpful and easy to understand. Avoid sounding like an advertisement.",
    imagePrompt:
      "Create a professional image that visually supports a helpful tip. Make it relevant to the business, clear, polished and not generic.",
  },
  {
    id: "mistakes",
    label: "Common mistakes",
    description: "Show expertise and help customers avoid problems.",
    prompt:
      "Create a social media post about common mistakes customers often make related to this business, product or service. Explain them in a helpful and non-judgmental way, and position the business as knowledgeable and trustworthy.",
    imagePrompt:
      "Create a professional image that suggests common mistakes or things to avoid in a tasteful, helpful and non-negative way.",
  },
  {
    id: "faq",
    label: "FAQ / Questions",
    description: "Answer a common customer question.",
    prompt:
      "Create a social media post that answers a common customer question related to this business. Make the answer clear, trustworthy and useful. The post should reduce uncertainty and make it easier for the customer to take the next step.",
    imagePrompt:
      "Create a professional image that supports a question-and-answer or guidance theme, without adding readable text.",
  },
  {
    id: "behind_scenes",
    label: "Behind the scenes",
    description: "Build trust by showing the process.",
    prompt:
      "Create a behind-the-scenes social media post for this business. Show what happens in the process, preparation, workday or service delivery. Make it feel authentic, trustworthy and interesting.",
    imagePrompt:
      "Create an authentic behind-the-scenes style image connected to the business or service. Make it natural, professional and trustworthy.",
  },
  {
    id: "checklist",
    label: "Checklist",
    description: "Create a save-worthy post.",
    prompt:
      "Create a practical checklist-style social media post related to this business. Make it easy to save, useful and specific. Keep the structure clear and helpful.",
    imagePrompt:
      "Create a professional image that visually supports a checklist or preparation theme, without adding readable text.",
  },
  {
    id: "service_focus",
    label: "Service in focus",
    description: "Explain one service without hard selling.",
    prompt:
      "Create a social media post that explains one service or offer from this business in a clear and helpful way. Focus on the value for the customer, not hard selling.",
    imagePrompt:
      "Create a professional image that visualizes the service or customer benefit in a believable and polished way.",
  },
  {
    id: "case_example",
    label: "Customer case / example",
    description: "Use examples to build trust.",
    prompt:
      "Create a social media post based on a realistic customer case or example for this business. Do not invent sensitive personal details. Make it feel credible, useful and trust-building.",
    imagePrompt:
      "Create a professional image that supports a customer example or real-life scenario, without showing private or sensitive details.",
  },
  {
    id: "myth_fact",
    label: "Myth vs fact",
    description: "Correct misunderstandings.",
    prompt:
      "Create a myth-vs-fact style social media post related to this business or industry. Correct a common misunderstanding and explain the truth in a simple, trustworthy way.",
    imagePrompt:
      "Create a professional image that suggests clarity, understanding or comparison, without adding readable text.",
  },
  {
    id: "local",
    label: "Local connection",
    description: "Make the post feel locally relevant.",
    prompt:
      "Create a social media post with a local angle for this business. Make it feel relevant to the local community, season, area or everyday customer situation. Keep it natural and not forced.",
    imagePrompt:
      "Create a professional image with a local or community feeling that fits the business, without using specific landmarks unless clearly provided.",
  },
  {
    id: "seasonal",
    label: "Seasonal post",
    description: "Connect content to current timing.",
    prompt:
      "Create a seasonal or timely social media post for this business. Connect the message to the current season, common customer needs or relevant timing in a natural way.",
    imagePrompt:
      "Create a professional seasonal image that fits the business and timing, avoiding clichés and readable text.",
  },
  {
    id: "comparison",
    label: "Comparison",
    description: "Explain differences clearly.",
    prompt:
      "Create a social media post that compares two options, approaches or choices related to this business. Help the customer understand the difference and make a better decision.",
    imagePrompt:
      "Create a professional image that suggests comparison or decision-making in a clean and tasteful way, without split-screen text.",
  },
  {
    id: "mini_guide",
    label: "Mini-guide",
    description: "Give deeper value in one post.",
    prompt:
      "Create a mini-guide social media post related to this business. Teach the audience something useful in a structured way with clear steps or sections.",
    imagePrompt:
      "Create a professional image that supports a guide or learning theme, clean and easy to understand without readable text.",
  },
];

const recommendedContentTypeIds = [
  "tips",
  "mistakes",
  "behind_scenes",
  "faq",
  "checklist",
];

function makeSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getContentTypeById(typeId) {
  return contentTypes.find((type) => type.id === typeId) || null;
}

function createSlot(weekday = "Monday", overrides = {}) {
  return {
    id: makeSlotId(),
    weekday,
    publishTime: overrides.publishTime || "08:35",
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
  };
}

function createSlotFromContentType(type, index = 0) {
  const weekday = weekdays[index % weekdays.length];

  return createSlot(weekday, {
    prompt: type.prompt,
    imagePrompt: type.imagePrompt,
    contentTypeId: type.id,
    contentTypeLabel: type.label,
  });
}

function createRecommendedSlots() {
  return recommendedContentTypeIds
    .map(getContentTypeById)
    .filter(Boolean)
    .map((type, index) => createSlotFromContentType(type, index));
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

function getDatePartsInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
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

function getNextWeeklyRunAtIso(
  weekday,
  publishTime,
  timeZone = DEFAULT_TIME_ZONE,
  now = new Date()
) {
  const normalizedPublishTime = normalizeTime(publishTime);

  if (!weekday || !normalizedPublishTime) {
    return null;
  }

  const [hourValue, minuteValue] = normalizedPublishTime.split(":");

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

  const targetWeekdayIndex = dayOrder.findIndex(
    (day) => day.toLowerCase() === String(weekday).toLowerCase()
  );

  if (targetWeekdayIndex === -1) {
    return null;
  }

  const currentWeekday = getWeekdayInTimeZone(now, timeZone);

  const currentWeekdayIndex = dayOrder.findIndex(
    (day) => day.toLowerCase() === String(currentWeekday).toLowerCase()
  );

  if (currentWeekdayIndex === -1) {
    return null;
  }

  const currentTime = getTimeHHMMInTimeZone(now, timeZone);

  let daysUntilNextRun =
    (targetWeekdayIndex - currentWeekdayIndex + 7) % 7;

  if (daysUntilNextRun === 0 && normalizedPublishTime <= currentTime) {
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

function getInitialNextRunAtIso({
  scheduleType,
  weekday,
  publishTime,
  runDate,
  timeZone,
}) {
  if (scheduleType === "once") {
    return getOneTimeRunAtIso(runDate, publishTime, timeZone);
  }

  if (scheduleType === "weekly") {
    return getNextWeeklyRunAtIso(weekday, publishTime, timeZone);
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

export default function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [creditBalance, setCreditBalance] = useState(null);

  const [slots, setSlots] = useState(() => createRecommendedSlots());
  const [planCreationMode, setPlanCreationMode] = useState("auto");
  const [selectedContentTypeIds, setSelectedContentTypeIds] = useState(
    recommendedContentTypeIds
  );

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scheduleType, setScheduleType] = useState("weekly");
  const [runDate, setRunDate] = useState("");

  const [planName, setPlanName] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("Auto");
  const [postType, setPostType] = useState("Offer");
  const [length, setLength] = useState("Medium");
  const [ctaType, setCtaType] = useState("Learn more");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);

  useEffect(() => {
    setTimeZone(getBrowserTimeZone());
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

  async function loadRules() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
    } else {
      const sortedRules = (data || []).sort((a, b) => {
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

      setRules(sortedRules);
    }

    const { data: balanceData, error: balanceError } = await supabase
      .from("user_credit_balances")
      .select("credits_remaining, monthly_credit_limit, plan_name")
      .eq("user_id", user.id)
      .single();

    if (!balanceError && balanceData) {
      setCreditBalance(balanceData);
    }

    setLoading(false);
  }

  function updateSlot(slotId, field, value) {
    setSlots((currentSlots) =>
      currentSlots.map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      )
    );
  }

  function addSlot() {
    setSlots((currentSlots) => [...currentSlots, createSlot()]);
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

    setSlots((currentSlots) =>
      currentSlots.filter((slot) => slot.id !== slotId)
    );
  }

  function changePlanCreationMode(mode) {
    setMessage("");
    setPlanCreationMode(mode);

    if (mode === "auto") {
      setSelectedContentTypeIds(recommendedContentTypeIds);
      setSlots(createRecommendedSlots());
      return;
    }

    if (mode === "select") {
      const initialTypeIds = selectedContentTypeIds.length
        ? selectedContentTypeIds
        : recommendedContentTypeIds;

      setSelectedContentTypeIds(initialTypeIds);
      setSlots(
        initialTypeIds
          .map(getContentTypeById)
          .filter(Boolean)
          .map((type, index) => createSlotFromContentType(type, index))
      );
      return;
    }

    setSelectedContentTypeIds([]);
    setSlots([createSlot("Monday")]);
  }

  function toggleContentType(typeId) {
    setMessage("");

    setSelectedContentTypeIds((currentTypeIds) => {
      const nextTypeIds = currentTypeIds.includes(typeId)
        ? currentTypeIds.filter((id) => id !== typeId)
        : [...currentTypeIds, typeId];

      const nextSlots = nextTypeIds
        .map(getContentTypeById)
        .filter(Boolean)
        .map((type, index) => createSlotFromContentType(type, index));

      setSlots(nextSlots.length ? nextSlots : [createSlot("Monday")]);

      return nextTypeIds;
    });
  }

  function applyRecommendedPlan() {
    setMessage("");
    setPlanCreationMode("auto");
    setSelectedContentTypeIds(recommendedContentTypeIds);
    setSlots(createRecommendedSlots());
  }

  async function savePlan() {
    setMessage("");

    if (scheduleType === "once" && !runDate) {
      setMessage("Choose a date for the one-time plan.");
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

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const selectedTimeZone = timeZone || DEFAULT_TIME_ZONE;

    const rows = slots.map((slot) => ({
      user_id: user.id,
      name:
        planName ||
        slot.contentTypeLabel ||
        `${slot.weekday} ${slot.publishTime}`,
      weekday: slot.weekday,
      publish_time: slot.publishTime,
      prompt: slot.prompt,
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
      run_date: scheduleType === "once" ? runDate : null,
      timezone: selectedTimeZone,
      next_run_at: getInitialNextRunAtIso({
        scheduleType,
        weekday: slot.weekday,
        publishTime: slot.publishTime,
        runDate,
        timeZone: selectedTimeZone,
      }),
      approval_required: approvalRequired,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("automation_rules").insert(rows);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(
        `${rows.length} planned post${rows.length === 1 ? "" : "s"} saved.`
      );

      setPlanName("");
      setLanguage("Auto");

      if (planCreationMode === "auto") {
        setSelectedContentTypeIds(recommendedContentTypeIds);
        setSlots(createRecommendedSlots());
      } else if (planCreationMode === "select") {
        setSelectedContentTypeIds([]);
        setSlots([createSlot("Monday")]);
      } else {
        setSlots([createSlot("Monday")]);
      }

      await loadRules();
    }

    setSaving(false);
  }

  async function deleteRule(ruleId) {
    const confirmDelete = window.confirm("Delete this planned post?");
    if (!confirmDelete) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", ruleId)
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRules((currentRules) =>
      currentRules.filter((rule) => rule.id !== ruleId)
    );
  }

  return (
    <AppLayout active="automation">
      <div className="automation-page">
        <header className="automation-heading">
          <div>
            <h2>Build your weekly content plan</h2>
          </div>

          <span className="guide-pill">Step-by-step setup guide</span>
        </header>

        <section className="automation-stats">
          <div className="automation-stat-card">
            <div>
              <span>Credits remaining</span>
              <strong>{creditBalance?.credits_remaining ?? "—"}</strong>
              {creditBalance?.plan_name && (
                <small>{creditBalance.plan_name} plan</small>
              )}
            </div>
            <div className="stat-icon">💳</div>
          </div>

          <div className="automation-stat-card">
            <div>
              <span>New plan credits</span>
              <strong>{plannedCredits}</strong>
            </div>
            <div className="stat-icon">★</div>
          </div>

          <div className="automation-stat-card">
            <div>
              <span>Estimated monthly use</span>
              <strong>{monthlyEstimate}</strong>
            </div>
            <div className="stat-icon">▮</div>
          </div>
        </section>

        <section className="automation-help">
          <div className="help-icon">💡</div>
          <div>
            <h3>New to automation?</h3>
            <p>
              Watch our 2-minute video guide to learn how to schedule recurring
              posts.
            </p>
          </div>
          <button type="button" className="play-button">
            ▶
          </button>
        </section>

        <section className="setup-card">
          <div className="setup-title">
            <p>Step 1</p>
            <h3>Choose how you want to create this plan</h3>
            <span>
              Start simple with an automatic weekly plan, choose content types
              yourself, or write your own manual prompts.
            </span>
          </div>

          <div className="creation-mode-grid">
            <button
              type="button"
              className={`creation-mode-card ${
                planCreationMode === "auto" ? "active" : ""
              }`}
              onClick={() => changePlanCreationMode("auto")}
            >
              <span>Recommended</span>
              <strong>Auto-plan</strong>
              <p>
                Spreelo creates a balanced weekly mix for you. Best for most
                customers.
              </p>
            </button>

            <button
              type="button"
              className={`creation-mode-card ${
                planCreationMode === "select" ? "active" : ""
              }`}
              onClick={() => changePlanCreationMode("select")}
            >
              <span>Flexible</span>
              <strong>Choose content types</strong>
              <p>
                Pick the types of posts you want. Spreelo writes the prompts in
                the background.
              </p>
            </button>

            <button
              type="button"
              className={`creation-mode-card ${
                planCreationMode === "manual" ? "active" : ""
              }`}
              onClick={() => changePlanCreationMode("manual")}
            >
              <span>Advanced</span>
              <strong>Manual prompt</strong>
              <p>
                Write your own prompt for every planned post and control the
                details yourself.
              </p>
            </button>
          </div>

          {planCreationMode === "auto" && (
            <div className="mode-info-box">
              <div>
                <strong>Recommended weekly plan</strong>
                <p>
                  Spreelo will start with 5 posts per week: tips, common
                  mistakes, behind the scenes, FAQ and checklist. You can still
                  edit every row below before saving.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={applyRecommendedPlan}
              >
                Reset to recommended
              </button>
            </div>
          )}

          {planCreationMode === "select" && (
            <div className="content-type-section">
              <div className="content-type-header">
                <div>
                  <strong>Select content types</strong>
                  <p>
                    Choose one or more post types. Each selected type becomes a
                    planned post with a ready-made prompt.
                  </p>
                </div>
                <span>{selectedContentTypeIds.length} selected</span>
              </div>

              <div className="content-type-grid">
                {contentTypes.map((type) => {
                  const isSelected = selectedContentTypeIds.includes(type.id);

                  return (
                    <button
                      type="button"
                      key={type.id}
                      className={`content-type-card ${
                        isSelected ? "active" : ""
                      }`}
                      onClick={() => toggleContentType(type.id)}
                    >
                      <strong>{type.label}</strong>
                      <p>{type.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {planCreationMode === "manual" && (
            <div className="mode-info-box">
              <div>
                <strong>Manual prompt mode</strong>
                <p>
                  Write exactly what each post should be about in the planned
                  post rows below. This is best for advanced users or very
                  specific campaigns.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="setup-card">
          <div className="setup-title">
            <p>Step 2</p>
            <h3>Choose how this plan should run</h3>
            <span>Define the foundation of your automated schedule.</span>
          </div>

          <div className="setup-row">
            <div>
              <label>Plan type</label>
              <div className="plan-toggle">
                <button
                  type="button"
                  className={scheduleType === "weekly" ? "active" : ""}
                  onClick={() => setScheduleType("weekly")}
                >
                  Repeats every week
                </button>
                <button
                  type="button"
                  className={scheduleType === "once" ? "active" : ""}
                  onClick={() => setScheduleType("once")}
                >
                  One-time plan
                </button>
              </div>
            </div>

            {scheduleType === "once" && (
              <div>
                <label>Run date</label>
                <input
                  className="input"
                  type="date"
                  value={runDate}
                  onChange={(event) => setRunDate(event.target.value)}
                />
              </div>
            )}

            <div className="wide-field">
              <label>Plan name</label>
              <input
                className="input"
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
                placeholder="Example: Weekly social media plan"
              />
            </div>
          </div>
        </section>

        <section className="setup-card">
          <div className="setup-title">
            <p>Step 3</p>
            <h3>Add planned posts</h3>
            <span>Visually map out your weekly content.</span>
          </div>

          <div className="planned-list">
            {slots.map((slot, index) => (
              <article className="planned-row" key={slot.id}>
                <div className="planned-number">{index + 1}</div>

                <div className="planned-content">
                  <div className="planned-top">
                    <div>
                      <p>Planned post {index + 1}</p>
                      <h4>
                        {slot.weekday} · {slot.publishTime}
                        {slot.contentTypeLabel
                          ? ` · ${slot.contentTypeLabel}`
                          : ""}
                      </h4>
                    </div>
                  </div>

                  <div className="planned-fields">
                    <select
                      className="input"
                      value={slot.weekday}
                      onChange={(event) =>
                        updateSlot(slot.id, "weekday", event.target.value)
                      }
                    >
                      {weekdays.map((day) => (
                        <option key={day}>{day}</option>
                      ))}
                    </select>

                    <input
                      className="input time-input"
                      type="time"
                      value={slot.publishTime}
                      onChange={(event) =>
                        updateSlot(slot.id, "publishTime", event.target.value)
                      }
                    />

                    <input
                      className="input prompt-input"
                      value={slot.prompt}
                      onChange={(event) =>
                        updateSlot(slot.id, "prompt", event.target.value)
                      }
                      placeholder={
                        planCreationMode === "manual"
                          ? "Example: Create a post about our new service"
                          : "Prompt is created from the selected content type and can be edited"
                      }
                    />
                  </div>

                  <div className="planned-bottom">
                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={slot.generateImage}
                        onChange={(event) =>
                          updateSlot(
                            slot.id,
                            "generateImage",
                            event.target.checked
                          )
                        }
                      />
                      Generate AI image for this post
                    </label>

                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={slot.includeEmojis}
                        onChange={(event) =>
                          updateSlot(
                            slot.id,
                            "includeEmojis",
                            event.target.checked
                          )
                        }
                      />
                      Include emojis
                    </label>

                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={slot.includeHashtags}
                        onChange={(event) =>
                          updateSlot(
                            slot.id,
                            "includeHashtags",
                            event.target.checked
                          )
                        }
                      />
                      Include hashtags
                    </label>

                    <span className="credit-chip">
                      {slot.generateImage ? "3 Credits" : "1 Credit"}
                    </span>

                    <div className="row-actions">
                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => duplicateSlot(slot.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="tiny-button danger"
                        onClick={() => removeSlot(slot.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {slot.generateImage && (
                    <textarea
                      className="image-prompt-box"
                      value={slot.imagePrompt}
                      onChange={(event) =>
                        updateSlot(slot.id, "imagePrompt", event.target.value)
                      }
                      placeholder="Visual direction for the image, for example: bright modern photo style, clean background, warm light."
                    />
                  )}
                </div>
              </article>
            ))}
          </div>

          <button type="button" className="add-plan-button" onClick={addSlot}>
            + Add another planned post
          </button>
        </section>

        <section className="settings-card">
          <div className="setup-title">
            <p>Step 4</p>
            <h3>Default post settings</h3>
            <span>These settings apply to all rows in this plan.</span>
          </div>

          <div className="settings-panel">
            <div className="setting-tile">
              <span>Platform</span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option>Instagram</option>
                <option>Facebook</option>
                <option>LinkedIn</option>
              </select>
            </div>

            <div className="setting-tile">
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
            </div>

            <div className="setting-tile">
              <span>Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="Auto">Auto-detect from prompt</option>
                <option value="English">English</option>
              </select>
              <small style={{ color: "#6b7280", lineHeight: "1.5" }}>
                Auto-detect means Spreelo writes in the same language as your
                prompt. Choose English if you want the post in English
                regardless of your prompt language.
              </small>
            </div>

            <div className="setting-tile">
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
            </div>

            <div className="setting-tile">
              <span>Length</span>
              <select
                value={length}
                onChange={(event) => setLength(event.target.value)}
              >
                <option>Short</option>
                <option>Medium</option>
                <option>Long</option>
              </select>
            </div>

            <div className="setting-tile">
              <span>CTA type</span>
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
            </div>

            <div className="setting-tile">
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
            </div>

            <div className="setting-tile">
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
            </div>

            <div className="setting-tile summary">
              <span>Total planned posts</span>
              <strong>{slots.length}</strong>
            </div>

            <div className="setting-tile summary">
              <span>Text only</span>
              <strong>{textOnlyCount}</strong>
            </div>

            <div className="setting-tile summary">
              <span>Text + image</span>
              <strong>{imageCount}</strong>
            </div>

            <div className="setting-tile summary">
              <span>Credits</span>
              <strong>{plannedCredits}</strong>
            </div>

            {creditBalance && !hasEnoughCredits && (
              <div className="credit-warning">
                This plan needs {plannedCredits} credits, but you only have{" "}
                {creditBalance.credits_remaining} credits remaining.
              </div>
            )}

            <button
              type="button"
              className="save-plan-button"
              onClick={savePlan}
              disabled={saving || !hasEnoughCredits}
            >
              {saving ? "Saving..." : "💾 Save content plan"}
            </button>
          </div>

          {message && <p className="login-message">{message}</p>}
        </section>

        <section className="saved-card">
          <div className="setup-title">
            <p>Saved plans</p>
            <h3>Automation rules</h3>
          </div>

          {loading ? (
            <div className="automation-empty">
              <h4>Loading automation rules...</h4>
              <p>Please wait while Spreelo loads your plans.</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="automation-empty">
              <div className="folder-icon">📁</div>
              <div>
                <h4>No automation rules yet</h4>
                <p>
                  Add your first content plan above. Each planned post will be
                  saved as its own automation rule.
                </p>
              </div>
            </div>
          ) : (
            <div className="posts-list">
              {rules.map((rule) => {
                const ruleTimeZone = rule.timezone || DEFAULT_TIME_ZONE;

                return (
                  <article className="post-item" key={rule.id}>
                    <div className="post-item-header">
                      <div>
                        <h4>
                          {rule.schedule_type === "once"
                            ? rule.run_date
                            : rule.weekday}{" "}
                          · {rule.publish_time?.slice(0, 5)}
                        </h4>
                        <p>
                          {rule.platform} · {rule.post_type} ·{" "}
                          {rule.generate_image
                            ? "Text + image"
                            : "Text only"}{" "}
                          ·{" "}
                          {rule.approval_required
                            ? "Review first"
                            : "Auto publish"}
                        </p>
                      </div>

                      <div className="post-actions">
                        <span>{rule.credit_cost} credits/run</span>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => deleteRule(rule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="idea-box">
                      <strong>{rule.name}</strong>
                      <p>{rule.prompt}</p>

                      <p>
                        <strong>Next run:</strong>{" "}
                        {formatDateTime(rule.next_run_at, ruleTimeZone)}
                      </p>

                      <p>
                        <strong>Timezone:</strong> {ruleTimeZone}
                      </p>

                      <p>
                        <strong>Language:</strong>{" "}
                        {formatLanguage(rule.language)}
                      </p>

                      <p>
                        <strong>Status:</strong>{" "}
                        {rule.is_active ? "Active" : "Inactive"}
                      </p>

                      <p>
                        <strong>Options:</strong>{" "}
                        {rule.include_emojis ? "Emojis" : "No emojis"} ·{" "}
                        {rule.include_hashtags ? "Hashtags" : "No hashtags"}
                      </p>

                      {rule.generate_image && rule.image_prompt && (
                        <p>
                          <strong>Image:</strong> {rule.image_prompt}
                        </p>
                      )}

                      {rule.last_error && (
                        <p>
                          <strong>Last error:</strong> {rule.last_error}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
