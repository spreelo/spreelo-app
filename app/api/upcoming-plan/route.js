import { createClient } from "@supabase/supabase-js";
import { verifyPlanPreviewToken } from "../../../lib/planPreviewToken";

import { getContentTypePreferredTimes } from "../../../lib/contentPlanningStrategy";
export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "UTC";
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

const SMART_SLOTS_BY_WEEKDAY = {
  Monday: ["08:30", "10:30", "13:30", "18:30"],
  Tuesday: ["09:30", "10:30", "12:15", "18:30"],
  Wednesday: ["09:30", "11:30", "13:30", "19:00"],
  Thursday: ["10:30", "12:15", "16:30", "18:30"],
  Friday: ["09:30", "11:30", "16:30", "18:30"],
  Saturday: ["10:30", "14:30", "16:30", "19:00"],
  Sunday: ["10:30", "16:30", "18:30", "19:30"],
};
function stableScheduleHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function minutesToTime(value) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Number(value) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function distributeInsideDaypart(baseTime, seed) {
  const [hour, minute] = String(baseTime || "10:30").split(":").map(Number);
  const value = (Number(hour) || 0) * 60 + (Number(minute) || 0);
  const range = value < 630 ? [480, 620] : value < 780 ? [630, 770] : value < 1050 ? [780, 1040] : [1050, 1250];
  const step = 5;
  const slots = Math.max(1, Math.floor((range[1] - range[0]) / step) + 1);
  return minutesToTime(range[0] + (stableScheduleHash(seed) % slots) * step);
}

function getPreferredTime(contentTypeId, weekday) {
  const allowed = SMART_SLOTS_BY_WEEKDAY[weekday] || SMART_SLOTS_BY_WEEKDAY.Monday;
  const preferred = getContentTypePreferredTimes(contentTypeId);
  return preferred.find((time) => allowed.includes(time)) || allowed[0] || "10:30";
}

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
    if (!config?.enabled || !Array.isArray(config?.variants) || !config.variants.length) return null;
    return config;
  } catch {
    return null;
  }
}

function getAdaptiveWeeklyCycle(rule, scheduledPublishAtIso, config = null) {
  const configuredStart = String(config?.baseStartDate || "").trim();
  const cycleStartMs = new Date(
    configuredStart ? `${configuredStart}T00:00:00Z` : rule?.created_at || rule?.updated_at || 0
  ).getTime();
  const scheduledAtMs = new Date(scheduledPublishAtIso || rule?.next_run_at || Date.now()).getTime();
  if (!Number.isFinite(cycleStartMs) || !Number.isFinite(scheduledAtMs)) return 0;
  return Math.max(0, Math.floor((scheduledAtMs - cycleStartMs) / (7 * 24 * 60 * 60 * 1000)));
}

function resolveAdaptiveWeeklyRule(rule, scheduledPublishAtIso) {
  const config = parseAdaptivePlanConfig(rule);
  if (!config) return rule;
  const cycle = getAdaptiveWeeklyCycle(rule, scheduledPublishAtIso, config);
  const slotIndex = Math.max(0, Number(config.slotIndex || 0));
  const slotCount = Math.max(1, Number(config.slotCount || 1));
  const variantIndex = config.selectionMode === "cycle"
    ? cycle % config.variants.length
    : config.selectionMode === "history_balanced"
      ? (cycle * slotCount + slotIndex) % config.variants.length
      : (cycle + slotIndex) % config.variants.length;
  const variant = config.variants[variantIndex];
  if (!variant || typeof variant !== "object") return rule;
  return {
    ...rule,
    content_type_id: variant.contentTypeId || rule.content_type_id,
    content_type_label: variant.contentTypeLabel || rule.content_type_label,
    content_format: variant.contentFormat || rule.content_format,
    credit_cost: Number(variant.creditCost || rule.credit_cost || 1),
    adaptive_cycle: cycle,
  };
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  ) - date.getTime();
}

