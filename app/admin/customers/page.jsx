"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

function getMonthRange(monthValue) {
  const [year, month] = String(monthValue || "").split("-").map(Number);
  const now = new Date();
  const safeYear = Number.isFinite(year) ? year : now.getFullYear();
  const safeMonth = Number.isFinite(month) ? month - 1 : now.getMonth();
  return {
    from: new Date(Date.UTC(safeYear, safeMonth, 1)).toISOString(),
    to: new Date(Date.UTC(safeYear, safeMonth + 1, 1)).toISOString(),
  };
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value, locale = "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale || "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPercent(value, locale = "en") {
  return value === null || value === undefined ? "—" : `${Number(value).toLocaleString(locale || "en")} %`;
}

async function getAdminHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}


function WarningPills({ customer, t }) {
  const pills = [];
  if (customer.blockedBrandCount) pills.push(["blocked", t("admin.customers.blocked")]);
  if (customer.failedCount) pills.push(["failed", t("admin.customers.failedCount", { count: customer.failedCount })]);
  if (customer.refundedCredits) pills.push(["refunded", t("admin.customers.refundedCount", { count: customer.refundedCredits })]);
  if (customer.automaticReruns) pills.push(["rerun", t("admin.customers.rerunCount", { count: customer.automaticReruns })]);
  if (!pills.length) pills.push(["ok", t("admin.customers.noWarnings")]);

  return (
    <div className="admin-v140-pill-row">
      {pills.map(([tone, text]) => <span className={`admin-v140-pill ${tone}`} key={`${tone}-${text}`}>{text}</span>)}
    </div>
  );
}

