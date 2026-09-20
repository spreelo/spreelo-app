export const PERFORMANCE_LEARNING_VERSION = 1;
export const PERFORMANCE_LEARNING_LOOKBACK_DAYS = 90;
export const PERFORMANCE_LEARNING_MIN_AGE_HOURS = 12;

const DIMENSIONS = Object.freeze([
  "content_type",
  "content_format",
  "platform_content_type",
  "platform_content_format",
]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value) {
  const parsed = finite(value);
  return parsed === null ? null : Math.max(0, parsed);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function median(values) {
  const rows = values.map(finite).filter((value) => value !== null).sort((a, b) => a - b);
  if (!rows.length) return null;
  const midpoint = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[midpoint] : (rows[midpoint - 1] + rows[midpoint]) / 2;
}

function mean(values) {
  const rows = values.map(finite).filter((value) => value !== null);
  if (!rows.length) return null;
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

function rounded(value, digits = 6) {
  const parsed = finite(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function exposureFor(row) {
  for (const key of ["reach", "impressions", "views"]) {
    const value = nonNegative(row?.[key]);
    if (value !== null && value > 0) return value;
  }
  return 0;
}

function interactionCount(row) {
  const engagements = nonNegative(row?.engagements);
  if (engagements !== null) return engagements;
  return ["likes", "comments", "shares", "saves"]
    .map((key) => nonNegative(row?.[key]))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
}

function rate(numerator, denominator) {
  const top = nonNegative(numerator);
  const bottom = nonNegative(denominator);
  if (top === null || bottom === null || bottom <= 0) return null;
  return top / bottom;
}

function relativeRatio(value, baseline) {
  const metric = finite(value);
  const normal = finite(baseline);
  if (metric === null || normal === null || normal <= 0) return null;
  return clamp(metric / normal, 0.25, 4);
}

function ratioScore(ratio) {
  const value = finite(ratio);
  if (value === null || value <= 0) return null;
  return clamp(Math.log2(value) * 35, -70, 70);
}

function sampleConfidence(count) {
  const n = Math.max(0, Number(count || 0));
  if (!n) return 0;
  // Deliberately conservative: ~0.39 at 3 observations, ~0.63 at 6, ~0.86 at 12.
  return clamp(1 - Math.exp(-n / 6), 0, 0.95);
}

function metricRecord(row) {
  const exposure = exposureFor(row);
  const interactions = interactionCount(row);
  const clicks = nonNegative(row?.clicks);
  const shares = nonNegative(row?.shares);
  const saves = nonNegative(row?.saves);
  return {
    source: row,
    exposure,
    interactions,
    engagementRate: rate(interactions, exposure),
    // Missing provider metrics stay null. Unsupported metrics must never be learned as zero performance.
    clickRate: clicks === null ? null : rate(clicks, exposure),
    shareRate: shares === null ? null : rate(shares, exposure),
    saveRate: saves === null ? null : rate(saves, exposure),
  };
}

function buildPlatformBaselines(records) {
  const byPlatform = new Map();
  for (const record of records) {
    const platform = normalizeKey(record?.source?.platform);
    if (!platform) continue;
    const list = byPlatform.get(platform) || [];
    list.push(record);
    byPlatform.set(platform, list);
  }

  const baselines = new Map();
  for (const [platform, rows] of byPlatform.entries()) {
    baselines.set(platform, {
      exposure: median(rows.map((row) => row.exposure).filter((value) => value > 0)),
      engagementRate: median(rows.map((row) => row.engagementRate)),
      clickRate: median(rows.map((row) => row.clickRate)),
      shareRate: median(rows.map((row) => row.shareRate)),
      saveRate: median(rows.map((row) => row.saveRate)),
      observations: rows.length,
    });
  }
  return baselines;
}

function buildGroupKey({ dimensionType, platform, dimensionKey }) {
  return `${dimensionType}:${platform || "all"}:${dimensionKey}`;
}

function addGroup(groups, dimensionType, platform, dimensionKey, record) {
  if (!DIMENSIONS.includes(dimensionType) || !dimensionKey) return;
  const normalizedPlatform = normalizeKey(platform) || "all";
  const normalizedDimensionKey = normalizeKey(dimensionKey);
  if (!normalizedDimensionKey) return;
  const key = buildGroupKey({ dimensionType, platform: normalizedPlatform, dimensionKey: normalizedDimensionKey });
  const group = groups.get(key) || {
    dimensionType,
    platform: normalizedPlatform,
    dimensionKey: normalizedDimensionKey,
    records: [],
  };
  group.records.push(record);
  groups.set(key, group);
}

function classifySignal(score, confidence, observations) {
  if (observations < 3 || confidence < 0.3) return "neutral";
  if (score >= 20) return "strong_positive";
  if (score >= 8) return "positive";
  if (score <= -20) return "strong_negative";
  if (score <= -8) return "negative";
  return "neutral";
}

function scoreGroup(group, platformBaselines) {
  const relative = {
    exposure: [],
    engagement: [],
    click: [],
    share: [],
    save: [],
  };

  for (const record of group.records) {
    const platform = normalizeKey(record?.source?.platform);
    const baseline = platformBaselines.get(platform);
    if (!baseline) continue;
    const pairs = [
      ["exposure", record.exposure, baseline.exposure],
      ["engagement", record.engagementRate, baseline.engagementRate],
      ["click", record.clickRate, baseline.clickRate],
      ["share", record.shareRate, baseline.shareRate],
      ["save", record.saveRate, baseline.saveRate],
    ];
    for (const [key, value, normal] of pairs) {
      const ratio = relativeRatio(value, normal);
      if (ratio !== null) relative[key].push(ratio);
    }
  }

  const relativeMedians = Object.fromEntries(
    Object.entries(relative).map(([key, values]) => [key, median(values)])
  );

  const weights = {
    engagement: 0.4,
    exposure: 0.2,
    click: 0.15,
    share: 0.15,
    save: 0.1,
  };
  let weightedScore = 0;
  let usedWeight = 0;
  const componentScores = {};
  for (const [metric, weight] of Object.entries(weights)) {
    const component = ratioScore(relativeMedians[metric]);
    componentScores[metric] = rounded(component, 2);
    if (component === null) continue;
    weightedScore += component * weight;
    usedWeight += weight;
  }
  const rawScore = usedWeight > 0 ? weightedScore / usedWeight : 0;
  const observations = group.records.length;
  const metricCoverage = clamp(usedWeight, 0, 1);
  const confidence = sampleConfidence(observations) * (0.65 + 0.35 * metricCoverage);
  const performanceScore = clamp(Math.round(rawScore * confidence), -100, 100);
  const signal = classifySignal(performanceScore, confidence, observations);
  const lastPostAt = group.records
    .map((record) => record?.source?.published_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    dimension_type: group.dimensionType,
    platform: group.platform,
    dimension_key: group.dimensionKey,
    observation_count: observations,
    avg_exposure: rounded(mean(group.records.map((row) => row.exposure)), 2),
    avg_interactions: rounded(mean(group.records.map((row) => row.interactions)), 2),
    engagement_rate: rounded(mean(group.records.map((row) => row.engagementRate)), 8),
    click_rate: rounded(mean(group.records.map((row) => row.clickRate)), 8),
    share_rate: rounded(mean(group.records.map((row) => row.shareRate)), 8),
    save_rate: rounded(mean(group.records.map((row) => row.saveRate)), 8),
    relative_exposure: rounded(relativeMedians.exposure, 4),
    relative_engagement: rounded(relativeMedians.engagement, 4),
    relative_click: rounded(relativeMedians.click, 4),
    relative_share: rounded(relativeMedians.share, 4),
    relative_save: rounded(relativeMedians.save, 4),
    performance_score: performanceScore,
    confidence: rounded(confidence, 4),
    signal,
    last_post_at: lastPostAt,
    evidence_json: {
      component_scores: componentScores,
      relative_medians: Object.fromEntries(Object.entries(relativeMedians).map(([key, value]) => [key, rounded(value, 4)])),
      metric_coverage: rounded(metricCoverage, 4),
      scoring: {
        baseline: "same_platform_median",
        outlier_ratio_cap: [0.25, 4],
        confidence_model: "sample confidence adjusted by available metric coverage",
        minimum_signal_observations: 3,
      },
    },
  };
}

export function isEligiblePerformanceRow(row, now = new Date()) {
  if (!row?.brand_profile_id || !row?.user_id || !normalizeKey(row?.platform)) return false;
  const explicitAge = finite(row?.age_hours);
  if (explicitAge !== null && explicitAge < PERFORMANCE_LEARNING_MIN_AGE_HOURS) return false;
  if (explicitAge === null && row?.published_at) {
    const publishedAt = new Date(row.published_at).getTime();
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (Number.isFinite(publishedAt) && Number.isFinite(nowMs) && nowMs - publishedAt < PERFORMANCE_LEARNING_MIN_AGE_HOURS * 3_600_000) return false;
  }
  return exposureFor(row) > 0;
}

export function analyzeBrandPerformance(rows, { now = new Date() } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const eligibleRows = sourceRows.filter((row) => isEligiblePerformanceRow(row, now));
  const records = eligibleRows.map(metricRecord);
  const platformBaselines = buildPlatformBaselines(records);
  const groups = new Map();

  for (const record of records) {
    const row = record.source;
    const platform = normalizeKey(row.platform);
    const contentType = normalizeKey(row.content_type_id);
    const contentFormat = normalizeKey(row.content_format);
    if (contentType) {
      addGroup(groups, "content_type", "all", contentType, record);
      addGroup(groups, "platform_content_type", platform, contentType, record);
    }
    if (contentFormat) {
      addGroup(groups, "content_format", "all", contentFormat, record);
      addGroup(groups, "platform_content_format", platform, contentFormat, record);
    }
  }

  const insights = [...groups.values()]
    .map((group) => scoreGroup(group, platformBaselines))
    .sort((left, right) => {
      const confidenceDiff = Number(right.confidence || 0) - Number(left.confidence || 0);
      if (Math.abs(confidenceDiff) > 0.05) return confidenceDiff;
      return Math.abs(Number(right.performance_score || 0)) - Math.abs(Number(left.performance_score || 0));
    });

  const state = eligibleRows.length >= 12 ? "established" : eligibleRows.length >= 4 ? "early" : "collecting";
  const topPositive = insights
    .filter((item) => item.performance_score > 0 && item.observation_count >= 3)
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, 5);
  const topNegative = insights
    .filter((item) => item.performance_score < 0 && item.observation_count >= 3)
    .sort((a, b) => a.performance_score - b.performance_score)
    .slice(0, 5);

  return {
    version: PERFORMANCE_LEARNING_VERSION,
    state,
    source_post_count: sourceRows.length,
    eligible_post_count: eligibleRows.length,
    insight_count: insights.length,
    platform_baselines: Object.fromEntries([...platformBaselines.entries()].map(([platform, baseline]) => [platform, {
      exposure: rounded(baseline.exposure, 2),
      engagement_rate: rounded(baseline.engagementRate, 8),
      click_rate: rounded(baseline.clickRate, 8),
      share_rate: rounded(baseline.shareRate, 8),
      save_rate: rounded(baseline.saveRate, 8),
      observations: baseline.observations,
    }])),
    insights,
    summary: {
      top_positive: topPositive.map((item) => ({
        dimension_type: item.dimension_type,
        platform: item.platform,
        dimension_key: item.dimension_key,
        performance_score: item.performance_score,
        confidence: item.confidence,
        observation_count: item.observation_count,
      })),
      top_negative: topNegative.map((item) => ({
        dimension_type: item.dimension_type,
        platform: item.platform,
        dimension_key: item.dimension_key,
        performance_score: item.performance_score,
        confidence: item.confidence,
        observation_count: item.observation_count,
      })),
    },
  };
}

export function isPerformanceLearningStorageMissingError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return /brand_performance_(?:insights|learning_state)|schema cache|relation .* does not exist|could not find the table/.test(message);
}

export async function rebuildBrandPerformanceInsights({ supabase, brandProfileId, userId, now = new Date() }) {
  if (!supabase || !brandProfileId || !userId) return null;
  const since = new Date(now.getTime() - PERFORMANCE_LEARNING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("post_performance_latest")
    .select("post_id,platform,user_id,brand_profile_id,content_type_id,content_format,published_at,captured_at,age_hours,views,reach,impressions,likes,comments,shares,saves,clicks,engagements")
    .eq("brand_profile_id", brandProfileId)
    .eq("user_id", userId)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(1500);
  if (error) throw error;

  const analysis = analyzeBrandPerformance(data || [], { now });
  const computedAt = now.toISOString();
  const insightRows = analysis.insights.map((insight) => ({
    brand_profile_id: brandProfileId,
    user_id: userId,
    insight_version: PERFORMANCE_LEARNING_VERSION,
    ...insight,
    computed_at: computedAt,
    updated_at: computedAt,
  }));

  if (insightRows.length) {
    const { error: upsertError } = await supabase
      .from("brand_performance_insights")
      .upsert(insightRows, { onConflict: "brand_profile_id,dimension_type,platform,dimension_key" });
    if (upsertError) throw upsertError;

    const { error: pruneError } = await supabase
      .from("brand_performance_insights")
      .delete()
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId)
      .lt("computed_at", computedAt);
    if (pruneError) throw pruneError;
  } else {
    const { error: clearError } = await supabase
      .from("brand_performance_insights")
      .delete()
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId);
    if (clearError) throw clearError;
  }

  const lastSourceAt = (data || []).map((row) => row.captured_at).filter(Boolean).sort().at(-1) || null;
  const nextAnalysisAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const { error: stateError } = await supabase
    .from("brand_performance_learning_state")
    .upsert({
      brand_profile_id: brandProfileId,
      user_id: userId,
      analysis_version: PERFORMANCE_LEARNING_VERSION,
      learning_state: analysis.state,
      source_post_count: analysis.source_post_count,
      eligible_post_count: analysis.eligible_post_count,
      insight_count: analysis.insight_count,
      status: "healthy",
      last_source_at: lastSourceAt,
      last_analyzed_at: computedAt,
      next_analysis_at: nextAnalysisAt,
      consecutive_failures: 0,
      last_error: null,
      summary_json: {
        ...analysis.summary,
        platform_baselines: analysis.platform_baselines,
      },
      updated_at: computedAt,
    }, { onConflict: "brand_profile_id" });
  if (stateError) throw stateError;

  return analysis;
}

// Step 4: conservative planning influence. Performance learning is intentionally
// soft evidence: it can nudge content selection, never hard-ban a format or
// override channel compatibility, verified capabilities, recency, or the chosen goal.
const PERFORMANCE_FORMAT_BY_CONTENT_TYPE = Object.freeze({
  website_item: "single_image",
  website_item_text_ad: "single_image",
  animated_website_item: "animated_video",
  ai_product_video: "video",
  carousel_website_item: "carousel",
  problem_solution: "single_image",
  tips: "single_image",
  faq: "single_image",
  guide_choice: "single_image",
  service_focus: "single_image",
  engagement_humor: "single_image",
});

const PERFORMANCE_GOAL_METRIC_WEIGHTS = Object.freeze({
  sell_more: Object.freeze({ exposure: 0.12, engagement: 0.18, click: 0.38, share: 0.10, save: 0.22 }),
  get_followers: Object.freeze({ exposure: 0.34, engagement: 0.30, click: 0.05, share: 0.21, save: 0.10 }),
  build_trust: Object.freeze({ exposure: 0.10, engagement: 0.25, click: 0.10, share: 0.25, save: 0.30 }),
});

function normalizePlatformSelection(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,;+|]/g);
  return [...new Set(values.map((item) => normalizeKey(item)).filter(Boolean))];
}

