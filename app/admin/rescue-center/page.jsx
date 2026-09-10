"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileJson2,
  FileWarning,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

async function getAdminHeaders(json = true) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function formatDate(value, locale = "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusMeta(value, t) {
  const status = String(value || "");
  if (status === "completed") return { label: t("adminRescue.status.completed"), tone: "success" };
  if (status === "imported" || status === "rescue_imported") return { label: t("adminRescue.status.awaitingApproval"), tone: "attention" };
  if (status === "exported") return { label: t("adminRescue.status.briefCreated"), tone: "attention" };
  if (status === "rescue_needed") return { label: t("adminRescue.status.needsRescue"), tone: "danger" };
  if (status === "queued") return { label: t("adminRescue.status.queued"), tone: "pending" };
  if (status === "running") return { label: t("adminRescue.status.updating"), tone: "pending" };
  if (status === "automatic_pending") return { label: t("adminRescue.status.awaitingAnnualJob"), tone: "pending" };
  if (status === "failed") return { label: t("adminRescue.status.failed"), tone: "danger" };
  return { label: t("adminRescue.status.needsRescue"), tone: "danger" };
}

function campaignDate(item, t) {
  if (item?.event_date) return item.event_date;
  if (item?.start_date && item?.end_date) return `${item.start_date} – ${item.end_date}`;
  return item?.start_date || item?.end_date || t("adminRescue.dateMissing");
}