export default function AdminCustomersPage() {
  const { t, locale } = useUiText(["admin"]);
  const [month, setMonth] = useState(currentMonthValue());
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [payload, setPayload] = useState({ customers: [], summary: {}, warnings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const filters = [["all", t("admin.customers.filter.all")], ["failed", t("admin.customers.filter.failed")], ["refunded", t("admin.customers.filter.refunded")], ["blocked", t("admin.customers.filter.blocked")], ["reruns", t("admin.customers.filter.reruns")]];

  useEffect(() => {
    const queryMonth = new URLSearchParams(window.location.search).get("month");
    if (queryMonth && /^\d{4}-\d{2}$/.test(queryMonth)) setMonth(queryMonth);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [month, submittedSearch, filter]);

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const headers = await getAdminHeaders();
      const range = getMonthRange(month);
      const params = new URLSearchParams({ ...range, search: submittedSearch, filter });
      const response = await fetch(`/api/admin/customers?${params.toString()}`, { headers });
      const nextPayload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(nextPayload?.error || t("admin.customers.loadError"));
      setPayload(nextPayload);
    } catch (loadError) {
      setError(loadError.message || t("admin.customers.loadError"));
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => [
    { label: t("admin.customers.customers"), value: payload.summary?.customerCount || 0, Icon: Users },
    { label: t("admin.customers.brands"), value: payload.summary?.brandCount || 0, Icon: Building2 },
    { label: t("admin.customers.completed"), value: payload.summary?.completedOccurrences || 0, Icon: CheckCircle2 },
    { label: t("admin.customers.failed"), value: payload.summary?.failedOccurrences || 0, Icon: AlertTriangle },
    { label: t("admin.customers.refunded"), value: payload.summary?.refundedCredits || 0, Icon: CircleDollarSign },
    { label: t("admin.customers.reruns"), value: payload.summary?.unexpectedAutomaticReruns || 0, Icon: RotateCcw },
  ], [payload.summary, t]);

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-v140-page">
        <a className="admin-back-link" href="/admin"><ArrowLeft size={16} /> {t("admin.customers.back")}</a>

        <header className="admin-hero compact admin-v140-hero">
          <div>
            <span className="admin-eyebrow">{t("admin.customers.kicker")}</span>
            <h1>{t("admin.customers.title")}</h1>
            <p>{t("admin.customers.description")}</p>
          </div>
          <div className="admin-v140-rate-card">
            <span>{t("admin.customers.success")}</span>
            <strong>{formatPercent(payload.summary?.creationSuccessRate, locale)}</strong>
            <small>{t("admin.customers.selectedPeriod")}</small>
          </div>
        </header>

        <section className="admin-panel admin-v140-controls">
          <form onSubmit={(event) => { event.preventDefault(); setSubmittedSearch(search.trim()); }}>
            <label>
              {t("admin.customers.month")}
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <label className="admin-v140-search-label">
              {t("admin.customers.search")}
              <span><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.customers.searchPlaceholder")} /></span>
            </label>
            <button type="submit"><Search size={16} /> {t("admin.customers.searchButton")}</button>
            <button type="button" className="secondary" onClick={loadCustomers}><RefreshCw size={16} /> {t("admin.customers.refresh")}</button>
          </form>
          <div className="admin-v140-filter-row">
            {filters.map(([value, label]) => (
              <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </section>

        {error ? <div className="admin-alert error admin-alert-with-action"><span>{error}</span><button type="button" onClick={loadCustomers}>{t("admin.customers.retry")}</button></div> : null}
        {payload.warnings?.length ? <div className="admin-alert warning"><AlertTriangle size={18} /><div><strong>{t("admin.customers.partial")}</strong><span>{t("admin.customers.partialText", { count: payload.warnings.length })}</span></div></div> : null}

        <section className="admin-stat-grid admin-v140-stat-grid">
          {stats.map(({ label, value, Icon }) => (
            <article className="admin-stat-card" key={label}><span className="admin-stat-icon"><Icon size={19} /></span><strong>{Number(value).toLocaleString(locale || "en")}</strong><span>{label}</span></article>
          ))}
        </section>

        <section className="admin-panel admin-v140-customer-panel">
          <div className="admin-panel-heading">
            <div><span className="admin-card-kicker">{t("admin.customers.periodKicker")}</span><h2>{t("admin.customers.count", { count: payload.customers?.length || 0 })}</h2></div>
            <span className="admin-v140-muted">{t("admin.customers.createdPublished", { created: Number(payload.summary?.createdPosts || 0).toLocaleString(locale || "en"), published: Number(payload.summary?.publishedPosts || 0).toLocaleString(locale || "en") })}</span>
          </div>

          {loading ? (
            <div className="admin-empty-state"><LoaderCircle className="admin-spin" size={22} /> {t("admin.customers.loading")}</div>
          ) : payload.customers?.length ? (
            <div className="admin-v140-customer-list">
              <div className="admin-v140-customer-head"><span>{t("admin.customers.customer")}</span><span>{t("admin.customers.planCredits")}</span><span>{t("admin.customers.result")}</span><span>{t("admin.customers.warnings")}</span><span>{t("admin.customers.lastActive")}</span><span /></div>
              {payload.customers.map((customer) => (
                <a className="admin-v140-customer-row" href={`/admin/customers/${customer.id}?month=${month}`} key={customer.id}>
                  <div className="admin-v140-customer-name"><strong>{customer.name || customer.email || t("admin.customers.unnamed")}</strong><span>{customer.email || "—"}</span><small>{t("admin.customers.brandsCount", { count: customer.brandCount })}</small></div>
                  <div><strong>{customer.planName || "—"}</strong><span>{Number(customer.creditsRemaining || 0).toLocaleString(locale || "en")} {t("admin.customers.credits")}</span><small>{customer.subscriptionStatus || "—"}</small></div>
                  <div className="admin-v140-result-cell"><strong>{formatPercent(customer.successRate, locale)}</strong><span>{t("admin.customers.successResult", { completed: customer.completedCount, failed: customer.failedCount })}</span><small>{t("admin.customers.publishedCount", { count: customer.publishedCount })}</small></div>
                  <WarningPills customer={customer} t={t} />
                  <div><strong>{formatDate(customer.lastActivityAt, locale)}</strong><span>{t("admin.customers.customerSince", { date: formatDate(customer.createdAt, locale) })}</span></div>
                  <ChevronRight size={20} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : (
            <div className="admin-empty-state"><ShieldAlert size={22} /> {t("admin.customers.none")}</div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
