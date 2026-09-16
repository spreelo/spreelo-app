"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Lock, Save, Sparkles } from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";
import { getContentTypePreferredTimes } from "../../../lib/contentPlanningStrategy";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ADAPTIVE_PLAN_PREFIX = "SPREELO_ADAPTIVE_V1:";
const SMART_SLOTS_BY_WEEKDAY = {
  Monday: ["08:30", "10:30", "13:30", "18:30"], Tuesday: ["09:30", "10:30", "12:15", "18:30"],
  Wednesday: ["09:30", "11:30", "13:30", "19:00"], Thursday: ["10:30", "12:15", "16:30", "18:30"],
  Friday: ["09:30", "11:30", "16:30", "18:30"], Saturday: ["10:30", "14:30", "16:30", "19:00"],
  Sunday: ["10:30", "16:30", "18:30", "19:30"],
};
function addDays(dateValue, days) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateNumber(dateValue) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return NaN;
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function getLocalDate(value, timeZone = "UTC") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(date);
  const values = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function getWeekStart(today) {
  const weekday = weekdayFromDate(today);
  const offset = Math.max(0, WEEKDAYS.indexOf(weekday));
  return addDays(today, -offset);
}

function weekdayDate(weekStart, weekday) {
  return addDays(weekStart, Math.max(0, WEEKDAYS.indexOf(weekday)));
}

function weekdayFromDate(dateValue) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "Monday";
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][jsDay] || "Monday";
}

function preferredDisplayTime(contentTypeId, dateValue, fallbackTime) {
  const weekday = weekdayFromDate(dateValue);
  const allowed = SMART_SLOTS_BY_WEEKDAY[weekday] || [];
  const preferred = getContentTypePreferredTimes(contentTypeId);
  return preferred.find((time) => allowed.includes(time)) || allowed[0] || fallbackTime || "10:30";
}

