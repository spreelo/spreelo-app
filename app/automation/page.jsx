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
    shortLabel: "Tips",
    description: "Teach the audience something useful.",
    prompt:
      "Create a useful social media post that teaches the audience one practical tip related to this business. Make it specific, helpful and easy to understand. Avoid sounding like an advertisement.",
    imagePrompt:
      "Create a professional image that visually supports a helpful tip. Make it relevant to the business, clear, polished and not generic.",
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

function formatPlanMode(value) {
  if (value === "auto") return "Auto-plan";
  if (value === "select") return "Choose content types";
  return "Manual prompt";
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
  const [showSavedRules, setShowSavedRules] = useState(false);

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

  const savedRulesPreview = rules.slice(0, 3);

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
      <div className="automation-page planner-wizard-page">
        <header className="wizard-header">
          <div>
            <p className="wizard-eyebrow">Automation plan</p>
            <h2>Create content plan</h2>
            <span>
              Build a plan that creates social posts for you automatically.
            </span>
          </div>

          <button type="button" className="wizard-cancel-button">
            ✕ Cancel
          </button>
        </header>

        <section className="wizard-steps">
          <div className="wizard-step completed">
            <span>1</span>
            <strong>Basics</strong>
          </div>
          <div className="wizard-line" />
          <div className="wizard-step active">
            <span>2</span>
            <strong>Choose method</strong>
          </div>
          <div className="wizard-line" />
          <div className="wizard-step">
            <span>3</span>
            <strong>Posts & schedule</strong>
          </div>
          <div className="wizard-line" />
          <div className="wizard-step">
            <span>4</span>
            <strong>Review & save</strong>
          </div>
        </section>

        <div className="wizard-layout">
          <main className="wizard-main">
            <section className="wizard-card">
              <div className="wizard-card-title">
                <div>
                  <h3>Choose how you want to create the plan</h3>
                  <p>
                    Three simple ways to get started. You can still change the
                    details before saving.
                  </p>
                </div>
              </div>

              <div className="wizard-method-grid">
                <button
                  type="button"
                  className={`wizard-method-card ${
                    planCreationMode === "auto" ? "active" : ""
                  }`}
                  onClick={() => changePlanCreationMode("auto")}
                >
                  <div className="method-check">
                    {planCreationMode === "auto" ? "✓" : ""}
                  </div>
                  <div className="method-illustration">🪄</div>
                  <span>Recommended</span>
                  <h4>1. Auto-plan</h4>
                  <p>
                    Spreelo creates a smart weekly plan automatically for your
                    business.
                  </p>
                  <div className="method-best">
                    <strong>Best for you if...</strong>
                    <small>
                      you want a quick and simple way to get started.
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`wizard-method-card ${
                    planCreationMode === "select" ? "active" : ""
                  }`}
                  onClick={() => changePlanCreationMode("select")}
                >
                  <div className="method-check">
                    {planCreationMode === "select" ? "✓" : ""}
                  </div>
                  <div className="method-illustration">🎛️</div>
                  <span>Flexible</span>
                  <h4>2. Choose content types</h4>
                  <p>
                    Pick the types of posts you want, and Spreelo builds the
                    plan around your choices.
                  </p>
                  <div className="method-best blue">
                    <strong>Best for you if...</strong>
                    <small>
                      you want more control without writing everything yourself.
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`wizard-method-card ${
                    planCreationMode === "manual" ? "active" : ""
                  }`}
                  onClick={() => changePlanCreationMode("manual")}
                >
                  <div className="method-check">
                    {planCreationMode === "manual" ? "✓" : ""}
                  </div>
                  <div className="method-illustration">📝</div>
                  <span>Advanced</span>
                  <h4>3. Manual prompt</h4>
                  <p>
                    Write exactly what every post should be about and control
                    the details yourself.
                  </p>
                  <div className="method-best green">
                    <strong>Best for you if...</strong>
                    <small>
                      you have very specific wishes or campaign ideas.
                    </small>
                  </div>
                </button>
              </div>

              {planCreationMode === "select" && (
                <div className="wizard-content-types">
                  <div className="wizard-subtitle-row">
                    <div>
                      <h4>Select content types</h4>
                      <p>
                        Each selected type becomes a planned post with a
                        ready-made prompt.
                      </p>
                    </div>
                    <span>{selectedContentTypeIds.length} selected</span>
                  </div>

                  <div className="wizard-content-type-grid">
                    {contentTypes.map((type) => {
                      const isSelected = selectedContentTypeIds.includes(
                        type.id
                      );

                      return (
                        <button
                          type="button"
                          key={type.id}
                          className={`wizard-content-type ${
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

              {planCreationMode === "auto" && (
                <div className="wizard-info-grid">
                  <div className="wizard-info-box">
                    <h4>Unsure what to choose?</h4>
                    <div className="info-list">
                      <div>
                        <span>🪄</span>
                        <p>
                          <strong>Auto-plan = fastest and easiest</strong>
                          Perfect when you want a complete plan in seconds.
                        </p>
                      </div>
                      <div>
                        <span>🎯</span>
                        <p>
                          <strong>Choose types = more control</strong>
                          Pick the content format, and Spreelo handles the rest.
                        </p>
                      </div>
                      <div>
                        <span>👤</span>
                        <p>
                          <strong>Manual prompt = most control</strong>
                          Write exactly what you want, and Spreelo follows it.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="wizard-next-box">
                    <h4>How you continue</h4>
                    <div className="next-step active">
                      <span>1</span>
                      <p>
                        <strong>Choose method</strong>
                        You are here.
                      </p>
                    </div>
                    <div className="next-step">
                      <span>2</span>
                      <p>
                        <strong>Posts & schedule</strong>
                        Adjust the generated rows and times.
                      </p>
                    </div>
                    <div className="next-step">
                      <span>3</span>
                      <p>
                        <strong>Review & save</strong>
                        Activate the plan when it looks good.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {planCreationMode === "manual" && (
                <div className="wizard-info-box single">
                  <h4>Manual prompt mode</h4>
                  <p>
                    This mode is best when you already know exactly what each
                    post should be about. Start with one row below and add more
                    if needed.
                  </p>
                </div>
              )}
            </section>

            <section className="wizard-card compact">
              <div className="wizard-card-title">
                <div>
                  <h3>Plan basics</h3>
                  <p>Choose whether this is a recurring or one-time plan.</p>
                </div>
              </div>

              <div className="wizard-form-row">
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

                <div>
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

            <section className="wizard-card">
              <div className="wizard-card-title">
                <div>
                  <h3>Posts & schedule</h3>
                  <p>
                    Adjust days, times and post instructions before saving.
                  </p>
                </div>
                <button
                  type="button"
                  className="add-plan-button"
                  onClick={addSlot}
                >
                  + Add post
                </button>
              </div>

              <div className="planned-list cleaner">
                {slots.map((slot, index) => (
                  <article className="planned-row wizard-planned-row" key={slot.id}>
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

                      <div className="planned-fields wizard-planned-fields">
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
                            updateSlot(
                              slot.id,
                              "publishTime",
                              event.target.value
                            )
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

                      <div className="planned-bottom cleaner">
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
                          AI image
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
                          Emojis
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
                          Hashtags
                        </label>

                        <span className="credit-chip">
                          {slot.generateImage ? "3 credits" : "1 credit"}
                        </span>
                      </div>

                      {slot.generateImage && (
                        <textarea
                          className="image-prompt-box"
                          value={slot.imagePrompt}
                          onChange={(event) =>
                            updateSlot(
                              slot.id,
                              "imagePrompt",
                              event.target.value
                            )
                          }
                          placeholder="Optional visual direction for the image."
                        />
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="settings-card wizard-settings-card">
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

                <button
                  type="button"
                  className="save-plan-button"
                  onClick={savePlan}
                  disabled={saving || !hasEnoughCredits}
                >
                  {saving ? "Saving..." : "Save content plan"}
                </button>
              </div>

              {message && <p className="login-message">{message}</p>}
            </section>

            <section className="saved-card saved-card-compact">
              <div className="saved-header">
                <div>
                  <p>Saved plans</p>
                  <h3>Automation rules</h3>
                </div>

                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => setShowSavedRules((current) => !current)}
                >
                  {showSavedRules ? "Hide" : "Show all"}
                </button>
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
                      Add your first content plan above. Each planned post will
                      be saved as its own automation rule.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="saved-rule-list">
                  {(showSavedRules ? rules : savedRulesPreview).map((rule) => {
                    const ruleTimeZone = rule.timezone || DEFAULT_TIME_ZONE;

                    return (
                      <article className="saved-rule-card" key={rule.id}>
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
                          <small>
                            Next run:{" "}
                            {formatDateTime(rule.next_run_at, ruleTimeZone)}
                          </small>
                        </div>

                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => deleteRule(rule.id)}
                        >
                          Delete
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
              )}
            </section>
          </main>

          <aside className="wizard-sidebar">
            <section className="wizard-summary-card">
              <h3>Plan summary</h3>

              <div className="summary-list">
                <div>
                  <span>Method</span>
                  <strong>{formatPlanMode(planCreationMode)}</strong>
                </div>
                <div>
                  <span>Repeats</span>
                  <strong>
                    {scheduleType === "weekly" ? "Every week" : "One time"}
                  </strong>
                </div>
                <div>
                  <span>Posts</span>
                  <strong>{slots.length}</strong>
                </div>
                <div>
                  <span>Text only</span>
                  <strong>{textOnlyCount}</strong>
                </div>
                <div>
                  <span>Text + image</span>
                  <strong>{imageCount}</strong>
                </div>
                <div>
                  <span>Language</span>
                  <strong>{formatLanguage(language)}</strong>
                </div>
                <div>
                  <span>Credits</span>
                  <strong>{plannedCredits}</strong>
                </div>
                <div>
                  <span>Monthly estimate</span>
                  <strong>{monthlyEstimate}</strong>
                </div>
              </div>

              {creditBalance && !hasEnoughCredits && (
                <div className="credit-warning sidebar-warning">
                  This plan needs {plannedCredits} credits, but you only have{" "}
                  {creditBalance.credits_remaining} credits remaining.
                </div>
              )}
            </section>

            <section className="wizard-preview-card">
              <h3>Preview</h3>
              <p>Examples of content in this plan</p>

              <div className="preview-thumbs">
                {slots.slice(0, 3).map((slot) => (
                  <div className="preview-thumb" key={slot.id}>
                    <div className="preview-image-placeholder">✦</div>
                    <span>
                      {slot.contentTypeLabel ||
                        slot.prompt.slice(0, 18) ||
                        "Manual"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="summary-note">
                <strong>You can change everything later</strong>
                <p>
                  All settings can be adjusted before the plan is activated.
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
