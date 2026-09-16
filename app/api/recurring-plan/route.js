import { getAuthenticatedBillingUser } from "../../../lib/stripeBilling";
import { getContentTypePreferredTimes } from "../../../lib/contentPlanningStrategy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADAPTIVE_PLAN_PREFIX = "SPREELO_ADAPTIVE_V1:";
const DAY_MS = 24 * 60 * 60 * 1000;

const SMART_SLOTS_BY_WEEKDAY = {
  Monday: ["08:30", "10:30", "13:30", "18:30"],
  Tuesday: ["09:30", "10:30", "12:15", "18:30"],
  Wednesday: ["09:30", "11:30", "13:30", "19:00"],
  Thursday: ["10:30", "12:15", "16:30", "18:30"],
  Friday: ["09:30", "11:30", "16:30", "18:30"],
  Saturday: ["10:30", "14:30", "16:30", "19:00"],
  Sunday: ["10:30", "16:30", "18:30", "19:30"],
};
function stableHash(value) {
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
  return minutesToTime(range[0] + (stableHash(seed) % slots) * step);
}

function getPreferredTime(contentTypeId, weekday) {
  const allowed = SMART_SLOTS_BY_WEEKDAY[weekday] || SMART_SLOTS_BY_WEEKDAY.Monday;
  const preferred = getContentTypePreferredTimes(contentTypeId);
  return preferred.find((time) => allowed.includes(time)) || allowed[0] || "10:30";
}

function parseAdaptivePlanConfig(rule) {
  const notes = String(rule?.strategy_notes || "");
  const markerIndex = notes.indexOf(ADAPTIVE_PLAN_PREFIX);
  if (markerIndex === -1) return null;
  const jsonLine = notes
    .slice(markerIndex + ADAPTIVE_PLAN_PREFIX.length)
    .split("\n", 1)[0]
    .trim();
  if (!jsonLine) return null;
  try {
    const parsed = JSON.parse(jsonLine);
    return parsed?.enabled && Array.isArray(parsed?.variants) ? parsed : null;
  } catch {
    return null;
  }
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZone,
  }).formatToParts(date);
  const values = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  return Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second)
  ) - date.getTime();
}

function localDateTimeToUtc(dateValue, timeValue, timeZone = "UTC") {
  const dateMatch = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || "").match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const utcGuess = Date.UTC(
    Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]),
    Number(timeMatch[1]), Number(timeMatch[2]), 0
  );
  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcTime = utcGuess - offset;
  const correctedOffset = getTimeZoneOffsetMs(new Date(utcTime), timeZone);
  if (correctedOffset !== offset) utcTime = utcGuess - correctedOffset;
  const result = new Date(utcTime);
  return Number.isNaN(result.getTime()) ? null : result;
}

function getLocalDate(value, timeZone = "UTC") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone,
  }).formatToParts(date);
  const values = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function getLocalWeekday(dateValue, timeZone = "UTC") {
  const date = localDateTimeToUtc(dateValue, "12:00", timeZone);
  return date
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(date)
    : "";
}

function dateNumber(dateValue) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function startOfWeekDate(dateValue, timeZone = "UTC") {
  const midday = localDateTimeToUtc(dateValue, "12:00", timeZone);
  if (!midday) return "";
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(midday);
  const offsets = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = offsets[weekday] ?? 0;
  const [year, month, day] = dateValue.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day - offset));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function getPlanGroupKey(rule) {
  const explicitGroupId = String(rule?.recurring_plan_group_id || "").trim();
  if (explicitGroupId) return `group:${explicitGroupId}`;
  return [
    String(rule?.name || "").trim(),
    String(rule?.schedule_type || "").trim(),
    String(rule?.queue_source || "content_studio").trim(),
    String(rule?.created_at || "").slice(0, 16),
  ].join("|");
}

function normalizeVariant(rule, variant) {
  if (!variant?.contentTypeId) return null;
  return {
    contentTypeId: variant.contentTypeId,
    contentTypeLabel: variant.contentTypeLabel || variant.contentTypeId,
    contentFormat: variant.contentFormat || rule.content_format || "single_image",
    creditCost: Math.max(1, Number(variant.creditCost || rule.credit_cost || 1)),
  };
}

