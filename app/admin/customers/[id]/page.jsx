"use client";

import { use, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Gauge,
  Globe2,
  LoaderCircle,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import AppLayout from "../../../../components/AppLayout";
import { supabase } from "../../../../lib/supabaseClient";
import { useUiText } from "../../../../lib/i18n/useUiText";

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(value) {
  const [year, month] = String(value || currentMonthValue()).split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

function formatDate(value, locale = "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(value, locale = "en") {
  const ms = Math.max(0, Number(value || 0));
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toLocaleString(locale || "en", { maximumFractionDigits: 1 })} s`;
  return `${(ms / 60000).toLocaleString(locale || "en", { maximumFractionDigits: 1 })} min`;
}

function safeText(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

async function getAdminHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}


function Status({ value }) {
  const normalized = String(value || "unknown").toLowerCase();
  const tone = normalized.includes("complete") || normalized === "published" || normalized === "sent" || normalized === "accessible"
    ? "ok"
    : normalized.includes("fail") || normalized.includes("blocked") || normalized === "error"
      ? "danger"
      : normalized.includes("running") || normalized.includes("pending") || normalized.includes("reserved")
        ? "warning"
        : "neutral";
  return <span className={`admin-v140-status ${tone}`}>{safeText(value)}</span>;
}

function Empty({ children }) {
  return <div className="admin-empty-state">{children}</div>;
}

export default function AdminCustomerCardPage({ params }) {
  const { t, locale } = useUiText(["admin"]);
  const resolvedParams = use(params);
  const customerId = resolvedParams?.id;
  const [month, setMonth] = useState(currentMonthValue());
  const [tab, setTab] = useState("overview");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingReviewPolicyId, setSavingReviewPolicyId] = useState("");
  const tabs = [["overview", t("admin.customer.tab.overview")], ["brands", t("admin.customer.tab.brands")], ["posts", t("admin.customer.tab.posts")], ["credits", t("admin.customer.tab.credits")], ["failures", t("admin.customer.tab.failures")], ["technical", t("admin.customer.tab.technical")]];

  useEffect(() => {
    const queryMonth = new URLSearchParams(window.location.search).get("month");
    if (queryMonth && /^\d{4}-\d{2}$/.test(queryMonth)) setMonth(queryMonth);
  }, []);

  useEffect(() => {
    if (customerId) loadCustomer();
  }, [customerId, month]);

  async function loadCustomer() {
    setLoading(true);
    setError("");
    try {
      const headers = await getAdminHeaders();
      const range = getMonthRange(month);
      const paramsString = new URLSearchParams(range).toString();
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}?${paramsString}`, { headers });
      const nextPayload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(nextPayload?.error || t("admin.customer.loadError"));
      setPayload(nextPayload);
    } catch (loadError) {
      setError(loadError.message || t("admin.customer.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function setBrandReviewPolicy(brandId, required) {
    setSavingReviewPolicyId(brandId);
    setError("");
    try {
      const headers = { ...(await getAdminHeaders()), "Content-Type": "application/json" };
      const response = await fetch("/api/admin/post-approvals", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "set_brand_review_policy", brand_profile_id: brandId, admin_review_required: required }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t("admin.customer.reviewPolicyError"));
      setPayload((current) => current ? {
        ...current,
        brands: (current.brands || []).map((brand) => brand.id === brandId ? { ...brand, admin_review_required: result.brand?.admin_review_required } : brand),
      } : current);
    } catch (policyError) {
      setError(policyError.message || t("admin.customer.reviewPolicyError"));
    } finally {
      setSavingReviewPolicyId("");
    }
  }

  const brandById = useMemo(() => new Map((payload?.brands || []).map((brand) => [brand.id, brand])), [payload?.brands]);
  const ruleById = useMemo(() => new Map((payload?.rules || []).map((rule) => [rule.id, rule])), [payload?.rules]);
  const summary = payload?.summary || {};
  const customer = payload?.customer || {};
  const balance = customer.balance || {};
  const failures = (payload?.occurrences || []).filter((row) => row.status === "failed_terminal");

  const stats = [
    [t("admin.customer.stat.brands"), summary.brandCount || 0, Building2],
    [t("admin.customer.stat.posts"), summary.postsCreated || 0, FileText],
    [t("admin.customer.stat.completed"), summary.completedOccurrences || 0, CheckCircle2],
    [t("admin.customer.stat.failed"), summary.failedOccurrences || 0, AlertTriangle],
    [t("admin.customer.stat.refunded"), summary.refundedCredits || 0, CircleDollarSign],
    [t("admin.customer.stat.reruns"), summary.unexpectedAutomaticReruns || 0, RotateCcw],
  ];

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-v140-page">
        <a className="admin-back-link" href={`/admin/customers?month=${month}`}><ArrowLeft size={16} /> {t("admin.customer.back")}</a>

        {loading && !payload ? <section className="admin-loading-card"><LoaderCircle className="admin-spin" size={24} /> {t("admin.customer.loading")}</section> : null}
        {error ? <div className="admin-alert error admin-alert-with-action"><span>{error}</span><button type="button" onClick={loadCustomer}>{t("admin.customer.retry")}</button></div> : null}

        {payload ? (
          <>
            <header className="admin-hero compact admin-v140-customer-hero">
              <div>
                <span className="admin-eyebrow">{t("admin.customer.kicker")}</span>
                <h1>{customer.name || customer.email || t("admin.customer.unnamed")}</h1>
                <p>{customer.email || "—"} · {t("admin.customer.customerSince", { date: formatDate(customer.createdAt, locale) })}</p>
                <div className="admin-v140-pill-row">
                  <Status value={balance.subscription_status || t("admin.customer.unknownSubscription")} />
                  {summary.blockedBrandCount ? <span className="admin-v140-pill blocked">{t("admin.customer.blockedWebsites", { count: summary.blockedBrandCount })}</span> : <span className="admin-v140-pill ok">{t("admin.customer.webAccessOk")}</span>}
                  {summary.unexpectedAutomaticReruns ? <span className="admin-v140-pill rerun">{t("admin.customer.rerunDetected")}</span> : <span className="admin-v140-pill ok">{t("admin.customer.noReruns")}</span>}
                </div>
              </div>
              <div className="admin-v140-customer-balance">
                <span>{t("admin.customer.availableCredits")}</span>
                <strong>{Number(balance.credits_remaining || 0).toLocaleString(locale || "en")}</strong>
                <small>{safeText(balance.subscription_plan || balance.plan_name)} · {t("admin.customer.monthlyLimit", { count: Number(balance.monthly_credit_limit || 0).toLocaleString(locale || "en") })}</small>
              </div>
            </header>

            {payload.warnings?.length ? <div className="admin-alert warning"><AlertTriangle size={18} /><div><strong>{t("admin.customer.partial")}</strong><span>{t("admin.customer.partialText", { count: payload.warnings.length })}</span></div></div> : null}

            <section className="admin-v140-toolbar">
              <label>{t("admin.customer.month")} <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
              <button type="button" onClick={loadCustomer}><RefreshCw size={16} /> {t("admin.customer.refresh")}</button>
              <a href={`/admin/credits?email=${encodeURIComponent(customer.email || "")}`}><CircleDollarSign size={16} /> {t("admin.customer.adjustCredits")}</a>
            </section>

            <section className="admin-stat-grid admin-v140-stat-grid">
              {stats.map(([label, value, Icon]) => <article className="admin-stat-card" key={label}><span className="admin-stat-icon"><Icon size={19} /></span><strong>{Number(value).toLocaleString(locale || "en")}</strong><span>{label}</span></article>)}
            </section>

            <nav className="admin-v140-tabs" aria-label={t("admin.customer.tabsLabel")}>
              {tabs.map(([value, label]) => <button type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{label}</button>)}
            </nav>

            {tab === "overview" ? (
              <div className="admin-v140-two-column">
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.resultsKicker")}</span><h2>{t("admin.customer.creationPublishing")}</h2></div></div>
                  <dl className="admin-v140-metric-list">
                    <div><dt>{t("admin.customer.successRate")}</dt><dd>{summary.creationSuccessRate === null ? "—" : `${summary.creationSuccessRate} %`}</dd></div>
                    <div><dt>{t("admin.customer.publishedPosts")}</dt><dd>{summary.publishedPosts || 0}</dd></div>
                    <div><dt>{t("admin.customer.publishFailures")}</dt><dd>{summary.publishFailed || 0}</dd></div>
                    <div><dt>{t("admin.customer.activePlans")}</dt><dd>{summary.activeAutomationCount || 0}</dd></div>
                    <div><dt>{t("admin.customer.pausedPlans")}</dt><dd>{summary.pausedAutomationCount || 0}</dd></div>
                    <div><dt>{t("admin.customer.runningRuns")}</dt><dd>{summary.runningOccurrences || 0}</dd></div>
                  </dl>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.accountKicker")}</span><h2>{t("admin.customer.customerDetails")}</h2></div></div>
                  <dl className="admin-v140-detail-list">
                    <div><dt>{t("admin.customer.email")}</dt><dd>{customer.email || "—"}</dd></div>
                    <div><dt>{t("admin.customer.phone")}</dt><dd>{customer.phone || "—"}</dd></div>
                    <div><dt>{t("admin.customer.lastSignIn")}</dt><dd>{formatDate(customer.lastSignInAt, locale)}</dd></div>
                    <div><dt>{t("admin.customer.provider")}</dt><dd>{customer.appMetadata?.provider || "—"}</dd></div>
                    <div><dt>{t("admin.customer.customerId")}</dt><dd className="admin-mono">{customer.id}</dd></div>
                  </dl>
                </section>
                <section className="admin-panel admin-v140-wide-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.latestEvents")}</span><h2>{t("admin.customer.automaticRuns")}</h2></div></div>
                  {(payload.occurrences || []).length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("admin.customer.time")}</th><th>{t("admin.customer.brand")}</th><th>{t("admin.customer.plan")}</th><th>{t("admin.customer.status")}</th><th>{t("admin.customer.credits")}</th><th>{t("admin.customer.message")}</th></tr></thead><tbody>{payload.occurrences.slice(0, 12).map((row) => <tr key={row.id}><td>{formatDate(row.started_at, locale)}</td><td>{brandById.get(row.brand_profile_id)?.business_name || "—"}</td><td>{ruleById.get(row.automation_rule_id)?.name || row.rule_name || "—"}</td><td><Status value={row.status} /></td><td>{row.refunded_credits ? t("admin.customer.refundedValue", { count: row.refunded_credits }) : "—"}</td><td>{row.failure_customer_message || "—"}</td></tr>)}</tbody></table></div> : <Empty>{t("admin.customer.noRunHistory")}</Empty>}
                </section>
              </div>
            ) : null}

            {tab === "brands" ? (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.brandsCount", { count: payload.brands.length })}</span><h2>{t("admin.customer.customerBrands")}</h2></div></div>
                {payload.brands.length ? <div className="admin-v140-brand-grid">{payload.brands.map((brand) => (
                  <article key={brand.id} className="admin-v14401-customer-brand-card">
                    <header><span className="admin-v140-brand-icon"><Building2 size={19} /></span><div><h3>{brand.business_name || t("admin.customer.unnamedBrand")}</h3><p>{brand.website_url || t("admin.customer.noWebsite")}</p></div><Status value={brand.website_access_status || t("admin.customer.unknown")} /></header>
                    <div className={`admin-v14401-customer-policy ${brand.admin_review_required === false ? "direct" : "review"}`}>
                      <div><ShieldCheck size={16} /><span><strong>{t("admin.customer.reviewPolicyTitle")}</strong><small>{brand.admin_review_required === false ? t("admin.customer.reviewPolicyDirect") : t("admin.customer.reviewPolicyAdmin")}</small></span></div>
                      <button type="button" disabled={savingReviewPolicyId === brand.id} className={brand.admin_review_required !== false ? "on" : ""} onClick={() => setBrandReviewPolicy(brand.id, brand.admin_review_required === false)} aria-pressed={brand.admin_review_required !== false}><span /></button>
                    </div>
                    <dl><div><dt>{t("admin.customer.industry")}</dt><dd>{brand.industry || "—"}</dd></div><div><dt>{t("admin.customer.market")}</dt><dd>{brand.content_market || brand.country_code || "—"}</dd></div><div><dt>{t("admin.customer.language")}</dt><dd>{brand.content_language || "—"}</dd></div><div><dt>{t("admin.customer.productSource")}</dt><dd>{brand.website_product_source_url || "—"}</dd></div><div><dt>{t("admin.customer.securitySystem")}</dt><dd>{brand.website_security_provider || "—"}</dd></div><div><dt>{t("admin.customer.lastChecked")}</dt><dd>{formatDate(brand.website_access_checked_at, locale)}</dd></div></dl>
                    {brand.website_access_message ? <p className="admin-v140-brand-message">{brand.website_access_message}</p> : null}
                  </article>
                ))}</div> : <Empty>{t("admin.customer.noBrands")}</Empty>}
              </section>
            ) : null}

            {tab === "posts" ? (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.selectedMonth")}</span><h2>{t("admin.customer.postHistory")}</h2></div></div>
                {payload.posts.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("admin.customer.date")}</th><th>{t("admin.customer.brand")}</th><th>{t("admin.customer.format")}</th><th>{t("admin.customer.platform")}</th><th>{t("admin.customer.generationStatus")}</th><th>{t("admin.customer.publishing")}</th><th>{t("admin.customer.models")}</th></tr></thead><tbody>{payload.posts.map((post) => <tr key={post.id}><td>{formatDate(post.scheduled_for || post.created_at, locale)}</td><td>{brandById.get(post.brand_profile_id)?.business_name || "—"}</td><td>{post.content_format || post.post_type || "—"}</td><td>{post.platform || "—"}</td><td><Status value={post.status} /></td><td>{post.published_at ? formatDate(post.published_at, locale) : post.last_publish_error ? t("admin.customer.errorPrefix", { message: post.last_publish_error }) : "—"}</td><td>{[post.text_model_used, post.image_model_used, post.product_research_model_used].filter(Boolean).join(", ") || "—"}</td></tr>)}</tbody></table></div> : <Empty>{t("admin.customer.noPosts")}</Empty>}
              </section>
            ) : null}

            {tab === "credits" ? (
              <section className="admin-panel">
                <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.immutableHistory")}</span><h2>{t("admin.customer.creditLedger")}</h2></div><a href={`/admin/credits?email=${encodeURIComponent(customer.email || "")}`}>{t("admin.customer.manualAdjustment")}</a></div>
                {payload.creditLedger.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("admin.customer.date")}</th><th>{t("admin.customer.event")}</th><th>{t("admin.customer.source")}</th><th>{t("admin.customer.change")}</th><th>{t("admin.customer.reason")}</th><th>{t("admin.customer.plan")}</th></tr></thead><tbody>{payload.creditLedger.map((row) => <tr key={`${row.source}-${row.id}`}><td>{formatDate(row.created_at, locale)}</td><td>{row.event_type || "—"}</td><td>{row.source}</td><td className={Number(row.amount) >= 0 ? "positive" : "negative"}>{Number(row.amount) > 0 ? "+" : ""}{Number(row.amount || 0)}</td><td>{row.reason || "—"}</td><td>{ruleById.get(row.automation_rule_id)?.name || "—"}</td></tr>)}</tbody></table></div> : <Empty>{t("admin.customer.noCreditHistory")}</Empty>}
              </section>
            ) : null}

            {tab === "failures" ? (
              <div className="admin-v140-two-column">
                <section className="admin-panel admin-v140-wide-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.failuresCount", { count: failures.length })}</span><h2>{t("admin.customer.failuresRefunds")}</h2></div></div>
                  {failures.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("admin.customer.time")}</th><th>{t("admin.customer.brand")}</th><th>{t("admin.customer.format")}</th><th>{t("admin.customer.errorType")}</th><th>{t("admin.customer.customerMessage")}</th><th>{t("admin.customer.refunded")}</th><th>{t("admin.customer.mail")}</th></tr></thead><tbody>{failures.map((row) => <tr key={row.id}><td>{formatDate(row.started_at, locale)}</td><td>{brandById.get(row.brand_profile_id)?.business_name || "—"}</td><td>{row.content_format || ruleById.get(row.automation_rule_id)?.content_type_label || "—"}</td><td><Status value={row.failure_code || "unknown"} /></td><td>{row.failure_customer_message || "—"}</td><td>{Number(row.refunded_credits || 0)}</td><td><Status value={row.notification_status || "not_sent"} /></td></tr>)}</tbody></table></div> : <Empty>{t("admin.customer.noFailures")}</Empty>}
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.distribution")}</span><h2>{t("admin.customer.commonFailures")}</h2></div></div>
                  {Object.keys(summary.failureReasons || {}).length ? <div className="admin-v140-reason-list">{Object.entries(summary.failureReasons).sort((a,b)=>b[1]-a[1]).map(([reason,count]) => <div key={reason}><span>{reason}</span><strong>{count}</strong></div>)}</div> : <Empty>{t("admin.customer.noFailureReasons")}</Empty>}
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.communication")}</span><h2>{t("admin.customer.sentMessages")}</h2></div></div>
                  {(payload.notifications || []).length ? <div className="admin-v140-notification-list">{payload.notifications.slice(0,20).map((row) => <article key={row.id}><Mail size={17}/><div><strong>{row.subject || row.notification_type || t("admin.customer.notification")}</strong><span>{formatDate(row.sent_at || row.created_at, locale)}</span><p>{row.error_message || row.recipient || "—"}</p></div><Status value={row.status} /></article>)}</div> : <Empty>{t("admin.customer.noNotifications")}</Empty>}
                </section>
              </div>
            ) : null}

            {tab === "technical" ? (
              <div className="admin-v140-two-column">
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.costUsage")}</span><h2>{t("admin.customer.technicalSummary")}</h2></div></div>
                  <dl className="admin-v140-metric-list"><div><dt>{t("admin.customer.totalRunTime")}</dt><dd>{formatDuration(payload.technical.totalRunDurationMs, locale)}</dd></div><div><dt>{t("admin.customer.selectedProducts")}</dt><dd>{payload.technical.totalProductsSelected || 0}</dd></div><div><dt>{t("admin.customer.aiCost")}</dt><dd>{payload.technical.exactAiCostAvailable ? t("admin.customer.available") : t("admin.customer.notExact")}</dd></div><div><dt>{t("admin.customer.automaticReruns")}</dt><dd>{summary.unexpectedAutomaticReruns || 0}</dd></div></dl>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.modelKicker")}</span><h2>{t("admin.customer.modelsUsed")}</h2></div></div>
                  {payload.technical.modelsUsed.length ? <div className="admin-v140-model-list">{payload.technical.modelsUsed.map((model) => <span key={model}>{model}</span>)}</div> : <Empty>{t("admin.customer.noModelData")}</Empty>}
                </section>
                <section className="admin-panel admin-v140-wide-panel">
                  <div className="admin-panel-heading"><div><span className="admin-card-kicker">{t("admin.customer.operationsLog")}</span><h2>{t("admin.customer.automationRuns")}</h2></div></div>
                  {payload.runLogs.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("admin.customer.start")}</th><th>{t("admin.customer.brand")}</th><th>{t("admin.customer.plan")}</th><th>{t("admin.customer.status")}</th><th>{t("admin.customer.duration")}</th><th>{t("admin.customer.products")}</th><th>{t("admin.customer.searchMethods")}</th><th>{t("admin.customer.error")}</th></tr></thead><tbody>{payload.runLogs.map((row) => <tr key={row.id}><td>{formatDate(row.started_at, locale)}</td><td>{row.brand_name || brandById.get(row.brand_profile_id)?.business_name || "—"}</td><td>{row.rule_name || row.campaign_title || "—"}</td><td><Status value={row.status} /></td><td>{formatDuration(row.duration_ms, locale)}</td><td>{row.products_selected || 0}</td><td>{Array.isArray(row.search_methods) ? row.search_methods.join(", ") : row.search_methods || "—"}</td><td>{row.error_message || row.failure_customer_message || "—"}</td></tr>)}</tbody></table></div> : <Empty>{t("admin.customer.noTechnicalLogs")}</Empty>}
                </section>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
