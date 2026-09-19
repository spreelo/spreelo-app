"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Eye,
  Gauge,
  Heart,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  Share2,
  Sparkles,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const RANGE_OPTIONS = [7, 30, 90];
const PLATFORM_ORDER = ["facebook", "instagram", "tiktok", "youtube", "pinterest", "threads"];
const PLATFORM_META = {
  facebook: { label: "Facebook", icon: "/social-icons/facebook.png" },
  instagram: { label: "Instagram", icon: "/social-icons/instagram.png" },
  tiktok: { label: "TikTok", icon: "/social-icons/tiktok.png" },
  youtube: { label: "YouTube", icon: "/social-icons/youtube.png" },
  pinterest: { label: "Pinterest", icon: "/social-icons/pinterest.png" },
  threads: { label: "Threads", icon: "/social-icons/threads.svg" },
};

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function sumMetric(rows, key) {
  return rows.reduce((total, row) => total + (hasNumber(row?.[key]) ? safeNumber(row[key]) : 0), 0);
}

function humanize(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatCompact(value, locale) {
  return new Intl.NumberFormat(locale || "en", {
    notation: Math.abs(Number(value) || 0) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function formatDate(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale || "en", { day: "numeric", month: "short" }).format(date);
}

function formatDateTime(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale || "en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncate(value, max = 118) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function getExposure(row) {
  for (const key of ["reach", "impressions", "views"]) {
    if (hasNumber(row?.[key]) && Number(row[key]) > 0) return Number(row[key]);
  }
  return 0;
}

function getInteractionCount(row) {
  if (hasNumber(row?.engagements)) return safeNumber(row.engagements);
  return ["likes", "comments", "shares", "saves"].reduce(
    (total, key) => total + (hasNumber(row?.[key]) ? safeNumber(row[key]) : 0),
    0
  );
}

function getInteractionRate(rows) {
  let interactions = 0;
  let exposure = 0;
  for (const row of rows) {
    const rowExposure = getExposure(row);
    if (rowExposure <= 0) continue;
    interactions += getInteractionCount(row);
    exposure += rowExposure;
  }
  return exposure > 0 ? (interactions / exposure) * 100 : null;
}

function getPostScore(row) {
  const exposure = getExposure(row);
  const interactions = getInteractionCount(row);
  const clicks = safeNumber(row?.clicks);
  const saves = safeNumber(row?.saves);
  return interactions * 4 + clicks * 5 + saves * 3 + Math.log10(Math.max(1, exposure)) * 4;
}

function aggregateByPlatform(rows) {
  const result = {};
  for (const platform of PLATFORM_ORDER) {
    const platformRows = rows.filter((row) => row.platform === platform);
    result[platform] = {
      posts: platformRows.length,
      views: sumMetric(platformRows, "views"),
      reach: sumMetric(platformRows, "reach"),
      impressions: sumMetric(platformRows, "impressions"),
      interactions: platformRows.reduce((total, row) => total + getInteractionCount(row), 0),
      lastCapturedAt: platformRows.map((row) => row.captured_at).filter(Boolean).sort().at(-1) || null,
    };
  }
  return result;
}

function buildDailySeries(rows, rangeDays) {
  const now = new Date();
  const buckets = [];
  const bucketCount = rangeDays <= 7 ? rangeDays : rangeDays <= 30 ? 15 : 18;
  const bucketDays = Math.max(1, Math.ceil(rangeDays / bucketCount));

  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - index * bucketDays - (bucketDays - 1));
    const end = new Date(start);
    end.setDate(end.getDate() + bucketDays);
    buckets.push({ start, end, exposure: 0, interactions: 0, posts: 0 });
  }

  for (const row of rows) {
    const date = new Date(row.published_at || row.captured_at || 0);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = buckets.find((item) => date >= item.start && date < item.end);
    if (!bucket) continue;
    bucket.exposure += getExposure(row);
    bucket.interactions += getInteractionCount(row);
    bucket.posts += 1;
  }

  return buckets;
}

function buildLinePath(values, width = 760, height = 180, padding = 14) {
  if (!values.length) return "";
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  return values.map((value, index) => {
    const x = padding + index * step;
    const y = height - padding - (safeNumber(value) / max) * (height - padding * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function getConnectionForPlatform(connections, platform) {
  return (connections || []).find((connection) => connection.platform === platform && connection.status === "connected")
    || (connections || []).find((connection) => connection.platform === platform)
    || null;
}

function getPlatformCollectionStatus(states, platform, connection, stats) {
  if (!connection || connection.status !== "connected") return "not_connected";
  const platformStates = (states || []).filter((state) => state.platform === platform);
  if (platformStates.some((state) => state.status === "scope_missing")) return "scope_missing";
  if (platformStates.some((state) => state.status === "auth_error")) return "auth_error";
  if (platformStates.some((state) => state.status === "healthy") || stats?.posts > 0) return "healthy";
  if (platformStates.some((state) => ["pending", "transient_error"].includes(state.status))) return "collecting";
  return "waiting";
}

function getLearningSignalLabel(t, signal) {
  if (!signal?.key) return "";
  if (signal.kind === "content") {
    const translated = t(`automation.contentType.${signal.key}.label`);
    if (translated && translated !== `automation.contentType.${signal.key}.label`) return translated;
  }
  const formatLabels = {
    single_image: t("growBrain.formatSingleImage"),
    animated_video: t("growBrain.formatAnimatedVideo"),
    carousel: t("growBrain.formatCarousel"),
    video: t("growBrain.formatVideo"),
  };
  return formatLabels[signal.key] || signal.label || humanize(signal.key);
}

function MetricCard({ icon: Icon, label, value, detail, loading }) {
  return (
    <article className="grow-v215-metric-card grow-v216-metric-card">
      <span className="grow-v215-metric-icon"><Icon size={19} aria-hidden="true" /></span>
      <div><span>{label}</span><strong>{loading ? "—" : value}</strong><small>{detail}</small></div>
      <span className="grow-v216-metric-glow" aria-hidden="true" />
    </article>
  );
}

function PlatformIcon({ platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <span className="grow-v215-platform-icon" aria-hidden="true">
      {meta?.icon ? <img src={meta.icon} alt="" /> : <Activity size={18} />}
    </span>
  );
}

export default function GrowBrainPage() {
  const { t, locale } = useUiText(["growBrain", "automation"]);
  const [currentBrand, setCurrentBrand] = useState(null);
  const [connections, setConnections] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [collectionStates, setCollectionStates] = useState([]);
  const [learningProfile, setLearningProfile] = useState(null);
  const [postsById, setPostsById] = useState({});
  const [rangeDays, setRangeDays] = useState(30);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [chartMetric, setChartMetric] = useState("interactions");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => { void loadDashboard(); }, []);

  async function resolveBrand(user) {
    const savedBrandId = typeof window !== "undefined" ? localStorage.getItem(getBrandStorageKey(user.id)) : "";
    if (savedBrandId) {
      const { data } = await supabase.from("brand_profiles").select("id,business_name,website_url").eq("id", savedBrandId).eq("user_id", user.id).maybeSingle();
      if (data?.id) return data;
    }
    const { data, error } = await supabase.from("brand_profiles").select("id,business_name,website_url,is_default,created_at").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.id && typeof window !== "undefined") localStorage.setItem(getBrandStorageKey(user.id), data.id);
    return data || null;
  }

  async function loadDashboard({ quiet = false } = {}) {
    if (quiet) setRefreshing(true); else setLoading(true);
    setErrorMessage("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user) { window.location.href = "/login"; return; }
      const brand = await resolveBrand(user);
      setCurrentBrand(brand);
      if (!brand?.id) return;

      const [connectionResult, performanceResult, stateResult, learningResult] = await Promise.all([
        supabase.from("social_connections").select("id,platform,page_name,status,permissions,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).in("platform", PLATFORM_ORDER).order("updated_at", { ascending: false }),
        supabase.from("post_performance_latest").select("post_id,platform,content_type_id,content_format,published_at,captured_at,views,reach,impressions,likes,comments,shares,saves,clicks,engagements,watch_time_seconds,average_watch_time_seconds").eq("user_id", user.id).eq("brand_profile_id", brand.id).order("captured_at", { ascending: false }).limit(600),
        supabase.from("post_performance_collection_state").select("post_id,platform,status,last_attempt_at,last_success_at,next_collect_at,last_error,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).order("updated_at", { ascending: false }).limit(600),
        supabase.from("brand_learning_profiles").select("brand_profile_id,learning_state,source_event_count,approved_count,rejected_count,profile_json,last_event_at,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).maybeSingle(),
      ]);
      if (connectionResult.error) throw connectionResult.error;
      if (performanceResult.error) throw performanceResult.error;
      if (stateResult.error) throw stateResult.error;
      if (learningResult.error && learningResult.error.code !== "PGRST116") throw learningResult.error;

      const perfRows = performanceResult.data || [];
      setConnections(connectionResult.data || []);
      setPerformance(perfRows);
      setCollectionStates(stateResult.data || []);
      setLearningProfile(learningResult.data || null);

      const postIds = [...new Set(perfRows.map((row) => row.post_id).filter(Boolean))].slice(0, 300);
      if (postIds.length) {
        const { data: posts, error: postsError } = await supabase.from("posts").select("id,content,idea,post_type,content_format,published_at,image_url,video_url").eq("user_id", user.id).eq("brand_profile_id", brand.id).in("id", postIds);
        if (!postsError) setPostsById(Object.fromEntries((posts || []).map((post) => [post.id, post])));
      } else setPostsById({});
    } catch (error) {
      console.error("Could not load Grow Brain dashboard", error);
      setErrorMessage(error?.message || t("growBrain.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const rangeStart = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (rangeDays - 1));
    return start;
  }, [rangeDays]);

  const filteredPerformance = useMemo(() => performance.filter((row) => {
    const rowDate = new Date(row.published_at || row.captured_at || 0);
    return !Number.isNaN(rowDate.getTime()) && rowDate >= rangeStart && (platformFilter === "all" || row.platform === platformFilter);
  }), [performance, platformFilter, rangeStart]);

  const allPlatformStats = useMemo(() => aggregateByPlatform(performance.filter((row) => {
    const rowDate = new Date(row.published_at || row.captured_at || 0);
    return !Number.isNaN(rowDate.getTime()) && rowDate >= rangeStart;
  })), [performance, rangeStart]);

  const totals = useMemo(() => ({
    posts: filteredPerformance.length,
    views: sumMetric(filteredPerformance, "views"),
    interactions: filteredPerformance.reduce((total, row) => total + getInteractionCount(row), 0),
    clicks: sumMetric(filteredPerformance, "clicks"),
    shares: sumMetric(filteredPerformance, "shares"),
    interactionRate: getInteractionRate(filteredPerformance),
  }), [filteredPerformance]);

  const dailySeries = useMemo(() => buildDailySeries(filteredPerformance, rangeDays), [filteredPerformance, rangeDays]);
  const chartValues = dailySeries.map((bucket) => chartMetric === "exposure" ? bucket.exposure : bucket.interactions);
  const chartPath = buildLinePath(chartValues);
  const chartMax = Math.max(0, ...chartValues);

  const connectedPlatforms = PLATFORM_ORDER.filter((platform) => getConnectionForPlatform(connections, platform)?.status === "connected");
  const healthyPlatforms = PLATFORM_ORDER.filter((platform) => getPlatformCollectionStatus(collectionStates, platform, getConnectionForPlatform(connections, platform), allPlatformStats[platform]) === "healthy");
  const lastSuccess = collectionStates.map((row) => row.last_success_at).filter(Boolean).sort().at(-1) || performance.map((row) => row.captured_at).filter(Boolean).sort().at(-1) || null;
  const topPosts = useMemo(() => [...filteredPerformance].sort((left, right) => getPostScore(right) - getPostScore(left)).slice(0, 6), [filteredPerformance]);
  const learning = learningProfile?.profile_json || {};
  const learningSignals = useMemo(() => {
    const content = Object.entries(learning?.content_types || {}).map(([key, signal]) => ({ kind: "content", key, label: humanize(key), score: safeNumber(signal?.score), confidence: safeNumber(signal?.confidence), observations: safeNumber(signal?.observations) }));
    const formats = Object.entries(learning?.content_formats || {}).map(([key, signal]) => ({ kind: "format", key, label: humanize(key), score: safeNumber(signal?.score), confidence: safeNumber(signal?.confidence), observations: safeNumber(signal?.observations) }));
    return [...content, ...formats].filter((item) => item.observations > 0).sort((a, b) => Math.abs(b.score) * Math.max(.2, b.confidence) - Math.abs(a.score) * Math.max(.2, a.confidence)).slice(0, 5);
  }, [learning]);
  const learningState = learningProfile?.learning_state || "collecting";
  const learningEventCount = safeNumber(learningProfile?.source_event_count);
  const learningProgressPercent = Math.min(100, Math.max(0, Math.round((learningEventCount / 12) * 100)));
  const hasPerformance = filteredPerformance.length > 0;
  const maxPostsPerBucket = Math.max(1, ...dailySeries.map((bucket) => safeNumber(bucket.posts)));
  const coverageLabel = healthyPlatforms.length > 0
    ? t("growBrain.coverage", { healthy: healthyPlatforms.length, connected: connectedPlatforms.length })
    : connectedPlatforms.length > 0
      ? t("growBrain.coverageWaiting", { connected: connectedPlatforms.length })
      : t("growBrain.coverageNone");

  function statusCopy(status) {
    if (status === "healthy") return { label: t("growBrain.statusHealthy"), className: "healthy" };
    if (status === "scope_missing") return { label: t("growBrain.statusPermissionPending"), className: "pending" };
    if (status === "auth_error") return { label: t("growBrain.statusReconnect"), className: "warning" };
    if (status === "collecting") return { label: t("growBrain.statusCollecting"), className: "collecting" };
    if (status === "waiting") return { label: t("growBrain.statusWaiting"), className: "neutral" };
    return { label: t("growBrain.statusNotConnected"), className: "neutral" };
  }

  return (
    <AppLayout active="grow-brain">
      <div className="grow-v215-page">
        <header className="grow-v215-hero grow-v216-hero">
          <div className="grow-v215-hero-copy">
            <span className="grow-v215-eyebrow"><Sparkles size={15} /> {t("growBrain.eyebrow")}</span>
            <h1>{t("growBrain.title")}</h1>
            <p>{t("growBrain.subtitle")}</p>
            <div className="grow-v216-hero-meta">
              {currentBrand?.business_name ? <span className="grow-v215-brand-chip">{t("growBrain.currentBrand")} <strong>{currentBrand.business_name}</strong></span> : null}
              {lastSuccess ? <span className="grow-v216-last-update"><span className="grow-v216-live-dot" />{t("growBrain.lastUpdated", { date: formatDateTime(lastSuccess, locale) })}</span> : null}
            </div>
          </div>
          <div className="grow-v216-hero-stage" aria-hidden="true">
            <span className="grow-v216-network-ring ring-one" />
            <span className="grow-v216-network-ring ring-two" />
            <span className="grow-v216-core"><Activity size={42} /></span>
            {PLATFORM_ORDER.slice(0, 5).map((platform, index) => <span key={platform} className={`grow-v216-float-icon icon-${index + 1}`}><PlatformIcon platform={platform} /></span>)}
          </div>
          <div className="grow-v215-hero-status grow-v216-hero-status">
            <div className="grow-v215-brain-orb" aria-hidden="true"><Activity size={27} /></div>
            <div><span>{t("growBrain.intelligenceStatus")}</span><strong>{healthyPlatforms.length ? t("growBrain.learningActive") : t("growBrain.preparingLearning")}</strong><small>{lastSuccess ? t("growBrain.lastUpdated", { date: formatDateTime(lastSuccess, locale) }) : t("growBrain.waitingForData")}</small></div>
            <button type="button" onClick={() => loadDashboard({ quiet: true })} disabled={refreshing} aria-label={t("growBrain.refresh")}><RefreshCw size={18} className={refreshing ? "grow-v215-spin" : ""} /></button>
          </div>
        </header>

        {errorMessage ? <div className="grow-v215-notice error" role="alert"><CircleAlert size={18} /><span>{errorMessage}</span></div> : null}

        <section className="grow-v215-controlbar" aria-label={t("growBrain.filters")}>
          <div className="grow-v215-range-tabs">{RANGE_OPTIONS.map((days) => <button key={days} type="button" className={rangeDays === days ? "active" : ""} onClick={() => setRangeDays(days)}>{t("growBrain.days", { count: days })}</button>)}</div>
          <div className="grow-v215-platform-filter"><PlatformIcon platform={platformFilter === "all" ? null : platformFilter} /><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} aria-label={t("growBrain.channelFilter")}><option value="all">{t("growBrain.allChannels")}</option>{PLATFORM_ORDER.map((platform) => <option key={platform} value={platform}>{PLATFORM_META[platform].label}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>
        </section>

        <div className="grow-v216-kpi-heading"><div><span className="grow-v215-section-kicker">{t("growBrain.performanceOverview")}</span><h2>{t("growBrain.kpiTitle")}</h2><p>{t("growBrain.kpiSubtitle")}</p></div></div>

        <section className="grow-v215-metrics" aria-label={t("growBrain.performanceOverview")}>
          <MetricCard loading={loading} icon={BarChart3} label={t("growBrain.postsAnalyzed")} value={formatCompact(totals.posts, locale)} detail={t("growBrain.inSelectedPeriod")} />
          <MetricCard loading={loading} icon={Eye} label={t("growBrain.views")} value={formatCompact(totals.views, locale)} detail={totals.views ? t("growBrain.acrossMeasuredChannels") : t("growBrain.metricNotAvailableYet")} />
          <MetricCard loading={loading} icon={Heart} label={t("growBrain.interactions")} value={formatCompact(totals.interactions, locale)} detail={t("growBrain.interactionsDetail")} />
          <MetricCard loading={loading} icon={Gauge} label={t("growBrain.interactionRate")} value={totals.interactionRate === null ? "—" : `${totals.interactionRate.toFixed(1)}%`} detail={t("growBrain.rateDetail")} />
          <MetricCard loading={loading} icon={Share2} label={t("growBrain.shares")} value={formatCompact(totals.shares, locale)} detail={t("growBrain.shareDetail")} />
          <MetricCard loading={loading} icon={MousePointerClick} label={t("growBrain.clicks")} value={formatCompact(totals.clicks, locale)} detail={totals.clicks ? t("growBrain.clickDetail") : t("growBrain.metricNotAvailableYet")} />
        </section>

        <section className="grow-v215-main-grid">
          <article className="grow-v215-panel grow-v215-trend-panel">
            <div className="grow-v215-panel-head"><div><span className="grow-v215-section-kicker">{t("growBrain.performance")}</span><h2>{t("growBrain.performanceByPublishDate")}</h2><p>{t("growBrain.performanceByPublishDateHelp")}</p></div><div className="grow-v215-chart-toggle"><button type="button" className={chartMetric === "interactions" ? "active" : ""} onClick={() => setChartMetric("interactions")}>{t("growBrain.interactions")}</button><button type="button" className={chartMetric === "exposure" ? "active" : ""} onClick={() => setChartMetric("exposure")}>{t("growBrain.exposure")}</button></div></div>
            {loading ? <div className="grow-v215-chart-empty"><LoaderCircle className="grow-v215-spin" /><span>{t("growBrain.loading")}</span></div> : hasPerformance ? (
              <div className="grow-v215-chart-wrap"><div className="grow-v215-chart-y"><span>{formatCompact(chartMax, locale)}</span><span>{formatCompact(chartMax / 2, locale)}</span><span>0</span></div><div className="grow-v215-chart-canvas"><svg viewBox="0 0 760 180" preserveAspectRatio="none" role="img" aria-label={t("growBrain.performanceChartLabel")}><defs><linearGradient id="growArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".20" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient><linearGradient id="growBars" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#9a84e7" stopOpacity=".32" /><stop offset="100%" stopColor="#9a84e7" stopOpacity=".08" /></linearGradient></defs><line x1="14" x2="746" y1="14" y2="14" className="grow-v215-gridline" /><line x1="14" x2="746" y1="90" y2="90" className="grow-v215-gridline" /><line x1="14" x2="746" y1="166" y2="166" className="grow-v215-gridline" />{dailySeries.map((bucket, index) => { const span = 732 / Math.max(1, dailySeries.length); const barWidth = Math.max(5, span * .48); const x = 14 + index * span + (span - barWidth) / 2; const barHeight = Math.max(3, (safeNumber(bucket.posts) / maxPostsPerBucket) * 52); return <rect key={`bar-${index}`} x={x} y={166 - barHeight} width={barWidth} height={barHeight} rx="2" fill="url(#growBars)" />; })}{chartPath ? <path d={`${chartPath} L746,166 L14,166 Z`} className="grow-v215-area" /> : null}{chartPath ? <path d={chartPath} className="grow-v215-line" /> : null}{chartValues.map((value, index) => { const step = chartValues.length > 1 ? 732 / (chartValues.length - 1) : 0; const x = 14 + index * step; const y = 166 - (safeNumber(value) / Math.max(1, chartMax)) * 152; return <circle key={`point-${index}`} cx={x} cy={y} r="2.7" className="grow-v216-chart-point" />; })}</svg><div className="grow-v215-chart-labels"><span>{formatDate(dailySeries[0]?.start, locale)}</span><span>{formatDate(dailySeries[Math.floor(dailySeries.length / 2)]?.start, locale)}</span><span>{formatDate(dailySeries.at(-1)?.end, locale)}</span></div></div></div>
            ) : <div className="grow-v215-chart-empty"><TrendingUp size={25} /><strong>{t("growBrain.noPerformanceTitle")}</strong><span>{t("growBrain.noPerformanceText")}</span><a href="/social-channels">{t("growBrain.openSocialChannels")} <ArrowRight size={15} /></a></div>}
          </article>

          <aside className="grow-v215-panel grow-v215-learning-panel">
            <div className="grow-v215-panel-head compact"><div><span className="grow-v215-section-kicker">{t("growBrain.customerLearning")}</span><h2>{t("growBrain.whatSpreeloLearns")}</h2></div><span className={`grow-v215-learning-state ${learningState}`}>{t(`growBrain.learningState.${learningState}`)}</span></div>
            <div className="grow-v219-maturity-card"><div className="grow-v219-maturity-top"><div className="grow-v219-maturity-value"><strong>{learningProgressPercent}%</strong><span>{t("growBrain.learningMaturity")}</span></div><span className="grow-v219-decision-badge">{learningEventCount} / 12</span></div><div className="grow-v219-progress-track" aria-hidden="true"><span style={{ width: `${Math.max(8, learningProgressPercent)}%` }} /></div><p className="grow-v219-maturity-copy">{learningEventCount >= 12 ? t("growBrain.learningEstablishedText") : t("growBrain.learningProgressText", { count: Math.max(0, 12 - learningEventCount) })}</p></div>
            {learningSignals.length ? <div className="grow-v215-signal-list">{learningSignals.map((signal) => <div key={`${signal.kind}-${signal.key}`} className="grow-v215-signal-row"><span className={`grow-v215-signal-mark ${signal.score >= 0 ? "positive" : "negative"}`}>{signal.score >= 0 ? <ThumbsUp size={14} /> : <Activity size={14} />}</span><div><strong>{getLearningSignalLabel(t, signal)}</strong><small>{signal.score >= 0 ? t("growBrain.positivePreference") : t("growBrain.negativePreference")} · {t("growBrain.observations", { count: signal.observations })}</small></div><span className={`grow-v215-signal-score ${signal.score >= 0 ? "positive" : "negative"}`}>{signal.score > 0 ? "+" : ""}{signal.score}</span></div>)}</div> : <div className="grow-v215-learning-empty"><Sparkles size={20} /><p>{t("growBrain.learningEmpty")}</p></div>}
            <p className="grow-v215-learning-note">{t("growBrain.learningSafetyNote")}</p>
          </aside>
        </section>

        <section className="grow-v215-panel grow-v215-channels-panel">
          <div className="grow-v215-panel-head"><div><span className="grow-v215-section-kicker">{t("growBrain.channels")}</span><h2>{t("growBrain.channelPerformance")}</h2><p>{t("growBrain.channelPerformanceHelp")}</p></div><span className="grow-v215-coverage"><CheckCircle2 size={15} /> {coverageLabel}</span></div>
          <div className="grow-v215-channel-grid">{PLATFORM_ORDER.map((platform) => {
            const connection = getConnectionForPlatform(connections, platform);
            const stats = allPlatformStats[platform];
            const status = getPlatformCollectionStatus(collectionStates, platform, connection, stats);
            const statusMeta = statusCopy(status);
            return <article key={platform} className={`grow-v215-channel-card ${statusMeta.className}`}><div className="grow-v215-channel-top"><div><PlatformIcon platform={platform} /><span><strong>{PLATFORM_META[platform].label}</strong><small>{connection?.page_name || (connection?.status === "connected" ? t("growBrain.connected") : t("growBrain.notConnected"))}</small></span></div><span className={`grow-v215-status-pill ${statusMeta.className}`}>{statusMeta.label}</span></div><div className="grow-v215-channel-metrics"><div><span>{t("growBrain.posts")}</span><strong>{formatCompact(stats.posts, locale)}</strong></div><div><span>{t("growBrain.interactions")}</span><strong>{formatCompact(stats.interactions, locale)}</strong></div><div><span>{t("growBrain.viewsReach")}</span><strong>{formatCompact(stats.reach || stats.views || stats.impressions, locale)}</strong></div></div><div className="grow-v215-channel-foot"><span>{stats.lastCapturedAt ? t("growBrain.measured", { date: formatDateTime(stats.lastCapturedAt, locale) }) : t("growBrain.noMeasurementYet")}</span>{status === "not_connected" || status === "auth_error" ? <a href="/social-channels">{t("growBrain.manage")} <ArrowRight size={13} /></a> : null}{status === "scope_missing" ? <span className="grow-v215-scope-note">{t("growBrain.publishingUnaffected")}</span> : null}</div></article>;
          })}</div>
        </section>

        <section className="grow-v215-bottom-grid">
          <article className="grow-v215-panel grow-v215-top-posts"><div className="grow-v215-panel-head"><div><span className="grow-v215-section-kicker">{t("growBrain.content")}</span><h2>{t("growBrain.topContent")}</h2><p>{t("growBrain.topContentHelp")}</p></div></div>{topPosts.length ? <div className="grow-v215-top-list grow-v216-top-grid">{topPosts.slice(0, 5).map((row, index) => { const post = postsById[row.post_id] || {}; const title = truncate(post.idea || post.content || humanize(row.content_type_id || row.content_format) || t("growBrain.publishedPost"), 62); const imageUrl = post.image_url || ""; return <a key={`${row.post_id}-${row.platform}`} href={`/posts/${row.post_id}`} className="grow-v215-top-row grow-v216-top-card"><span className="grow-v215-rank">{index + 1}</span><div className={`grow-v216-top-media ${imageUrl ? "has-image" : ""}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}>{!imageUrl ? <PlatformIcon platform={row.platform} /> : null}</div><span className="grow-v215-top-copy"><strong>{title}</strong><small><PlatformIcon platform={row.platform} /> {PLATFORM_META[row.platform]?.label || humanize(row.platform)} · {formatDate(row.published_at, locale)}</small></span><span className="grow-v216-top-metrics"><span><strong>{formatCompact(getInteractionCount(row), locale)}</strong><small>{t("growBrain.interactions")}</small></span><span><strong>{formatCompact(getExposure(row), locale)}</strong><small>{t("growBrain.exposure")}</small></span></span></a>; })}</div> : <div className="grow-v215-list-empty"><BarChart3 size={21} /><p>{t("growBrain.topContentEmpty")}</p></div>}</article>
          <aside className="grow-v215-panel grow-v215-system-card"><div className="grow-v215-panel-head compact"><div><span className="grow-v215-section-kicker">{t("growBrain.system")}</span><h2>{t("growBrain.dataHealth")}</h2></div></div><div className="grow-v215-health-score"><span className="grow-v215-health-ring" style={{ "--score": `${connectedPlatforms.length ? Math.round((healthyPlatforms.length / connectedPlatforms.length) * 100) : 0}%` }}><strong>{connectedPlatforms.length ? Math.round((healthyPlatforms.length / connectedPlatforms.length) * 100) : 0}%</strong></span><div><strong>{t("growBrain.measurementCoverage")}</strong><p>{t("growBrain.measurementCoverageText")}</p></div></div><div className="grow-v215-health-list"><div><CheckCircle2 size={16} /><span>{t("growBrain.connectedChannels")}</span><strong>{connectedPlatforms.length}</strong></div><div><Activity size={16} /><span>{t("growBrain.channelsWithData")}</span><strong>{healthyPlatforms.length}</strong></div><div><Clock3 size={16} /><span>{t("growBrain.lastCollection")}</span><strong>{lastSuccess ? formatDateTime(lastSuccess, locale) : "—"}</strong></div></div><p className="grow-v215-system-note">{t("growBrain.observationalNote")}</p></aside>
        </section>
      </div>
    </AppLayout>
  );
}
