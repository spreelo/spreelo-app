"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  History,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";
import { getMarginSignal } from "../../../lib/contentEconomics";
import { DEFAULT_CONTENT_FORMAT_MAP } from "../../../lib/contentFormatLibrary";

const CATEGORY_VALUES = ["popular", "text", "image_ads", "video", "educational", "sales"];

async function getAdminHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

function formatPercent(value) {
  return `${Math.round(Math.max(0, Number(value || 0)) * 100)}%`;
}

function formatDuration(ms, locale = "en") {
  const value = Number(ms || 0);
  if (!value) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(Math.round(value / 100) / 10).toLocaleString(locale || "en")} s`;
  return `${Math.floor(value / 60000).toLocaleString(locale || "en")}m ${Math.round((value % 60000) / 1000).toLocaleString(locale || "en")}s`;
}

function formatDateTime(value, locale = "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function getRowLabel(row) {
  return row.display_label || row.default_label || DEFAULT_CONTENT_FORMAT_MAP[row.content_type_id]?.default_label || row.content_type_id;
}

function cloneFormats(rows = []) {
  return rows.map((row) => ({
    ...row,
    customer_credit_cost: Number(row.customer_credit_cost || row.effective_credit_cost || 10),
    estimated_cost_sek: row.estimated_cost_sek == null ? "" : String(row.estimated_cost_sek),
  }));
}

export default function AdminContentCreditsPage() {
  const { t, locale } = useUiText(["admin"]);
  const [formats, setFormats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [audit, setAudit] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [referenceCreditValueSek, setReferenceCreditValueSek] = useState("1.70");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [savingReference, setSavingReference] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkCredits, setBulkCredits] = useState("");
  const [editorId, setEditorId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("30d");
  const [resettingId, setResettingId] = useState("");
  const [createDraft, setCreateDraft] = useState({
    content_type_id: "",
    display_label: "",
    description: "",
    category: "popular",
    customer_credit_cost: "10",
    estimated_cost_sek: "",
    available_starter: true,
    available_growth: true,
    available_pro: true,
  });

  useEffect(() => { loadData(statsPeriod); }, [statsPeriod]);

  async function loadData(period = statsPeriod) {
    setLoading(true);
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch(`/api/admin/content-economics?period=${encodeURIComponent(period)}`, { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.contentCredits.loadError"));
      applyPayload(payload);
    } catch (loadError) {
      setError(loadError.message || t("admin.contentCredits.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function applyPayload(payload) {
    setFormats(cloneFormats(payload?.formats || []));
    setSummary(payload?.summary || null);
    setAudit(payload?.audit || []);
    setWarnings(payload?.warnings || []);
    setReferenceCreditValueSek(String(payload?.referenceCreditValueSek ?? 1.7));
    setSelectedIds([]);
  }

  function updateRow(id, changes) {
    setFormats((current) => current.map((row) => row.content_type_id === id ? { ...row, ...changes } : row));
  }

  async function saveRow(row, overrides = {}) {
    const next = { ...row, ...overrides };
    setSavingId(row.content_type_id);
    setError("");
    setMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-economics", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          content_type_id: row.content_type_id,
          display_label: next.display_label || "",
          description: next.description || "",
          category: next.category,
          active: Boolean(next.active),
          customer_credit_cost: Number(next.customer_credit_cost),
          estimated_cost_sek: next.estimated_cost_sek,
          available_starter: Boolean(next.available_starter),
          available_growth: Boolean(next.available_growth),
          available_pro: Boolean(next.available_pro),
          pending_credit_cost: next.pending_credit_cost,
          pending_effective_at: next.pending_effective_at,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.contentCredits.saveError"));
      applyPayload(payload);
      setMessage(t("admin.contentCredits.saved", { name: getRowLabel(next) }));
    } catch (saveError) {
      setError(saveError.message || t("admin.contentCredits.saveError"));
    } finally {
      setSavingId("");
    }
  }

  async function saveReferenceValue() {
    setSavingReference(true);
    setError("");
    setMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-economics", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "update_settings", reference_credit_value_sek: Number(referenceCreditValueSek) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.contentCredits.referenceSaveError"));
      applyPayload(payload);
      setMessage(t("admin.contentCredits.referenceSaved"));
    } catch (saveError) {
      setError(saveError.message || t("admin.contentCredits.referenceSaveError"));
    } finally {
      setSavingReference(false);
    }
  }

  async function resetReliability(contentTypeIds) {
    const ids = Array.isArray(contentTypeIds) ? contentTypeIds : [contentTypeIds];
    const validIds = ids.filter(Boolean);
    if (!validIds.length) return;
    const isAll = validIds.length === formats.length;
    const confirmText = isAll ? t("admin.contentCredits.resetAllConfirm") : t("admin.contentCredits.resetConfirm");
    if (!window.confirm(confirmText)) return;

    setResettingId(isAll ? "__all__" : validIds[0]);
    setError("");
    setMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-economics", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reset_reliability", content_type_ids: validIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.contentCredits.resetError"));
      setStatsPeriod("reset");
      applyPayload(payload);
      setMessage(isAll
        ? t("admin.contentCredits.resetAllDone", { count: validIds.length })
        : t("admin.contentCredits.resetDone"));
    } catch (resetError) {
      setError(resetError.message || t("admin.contentCredits.resetError"));
    } finally {
      setResettingId("");
    }
  }

  async function createType(event) {
    event.preventDefault();
    setSavingId("__create__");
    setError("");
    setMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-economics", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "create_type", ...createDraft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.contentCredits.createError"));
      applyPayload(payload);
      setShowCreate(false);
      setCreateDraft({
        content_type_id: "",
        display_label: "",
        description: "",
        category: "popular",
        customer_credit_cost: "10",
        estimated_cost_sek: "",
        available_starter: true,
        available_growth: true,
        available_pro: true,
      });
      setMessage(t("admin.contentCredits.created"));
    } catch (createError) {
      setError(createError.message || t("admin.contentCredits.createError"));
    } finally {
      setSavingId("");
    }
  }

  async function applyBulk(mode) {
    if (!selectedIds.length) return;
    const parsedCredits = Number.parseInt(bulkCredits, 10);
    if (mode === "credits" && (!Number.isInteger(parsedCredits) || parsedCredits < 1)) {
      setError(t("admin.contentCredits.bulkCreditError"));
      return;
    }

    setSavingId("__bulk__");
    setError("");
    setMessage("");
    try {
      const selected = formats.filter((row) => selectedIds.includes(row.content_type_id));
      const updates = selected.map((row) => ({
        content_type_id: row.content_type_id,
        display_label: row.display_label || "",
        description: row.description || "",
        category: row.category,
        active: mode === "enable" ? true : mode === "disable" ? false : Boolean(row.active),
        customer_credit_cost: mode === "credits" ? parsedCredits : Number(row.customer_credit_cost),
        estimated_cost_sek: row.estimated_cost_sek,
        available_starter: Boolean(row.available_starter),
        available_growth: Boolean(row.available_growth),
        available_pro: Boolean(row.available_pro),
        pending_credit_cost: row.pending_credit_cost,
        pending_effective_at: row.pending_effective_at,
      }));
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-economics", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ updates }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.contentCredits.bulkError"));
      applyPayload(payload);
      setBulkCredits("");
      setMessage(t("admin.contentCredits.bulkSaved", { count: updates.length }));
    } catch (bulkError) {
      setError(bulkError.message || t("admin.contentCredits.bulkError"));
    } finally {
      setSavingId("");
    }
  }

  const filteredFormats = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return formats.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (!normalized) return true;
      return [getRowLabel(row), row.content_type_id, row.description, row.category]
        .some((value) => String(value || "").toLowerCase().includes(normalized));
    });
  }, [formats, query, category]);

  const selectedEditor = formats.find((row) => row.content_type_id === editorId) || null;
  const referenceValue = Math.max(0, Number(referenceCreditValueSek || 0));

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-content-economics-page">
        <a className="admin-back-link" href="/admin"><ArrowLeft size={16} /> {t("admin.contentCredits.back")}</a>

        <header className="admin-hero admin-content-economics-hero">
          <div>
            <span className="admin-eyebrow">{t("admin.contentCredits.kicker")}</span>
            <h1>{t("admin.contentCredits.title")}</h1>
            <p>{t("admin.contentCredits.description")}</p>
          </div>
          <button className="spreelo-action-v14371 primary" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={17} /> {t("admin.contentCredits.addType")}
          </button>
        </header>

        {error ? <div className="admin-alert error"><AlertTriangle size={19} /><span>{error}</span></div> : null}
        {message ? <div className="admin-alert success"><Check size={18} /><span>{message}</span></div> : null}
        {warnings.length ? <div className="admin-alert warning"><AlertTriangle size={18} /><span>{t("admin.contentCredits.partialStats")}</span></div> : null}

        {loading ? (
          <section className="admin-loading-card"><LoaderCircle className="admin-spin" size={22} /> {t("admin.contentCredits.loading")}</section>
        ) : (
          <>
            <section className="admin-econ-summary-grid">
              <article><span><Sparkles size={18} /></span><div><strong>{summary?.activeTypes || 0}</strong><small>{t("admin.contentCredits.activeTypes")}</small></div></article>
              <article><span><Coins size={18} /></span><div><strong>{summary?.averageCredits || 0}</strong><small>{t("admin.contentCredits.avgCredits")}</small></div></article>
              <article><span><BarChart3 size={18} /></span><div><strong>{Number(summary?.generated30d || 0).toLocaleString(locale || "en")}</strong><small>{t("admin.contentCredits.generated30d")}</small></div></article>
              <article><span><Activity size={18} /></span><div><strong>{formatPercent(summary?.successRate30d)}</strong><small>{t("admin.contentCredits.success30d")}</small></div></article>
              <article><span><BadgeDollarSign size={18} /></span><div><strong>{Number(summary?.netCredits30d || 0).toLocaleString(locale || "en")}</strong><small>{t("admin.contentCredits.netCredits30d")}</small></div></article>
            </section>

            <section className="admin-panel admin-econ-reference-panel">
              <div>
                <span className="admin-card-kicker">{t("admin.contentCredits.marginModel")}</span>
                <h2>{t("admin.contentCredits.referenceTitle")}</h2>
                <p>{t("admin.contentCredits.referenceText")}</p>
              </div>
              <div className="admin-econ-reference-control">
                <label><span>{t("admin.contentCredits.sekPerCredit")}</span><input type="number" min="0.01" step="0.01" value={referenceCreditValueSek} onChange={(event) => setReferenceCreditValueSek(event.target.value)} /></label>
                <button type="button" className="spreelo-action-v14371 secondary compact" onClick={saveReferenceValue} disabled={savingReference}>
                  {savingReference ? <LoaderCircle className="admin-spin" size={15} /> : <Save size={15} />} {t("admin.contentCredits.saveReference")}
                </button>
              </div>
            </section>

            <section className="admin-econ-toolbar">
              <label className="admin-econ-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.contentCredits.search")} /></label>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">{t("admin.contentCredits.allCategories")}</option>
                {CATEGORY_VALUES.map((value) => <option value={value} key={value}>{t(`admin.formats.category.${value}`)}</option>)}
              </select>
              <label className="admin-econ-period-select">
                <span>{t("admin.contentCredits.period")}</span>
                <select value={statsPeriod} onChange={(event) => setStatsPeriod(event.target.value)}>
                  {["reset", "7d", "30d", "all"].map((value) => <option value={value} key={value}>{t(`admin.contentCredits.period.${value}`)}</option>)}
                </select>
              </label>
              <button type="button" className="admin-econ-reset-all" onClick={() => resetReliability(formats.map((row) => row.content_type_id))} disabled={resettingId === "__all__"}>
                {resettingId === "__all__" ? <LoaderCircle className="admin-spin" size={15} /> : <RotateCcw size={15} />} {t("admin.contentCredits.resetAll")}
              </button>
              <div className="admin-econ-bulk">
                <span>{t("admin.contentCredits.selected", { count: selectedIds.length })}</span>
                <input type="number" min="1" placeholder={t("admin.contentCredits.creditCost")} value={bulkCredits} onChange={(event) => setBulkCredits(event.target.value)} />
                <button type="button" onClick={() => applyBulk("credits")} disabled={!selectedIds.length || savingId === "__bulk__"}>{t("admin.contentCredits.applyCredits")}</button>
                <button type="button" onClick={() => applyBulk("enable")} disabled={!selectedIds.length || savingId === "__bulk__"}>{t("admin.contentCredits.enable")}</button>
                <button type="button" onClick={() => applyBulk("disable")} disabled={!selectedIds.length || savingId === "__bulk__"}>{t("admin.contentCredits.disable")}</button>
              </div>
            </section>

            <section className="admin-econ-table-wrap">
              <div className="admin-econ-table" role="table" aria-label={t("admin.contentCredits.title")}>
                <div className="admin-econ-table-head" role="row">
                  <span></span>
                  <span>{t("admin.contentCredits.type")}</span>
                  <span>{t("admin.contentCredits.creditCost")}</span>
                  <span>{t("admin.contentCredits.estimatedCost")}</span>
                  <span>{t("admin.contentCredits.margin")}</span>
                  <span>{t("admin.contentCredits.usage30d")}</span>
                  <span>{t("admin.contentCredits.reliability")}</span>
                  <span>{t("admin.contentCredits.plans")}</span>
                  <span>{t("admin.contentCredits.status")}</span>
                  <span></span>
                </div>

                {filteredFormats.map((row) => {
                  const usage = row.usage_30d || {};
                  const margin = getMarginSignal({
                    creditCost: Number(row.customer_credit_cost),
                    estimatedCostSek: Number(row.estimated_cost_sek || 0),
                    referenceCreditValueSek: referenceValue,
                  });
                  const isSaving = savingId === row.content_type_id;
                  const scheduled = row.pending_credit_cost && row.pending_effective_at;

                  return (
                    <div className={`admin-econ-row ${row.active ? "" : "is-disabled"}`} role="row" key={row.content_type_id}>
                      <label className="admin-econ-select"><input type="checkbox" checked={selectedIds.includes(row.content_type_id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, row.content_type_id] : current.filter((id) => id !== row.content_type_id))} /><span /></label>

                      <div className="admin-econ-type-cell">
                        <strong>{getRowLabel(row)}</strong>
                        <code>{row.content_type_id}</code>
                        <div className="admin-econ-badges">
                          <small>{t(`admin.formats.category.${row.category}`)}</small>
                          {row.generator_available ? <small className="ready"><Sparkles size={11} /> {t("admin.contentCredits.generatorReady")}</small> : <small className="catalog"><LockKeyhole size={11} /> {t("admin.contentCredits.catalogOnly")}</small>}
                        </div>
                      </div>

                      <div className="admin-econ-credit-cell">
                        <input type="number" min="1" value={row.customer_credit_cost} onChange={(event) => updateRow(row.content_type_id, { customer_credit_cost: event.target.value })} />
                        <small>{t("admin.contentCredits.credits")}</small>
                        {scheduled ? <em>{t("admin.contentCredits.scheduled", { credits: row.pending_credit_cost, date: formatDateTime(row.pending_effective_at, locale) })}</em> : null}
                      </div>

                      <div className="admin-econ-cost-cell">
                        <input type="number" min="0" step="0.01" placeholder="—" value={row.estimated_cost_sek} onChange={(event) => updateRow(row.content_type_id, { estimated_cost_sek: event.target.value })} />
                        <small>SEK</small>
                      </div>

                      <div className={`admin-econ-margin ${margin.key}`}>
                        <strong>{t(`admin.contentCredits.margin.${margin.key}`)}</strong>
                        {margin.ratio != null ? <small>{formatPercent(margin.ratio)}</small> : <small>{t("admin.contentCredits.addCost")}</small>}
                      </div>

                      <div className="admin-econ-usage-cell">
                        <strong>{Number(usage.generated || 0).toLocaleString(locale || "en")}</strong>
                        <small>{t("admin.contentCredits.generated")}</small>
                        <em>{Number(usage.netCreditsCharged || 0).toLocaleString(locale || "en")} {t("admin.contentCredits.credits")}</em>
                      </div>

                      <div className="admin-econ-reliability-cell">
                        <strong>{usage.generated || usage.failed ? formatPercent(1 - Number(usage.failureRate || 0)) : "—"}</strong>
                        <small>{usage.failed ? t("admin.contentCredits.failedCount", { count: usage.failed }) : t("admin.contentCredits.noFailures")}</small>
                        <em><Clock3 size={11} /> {formatDuration(usage.avgDurationMs, locale)}</em>
                        {row.stats_reset_at ? <em className="reset-note">{t("admin.contentCredits.resetAt", { date: formatDateTime(row.stats_reset_at, locale) })}</em> : null}
                      </div>

                      <div className="admin-econ-plan-cell">
                        {["starter", "growth", "pro"].map((plan) => {
                          const key = `available_${plan}`;
                          return <label key={plan}><input type="checkbox" checked={Boolean(row[key])} onChange={(event) => updateRow(row.content_type_id, { [key]: event.target.checked })} /><span>{plan.slice(0, 1).toUpperCase()}</span></label>;
                        })}
                      </div>

                      <label className="admin-econ-active-switch">
                        <input type="checkbox" checked={Boolean(row.active)} onChange={(event) => updateRow(row.content_type_id, { active: event.target.checked })} />
                        <span /><small>{row.active ? t("admin.contentCredits.active") : t("admin.contentCredits.disabled")}</small>
                      </label>

                      <div className="admin-econ-row-actions">
                        <button type="button" title={t("admin.contentCredits.resetOne")} onClick={() => resetReliability(row.content_type_id)} disabled={resettingId === row.content_type_id}>{resettingId === row.content_type_id ? <LoaderCircle className="admin-spin" size={15} /> : <RotateCcw size={15} />}</button>
                        <button type="button" title={t("admin.contentCredits.editDetails")} onClick={() => setEditorId(row.content_type_id)}><Pencil size={15} /></button>
                        <button type="button" className="save" onClick={() => saveRow(row)} disabled={isSaving}>{isSaving ? <LoaderCircle className="admin-spin" size={15} /> : <Save size={15} />}</button>
                      </div>
                    </div>
                  );
                })}

                {!filteredFormats.length ? <div className="admin-econ-empty">{t("admin.contentCredits.noResults")}</div> : null}
              </div>
            </section>

            <section className="admin-panel admin-econ-audit-panel">
              <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.contentCredits.auditKicker")}</span><h2>{t("admin.contentCredits.auditTitle")}</h2><p>{t("admin.contentCredits.auditText")}</p></div><History size={20} /></div>
              <div className="admin-econ-audit-list">
                {audit.length ? audit.slice(0, 20).map((item) => (
                  <article key={item.id}>
                    <span><History size={14} /></span>
                    <div><strong>{item.content_type_id === "__global__" ? t("admin.contentCredits.globalSettings") : item.content_type_id}</strong><p>{Object.keys(item.changed_fields || {}).join(" · ") || item.change_type}</p></div>
                    <small>{item.changed_by_email || "Admin"}<br />{formatDateTime(item.created_at, locale)}</small>
                  </article>
                )) : <p className="admin-econ-audit-empty">{t("admin.contentCredits.noAudit")}</p>}
              </div>
            </section>
          </>
        )}
      </div>

      {selectedEditor ? (
        <div className="admin-econ-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorId(""); }}>
          <section className="admin-econ-modal" role="dialog" aria-modal="true" aria-labelledby="admin-econ-editor-title">
            <header><div><span className="admin-card-kicker">{t("admin.contentCredits.detailsKicker")}</span><h2 id="admin-econ-editor-title">{getRowLabel(selectedEditor)}</h2><code>{selectedEditor.content_type_id}</code></div><button type="button" onClick={() => setEditorId("")}><X size={18} /></button></header>
            <div className="admin-econ-modal-body">
              <label><span>{t("admin.contentCredits.customerName")}</span><input value={selectedEditor.display_label || ""} placeholder={selectedEditor.default_label || ""} onChange={(event) => updateRow(selectedEditor.content_type_id, { display_label: event.target.value })} /></label>
              <label><span>{t("admin.contentCredits.customerDescription")}</span><textarea rows="3" value={selectedEditor.description || ""} onChange={(event) => updateRow(selectedEditor.content_type_id, { description: event.target.value })} /></label>
              <label><span>{t("admin.contentCredits.category")}</span><select value={selectedEditor.category} onChange={(event) => updateRow(selectedEditor.content_type_id, { category: event.target.value })}>{CATEGORY_VALUES.map((value) => <option value={value} key={value}>{t(`admin.formats.category.${value}`)}</option>)}</select></label>
              <div className="admin-econ-modal-grid">
                <label><span>{t("admin.contentCredits.creditCost")}</span><input type="number" min="1" value={selectedEditor.customer_credit_cost} onChange={(event) => updateRow(selectedEditor.content_type_id, { customer_credit_cost: event.target.value })} /></label>
                <label><span>{t("admin.contentCredits.estimatedCost")}</span><input type="number" min="0" step="0.01" value={selectedEditor.estimated_cost_sek} onChange={(event) => updateRow(selectedEditor.content_type_id, { estimated_cost_sek: event.target.value })} /></label>
              </div>
              <div className="admin-econ-schedule-box">
                <div><strong>{t("admin.contentCredits.scheduleTitle")}</strong><p>{t("admin.contentCredits.scheduleText")}</p></div>
                <label><span>{t("admin.contentCredits.futureCredits")}</span><input type="number" min="1" value={selectedEditor.pending_credit_cost || ""} onChange={(event) => updateRow(selectedEditor.content_type_id, { pending_credit_cost: event.target.value || null })} /></label>
                <label><span>{t("admin.contentCredits.effectiveFrom")}</span><input type="datetime-local" value={selectedEditor.pending_effective_at ? toLocalDateTimeInput(selectedEditor.pending_effective_at) : ""} onChange={(event) => updateRow(selectedEditor.content_type_id, { pending_effective_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
              </div>
              {!selectedEditor.generator_available ? <div className="admin-alert warning"><LockKeyhole size={17} /><span>{t("admin.contentCredits.catalogWarning")}</span></div> : null}
            </div>
            <footer><button type="button" className="spreelo-action-v14371 secondary" onClick={() => setEditorId("")}>{t("admin.contentCredits.close")}</button><button type="button" className="spreelo-action-v14371 primary" onClick={async () => { await saveRow(selectedEditor); setEditorId(""); }} disabled={savingId === selectedEditor.content_type_id}><Save size={16} /> {t("admin.contentCredits.save")}</button></footer>
          </section>
        </div>
      ) : null}

      {showCreate ? (
        <div className="admin-econ-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <form className="admin-econ-modal" onSubmit={createType}>
            <header><div><span className="admin-card-kicker">{t("admin.contentCredits.newKicker")}</span><h2>{t("admin.contentCredits.newTitle")}</h2></div><button type="button" onClick={() => setShowCreate(false)}><X size={18} /></button></header>
            <div className="admin-econ-modal-body">
              <div className="admin-alert warning"><LockKeyhole size={17} /><span>{t("admin.contentCredits.newWarning")}</span></div>
              <label><span>{t("admin.contentCredits.internalKey")}</span><input required pattern="[a-z][a-z0-9_]{2,60}" placeholder="ai_infographic" value={createDraft.content_type_id} onChange={(event) => setCreateDraft((current) => ({ ...current, content_type_id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} /></label>
              <label><span>{t("admin.contentCredits.customerName")}</span><input required value={createDraft.display_label} onChange={(event) => setCreateDraft((current) => ({ ...current, display_label: event.target.value }))} /></label>
              <label><span>{t("admin.contentCredits.customerDescription")}</span><textarea rows="3" value={createDraft.description} onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              <div className="admin-econ-modal-grid">
                <label><span>{t("admin.contentCredits.category")}</span><select value={createDraft.category} onChange={(event) => setCreateDraft((current) => ({ ...current, category: event.target.value }))}>{CATEGORY_VALUES.map((value) => <option value={value} key={value}>{t(`admin.formats.category.${value}`)}</option>)}</select></label>
                <label><span>{t("admin.contentCredits.creditCost")}</span><input type="number" min="1" required value={createDraft.customer_credit_cost} onChange={(event) => setCreateDraft((current) => ({ ...current, customer_credit_cost: event.target.value }))} /></label>
              </div>
            </div>
            <footer><button type="button" className="spreelo-action-v14371 secondary" onClick={() => setShowCreate(false)}>{t("admin.contentCredits.cancel")}</button><button type="submit" className="spreelo-action-v14371 primary" disabled={savingId === "__create__"}>{savingId === "__create__" ? <LoaderCircle className="admin-spin" size={16} /> : <Plus size={16} />} {t("admin.contentCredits.create")}</button></footer>
          </form>
        </div>
      ) : null}
    </AppLayout>
  );
}
