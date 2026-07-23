import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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
    purpose: "Present one verified website product in a clean text-free product image.",
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
    id: "carousel_website_item",
    label: "Product image carousel",
    category: "product",
    requiresProducts: true,
    purpose: "Show five verified products around one strong shared theme.",
  },
  {
    id: "problem_solution",
    label: "Problem → Solution",
    category: "persuasion",
    purpose: "Start from a real customer need and explain how the business helps.",
  },
  {
    id: "tips",
    label: "Tips & advice",
    category: "education",
    purpose: "Give one practical, useful and easy-to-save tip.",
  },
  {
    id: "mistakes",
    label: "Common mistakes",
    category: "education",
    purpose: "Help customers avoid common mistakes without sounding judgmental.",
  },
  {
    id: "faq",
    label: "FAQ / Questions",
    category: "trust",
    purpose: "Answer a grounded customer question and reduce uncertainty.",
  },
  {
    id: "checklist",
    label: "Checklist",
    category: "education",
    purpose: "Create a structured, useful and save-worthy action list.",
  },
  {
    id: "service_focus",
    label: "Service in focus",
    category: "service",
    requiresServices: true,
    purpose: "Explain one verified service and the value it gives the customer.",
  },
  {
    id: "myth_fact",
    label: "Myth vs fact",
    category: "trust",
    purpose: "Correct a safe, relevant misconception with a trustworthy explanation.",
  },
  {
    id: "seasonal",
    label: "Seasonal post",
    category: "timely",
    purpose: "Connect the business to a genuinely relevant season or current customer need.",
  },
  {
    id: "mini_guide",
    label: "Mini-guide",
    category: "education",
    purpose: "Teach a useful subject in clear steps or sections.",
  },
];

const GOAL_LABELS = {
  sell_more: "Sell more",
  get_followers: "Get more followers",
  build_trust: "Build trust",
};

const GOAL_WEIGHTS = {
  sell_more: {
    website_item: 96,
    website_item_text_ad: 100,
    animated_website_item: 92,
    carousel_website_item: 94,
    problem_solution: 86,
    faq: 78,
    checklist: 68,
    service_focus: 92,
    tips: 54,
    mistakes: 52,
    myth_fact: 48,
    seasonal: 58,
    mini_guide: 62,
  },
  get_followers: {
    tips: 100,
    mini_guide: 98,
    mistakes: 94,
    myth_fact: 91,
    seasonal: 88,
    problem_solution: 80,
    carousel_website_item: 74,
    animated_website_item: 70,
    checklist: 82,
    faq: 68,
    website_item: 45,
    website_item_text_ad: 38,
    service_focus: 52,
  },
  build_trust: {
    faq: 100,
    tips: 96,
    checklist: 94,
    mini_guide: 93,
    problem_solution: 88,
    service_focus: 90,
    myth_fact: 84,
    mistakes: 80,
    seasonal: 52,
    website_item: 58,
    website_item_text_ad: 42,
    animated_website_item: 45,
    carousel_website_item: 56,
  },
};

const DEFAULT_ROLE_BY_FORMAT = {
  website_item: ["Product recommendation", "Present one relevant product and explain why it fits the current customer need."],
  website_item_text_ad: ["Strong product ad", "Create a visually strong sales moment around one relevant verified product."],
  animated_website_item: ["Attention-driving product Reel", "Use motion to make one relevant product stand out and drive the next step."],
  carousel_website_item: ["Curated product collection", "Help the audience discover several relevant products around one clear theme."],
  problem_solution: ["Recognisable need", "Create recognition around a real customer problem and connect it to a useful solution."],
  tips: ["Useful expert tip", "Give practical value that supports the selected goal without forcing a sale."],
  mistakes: ["Avoid a common mistake", "Help the audience avoid a relevant mistake and demonstrate useful expertise."],
  faq: ["Remove uncertainty", "Answer a grounded question that can reduce doubt and make the next step easier."],
  checklist: ["Practical checklist", "Turn the business's knowledge into a clear list the audience can save and use."],
  service_focus: ["Service clarity", "Explain one verified service and why it matters for the right customer."],
  myth_fact: ["Clarify a misconception", "Correct a safe misconception and build credibility through a clear explanation."],
  seasonal: ["Timely relevance", "Connect the business to a genuinely relevant current season or customer situation."],
  mini_guide: ["Save-worthy mini-guide", "Teach a useful subject in a structured way that supports the selected goal."],
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

function inferServiceEvidence(brandProfile) {
  const text = [
    brandProfile?.industry,
    brandProfile?.brand_description,
    brandProfile?.target_audience,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return !brandProfile?.website_product_mode_available;

  return /service|services|agency|consult|consultation|booking|appointment|treatment|repair|installation|cleaning|studio|salon|clinic|coach|training|accounting|legal|photograph|design|marketing|software|saas|platform|support|tjänst|bokning|behandling|reparation|installation|städ|salong|klinik|redovisning|juridik|fotograf|utbildning/.test(text) || !brandProfile?.website_product_mode_available;
}

function getAvailableFormats(brandProfile) {
  const hasProducts = Boolean(brandProfile?.website_product_mode_available);
  const hasServices = inferServiceEvidence(brandProfile);

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

  if (["faq", "myth_fact", "service_focus"].includes(formatId)) {
    return {
      marketing_angle: "trust",
      customer_stage: "warm",
      cta_strength: goalId === "sell_more" ? "medium" : "soft",
    };
  }

  return {
    marketing_angle: ["tips", "mistakes", "checklist", "mini_guide"].includes(formatId)
      ? "education"
      : "engagement",
    customer_stage: goalId === "get_followers" ? "cold" : "warm",
    cta_strength: "soft",
  };
}

function buildFallbackItems({ goalId, postCount, availableFormats, recentHistory }) {
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
        const score =
          Number(goalWeights[format.id] || 40) -
          getRecencyPenalty(format.id, recentHistory) -
          categoryPenalty -
          productPenalty;

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
      role,
      strategic_reason: strategicReason,
      ...marketingValues,
    });
    selectedCategories.set(format.category, (selectedCategories.get(format.category) || 0) + 1);
  }

  return selected;
}