function zonedLocalToUtcDate({ year, month, day, hour, minute, timeZone }) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcTime = utcGuess - offset;
  const correctedOffset = getTimeZoneOffsetMs(new Date(utcTime), timeZone);
  if (correctedOffset !== offset) utcTime = utcGuess - correctedOffset;
  return new Date(utcTime);
}

function localDateAndTimeToUtc(dateValue, timeValue, timeZone) {
  const matchDate = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const matchTime = String(timeValue || "").match(/^(\d{2}):(\d{2})$/);
  if (!matchDate || !matchTime) return null;
  const date = zonedLocalToUtcDate({
    year: Number(matchDate[1]),
    month: Number(matchDate[2]),
    day: Number(matchDate[3]),
    hour: Number(matchTime[1]),
    minute: Number(matchTime[2]),
    timeZone: timeZone || DEFAULT_TIME_ZONE,
  });
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalParts(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timeZone || DEFAULT_TIME_ZONE,
  }).formatToParts(date);
  const values = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function localDateNumber(dateValue) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / (24 * 60 * 60 * 1000);
}

function startOfLocalWeek(dateValue) {
  const number = localDateNumber(dateValue);
  if (!Number.isFinite(number)) return "";
  const date = new Date(number * 24 * 60 * 60 * 1000);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const monday = new Date((number - mondayOffset) * 24 * 60 * 60 * 1000);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

function getLocalWeekday(dateValue, timeZone) {
  const date = localDateAndTimeToUtc(dateValue, "12:00", timeZone || DEFAULT_TIME_ZONE);
  return date
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timeZone || DEFAULT_TIME_ZONE }).format(date)
    : "Monday";
}

function getToken(request) {
  const url = new URL(request.url);
  return String(url.searchParams.get("token") || "").trim();
}

async function loadPlan(admin, payload) {
  const { data: rules, error } = await admin
    .from("automation_rules")
    .select("id, name, platform, content_type_id, content_type_label, post_type, content_format, next_run_at, run_date, publish_time, timezone, weekday, is_active, schedule_type, strategy_notes, credit_cost, created_at, updated_at")
    .eq("user_id", payload.userId)
    .eq("brand_profile_id", payload.brandId)
    .eq("name", payload.planName)
    .eq("schedule_type", "weekly")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .order("next_run_at", { ascending: true });
  if (error) throw error;

  const { data: brand } = await admin
    .from("brand_profiles")
    .select("business_name")
    .eq("id", payload.brandId)
    .eq("user_id", payload.userId)
    .maybeSingle();

  const ruleIds = (rules || []).map((rule) => rule.id);
  const { data: overrides, error: overridesError } = ruleIds.length
    ? await admin.from("automation_schedule_overrides")
        .select("automation_rule_id, base_run_date, override_run_date, override_publish_time, status")
        .in("automation_rule_id", ruleIds)
        .eq("status", "active")
    : { data: [], error: null };
  if (overridesError && !/automation_schedule_overrides|schema cache|does not exist/i.test(String(overridesError.message || ""))) throw overridesError;

  const resolvedRules = (rules || []).map((rule) => {
    const timeZone = rule.timezone || DEFAULT_TIME_ZONE;
    const baseParts = formatLocalParts(rule.next_run_at, timeZone);
    const override = (overrides || []).find((item) =>
      item.automation_rule_id === rule.id && item.base_run_date === baseParts.date
    );
    const overrideTime = String(override?.override_publish_time || rule.publish_time || baseParts.time).slice(0, 5);
    const effectiveDate = override?.override_run_date || baseParts.date;
    const effectiveIso = localDateAndTimeToUtc(effectiveDate, overrideTime, timeZone)?.toISOString() || rule.next_run_at;
    const resolvedRule = resolveAdaptiveWeeklyRule(rule, rule.next_run_at);
    return {
      ...resolvedRule,
      ...formatLocalParts(effectiveIso, timeZone),
    };
  });

  const planTimeZone = resolvedRules[0]?.timezone || rules?.[0]?.timezone || DEFAULT_TIME_ZONE;
  return {
    brandName: brand?.business_name || "",
    planName: payload.planName,
    timezone: planTimeZone,
    today: formatLocalParts(new Date().toISOString(), planTimeZone).date,
    totalCredits: resolvedRules.reduce(
      (total, rule) => total + Math.max(1, Number(rule.credit_cost || 1)),
      0
    ),
    rules: resolvedRules,
  };
}

