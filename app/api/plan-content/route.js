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

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    purpose: "Turn one verified product image into a short AI product video when motion adds enough strategic value to justify the higher production cost.",
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
  ai_product_video: ["AI product video", "Use a verified product image for a short AI video only when motion clearly strengthens the idea."],
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

function buildFallbackItems({ goalId, postCount, availableFormats, recentHistory, selectedPlatforms = [], learningProfile = null, performanceLearning = null }) {
  const goalWeights = GOAL_WEIGHTS[goalId] || GOAL_WEIGHTS.build_trust;
  const selected = [];
  const selectedCategories = new Map();

  for (let index = 0; index < postCount; index += 1) {
    const candidates = availableFormats
      .filter((format) => !selected.some((item) => item.content_type_id === format.id))
      .map((format) => {
        const categoryCount = selectedCategories.get(format.category) || 0;
        const categoryPenalty = categoryCount * 18;
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
          performanceAdjustment;

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
      ...marketingValues,
    });
    selectedCategories.set(format.category, (selectedCategories.get(format.category) || 0) + 1);
  }

  return selected;
}

function normalizePlanningItem(item, availableFormatMap, goalId, selectedPlatforms = []) {
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
  };
}

function normalizePlan({ rawPlan, goalId, postCount, availableFormats, recentHistory, selectedPlatforms = [], learningProfile = null, performanceLearning = null }) {
  const availableFormatMap = new Map(availableFormats.map((format) => [format.id, format]));
  const fallbackItems = buildFallbackItems({
    goalId,
    postCount,
    availableFormats,
    recentHistory,
    selectedPlatforms,
    learningProfile,
    performanceLearning,
  });
  const seenPlanTypes = new Set();
  const planItems = [];

  for (const rawItem of Array.isArray(rawPlan?.posts) ? rawPlan.posts : []) {
    const normalizedItem = normalizePlanningItem(rawItem, availableFormatMap, goalId, selectedPlatforms);
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
    const normalizedItem = normalizePlanningItem(rawItem, availableFormatMap, goalId, selectedPlatforms);
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
  const [historyResult, rulesResult, campaignsResult, learningResult] = await Promise.all([
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

    const fallbackPlan = normalizePlan({
      rawPlan: null,
      goalId,
      postCount,
      availableFormats,
      recentHistory: context.recentHistory,
      selectedPlatforms,
      learningProfile: context.learningProfile,
      performanceLearning,
    });

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        ...fallbackPlan,
        source: "fallback",
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
- Treat ai_product_video as a premium motion format. Select it only when motion clearly adds strategic value; prefer a lower-cost product format when a static or lighter-motion format can do the job equally well.
- Select service_focus only when there is credible service evidence.
- Seasonality is a context layer, not a format. Use timely or seasonal framing only when it genuinely improves one of the available editorial ideas.
- Do not repeat a format in the same week unless there are too few valid formats. Prefer meaningful variety over a fixed sequence.
- Avoid formats used in the most recent posts when equally strong alternatives exist. Look across roughly the last 8-12 weeks.
- Also avoid repeating the same product or subject visible in recent history; the later generation system will select exact products, but the plan should create room for variety.
- Customer learning signals are soft evidence from this specific brand's approval/rejection history. Use them only when there are enough observations and never let them override the selected goal, channel compatibility, verified capabilities, recency or factual safety.
- Negative customer learning is intentionally conservative because a rejected post may have had an execution problem rather than a bad content type. Do not permanently ban a format from one or two decisions.
- Grow Brain performance signals are normalized against each channel's own baseline. Use established signals as soft evidence to favor formats that repeatedly perform well for this brand and gently reduce formats that repeatedly underperform.
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
      "cta_strength": "soft | medium | strong"
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
      "cta_strength": "soft | medium | strong"
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
    });

    return Response.json({
      ...normalizedPlan,
      source: rawPlan ? "openai" : "fallback",
      model: rawPlan ? contentPlanModel : null,
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || "Could not create the content strategy." },
      { status: 500 }
    );
  }
}