function goalAdjustedInsightScore(insight, goalId) {
  const baseScore = clamp(Number(insight?.performance_score || 0), -100, 100);
  const weights = PERFORMANCE_GOAL_METRIC_WEIGHTS[goalId] || PERFORMANCE_GOAL_METRIC_WEIGHTS.build_trust;
  const metricRatios = {
    exposure: finite(insight?.relative_exposure),
    engagement: finite(insight?.relative_engagement),
    click: finite(insight?.relative_click),
    share: finite(insight?.relative_share),
    save: finite(insight?.relative_save),
  };
  let weighted = 0;
  let usedWeight = 0;
  for (const [metric, weight] of Object.entries(weights)) {
    const ratio = metricRatios[metric];
    if (ratio === null || ratio <= 0) continue;
    weighted += ratioScore(ratio) * weight;
    usedWeight += weight;
  }
  const goalScore = usedWeight > 0 ? weighted / usedWeight : baseScore;
  return clamp(baseScore * 0.68 + goalScore * 0.32, -100, 100);
}

function getPerformanceStateScale(learningState) {
  const state = normalizeKey(learningState);
  if (state === "established") return 1;
  if (state === "early") return 0.55;
  return 0;
}

function isPlanningInsightEligible(insight, { minObservations = 4, minConfidence = 0.35 } = {}) {
  const observations = Number(insight?.observation_count || 0);
  const confidence = Number(insight?.confidence || 0);
  return observations >= minObservations && confidence >= minConfidence && normalizeKey(insight?.signal) !== "neutral";
}

