"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Globe2,
  Heart,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  ShoppingBag,
  Share2,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  X,
  Database,
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

function clamp(value, min, max) {
  const numeric = safeNumber(value);
  return Math.min(max, Math.max(min, numeric));
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
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);
  const format = (scaled) => new Intl.NumberFormat(locale || "en", {
    maximumFractionDigits: scaled >= 100 ? 0 : 1,
  }).format(scaled);
  if (absolute >= 1000000) return `${format(numeric / 1000000)}M`;
  if (absolute >= 10000) return `${format(numeric / 1000)}k`;
  return new Intl.NumberFormat(locale || "en", { maximumFractionDigits: 0 }).format(numeric);
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

function getNiceChartMax(value) {
  const numeric = safeNumber(value);
  if (numeric <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(numeric));
  const normalized = numeric / magnitude;
  if (normalized <= 1.5) return 1.5 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 3) return 3 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildLineGeometry(values, {
  width = 760,
  height = 210,
  paddingX = 14,
  paddingTop = 14,
  paddingBottom = 14,
  maxValue = 1,
} = {}) {
  if (!values.length) return { path: "", areaPath: "", points: [], baselineY: height - paddingBottom };
  const safeMax = Math.max(1, safeNumber(maxValue));
  const baselineY = height - paddingBottom;
  const usableHeight = Math.max(1, height - paddingTop - paddingBottom);
  const step = values.length > 1 ? (width - paddingX * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: paddingX + index * step,
    y: baselineY - (safeNumber(value) / safeMax) * usableHeight,
  }));
  if (points.length === 1) {
    const onlyPointPath = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    const onlyPointArea = `${onlyPointPath} L${points[0].x.toFixed(1)},${baselineY.toFixed(1)} Z`;
    return { path: onlyPointPath, areaPath: onlyPointArea, points, baselineY };
  }

  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${path} L${last.x.toFixed(1)},${baselineY.toFixed(1)} L${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
  return { path, areaPath, points, baselineY };
}

function getConnectionForPlatform(connections, platform) {
  return (connections || []).find((connection) => connection.platform === platform && connection.status === "connected")
    || (connections || []).find((connection) => connection.platform === platform)
    || null;
}

const WEB_PROVIDER_META = {
  shopify: { label: "Shopify", icon: ShoppingBag, descriptionKey: "growBrain.webConnectProviderShopify" },
  woocommerce: { label: "WooCommerce", icon: ShoppingBag, descriptionKey: "growBrain.webConnectProviderWooCommerce" },
  google_analytics: { label: "Google Analytics", icon: BarChart3, descriptionKey: "growBrain.webConnectProviderGa" },
  google_tag_manager: { label: "Google Tag Manager", icon: Database, descriptionKey: "growBrain.webConnectProviderGtm" },
  wordpress: { label: "WordPress", icon: Globe2, descriptionKey: "growBrain.webConnectProviderWordPress" },
  universal: { label: "Website", icon: Globe2, descriptionKey: "growBrain.webConnectProviderUniversal" },
};

function getWebProviderMeta(provider) {
  return WEB_PROVIDER_META[provider] || WEB_PROVIDER_META.universal;
}

