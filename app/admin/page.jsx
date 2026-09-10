"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Coins,
  FileCheck2,
  FlaskConical,
  ImagePlus,
  Languages,
  LayoutGrid,
  LoaderCircle,
  Music2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Shapes,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const EMPTY_STATS = {
  users: 0,
  brands: 0,
  posts: 0,
  activeAutomations: 0,
  failedMedia: 0,
  pendingApproval: 0,
  completedOccurrences: 0,
  failedOccurrences: 0,
  refundedCredits: 0,
  openRescueCases: 0,
  postsThisMonth: 0,
  actionRequired: 0,
};

const EMPTY_INSIGHTS = {
  periodDays: 30,
  topFormats: [],
  topCountries: [],
  daily: [],
  totals: {},
};

function formatDateTime(value, withTime = true, locale = "en") {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale || "en", withTime
      ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric" }
    ).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatUsd(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "—";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(3)}`;
}

function countryFlag(code) {
  const normalized = String(code || "").toUpperCase();
  const known = { SE: "🇸🇪", DK: "🇩🇰", NO: "🇳🇴", DE: "🇩🇪", NL: "🇳🇱", FI: "🇫🇮", GB: "🇬🇧", US: "🇺🇸" };
  return known[normalized] || "🌍";
}

function countryName(code, t) {
  const normalized = String(code || "").toUpperCase();
  const keys = { SE: "sweden", DK: "denmark", NO: "norway", DE: "germany", NL: "netherlands", FI: "finland", GB: "unitedKingdom", US: "unitedStates", OTHER: "other" };
  return keys[normalized] ? t(`adminCommand.country.${keys[normalized]}`) : normalized || t("adminCommand.country.other");
}

function friendlyFormatName(value, t) {
  const raw = String(value || "unknown");
  const keys = {
    website_item: "websiteItem",
    website_carousel: "websiteCarousel",
    website_item_text_ad: "websiteItemTextAd",
    animated_website_item: "animatedWebsiteItem",
    ai_image: "aiImage",
    text: "text",
    faq: "faq",
    tips: "tips",
    mini_guide: "miniGuide",
    checklist: "checklist",
    problem_solution: "problemSolution",
  };
  return keys[raw] ? t(`adminCommand.format.${keys[raw]}`) : raw.replace(/_/g, " ");
}

async function getAdminHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function StatusDot({ status }) {
  return <span className={`admin156-status-dot ${status || "unknown"}`} aria-hidden="true" />;
}

function MiniMetric({ icon: Icon, label, value, sub, tone = "violet", href }) {
  const content = (
    <>
      <span className={`admin156-metric-icon ${tone}`}><Icon size={21} /></span>
      <span className="admin156-metric-copy"><small>{label}</small><strong>{value}</strong><em>{sub}</em></span>
      {href ? <ArrowRight size={18} className="admin156-metric-arrow" /> : null}
    </>
  );
  return href ? <a className={`admin156-metric ${tone}`} href={href}>{content}</a> : <article className={`admin156-metric ${tone}`}>{content}</article>;
}

function QuickGroup({ tone, title, icon: Icon, children }) {
  return (
    <section className={`admin156-quick-group ${tone}`}>
      <div className="admin156-quick-title"><span><Icon size={22} /></span><h3>{title}</h3></div>
      <div className="admin156-quick-list">{children}</div>
    </section>
  );
}

const SYSTEM_HEALTH_LABEL_KEYS = {
  vercel_cron: "adminCommand.system.name.vercel_cron",
  supabase_database: "adminCommand.system.name.supabase_database",
  supabase_storage: "adminCommand.system.name.supabase_storage",
  smart_queue_workers: "adminCommand.system.name.smart_queue_workers",
  openai: "adminCommand.system.name.openai",
  resend: "adminCommand.system.name.resend",
  stripe: "adminCommand.system.name.stripe",
  meta: "adminCommand.system.name.meta",
  kling: "adminCommand.system.name.kling",
  shotstack: "adminCommand.system.name.shotstack",
};

function systemHealthLabel(system, t) {
  const key = SYSTEM_HEALTH_LABEL_KEYS[String(system?.key || system?.system_key || "")];
  return key ? t(key) : String(system?.label || "");
}

function systemHealthMessage(system, t) {
  const key = String(system?.key || system?.system_key || "");
  const status = String(system?.status || system?.latest_status || "");
  if (status === "unconfigured") return t("adminCommand.system.message.notConfigured");
  if (key === "vercel_cron" && status === "up") return t("adminCommand.system.message.vercelRunning");
  if (key === "supabase_database" && status === "up") return t("adminCommand.system.message.databaseHealthy");
  if (key === "supabase_storage" && status === "up") return t("adminCommand.system.message.storageHealthy");
  if (key === "smart_queue_workers") {
    if (status === "up") return t("adminCommand.system.message.workersHealthy", { count: Number(system?.details?.laneCount || 0) });
    if (!system?.details?.latestHeartbeat) return t("adminCommand.system.message.workersMissing");
    const ageMs = Date.now() - new Date(system.details.latestHeartbeat).getTime();
    if (Number.isFinite(ageMs)) return t("adminCommand.system.message.workerHeartbeatOld", { minutes: Math.max(0, Math.round(ageMs / 60000)) });
  }
  if (["openai", "resend", "stripe"].includes(key) && status === "up") return t("adminCommand.system.message.apiAuthHealthy");
  if (key === "meta" && status === "up") return t("adminCommand.system.message.graphAuthHealthy");
  if (["kling", "shotstack"].includes(key) && status === "up") return t("adminCommand.system.message.apiReachable");
  return String(system?.message || "—");
}

function QuickLink({ href, icon: Icon, title, text, badge }) {
  return (
    <a className="admin156-quick-link" href={href}>
      <span className="admin156-quick-link-icon"><Icon size={17} /></span>
      <span><strong>{title}</strong><small>{text}</small></span>
      {badge ? <b>{badge}</b> : null}
      <ArrowRight size={17} />
    </a>
  );
}

export default function AdminDashboardPage() {
  const { t, locale } = useUiText(["adminCommand"]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [generationCosts, setGenerationCosts] = useState({ periodDays: 30, samples: 0, averageUsd: 0, medianUsd: 0, formats: [] });
  const [recentAdjustments, setRecentAdjustments] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [health, setHealth] = useState({ systems: [], incidents: [], summary: { up: 0, degraded: 0, down: 0 }, checkedAt: null, migrationRequired: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminName, setAdminName] = useState("Admin");
  const [translationLocales, setTranslationLocales] = useState([]);
  const [translationStatuses, setTranslationStatuses] = useState({});
  const [selectedLocales, setSelectedLocales] = useState([]);
  const [translationSaving, setTranslationSaving] = useState(false);
  const [translationMessage, setTranslationMessage] = useState("");
  const [backgroundJobCount, setBackgroundJobCount] = useState(0);
  const [backgroundStopping, setBackgroundStopping] = useState(false);
  const [backgroundStopMessage, setBackgroundStopMessage] = useState("");

  useEffect(() => { loadAdminData(); }, []);

  async function loadAdminData() {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const metadata = session?.user?.user_metadata || {};
      const fullName = String(metadata.full_name || metadata.name || session?.user?.email || "Admin").trim();
      setAdminName(fullName.split(/\s+/)[0] || "Admin");
      const headers = await getAdminHeaders();
      const [overviewResponse, translationsResponse, backgroundJobsResponse, healthResponse] = await Promise.all([
        fetch("/api/admin/overview", { headers, cache: "no-store" }),
        fetch("/api/admin/translations", { headers, cache: "no-store" }),
        fetch("/api/admin/openai-background-jobs", { headers, cache: "no-store" }),
        fetch("/api/admin/system-health", { headers, cache: "no-store" }),
      ]);
      const [overviewPayload, translationsPayload, backgroundPayload, healthPayload] = await Promise.all([
        overviewResponse.json().catch(() => ({})),
        translationsResponse.json().catch(() => ({})),
        backgroundJobsResponse.json().catch(() => ({})),
        healthResponse.json().catch(() => ({})),
      ]);
      if (!overviewResponse.ok) throw new Error(overviewPayload?.error || t("adminCommand.error.loadOverview"));
      setStats({ ...EMPTY_STATS, ...(overviewPayload.stats || {}) });
      setInsights({ ...EMPTY_INSIGHTS, ...(overviewPayload.insights || {}) });
      setGenerationCosts(overviewPayload.generationCosts || { periodDays: 30, samples: 0, averageUsd: 0, medianUsd: 0, formats: [] });
      setRecentAdjustments(overviewPayload.recentAdjustments || []);
      setWarnings(overviewPayload.warnings || []);
      if (translationsResponse.ok) {
        setTranslationLocales((translationsPayload.locales || []).filter((item) => item.locale !== translationsPayload.defaultLocale));
        setTranslationStatuses(translationsPayload.statuses || {});
      }
      setBackgroundJobCount(backgroundJobsResponse.ok ? Number(backgroundPayload?.counts?.total || 0) : 0);
      if (healthResponse.ok) setHealth(healthPayload);
      else setWarnings((current) => [...current, { key: "health", message: healthPayload?.error || t("adminCommand.error.health") }]);
    } catch (loadError) {
      setError(loadError?.message || t("adminCommand.error.loadOverview"));
    } finally {
      setLoading(false);
    }
  }

  function toggleLocale(locale) {
    setSelectedLocales((current) => current.includes(locale) ? current.filter((item) => item !== locale) : [...current, locale]);
  }

  async function requestTranslationRefresh() {
    if (!selectedLocales.length) return;
    setTranslationSaving(true);
    setTranslationMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/translations", { method: "POST", headers, body: JSON.stringify({ locales: selectedLocales }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminCommand.error.translationRefresh"));
      setTranslationMessage(t("adminCommand.translationQueued", { count: selectedLocales.length }));
      setSelectedLocales([]);
    } catch (saveError) {
      setTranslationMessage(saveError?.message || t("adminCommand.error.translationRefresh"));
    } finally {
      setTranslationSaving(false);
    }
  }

  async function stopOpenAIBackgroundJobs() {
    if (!window.confirm(t("adminCommand.confirmStopJobs"))) return;
    setBackgroundStopping(true);
    setBackgroundStopMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/openai-background-jobs", { method: "POST", headers, body: JSON.stringify({ confirm: true }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("adminCommand.error.stopJobs"));
      const stopped = Number(payload?.campaignCancelled || 0) + Number(payload?.brandCancelled || 0);
      setBackgroundJobCount(0);
      setBackgroundStopMessage(t("adminCommand.jobsStopped", { count: stopped }));
    } catch (stopError) {
      setBackgroundStopMessage(stopError?.message || t("adminCommand.error.stopJobs"));
    } finally {
      setBackgroundStopping(false);
    }
  }

  const generated30d = Number(insights?.totals?.postsCreated || 0);
  const successRate = Math.round(Number(insights?.totals?.successRate ?? 1) * 100);
  const systemProblems = Number(health?.summary?.down || 0) + Number(health?.summary?.degraded || 0);
  const healthAvailable = Array.isArray(health?.systems) && health.systems.length > 0;
  const allSystemsHealthy = healthAvailable && systemProblems === 0;
  const requestedLocaleCount = useMemo(() => Object.values(translationStatuses || {}).filter((packs) => (packs || []).some((pack) => pack.status === "refresh_requested")).length, [translationStatuses]);

  const dailyBars = useMemo(() => {
    const raw = insights?.daily || [];
    const max = Math.max(1, ...raw.map((row) => Math.max(Number(row.generated || 0), Number(row.published || 0))));
    return raw.slice(-30).map((row) => ({ ...row, max }));
  }, [insights]);

  const formatDonut = useMemo(() => {
    const rows = (insights?.topFormats || []).slice(0, 6);
    const total = Math.max(1, rows.reduce((sum, row) => sum + Number(row.value || 0), 0));
    let cursor = 0;
    const palette = ["#7c3aed", "#9b75f5", "#b8a3ff", "#ff7455", "#f5b547", "#46c7a4"];
    const stops = rows.map((row, index) => {
      const start = cursor;
      cursor += Number(row.value || 0) / total * 100;
      return `${palette[index % palette.length]} ${start}% ${cursor}%`;
    });
    return { rows, total, background: stops.length ? `conic-gradient(${stops.join(",")})` : "#eef1f6" };
  }, [insights]);

  return (
    <AppLayout active="admin">
      <div className="admin156-shell admin-page">
        <header className="admin156-topbar">
          <div><h1>{t("adminCommand.title")}</h1><p>{t("adminCommand.subtitle")}</p></div>
          <div className="admin156-top-actions">
            <button type="button" onClick={loadAdminData}><RefreshCw size={16} /> {t("adminCommand.refresh")}</button>
            <span className={`admin156-overall-status ${allSystemsHealthy ? "up" : "problem"}`}><StatusDot status={allSystemsHealthy ? "up" : healthAvailable ? "degraded" : "unknown"} /> {allSystemsHealthy ? t("adminCommand.systemsOnline") : healthAvailable ? t("adminCommand.systemsNeedReview", { count: systemProblems }) : t("adminCommand.systemUnavailable")}</span>
          </div>
        </header>

        {error ? <div className="admin156-alert danger"><AlertTriangle size={18} /><span>{error}</span><button onClick={loadAdminData}>{t("adminCommand.tryAgain")}</button></div> : null}
        {warnings.length ? <div className="admin156-alert warning"><AlertTriangle size={18} /><span>{t("adminCommand.partialLoad", { count: warnings.length })}</span></div> : null}

        {loading ? (
          <div className="admin156-loading"><LoaderCircle className="admin-spin" size={26} /> {t("adminCommand.loading")}</div>
        ) : (
          <>
            <section className="admin156-hero">
              <div className="admin156-hero-title"><span>{t("adminCommand.kicker")}</span><h2>{t("adminCommand.welcome", { name: adminName })}</h2><p>{t("adminCommand.heroText")}</p></div>
              <div className="admin156-hero-note">{t("adminCommand.heroNoteLine1")}<br/>{t("adminCommand.heroNoteLine2")}</div>
              <div className="admin156-kpis">
                <MiniMetric icon={Users} label={t("adminCommand.metrics.customers")} value={Number(stats.brands || 0).toLocaleString(locale || "en")} sub={t("adminCommand.metrics.activeBrands")} tone="violet" href="/admin/customers" />
                <MiniMetric icon={FileCheck2} label={t("adminCommand.metrics.posts")} value={Number(stats.postsThisMonth || 0).toLocaleString(locale || "en")} sub={t("adminCommand.metrics.generatedThisMonth")} tone="violet" href="/admin/post-approvals" />
                <MiniMetric icon={CheckCircle2} label={t("adminCommand.metrics.generationSuccess")} value={`${successRate}%`} sub={t("adminCommand.last30Days")} tone="green" />
                <MiniMetric icon={AlertTriangle} label={t("adminCommand.metrics.actionRequired")} value={Number(stats.actionRequired || 0).toLocaleString(locale || "en")} sub={t("adminCommand.metrics.waitingNow")} tone="red" href="/admin/post-approvals" />
              </div>
              <div className="admin156-priority-strip">
                <a href="/admin/rescue-center"><AlertTriangle size={18}/><strong>{Number(stats.failedMedia || 0) + Number(stats.openRescueCases || 0)}</strong><span>{t("adminCommand.priority.failedRescue")}</span><ArrowRight size={16}/></a>
                <a href="/admin/post-approvals"><Clock3 size={18}/><strong>{Number(stats.pendingApproval || 0)}</strong><span>{t("adminCommand.priority.pendingApproval")}</span><ArrowRight size={16}/></a>
                <a href="#systemstatus"><ShieldCheck size={18}/><strong>{systemProblems}</strong><span>{t("adminCommand.priority.systemProblems")}</span><ArrowRight size={16}/></a>
                <a className="admin156-priority-all" href="/admin/post-approvals">{t("adminCommand.priority.viewAll")} <ArrowRight size={16}/></a>
              </div>
            </section>

            <section className="admin156-section">
              <div className="admin156-section-head"><div><h2>{t("adminCommand.quick.title")}</h2><p>{t("adminCommand.quick.subtitle")}</p></div></div>
              <div className="admin156-quick-grid">
                <QuickGroup tone="violet" title={t("adminCommand.quick.customersContent")} icon={Users}>
                  <QuickLink href="/admin/customers" icon={Users} title={t("adminCommand.quick.customerList")} text={t("adminCommand.quick.customerListText")} />
                  <QuickLink href="/admin/post-approvals" icon={FileCheck2} title={t("adminCommand.quick.approvals")} text={t("adminCommand.quick.approvalsText")} badge={stats.pendingApproval || null} />
                  <QuickLink href="/admin/mass-tests" icon={FlaskConical} title={t("adminCommand.quick.massTest")} text={t("adminCommand.quick.massTestText")} />
                </QuickGroup>
                <QuickGroup tone="orange" title={t("adminCommand.quick.creativeLibraries")} icon={ImagePlus}>
                  <QuickLink href="/admin/image-backgrounds" icon={ImagePlus} title={t("adminCommand.quick.imageBackgrounds")} text={t("adminCommand.quick.imageBackgroundsText")} />
                  <QuickLink href="/video-backgrounds" icon={Video} title={t("adminCommand.quick.videoBackgrounds")} text={t("adminCommand.quick.videoBackgroundsText")} />
                  <QuickLink href="/admin/music-library" icon={Music2} title={t("adminCommand.quick.videoMusic")} text={t("adminCommand.quick.videoMusicText")} />
                </QuickGroup>
                <QuickGroup tone="green" title={t("adminCommand.quick.economyCredits")} icon={Coins}>
                  <QuickLink href="/admin/credits" icon={CircleDollarSign} title={t("adminCommand.quick.creditAdjustments")} text={t("adminCommand.quick.creditAdjustmentsText")} />
                  <QuickLink href="/admin/content-credits" icon={Coins} title={t("adminCommand.quick.contentCredits")} text={t("adminCommand.quick.contentCreditsText")} />
                  <QuickLink href="#costs" icon={BarChart3} title={t("adminCommand.quick.aiCosts")} text={t("adminCommand.quick.aiCostsText")} />
                </QuickGroup>
                <QuickGroup tone="blue" title={t("adminCommand.quick.systemQuality")} icon={Settings2}>
                  <QuickLink href="/admin/rescue-center" icon={AlertTriangle} title={t("adminCommand.quick.rescueCenter")} text={t("adminCommand.quick.rescueCenterText")} badge={stats.openRescueCases || null} />
                  <QuickLink href="#translations" icon={Languages} title={t("adminCommand.quick.translations")} text={t("adminCommand.quick.translationsText", { count: requestedLocaleCount })} />
                  <QuickLink href="/admin/content-formats" icon={LayoutGrid} title={t("adminCommand.quick.contentFormats")} text={t("adminCommand.quick.contentFormatsText")} />
                  <QuickLink href="/admin/icons" icon={Shapes} title={t("adminCommand.quick.icons")} text={t("adminCommand.quick.iconsText")} />
                </QuickGroup>
              </div>
            </section>

            <section className="admin156-section admin156-performance">
              <div className="admin156-section-head"><div><h2>{t("adminCommand.performance.title")}</h2><p>{t("adminCommand.performance.subtitle")}</p></div><span className="admin156-period">{t("adminCommand.last30Days")}</span></div>
              <div className="admin156-performance-grid">
                <article className="admin156-chart-card admin156-bars-card">
                  <div className="admin156-card-title"><h3>{t("adminCommand.performance.generatedVsPublished")}</h3><span><i className="generated"/> {t("adminCommand.generated")} <i className="published"/> {t("adminCommand.published")}</span></div>
                  <div className="admin156-bars">
                    {dailyBars.length ? dailyBars.map((row) => (
                      <div className="admin156-bar-group" key={row.date} title={t("adminCommand.performance.chartTooltip", { date: row.date, generated: row.generated, published: row.published })}>
                        <div className="admin156-bar generated" style={{ height: `${Math.max(4, Number(row.generated || 0) / row.max * 100)}%` }} />
                        <div className="admin156-bar published" style={{ height: `${Math.max(3, Number(row.published || 0) / row.max * 100)}%` }} />
                      </div>
                    )) : <div className="admin156-no-data">{t("adminCommand.noStatistics")}</div>}
                  </div>
                </article>
                <article className="admin156-chart-card admin156-donut-card">
                  <h3>{t("adminCommand.contentFormats")}</h3>
                  <div className="admin156-donut-wrap"><div className="admin156-donut" style={{ background: formatDonut.background }}><span><strong>{generated30d}</strong>{t("adminCommand.postsLower")}</span></div>
                    <div className="admin156-donut-legend">{formatDonut.rows.map((row, index) => <div key={row.key}><i style={{ background: ["#7c3aed", "#9b75f5", "#b8a3ff", "#ff7455", "#f5b547", "#46c7a4"][index] }}/><span>{friendlyFormatName(row.name || row.key, t)}</span><b>{Math.round(Number(row.value || 0) / formatDonut.total * 100)}%</b></div>)}</div>
                  </div>
                </article>
                <article className="admin156-chart-card admin156-country-card">
                  <h3>{t("adminCommand.topCountries")}</h3>
                  <div className="admin156-country-list">{(insights.topCountries || []).length ? insights.topCountries.slice(0, 6).map((row) => <div key={row.key}><span>{countryFlag(row.key)} {countryName(row.key, t)}</span><strong>{Number(row.value || 0)}</strong></div>) : <p>{t("adminCommand.noCountryStats")}</p>}</div>
                </article>
              </div>
            </section>

            <section className="admin156-section" id="costs">
              <div className="admin156-section-head"><div><h2>{t("adminCommand.costs.title")}</h2><p>{t("adminCommand.costs.subtitle")}</p></div><div className="admin156-cost-summary"><span>{t("adminCommand.costs.median")} <strong>{formatUsd(generationCosts.medianUsd)}</strong></span><span>{t("adminCommand.costs.average")} <strong>{formatUsd(generationCosts.averageUsd)}</strong></span><span>{t("adminCommand.costs.samples")} <strong>{generationCosts.samples || 0}</strong></span></div></div>
              <div className="admin156-cost-grid">
                {(generationCosts.formats || []).length ? generationCosts.formats.slice(0, 8).map((item) => (
                  <article className="admin156-cost-card" key={item.key}>
                    <div><h3>{friendlyFormatName(item.label || item.key, t)}</h3><span>{t("adminCommand.costs.completeRuns", { count: item.samples })}</span></div>
                    <dl><div><dt>{t("adminCommand.costs.median")}</dt><dd>{formatUsd(item.medianUsd)}</dd></div><div><dt>{t("adminCommand.costs.average")}</dt><dd>{formatUsd(item.averageUsd)}</dd></div><div><dt>P90</dt><dd>{formatUsd(item.p90Usd)}</dd></div></dl>
                  </article>
                )) : <div className="admin156-empty-wide">{t("adminCommand.costs.noData")}</div>}
              </div>
            </section>

            <section className="admin156-bottom-grid">
              <article className="admin156-section admin156-adjustments">
                <div className="admin156-section-head compact"><div><h2>{t("adminCommand.credits.recent")}</h2></div><a href="/admin/credits">{t("adminCommand.viewAll")}</a></div>
                <div className="admin156-table-scroll"><table><thead><tr><th>{t("adminCommand.credits.customer")}</th><th>{t("adminCommand.credits.change")}</th><th>{t("adminCommand.credits.newBalance")}</th><th>{t("adminCommand.credits.reason")}</th><th>{t("adminCommand.credits.date")}</th></tr></thead><tbody>{recentAdjustments.length ? recentAdjustments.slice(0, 5).map((item) => <tr key={item.id}><td>{item.target_email || t("adminCommand.unknownAccount")}</td><td className={Number(item.amount) >= 0 ? "positive" : "negative"}>{Number(item.amount) > 0 ? "+" : ""}{Number(item.amount || 0)}</td><td>{Number(item.new_balance || 0).toLocaleString(locale || "en")}</td><td>{item.reason || "—"}</td><td>{formatDateTime(item.created_at, false, locale)}</td></tr>) : <tr><td colSpan="5">{t("adminCommand.credits.none")}</td></tr>}</tbody></table></div>
              </article>

              <article className="admin156-section admin156-system-panel" id="systemstatus">
                <div className="admin156-section-head compact"><div><h2>{t("adminCommand.system.title")}</h2><p>{health.migrationRequired ? t("adminCommand.system.migrationRequired") : t("adminCommand.system.history")}</p></div><button type="button" onClick={loadAdminData}>{t("adminCommand.refresh")}</button></div>
                <div className="admin156-system-list">{(health.systems || []).map((system) => <div key={system.key}><StatusDot status={system.status}/><span><strong>{systemHealthLabel(system, t)}</strong><small>{systemHealthMessage(system, t)}</small></span><em>{system.status === "up" ? t("adminCommand.system.online") : system.status === "unconfigured" ? t("adminCommand.system.unconfigured") : system.status === "degraded" ? t("adminCommand.system.degraded") : t("adminCommand.system.down")}</em><b>{Number(system.uptime30d ?? 100).toFixed(system.uptime30d < 99.95 ? 2 : 1)}%</b></div>)}</div>
                <div className="admin156-incidents"><h3>{t("adminCommand.system.recentHistory")}</h3>{(health.incidents || []).length ? health.incidents.slice(0, 5).map((incident) => <div key={incident.id}><span className={`admin156-incident-icon ${incident.resolved_at ? "resolved" : "open"}`}>{incident.resolved_at ? <CheckCircle2 size={15}/> : <XCircle size={15}/>}</span><span><strong>{systemHealthLabel(incident, t)}</strong><small>{formatDateTime(incident.started_at, true, locale)}{incident.resolved_at ? ` → ${formatDateTime(incident.resolved_at, true, locale)}` : ` · ${t("adminCommand.system.ongoing")}`}</small></span></div>) : <p>{t("adminCommand.system.noIncidents")}</p>}</div>
              </article>
            </section>

            <section className="admin156-section admin156-maintenance" id="translations">
              <div className="admin156-section-head"><div><h2>{t("adminCommand.tools.title")}</h2><p>{t("adminCommand.tools.subtitle")}</p></div></div>
              <div className="admin156-maintenance-grid">
                <article>
                  <div className="admin156-maintenance-title"><Languages size={20}/><div><h3>{t("adminCommand.tools.translations")}</h3><p>{t("adminCommand.tools.translationsText")}</p></div></div>
                  <div className="admin156-language-grid">{translationLocales.map((item) => <button type="button" className={selectedLocales.includes(item.locale) ? "selected" : ""} key={item.locale} onClick={() => toggleLocale(item.locale)}><span>{selectedLocales.includes(item.locale) ? "✓" : ""}</span><strong>{item.nativeName}</strong></button>)}</div>
                  <button className="admin156-action-button" type="button" disabled={!selectedLocales.length || translationSaving} onClick={requestTranslationRefresh}>{translationSaving ? <LoaderCircle className="admin-spin" size={16}/> : <RefreshCw size={16}/>} {t("adminCommand.tools.requestUpdate")}</button>
                  {translationMessage ? <p className="admin156-message">{translationMessage}</p> : null}
                </article>
                <article>
                  <div className="admin156-maintenance-title"><AlertTriangle size={20}/><div><h3>{t("adminCommand.tools.openAiJobs")}</h3><p>{t("adminCommand.tools.openAiJobsText", { count: backgroundJobCount })}</p></div></div>
                  <button className="admin156-danger-button" type="button" onClick={stopOpenAIBackgroundJobs} disabled={backgroundStopping || backgroundJobCount === 0}>{backgroundStopping ? <LoaderCircle className="admin-spin" size={16}/> : <AlertTriangle size={16}/>} {t("adminCommand.tools.stopJobs")}</button>
                  {backgroundStopMessage ? <p className="admin156-message">{backgroundStopMessage}</p> : null}
                </article>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