function getRuleVariants(rule) {
  const config = parseAdaptivePlanConfig(rule);
  const seen = new Set();
  const variants = [];
  const push = (value) => {
    if (!value?.contentTypeId || seen.has(value.contentTypeId)) return;
    seen.add(value.contentTypeId);
    variants.push(value);
  };
  push({
    contentTypeId: rule.content_type_id,
    contentTypeLabel: rule.content_type_label || rule.post_type || rule.content_type_id,
    contentFormat: rule.content_format || "single_image",
    creditCost: Math.max(1, Number(rule.credit_cost || 1)),
  });
  for (const variant of config?.variants || []) push(normalizeVariant(rule, variant));
  return variants.filter(Boolean);
}

async function loadPlan(context, planRuleId) {
  const { data: selectedRule, error: selectedError } = await context.admin
    .from("automation_rules")
    .select("*")
    .eq("id", planRuleId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (selectedError) throw selectedError;
  if (!selectedRule || selectedRule.schedule_type !== "weekly") {
    const error = new Error("Recurring plan not found.");
    error.status = 404;
    throw error;
  }

  const { data: candidateRules, error: rulesError } = await context.admin
    .from("automation_rules")
    .select("*")
    .eq("user_id", context.user.id)
    .eq("brand_profile_id", selectedRule.brand_profile_id)
    .eq("schedule_type", "weekly")
    .eq("name", selectedRule.name)
    .order("created_at", { ascending: true });
  if (rulesError) throw rulesError;

  const selectedKey = getPlanGroupKey(selectedRule);
  const rules = (candidateRules || []).filter((rule) => getPlanGroupKey(rule) === selectedKey);
  const ruleIds = rules.map((rule) => rule.id);

  const [{ data: overrides, error: overridesError }, { data: occurrences, error: occurrencesError }] = await Promise.all([
    ruleIds.length
      ? context.admin.from("automation_schedule_overrides").select("*").eq("user_id", context.user.id).in("automation_rule_id", ruleIds)
      : { data: [], error: null },
    ruleIds.length
      ? context.admin.from("automation_occurrences").select("id, automation_rule_id, scheduled_for, status, post_id, started_at, finished_at, content_type_id, content_type_label, content_format").eq("user_id", context.user.id).in("automation_rule_id", ruleIds).order("scheduled_for", { ascending: false }).limit(500)
      : { data: [], error: null },
  ]);
  if (overridesError && !/automation_schedule_overrides|schema cache|does not exist/i.test(String(overridesError.message || ""))) throw overridesError;
  if (occurrencesError) throw occurrencesError;

  const { data: brand } = await context.admin
    .from("brand_profiles")
    .select("business_name")
    .eq("id", selectedRule.brand_profile_id)
    .eq("user_id", context.user.id)
    .maybeSingle();

  const today = getLocalDate(new Date(), selectedRule.timezone || "UTC");

  return {
    id: selectedRule.id,
    name: selectedRule.name,
    brandName: brand?.business_name || "",
    timezone: selectedRule.timezone || "UTC",
    planState: selectedRule.plan_state || (selectedRule.is_active ? "active" : "paused"),
    pauseReason: selectedRule.plan_pause_reason || null,
    pausedAt: selectedRule.plan_paused_at || null,
    creditPauseRequiredAmount: Math.max(0, Number(selectedRule.credit_pause_required_amount || 0)),
    creditPauseBalanceAtPause: Math.max(0, Number(selectedRule.credit_pause_balance_at_pause || 0)),
    recurringPlanGroupId: selectedRule.recurring_plan_group_id || null,
    today,
    brandProfileId: selectedRule.brand_profile_id || null,
    rules: rules.map((rule) => ({
      id: rule.id,
      weekday: rule.weekday,
      publishTime: String(rule.publish_time || "").slice(0, 5),
      nextRunAt: rule.next_run_at,
      runDate: rule.run_date,
      strategyNotes: rule.strategy_notes || "",
      contentTypeId: rule.content_type_id,
      contentTypeLabel: rule.content_type_label || rule.post_type || rule.content_type_id,
      contentFormat: rule.content_format || "single_image",
      creditCost: Math.max(1, Number(rule.credit_cost || 1)),
      isActive: rule.is_active === true,
      variants: getRuleVariants(rule),
    })),
    overrides: overrides || [],
    occurrences: occurrences || [],
  };
}

export async function GET(request) {
  const context = await getAuthenticatedBillingUser(request);
  if (context.error) return Response.json({ ok: false, error: context.error }, { status: context.status });
  const url = new URL(request.url);
  const planRuleId = String(url.searchParams.get("plan") || "").trim();
  if (!planRuleId) return Response.json({ ok: false, error: "Plan id is required." }, { status: 400 });
  try {
    return Response.json({ ok: true, plan: await loadPlan(context, planRuleId) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "Plan could not be loaded." }, { status: error.status || 500 });
  }
}

export async function PATCH(request) {
  const context = await getAuthenticatedBillingUser(request);
  if (context.error) return Response.json({ ok: false, error: context.error }, { status: context.status });
  const body = await request.json().catch(() => ({}));
  const planRuleId = String(body?.planRuleId || "").trim();
  const ruleId = String(body?.ruleId || "").trim();
  const baseRunDate = String(body?.baseRunDate || "").slice(0, 10);
  const overrideRunDate = String(body?.overrideRunDate || baseRunDate).slice(0, 10);
  const overrideContentTypeId = String(body?.overrideContentTypeId || "").trim();

  if (!planRuleId || !ruleId || !baseRunDate || !overrideRunDate) {
    return Response.json({ ok: false, error: "Plan, rule and dates are required." }, { status: 400 });
  }

  try {
    const plan = await loadPlan(context, planRuleId);
    const rule = plan.rules.find((item) => item.id === ruleId);
    if (!rule) return Response.json({ ok: false, error: "This post does not belong to the selected plan." }, { status: 403 });

    const today = plan.today;
    const normalizedRuleStartDate = String(rule.runDate || "").slice(0, 10);
    if (!Number.isFinite(dateNumber(baseRunDate)) || getLocalWeekday(baseRunDate, plan.timezone) !== rule.weekday) {
      return Response.json({ ok: false, error: "The selected occurrence does not match this weekly slot." }, { status: 400 });
    }
    if (normalizedRuleStartDate && baseRunDate < normalizedRuleStartDate) {
      return Response.json({ ok: false, error: "This weekly slot had not started yet on that date." }, { status: 400 });
    }
    if (!Number.isFinite(dateNumber(overrideRunDate)) || overrideRunDate <= today) {
      return Response.json({ ok: false, error: "Recurring posts can only be moved to a future day." }, { status: 400 });
    }
    if (startOfWeekDate(baseRunDate, plan.timezone) !== startOfWeekDate(overrideRunDate, plan.timezone)) {
      return Response.json({ ok: false, error: "Move the post within the same week so the weekly frequency stays intact." }, { status: 400 });
    }

    const previousOverride = (plan.overrides || []).find((item) =>
      item.automation_rule_id === ruleId && item.base_run_date === baseRunDate
    ) || null;
    const currentEffectiveRunDate = String(previousOverride?.override_run_date || baseRunDate).slice(0, 10);
    const occurrenceRangeStartDate = currentEffectiveRunDate < baseRunDate ? currentEffectiveRunDate : baseRunDate;
    const occurrenceRangeEndBase = currentEffectiveRunDate > baseRunDate ? currentEffectiveRunDate : baseRunDate;
    const occurrenceRangeStart = localDateTimeToUtc(occurrenceRangeStartDate, "00:00", plan.timezone);
    const occurrenceRangeEndNumber = dateNumber(occurrenceRangeEndBase) + 1;
    const occurrenceRangeEndUtcDate = new Date(occurrenceRangeEndNumber * DAY_MS);
    const occurrenceRangeEndDate = `${occurrenceRangeEndUtcDate.getUTCFullYear()}-${String(occurrenceRangeEndUtcDate.getUTCMonth() + 1).padStart(2, "0")}-${String(occurrenceRangeEndUtcDate.getUTCDate()).padStart(2, "0")}`;
    const occurrenceRangeEnd = localDateTimeToUtc(occurrenceRangeEndDate, "00:00", plan.timezone);
    const { data: startedOccurrence, error: occurrenceError } = await context.admin
      .from("automation_occurrences")
      .select("id, status")
      .eq("user_id", context.user.id)
      .eq("automation_rule_id", ruleId)
      .gte("scheduled_for", occurrenceRangeStart.toISOString())
      .lt("scheduled_for", occurrenceRangeEnd.toISOString())
      .limit(1)
      .maybeSingle();
    if (occurrenceError) throw occurrenceError;
    if (startedOccurrence) {
      return Response.json({ ok: false, error: "This post has already started generating and is locked." }, { status: 409 });
    }

    const baseWeek = startOfWeekDate(baseRunDate, plan.timezone);
    const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const targetDateCount = plan.rules.reduce((count, planRule) => {
      if (planRule.id === ruleId) return count;
      const weekdayIndex = weekdayOrder.indexOf(planRule.weekday);
      if (weekdayIndex < 0) return count;
      const weekNumber = dateNumber(baseWeek);
      if (!Number.isFinite(weekNumber)) return count;
      const date = new Date((weekNumber + weekdayIndex) * DAY_MS);
      const planRuleBaseDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      if (planRule.runDate && planRuleBaseDate < String(planRule.runDate).slice(0, 10)) return count;
      const planOverride = (plan.overrides || []).find((item) =>
        item.automation_rule_id === planRule.id && item.base_run_date === planRuleBaseDate && item.status === "active"
      );
      return count + ((planOverride?.override_run_date || planRuleBaseDate) === overrideRunDate ? 1 : 0);
    }, 0);
    if (targetDateCount >= 2) {
      return Response.json({ ok: false, error: "A recurring plan can contain at most two posts on the same day." }, { status: 400 });
    }

    let chosenVariant = null;
    if (overrideContentTypeId) {
      chosenVariant = rule.variants.find((variant) => variant.contentTypeId === overrideContentTypeId) || null;
      if (!chosenVariant) {
        return Response.json({ ok: false, error: "Choose one of the content types available for this recurring slot." }, { status: 400 });
      }
    }

    const targetWeekday = getLocalWeekday(overrideRunDate, plan.timezone);
    const preferredWindowTime = getPreferredTime(
      chosenVariant?.contentTypeId || rule.contentTypeId,
      targetWeekday || rule.weekday
    );
    const overridePublishTime = distributeInsideDaypart(
      preferredWindowTime,
      `${context.user.id}:${ruleId}:${overrideRunDate}:${chosenVariant?.contentTypeId || rule.contentTypeId}`
    );
    const restorePreviousOverride = async () => {
      if (!previousOverride) {
        await context.admin
          .from("automation_schedule_overrides")
          .delete()
          .eq("automation_rule_id", ruleId)
          .eq("base_run_date", baseRunDate);
        return;
      }
      const restorePayload = {
        user_id: previousOverride.user_id,
        brand_profile_id: previousOverride.brand_profile_id || null,
        automation_rule_id: previousOverride.automation_rule_id,
        base_run_date: previousOverride.base_run_date,
        override_run_date: previousOverride.override_run_date || null,
        override_publish_time: previousOverride.override_publish_time || null,
        override_content_type_id: previousOverride.override_content_type_id || null,
        override_content_type_label: previousOverride.override_content_type_label || null,
        override_content_format: previousOverride.override_content_format || null,
        override_credit_cost: previousOverride.override_credit_cost || null,
        status: previousOverride.status || "active",
        updated_at: previousOverride.updated_at || new Date().toISOString(),
      };
      await context.admin
        .from("automation_schedule_overrides")
        .upsert(restorePayload, { onConflict: "automation_rule_id,base_run_date" });
    };

    const payload = {
      user_id: context.user.id,
      brand_profile_id: plan.brandProfileId || null,
      automation_rule_id: ruleId,
      base_run_date: baseRunDate,
      override_run_date: overrideRunDate,
      override_publish_time: overridePublishTime ? `${overridePublishTime}:00` : null,
      override_content_type_id: chosenVariant?.contentTypeId || null,
      override_content_type_label: chosenVariant?.contentTypeLabel || null,
      override_content_format: chosenVariant?.contentFormat || null,
      override_credit_cost: chosenVariant?.creditCost || null,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await context.admin
      .from("automation_schedule_overrides")
      .upsert(payload, { onConflict: "automation_rule_id,base_run_date" });
    if (upsertError) throw upsertError;

    const isNextOccurrence = getLocalDate(rule.nextRunAt, plan.timezone) === baseRunDate;
    if (isNextOccurrence) {
      const targetReservationCost = Math.max(1, Number(chosenVariant?.creditCost || rule.creditCost || 1));
      const { data: reservation, error: reservationError } = await context.admin.rpc(
        "adjust_schedule_override_reservation",
        { p_rule_id: ruleId, p_target_cost: targetReservationCost }
      );
      if (reservationError) {
        await restorePreviousOverride();
        throw reservationError;
      }
      if (reservation?.funded === false) {
        await restorePreviousOverride();
        return Response.json({ ok: false, error: "There are not enough credits for that content type." }, { status: 402 });
      }
    }

    return Response.json({ ok: true, plan: await loadPlan(context, planRuleId) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "The schedule could not be updated." }, { status: error.status || 500 });
  }
}