export default function AdminRescueCenterPage() {
  const { t, locale } = useUiText(["adminRescue"]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("analysis");
  const [busyId, setBusyId] = useState("");
  const [files, setFiles] = useState({});
  const [search, setSearch] = useState("");
  const [manualBrandId, setManualBrandId] = useState("");
  const fileRefs = useRef({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const headers = await getAdminHeaders(false);
      const response = await fetch("/api/admin/rescue-center", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.load"));
      setData(payload);
    } catch (loadError) {
      setError(loadError?.message || t("adminRescue.error.load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createAnnualCase(brand) {
    const headers = await getAdminHeaders();
    const response = await fetch("/api/admin/rescue-center", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "prepare_annual_rescue",
        brandProfileId: brand.brand_profile_id,
        targetYear: data?.targetYear,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.createAnnual"));
    return payload?.rescueCase;
  }

  async function createAnalysisCase() {
    if (!manualBrandId) {
      setError(t("adminRescue.error.chooseBrand"));
      return;
    }
    setBusyId(`manual-analysis:${manualBrandId}`);
    setMessage("");
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/rescue-center", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "prepare_analysis_rescue",
          brandProfileId: manualBrandId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.createAnalysis"));
      const selectedBrand = (data?.analysisBrandOptions || []).find((item) => item.brand_profile_id === manualBrandId);
      setMessage(t("adminRescue.analysisCreated", { brand: selectedBrand?.business_name || t("adminRescue.brandFallback") }));
      setManualBrandId("");
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.createAnalysis"));
    } finally {
      setBusyId("");
    }
  }

  async function fetchBrief(caseId) {
    const headers = await getAdminHeaders(false);
    const response = await fetch(`/api/admin/rescue-center/export?caseId=${encodeURIComponent(caseId)}`, {
      headers,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.createBrief"));
    return payload;
  }

  async function ensureCase(item) {
    if (item?.id) return item;
    if (item?.rescue_case?.id) return item.rescue_case;
    return createAnnualCase(item);
  }

  async function downloadBrief(item) {
    const key = item?.id || item?.brand_profile_id;
    setBusyId(`brief:${key}`);
    setMessage("");
    try {
      const rescueCase = await ensureCase(item);
      const payload = await fetchBrief(rescueCase.id);
      const blob = new Blob([JSON.stringify(payload.brief, null, 2)], { type: "application/json;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = payload.filename || "spreelo-rescue.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage(t("adminRescue.briefCreatedMessage"));
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.createBrief"));
    } finally {
      setBusyId("");
    }
  }

  async function copyPrompt(item) {
    const key = item?.id || item?.brand_profile_id;
    setBusyId(`copy:${key}`);
    setMessage("");
    try {
      const rescueCase = await ensureCase(item);
      const payload = await fetchBrief(rescueCase.id);
      await navigator.clipboard.writeText(payload?.brief?.prompt || "");
      setMessage(t("adminRescue.promptCopied"));
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.copyPrompt"));
    } finally {
      setBusyId("");
    }
  }

  async function uploadPackage(rescueCase) {
    const file = files[rescueCase.id];
    if (!file) {
      setError(t("adminRescue.error.chooseZip"));
      return;
    }
    setBusyId(`upload:${rescueCase.id}`);
    setMessage("");
    setError("");
    try {
      const headers = await getAdminHeaders(false);
      const form = new FormData();
      form.append("case_id", rescueCase.id);
      form.append("file", file);
      const response = await fetch("/api/admin/rescue-center/import", { method: "POST", headers, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.import"));
      setMessage(t("adminRescue.importComplete", { count: payload?.preview?.campaign_count || 0 }));
      setFiles((current) => ({ ...current, [rescueCase.id]: null }));
      if (fileRefs.current[rescueCase.id]) fileRefs.current[rescueCase.id].value = "";
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.import"));
    } finally {
      setBusyId("");
    }
  }

  async function retryCalendarEmail(brand) {
    setBusyId(`email:${brand.brand_profile_id}`);
    setMessage("");
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/rescue-center", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "retry_calendar_email",
          brandProfileId: brand.brand_profile_id,
          targetYear: brand.target_year,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.calendarEmail"));
      setMessage(payload?.email?.sent ? t("adminRescue.calendarEmailSent") : t("adminRescue.calendarEmailAlready"));
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.calendarEmail"));
    } finally {
      setBusyId("");
    }
  }

  async function setCalendarMode(brand, mode) {
    setBusyId(`mode:${brand.brand_profile_id}`);
    setMessage("");
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/rescue-center", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "set_calendar_mode", brandProfileId: brand.brand_profile_id, mode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.calendarMode"));
      setMessage(mode === "automatic" ? t("adminRescue.automaticAgain") : t("adminRescue.manualAnnual"));
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.calendarMode"));
    } finally {
      setBusyId("");
    }
  }

  async function approveCase(rescueCase) {
    setBusyId(`approve:${rescueCase.id}`);
    setMessage("");
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/rescue-center/approve", {
        method: "POST",
        headers,
        body: JSON.stringify({ caseId: rescueCase.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminRescue.error.approve"));
      const emailText = payload?.email?.sent
        ? ` ${t("adminRescue.customerUpdateEmailSent")}`
        : payload?.email?.skipped
          ? ` ${t("adminRescue.customerEmailAlreadySent")}`
          : payload?.email?.error
            ? ` ${t("adminRescue.savedEmailLater")}`
            : "";
      setMessage(`${t("adminRescue.approved", { count: payload?.campaignCount || 0 })}${emailText}`);
      await load();
    } catch (actionError) {
      setError(actionError?.message || t("adminRescue.error.approve"));
    } finally {
      setBusyId("");
    }
  }

  const annualFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data?.annualBrands || [];
    return (data?.annualBrands || []).filter((item) =>
      [item.business_name, item.website_url, item.status, item.content_market]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [data, search]);

  function renderImportControls(rescueCase) {
    if (!rescueCase || rescueCase.status === "completed") return null;
    const imported = rescueCase.status === "imported" && rescueCase.imported_manifest;
    return (
      <div className="rescue109-import-zone">
        {!imported ? (
          <>
            <label className="rescue109-file-picker">
              <Upload size={16} />
              <span>{files[rescueCase.id]?.name || t("adminRescue.chooseZip")}</span>
              <input
                ref={(node) => { if (node) fileRefs.current[rescueCase.id] = node; }}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                onChange={(event) => setFiles((current) => ({ ...current, [rescueCase.id]: event.target.files?.[0] || null }))}
              />
            </label>
            <button type="button" className="rescue109-secondary" disabled={busyId === `upload:${rescueCase.id}`} onClick={() => uploadPackage(rescueCase)}>
              {busyId === `upload:${rescueCase.id}` ? <LoaderCircle className="rescue109-spin" size={16} /> : <Upload size={16} />}
              {t("adminRescue.importPreview")}
            </button>
          </>
        ) : (
          <button type="button" className="rescue109-approve" disabled={busyId === `approve:${rescueCase.id}`} onClick={() => approveCase(rescueCase)}>
            {busyId === `approve:${rescueCase.id}` ? <LoaderCircle className="rescue109-spin" size={16} /> : <CheckCircle2 size={16} />}
            {t("adminRescue.approveType", { type: rescueCase.case_type === "annual_calendar" ? t("adminRescue.calendarLower") : t("adminRescue.analysisLower") })}
          </button>
        )}
      </div>
    );
  }

  function renderPreview(rescueCase) {
    const manifest = rescueCase?.imported_manifest;
    if (!manifest || rescueCase.status !== "imported") return null;
    return (
      <div className="rescue109-preview">
        <div className="rescue109-preview-head">
          <div><span>{t("adminRescue.preview")}</span><strong>{t("adminRescue.campaignCount", { count: manifest.campaign_opportunities?.length || 0 })}</strong></div>
          <ShieldCheck size={20} />
        </div>
        {rescueCase.case_type === "brand_analysis" ? (
          <div className="rescue109-profile-preview">
            <span><b>{t("adminRescue.company")}</b>{manifest.profile?.business_name || "—"}</span>
            <span><b>{t("adminRescue.industry")}</b>{manifest.profile?.industry || "—"}</span>
            <span><b>{t("adminRescue.audience")}</b>{manifest.profile?.target_audience || "—"}</span>
            <span><b>{t("adminRescue.market")}</b>{manifest.market_setup?.contentMarket || "—"}</span>
          </div>
        ) : null}
        <div className="rescue109-campaign-list">
          {(manifest.campaign_opportunities || []).slice(0, 12).map((campaign, index) => (
            <div key={`${campaign.slug || campaign.title}-${index}`}>
              <strong>{campaign.title}</strong>
              <span>{campaignDate(campaign, t)}</span>
              <small>{campaign.campaign_category || campaign.event_type || t("adminRescue.campaign")} · {t("adminRescue.postCount", { count: campaign.recommended_post_count || 0 })}</small>
            </div>
          ))}
        </div>
        <div className="rescue109-sources">
          <b>{t("adminRescue.verifiedSources")}</b>
          {(manifest.verified_sources || []).slice(0, 6).map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.url}<ExternalLink size={12} /></a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <main className="rescue109-page">
        <header className="rescue109-hero">
          <div>
            <span className="rescue109-kicker">{t("adminRescue.kicker")}</span>
            <h1>{t("adminRescue.title")}</h1>
            <p>{t("adminRescue.subtitle")}</p>
          </div>
          <button type="button" className="rescue109-refresh" onClick={load} disabled={loading}><RefreshCw className={loading ? "rescue109-spin" : ""} size={17} /> {t("adminRescue.refresh")}</button>
        </header>

        {error ? <div className="rescue109-alert error"><AlertTriangle size={18} />{error}</div> : null}
        {message ? <div className="rescue109-alert success"><CheckCircle2 size={18} />{message}</div> : null}

        {loading && !data ? (
          <section className="rescue109-loading"><LoaderCircle className="rescue109-spin" size={28} /> {t("adminRescue.loading")}</section>
        ) : (
          <>
            <section className="rescue109-stats">
              <article><FileWarning size={20} /><div><strong>{data?.counts?.failedAnalyses || 0}</strong><span>{t("adminRescue.failedAnalyses")}</span></div></article>
              <article><FileJson2 size={20} /><div><strong>{data?.counts?.failedPosts || 0}</strong><span>{t("adminRescue.failedPosts")}</span></div></article>
              <article><CalendarDays size={20} /><div><strong>{data?.counts?.annualCompleted || 0}/{data?.counts?.annualTotal || 0}</strong><span>{t("adminRescue.calendarsYear", { year: data?.targetYear })}</span></div></article>
              <article><ShieldCheck size={20} /><div><strong>{data?.counts?.annualManual || 0}</strong><span>{t("adminRescue.annualRescueNeeded")}</span></div></article>
            </section>

            <nav className="rescue109-tabs" aria-label={t("adminRescue.navigationLabel")}>
              <button type="button" className={tab === "analysis" ? "active" : ""} onClick={() => setTab("analysis")}>{t("adminRescue.failedAnalyses")} <b>{data?.counts?.failedAnalyses || 0}</b></button>
              <button type="button" className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}>{t("adminRescue.failedPosts")} <b>{data?.counts?.failedPosts || 0}</b></button>
              <button type="button" className={tab === "annual" ? "active" : ""} onClick={() => setTab("annual")}>{t("adminRescue.calendarYear", { year: data?.targetYear })} <b>{data?.counts?.annualTotal || 0}</b></button>
            </nav>

            {tab === "analysis" ? (
              <section className="rescue109-section">
                <div className="rescue109-section-head"><div><span>{t("adminRescue.websiteAnalysis")}</span><h2>{t("adminRescue.analysisNeedsHelp")}</h2><p>{t("adminRescue.analysisNeedsHelpText")}</p></div></div>

                <div className="rescue132-manual-create">
                  <div className="rescue132-manual-copy">
                    <span>{t("adminRescue.manualCase")}</span>
                    <strong>{t("adminRescue.createAnalysisForBrand")}</strong>
                    <p>{t("adminRescue.manualCaseText")}</p>
                  </div>
                  <div className="rescue132-manual-controls">
                    <label>
                      <span>{t("adminRescue.brand")}</span>
                      <select value={manualBrandId} onChange={(event) => setManualBrandId(event.target.value)}>
                        <option value="">{t("adminRescue.chooseBrand")}</option>
                        {(data?.analysisBrandOptions || []).map((brand) => (
                          <option key={brand.brand_profile_id} value={brand.brand_profile_id}>
                            {brand.business_name || t("adminRescue.unnamedBrand")}{brand.website_url ? ` — ${brand.website_url}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="rescue109-primary rescue132-create-button"
                      disabled={!manualBrandId || busyId === `manual-analysis:${manualBrandId}`}
                      onClick={createAnalysisCase}
                    >
                      {busyId === `manual-analysis:${manualBrandId}` ? <LoaderCircle className="rescue109-spin" size={16} /> : <FileJson2 size={16} />}
                      {t("adminRescue.createAnalysisRescue")}
                    </button>
                  </div>
                </div>

                {(data?.analysisCases || []).length ? (data.analysisCases.map((rescueCase) => {
                  const meta = statusMeta(rescueCase.status, t);
                  return <article className="rescue109-case" key={rescueCase.id}>
                    <div className="rescue109-case-top">
                      <div><span className={`rescue109-status ${meta.tone}`}>{meta.label}</span><h3>{rescueCase.brand?.business_name || t("adminRescue.unknownBrand")}</h3><a href={rescueCase.brand?.website_url || "#"} target="_blank" rel="noreferrer">{rescueCase.brand?.website_url || t("adminRescue.websiteMissing")}<ExternalLink size={13} /></a></div>
                      <small>{formatDate(rescueCase.updated_at, locale)}</small>
                    </div>
                    <div className="rescue109-failure"><AlertTriangle size={16} /><div><b>{rescueCase.error_code || "analysis_failed"}</b><span>{rescueCase.error_message || t("adminRescue.analysisAutoFailed")}</span></div></div>
                    <div className="rescue109-actions">
                      <button type="button" className="rescue109-primary" disabled={busyId === `brief:${rescueCase.id}`} onClick={() => downloadBrief(rescueCase)}><Download size={16} /> {t("adminRescue.createBrief")}</button>
                      <button type="button" className="rescue109-ghost" disabled={busyId === `copy:${rescueCase.id}`} onClick={() => copyPrompt(rescueCase)}><ClipboardCopy size={16} /> {t("adminRescue.copyPrompt")}</button>
                    </div>
                    {renderPreview(rescueCase)}
                    {renderImportControls(rescueCase)}
                  </article>;
                })) : <div className="rescue109-empty"><CheckCircle2 size={28} /><strong>{t("adminRescue.noAnalyses")}</strong><span>{t("adminRescue.noAnalysesText")}</span></div>}
              </section>
            ) : null}

            {tab === "posts" ? (
              <section className="rescue109-section">
                <div className="rescue109-section-head"><div><span>{t("adminRescue.postRescue")}</span><h2>{t("adminRescue.failedProductPosts")}</h2><p>{t("adminRescue.failedProductPostsText")}</p></div><a className="rescue109-primary link" href="/admin/post-approvals?view=failed">{t("adminRescue.openFailedPosts")} <ExternalLink size={15} /></a></div>
                {(data?.productFailures || []).length ? <div className="rescue109-table-wrap"><table className="rescue109-table"><thead><tr><th>{t("adminRescue.brand")}</th><th>{t("adminRescue.type")}</th><th>{t("adminRescue.errorLabel")}</th><th>{t("adminRescue.rescue")}</th><th>{t("adminRescue.updated")}</th></tr></thead><tbody>{data.productFailures.map((item) => <tr key={item.id}><td><strong>{item.brand?.business_name || "—"}</strong><span>{item.source_url || item.brand?.website_url || ""}</span></td><td>{item.content_type_label || item.content_type_id || "—"}<span>{item.platform || ""}</span></td><td>{item.failure_code || "—"}<span>{item.failure_stage || ""}</span></td><td><span className={`rescue109-status ${item.rescue_status === "needed" ? "danger" : "attention"}`}>{statusMeta(item.rescue_status === "needed" ? "rescue_needed" : item.rescue_status, t).label}</span></td><td>{formatDate(item.updated_at, locale)}</td></tr>)}</tbody></table></div> : <div className="rescue109-empty"><CheckCircle2 size={28} /><strong>{t("adminRescue.noProductPosts")}</strong><span>{t("adminRescue.noProductPostsText")}</span></div>}
              </section>
            ) : null}

            {tab === "annual" ? (
              <section className="rescue109-section">
                <div className="rescue109-section-head annual"><div><span>{t("adminRescue.annualRenewal")}</span><h2>{t("adminRescue.campaignCalendarYear", { year: data?.targetYear })}</h2><p>{t("adminRescue.annualRenewalText")}</p></div><label className="rescue109-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("adminRescue.searchPlaceholder")} /></label></div>
                <div className="rescue109-progress"><div><span style={{ width: `${data?.counts?.annualTotal ? Math.round((data.counts.annualCompleted / data.counts.annualTotal) * 100) : 0}%` }} /></div><p>{t("adminRescue.progress", { completed: data?.counts?.annualCompleted || 0, total: data?.counts?.annualTotal || 0, manual: data?.counts?.annualManual || 0 })}</p></div>
                <div className="rescue109-annual-list">
                  {annualFiltered.map((brand) => {
                    const meta = statusMeta(brand.status, t);
                    const rescueCase = brand.rescue_case;
                    const canManual = brand.status === "rescue_needed" || brand.status === "rescue_imported" || brand.calendar_generation_mode === "manual_rescue";
                    return <article className="rescue109-annual-row" key={brand.brand_profile_id}>
                      <div className="rescue109-brand"><strong>{brand.business_name || t("adminRescue.unknownBrand")}</strong><span>{brand.website_url || t("adminRescue.websiteMissing")}</span></div>
                      <div className="rescue109-year"><span>{t("adminRescue.now")}</span><b>{brand.current_calendar_year || "—"}</b></div>
                      <div className="rescue109-year"><span>{t("adminRescue.next")}</span><b>{brand.target_year}</b></div>
                      <span className={`rescue109-status ${meta.tone}`}>{meta.label}</span>
                      <div className="rescue109-email-state">{brand.customer_email?.status === "sent" ? <><CheckCircle2 size={15} /> {t("adminRescue.customerInformed")}</> : brand.status === "completed" ? <><AlertTriangle size={15} /> {t("adminRescue.emailWaiting")}</> : <span>—</span>}</div>
                      <div className="rescue109-row-actions">
                        {canManual && brand.status !== "completed" ? <>
                          <button type="button" className="rescue109-icon-btn" title={t("adminRescue.createBrief")} onClick={() => downloadBrief(rescueCase || brand)} disabled={busyId === `brief:${rescueCase?.id || brand.brand_profile_id}`}><Download size={16} /></button>
                          <button type="button" className="rescue109-icon-btn" title={t("adminRescue.copyPrompt")} onClick={() => copyPrompt(rescueCase || brand)}><ClipboardCopy size={16} /></button>
                        </> : null}
                        {brand.status === "completed" && brand.customer_email?.status !== "sent" ? <button type="button" className="rescue109-icon-btn" title={t("adminRescue.retryCalendarEmail")} onClick={() => retryCalendarEmail(brand)} disabled={busyId === `email:${brand.brand_profile_id}`}><RefreshCw className={busyId === `email:${brand.brand_profile_id}` ? "rescue109-spin" : ""} size={16} /></button> : null}
                        {brand.calendar_generation_mode === "manual_rescue" ? <button type="button" className="rescue109-icon-btn" title={t("adminRescue.useAutomaticAgain")} onClick={() => setCalendarMode(brand, "automatic")} disabled={busyId === `mode:${brand.brand_profile_id}`}><ShieldCheck size={16} /></button> : null}
                      </div>
                      {rescueCase && rescueCase.status !== "completed" ? <div className="rescue109-annual-detail">{renderPreview(rescueCase)}{renderImportControls(rescueCase)}</div> : null}
                    </article>;
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </AppLayout>
  );
}
