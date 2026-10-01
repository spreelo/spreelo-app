import { createHash } from "node:crypto";
const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function normalizeFlag(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdList(value) {
  return String(value || "")
    .split(/[;,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getGrowthAgentEnvironmentFallbackMode(userId) {
  const globallyEnabled = TRUE_VALUES.has(normalizeFlag(process.env.GROWTH_AGENT_V1));
  const allowList = normalizeIdList(process.env.GROWTH_AGENT_V1_USER_IDS);
  if (allowList.length > 0) return allowList.includes(String(userId || "")) ? "active" : "off";
  return globallyEnabled ? "active" : "off";
}

export function isGrowthAgentV1EnabledForUser(userId) {
  return getGrowthAgentEnvironmentFallbackMode(userId) === "active";
}

export async function loadGrowthAgentMode({ admin, userId } = {}) {
  const fallback = getGrowthAgentEnvironmentFallbackMode(userId);
  if (!admin || !userId) return fallback;
  try {
    const { data, error } = await admin.from("growth_agent_settings").select("mode").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const mode = String(data?.mode || "").trim().toLowerCase();
    return ["off", "shadow", "active"].includes(mode) ? mode : fallback;
  } catch {
    return fallback;
  }
}

export function isGrowthAgentActiveMode(mode) {
  return String(mode || "").toLowerCase() === "active";
}

export function isGrowthAgentShadowMode(mode) {
  return String(mode || "").toLowerCase() === "shadow";
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, safeNumber(value)));
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function countBy(values = []) {
  const counts = new Map();
  for (const value of values) {
    const key = normalizeKey(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function recentFormatCounts(recentHistory = [], limit = 16) {
  return countBy(recentHistory.slice(0, limit).map((row) => row?.content_type_id));
}

function activeFormatCounts(activeRules = []) {
  return countBy(
    activeRules
      .filter((rule) => rule?.is_active !== false)
      .map((rule) => rule?.content_type_id)
  );
}

function recentProductCounts(recentHistory = [], limit = 20) {
  return countBy(
    recentHistory
      .slice(0, limit)
      .flatMap((row) => (Array.isArray(row?.product_titles) ? row.product_titles : []))
  );
}

function buildFormatSignalMap(performancePlanning) {
  const map = new Map();
  const signals = [
    ...(Array.isArray(performancePlanning?.signals) ? performancePlanning.signals : []),
    ...(Array.isArray(performancePlanning?.positive_signals) ? performancePlanning.positive_signals : []),
    ...(Array.isArray(performancePlanning?.negative_signals) ? performancePlanning.negative_signals : []),
  ];
  for (const signal of signals) {
    const dimensionType = normalizeKey(signal?.dimension_type || signal?.type);
    if (dimensionType && dimensionType !== "content_type") continue;
    const key = normalizeKey(signal?.dimension_key || signal?.content_type_id || signal?.key);
    if (!key) continue;
    map.set(key, {
      score: safeNumber(signal?.performance_score),
      confidence: clamp(signal?.confidence, 0, 1),
      observations: Math.max(0, safeNumber(signal?.observation_count || signal?.observations)),
      signal: normalizeKey(signal?.signal),
    });
  }
  return map;
}


export const GROWTH_AGENT_PROFILE_VERSION = 3;

function profileLearningState(performancePlanning, evidenceCount, avgConfidence) {
  const sourceState = normalizeKey(performancePlanning?.learning_state);
  if (sourceState === "established" && evidenceCount >= 6 && avgConfidence >= 0.55) return "established";
  if (["early", "established"].includes(sourceState) && evidenceCount >= 3 && avgConfidence >= 0.35) return "early";
  return "collecting";
}

function signalRows(performancePlanning) {
  return [
    ...(Array.isArray(performancePlanning?.positive_signals) ? performancePlanning.positive_signals : []),
    ...(Array.isArray(performancePlanning?.negative_signals) ? performancePlanning.negative_signals : []),
  ]
    .filter((row) => normalizeKey(row?.dimension_type).includes("content_type"))
    .filter((row) => normalizeKey(row?.dimension_key))
    .map((row) => ({
      dimension_type: normalizeKey(row.dimension_type),
      platform: normalizeKey(row.platform) || "all",
      content_type_id: normalizeKey(row.dimension_key),
      observations: Math.max(0, safeNumber(row.observation_count)),
      confidence: clamp(row.confidence, 0, 1),
      score: clamp(row.goal_adjusted_score ?? row.performance_score, -100, 100),
      signal: normalizeKey(row.signal),
      relative_exposure: safeNumber(row.relative_exposure) || null,
      relative_engagement: safeNumber(row.relative_engagement) || null,
      relative_click: safeNumber(row.relative_click) || null,
      relative_share: safeNumber(row.relative_share) || null,
      relative_save: safeNumber(row.relative_save) || null,
    }));
}

export function buildGrowthAgentProfile({
  performancePlanning = null,
  recentHistory = [],
  selectedPlatforms = [],
  customerLearning = null,
} = {}) {
  const evidence = signalRows(performancePlanning);
  const evidenceCount = evidence.length;
  const totalObservations = evidence.reduce((sum, row) => sum + row.observations, 0);
  const avgConfidence = evidenceCount
    ? evidence.reduce((sum, row) => sum + row.confidence, 0) / evidenceCount
    : 0;
  const learningState = profileLearningState(performancePlanning, evidenceCount, avgConfidence);

  const ranked = [...evidence].sort((a, b) => {
    const left = Math.abs(a.score) * a.confidence * Math.max(1, Math.log2(a.observations + 1));
    const right = Math.abs(b.score) * b.confidence * Math.max(1, Math.log2(b.observations + 1));
    return right - left;
  });

  const strengths = ranked.filter((row) => row.score >= 8).slice(0, 5);
  const weaknesses = ranked.filter((row) => row.score <= -8).slice(0, 5);
  const recentCounts = recentFormatCounts(recentHistory, 24);
  const underexplored = [...new Set(
    evidence.map((row) => row.content_type_id).filter((id) => (recentCounts.get(id) || 0) <= 1)
  )].slice(0, 5);
  const dataQuality = learningState === "established" ? "strong" : learningState === "early" ? "developing" : "limited";

  return {
    version: GROWTH_AGENT_PROFILE_VERSION,
    learning_state: learningState,
    data_quality: dataQuality,
    evidence_count: evidenceCount,
    observation_count: totalObservations,
    average_confidence: Math.round(avgConfidence * 1000) / 1000,
    selected_platforms: Array.isArray(selectedPlatforms) ? selectedPlatforms : [],
    strengths,
    weaknesses,
    underexplored_content_types: underexplored,
    customer_learning_state: normalizeKey(customerLearning?.learning_state) || "collecting",
    safeguards: {
      minimum_observations_for_signal: 4,
      minimum_confidence_for_signal: 0.35,
      no_hard_bans: true,
      preserve_exploration: true,
      existing_calendar_not_rewritten: true,
    },
  };
}

export async function saveGrowthAgentProfile({ admin, userId, brandProfileId, profile } = {}) {
  if (!admin || !userId || !brandProfileId || !profile) return null;
  const now = new Date().toISOString();
  const payload = {
    brand_profile_id: brandProfileId,
    user_id: userId,
    profile_version: GROWTH_AGENT_PROFILE_VERSION,
    learning_state: profile.learning_state || "collecting",
    data_quality: profile.data_quality || "limited",
    observation_count: Math.max(0, Number(profile.observation_count || 0)),
    evidence_count: Math.max(0, Number(profile.evidence_count || 0)),
    average_confidence: clamp(profile.average_confidence, 0, 1),
    profile_json: profile,
    updated_at: now,
  };
  const { data, error } = await admin
    .from("growth_agent_profiles")
    .upsert(payload, { onConflict: "brand_profile_id" })
    .select("brand_profile_id,user_id,profile_version,learning_state,data_quality,observation_count,evidence_count,average_confidence,profile_json,updated_at")
    .single();
  if (error) throw error;
  return data;
}

function getProfileSignal(profile, contentTypeId) {
  const id = normalizeKey(contentTypeId);
  if (!id || !profile || profile.learning_state === "collecting") return null;
  const rows = [
    ...(Array.isArray(profile.strengths) ? profile.strengths : []),
    ...(Array.isArray(profile.weaknesses) ? profile.weaknesses : []),
  ];
  return rows.find((row) => normalizeKey(row?.content_type_id) === id) || null;
}

export function getGrowthProfileFormatAdjustment(profile, contentTypeId) {
  const signal = getProfileSignal(profile, contentTypeId);
  if (!signal) return 0;
  const stateScale = profile.learning_state === "established" ? 1 : 0.55;
  const evidenceScale = clamp(signal.confidence, 0, 1) * clamp(signal.observations / 10, 0.35, 1);
  const raw = (clamp(signal.score, -100, 100) / 100) * 6 * stateScale * evidenceScale;
  return Math.round(clamp(raw, -4, 4) * 100) / 100;
}



export const GROWTH_AGENT_EXPERIMENT_VERSION = 4;

function findProfileEvidence(profile, contentTypeId) {
  const id = normalizeKey(contentTypeId);
  const rows = [
    ...(Array.isArray(profile?.strengths) ? profile.strengths : []),
    ...(Array.isArray(profile?.weaknesses) ? profile.weaknesses : []),
  ];
  return rows.find((row) => normalizeKey(row?.content_type_id) === id) || null;
}

export function buildGrowthAgentExperiments({
  growthProfile = null,
  availableFormats = [],
  recentHistory = [],
  goalId = "",
} = {}) {
  if (!growthProfile || growthProfile.learning_state === "collecting") return [];
  const availableIds = new Set((availableFormats || []).map((item) => normalizeKey(item?.id)).filter(Boolean));
  const recentCounts = recentFormatCounts(recentHistory, 24);
  const experiments = [];

  for (const contentTypeId of growthProfile.underexplored_content_types || []) {
    const id = normalizeKey(contentTypeId);
    if (!id || !availableIds.has(id) || (recentCounts.get(id) || 0) > 1) continue;
    const evidence = findProfileEvidence(growthProfile, id);
    experiments.push({
      experiment_key: `explore_content_type:${id}`,
      kind: "content_type_exploration",
      content_type_id: id,
      goal_id: goalId || "",
      hypothesis: `A controlled test of ${id} can add useful brand-specific evidence without displacing established strengths.`,
      max_plan_share: 0.2,
      baseline_observations: Math.max(0, safeNumber(evidence?.observations)),
      baseline_score: safeNumber(evidence?.score),
      baseline_confidence: clamp(evidence?.confidence, 0, 1),
      priority: 1.25,
    });
    if (experiments.length >= 2) break;
  }

  const topStrength = (growthProfile.strengths || [])
    .filter((row) => availableIds.has(normalizeKey(row?.content_type_id)))
    .filter((row) => safeNumber(row?.observations) < 24)
    .sort((a,b) => (safeNumber(b.score) * clamp(b.confidence,0,1)) - (safeNumber(a.score) * clamp(a.confidence,0,1)))[0];
  if (topStrength) {
    const id = normalizeKey(topStrength.content_type_id);
    experiments.push({
      experiment_key: `validate_strength:${id}`,
      kind: "strength_validation",
      content_type_id: id,
      goal_id: goalId || "",
      hypothesis: `${id} currently looks promising; validate that the signal persists with more observations before increasing its long-term weight.`,
      max_plan_share: 0.2,
      baseline_observations: Math.max(0, safeNumber(topStrength.observations)),
      baseline_score: safeNumber(topStrength.score),
      baseline_confidence: clamp(topStrength.confidence, 0, 1),
      priority: 0.75,
    });
  }

  const seen = new Set();
  return experiments.filter((item) => {
    if (!item.content_type_id || seen.has(item.experiment_key)) return false;
    seen.add(item.experiment_key);
    return true;
  }).slice(0, 3);
}

export async function syncGrowthAgentExperiments({ admin, userId, brandProfileId, experiments = [], growthProfile = null } = {}) {
  if (!admin || !userId || !brandProfileId) return [];
  const { data: existingRows, error: existingError } = await admin
    .from("growth_agent_experiments")
    .select("id,experiment_key,status,baseline_observations,baseline_score,baseline_confidence,activated_at,completed_at,outcome")
    .eq("brand_profile_id", brandProfileId);
  if (existingError) throw existingError;
  const existing = new Map((existingRows || []).map((row) => [row.experiment_key, row]));
  const now = new Date().toISOString();
  const upserts = [];
  for (const experiment of experiments) {
    const previous = existing.get(experiment.experiment_key);
    const currentEvidence = findProfileEvidence(growthProfile, experiment.content_type_id);
    let status = previous?.status || "proposed";
    let outcome = previous?.outcome || null;
    let completedAt = previous?.completed_at || null;
    if (status === "active" && currentEvidence) {
      const gained = Math.max(0, safeNumber(currentEvidence.observations) - safeNumber(previous?.baseline_observations));
      if (gained >= 4) {
        const delta = safeNumber(currentEvidence.score) - safeNumber(previous?.baseline_score);
        status = "completed";
        outcome = delta >= 5 ? "supported" : delta <= -5 ? "not_supported" : "inconclusive";
        completedAt = now;
      }
    }
    upserts.push({
      brand_profile_id: brandProfileId,
      user_id: userId,
      experiment_version: GROWTH_AGENT_EXPERIMENT_VERSION,
      experiment_key: experiment.experiment_key,
      kind: experiment.kind,
      content_type_id: experiment.content_type_id,
      goal_id: experiment.goal_id || null,
      hypothesis: experiment.hypothesis,
      max_plan_share: clamp(experiment.max_plan_share, 0, 0.2),
      status,
      baseline_observations: previous ? safeNumber(previous.baseline_observations) : safeNumber(experiment.baseline_observations),
      baseline_score: previous ? safeNumber(previous.baseline_score) : safeNumber(experiment.baseline_score),
      baseline_confidence: previous ? clamp(previous.baseline_confidence,0,1) : clamp(experiment.baseline_confidence,0,1),
      latest_observations: Math.max(0, safeNumber(currentEvidence?.observations)),
      latest_score: safeNumber(currentEvidence?.score),
      latest_confidence: clamp(currentEvidence?.confidence, 0, 1),
      activated_at: previous?.activated_at || null,
      completed_at: completedAt,
      outcome,
      updated_at: now,
    });
  }
  if (!upserts.length) return [];
  const { data, error } = await admin
    .from("growth_agent_experiments")
    .upsert(upserts, { onConflict: "brand_profile_id,experiment_key" })
    .select("*");
  if (error) throw error;
  return data || [];
}

export async function activateSelectedGrowthAgentExperiments({ admin, brandProfileId, experiments = [], selectedContentTypeIds = [] } = {}) {
  if (!admin || !brandProfileId) return;
  const selected = new Set((selectedContentTypeIds || []).map(normalizeKey));
  const keys = (experiments || []).filter((item) => selected.has(normalizeKey(item.content_type_id))).map((item) => item.experiment_key);
  if (!keys.length) return;
  const now = new Date().toISOString();
  const { error } = await admin.from("growth_agent_experiments")
    .update({ status: "active", activated_at: now, updated_at: now })
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "proposed")
    .in("experiment_key", keys);
  if (error) throw error;
}

function getExperimentFormatAdjustment(experiments, contentTypeId) {
  const id = normalizeKey(contentTypeId);
  const candidate = (experiments || []).find((item) => normalizeKey(item?.content_type_id) === id);
  if (!candidate) return 0;
  return candidate.kind === "content_type_exploration" ? 1.5 : 0.75;
}


export const GROWTH_AGENT_OPPORTUNITY_VERSION = 5;

function daysSince(value, nowMs = Date.now()) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 86400000);
}

function daysUntil(value, nowMs = Date.now()) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return (t - nowMs) / 86400000;
}

export function buildGrowthAgentOpportunities({
  productCatalog = [],
  upcomingCampaigns = [],
  growthProfile = null,
  availableFormats = [],
  now = new Date(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const opportunities = [];
  const activeProducts = (productCatalog || []).filter((row) => row?.is_active !== false && (row?.title || row?.product_url));

  for (const row of activeProducts) {
    const title = String(row?.title || '').trim();
    const productUrl = String(row?.product_url || '').trim();
    const timesUsed = Math.max(0, safeNumber(row?.times_used));
    const seenAgo = daysSince(row?.last_seen_at, safeNowMs);
    const usedAgo = daysSince(row?.last_used_at, safeNowMs);
    const base = { product_title: title, product_url: productUrl, content_type_id: null };

    if (timesUsed === 0 && seenAgo !== null && seenAgo <= 14) {
      opportunities.push({
        opportunity_key: `new_product:${normalizeKey(productUrl || title)}`,
        kind: 'new_product',
        priority: 90,
        title: title || 'Recently discovered product',
        reason: 'Recently discovered verified product has not yet been used in social content.',
        ...base,
      });
      continue;
    }
    if (timesUsed === 0) {
      opportunities.push({
        opportunity_key: `unused_product:${normalizeKey(productUrl || title)}`,
        kind: 'unused_product',
        priority: 72,
        title: title || 'Unused verified product',
        reason: 'Verified product exists in the catalog but has not yet been used in social content.',
        ...base,
      });
      continue;
    }
    if (usedAgo !== null && usedAgo >= 45) {
      opportunities.push({
        opportunity_key: `stale_product:${normalizeKey(productUrl || title)}`,
        kind: 'stale_product',
        priority: 58,
        title: title || 'Product not promoted recently',
        reason: `Verified product has not been used for about ${Math.round(usedAgo)} days.`,
        ...base,
      });
    }
  }

  for (const campaign of upcomingCampaigns || []) {
    const targetDate = campaign?.event_date || campaign?.start_date || campaign?.end_date;
    const until = daysUntil(targetDate, safeNowMs);
    if (until === null || until < -2 || until > 30) continue;
    const title = String(campaign?.title || '').trim();
    if (!title) continue;
    opportunities.push({
      opportunity_key: `campaign_window:${normalizeKey(title)}:${String(targetDate || '').slice(0,10)}`,
      kind: 'campaign_window',
      priority: clamp(85 - Math.max(0, until) * 1.4 + safeNumber(campaign?.relevance_score) * 0.1, 45, 95),
      title,
      reason: until <= 0 ? 'Relevant campaign window is active now.' : `Relevant campaign window starts in about ${Math.ceil(until)} days.`,
      campaign_title: title,
      campaign_goal: campaign?.campaign_goal || '',
      content_type_id: null,
    });
  }

  const availableIds = new Set((availableFormats || []).map((item) => normalizeKey(item?.id)).filter(Boolean));
  for (const contentTypeId of growthProfile?.underexplored_content_types || []) {
    const id = normalizeKey(contentTypeId);
    if (!id || !availableIds.has(id)) continue;
    opportunities.push({
      opportunity_key: `format_gap:${id}`,
      kind: 'format_gap',
      priority: 48,
      title: id,
      reason: 'This safe format is underexplored for this brand and can add learning without replacing established strengths.',
      content_type_id: id,
    });
  }

  const seen = new Set();
  return opportunities
    .filter((item) => item.opportunity_key && !seen.has(item.opportunity_key) && seen.add(item.opportunity_key))
    .sort((a,b) => safeNumber(b.priority) - safeNumber(a.priority))
    .slice(0, 12);
}

export async function syncGrowthAgentOpportunities({ admin, userId, brandProfileId, opportunities = [] } = {}) {
  if (!admin || !userId || !brandProfileId) return [];
  const now = new Date().toISOString();
  const opportunityKeys = new Set((opportunities || []).map((item) => item?.opportunity_key).filter(Boolean));
  const { data: existingOpen, error: existingError } = await admin.from('growth_agent_opportunities')
    .select('opportunity_key')
    .eq('brand_profile_id', brandProfileId)
    .eq('status', 'open');
  if (existingError) throw existingError;
  const staleKeys = (existingOpen || []).map((row) => row.opportunity_key).filter((key) => key && !opportunityKeys.has(key));
  if (staleKeys.length) {
    const { error: staleError } = await admin.from('growth_agent_opportunities')
      .update({ status: 'resolved', updated_at: now })
      .eq('brand_profile_id', brandProfileId)
      .in('opportunity_key', staleKeys);
    if (staleError) throw staleError;
  }
  const rows = (opportunities || []).map((item) => ({
    brand_profile_id: brandProfileId,
    user_id: userId,
    opportunity_version: GROWTH_AGENT_OPPORTUNITY_VERSION,
    opportunity_key: item.opportunity_key,
    kind: item.kind,
    priority: clamp(item.priority, 0, 100),
    title: item.title || '',
    reason: item.reason || '',
    content_type_id: item.content_type_id || null,
    product_title: item.product_title || null,
    product_url: item.product_url || null,
    campaign_title: item.campaign_title || null,
    campaign_goal: item.campaign_goal || null,
    status: 'open',
    details: item,
    last_detected_at: now,
    updated_at: now,
  }));
  if (!rows.length) return [];
  const { data, error } = await admin.from('growth_agent_opportunities')
    .upsert(rows, { onConflict: 'brand_profile_id,opportunity_key' })
    .select('*');
  if (error) throw error;
  return data || [];
}

function getOpportunityFormatAdjustment(opportunities, contentTypeId, category = '') {
  const id = normalizeKey(contentTypeId);
  let adjustment = 0;
  if ((opportunities || []).some((item) => item.kind === 'format_gap' && normalizeKey(item.content_type_id) === id)) adjustment += 1.25;
  const productOpportunity = (opportunities || []).some((item) => ['new_product','unused_product','stale_product'].includes(item.kind));
  if (productOpportunity && normalizeKey(category) === 'product') adjustment += 1;
  return adjustment;
}



export const GROWTH_AGENT_COMMERCE_VERSION = 6;

function normalizeCommerceEvent(row = {}) {
  const eventType = normalizeKey(row.event_type || row.type);
  const allowed = new Set(["purchase", "revenue", "conversion", "lead", "add_to_cart", "product_view"]);
  if (!allowed.has(eventType)) return null;
  const amount = Math.max(0, safeNumber(row.amount || row.revenue_amount || row.value));
  const attributionConfidence = clamp(row.attribution_confidence ?? row.confidence, 0, 1);
  return {
    event_type: eventType,
    occurred_at: row.occurred_at || row.created_at || null,
    content_type_id: normalizeKey(row.content_type_id),
    post_id: row.post_id || null,
    product_title: String(row.product_title || "").trim(),
    product_url: String(row.product_url || "").trim(),
    amount,
    currency: String(row.currency || "").trim().toUpperCase(),
    attribution_confidence: attributionConfidence,
    source_provider: normalizeKey(row.source_provider || row.provider || "unknown") || "unknown",
  };
}

function commerceWeight(eventType) {
  if (eventType === "purchase") return 5;
  if (eventType === "revenue") return 5;
  if (eventType === "conversion") return 4;
  if (eventType === "lead") return 3;
  if (eventType === "add_to_cart") return 2;
  if (eventType === "product_view") return 1;
  return 0;
}

export function buildGrowthAgentCommerceProfile({ commerceEvents = [], performancePlanning = null, webDataConnection = null } = {}) {
  const events = (commerceEvents || []).map(normalizeCommerceEvent).filter(Boolean);
  const attributed = events.filter((row) => row.content_type_id && row.attribution_confidence >= 0.35);
  const purchaseLike = events.filter((row) => ["purchase", "revenue", "conversion", "lead"].includes(row.event_type));
  const totalRevenue = events.reduce((sum, row) => sum + ((row.event_type === "purchase" || row.event_type === "revenue") ? row.amount : 0), 0);
  const avgAttribution = attributed.length ? attributed.reduce((sum,row) => sum + row.attribution_confidence, 0) / attributed.length : 0;
  const byFormat = new Map();
  for (const row of attributed) {
    const key = row.content_type_id;
    const current = byFormat.get(key) || { content_type_id:key, events:0, weighted_events:0, revenue:0, attribution_sum:0, purchase_like_events:0 };
    current.events += 1;
    current.weighted_events += commerceWeight(row.event_type) * row.attribution_confidence;
    current.attribution_sum += row.attribution_confidence;
    if (["purchase","revenue","conversion","lead"].includes(row.event_type)) current.purchase_like_events += 1;
    if (["purchase","revenue"].includes(row.event_type)) current.revenue += row.amount;
    byFormat.set(key,current);
  }
  const formatSignals = [...byFormat.values()].map((row) => ({
    ...row,
    average_attribution_confidence: row.events ? Math.round((row.attribution_sum / row.events) * 1000) / 1000 : 0,
  })).sort((a,b) => (b.weighted_events + Math.log1p(b.revenue)) - (a.weighted_events + Math.log1p(a.revenue)));

  const provider = normalizeKey(webDataConnection?.provider || webDataConnection?.detected_platform);
  const connectionStatus = normalizeKey(webDataConnection?.status);
  let learningState = "collecting";
  if (purchaseLike.length >= 12 && attributed.length >= 8 && avgAttribution >= 0.55) learningState = "established";
  else if (purchaseLike.length >= 4 && attributed.length >= 3 && avgAttribution >= 0.35) learningState = "early";

  return {
    version: GROWTH_AGENT_COMMERCE_VERSION,
    learning_state: learningState,
    data_quality: learningState === "established" ? "strong" : learningState === "early" ? "developing" : "limited",
    provider: provider || "none",
    connection_status: connectionStatus || "unknown",
    commerce_event_count: events.length,
    attributed_event_count: attributed.length,
    purchase_like_event_count: purchaseLike.length,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    average_attribution_confidence: Math.round(avgAttribution * 1000) / 1000,
    format_signals: formatSignals.slice(0, 8),
    traffic_proxy_available: Boolean(performancePlanning?.active),
    traffic_proxy_note: performancePlanning?.active ? "Social click/save signals remain traffic proxies only and are not treated as purchases." : "No commerce or traffic proxy evidence available yet.",
    safeguards: {
      minimum_attributed_events_for_influence: 3,
      minimum_attribution_confidence: 0.35,
      clicks_are_not_sales: true,
      no_unattributed_revenue_influence: true,
      no_existing_calendar_rewrites: true,
      commerce_adjustment_cap: 2.5,
      closed_loop_feedback_enabled: true,
      closed_loop_feedback_is_not_causation: true,
      no_existing_calendar_rewrites: true,
    },
  };
}

export async function saveGrowthAgentCommerceProfile({ admin, userId, brandProfileId, profile } = {}) {
  if (!admin || !userId || !brandProfileId || !profile) return null;
  const now = new Date().toISOString();
  const payload = {
    brand_profile_id: brandProfileId,
    user_id: userId,
    commerce_version: GROWTH_AGENT_COMMERCE_VERSION,
    learning_state: profile.learning_state || "collecting",
    data_quality: profile.data_quality || "limited",
    provider: profile.provider || "none",
    commerce_event_count: Math.max(0, safeNumber(profile.commerce_event_count)),
    attributed_event_count: Math.max(0, safeNumber(profile.attributed_event_count)),
    purchase_like_event_count: Math.max(0, safeNumber(profile.purchase_like_event_count)),
    total_revenue: Math.max(0, safeNumber(profile.total_revenue)),
    average_attribution_confidence: clamp(profile.average_attribution_confidence, 0, 1),
    profile_json: profile,
    updated_at: now,
  };
  const { data, error } = await admin.from("growth_agent_commerce_profiles")
    .upsert(payload, { onConflict: "brand_profile_id" })
    .select("*").single();
  if (error) throw error;
  return data;
}

function getCommerceFormatAdjustment(commerceProfile, contentTypeId) {
  if (!commerceProfile || commerceProfile.learning_state === "collecting") return 0;
  const id = normalizeKey(contentTypeId);
  const signal = (commerceProfile.format_signals || []).find((row) => normalizeKey(row?.content_type_id) === id);
  if (!signal || safeNumber(signal.events) < 3 || safeNumber(signal.average_attribution_confidence) < 0.35) return 0;
  const strongest = (commerceProfile.format_signals || [])[0];
  const base = strongest && normalizeKey(strongest.content_type_id) === id ? 2.5 : 0.75;
  const stateScale = commerceProfile.learning_state === "established" ? 1 : 0.55;
  const confidenceScale = clamp(signal.average_attribution_confidence, 0.35, 1);
  return Math.round(clamp(base * stateScale * confidenceScale, 0, 2.5) * 100) / 100;
}



export const GROWTH_AGENT_CLOSED_LOOP_VERSION = 7;

export function buildGrowthAgentClosedLoopSnapshot({ growthProfile = null, commerceProfile = null } = {}) {
  return {
    profile_version: Number(growthProfile?.version || growthProfile?.profile_version || 0),
    learning_state: normalizeKey(growthProfile?.learning_state) || "collecting",
    data_quality: normalizeKey(growthProfile?.data_quality) || "limited",
    observation_count: Math.max(0, safeNumber(growthProfile?.observation_count)),
    evidence_count: Math.max(0, safeNumber(growthProfile?.evidence_count)),
    average_confidence: clamp(growthProfile?.average_confidence, 0, 1),
    commerce_version: Number(commerceProfile?.version || commerceProfile?.commerce_version || 0),
    commerce_learning_state: normalizeKey(commerceProfile?.learning_state) || "collecting",
    commerce_attributed_event_count: Math.max(0, safeNumber(commerceProfile?.attributed_event_count)),
    commerce_purchase_like_event_count: Math.max(0, safeNumber(commerceProfile?.purchase_like_event_count)),
    commerce_total_revenue: Math.max(0, safeNumber(commerceProfile?.total_revenue)),
    commerce_average_attribution_confidence: clamp(commerceProfile?.average_attribution_confidence, 0, 1),
  };
}

function summarizeClosedLoopPlan(plan) {
  const posts = Array.isArray(plan?.posts) ? plan.posts : [];
  return {
    content_type_ids: posts.map((item) => normalizeKey(item?.content_type_id)).filter(Boolean),
    product_focus: posts.map((item) => String(item?.product_focus || "").trim()).filter(Boolean).slice(0, 12),
    growth_reasons: posts.map((item) => String(item?.growth_reason || "").trim()).filter(Boolean).slice(0, 12),
    destination_platforms: [...new Set(posts.flatMap((item) => Array.isArray(item?.destination_platforms) ? item.destination_platforms.map(normalizeKey) : []).filter(Boolean))],
  };
}

export async function reconcileGrowthAgentClosedLoopCycles({
  admin,
  userId,
  brandProfileId,
  growthProfile = null,
  commerceProfile = null,
} = {}) {
  if (!admin || !userId || !brandProfileId) return [];
  const current = buildGrowthAgentClosedLoopSnapshot({ growthProfile, commerceProfile });
  const { data: rows, error } = await admin
    .from("growth_agent_closed_loop_cycles")
    .select("id,baseline_snapshot,status,planned_at")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "waiting")
    .order("planned_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const updates = [];
  for (const row of rows || []) {
    const baseline = row?.baseline_snapshot || {};
    const observationGain = Math.max(0, current.observation_count - safeNumber(baseline.observation_count));
    const attributedCommerceGain = Math.max(0, current.commerce_attributed_event_count - safeNumber(baseline.commerce_attributed_event_count));
    // Close only when there is enough genuinely new evidence to learn from.
    if (observationGain < 4 && attributedCommerceGain < 1) continue;
    const now = new Date().toISOString();
    const feedbackSnapshot = {
      ...current,
      observation_gain: observationGain,
      attributed_commerce_event_gain: attributedCommerceGain,
      note: "New evidence was observed after the planning decision. This is feedback evidence, not proof that the plan caused the outcome.",
    };
    const { data, error: updateError } = await admin
      .from("growth_agent_closed_loop_cycles")
      .update({
        status: "feedback_observed",
        feedback_observation_gain: observationGain,
        feedback_commerce_event_gain: attributedCommerceGain,
        feedback_snapshot: feedbackSnapshot,
        feedback_at: now,
        updated_at: now,
      })
      .eq("id", row.id)
      .select("id,status,feedback_observation_gain,feedback_commerce_event_gain,feedback_at")
      .single();
    if (updateError) throw updateError;
    updates.push(data);
  }
  return updates;
}

export function buildGrowthAgentClosedLoopCycleKey({
  userId,
  brandProfileId,
  mode,
  goalId,
  selectedPlatforms = [],
  planSource = null,
  planningEventId = null,
  now = Date.now(),
} = {}) {
  const normalizedEventId = String(planningEventId || "").trim();
  const windowBucket = Math.floor(Number(now || Date.now()) / (10 * 60 * 1000));
  const canonical = JSON.stringify({
    user_id: String(userId || ""),
    brand_profile_id: String(brandProfileId || ""),
    mode: normalizeKey(mode),
    goal_id: normalizeKey(goalId),
    selected_platforms: [...new Set((Array.isArray(selectedPlatforms) ? selectedPlatforms : []).map(normalizeKey).filter(Boolean))].sort(),
    plan_source: normalizeKey(planSource),
    planning_event_id: normalizedEventId || null,
    // When older callers do not supply an event id, collapse equivalent retries
    // inside a short window instead of creating duplicate audit cycles.
    fallback_window_bucket: normalizedEventId ? null : windowBucket,
  });
  return `v7:${createHash("sha256").update(canonical).digest("hex")}`;
}

export async function saveGrowthAgentClosedLoopCycle({
  admin,
  userId,
  brandProfileId,
  mode,
  goalId,
  selectedPlatforms = [],
  planSource = null,
  plan = null,
  growthContext = null,
  growthProfile = null,
  commerceProfile = null,
  baselinePlan = null,
  planningEventId = null,
} = {}) {
  if (!admin || !userId || !brandProfileId || !["shadow", "active"].includes(String(mode || "").toLowerCase())) return null;
  const planSummary = summarizeClosedLoopPlan(plan);
  const baselineSummary = summarizeClosedLoopPlan(baselinePlan);
  const cycleKey = buildGrowthAgentClosedLoopCycleKey({
    userId,
    brandProfileId,
    mode,
    goalId,
    selectedPlatforms,
    planSource,
    planningEventId,
  });
  const payload = {
    cycle_key: cycleKey,
    brand_profile_id: brandProfileId,
    user_id: userId,
    closed_loop_version: GROWTH_AGENT_CLOSED_LOOP_VERSION,
    mode: String(mode).toLowerCase(),
    goal_id: goalId || null,
    selected_platforms: Array.isArray(selectedPlatforms) ? selectedPlatforms : [],
    plan_source: planSource || null,
    selected_content_type_ids: planSummary.content_type_ids,
    selected_product_focus: planSummary.product_focus,
    decision_snapshot: {
      plan: planSummary,
      baseline_plan: baselineSummary,
      growth_context_version: growthContext?.version || null,
      growth_profile_state: growthProfile?.learning_state || "collecting",
      commerce_learning_state: commerceProfile?.learning_state || "collecting",
      safeguards: {
        no_existing_calendar_rewrites: true,
        feedback_is_not_causation: true,
        only_future_planning_is_influenced: true,
      },
    },
    baseline_snapshot: buildGrowthAgentClosedLoopSnapshot({ growthProfile, commerceProfile }),
    status: "waiting",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("growth_agent_closed_loop_cycles")
    .insert(payload)
    .select("*")
    .single();
  if (!error) return data;

  // A concurrent retry may reach the unique cycle_key first. Treat that as
  // success and return the already-recorded logical planning cycle.
  if (String(error?.code || "") === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("growth_agent_closed_loop_cycles")
      .select("*")
      .eq("cycle_key", cycleKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;
  }
  throw error;
}

export function buildGrowthAgentPlanningContext({
  enabled,
  goalId,
  selectedPlatforms = [],
  availableFormats = [],
  recentHistory = [],
  activeRules = [],
  upcomingCampaigns = [],
  performancePlanning = null,
  customerLearning = null,
  growthProfile = null,
  experiments = [],
  opportunities = [],
  commerceProfile = null,
} = {}) {
  const recentCounts = recentFormatCounts(recentHistory);
  const activeCounts = activeFormatCounts(activeRules);
  const productCounts = recentProductCounts(recentHistory);
  const performanceSignals = buildFormatSignalMap(performancePlanning);

  const formatCandidates = availableFormats.map((format) => {
    const id = normalizeKey(format?.id);
    const recentUses = recentCounts.get(id) || 0;
    const activeUses = activeCounts.get(id) || 0;
    const performance = performanceSignals.get(id) || null;
    const noveltyScore = clamp(10 - recentUses * 2.5 - activeUses * 2, -12, 10);
    const evidenceScore = performance
      ? clamp((performance.score / 100) * 12 * performance.confidence, -12, 12)
      : 0;
    return {
      content_type_id: id,
      category: format?.category || "",
      recent_uses: recentUses,
      active_uses: activeUses,
      novelty_score: Math.round(noveltyScore * 100) / 100,
      evidence_score: Math.round(evidenceScore * 100) / 100,
      performance_signal: performance?.signal || "",
      performance_confidence: performance ? performance.confidence : 0,
    };
  });

  const strongest = [...formatCandidates]
    .sort((a, b) => (b.evidence_score + b.novelty_score) - (a.evidence_score + a.novelty_score))
    .slice(0, 4);
  const overused = [...formatCandidates]
    .filter((item) => item.recent_uses >= 2 || item.active_uses >= 2)
    .sort((a, b) => (b.recent_uses + b.active_uses) - (a.recent_uses + a.active_uses))
    .slice(0, 4);

  const recentProducts = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([title, uses]) => ({ title, recent_uses: uses }));

  const campaigns = (upcomingCampaigns || [])
    .filter((item) => item?.title)
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      event_date: item.event_date || "",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      campaign_goal: item.campaign_goal || "",
      relevance_score: safeNumber(item.relevance_score),
    }));

  return {
    enabled: Boolean(enabled),
    version: "v7",
    goal_id: goalId || "",
    selected_platforms: selectedPlatforms,
    policy: {
      exploitation_share: 0.6,
      exploration_share: 0.2,
      strategic_share: 0.2,
      hard_bans: false,
      preserve_variety: true,
      preserve_existing_engines: true,
      ai_calls_per_plan: 1,
      experiment_share_max: 0.2,
      experiments_are_soft_nudges: true,
      opportunities_are_soft_nudges: true,
      opportunity_priority_cap: 100,
      commerce_learning_is_attribution_gated: true,
      commerce_adjustment_cap: 2.5,
      closed_loop_feedback_enabled: true,
      closed_loop_feedback_is_not_causation: true,
      no_existing_calendar_rewrites: true,
    },
    format_categories: Object.fromEntries(formatCandidates.map((item) => [item.content_type_id, item.category || ""])),
    strongest_format_opportunities: strongest,
    overused_formats: overused,
    recently_used_products: recentProducts,
    upcoming_campaigns: campaigns,
    performance_learning_active: Boolean(performancePlanning?.active),
    customer_learning_active: Boolean(customerLearning && customerLearning.learning_state !== "collecting"),
    growth_profile: growthProfile || null,
    experiments: Array.isArray(experiments) ? experiments.slice(0, 3) : [],
    opportunities: Array.isArray(opportunities) ? opportunities.slice(0, 8) : [],
    commerce_profile: commerceProfile || null,
  };
}

export function getGrowthAgentFormatAdjustment(growthContext, contentTypeId) {
  if (!growthContext?.enabled) return 0;
  const id = normalizeKey(contentTypeId);
  const strongest = (growthContext.strongest_format_opportunities || []).find((item) => item.content_type_id === id);
  const overused = (growthContext.overused_formats || []).find((item) => item.content_type_id === id);
  let adjustment = 0;

  if (strongest) {
    adjustment += clamp(safeNumber(strongest.novelty_score) * 0.45, -4, 4);
    adjustment += clamp(safeNumber(strongest.evidence_score) * 0.35, -4, 4);
  }
  if (overused) {
    adjustment -= clamp((safeNumber(overused.recent_uses) + safeNumber(overused.active_uses)) * 1.5, 0, 7);
  }
  adjustment += getGrowthProfileFormatAdjustment(growthContext?.growth_profile, id);
  adjustment += getExperimentFormatAdjustment(growthContext?.experiments, id);
  const category = growthContext?.format_categories?.[id] || "";
  adjustment += getOpportunityFormatAdjustment(growthContext?.opportunities, id, category);
  adjustment += getCommerceFormatAdjustment(growthContext?.commerce_profile, id);

  return Math.round(clamp(adjustment, -9, 9) * 100) / 100;
}

export function describeGrowthAgentDecision(growthContext, contentTypeId) {
  if (!growthContext?.enabled) return "";
  const id = normalizeKey(contentTypeId);
  const strongest = (growthContext.strongest_format_opportunities || []).find((item) => item.content_type_id === id);
  const overused = (growthContext.overused_formats || []).find((item) => item.content_type_id === id);
  const commerceSignal = (growthContext?.commerce_profile?.format_signals || []).find((item) => normalizeKey(item?.content_type_id) === id);
  if (commerceSignal && growthContext?.commerce_profile?.learning_state !== "collecting" && safeNumber(commerceSignal.events) >= 3) {
    return `Growth Agent: ${id} has attributed commerce evidence (${Math.round(safeNumber(commerceSignal.events))} events, ${Math.round(safeNumber(commerceSignal.average_attribution_confidence) * 100)}% attribution confidence); treat this as a bounded signal, not proof of causation.`;
  }
  if (strongest && strongest.performance_signal) {
    return `Growth Agent: ${id} has a ${strongest.performance_signal.replace(/_/g, " ")} performance signal with ${Math.round(strongest.performance_confidence * 100)}% confidence; keep variation and avoid repeating recent products.`;
  }
  if (overused) {
    return `Growth Agent: ${id} has been used repeatedly recently; only keep it when it clearly fits the selected goal and channel.`;
  }
  return `Growth Agent: use ${id} as part of a varied plan and preserve room for new learning.`;
}