function getRelevantPlanningInsights(insights, contentTypeId, selectedPlatforms = []) {
  const typeId = normalizeKey(contentTypeId);
  if (!typeId) return [];
  const formatId = PERFORMANCE_FORMAT_BY_CONTENT_TYPE[typeId] || "";
  const platforms = normalizePlatformSelection(selectedPlatforms);
  return (Array.isArray(insights) ? insights : []).filter((insight) => {
    const dimensionType = normalizeKey(insight?.dimension_type);
    const dimensionKey = normalizeKey(insight?.dimension_key);
    const platform = normalizeKey(insight?.platform) || "all";
    if (dimensionType === "content_type") return dimensionKey === typeId;
    if (dimensionType === "platform_content_type") {
      return dimensionKey === typeId && platforms.length > 0 && platforms.includes(platform);
    }
    if (formatId && dimensionType === "content_format") return dimensionKey === formatId;
    if (formatId && dimensionType === "platform_content_format") {
      return dimensionKey === formatId && platforms.length > 0 && platforms.includes(platform);
    }
    return false;
  });
}

export function getPerformanceLearningContentTypeAdjustment(
  insights,
  contentTypeId,
  {
    goalId = "build_trust",
    selectedPlatforms = [],
    learningState = "collecting",
    minObservations = 4,
    minConfidence = 0.35,
    maxAdjustment = 14,
  } = {}
) {
  const stateScale = getPerformanceStateScale(learningState);
  if (stateScale <= 0) return 0;

  const relevant = getRelevantPlanningInsights(insights, contentTypeId, selectedPlatforms)
    .filter((insight) => isPlanningInsightEligible(insight, { minObservations, minConfidence }));
  if (!relevant.length) return 0;

  let weightedScore = 0;
  let totalWeight = 0;
  for (const insight of relevant) {
    const dimensionType = normalizeKey(insight.dimension_type);
    const baseDimensionWeight = dimensionType === "platform_content_type"
      ? 1.25
      : dimensionType === "content_type"
        ? 1
        : dimensionType === "platform_content_format"
          ? 0.62
          : 0.46;
    const confidence = clamp(Number(insight.confidence || 0), 0, 1);
    const sampleWeight = clamp(Number(insight.observation_count || 0) / 8, 0.5, 1.25);
    const evidenceWeight = baseDimensionWeight * confidence * sampleWeight;
    weightedScore += goalAdjustedInsightScore(insight, goalId) * evidenceWeight;
    totalWeight += evidenceWeight;
  }

  if (totalWeight <= 0) return 0;
  let normalizedScore = clamp(weightedScore / totalWeight, -100, 100);
  // Negative evidence is intentionally a little more conservative so Grow Brain
  // reduces repetition rather than silently banning a content type.
  if (normalizedScore < 0) normalizedScore *= 0.78;
  const adjustment = (normalizedScore / 100) * Math.max(0, Number(maxAdjustment || 0)) * stateScale;
  return Number(clamp(adjustment, -maxAdjustment, maxAdjustment).toFixed(2));
}