function getWebIntroStorageKey(brandId) {
  return `spreelo_grow_brain_web_intro_dismissed_${brandId || "unknown"}`;
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

function getPerformanceInsightLabel(t, insight) {
  const key = insight?.dimension_key;
  if (!key) return "";
  if (String(insight?.dimension_type || "").includes("content_type")) {
    const translated = t(`automation.contentType.${key}.label`);
    if (translated && translated !== `automation.contentType.${key}.label`) return translated;
  }
  const formatLabels = {
    single_image: t("growBrain.formatSingleImage"),
    animated_video: t("growBrain.formatAnimatedVideo"),
    carousel: t("growBrain.formatCarousel"),
    video: t("growBrain.formatVideo"),
  };
  return formatLabels[key] || humanize(key);
}

function getPerformanceDimensionLabel(t, dimensionType) {
  return String(dimensionType || "").includes("content_format")
    ? t("growBrain.performanceInsightFormat")
    : t("growBrain.performanceInsightContentType");
}

function getPerformanceSignalLabel(t, signal) {
  const key = ["strong_positive", "positive", "neutral", "negative", "strong_negative"].includes(signal) ? signal : "neutral";
  return t(`growBrain.performanceSignal.${key}`);
}

function relativePercent(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return Math.round((ratio - 1) * 100);
}

function getInsightHighlights(t, insight) {
  const metrics = [
    ["engagement", t("growBrain.performanceMetricEngagement"), insight?.relative_engagement],
    ["exposure", t("growBrain.performanceMetricExposure"), insight?.relative_exposure],
    ["click", t("growBrain.performanceMetricClick"), insight?.relative_click],
    ["share", t("growBrain.performanceMetricShare"), insight?.relative_share],
    ["save", t("growBrain.performanceMetricSave"), insight?.relative_save],
  ];
  return metrics
    .map(([key, label, ratio]) => ({ key, label, percent: relativePercent(ratio) }))
    .filter((item) => item.percent !== null)
    .sort((left, right) => Math.abs(right.percent) - Math.abs(left.percent))
    .slice(0, 2);
}

function PerformanceInsightCard({ insight, t }) {
  const positive = ["positive", "strong_positive"].includes(insight?.signal);
  const highlights = getInsightHighlights(t, insight);
  const platform = insight?.platform === "all"
    ? t("growBrain.performanceInsightAllChannels")
    : PLATFORM_META[insight?.platform]?.label || humanize(insight?.platform);
  const confidence = Math.round(clamp(safeNumber(insight?.confidence), 0, 1) * 100);
  return (
    <article className={`grow-v227-insight-card ${positive ? "positive" : "negative"}`}>
      <div className="grow-v227-insight-top">
        <span className={`grow-v227-insight-icon ${positive ? "positive" : "negative"}`}>
          {positive ? <TrendingUp size={17} aria-hidden="true" /> : <TrendingDown size={17} aria-hidden="true" />}
        </span>
        <div className="grow-v227-insight-title">
          <div className="grow-v227-insight-meta">
            <span>{getPerformanceDimensionLabel(t, insight?.dimension_type)}</span>
            <span>•</span>
            <span>{platform}</span>
          </div>
          <strong>{getPerformanceInsightLabel(t, insight)}</strong>
        </div>
        <span className={`grow-v227-signal-pill ${positive ? "positive" : "negative"}`}>
          {getPerformanceSignalLabel(t, insight?.signal)}
        </span>
      </div>
      <div className="grow-v227-insight-evidence">
        {highlights.map((item) => <span key={item.key} className={item.percent >= 0 ? "positive" : "negative"}>
          {item.label} <strong>{item.percent > 0 ? "+" : ""}{item.percent}%</strong>
        </span>)}
      </div>
      <div className="grow-v227-insight-foot">
        <span>{t("growBrain.performanceInsightObservations", { count: safeNumber(insight?.observation_count) })}</span>
        <span>{t("growBrain.performanceInsightConfidence", { value: confidence })}</span>
        <span>{t("growBrain.performanceInsightScore", { value: `${safeNumber(insight?.performance_score) > 0 ? "+" : ""}${safeNumber(insight?.performance_score)}` })}</span>
      </div>
    </article>
  );
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

function buildGrowBrainDemoData() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  const platformConfig = {
    facebook: { name: "Ellos", baseExposure: 18400, baseLikes: 420, growth: 780 },
    instagram: { name: "@ellos", baseExposure: 23600, baseLikes: 690, growth: 1050 },
    tiktok: { name: "@ellossverige", baseExposure: 31800, baseLikes: 980, growth: 1420 },
    youtube: { name: "Ellos Sverige", baseExposure: 12100, baseLikes: 260, growth: 520 },
    pinterest: { name: "Ellos", baseExposure: 8600, baseLikes: 190, growth: 360 },
    threads: { name: "@ellos", baseExposure: 6900, baseLikes: 150, growth: 290 },
  };
  const contentTypes = ["website_item", "problem_solution", "tips", "animated_website_item", "faq", "website_item_text_ad"];
  const formats = ["single_image", "single_image", "single_image", "animated_video", "single_image", "single_image"];
  const demoImages = [
    "/grow-brain/demo-top-1.webp",
    "/grow-brain/demo-top-2.webp",
    "/grow-brain/demo-top-3.webp",
    "/grow-brain/demo-top-4.webp",
    "/grow-brain/demo-top-5.webp",
    "/grow-brain/demo-top-6.webp",
  ];
  const demoTitles = [
    "Höstens favoriter är här",
    "Så stylar du säsongens nyheter",
    "Säsongens måste-ha-plagg",
    "Tre detaljer som lyfter vardagsstilen",
    "Stickat som känns rätt just nu",
    "Vackraste inredningsdetaljerna i höst",
  ];

  const performance = [];
  const postsById = {};
  let globalIndex = 0;

  PLATFORM_ORDER.forEach((platform, platformIndex) => {
    const config = platformConfig[platform];
    for (let itemIndex = 0; itemIndex < 7; itemIndex += 1) {
      const daysAgo = 2 + itemIndex * 4 + (platformIndex % 3);
      const published = new Date(now);
      published.setDate(now.getDate() - daysAgo);
      const captured = new Date(published);
      captured.setHours(captured.getHours() + 18);

      const wave = [0.88, 1.06, 0.95, 1.18, 1.03, 1.31, 1.12][itemIndex];
      const exposure = Math.round((config.baseExposure + config.growth * itemIndex + platformIndex * 420) * wave);
      const likes = Math.round((config.baseLikes + itemIndex * 31 + platformIndex * 12) * wave);
      const comments = Math.max(8, Math.round(likes * (0.055 + platformIndex * 0.004)));
      const shares = Math.max(5, Math.round(likes * (0.072 + itemIndex * 0.003)));
      const saves = ["instagram", "pinterest"].includes(platform) ? Math.round(likes * 0.12) : Math.round(likes * 0.035);
      const clicks = ["facebook", "instagram", "pinterest", "threads"].includes(platform) ? Math.round(exposure * (0.006 + itemIndex * 0.0006)) : 0;
      const postId = `demo-${platform}-${itemIndex + 1}`;
      const contentType = contentTypes[(globalIndex + platformIndex) % contentTypes.length];
      const contentFormat = formats[(globalIndex + platformIndex) % formats.length];

      performance.push({
        post_id: postId,
        platform,
        content_type_id: contentType,
        content_format: contentFormat,
        published_at: published.toISOString(),
        captured_at: captured.toISOString(),
        views: exposure,
        reach: platform === "facebook" || platform === "instagram" ? Math.round(exposure * 0.82) : null,
        impressions: platform === "pinterest" || platform === "threads" ? Math.round(exposure * 1.08) : null,
        likes,
        comments,
        shares,
        saves,
        clicks,
        engagements: likes + comments + shares + saves,
        watch_time_seconds: ["tiktok", "youtube"].includes(platform) ? exposure * (12 + itemIndex) : null,
        average_watch_time_seconds: ["tiktok", "youtube"].includes(platform) ? 7.4 + itemIndex * 0.45 : null,
      });

      postsById[postId] = {
        id: postId,
        content: demoTitles[globalIndex % demoTitles.length],
        idea: demoTitles[globalIndex % demoTitles.length],
        post_type: contentType,
        content_format: contentFormat,
        published_at: published.toISOString(),
        image_url: demoImages[globalIndex % demoImages.length],
        video_url: null,
      };
      globalIndex += 1;
    }
  });

  const lastSuccess = new Date(now);
  lastSuccess.setMinutes(lastSuccess.getMinutes() - 18);

  const connections = PLATFORM_ORDER.map((platform) => ({
    id: `demo-connection-${platform}`,
    platform,
    page_name: platformConfig[platform].name,
    status: "connected",
    permissions: [],
    updated_at: lastSuccess.toISOString(),
  }));

  const collectionStates = PLATFORM_ORDER.map((platform) => ({
    post_id: `demo-${platform}-1`,
    platform,
    status: "healthy",
    last_attempt_at: lastSuccess.toISOString(),
    last_success_at: lastSuccess.toISOString(),
    next_collect_at: null,
    last_error: null,
    updated_at: lastSuccess.toISOString(),
  }));

  const learningProfile = {
    brand_profile_id: "demo-brand",
    learning_state: "established",
    source_event_count: 18,
    approved_count: 14,
    rejected_count: 4,
    last_event_at: lastSuccess.toISOString(),
    updated_at: lastSuccess.toISOString(),
    profile_json: {
      content_types: {
        website_item: { score: 58, confidence: 0.78, observations: 11 },
        problem_solution: { score: 41, confidence: 0.67, observations: 8 },
        tips: { score: 32, confidence: 0.61, observations: 7 },
        animated_website_item: { score: -18, confidence: 0.52, observations: 5 },
      },
      content_formats: {
        single_image: { score: 47, confidence: 0.74, observations: 13 },
        animated_video: { score: 24, confidence: 0.58, observations: 6 },
      },
    },
  };

  return {
    currentBrand: { id: "demo-brand", business_name: "Ellos", website_url: "https://ellos.se" },
    connections,
    performance,
    collectionStates,
    learningProfile,
    postsById,
  };
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
  const [demoMode, setDemoMode] = useState(false);
  const [engineTestRunning, setEngineTestRunning] = useState(false);
  const [engineTestResult, setEngineTestResult] = useState(null);
  const [step4TestRunning, setStep4TestRunning] = useState(false);
  const [step4TestResult, setStep4TestResult] = useState(null);
  const [performanceInsights, setPerformanceInsights] = useState([]);
  const [performanceLearningState, setPerformanceLearningState] = useState(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [websiteConnection, setWebsiteConnection] = useState(null);
  const [websiteConnectionLoaded, setWebsiteConnectionLoaded] = useState(false);
  const [websiteConnectOpen, setWebsiteConnectOpen] = useState(false);
  const [websiteConnectView, setWebsiteConnectView] = useState("intro");
  const [websiteDiscovery, setWebsiteDiscovery] = useState(null);
  const [websiteDiscovering, setWebsiteDiscovering] = useState(false);
  const [websiteConnectError, setWebsiteConnectError] = useState("");
  const webIntroCheckedRef = useRef("");

  useEffect(() => {
    const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
    setDemoMode(isDemo);
    void loadDashboard();
  }, []);

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

  async function loadPerformanceEngineTestSnapshot() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;
      const response = await fetch("/api/admin/grow-brain-performance-test", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) return;
      if (payload.has_test_data) {
        setPerformanceInsights(payload.insights || []);
        setPerformanceLearningState(payload.state || null);
        setEngineTestResult(payload);
      }
    } catch {
      // Demo verification is optional; never block the customer dashboard on it.
    }
  }

  async function runPerformanceEngineTest(action = "run") {
    setEngineTestRunning(true);
    if (action === "run") setEngineTestResult(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("growBrain.engineTestLoginRequired"));

      const response = await fetch("/api/admin/grow-brain-performance-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || t("growBrain.engineTestFailed"));
      setEngineTestResult(payload);
      if (action === "cleanup") {
        setPerformanceInsights([]);
        setPerformanceLearningState(null);
      } else {
        setPerformanceInsights(payload.insights || []);
        setPerformanceLearningState(payload.state || null);
      }
    } catch (error) {
      setEngineTestResult({ ok: false, passed: false, error: error?.message || t("growBrain.engineTestFailed") });
    } finally {
      setEngineTestRunning(false);
    }
  }

  async function runStep4PlanningTest() {
    setStep4TestRunning(true);
    setStep4TestResult(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("growBrain.step4TestLoginRequired"));
      const response = await fetch("/api/admin/grow-brain-step4-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "run" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || t("growBrain.step4TestFailed"));
      setStep4TestResult(payload);
    } catch (error) {
      setStep4TestResult({ ok: false, ready: false, passed: false, error: error?.message || t("growBrain.step4TestFailed") });
    } finally {
      setStep4TestRunning(false);
    }
  }

  async function loadDashboard({ quiet = false } = {}) {
    if (quiet) setRefreshing(true); else setLoading(true);
    setErrorMessage("");
    try {
      const demoPreview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
      if (demoPreview) {
        const demo = buildGrowBrainDemoData();
        setCurrentUserId("demo-user");
        setCurrentBrand(demo.currentBrand);
        setConnections(demo.connections);
        setPerformance(demo.performance);
        setCollectionStates(demo.collectionStates);
        setLearningProfile(demo.learningProfile);
        setPostsById(demo.postsById);
        setWebsiteConnection(null);
        setWebsiteConnectionLoaded(true);
        await loadPerformanceEngineTestSnapshot();
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user) { window.location.href = "/login"; return; }
      setCurrentUserId(user.id);
      const brand = await resolveBrand(user);
      setCurrentBrand(brand);
      if (!brand?.id) { setWebsiteConnectionLoaded(true); return; }

      const [connectionResult, performanceResult, stateResult, learningResult, performanceInsightResult, performanceLearningResult, websiteConnectionResult] = await Promise.all([
        supabase.from("social_connections").select("id,platform,page_name,status,permissions,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).in("platform", PLATFORM_ORDER).order("updated_at", { ascending: false }),
        supabase.from("post_performance_latest").select("post_id,platform,content_type_id,content_format,published_at,captured_at,views,reach,impressions,likes,comments,shares,saves,clicks,engagements,watch_time_seconds,average_watch_time_seconds").eq("user_id", user.id).eq("brand_profile_id", brand.id).order("captured_at", { ascending: false }).limit(600),
        supabase.from("post_performance_collection_state").select("post_id,platform,status,last_attempt_at,last_success_at,next_collect_at,last_error,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).order("updated_at", { ascending: false }).limit(600),
        supabase.from("brand_learning_profiles").select("brand_profile_id,learning_state,source_event_count,approved_count,rejected_count,profile_json,last_event_at,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).maybeSingle(),
        supabase.from("brand_performance_insights").select("dimension_type,platform,dimension_key,observation_count,performance_score,confidence,signal,avg_exposure,avg_interactions,engagement_rate,click_rate,share_rate,save_rate,relative_exposure,relative_engagement,relative_click,relative_share,relative_save,last_post_at,computed_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).order("confidence", { ascending: false }).limit(100),
        supabase.from("brand_performance_learning_state").select("learning_state,source_post_count,eligible_post_count,insight_count,status,last_source_at,last_analyzed_at,next_analysis_at,last_error,summary_json").eq("user_id", user.id).eq("brand_profile_id", brand.id).maybeSingle(),
        supabase.from("brand_web_data_connections").select("brand_profile_id,user_id,status,provider,website_url,detected_platform,detected_signals,intro_dismissed_at,discovered_at,connected_at,last_error,updated_at").eq("user_id", user.id).eq("brand_profile_id", brand.id).maybeSingle(),
      ]);
      if (connectionResult.error) throw connectionResult.error;
      if (performanceResult.error) throw performanceResult.error;
      if (stateResult.error) throw stateResult.error;
      if (learningResult.error && learningResult.error.code !== "PGRST116") throw learningResult.error;
      if (performanceInsightResult.error) throw performanceInsightResult.error;
      if (performanceLearningResult.error && performanceLearningResult.error.code !== "PGRST116") throw performanceLearningResult.error;
      if (websiteConnectionResult.error && !["PGRST116", "PGRST205", "42P01"].includes(websiteConnectionResult.error.code)) throw websiteConnectionResult.error;

      const perfRows = performanceResult.data || [];
      setConnections(connectionResult.data || []);
      setPerformance(perfRows);
      setCollectionStates(stateResult.data || []);
      setLearningProfile(learningResult.data || null);
      setPerformanceInsights(performanceInsightResult.data || []);
      setPerformanceLearningState(performanceLearningResult.data || null);
      setWebsiteConnection(websiteConnectionResult.data || null);
      setWebsiteConnectionLoaded(true);

      const postIds = [...new Set(perfRows.map((row) => row.post_id).filter(Boolean))].slice(0, 300);
      if (postIds.length) {
        const { data: posts, error: postsError } = await supabase.from("posts").select("id,content,idea,post_type,content_format,published_at,image_url,video_url").eq("user_id", user.id).eq("brand_profile_id", brand.id).in("id", postIds);
        if (!postsError) setPostsById(Object.fromEntries((posts || []).map((post) => [post.id, post])));
      } else setPostsById({});
    } catch (error) {
      console.error("Could not load Grow Brain dashboard", error);
      setErrorMessage(error?.message || t("growBrain.loadError"));
      setWebsiteConnectionLoaded(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!websiteConnectionLoaded || loading || !currentBrand?.id) return;
    if (websiteConnection?.status === "connected") return;
    if (webIntroCheckedRef.current === currentBrand.id) return;
    webIntroCheckedRef.current = currentBrand.id;
    const locallyDismissed = typeof window !== "undefined" && localStorage.getItem(getWebIntroStorageKey(currentBrand.id)) === "1";
    if (websiteConnection?.intro_dismissed_at || locallyDismissed) return;
    setWebsiteConnectView("intro");
    setWebsiteConnectOpen(true);
  }, [websiteConnectionLoaded, loading, currentBrand?.id, websiteConnection?.status, websiteConnection?.intro_dismissed_at]);

  async function dismissWebsiteConnectIntro() {
    const dismissedAt = new Date().toISOString();
    if (typeof window !== "undefined" && currentBrand?.id) {
      localStorage.setItem(getWebIntroStorageKey(currentBrand.id), "1");
    }
    setWebsiteConnectOpen(false);
    if (!currentBrand?.id) return;
    if (demoMode || currentUserId === "demo-user") {
      setWebsiteConnection((current) => ({ ...(current || {}), status: current?.status || "not_connected", intro_dismissed_at: dismissedAt }));
      return;
    }
    try {
      if (websiteConnection?.brand_profile_id) {
        const { data, error } = await supabase
          .from("brand_web_data_connections")
          .update({ intro_dismissed_at: dismissedAt, updated_at: dismissedAt })
          .eq("brand_profile_id", currentBrand.id)
          .eq("user_id", currentUserId)
          .select("*")
          .single();
        if (error) throw error;
        setWebsiteConnection(data);
      } else {
        const { data, error } = await supabase
          .from("brand_web_data_connections")
          .insert({
            brand_profile_id: currentBrand.id,
            user_id: currentUserId,
            status: "not_connected",
            website_url: currentBrand.website_url || null,
            intro_dismissed_at: dismissedAt,
            updated_at: dismissedAt,
          })
          .select("*")
          .single();
        if (error) throw error;
        setWebsiteConnection(data);
      }
    } catch (error) {
      console.warn("Could not persist Grow Brain website intro dismissal", error);
    }
  }

  function openWebsiteConnect() {
    setWebsiteConnectError("");
    if (websiteConnection?.status === "connected" && websiteConnection?.provider === "shopify") {
      setWebsiteConnectView("connected");
    } else {
      setWebsiteConnectView(websiteDiscovery ? "recommendation" : "intro");
    }
    setWebsiteConnectOpen(true);
  }

  async function discoverWebsiteConnection() {
    setWebsiteDiscovering(true);
    setWebsiteConnectError("");
    setWebsiteConnectView("discovering");
    try {
      if (demoMode || currentUserId === "demo-user") {
        const demoDiscovery = {
          ok: true,
          website_url: currentBrand?.website_url || "",
          provider: "universal",
          technologies: [],
          could_read_website: true,
          demo: true,
        };
        setWebsiteDiscovery(demoDiscovery);
        setWebsiteConnection((current) => ({
          ...(current || {}),
          status: "discovered",
          provider: demoDiscovery.provider,
          website_url: demoDiscovery.website_url,
          detected_platform: demoDiscovery.provider,
          detected_signals: { technologies: [], demo: true },
          discovered_at: new Date().toISOString(),
        }));
        setWebsiteConnectView("recommendation");
        return;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("growBrain.webConnectLoginRequired"));
      const response = await fetch("/api/grow-brain/web-data/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ brand_profile_id: currentBrand?.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || t("growBrain.webConnectDiscoveryFailed"));
      setWebsiteDiscovery(payload);
      if (payload.connection) setWebsiteConnection(payload.connection);
      setWebsiteConnectView("recommendation");
    } catch (error) {
      setWebsiteConnectError(error?.message || t("growBrain.webConnectDiscoveryFailed"));
      setWebsiteConnectView("intro");
    } finally {
      setWebsiteDiscovering(false);
    }
  }

  async function prepareWebsiteProvider() {
    const provider = websiteDiscovery?.provider || websiteConnection?.provider || "universal";
    const updatedAt = new Date().toISOString();
    if (typeof window !== "undefined" && currentBrand?.id) localStorage.setItem(getWebIntroStorageKey(currentBrand.id), "1");
    setWebsiteConnectError("");
    try {
      if (demoMode || currentUserId === "demo-user") {
        setWebsiteConnection((current) => ({ ...(current || {}), status: "setup_pending", provider, intro_dismissed_at: updatedAt, updated_at: updatedAt }));
        setWebsiteConnectView("prepared");
        return;
      }

      if (provider === "shopify") {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error(t("growBrain.webConnectLoginRequired"));
        const response = await fetch("/api/shopify/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            brand_profile_id: currentBrand?.id,
            shop: websiteDiscovery?.shop_domain || websiteConnection?.detected_signals?.shop_domain || "",
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          if (payload?.error === "SHOP_DOMAIN_REQUIRED") throw new Error(t("growBrain.shopifyDomainRequired"));
          throw new Error(payload?.message || payload?.error || t("growBrain.webConnectPrepareFailed"));
        }
        if (!payload?.url) throw new Error(t("growBrain.webConnectPrepareFailed"));
        window.location.assign(payload.url);
        return;
      }

      const { data, error } = await supabase
        .from("brand_web_data_connections")
        .update({ status: "setup_pending", provider, intro_dismissed_at: updatedAt, updated_at: updatedAt })
        .eq("brand_profile_id", currentBrand?.id)
        .eq("user_id", currentUserId)
        .select("*")
        .single();
      if (error) throw error;
      setWebsiteConnection(data);
      setWebsiteConnectView("prepared");
    } catch (error) {
      setWebsiteConnectError(error?.message || t("growBrain.webConnectPrepareFailed"));
    }
  }

  async function disconnectShopify() {
    setWebsiteConnectError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("growBrain.webConnectLoginRequired"));
      const response = await fetch("/api/shopify/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ brand_profile_id: currentBrand?.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || t("growBrain.shopifyDisconnectFailed"));
      setWebsiteConnection((current) => ({ ...(current || {}), status: "discovered", connected_at: null }));
      setWebsiteConnectView("recommendation");
    } catch (error) {
      setWebsiteConnectError(error?.message || t("growBrain.shopifyDisconnectFailed"));
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

  const rawDailySeries = useMemo(() => buildDailySeries(filteredPerformance, rangeDays), [filteredPerformance, rangeDays]);
  const dailySeries = useMemo(() => {
    let lastMeasuredIndex = rawDailySeries.length - 1;
    while (lastMeasuredIndex > 0 && safeNumber(rawDailySeries[lastMeasuredIndex]?.posts) === 0) lastMeasuredIndex -= 1;
    return rawDailySeries.slice(0, lastMeasuredIndex + 1);
  }, [rawDailySeries]);
  const chartValues = dailySeries.map((bucket) => chartMetric === "exposure" ? bucket.exposure : bucket.interactions);
  const chartMax = getNiceChartMax(Math.max(0, ...chartValues));
  const chartGeometry = buildLineGeometry(chartValues, { maxValue: chartMax || 1 });

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
  const filteredPerformanceInsights = useMemo(() => {
    const source = platformFilter === "all"
      ? performanceInsights
      : performanceInsights.filter((item) => item.platform === platformFilter);
    return [...source].sort((left, right) => {
      const leftStrength = Math.abs(safeNumber(left.performance_score)) * (0.55 + 0.45 * safeNumber(left.confidence));
      const rightStrength = Math.abs(safeNumber(right.performance_score)) * (0.55 + 0.45 * safeNumber(right.confidence));
      return rightStrength - leftStrength;
    });
  }, [performanceInsights, platformFilter]);
  const positivePerformanceInsights = filteredPerformanceInsights
    .filter((item) => ["positive", "strong_positive"].includes(item.signal))
    .slice(0, 3);
  const negativePerformanceInsights = filteredPerformanceInsights
    .filter((item) => ["negative", "strong_negative"].includes(item.signal))
    .slice(0, 3);
  const performanceLearningStateLabel = performanceLearningState?.learning_state || "collecting";
  const performanceLearningReady = performanceLearningState?.status === "healthy" && safeNumber(performanceLearningState?.insight_count) > 0;
  const hasPerformance = filteredPerformance.length > 0;
  const websiteDataConnected = websiteConnection?.status === "connected";
  const websiteSetupPending = websiteConnection?.status === "setup_pending";
  const webProvider = websiteDiscovery?.provider || websiteConnection?.provider || "universal";
  const webProviderMeta = getWebProviderMeta(webProvider);
  const WebProviderIcon = webProviderMeta.icon;
  const commerceDataConnected = websiteDataConnected && ["shopify", "woocommerce"].includes(webProvider);
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

        {demoMode ? <section className={`grow-v226-engine-test ${engineTestResult?.passed ? "passed" : engineTestResult?.ok === false ? "failed" : ""}`}>
          <div className="grow-v226-engine-test-copy">
            <span className="grow-v215-section-kicker">{t("growBrain.engineTestEyebrow")}</span>
            <h2>{t("growBrain.engineTestTitle")}</h2>
            <p>{t("growBrain.engineTestDescription")}</p>
            {engineTestResult ? <div className="grow-v226-engine-test-result" aria-live="polite">
              {engineTestResult.ok === false ? <><CircleAlert size={17} /><span><strong>{t("growBrain.engineTestFailedTitle")}</strong>{engineTestResult.error}</span></> : engineTestResult.action === "cleanup" ? <><CheckCircle2 size={17} /><span><strong>{t("growBrain.engineTestCleanedTitle")}</strong>{t("growBrain.engineTestCleanedText")}</span></> : <><CheckCircle2 size={17} /><span><strong>{engineTestResult.passed ? t("growBrain.engineTestPassedTitle") : t("growBrain.engineTestWarningTitle")}</strong>{t("growBrain.engineTestSummary", { posts: engineTestResult.state?.eligible_post_count || 0, insights: engineTestResult.state?.insight_count || 0, positive: engineTestResult.top_positive?.length || 0, negative: engineTestResult.top_negative?.length || 0 })}</span></>}
            </div> : null}
          </div>
          <div className="grow-v226-engine-test-actions">
            <button type="button" className="primary" disabled={engineTestRunning} onClick={() => runPerformanceEngineTest("run")}>{engineTestRunning ? <LoaderCircle size={16} className="grow-v215-spin" /> : <Activity size={16} />}{t("growBrain.engineTestRun")}</button>
            <button type="button" disabled={engineTestRunning} onClick={() => runPerformanceEngineTest("cleanup")}>{t("growBrain.engineTestCleanup")}</button>
          </div>
        </section> : null}

        {demoMode ? <section className={`grow-v230-step4-test ${step4TestResult?.passed ? "passed" : step4TestResult?.ok === false ? "failed" : step4TestResult?.ready === false ? "warning" : ""}`}>
          <div className="grow-v230-step4-test-head">
            <div>
              <span className="grow-v215-section-kicker">{t("growBrain.step4TestEyebrow")}</span>
              <h2>{t("growBrain.step4TestTitle")}</h2>
              <p>{t("growBrain.step4TestDescription")}</p>
            </div>
            <button type="button" disabled={step4TestRunning} onClick={runStep4PlanningTest}>
              {step4TestRunning ? <LoaderCircle size={16} className="grow-v215-spin" /> : <Activity size={16} />}
              {t("growBrain.step4TestRun")}
            </button>
          </div>
          {step4TestResult ? <div className="grow-v230-step4-test-body" aria-live="polite">
            {step4TestResult.ok === false ? <div className="grow-v230-step4-test-message error"><CircleAlert size={17} /><span><strong>{t("growBrain.step4TestFailedTitle")}</strong>{step4TestResult.error}</span></div> : step4TestResult.ready === false ? <div className="grow-v230-step4-test-message warning"><CircleAlert size={17} /><span><strong>{t("growBrain.step4TestNeedsDataTitle")}</strong>{t("growBrain.step4TestNeedsDataText")}</span></div> : <>
              <div className={`grow-v230-step4-test-message ${step4TestResult.passed ? "success" : "warning"}`}><CheckCircle2 size={17} /><span><strong>{step4TestResult.passed ? t("growBrain.step4TestPassedTitle") : t("growBrain.step4TestWarningTitle")}</strong>{t("growBrain.step4TestSummary", { checks: Object.values(step4TestResult.checks || {}).filter(Boolean).length, total: Object.keys(step4TestResult.checks || {}).length })}</span></div>
              <div className="grow-v230-step4-checks">
                {Object.entries(step4TestResult.checks || {}).map(([key, passed]) => <span key={key} className={passed ? "passed" : "failed"}>{passed ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}{t(`growBrain.step4Check.${key}`)}</span>)}
              </div>
              <div className="grow-v230-step4-scenarios">
                {(step4TestResult.scenarios || []).map((scenario) => <article key={scenario.goal_id}>
                  <h3>{t(`automation.goal.${scenario.goal_id}.label`)}</h3>
                  <div className="grow-v230-step4-rows">
                    {(scenario.rows || []).map((row) => <div key={row.content_type_id} className={`grow-v230-step4-row ${row.direction}`}>
                      <strong>{getPerformanceInsightLabel(t, { dimension_type: "content_type", dimension_key: row.content_type_id })}</strong>
                      <span>{t("growBrain.step4TestBeforeAfter", { before: row.base_weight_share, after: row.adjusted_weight_share })}</span>
                      <em>{row.grow_brain_adjustment > 0 ? "+" : ""}{row.grow_brain_adjustment}</em>
                    </div>)}
                  </div>
                </article>)}
              </div>
              <p className="grow-v230-step4-note">{t("growBrain.step4TestInterpretation")}</p>
            </>}
          </div> : null}
        </section> : null}

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
              <div className="grow-v215-chart-wrap grow-v222-chart-wrap"><div className="grow-v215-chart-y grow-v222-chart-y"><span>{formatCompact(chartMax, locale)}</span><span>{formatCompact(chartMax * .75, locale)}</span><span>{formatCompact(chartMax / 2, locale)}</span><span>{formatCompact(chartMax * .25, locale)}</span><span>0</span></div><div className="grow-v215-chart-canvas grow-v222-chart-canvas"><svg viewBox="0 0 760 210" preserveAspectRatio="none" role="img" aria-label={t("growBrain.performanceChartLabel")}><defs><linearGradient id="growActiveArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={chartMetric === "exposure" ? "#9f8fff" : "#6a4cf2"} stopOpacity=".18" /><stop offset="100%" stopColor={chartMetric === "exposure" ? "#9f8fff" : "#6a4cf2"} stopOpacity="0" /></linearGradient></defs><line x1="14" x2="746" y1="14" y2="14" className="grow-v215-gridline" /><line x1="14" x2="746" y1="60" y2="60" className="grow-v215-gridline" /><line x1="14" x2="746" y1="105" y2="105" className="grow-v215-gridline" /><line x1="14" x2="746" y1="150" y2="150" className="grow-v215-gridline" /><line x1="14" x2="746" y1="196" y2="196" className="grow-v215-gridline" />{chartGeometry.areaPath ? <path d={chartGeometry.areaPath} className="grow-v224-area" /> : null}{chartGeometry.path ? <path d={chartGeometry.path} className={`grow-v224-line ${chartMetric}`} /> : null}{chartGeometry.points.map((point, index) => <circle key={`point-${chartMetric}-${index}`} cx={point.x} cy={point.y} r="3.2" className={`grow-v224-chart-point ${chartMetric}`} />)}</svg><div className="grow-v215-chart-labels"><span>{formatDate(dailySeries[0]?.start, locale)}</span><span>{formatDate(dailySeries[Math.floor(dailySeries.length / 2)]?.start, locale)}</span><span>{formatDate(dailySeries.at(-1)?.end, locale)}</span></div></div></div>
            ) : <div className="grow-v215-chart-empty"><TrendingUp size={25} /><strong>{t("growBrain.noPerformanceTitle")}</strong><span>{t("growBrain.noPerformanceText")}</span><a href="/social-channels">{t("growBrain.openSocialChannels")} <ArrowRight size={15} /></a></div>}
          </article>

          <aside className="grow-v215-panel grow-v215-learning-panel">
            <div className="grow-v215-panel-head compact"><div><span className="grow-v215-section-kicker">{t("growBrain.customerLearning")}</span><h2>{t("growBrain.whatSpreeloLearns")}</h2></div><span className={`grow-v215-learning-state ${learningState}`}>{t(`growBrain.learningState.${learningState}`)}</span></div>
            <div className="grow-v219-maturity-card"><div className="grow-v219-maturity-top"><div className="grow-v219-maturity-value"><strong>{learningProgressPercent}%</strong><span>{t("growBrain.learningMaturity")}</span></div><span className="grow-v219-decision-badge" aria-label={t("growBrain.decisionCount", { count: learningEventCount })}>{learningEventCount >= 12 ? `${learningEventCount} ✓` : `${learningEventCount} / 12`}</span></div><div className="grow-v219-progress-track" aria-hidden="true"><span style={{ width: `${Math.max(8, learningProgressPercent)}%` }} /></div><p className="grow-v219-maturity-copy">{learningEventCount >= 12 ? t("growBrain.learningEstablishedText") : t("growBrain.learningProgressText", { count: Math.max(0, 12 - learningEventCount) })}</p></div>
            {learningSignals.length ? <div className="grow-v215-signal-list">{learningSignals.map((signal) => <div key={`${signal.kind}-${signal.key}`} className="grow-v215-signal-row"><span className={`grow-v215-signal-mark ${signal.score >= 0 ? "positive" : "negative"}`}>{signal.score >= 0 ? <ThumbsUp size={14} /> : <Activity size={14} />}</span><div><strong>{getLearningSignalLabel(t, signal)}</strong><small>{signal.score >= 0 ? t("growBrain.positivePreference") : t("growBrain.negativePreference")} · {t("growBrain.observations", { count: signal.observations })}</small></div><span className={`grow-v215-signal-score ${signal.score >= 0 ? "positive" : "negative"}`}>{signal.score > 0 ? "+" : ""}{signal.score}</span></div>)}</div> : <div className="grow-v215-learning-empty"><Sparkles size={20} /><p>{t("growBrain.learningEmpty")}</p></div>}
            <p className="grow-v215-learning-note">{t("growBrain.learningSafetyNote")}</p>
          </aside>
        </section>

        <section className="grow-v215-panel grow-v227-performance-learning">
          <div className="grow-v227-performance-head">
            <div>
              <span className="grow-v215-section-kicker">{t("growBrain.performanceLearningEyebrow")}</span>
              <h2>{t("growBrain.performanceLearningTitle")}</h2>
              <p>{t("growBrain.performanceLearningDescription")}</p>
            </div>
            <div className="grow-v227-performance-status">
              {demoMode && performanceLearningReady ? <span className="grow-v227-test-badge">{t("growBrain.performanceLearningTestData")}</span> : null}
              <span className={`grow-v227-learning-state ${performanceLearningStateLabel}`}>{t(`growBrain.learningState.${performanceLearningStateLabel}`)}</span>
              {performanceLearningState?.last_analyzed_at ? <small>{t("growBrain.performanceLearningLastAnalyzed", { date: formatDateTime(performanceLearningState.last_analyzed_at, locale) })}</small> : null}
            </div>
          </div>

          {performanceLearningReady ? <>
            <div className="grow-v227-performance-summary">
              <span><strong>{safeNumber(performanceLearningState?.eligible_post_count)}</strong>{t("growBrain.performanceLearningPosts")}</span>
              <span><strong>{safeNumber(performanceLearningState?.insight_count)}</strong>{t("growBrain.performanceLearningInsights")}</span>
              <span><strong>{positivePerformanceInsights.length}</strong>{t("growBrain.performanceLearningPositiveShown")}</span>
              <span><strong>{negativePerformanceInsights.length}</strong>{t("growBrain.performanceLearningNegativeShown")}</span>
            </div>
            <div className="grow-v227-insight-groups">
              <div className="grow-v227-insight-group positive">
                <div className="grow-v227-group-head"><span className="grow-v227-group-icon positive"><TrendingUp size={17} /></span><div><h3>{t("growBrain.performanceLearningWorking")}</h3><p>{t("growBrain.performanceLearningWorkingHelp")}</p></div></div>
                <div className="grow-v227-insight-list">{positivePerformanceInsights.length ? positivePerformanceInsights.map((insight) => <PerformanceInsightCard key={`${insight.dimension_type}-${insight.platform}-${insight.dimension_key}`} insight={insight} t={t} />) : <div className="grow-v227-group-empty">{t("growBrain.performanceLearningNoPositive")}</div>}</div>
              </div>
              <div className="grow-v227-insight-group negative">
                <div className="grow-v227-group-head"><span className="grow-v227-group-icon negative"><TrendingDown size={17} /></span><div><h3>{t("growBrain.performanceLearningImprove")}</h3><p>{t("growBrain.performanceLearningImproveHelp")}</p></div></div>
                <div className="grow-v227-insight-list">{negativePerformanceInsights.length ? negativePerformanceInsights.map((insight) => <PerformanceInsightCard key={`${insight.dimension_type}-${insight.platform}-${insight.dimension_key}`} insight={insight} t={t} />) : <div className="grow-v227-group-empty">{t("growBrain.performanceLearningNoNegative")}</div>}</div>
              </div>
            </div>
          </> : <div className="grow-v227-performance-empty">
            <Activity size={22} />
            <div><strong>{t("growBrain.performanceLearningEmptyTitle")}</strong><p>{t("growBrain.performanceLearningEmptyText")}</p></div>
          </div>}

          <div className="grow-v227-observation-note grow-v229-planning-active"><CircleAlert size={15} /><span>{t("growBrain.performanceLearningPlanningActive")}</span></div>
        </section>

        <section className="grow-v231-web-data-card">
          <div className="grow-v231-web-data-copy">
            <span className="grow-v215-section-kicker">{t("growBrain.webDataEyebrow")}</span>
            <h2>{t("growBrain.webDataTitle")}</h2>
            <p>{t("growBrain.webDataDescription")}</p>
            <div className="grow-v231-web-data-statuses">
              <div className={connectedPlatforms.length ? "connected" : "pending"}>
                <span><CheckCircle2 size={16} /></span>
                <div><strong>{t("growBrain.webDataSocial")}</strong><small>{connectedPlatforms.length ? t("growBrain.webDataSocialConnected", { count: connectedPlatforms.length }) : t("growBrain.webDataSocialPending")}</small></div>
              </div>
              <div className={websiteDataConnected ? "connected" : websiteSetupPending ? "prepared" : "pending"}>
                <span><Globe2 size={16} /></span>
                <div><strong>{t("growBrain.webDataWebsite")}</strong><small>{websiteDataConnected ? t("growBrain.webDataConnected") : websiteSetupPending ? t("growBrain.webDataPrepared", { provider: webProviderMeta.label }) : t("growBrain.webDataNotConnected")}</small></div>
              </div>
              <div className={commerceDataConnected ? "connected" : "pending"}>
                <span><ShoppingBag size={16} /></span>
                <div><strong>{t("growBrain.webDataSales")}</strong><small>{commerceDataConnected ? t("growBrain.webDataSalesConnected") : t("growBrain.webDataSalesOptional")}</small></div>
              </div>
            </div>
          </div>
          <div className="grow-v231-web-data-action">
            {websiteConnection?.provider && websiteConnection?.status !== "not_connected" ? <span className="grow-v231-provider-chip"><WebProviderIcon size={15} />{webProviderMeta.label}</span> : null}
            <button type="button" onClick={openWebsiteConnect} className={websiteDataConnected ? "secondary" : "primary"}>
              <Globe2 size={17} />
              {websiteDataConnected ? t("growBrain.webConnectManage") : t("growBrain.webConnectButton")}
            </button>
            <small>{t("growBrain.webDataOptional")}</small>
          </div>
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
          <article className="grow-v215-panel grow-v215-top-posts"><div className="grow-v215-panel-head"><div><span className="grow-v215-section-kicker">{t("growBrain.content")}</span><h2>{t("growBrain.topContent")}</h2><p>{t("growBrain.topContentHelp")}</p></div></div>{topPosts.length ? <div className="grow-v215-top-list grow-v216-top-grid">{topPosts.slice(0, 6).map((row, index) => { const post = postsById[row.post_id] || {}; const title = truncate(post.idea || post.content || humanize(row.content_type_id || row.content_format) || t("growBrain.publishedPost"), 62); const imageUrl = post.image_url || ""; return <a key={`${row.post_id}-${row.platform}`} href={String(row.post_id || "").startsWith("demo-") ? "/grow-brain?demo=1" : `/posts/${row.post_id}`} className="grow-v215-top-row grow-v216-top-card"><span className="grow-v215-rank">{index + 1}</span><div className={`grow-v216-top-media ${imageUrl ? "has-image" : ""}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}>{!imageUrl ? <PlatformIcon platform={row.platform} /> : null}</div><span className="grow-v215-top-copy"><strong>{title}</strong><small><PlatformIcon platform={row.platform} /> {PLATFORM_META[row.platform]?.label || humanize(row.platform)} · {formatDate(row.published_at, locale)}</small></span><span className="grow-v216-top-metrics"><span><strong>{formatCompact(getInteractionCount(row), locale)}</strong><small>{t("growBrain.interactions")}</small></span><span><strong>{formatCompact(getExposure(row), locale)}</strong><small>{t("growBrain.exposure")}</small></span></span></a>; })}</div> : <div className="grow-v215-list-empty"><BarChart3 size={21} /><p>{t("growBrain.topContentEmpty")}</p></div>}</article>
          <aside className="grow-v215-panel grow-v215-system-card"><div className="grow-v215-panel-head compact"><div><span className="grow-v215-section-kicker">{t("growBrain.system")}</span><h2>{t("growBrain.dataHealth")}</h2></div></div><div className="grow-v215-health-score"><span className="grow-v215-health-ring" style={{ "--score": `${connectedPlatforms.length ? Math.round((healthyPlatforms.length / connectedPlatforms.length) * 100) : 0}%` }}><strong>{connectedPlatforms.length ? Math.round((healthyPlatforms.length / connectedPlatforms.length) * 100) : 0}%</strong></span><div><strong>{t("growBrain.measurementCoverage")}</strong><p>{t("growBrain.measurementCoverageText")}</p></div></div><div className="grow-v215-health-list"><div><CheckCircle2 size={16} /><span>{t("growBrain.connectedChannels")}</span><strong>{connectedPlatforms.length}</strong></div><div><Activity size={16} /><span>{t("growBrain.channelsWithData")}</span><strong>{healthyPlatforms.length}</strong></div><div><Clock3 size={16} /><span>{t("growBrain.lastCollection")}</span><strong>{lastSuccess ? formatDateTime(lastSuccess, locale) : "—"}</strong></div></div><p className="grow-v215-system-note">{t("growBrain.observationalNote")}</p></aside>
        </section>

        {websiteConnectOpen ? <div className="grow-v231-connect-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWebsiteConnectOpen(false); }}>
          <section className="grow-v231-connect-modal" role="dialog" aria-modal="true" aria-labelledby="grow-web-connect-title">
            <button type="button" className="grow-v231-connect-close" onClick={() => setWebsiteConnectOpen(false)} aria-label={t("growBrain.webConnectClose")}><X size={19} /></button>
            {websiteConnectView === "discovering" ? <div className="grow-v231-connect-loading">
              <span className="grow-v231-connect-orb"><LoaderCircle size={28} className="grow-v215-spin" /></span>
              <span className="grow-v215-section-kicker">{t("growBrain.webConnectEyebrow")}</span>
              <h2 id="grow-web-connect-title">{t("growBrain.webConnectScanningTitle")}</h2>
              <p>{t("growBrain.webConnectScanningText")}</p>
            </div> : websiteConnectView === "recommendation" ? <>
              <div className="grow-v231-connect-icon"><WebProviderIcon size={27} /></div>
              <span className="grow-v215-section-kicker">{t("growBrain.webConnectEyebrow")}</span>
              <h2 id="grow-web-connect-title">{websiteDiscovery?.needs_website_url ? t("growBrain.webConnectNeedWebsiteTitle") : t("growBrain.webConnectFoundTitle", { provider: webProviderMeta.label })}</h2>
              <p>{websiteDiscovery?.needs_website_url ? t("growBrain.webConnectNeedWebsiteText") : t(webProviderMeta.descriptionKey)}</p>
              {websiteDiscovery?.technologies?.length ? <div className="grow-v231-tech-list">{websiteDiscovery.technologies.map((technology) => <span key={technology.id}>{technology.label}</span>)}</div> : null}
              {websiteDiscovery?.fetch_error ? <div className="grow-v231-connect-soft-note"><CircleAlert size={15} /><span>{t("growBrain.webConnectPartialDetection")}</span></div> : null}
              <div className="grow-v231-recommendation">
                <span>{t("growBrain.webConnectRecommended")}</span>
                <strong>{webProviderMeta.label}</strong>
                <small>{t("growBrain.webConnectRecommendedHelp")}</small>
              </div>
              {websiteConnectError ? <p className="grow-v231-connect-error" role="alert">{websiteConnectError}</p> : null}
              <div className="grow-v231-connect-actions">
                {websiteDiscovery?.needs_website_url ? <a className="primary" href="/brand">{t("growBrain.webConnectAddWebsite")} <ArrowRight size={16} /></a> : <button type="button" className="primary" onClick={prepareWebsiteProvider}>{t("growBrain.webConnectChoosePath")} <ArrowRight size={16} /></button>}
                <button type="button" onClick={() => setWebsiteConnectOpen(false)}>{t("growBrain.webConnectClose")}</button>
              </div>
            </> : websiteConnectView === "connected" ? <>
              <div className="grow-v231-connect-icon success"><CheckCircle2 size={29} /></div>
              <span className="grow-v215-section-kicker">{t("growBrain.webConnectEyebrow")}</span>
              <h2 id="grow-web-connect-title">{t("growBrain.shopifyConnectedTitle")}</h2>
              <p>{t("growBrain.shopifyConnectedText")}</p>
              <div className="grow-v231-connect-soft-note"><ShoppingBag size={15} /><span>{websiteConnection?.detected_signals?.shop_domain || t("growBrain.shopifyConnectedStore")}</span></div>
              {websiteConnectError ? <p className="grow-v231-connect-error" role="alert">{websiteConnectError}</p> : null}
              <div className="grow-v231-connect-actions">
                <button type="button" className="primary" onClick={() => setWebsiteConnectOpen(false)}>{t("growBrain.webConnectDone")}</button>
                <button type="button" onClick={disconnectShopify}>{t("growBrain.shopifyDisconnect")}</button>
              </div>
            </> : websiteConnectView === "prepared" ? <>
              <div className="grow-v231-connect-icon success"><CheckCircle2 size={29} /></div>
              <span className="grow-v215-section-kicker">{t("growBrain.webConnectEyebrow")}</span>
              <h2 id="grow-web-connect-title">{t("growBrain.webConnectPreparedTitle")}</h2>
              <p>{t("growBrain.webConnectPreparedText", { provider: webProviderMeta.label })}</p>
              <div className="grow-v231-connect-soft-note"><Sparkles size={15} /><span>{t("growBrain.webConnectPreparedSafety")}</span></div>
              <div className="grow-v231-connect-actions"><button type="button" className="primary" onClick={() => setWebsiteConnectOpen(false)}>{t("growBrain.webConnectDone")}</button></div>
            </> : <>
              <div className="grow-v231-connect-icon"><Globe2 size={28} /></div>
              <span className="grow-v215-section-kicker">{t("growBrain.webConnectEyebrow")}</span>
              <h2 id="grow-web-connect-title">{t("growBrain.webConnectIntroTitle")}</h2>
              <p>{t("growBrain.webConnectIntroText")}</p>
              <div className="grow-v231-connect-benefits">
                <div><MousePointerClick size={17} /><span><strong>{t("growBrain.webConnectBenefitTraffic")}</strong><small>{t("growBrain.webConnectBenefitTrafficText")}</small></span></div>
                <div><ShoppingBag size={17} /><span><strong>{t("growBrain.webConnectBenefitSales")}</strong><small>{t("growBrain.webConnectBenefitSalesText")}</small></span></div>
                <div><Sparkles size={17} /><span><strong>{t("growBrain.webConnectBenefitLearning")}</strong><small>{t("growBrain.webConnectBenefitLearningText")}</small></span></div>
              </div>
              {currentBrand?.website_url ? <div className="grow-v231-known-site"><Globe2 size={15} /><span>{t("growBrain.webConnectKnownWebsite")} <strong>{currentBrand.website_url}</strong></span></div> : null}
              {websiteConnectError ? <p className="grow-v231-connect-error" role="alert">{websiteConnectError}</p> : null}
              <div className="grow-v231-connect-actions">
                <button type="button" className="primary" disabled={websiteDiscovering} onClick={discoverWebsiteConnection}><Globe2 size={16} />{t("growBrain.webConnectButton")}</button>
                <button type="button" onClick={dismissWebsiteConnectIntro}>{t("growBrain.webConnectNotNow")}</button>
              </div>
              <p className="grow-v231-connect-optional">{t("growBrain.webConnectOptionalText")}</p>
            </>}
          </section>
        </div> : null}
      </div>
    </AppLayout>
  );
}