export async function GET(request) {
  const admin = getAdminClient();
  if (!admin) return Response.json({ ok: false, error: "Server configuration is incomplete." }, { status: 500 });

  const payload = verifyPlanPreviewToken(getToken(request));
  if (!payload) return Response.json({ ok: false, error: "Invalid or expired link." }, { status: 401 });

  try {
    const plan = await loadPlan(admin, payload);
    return Response.json({ ok: true, ...plan });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "Plan could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const admin = getAdminClient();
  if (!admin) return Response.json({ ok: false, error: "Server configuration is incomplete." }, { status: 500 });

  const token = getToken(request);
  const payload = verifyPlanPreviewToken(token);
  if (!payload) return Response.json({ ok: false, error: "Invalid or expired link." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (!changes.length) return Response.json({ ok: false, error: "No schedule changes were supplied." }, { status: 400 });

  const { data: ownedRules, error: ownedRulesError } = await admin
    .from("automation_rules")
    .select("id, timezone, next_run_at, publish_time, content_type_id, content_type_label, content_format, credit_cost, strategy_notes, created_at, updated_at")
    .eq("user_id", payload.userId)
    .eq("brand_profile_id", payload.brandId)
    .eq("name", payload.planName)
    .eq("schedule_type", "weekly")
    .eq("is_active", true)
    .in("id", changes.map((item) => String(item?.id || "")).filter(Boolean));
  if (ownedRulesError) return Response.json({ ok: false, error: ownedRulesError.message }, { status: 500 });

  const ruleMap = new Map((ownedRules || []).map((rule) => [rule.id, rule]));
  if (ruleMap.size !== new Set(changes.map((item) => String(item?.id || "")).filter(Boolean)).size) {
    return Response.json({ ok: false, error: "One or more plan items could not be verified." }, { status: 403 });
  }

  const ruleIds = Array.from(ruleMap.keys());
  const { data: existingOverrides, error: existingOverridesError } = ruleIds.length
    ? await admin.from("automation_schedule_overrides")
        .select("automation_rule_id, base_run_date, override_run_date, override_publish_time, status")
        .in("automation_rule_id", ruleIds)
        .eq("status", "active")
    : { data: [], error: null };
  if (existingOverridesError && !/automation_schedule_overrides|schema cache|does not exist/i.test(String(existingOverridesError.message || ""))) {
    return Response.json({ ok: false, error: existingOverridesError.message }, { status: 500 });
  }
  const existingOverrideMap = new Map(
    (existingOverrides || []).map((item) => [`${item.automation_rule_id}|${item.base_run_date}`, item])
  );

  const updates = [];
  for (const change of changes) {
    const id = String(change?.id || "");
    const rule = ruleMap.get(id);
    const timeZone = rule?.timezone || DEFAULT_TIME_ZONE;
    const baseParts = formatLocalParts(rule?.next_run_at, timeZone);
    const nextDateValue = String(change?.date || "").slice(0, 10);
    const todayValue = formatLocalParts(new Date().toISOString(), timeZone).date;
    const existingOverride = existingOverrideMap.get(`${id}|${baseParts.date}`) || null;
    const currentEffectiveDate = String(existingOverride?.override_run_date || baseParts.date).slice(0, 10);

    if (!Number.isFinite(localDateNumber(nextDateValue))) {
      return Response.json({ ok: false, error: "Use a valid date for every post." }, { status: 400 });
    }
    if (nextDateValue === currentEffectiveDate) {
      continue;
    }
    if (nextDateValue <= todayValue) {
      return Response.json({ ok: false, error: "Recurring posts can only be moved to a future day." }, { status: 400 });
    }
    if (startOfLocalWeek(nextDateValue) !== startOfLocalWeek(baseParts.date)) {
      return Response.json({ ok: false, error: "Move the post within the same week so the weekly frequency stays intact." }, { status: 400 });
    }

    const occurrenceRangeStartDate = currentEffectiveDate < baseParts.date ? currentEffectiveDate : baseParts.date;
    const occurrenceRangeEndBase = currentEffectiveDate > baseParts.date ? currentEffectiveDate : baseParts.date;
    const occurrenceRangeStart = localDateAndTimeToUtc(occurrenceRangeStartDate, "00:00", timeZone);
    const occurrenceRangeEndNumber = localDateNumber(occurrenceRangeEndBase) + 1;
    const occurrenceRangeEndUtc = new Date(occurrenceRangeEndNumber * 24 * 60 * 60 * 1000);
    const occurrenceRangeEndValue = `${occurrenceRangeEndUtc.getUTCFullYear()}-${String(occurrenceRangeEndUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(occurrenceRangeEndUtc.getUTCDate()).padStart(2, "0")}`;
    const occurrenceRangeEnd = localDateAndTimeToUtc(occurrenceRangeEndValue, "00:00", timeZone);
    const { data: occurrence, error: occurrenceError } = await admin
      .from("automation_occurrences")
      .select("id")
      .eq("user_id", payload.userId)
      .eq("automation_rule_id", id)
      .gte("scheduled_for", occurrenceRangeStart.toISOString())
      .lt("scheduled_for", occurrenceRangeEnd.toISOString())
      .limit(1)
      .maybeSingle();
    if (occurrenceError) return Response.json({ ok: false, error: occurrenceError.message }, { status: 500 });
    if (occurrence) {
      return Response.json({ ok: false, error: "This post has already started generating and is locked." }, { status: 409 });
    }

    const effectiveRule = resolveAdaptiveWeeklyRule(rule, rule.next_run_at);
    const effectiveContentTypeId = effectiveRule?.content_type_id || rule.content_type_id || "manual_prompt";
    const targetWeekday = getLocalWeekday(nextDateValue, timeZone);
    const basePreferredTime = getPreferredTime(effectiveContentTypeId, targetWeekday);
    const overridePublishTime = distributeInsideDaypart(
      basePreferredTime,
      `${payload.userId}:${id}:${nextDateValue}:${effectiveContentTypeId}`
    );

    updates.push({ id, rule, baseDate: baseParts.date, overrideDate: nextDateValue, overridePublishTime });
  }

  // Keep the weekly contract intact even from the email-link editor: no more
  // than two occurrences may land on the same calendar day.
  const proposedDates = new Map();
  for (const rule of ownedRules || []) {
    const timeZone = rule?.timezone || DEFAULT_TIME_ZONE;
    const baseParts = formatLocalParts(rule?.next_run_at, timeZone);
    const override = existingOverrideMap.get(`${rule.id}|${baseParts.date}`) || null;
    proposedDates.set(rule.id, String(override?.override_run_date || baseParts.date).slice(0, 10));
  }
  for (const update of updates) proposedDates.set(update.id, update.overrideDate);
  const dateCounts = new Map();
  for (const dateValue of proposedDates.values()) {
    dateCounts.set(dateValue, (dateCounts.get(dateValue) || 0) + 1);
  }
  if (Array.from(dateCounts.values()).some((count) => count > 2)) {
    return Response.json({ ok: false, error: "A recurring plan can contain at most two posts on the same day." }, { status: 400 });
  }

  for (const update of updates) {
    const { error } = await admin
      .from("automation_schedule_overrides")
      .upsert({
        user_id: payload.userId,
        brand_profile_id: payload.brandId,
        automation_rule_id: update.id,
        base_run_date: update.baseDate,
        override_run_date: update.overrideDate,
        override_publish_time: update.overridePublishTime,
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "automation_rule_id,base_run_date" });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const plan = await loadPlan(admin, payload);
  return Response.json({ ok: true, ...plan });
}
