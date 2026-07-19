"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { useUiText } from "../../lib/i18n/useUiText";

function getToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

function platformLabels(value) {
  return String(value || "")
    .split(/[,+|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function UpcomingPlanPage() {
  const { t } = useUiText(["upcomingPlan"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [plan, setPlan] = useState({ brandName: "", planName: "", totalCredits: 0, rules: [] });
  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) {
      setError(t("upcomingPlan.invalid"));
      setLoading(false);
      return;
    }
    loadPlan();
  }, [token]);

  async function loadPlan() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/upcoming-plan?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? t("upcomingPlan.invalid") : payload?.error || t("upcomingPlan.loadError"));
      setPlan({ brandName: payload.brandName || "", planName: payload.planName || "", totalCredits: Number(payload.totalCredits || 0), rules: payload.rules || [] });
    } catch (loadError) {
      setError(loadError.message || t("upcomingPlan.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateRule(id, field, value) {
    setPlan((current) => ({
      ...current,
      rules: current.rules.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule),
    }));
    setSuccess("");
  }

  async function saveChanges() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/upcoming-plan?token=${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: plan.rules.map((rule) => ({ id: rule.id, date: rule.date, time: rule.time })) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("upcomingPlan.saveError"));
      setPlan({ brandName: payload.brandName || plan.brandName, planName: payload.planName || plan.planName, totalCredits: Number(payload.totalCredits || plan.totalCredits || 0), rules: payload.rules || plan.rules });
      setSuccess(t("upcomingPlan.saved"));
    } catch (saveError) {
      setError(saveError.message || t("upcomingPlan.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="upcoming-v74-page">
      <section className="upcoming-v74-shell">
        <header className="upcoming-v74-header">
          <span className="upcoming-v74-brand-mark">S</span>
          <div>
            <p>{t("upcomingPlan.eyebrow")}</p>
            <h1>{t("upcomingPlan.title")}</h1>
            <span>{t("upcomingPlan.subtitle")}</span>
          </div>
        </header>

        {loading ? (
          <div className="upcoming-v74-state"><LoaderCircle className="social-v74-spin" />{t("upcomingPlan.loading")}</div>
        ) : error ? (
          <div className="upcoming-v74-state error">{error}</div>
        ) : (
          <>
            <div className="upcoming-v74-summary">
              <div><span>{t("upcomingPlan.brand")}</span><strong>{plan.brandName || "—"}</strong></div>
              <div><span>{t("upcomingPlan.plan")}</span><strong>{plan.planName || "—"}</strong></div>
              <div><span>{t("upcomingPlan.tabUpcoming")}</span><strong>{plan.rules.length}</strong></div>
              <div><span>{t("upcomingPlan.credits")}</span><strong>{plan.totalCredits}</strong></div>
            </div>

            {plan.rules.length ? (
              <div className="upcoming-v74-list">
                {plan.rules.map((rule, index) => (
                  <article className="upcoming-v74-row" key={rule.id}>
                    <span className="upcoming-v74-number">{index + 1}</span>
                    <div className="upcoming-v74-copy">
                      <strong>{rule.content_type_label || rule.post_type || t("upcomingPlan.contentType")}</strong>
                      <span>{platformLabels(rule.platform).join(" · ") || "—"}</span>
                      <small>{t("upcomingPlan.creditCost", { credits: Math.max(1, Number(rule.credit_cost || 1)) })}</small>
                    </div>
                    <label><span><CalendarDays size={15} />{t("upcomingPlan.date")}</span><input type="date" value={rule.date || ""} onChange={(event) => updateRule(rule.id, "date", event.target.value)} /></label>
                    <label><span><Clock3 size={15} />{t("upcomingPlan.time")}</span><input type="time" value={rule.time || ""} onChange={(event) => updateRule(rule.id, "time", event.target.value)} /></label>
                  </article>
                ))}
              </div>
            ) : <div className="upcoming-v74-state">{t("upcomingPlan.empty")}</div>}

            <div className="upcoming-v74-notes">
              <p><CheckCircle2 size={17} />{t("upcomingPlan.homeNote")}</p>
              <p><ShieldCheck size={17} />{t("upcomingPlan.approvalNote")}</p>
            </div>

            {success ? <div className="upcoming-v74-success">{success}</div> : null}
            <button type="button" className="upcoming-v74-save" onClick={saveChanges} disabled={saving || !plan.rules.length}>
              {saving ? <LoaderCircle className="social-v74-spin" size={18} /> : <Save size={18} />}
              {saving ? t("upcomingPlan.saving") : t("upcomingPlan.save")}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
