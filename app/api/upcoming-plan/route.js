import { createClient } from "@supabase/supabase-js";
import { verifyPlanPreviewToken } from "../../../lib/planPreviewToken";

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
  const variantIndex = config.selectionMode === "cycle"
    ? cycle % config.variants.length
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

  const resolvedRules = (rules || []).map((rule) => {
    const resolvedRule = resolveAdaptiveWeeklyRule(rule, rule.next_run_at);
    return {
      ...resolvedRule,
      ...formatLocalParts(rule.next_run_at, rule.timezone || DEFAULT_TIME_ZONE),
    };
  });

  return {
    brandName: brand?.business_name || "",
    planName: payload.planName,
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
    .select("id, timezone")
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

  const updates = [];
  for (const change of changes) {
    const id = String(change?.id || "");
    const rule = ruleMap.get(id);
    const timeZone = rule?.timezone || DEFAULT_TIME_ZONE;
    const nextDate = localDateAndTimeToUtc(change?.date, change?.time, timeZone);
    if (!nextDate) return Response.json({ ok: false, error: "Use a valid date and time for every post." }, { status: 400 });
    if (nextDate.getTime() < Date.now() - 60_000) {
      return Response.json({ ok: false, error: "Upcoming posts cannot be moved to a time that has already passed." }, { status: 400 });
    }
    updates.push({
      id,
      nextRunAt: nextDate.toISOString(),
      runDate: String(change.date),
      publishTime: `${String(change.time).slice(0, 5)}:00`,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(nextDate),
    });
  }

  for (const update of updates) {
    const { error } = await admin
      .from("automation_rules")
      .update({
        run_date: update.runDate,
        publish_time: update.publishTime,
        weekday: update.weekday,
        next_run_at: update.nextRunAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .eq("user_id", payload.userId)
      .eq("brand_profile_id", payload.brandId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const plan = await loadPlan(admin, payload);
  return Response.json({ ok: true, ...plan });
}