function normalizePlanningItem(item, availableFormatMap, goalId) {
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

  return {
    content_type_id: contentTypeId,
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

function normalizePlan({ rawPlan, goalId, postCount, availableFormats, recentHistory }) {
  const availableFormatMap = new Map(availableFormats.map((format) => [format.id, format]));
  const fallbackItems = buildFallbackItems({
    goalId,
    postCount,
    availableFormats,
    recentHistory,
  });
  const seenPlanTypes = new Set();
  const planItems = [];

  for (const rawItem of Array.isArray(rawPlan?.posts) ? rawPlan.posts : []) {
    const normalizedItem = normalizePlanningItem(rawItem, availableFormatMap, goalId);
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
    const normalizedItem = normalizePlanningItem(rawItem, availableFormatMap, goalId);
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
  const [historyResult, rulesResult, campaignsResult] = await Promise.all([
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
    } = await request.json();

    if (!brandProfileId || !allowedGoals.has(String(goalId || ""))) {
      return Response.json({ error: "Missing brand or valid plan goal." }, { status: 400 });
    }

    const postCount = clampPostCount(requestedPostCount);

    const { data: brandProfile, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id, business_name, website_url, industry, target_audience, brand_description, country_code, content_market, content_language, website_product_mode_available")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandError || !brandProfile) {
      return Response.json({ error: brandError?.message || "Brand not found." }, { status: 404 });
    }

    const availableFormats = getAvailableFormats(brandProfile);
    const context = await loadOptionalPlanningContext(supabase, brandProfileId, user.id);

    const fallbackPlan = normalizePlan({
      rawPlan: null,
      goalId,
      postCount,
      availableFormats,
      recentHistory: context.recentHistory,
    });

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        ...fallbackPlan,
        source: "fallback",
      });
    }

    const formatList = availableFormats
      .map((format) => `- ${format.id}: ${format.label}. ${format.purpose}`)
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
- Verified service evidence: ${inferServiceEvidence(brandProfile)}

PLAN
- Goal: ${GOAL_LABELS[goalId]}
- Number of posts in the next week: ${postCount}
- Start date: ${startDate || "not supplied"}
- Time zone: ${timeZone || "UTC"}
- Platform: ${platform || "connected social channels"}

AVAILABLE FORMATS
${formatList}

RECENT SUCCESSFUL CONTENT, NEWEST FIRST
${JSON.stringify(buildHistorySummary(context.recentHistory))}

CURRENTLY PLANNED OR ACTIVE FORMATS
${JSON.stringify(context.activeRules.slice(0, 25))}

UPCOMING CALENDAR OPPORTUNITIES
${JSON.stringify(context.upcomingCampaigns)}

RULES
- Select exactly ${postCount} posts from the available format ids.
- Do not select Custom post/manual_prompt, discount campaigns, focused-page input, customer cases, local-angle posts, comparisons or behind-the-scenes posts.
- Do not select product formats unless verified product mode is available.
- Select service_focus only when there is credible service evidence.
- Select seasonal only when the market, date and business create a genuinely useful timely angle.
- Do not repeat a format in the same week unless there are too few valid formats. Prefer meaningful variety over a fixed sequence.
- Avoid formats used in the most recent posts when equally strong alternatives exist. Look across roughly the last 8-12 weeks.
- Also avoid repeating the same product or subject visible in recent history; the later generation system will select exact products, but the plan should create room for variety.
- For Sell more, create a commercial journey rather than only advertisements: combine demand, clarity/trust and conversion. Product businesses can use several product formats, but they must not dominate every week without supporting value posts.
- For Get more followers, prioritize useful, saveable, shareable and recognisable formats. Direct product ads should be occasional and strategically justified.
- For Build trust, prioritize expertise, clear answers, guides and grounded service/product explanations. Never invent proof or customer results.
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