function formatDate(dateValue, locale) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return dateValue || "—";
  return new Intl.DateTimeFormat(locale || undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getDaypart(time) {
  const [hour, minute] = String(time || "10:30").split(":").map(Number);
  const minutes = (Number(hour) || 0) * 60 + (Number(minute) || 0);
  if (minutes < 10 * 60 + 30) return "morning";
  if (minutes < 13 * 60) return "lateMorning";
  if (minutes < 17 * 60 + 30) return "afternoon";
  return "evening";
}

function daypartLabel(id, t) {
  const keys = {
    morning: "planManager.daypartMorning",
    lateMorning: "planManager.daypartLateMorning",
    afternoon: "planManager.daypartAfternoon",
    evening: "planManager.daypartEvening",
  };
  return t(keys[id] || keys.lateMorning);
}

function parseAdaptive(rule) {
  const notes = String(rule?.strategyNotes || rule?.strategy_notes || "");
  const index = notes.indexOf(ADAPTIVE_PLAN_PREFIX);
  if (index === -1) return null;
  const line = notes.slice(index + ADAPTIVE_PLAN_PREFIX.length).split("\n", 1)[0].trim();
  try { return line ? JSON.parse(line) : null; } catch { return null; }
}

function projectedVariant(rule, baseDate) {
  const config = parseAdaptive(rule);
  if (!config?.enabled || !Array.isArray(config.variants) || !config.variants.length) return null;
  const start = String(config.baseStartDate || rule.runDate || baseDate).slice(0, 10);
  const cycle = Math.max(0, Math.floor((dateNumber(baseDate) - dateNumber(start)) / 7));
  const slotIndex = Math.max(0, Number(config.slotIndex || 0));
  const slotCount = Math.max(1, Number(config.slotCount || 1));
  const variantIndex = config.selectionMode === "cycle"
    ? cycle % config.variants.length
    : (cycle * slotCount + slotIndex) % config.variants.length;
  return config.variants[variantIndex] || null;
}

export default function RecurringPlanManager() {
  const { t, locale } = useUiText();
  const routeParams = useParams();
  const planRuleId = String(routeParams?.id || "");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState("");

  async function loadPlan() {
    setLoading(true);
    setMessage("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      window.location.href = "/login";
      return;
    }
    const response = await fetch(`/api/recurring-plan?plan=${encodeURIComponent(planRuleId)}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.plan) {
      setMessage(payload?.error || t("planManager.loadError"));
      setLoading(false);
      return;
    }
    setPlan(payload.plan);
    setLoading(false);
  }

  useEffect(() => { void loadPlan(); }, [planRuleId]);

  const weekStart = useMemo(() => {
    if (!plan?.today) return "";
    return addDays(getWeekStart(plan.today), weekOffset * 7);
  }, [plan?.today, plan?.timezone, weekOffset]);

  const items = useMemo(() => {
    if (!plan || !weekStart) return [];
    const overrideMap = new Map((plan.overrides || []).map((item) => [`${item.automation_rule_id}|${item.base_run_date}`, item]));
    return (plan.rules || []).filter((rule) => {
      const baseDate = weekdayDate(weekStart, rule.weekday);
      const firstRunDate = String(rule.runDate || "").slice(0, 10);
      return !firstRunDate || baseDate >= firstRunDate;
    }).map((rule) => {
      const baseDate = weekdayDate(weekStart, rule.weekday);
      const override = overrideMap.get(`${rule.id}|${baseDate}`) || null;
      const displayDate = override?.override_run_date || baseDate;
      const occurrence = (plan.occurrences || []).find((item) => {
        if (item.automation_rule_id !== rule.id) return false;
        const occurrenceDate = getLocalDate(item.scheduled_for, plan.timezone);
        return occurrenceDate === displayDate || occurrenceDate === baseDate;
      }) || null;
      const projected = projectedVariant(rule, baseDate);
      const predictedTypeId = projected?.contentTypeId || rule.contentTypeId;
      const locked = displayDate <= plan.today || Boolean(occurrence);
      const key = `${rule.id}|${baseDate}`;
      const draft = drafts[key] || {};
      const hasDraftContentType = Object.prototype.hasOwnProperty.call(draft, "contentTypeId");
      const storedContentOverrideId = String(override?.override_content_type_id || "");
      const manualContentTypeId = hasDraftContentType ? String(draft.contentTypeId || "") : storedContentOverrideId;
      const effectiveDate = draft.date || displayDate;
      const effectiveTypeId = manualContentTypeId || predictedTypeId;
      const effectiveVariant = (rule.variants || []).find((variant) => variant.contentTypeId === effectiveTypeId);
      const effectivePublishTime = draft.date || hasDraftContentType
        ? preferredDisplayTime(effectiveTypeId, effectiveDate, rule.publishTime)
        : String(override?.override_publish_time || rule.publishTime || "").slice(0, 5);
      return {
        key,
        rule,
        baseDate,
        displayDate: effectiveDate,
        contentTypeId: effectiveTypeId,
        manualContentTypeId,
        hasManualContentOverride: Boolean(manualContentTypeId),
        contentTypeLabel: effectiveVariant?.contentTypeLabel || projected?.contentTypeLabel || rule.contentTypeLabel,
        publishTime: effectivePublishTime,
        occurrence,
        locked,
      };
    }).sort((a, b) => `${a.displayDate}|${a.rule.publishTime}`.localeCompare(`${b.displayDate}|${b.rule.publishTime}`));
  }, [plan, weekStart, drafts]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  async function saveItem(item) {
    setSavingKey(item.key);
    setMessage("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch("/api/recurring-plan", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        planRuleId,
        ruleId: item.rule.id,
        baseRunDate: item.baseDate,
        overrideRunDate: item.displayDate,
        overrideContentTypeId: item.manualContentTypeId,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload?.error || t("planManager.saveError"));
      setSavingKey("");
      return;
    }
    setPlan(payload.plan);
    setDrafts((current) => { const next = { ...current }; delete next[item.key]; return next; });
    setSavingKey("");
  }

  return (
    <AppLayout>
      <main className="plan-manager-page">
        <div className="plan-manager-shell">
          <a href="/" className="plan-manager-back"><ArrowLeft size={17} />{t("planManager.backHome")}</a>
          <header className="plan-manager-hero">
            <div><span>{t("planManager.eyebrow")}</span><h1>{plan?.name || t("planManager.title")}</h1><p>{plan?.brandName ? `${plan.brandName} · ` : ""}{t("planManager.subtitle")}</p></div>
            <div className={`plan-manager-state ${plan?.planState === "paused" ? "paused" : "active"}`}><span />{plan?.planState === "paused" ? (plan?.pauseReason === "insufficient_credits" ? t("planManager.pausedForCredits") : t("planManager.paused")) : t("planManager.active")}</div>
          </header>

          {message ? <div className="plan-manager-message">{message}</div> : null}
          {!loading && plan?.pauseReason === "insufficient_credits" ? (
            <div className="plan-manager-message">
              {t("planManager.creditPauseHelp", { credits: plan.creditPauseRequiredAmount || 0 })}
            </div>
          ) : null}
          {loading ? <section className="plan-manager-loading">{t("planManager.loading")}</section> : null}

          {!loading && plan ? (
            <>
              <section className="plan-manager-weeknav">
                <button type="button" onClick={() => setWeekOffset((value) => Math.max(-8, value - 1))} disabled={weekOffset <= -8}><ChevronLeft /></button>
                <div><strong>{formatDate(weekStart, locale)} – {formatDate(addDays(weekStart, 6), locale)}</strong><span>{weekOffset === 0 ? t("planManager.thisWeek") : weekOffset > 0 ? t("planManager.futureWeek", { count: weekOffset }) : t("planManager.pastWeek", { count: Math.abs(weekOffset) })}</span></div>
                <button type="button" onClick={() => setWeekOffset((value) => Math.min(26, value + 1))} disabled={weekOffset >= 26}><ChevronRight /></button>
              </section>

              <section className="plan-manager-weekstrip" aria-label={t("planManager.weekOverview")}>
                {weekDates.map((dateValue, index) => {
                  const count = items.filter((item) => item.displayDate === dateValue).length;
                  const past = dateValue <= plan.today;
                  return <div key={dateValue} className={`${count ? "selected" : ""}${count > 1 ? " double" : ""}${past ? " past" : ""}`}><span>{t(`automation.weekday.short.${WEEKDAYS[index].toLowerCase()}`)}</span><strong>{String(dateValue).slice(-2)}</strong>{count ? <b>{count}</b> : null}</div>;
                })}
              </section>

              <div className="plan-manager-legend"><span><i className="one" />{t("planManager.onePost")}</span><span><i className="two" />{t("planManager.twoPosts")}</span><span><Lock size={14} />{t("planManager.lockedHelp")}</span></div>

              <section className="plan-manager-list">
                {items.map((item) => {
                  const variants = item.rule.variants || [];
                  const occurrenceStatus = item.occurrence?.status;
                  return (
                    <article key={item.key} className={`plan-manager-item${item.locked ? " locked" : ""}`}>
                      <div className="plan-manager-item-date"><CalendarDays /><div><strong>{formatDate(item.displayDate, locale)}</strong><span><Clock3 size={13} />{daypartLabel(getDaypart(item.publishTime || item.rule.publishTime), t)} · {t("planManager.spreeloChoosesTime")}</span></div></div>
                      <div className="plan-manager-item-type"><Sparkles /><div><strong>{item.contentTypeLabel}</strong><span>{item.locked ? (occurrenceStatus ? t("planManager.generatedLocked") : t("planManager.passedLocked")) : item.hasManualContentOverride ? t("planManager.manualOverride") : t("planManager.upcoming")}</span></div></div>
                      {item.locked ? <div className="plan-manager-lock"><Lock />{t("planManager.locked")}{item.occurrence?.post_id ? <a href={`/posts/${item.occurrence.post_id}`}>{t("planManager.openPost")}</a> : null}</div> : (
                        <div className="plan-manager-edit">
                          <label><span>{t("planManager.day")}</span><select value={item.displayDate} onChange={(event) => setDrafts((current) => ({ ...current, [item.key]: { ...(current[item.key] || {}), date: event.target.value } }))}>{weekDates.map((dateValue) => { const otherCount = items.filter((other) => other.key !== item.key && other.displayDate === dateValue).length; return <option key={dateValue} value={dateValue} disabled={dateValue <= plan.today || otherCount >= 2}>{formatDate(dateValue, locale)}</option>; })}</select></label>
                          <label><span>{t("planManager.contentType")}</span><select value={item.manualContentTypeId} onChange={(event) => setDrafts((current) => ({ ...current, [item.key]: { ...(current[item.key] || {}), contentTypeId: event.target.value } }))}><option value="">{t("planManager.autoContentType")}</option>{variants.map((variant) => <option key={variant.contentTypeId} value={variant.contentTypeId}>{variant.contentTypeLabel} · {variant.creditCost} {t("automation.credits")}</option>)}</select></label>
                          <button type="button" onClick={() => saveItem(item)} disabled={savingKey === item.key}><Save size={15} />{savingKey === item.key ? t("planManager.saving") : t("planManager.save")}</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </AppLayout>
  );
}
