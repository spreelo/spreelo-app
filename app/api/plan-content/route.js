import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  describeContentTypeDestinations,
  getContentTypeCoverageScore,
  getContentTypeDestinationPlatforms,
  normalizeSpreeloPlatformList,
} from "../../../lib/platformContentCompatibility";
import { hasVerifiedServiceEvidence } from "../../../lib/editorialContentStrategy";
import { CONTENT_GOAL_WEIGHTS, getContentGoalWeight } from "../../../lib/contentPlanningStrategy";
import {
  buildBrandLearningPlannerContext,
  getBrandLearningContentTypeAdjustment,
} from "../../../lib/brandLearning.js";
import {
  buildPerformanceLearningPlannerContext,
  getPerformanceLearningContentTypeAdjustment,
  loadBrandPerformancePlanningContext,
} from "../../../lib/performanceLearning.js";
import { enrichBrandProfileWithEffectiveProductMode } from "../../../lib/effectiveProductMode.js";
import {
  activateSelectedGrowthAgentExperiments,
  buildGrowthAgentCommerceProfile,
  buildGrowthAgentExperiments,
  buildGrowthAgentOpportunities,
  buildGrowthAgentPlanningContext,
  buildGrowthAgentProfile,
  describeGrowthAgentDecision,
  getGrowthAgentFormatAdjustment,
  isGrowthAgentActiveMode,
  isGrowthAgentShadowMode,
  loadGrowthAgentMode,
  saveGrowthAgentCommerceProfile,
  saveGrowthAgentClosedLoopCycle,
  saveGrowthAgentProfile,
  syncGrowthAgentExperiments,
  syncGrowthAgentOpportunities,
  reconcileGrowthAgentClosedLoopCycles,
} from "../../../lib/growthAgent.js";

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const contentPlanModel = process.env.CONTENT_PLAN_MODEL || "gpt-5.5";

const allowedGoals = new Set(["sell_more", "get_followers", "build_trust"]);
const allowedAngles = new Set([
  "awareness",
  "engagement",
  "education",
  "guide",
  "trust",
  "product_discovery",
  "product_push",
  "conversion",
]);
const allowedStages = new Set(["cold", "warm", "ready_to_buy"]);
const allowedCtaStrengths = new Set(["soft", "medium", "strong"]);

const FORMAT_DEFINITIONS = [
  {
    id: "website_item",
    label: "Product post",
    category: "product",
    requiresProducts: true,
    purpose: "Create a premium 4:5 editorial product post around one verified website product with concise readable typography in a single finished composition.",
  },
  {
    id: "website_item_text_ad",
    label: "AI product ad",
    category: "product",
    requiresProducts: true,
    purpose: "Create a visually strong AI-designed advertisement around one verified product.",
  },
  {
    id: "animated_website_item",
    label: "Animated product Reel",
    category: "product",
    requiresProducts: true,
    purpose: "Use movement to create attention around one verified product.",
  },
  {
    id: "ai_product_video",
    label: "AI product video",
    category: "product",
    requiresProducts: true,
    purpose: "Showcase one verified product with a short AI product video when motion supports the sales idea and selected channels.",
  },
  {
    id: "carousel_website_item",
    label: "Product image carousel",
    category: "product",
    requiresProducts: true,
    purpose: "Show five verified products around one strong shared theme.",
  },
  {
    id: "problem_solution",
    label: "Problem & solution",
    category: "persuasion",
    purpose: "Start from a real customer problem and, when genuinely relevant, connect it to a verified product or service from the business.",
  },
  {
    id: "tips",
    label: "Tips & knowledge",
    category: "education",
    purpose: "Share useful advice, facts or a strong knowledge angle such as a practical tip, common mistake, myth/fact or useful insight.",
  },
  {
    id: "faq",
    label: "Question & answer",
    category: "trust",
    purpose: "Answer a grounded customer question using verified company information or safe general knowledge without inventing company policy.",
  },
  {
    id: "guide_choice",
    label: "Guide & decision help",
    category: "education",
    purpose: "Help the audience choose correctly or understand how something works through the best fitting guide, checklist or step-by-step structure.",
  },
  {
    id: "service_focus",
    label: "Service in focus",
    category: "service",
    requiresServices: true,
    purpose: "Explain one verified service through the strongest customer-relevant angle and only supported service facts.",
  },
  {
    id: "engagement_humor",
    label: "Engagement & humour",
    category: "engagement",
    purpose: "Create a brand-appropriate idea designed for natural reactions, comments and shares, using humour, choices, questions or relatable situations when they fit.",
  },
];

const GOAL_LABELS = {
  sell_more: "Sell more",
  get_followers: "Get more followers",
  build_trust: "Build trust",
};

const GOAL_WEIGHTS = CONTENT_GOAL_WEIGHTS;