export function buildPerformanceLearningPlannerContext(
  insights,
  {
    goalId = "build_trust",
    selectedPlatforms = [],
    learningState = "collecting",
    maxSignals = 8,
  } = {}
) {
  const stateScale = getPerformanceStateScale(learningState);
  const platforms = normalizePlatformSelection(selectedPlatforms);
  if (stateScale <= 0) {
    return {
      learning_state: normalizeKey(learningState) || "collecting",
      active: false,
      note: "Performance learning is still collecting enough evidence to influence planning.",
      positive_signals: [],
      negative_signals: [],
    };
  }

  const rows = (Array.isArray(insights) ? insights : [])
    .filter((insight) => isPlanningInsightEligible(insight))
    .filter((insight) => {
      const platform = normalizeKey(insight?.platform) || "all";
      return platform === "all" || !platforms.length || platforms.includes(platform);
    })
    .map((insight) => ({
      dimension_type: insight.dimension_type,
      platform: insight.platform || "all",
      dimension_key: insight.dimension_key,
      observation_count: Number(insight.observation_count || 0),
      confidence: Number(Number(insight.confidence || 0).toFixed(2)),
      performance_score: Number(insight.performance_score || 0),
      goal_adjusted_score: Math.round(goalAdjustedInsightScore(insight, goalId) * stateScale),
      signal: insight.signal,
      relative_exposure: finite(insight.relative_exposure),
      relative_engagement: finite(insight.relative_engagement),
      relative_click: finite(insight.relative_click),
      relative_share: finite(insight.relative_share),
      relative_save: finite(insight.relative_save),
    }))
    .sort((left, right) => Math.abs(right.goal_adjusted_score) - Math.abs(left.goal_adjusted_score));

  return {
    learning_state: normalizeKey(learningState) || "collecting",
    active: rows.length > 0,
    goal: goalId,
    selected_platforms: platforms,
    rules: {
      influence: "soft_nudge_only",
      hard_bans: false,
      preserve_exploration: true,
      minimum_observations: 4,
      minimum_confidence: 0.35,
    },
    positive_signals: rows.filter((row) => row.goal_adjusted_score > 0).slice(0, maxSignals),
    negative_signals: rows.filter((row) => row.goal_adjusted_score < 0).slice(0, maxSignals),
  };
}