const DEFAULT_ROLE_BY_FORMAT = {
  website_item: ["Product recommendation", "Present one relevant product and explain why it fits the current customer need."],
  website_item_text_ad: ["Strong product ad", "Create a visually strong sales moment around one relevant verified product."],
  animated_website_item: ["Attention-driving product Reel", "Use motion to make one relevant product stand out and drive the next step."],
  ai_product_video: ["AI product video", "Showcase a verified product with a short AI video when motion supports the sales idea."],
  carousel_website_item: ["Curated product collection", "Help the audience discover several relevant products around one clear theme."],
  problem_solution: ["Problem & solution", "Create recognition around a real customer problem and connect it to a genuinely relevant solution."],
  tips: ["Useful knowledge", "Give practical value through the strongest fitting tip, fact or insight without forcing a sale."],
  faq: ["Question & answer", "Answer a grounded question that reduces doubt and makes the next step easier."],
  guide_choice: ["Decision help", "Help the audience choose well or do something correctly in a concise, useful structure."],
  service_focus: ["Service clarity", "Explain one verified service through a customer-relevant angle and supported facts."],
  engagement_humor: ["Engagement idea", "Create a brand-appropriate reason for the audience to react, comment or share."],
};

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value || "").match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function getGrowthAgentAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function saveGrowthAgentShadowRun({ admin, userId, brandProfileId, goalId, selectedPlatforms, baselinePlan, growthPlan, growthContext, baselineSource, model }) {
  if (!admin) return;
  try {
    const { error } = await admin.from("growth_agent_shadow_runs").insert({
      user_id: userId,
      brand_profile_id: brandProfileId,
      goal_id: goalId || null,
      selected_platforms: selectedPlatforms || [],
      baseline_plan: baselinePlan || {},
      growth_plan: growthPlan || {},
      growth_context: growthContext || {},
      baseline_source: baselineSource || null,
      growth_source: "deterministic_candidate_v7_closed_loop",
      model: model || null,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[growth-agent] shadow log skipped", error?.message || error);
  }
}

function normalizeShortText(value, maxLength = 700) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function clampPostCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 5;
  return Math.min(Math.max(Math.round(numberValue), 1), 7);
}



function getAvailableFormats(brandProfile) {
  const hasProducts = Boolean(brandProfile?.website_product_mode_available);
  const hasServices = hasVerifiedServiceEvidence(brandProfile);

  return FORMAT_DEFINITIONS.filter((format) => {
    if (format.requiresProducts && !hasProducts) return false;
    if (format.requiresServices && !hasServices) return false;
    return true;
  });
}

function normalizeRecentHistory(rows = []) {
  return rows
    .filter((row) => row?.status === "success" && row?.content_type_id)
    .map((row) => ({
      content_type_id: String(row.content_type_id),
      started_at: row.started_at || row.created_at || "",
      campaign_title: normalizeShortText(row.campaign_title || "", 100),
      product_titles: Array.isArray(row.product_titles)
        ? row.product_titles.slice(0, 5).map((title) => normalizeShortText(title, 90))
        : [],
    }))
    .slice(0, 80);
}

function getRecencyPenalty(formatId, recentHistory) {
  const recentTypes = recentHistory.map((item) => item.content_type_id);
  const firstIndex = recentTypes.indexOf(formatId);
  const totalUses = recentTypes.slice(0, 20).filter((id) => id === formatId).length;

  if (firstIndex === 0) return 80 + totalUses * 6;
  if (firstIndex === 1) return 58 + totalUses * 6;
  if (firstIndex <= 3 && firstIndex >= 0) return 38 + totalUses * 5;
  if (firstIndex <= 7 && firstIndex >= 0) return 20 + totalUses * 4;
  return totalUses * 3;
}

function getDefaultMarketingValues(goalId, formatId) {
  const productFormats = new Set([
    "website_item",
    "website_item_text_ad",
    "animated_website_item",
    "ai_product_video",
    "carousel_website_item",
  ]);

  if (productFormats.has(formatId)) {
    return {
      marketing_angle: formatId === "carousel_website_item" ? "product_discovery" : "product_push",
      customer_stage: goalId === "get_followers" ? "warm" : "ready_to_buy",
      cta_strength: goalId === "get_followers" ? "soft" : "strong",
    };
  }

  if (formatId === "problem_solution") {
    return {
      marketing_angle: goalId === "sell_more" ? "conversion" : "awareness",
      customer_stage: goalId === "sell_more" ? "warm" : "cold",
      cta_strength: goalId === "sell_more" ? "medium" : "soft",
    };
  }

  if (["faq", "service_focus"].includes(formatId)) {
    return {
      marketing_angle: "trust",
      customer_stage: "warm",
      cta_strength: goalId === "sell_more" ? "medium" : "soft",
    };
  }

  return {
    marketing_angle: ["tips", "guide_choice"].includes(formatId)
      ? "education"
      : "engagement",
    customer_stage: goalId === "get_followers" ? "cold" : "warm",
    cta_strength: "soft",
  };
}

function buildFallbackItems({ goalId, postCount, availableFormats, recentHistory, selectedPlatforms = [], learningProfile = null, performanceLearning = null, growthAgent = null }) {
  const goalWeights = GOAL_WEIGHTS[goalId] || GOAL_WEIGHTS.build_trust;
  const selected = [];
  const selectedCategories = new Map();

  for (let index = 0; index < postCount; index += 1) {
    const candidates = availableFormats
      .filter((format) => !selected.some((item) => item.content_type_id === format.id))
      .map((format) => {
        const categoryCount = selectedCategories.get(format.category) || 0;
        const categoryPenalty = categoryCount * (goalId === "sell_more" && format.category === "product" ? 8 : 18);
        const productPenalty =
          goalId !== "sell_more" && format.category === "product" ? 14 : 0;
        const platformCoverage = getContentTypeCoverageScore({
          contentTypeId: format.id,
          selectedPlatforms,
        });
        const learningAdjustment = getBrandLearningContentTypeAdjustment(
          learningProfile,
          format.id,
          { minObservations: 3, maxAdjustment: 10 }
        );
        const performanceAdjustment = getPerformanceLearningContentTypeAdjustment(
          performanceLearning?.insights || [],
          format.id,
          {
            goalId,
            selectedPlatforms,
            learningState: performanceLearning?.learningState || "collecting",
            minObservations: 4,
            minConfidence: 0.35,
            maxAdjustment: 14,
          }
        );
        const score =
          getContentGoalWeight(goalId, format.id, Number(goalWeights[format.id] || 40)) -
          getRecencyPenalty(format.id, recentHistory) -
          categoryPenalty -
          productPenalty +
          platformCoverage * 5 +
          learningAdjustment +
          performanceAdjustment +
          getGrowthAgentFormatAdjustment(growthAgent, format.id);

        return { format, score };
      })
      .sort((a, b) => b.score - a.score || a.format.id.localeCompare(b.format.id));

    const selectedCandidate = candidates[0] || availableFormats[index % availableFormats.length];
    const format = selectedCandidate?.format || selectedCandidate;
    if (!format) break;

    const [role, strategicReason] = DEFAULT_ROLE_BY_FORMAT[format.id] || [
      format.label,
      format.purpose,
    ];
    const marketingValues = getDefaultMarketingValues(goalId, format.id);

    selected.push({
      content_type_id: format.id,
      destination_platforms: getContentTypeDestinationPlatforms({
        contentTypeId: format.id,
        selectedPlatforms,
      }),
      role,
      strategic_reason: strategicReason,
      growth_reason: describeGrowthAgentDecision(growthAgent, format.id),
      decision_mode: growthAgent?.enabled ? "growth_agent_v1" : "standard_planner",
      ...marketingValues,
    });
    selectedCategories.set(format.category, (selectedCategories.get(format.category) || 0) + 1);
  }

  return selected;
}

function normalizePlanningItem(item, availableFormatMap, goalId, selectedPlatforms = [], growthAgent = null) {
  const contentTypeId = String(
    item?.content_type_id || item?.contentTypeId || item?.format || ""
  )
    .trim()
    .toLowerCase();
  const format = availableFormatMap.get(contentTypeId);
  if (!format) return null;

  const defaults = getDefaultMarketingValues(goalId, contentTypeId);
  const [defaultRole, defaultReason] = DEFAULT_ROLE_BY_FORMAT[contentTypeId] || [
    format.label,
    format.purpose,
  ];

  const destinationPlatforms = getContentTypeDestinationPlatforms({
    contentTypeId,
    selectedPlatforms,
  });

  if (selectedPlatforms.length > 0 && destinationPlatforms.length === 0) {
    return null;
  }

  return {
    content_type_id: contentTypeId,
    destination_platforms: destinationPlatforms,
    role: normalizeShortText(item?.role || item?.label || defaultRole, 120),
    strategic_reason: normalizeShortText(
      item?.strategic_reason || item?.purpose || item?.reason || defaultReason,
      600
    ),
    marketing_angle: normalizeEnum(
      item?.marketing_angle,
      allowedAngles,
      defaults.marketing_angle
    ),
    customer_stage: normalizeEnum(
      item?.customer_stage,
      allowedStages,
      defaults.customer_stage
    ),
    cta_strength: normalizeEnum(
      item?.cta_strength,
      allowedCtaStrengths,
      defaults.cta_strength
    ),
    growth_reason: normalizeShortText(
      item?.growth_reason || item?.growthReason || describeGrowthAgentDecision(growthAgent, contentTypeId),
      500
    ),
    product_focus: normalizeShortText(item?.product_focus || item?.productFocus || "", 300),
    decision_mode: growthAgent?.enabled ? "growth_agent_v1" : "standard_planner",
  };
}

function normalizePlan({ rawPlan, goalId, postCount, availableFormats, recentHistory, selectedPlatforms = [], learningProfile = null, performanceLearning = null, growthAgent = null }) {
  const availableFormatMap = new Map(availableFormats.map((format) => [format.id, format]));
  const fallbackItems = buildFallbackItems({
    goalId,
    postCount,
    availableFormats,
    recentHistory,
    selectedPlatforms,
    learningProfile,
    performanceLearning,
    growthAgent,
  });
  const seenPlanTypes = new Set();
  const planItems = [];

  for (const rawItem of Array.isArray(rawPlan?.posts) ? rawPlan.posts : []) {
    const normalizedItem = normalizePlanningItem(rawItem, availableFormatMap, goalId, selectedPlatforms, growthAgent);
    if (!normalizedItem || seenPlanTypes.has(normalizedItem.content_type_id)) continue;
    seenPlanTypes.add(normalizedItem.content_type_id);
    planItems.push(normalizedItem);
    if (planItems.length >= postCount) break;
  }

  for (const fallbackItem of fallbackItems) {
    if (planItems.length >= postCount) break;
    if (seenPlanTypes.has(fallbackItem.content_type_id)) continue;
    seenPlanTypes.add(fallbackItem.content_type_id);
    planItems.push(fallbackItem);
  }

  const rotationItems = [];
  const seenRotationTypes = new Set();
  const rawRotation = Array.isArray(rawPlan?.rotation_pool)
    ? rawPlan.rotation_pool
    : [];

  for (const rawItem of [...rawRotation, ...planItems, ...fallbackItems]) {
    const normalizedItem = normalizePlanningItem(rawItem, availableFormatMap, goalId, selectedPlatforms, growthAgent);
    if (!normalizedItem || seenRotationTypes.has(normalizedItem.content_type_id)) continue;
    seenRotationTypes.add(normalizedItem.content_type_id);
    rotationItems.push(normalizedItem);
    if (rotationItems.length >= Math.min(10, availableFormats.length)) break;
  }

  return {
    strategy_summary: normalizeShortText(
      rawPlan?.strategy_summary ||
        `A varied, capability-safe plan for the goal ${GOAL_LABELS[goalId] || goalId}.`,
      900
    ),
    posts: planItems,
    rotation_pool: rotationItems,
  };
}

function buildHistorySummary(recentHistory) {
  return recentHistory.slice(0, 30).map((item, index) => ({
    recency_position: index + 1,
    content_type_id: item.content_type_id,
    date: item.started_at ? String(item.started_at).slice(0, 10) : "",
    campaign_title: item.campaign_title,
    product_titles: item.product_titles,
  }));
}

async function loadOptionalPlanningContext(supabase, brandProfileId, userId) {
  const [historyResult, rulesResult, campaignsResult, learningResult, productCatalogResult] = await Promise.all([
    supabase
      .from("automation_run_logs")
      .select("content_type_id, content_format, product_titles, campaign_title, status, started_at, created_at")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(80),
    supabase
      .from("automation_rules")
      .select("content_type_id, content_type_label, schedule_type, next_run_at, is_active")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId)
      .order("next_run_at", { ascending: true })
      .limit(40),
    supabase
      .from("brand_campaign_opportunities")
      .select("title, event_date, start_date, end_date, relevance_score, campaign_goal, is_active, is_hidden, is_archived")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(20),
    supabase
      .from("brand_learning_profiles")
      .select("profile_json, learning_state, source_event_count, approved_count, rejected_count, last_event_at")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("website_product_catalog")
      .select("product_url,title,is_active,last_seen_at,last_used_at,times_used,discovery_source")
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(300),
  ]);

  return {
    recentHistory: normalizeRecentHistory(historyResult.data || []),
    activeRules: Array.isArray(rulesResult.data)
      ? rulesResult.data.map((rule) => ({
          content_type_id: rule.content_type_id || "",
          schedule_type: rule.schedule_type || "",
          next_run_at: rule.next_run_at || "",
          is_active: rule.is_active !== false,
        }))
      : [],
    upcomingCampaigns: Array.isArray(campaignsResult.data)
      ? campaignsResult.data
          .filter((campaign) => !campaign.is_hidden && !campaign.is_archived)
          .map((campaign) => ({
            title: normalizeShortText(campaign.title, 100),
            event_date: campaign.event_date || "",
            start_date: campaign.start_date || "",
            end_date: campaign.end_date || "",
            campaign_goal: normalizeShortText(campaign.campaign_goal, 160),
            relevance_score: Number(campaign.relevance_score || 0),
          }))
          .slice(0, 10)
      : [],
    learningProfile: learningResult?.error ? null : learningResult?.data || null,
    productCatalog: productCatalogResult?.error ? [] : (Array.isArray(productCatalogResult?.data) ? productCatalogResult.data : []),
  };
}

export async function POST(request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ error: "Supabase configuration is missing." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "You must be logged in." }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json({ error: "You must be logged in." }, { status: 401 });
    }

    const {
      brandProfileId,
      goalId,
      postCount: requestedPostCount,
      startDate = "",
      timeZone = "UTC",
      platform = "",
      platforms = [],
      planningEventId = null,
    } = await request.json();

    if (!brandProfileId || !allowedGoals.has(String(goalId || ""))) {
      return Response.json({ error: "Missing brand or valid plan goal." }, { status: 400 });
    }

    const postCount = clampPostCount(requestedPostCount);

    const { data: brandProfile, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id, business_name, website_url, industry, target_audience, brand_description, country_code, content_market, content_language, website_product_mode_available, website_product_mode_reason, website_product_source_url, website_service_mode_available, website_service_mode_reason, website_service_source_url")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandError || !brandProfile) {
      return Response.json({ error: brandError?.message || "Brand not found." }, { status: 404 });
    }

    const { brandProfile: effectiveBrandProfile } = await enrichBrandProfileWithEffectiveProductMode({
      brandProfile,
      brandProfileId,
      userId: user.id,
      persist: true,
    });
    if (effectiveBrandProfile) Object.assign(brandProfile, effectiveBrandProfile);

    const selectedPlatforms = normalizeSpreeloPlatformList(
      Array.isArray(platforms) && platforms.length ? platforms : platform
    );
    const brandFormats = getAvailableFormats(brandProfile);
    const compatibleFormats = selectedPlatforms.length
      ? brandFormats.filter((format) =>
          getContentTypeDestinationPlatforms({
            contentTypeId: format.id,
            selectedPlatforms,
          }).length > 0
        )
      : brandFormats;
    const availableFormats = compatibleFormats.length ? compatibleFormats : brandFormats;
    const context = await loadOptionalPlanningContext(supabase, brandProfileId, user.id);
    const performanceLearning = await loadBrandPerformancePlanningContext({
      supabase,
      brandProfileId,
      userId: user.id,
    });

    const customerLearning = buildBrandLearningPlannerContext(context.learningProfile);
    const performancePlanning = buildPerformanceLearningPlannerContext(
      performanceLearning?.insights || [],
      {
        goalId,
        selectedPlatforms,
        learningState: performanceLearning?.learningState || "collecting",
        maxSignals: 6,
      }
    );
    const growthAgentAdmin = getGrowthAgentAdminClient();
    const growthAgentMode = await loadGrowthAgentMode({ admin: growthAgentAdmin, userId: user.id });
    const growthAgentActive = isGrowthAgentActiveMode(growthAgentMode);
    const growthAgentShadow = isGrowthAgentShadowMode(growthAgentMode);
    const growthProfile = buildGrowthAgentProfile({
      performancePlanning,
      recentHistory: context.recentHistory,
      selectedPlatforms,
      customerLearning,
    });
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        await saveGrowthAgentProfile({ admin: growthAgentAdmin, userId: user.id, brandProfileId, profile: growthProfile });
      } catch (error) {
        console.warn("[growth-agent] profile save skipped", error?.message || error);
      }
    }
    const growthExperiments = buildGrowthAgentExperiments({
      growthProfile,
      availableFormats,
      recentHistory: context.recentHistory,
      goalId,
    });
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        await syncGrowthAgentExperiments({
          admin: growthAgentAdmin,
          userId: user.id,
          brandProfileId,
          experiments: growthExperiments,
          growthProfile,
        });
      } catch (error) {
        console.warn("[growth-agent] experiment sync skipped", error?.message || error);
      }
    }
    const growthOpportunities = buildGrowthAgentOpportunities({
      productCatalog: context.productCatalog,
      upcomingCampaigns: context.upcomingCampaigns,
      growthProfile,
      availableFormats,
    });
    let commerceEvents = [];
    let webDataConnection = null;
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        const commerceSince = new Date(Date.now() - 180 * 86400000).toISOString();
        const [{ data: eventRows, error: commerceEventError }, { data: webRow, error: webDataError }] = await Promise.all([
          growthAgentAdmin.from("growth_agent_commerce_events")
            .select("event_type, occurred_at, content_type_id, post_id, product_title, product_url, amount, currency, attribution_confidence, source_provider, created_at")
            .eq("user_id", user.id)
            .eq("brand_profile_id", brandProfileId)
            .gte("occurred_at", commerceSince)
            .order("occurred_at", { ascending: false })
            .limit(1000),
          growthAgentAdmin.from("brand_web_data_connections")
            .select("status, provider, detected_platform, detected_signals, updated_at")
            .eq("user_id", user.id)
            .eq("brand_profile_id", brandProfileId)
            .maybeSingle(),
        ]);
        if (commerceEventError) throw commerceEventError;
        if (webDataError) console.warn("[growth-agent] web commerce connection read skipped", webDataError.message || webDataError);
        commerceEvents = eventRows || [];
        webDataConnection = webRow || null;
      } catch (error) {
        console.warn("[growth-agent] commerce evidence read skipped", error?.message || error);
      }
    }
    const growthCommerceProfile = buildGrowthAgentCommerceProfile({
      commerceEvents,
      performancePlanning,
      webDataConnection,
    });
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        await saveGrowthAgentCommerceProfile({ admin: growthAgentAdmin, userId: user.id, brandProfileId, profile: growthCommerceProfile });
      } catch (error) {
        console.warn("[growth-agent] commerce profile save skipped", error?.message || error);
      }
    }
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        await reconcileGrowthAgentClosedLoopCycles({
          admin: growthAgentAdmin,
          userId: user.id,
          brandProfileId,
          growthProfile,
          commerceProfile: growthCommerceProfile,
        });
      } catch (error) {
        console.warn("[growth-agent] closed-loop reconciliation skipped", error?.message || error);
      }
    }
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        await syncGrowthAgentOpportunities({
          admin: growthAgentAdmin,
          userId: user.id,
          brandProfileId,
          opportunities: growthOpportunities,
        });
      } catch (error) {
        console.warn("[growth-agent] opportunity sync skipped", error?.message || error);
      }
    }
    const growthAgent = buildGrowthAgentPlanningContext({
      enabled: growthAgentActive,
      goalId,
      selectedPlatforms,
      availableFormats,
      recentHistory: context.recentHistory,
      activeRules: context.activeRules,
      upcomingCampaigns: context.upcomingCampaigns,
      performancePlanning,
      customerLearning,
      growthProfile,
      experiments: growthExperiments,
      opportunities: growthOpportunities,
      commerceProfile: growthCommerceProfile,
    });
    const shadowGrowthAgent = growthAgentShadow ? buildGrowthAgentPlanningContext({
      enabled: true,
      goalId,
      selectedPlatforms,
      availableFormats,
      recentHistory: context.recentHistory,
      activeRules: context.activeRules,
      upcomingCampaigns: context.upcomingCampaigns,
      performancePlanning,
      customerLearning,
      growthProfile,
      experiments: growthExperiments,
      opportunities: growthOpportunities,
      commerceProfile: growthCommerceProfile,
    }) : null;

    const fallbackPlan = normalizePlan({
      rawPlan: null,
      goalId,
      postCount,
      availableFormats,
      recentHistory: context.recentHistory,
      selectedPlatforms,
      learningProfile: context.learningProfile,
      performanceLearning,
      growthAgent,
    });
    const shadowCandidatePlan = shadowGrowthAgent ? normalizePlan({
      rawPlan: null,
      goalId,
      postCount,
      availableFormats,
      recentHistory: context.recentHistory,
      selectedPlatforms,
      learningProfile: context.learningProfile,
      performanceLearning,
      growthAgent: shadowGrowthAgent,
    }) : null;

    if (!process.env.OPENAI_API_KEY) {
      if (growthAgentShadow && shadowCandidatePlan) {
        await saveGrowthAgentShadowRun({ admin: growthAgentAdmin, userId: user.id, brandProfileId, goalId, selectedPlatforms, baselinePlan: fallbackPlan, growthPlan: shadowCandidatePlan, growthContext: shadowGrowthAgent, baselineSource: "fallback", model: null });
      }
      if (growthAgentActive && growthAgentAdmin) {
        try {
          await activateSelectedGrowthAgentExperiments({
            admin: growthAgentAdmin,
            brandProfileId,
            experiments: growthExperiments,
            selectedContentTypeIds: (fallbackPlan?.posts || []).map((item) => item?.content_type_id),
          });
        } catch (error) {
          console.warn("[growth-agent] fallback experiment activation skipped", error?.message || error);
        }
      }
      if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
        try {
          await saveGrowthAgentClosedLoopCycle({
            admin: growthAgentAdmin,
            userId: user.id,
            brandProfileId,
            mode: growthAgentMode,
            goalId,
            selectedPlatforms,
            planSource: growthAgentShadow ? "shadow_fallback_candidate" : "fallback",
            plan: growthAgentShadow ? shadowCandidatePlan : fallbackPlan,
            baselinePlan: growthAgentShadow ? fallbackPlan : null,
            growthContext: growthAgentShadow ? shadowGrowthAgent : growthAgent,
            growthProfile,
            commerceProfile: growthCommerceProfile,
            planningEventId,
          });
        } catch (error) {
          console.warn("[growth-agent] fallback closed-loop record skipped", error?.message || error);
        }
      }
      return Response.json({
        ...fallbackPlan,
        source: "fallback",
        growth_agent: growthAgent,
        growth_agent_mode: growthAgentMode,
      });
    }

    const formatList = availableFormats
      .map((format) => {
        const destinations = describeContentTypeDestinations({
          contentTypeId: format.id,
          selectedPlatforms,
        });
        const destinationText = destinations.length
          ? ` Destinations: ${destinations.join(", ")}.`
          : "";
        return `- ${format.id}: ${format.label}. ${format.purpose}${destinationText}`;
      })
      .join("\n");

    const response = await openai.responses.create({
      model: contentPlanModel,
      instructions:
        "You are Spreelo's senior always-on social media strategist. Choose the strongest content-format mix for one real business and one stated goal. Return valid JSON only. Do not write finished captions or image prompts.",
      input: `
Create a strategic rolling weekly content plan for this business.

BUSINESS
- Name: ${brandProfile.business_name || ""}
- Website: ${brandProfile.website_url || ""}
- Industry: ${brandProfile.industry || ""}
- Description: ${brandProfile.brand_description || ""}
- Target audience: ${brandProfile.target_audience || ""}
- Market: ${brandProfile.content_market || brandProfile.country_code || ""}
- Content language: ${brandProfile.content_language || ""}
- Verified product mode available: ${Boolean(brandProfile.website_product_mode_available)}
- Verified service evidence: ${hasVerifiedServiceEvidence(brandProfile)}

PLAN
- Goal: ${GOAL_LABELS[goalId]}
- Number of posts in the next week: ${postCount}
- Start date: ${startDate || "not supplied"}
- Time zone: ${timeZone || "UTC"}
- Selected channels: ${selectedPlatforms.length ? selectedPlatforms.join(", ") : platform || "connected social channels"}

AVAILABLE FORMATS
${formatList}

RECENT SUCCESSFUL CONTENT, NEWEST FIRST
${JSON.stringify(buildHistorySummary(context.recentHistory))}

CURRENTLY PLANNED OR ACTIVE FORMATS
${JSON.stringify(context.activeRules.slice(0, 25))}

CUSTOMER LEARNING SIGNALS
${JSON.stringify(customerLearning || { learning_state: "collecting", note: "Not enough customer decisions yet to influence planning." })}

GROW BRAIN PERFORMANCE SIGNALS
${JSON.stringify(performancePlanning)}

GROWTH AGENT V7 + GROWTH PROFILE + EXPERIMENTS + OPPORTUNITIES + COMMERCE LEARNING + CLOSED LOOP
${JSON.stringify(growthAgent)}

UPCOMING CALENDAR OPPORTUNITIES
${JSON.stringify(context.upcomingCampaigns)}

RULES
- The only supported goals are Sell more, Get more followers and Build trust. Treat them as three genuinely different strategies, not labels on the same format mix.
- Select exactly ${postCount} posts from the available format ids.
- Channel choice affects the format mix before generation. Prefer formats that give the selected channels useful coverage, but do not force every post onto every channel.
- A post may intentionally target only a subset of the selected channels when that format is a better native fit there.
- If only one channel is selected, optimize the whole mix for that channel instead of preserving a generic cross-platform mix.
- Never assume a static image or carousel belongs on YouTube when other channels are also selected; YouTube should mainly receive video-native posts in a multi-channel plan.
- Spreelo creates one master content idea and uses platform adapters where listed. Do not invent separate creative concepts for each channel.
- Do not select Custom post/manual_prompt, discount campaigns, focused-page input, customer cases, local-angle posts, comparisons or behind-the-scenes posts.
- Do not select product formats unless verified product mode is available.
- Give product posts, text + ad and product video stronger consideration for verified product businesses. For Sell more, aim to include a clear product post, a text + ad and a motion format in a five-or-more-post plan when each is relevant and supported by the selected channels. Balance them with useful editorial content, vary the mix over time and respect recent history and learning signals.
- Treat ai_product_video as a premium motion format that deserves regular consideration when motion can showcase a verified product well. Do not exclude it solely because static posts are cheaper; still choose formats according to the idea, channel fit and the displayed credit cost. Never force unsupported video.
- Select service_focus only when there is credible service evidence.
- Seasonality is a context layer, not a format. Use timely or seasonal framing only when it genuinely improves one of the available editorial ideas.
- Do not repeat a format in the same week unless there are too few valid formats. Prefer meaningful variety over a fixed sequence.
- Avoid formats used in the most recent posts when equally strong alternatives exist. Look across roughly the last 8-12 weeks.
- Also avoid repeating the same product or subject visible in recent history; the later generation system will select exact products, but the plan should create room for variety.
- Customer learning signals are soft evidence from this specific brand's approval/rejection history. Use them only when there are enough observations and never let them override the selected goal, channel compatibility, verified capabilities, recency or factual safety.
- Negative customer learning is intentionally conservative because a rejected post may have had an execution problem rather than a bad content type. Do not permanently ban a format from one or two decisions.
- Grow Brain performance signals are normalized against each channel's own baseline. Use established signals as soft evidence to favor formats that repeatedly perform well for this brand and gently reduce formats that repeatedly underperform.
- When Growth Agent V7 is enabled, act as one integrated strategist rather than multiple debating agents. Weigh the selected goal, performance evidence, customer learning, recent repetition, channel fit and upcoming opportunities in one decision.
- Growth Agent V7 uses a soft 60/20/20 principle across time: roughly 60% exploit established strengths, 20% explore new safe ideas/formats and 20% strategic brand/trust/value content. Do not force exact percentages into a single week.
- Growth Agent must not replace, reinterpret or bypass existing product discovery, Shopify import, rescue, brand analysis or content generation.
- Growth Agent V7 experiments are controlled exploration nudges only. Never let experiments exceed roughly 20% of the rolling plan, never force a weak format, and never rewrite an already active calendar. It only decides what the existing engines should do next.
- Growth Agent V7 opportunities are verified soft signals from existing Spreelo data. Prefer genuinely new/unused products, timely campaign windows and underexplored safe formats when they fit the selected goal. Never invent products, never force an opportunity, and never rewrite an already active calendar.
- Growth Agent V7 commerce learning may use only explicitly normalized commerce events with attribution confidence. Clicks, saves and website traffic are useful proxies but are never treated as purchases or revenue. Commerce evidence is a bounded soft signal, never proof that a social post caused a sale, and it may influence planning only after minimum attributed evidence exists.
- Growth Agent V7 closed loop records planning decisions and later compares them with newly observed Grow Brain/commerce evidence. Treat later evidence as feedback, never as proof that a plan caused the result. Closed-loop learning may influence only future planning and must never rewrite already active or approved calendar entries.
- Avoid repeatedly selecting the same product visible in recent history. For product formats, set product_focus to a short instruction such as "prefer a relevant product not used recently", "introduce a new/recently added product if available", or a campaign/category focus supported by the supplied context. Never invent a product.
- For Sell more, give more weight to click/save evidence; for Get more followers, give more weight to exposure/engagement/share evidence; for Build trust, give more weight to save/share/engagement evidence.
- Never hard-ban a format from performance learning. Preserve exploration and variety so the system can discover changing audience behavior. Goal fit, channel compatibility, factual safety, verified capabilities and recency remain stronger constraints than Grow Brain.
- Judge the balance across a rolling multi-week schedule. Do not force an exact percentage or identical mix into every individual week.
- For Sell more, make product businesses clearly more product-driven while still combining demand, clarity, trust and conversion with supporting value posts. Do not turn every post into an advertisement.
- For Get more followers, make the plan primarily engaging, saveable and shareable. Use a smaller share of pure product advertisements and give the audience a reason to follow, save, comment or share.
- For Build trust, make the plan primarily helpful, educational, explanatory and uncertainty-reducing. Product formats should support proof and clarity rather than dominate. Never invent proof or customer results.
- Every post must have a distinct role and reason.
- Write role, strategic_reason and strategy_summary in the brand's content language. If that language is unknown, use clear neutral English.
- Create rotation_pool with 6-10 distinct safe formats that can be used in future weeks. The pool should support the same goal while allowing week-to-week variation.
- The future pool must also avoid retired or manual formats.

Return this exact JSON structure:
{
  "strategy_summary": "Short internal summary of why this mix fits this business and goal",
  "posts": [
    {
      "content_type_id": "one available format id",
      "destination_platforms": ["channels this post should actually publish on"],
      "role": "Short role shown in the plan",
      "strategic_reason": "Why this post belongs in this week's sequence",
      "marketing_angle": "awareness | engagement | education | guide | trust | product_discovery | product_push | conversion",
      "customer_stage": "cold | warm | ready_to_buy",
      "cta_strength": "soft | medium | strong",
      "growth_reason": "Short explanation of the Growth Agent trade-off behind this choice, or empty if disabled",
      "product_focus": "Short product/category freshness guidance for later existing product selection, or empty when not relevant"
    }
  ],
  "rotation_pool": [
    {
      "content_type_id": "one available format id",
      "destination_platforms": ["channels this format can serve"],
      "role": "A useful recurring role for this format",
      "strategic_reason": "How it should support future weeks without becoming repetitive",
      "marketing_angle": "awareness | engagement | education | guide | trust | product_discovery | product_push | conversion",
      "customer_stage": "cold | warm | ready_to_buy",
      "cta_strength": "soft | medium | strong",
      "growth_reason": "Short explanation of the Growth Agent trade-off behind this choice, or empty if disabled",
      "product_focus": "Short product/category freshness guidance for later existing product selection, or empty when not relevant"
    }
  ]
}
      `,
    });

    const rawPlan = safeJsonParse(response.output_text);
    const normalizedPlan = normalizePlan({
      rawPlan,
      goalId,
      postCount,
      availableFormats,
      recentHistory: context.recentHistory,
      selectedPlatforms,
      learningProfile: context.learningProfile,
      performanceLearning,
      growthAgent,
    });

    if (growthAgentShadow && shadowCandidatePlan) {
      await saveGrowthAgentShadowRun({ admin: growthAgentAdmin, userId: user.id, brandProfileId, goalId, selectedPlatforms, baselinePlan: normalizedPlan, growthPlan: shadowCandidatePlan, growthContext: shadowGrowthAgent, baselineSource: rawPlan ? "openai" : "fallback", model: rawPlan ? contentPlanModel : null });
    }
    if (growthAgentActive && growthAgentAdmin) {
      try {
        await activateSelectedGrowthAgentExperiments({
          admin: growthAgentAdmin,
          brandProfileId,
          experiments: growthExperiments,
          selectedContentTypeIds: (normalizedPlan?.posts || []).map((item) => item?.content_type_id),
        });
      } catch (error) {
        console.warn("[growth-agent] experiment activation skipped", error?.message || error);
      }
    }
    if ((growthAgentActive || growthAgentShadow) && growthAgentAdmin) {
      try {
        await saveGrowthAgentClosedLoopCycle({
          admin: growthAgentAdmin,
          userId: user.id,
          brandProfileId,
          mode: growthAgentMode,
          goalId,
          selectedPlatforms,
          planSource: growthAgentShadow ? "shadow_candidate" : (rawPlan ? "openai" : "fallback"),
          plan: growthAgentShadow ? shadowCandidatePlan : normalizedPlan,
          baselinePlan: growthAgentShadow ? normalizedPlan : null,
          growthContext: growthAgentShadow ? shadowGrowthAgent : growthAgent,
          growthProfile,
          commerceProfile: growthCommerceProfile,
          planningEventId,
        });
      } catch (error) {
        console.warn("[growth-agent] closed-loop record skipped", error?.message || error);
      }
    }

    return Response.json({
      ...normalizedPlan,
      source: rawPlan ? "openai" : "fallback",
      model: rawPlan ? contentPlanModel : null,
      growth_agent: growthAgent,
      growth_agent_mode: growthAgentMode,
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Could not create the content strategy." },
      { status: 500 }
    );
  }
}