export async function loadBrandPerformancePlanningContext({ supabase, brandProfileId, userId }) {
  if (!supabase || !brandProfileId || !userId) return null;
  try {
    const [insightsResult, stateResult] = await Promise.all([
      supabase
        .from("brand_performance_insights")
        .select("dimension_type,platform,dimension_key,observation_count,performance_score,confidence,signal,relative_exposure,relative_engagement,relative_click,relative_share,relative_save,last_post_at,computed_at")
        .eq("brand_profile_id", brandProfileId)
        .eq("user_id", userId)
        .order("confidence", { ascending: false })
        .limit(120),
      supabase
        .from("brand_performance_learning_state")
        .select("learning_state,eligible_post_count,insight_count,status,last_analyzed_at")
        .eq("brand_profile_id", brandProfileId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (insightsResult.error || stateResult.error) {
      const error = insightsResult.error || stateResult.error;
      if (isPerformanceLearningStorageMissingError(error)) return null;
      throw error;
    }

    return {
      learningState: stateResult.data?.learning_state || "collecting",
      eligiblePostCount: Number(stateResult.data?.eligible_post_count || 0),
      insightCount: Number(stateResult.data?.insight_count || 0),
      status: stateResult.data?.status || "pending",
      lastAnalyzedAt: stateResult.data?.last_analyzed_at || null,
      insights: Array.isArray(insightsResult.data) ? insightsResult.data : [],
    };
  } catch (error) {
    console.warn("Could not load Grow Brain performance planning context", {
      brandProfileId,
      message: error?.message || String(error),
    });
    return null;
  }
}
