import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const allowedAngles = new Set([
  "awareness",
  "engagement",
  "product_discovery",
  "product_push",
  "trust",
  "offer",
  "urgency",
]);

const allowedStages = new Set(["cold", "warm", "ready_to_buy"]);
const allowedCtaStrengths = new Set(["soft", "medium", "strong"]);
const allowedContentModes = new Set([
  "generic_campaign",
  "mixed_campaign_and_website",
  "website_product",
  "website_service",
  "website_carousel",
  "ai_image_overlay",
  "ai_image_text",
  "problem_solution",
  "tips",
  "faq",
  "checklist",
  "comparison",
  "case_example",
  "seasonal",
]);

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

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(Math.max(Math.round(numberValue), min), max);
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function normalizeShortText(value, maxLength = 600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function normalizeTermArray(value, maxItems = 16, maxLength = 60) {
  const rawTerms = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[,;|\n]+/u)
    : [];
  const seen = new Set();
  const terms = [];

  for (const rawTerm of rawTerms) {
    const term = String(rawTerm || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
    const key = term.toLocaleLowerCase();

    if (!term || key.length < 2 || /^\d+$/.test(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    terms.push(term);

    if (terms.length >= maxItems) {
      break;
    }
  }

  return terms;
}

function normalizeTermText(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTermText(value) {
  return normalizeTermText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function getCommonPrefixLength(firstValue, secondValue) {
  const first = normalizeTermText(firstValue);
  const second = normalizeTermText(secondValue);
  const maxLength = Math.min(first.length, second.length);
  let index = 0;

  while (index < maxLength && first[index] === second[index]) {
    index += 1;
  }

  return index;
}

function getCompactAnchorRoot(token) {
  const value = normalizeTermText(token);

  if (value.length < 10) {
    return "";
  }

  return value.slice(0, 3);
}

function getCampaignAnchorTokens(campaign, item = {}) {
  const sourceText = [
    campaign?.title,
    campaign?.campaign_goal,
    campaign?.target_customer_need,
    campaign?.prompt_context,
    campaign?.product_selection_guidance,
    campaign?.website_product_selection_hint,
    campaign?.campaign_blueprint?.campaign_goal,
    campaign?.campaign_blueprint?.target_customer_need,
    campaign?.campaign_blueprint?.product_selection_guidance,
    item?.role,
    item?.purpose,
    item?.strategic_reason,
    item?.product_selection_guidance,
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = tokenizeTermText(sourceText);
  const anchors = [];
  const seen = new Set();

  for (const token of tokens) {
    for (const value of [getCompactAnchorRoot(token), token]) {
      if (!value || seen.has(value)) {
        continue;
      }

      seen.add(value);
      anchors.push(value);

      if (anchors.length >= 10) {
        return anchors;
      }
    }
  }

  return anchors;
}

function termHasAnchor(term, anchorTokens) {
  const termText = normalizeTermText(term);
  const termTokens = tokenizeTermText(termText);

  if (!termText || !anchorTokens.length) {
    return true;
  }

  for (const anchor of anchorTokens) {
    if (!anchor) continue;
    if (termText.includes(anchor)) {
      return true;
    }

    for (const token of termTokens) {
      const minLength = Math.min(token.length, anchor.length);
      const commonLength = getCommonPrefixLength(token, anchor);

      if (token === anchor || commonLength >= Math.min(6, minLength) || commonLength >= Math.ceil(minLength * 0.75)) {
        return true;
      }
    }
  }

  return false;
}

function anchorTerm(term, anchorTokens) {
  const cleanTerm = String(term || "").replace(/\s+/g, " ").trim();
  const anchor = anchorTokens.find(Boolean);

  if (!cleanTerm || !anchor || termHasAnchor(cleanTerm, anchorTokens)) {
    return cleanTerm;
  }

  return `${anchor} ${cleanTerm}`.slice(0, 60);
}

function normalizeCampaignProductTerms(campaign, item, value, maxItems = 16) {
  // Preserve the concrete AI-created terms. Automatically prefixing every term
  // with the campaign title made the search metadata repetitive and hid useful
  // theme synonyms and motif words.
  return normalizeTermArray(value, maxItems);
}

function normalizeProductSearchQueries(value, maxItems = 12) {
  const seen = new Set();
  const queries = [];

  for (const rawQuery of normalizeTermArray(value, maxItems * 2, 50)) {
    const query = String(rawQuery || "")
      .replace(/[.!?]+$/u, "")
      .replace(/\s+/g, " ")
      .trim();
    const words = query.split(/\s+/u).filter(Boolean);
    const key = query.toLocaleLowerCase();

    if (!query || words.length < 1 || words.length > 4 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    queries.push(query);

    if (queries.length >= maxItems) {
      break;
    }
  }

  return queries;
}

function getCampaignProductTerms(campaign, key) {
  const directTerms = Array.isArray(campaign?.[key]) ? campaign[key] : [];
  const blueprintTerms = Array.isArray(campaign?.campaign_blueprint?.[key])
    ? campaign.campaign_blueprint[key]
    : [];
  const values = [...directTerms, ...blueprintTerms];

  return key === "product_search_queries"
    ? normalizeProductSearchQueries(values, 12)
    : normalizeCampaignProductTerms(campaign, {}, values, 24);
}

function getCampaignProductSearchIntent(campaign) {
  return normalizeShortText(
    campaign?.product_search_intent || campaign?.campaign_blueprint?.product_search_intent || "",
    300
  );
}

function formatTermLine(label, terms) {
  return terms?.length ? `${label}: ${terms.join(", ")}` : "";
}

function appendProductSearchMetadataToGuidance(baseGuidance, item) {
  const productMatchTerms = normalizeTermArray(item?.product_match_terms);
  const productSearchQueries = normalizeTermArray(item?.product_search_queries);
  const productAvoidTerms = normalizeTermArray(item?.product_avoid_terms || item?.avoid_terms);
  const productSearchIntent = normalizeShortText(item?.product_search_intent || "", 180);
  const lines = [
    normalizeShortText(baseGuidance || "", 700),
    formatTermLine("Product match terms", productMatchTerms),
    formatTermLine("Product search queries", productSearchQueries),
    formatTermLine("Avoid product terms", productAvoidTerms),
    productSearchIntent ? `Product search intent: ${productSearchIntent}` : "",
  ].filter(Boolean);

  return normalizeShortText(lines.join("\n"), 1200);
}

function formatCampaignProductTermGuidance(campaign) {
  const productMatchTerms = getCampaignProductTerms(campaign, "product_match_terms");
  const productSearchQueries = getCampaignProductTerms(campaign, "product_search_queries");
  const avoidTerms = getCampaignProductTerms(campaign, "avoid_terms");
  const productSearchIntent = getCampaignProductSearchIntent(campaign);

  return [
    productSearchIntent
      ? `- Product search strategy: ${productSearchIntent}`
      : "- Product search strategy: infer it from the business assortment and product naming style",
    productMatchTerms.length
      ? `- Product match terms: ${productMatchTerms.join(", ")}`
      : "- Product match terms: not provided",
    productSearchQueries.length
      ? `- Existing store-search queries: ${productSearchQueries.join(", ")}`
      : "- Existing store-search queries: not provided",
    avoidTerms.length
      ? `- Avoid product terms: ${avoidTerms.join(", ")}`
      : "- Avoid product terms: not provided",
  ].join("\n");
}

function planHasProductSearchMetadata(postPlan) {
  return (Array.isArray(postPlan) ? postPlan : []).some((item) => {
    const guidance = String(item?.product_selection_guidance || "");

    return (
      normalizeTermArray(item?.product_match_terms).length > 0 ||
      normalizeTermArray(item?.product_search_queries).length > 0 ||
      normalizeTermArray(item?.product_avoid_terms || item?.avoid_terms).length > 0 ||
      /product match terms|product search queries|avoid product terms/i.test(guidance)
    );
  });
}

function getDefaultCampaignCount(campaign) {
  const eventType = String(campaign?.event_type || "").toLowerCase();
  const category = String(campaign?.campaign_category || "").toLowerCase();
  const hasFixedDate = Boolean(campaign?.event_date);
  const isSalesOrGift = /gift|sales|offer|shopping|limited|booking|seasonal/.test(`${eventType} ${category}`);

  if (hasFixedDate && isSalesOrGift) return 4;
  if (hasFixedDate) return 3;
  if (isSalesOrGift) return 4;

  return 3;
}

function normalizePlan(rawPlan, campaign) {
  const recommendedCount = clampNumber(
    rawPlan?.recommended_post_count ?? campaign?.recommended_post_count,
    1,
    7,
    getDefaultCampaignCount(campaign)
  );
  const rawItems = Array.isArray(rawPlan?.post_plan) ? rawPlan.post_plan : [];
  const normalizedItems = rawItems
    .slice(0, recommendedCount)
    .map((item, index) => {
      const marketingAngle = normalizeEnum(
        item?.marketing_angle,
        allowedAngles,
        index === 0 ? "awareness" : index === rawItems.length - 1 ? "urgency" : "product_push"
      );
      const customerStage = normalizeEnum(
        item?.customer_stage,
        allowedStages,
        marketingAngle === "urgency" || marketingAngle === "offer" ? "ready_to_buy" : marketingAngle === "awareness" ? "cold" : "warm"
      );
      const ctaStrength = normalizeEnum(
        item?.cta_strength,
        allowedCtaStrengths,
        marketingAngle === "urgency" || marketingAngle === "offer" ? "strong" : marketingAngle === "awareness" || marketingAngle === "engagement" ? "soft" : "medium"
      );
      const contentSourceMode = normalizeEnum(
        item?.content_source_mode,
        allowedContentModes,
        marketingAngle === "product_push" || marketingAngle === "offer" ? "website_product" : "generic_campaign"
      );
      const productMatchTerms = normalizeCampaignProductTerms(
        campaign,
        item,
        item?.product_match_terms || item?.match_terms || item?.campaign_match_terms
      );
      const productSearchQueries = normalizeProductSearchQueries(
        item?.product_search_queries || item?.search_queries || item?.local_search_queries,
        12
      );
      const productAvoidTerms = normalizeTermArray(
        item?.product_avoid_terms || item?.avoid_terms || item?.negative_terms
      );
      const productSearchIntent = normalizeShortText(
        item?.product_search_intent || item?.search_intent || getCampaignProductSearchIntent(campaign),
        300
      );
      const productSelectionGuidance = appendProductSearchMetadataToGuidance(
        item?.product_selection_guidance || "",
        {
          product_match_terms: productMatchTerms,
          product_search_queries: productSearchQueries,
          product_avoid_terms: productAvoidTerms,
          product_search_intent: productSearchIntent,
        }
      );

      return {
        role: normalizeShortText(item?.role || item?.title || `Campaign post ${index + 1}`, 120),
        purpose: normalizeShortText(item?.purpose || item?.strategic_reason || "Create one useful campaign post.", 500),
        strategic_reason: normalizeShortText(item?.strategic_reason || item?.reason || item?.purpose || "", 700),
        campaign_phase: normalizeShortText(item?.campaign_phase || "", 80),
        marketing_angle: marketingAngle,
        customer_stage: customerStage,
        cta_strength: ctaStrength,
        content_source_mode: contentSourceMode,
        timing_anchor: normalizeShortText(item?.timing_anchor || "", 80),
        publish_date: normalizeDate(item?.publish_date || item?.scheduled_date || item?.recommended_date),
        scheduled_date: normalizeDate(item?.scheduled_date || item?.publish_date || item?.recommended_date),
        publish_time: /^\d{2}:\d{2}$/.test(String(item?.publish_time || "")) ? item.publish_time : "",
        days_before_event: typeof item?.days_before_event === "number" ? item.days_before_event : null,
        product_selection_guidance: productSelectionGuidance,
        product_match_terms: productMatchTerms,
        product_search_queries: productSearchQueries,
        product_avoid_terms: productAvoidTerms,
        avoid_terms: productAvoidTerms,
        product_search_intent: productSearchIntent,
        visual_direction: normalizeShortText(item?.visual_direction || item?.image_direction || "", 500),
      };
    })
    .filter((item) => item.role && item.purpose);

  return {
    recommended_post_count: Math.max(1, Math.min(recommendedCount, normalizedItems.length || recommendedCount)),
    strategy_summary: normalizeShortText(rawPlan?.strategy_summary || "", 900),
    post_plan: normalizedItems,
  };
}

function buildFallbackPlan(campaign) {
  const count = clampNumber(campaign?.recommended_post_count, 1, 5, getDefaultCampaignCount(campaign));
  const sequence = count <= 1
    ? [["Main campaign post", "Combine timing, relevance and a clear next step.", "product_push", "warm", "medium", "generic_campaign"]]
    : count === 2
    ? [
        ["Inspiration", "Introduce why this campaign matters to the audience.", "awareness", "cold", "soft", "generic_campaign"],
        ["Action reminder", "Make the next step concrete before the opportunity passes.", "urgency", "ready_to_buy", "strong", "website_product"],
      ]
    : [
        ["Inspiration", "Create early interest and make the campaign feel relevant.", "awareness", "cold", "soft", "ai_image_overlay"],
        ["Useful guide", "Help the audience compare options or understand what fits them.", "product_discovery", "warm", "medium", "website_carousel"],
        ["Product push", "Make the product, service or offer concrete and easy to act on.", "product_push", "warm", "medium", "website_product"],
        ["Trust builder", "Reduce hesitation with reassurance, explanation or useful context.", "trust", "warm", "medium", "mixed_campaign_and_website"],
        ["Last chance", "Create a clear timely reason to act now.", "urgency", "ready_to_buy", "strong", "ai_image_text"],
      ].slice(0, count);

  return {
    recommended_post_count: sequence.length,
    strategy_summary: "Fallback strategic campaign plan.",
    post_plan: sequence.map((item) => ({
      role: item[0],
      purpose: item[1],
      strategic_reason: item[1],
      marketing_angle: item[2],
      customer_stage: item[3],
      cta_strength: item[4],
      content_source_mode: item[5],
      campaign_phase: item[2],
      timing_anchor: "",
      publish_date: "",
      scheduled_date: "",
      publish_time: "",
      days_before_event: null,
      product_selection_guidance: "",
      product_match_terms: getCampaignProductTerms(campaign, "product_match_terms"),
      product_search_queries: getCampaignProductTerms(campaign, "product_search_queries"),
      product_avoid_terms: getCampaignProductTerms(campaign, "avoid_terms"),
      avoid_terms: getCampaignProductTerms(campaign, "avoid_terms"),
      product_search_intent: getCampaignProductSearchIntent(campaign),
      visual_direction: "",
    })),
  };
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return Response.json({ error: "Missing authorization header." }, { status: 401 });
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

    const { campaignOpportunityId, brandProfileId, timeZone = "UTC" } = await request.json();

    if (!campaignOpportunityId || !brandProfileId) {
      return Response.json({ error: "Missing campaign or brand id." }, { status: 400 });
    }

    const { data: brandProfile, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id, business_name, website_url, industry, target_audience, brand_description, country_code, content_market, content_language, website_product_mode_available")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandError || !brandProfile) {
      return Response.json({ error: brandError?.message || "Brand not found." }, { status: 404 });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("brand_campaign_opportunities")
      .select("*")
      .eq("id", campaignOpportunityId)
      .eq("brand_profile_id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return Response.json({ error: campaignError?.message || "Campaign not found." }, { status: 404 });
    }

    if (
      Array.isArray(campaign.post_plan) &&
      campaign.post_plan.length > 0 &&
      planHasProductSearchMetadata(campaign.post_plan)
    ) {
      return Response.json({ campaign, post_plan: campaign.post_plan, source: "database" });
    }

    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: `You are Spreelo's senior campaign strategist. Create a practical social media campaign sequence for a real small business. Think like a senior marketer at a strong brand: every post must have a clear job, timing, format and reason. Return valid JSON only. Do not include finished captions or finished image prompts.`,
      input: `
Create the detailed post plan for this selected calendar campaign.

Business:
- Name: ${brandProfile.business_name || ""}
- Website: ${brandProfile.website_url || ""}
- Industry: ${brandProfile.industry || ""}
- Target audience: ${brandProfile.target_audience || ""}
- Business description: ${brandProfile.brand_description || ""}
- Market: ${brandProfile.content_market || brandProfile.country_code || campaign.market || campaign.country_code || ""}
- Country code: ${brandProfile.country_code || campaign.country_code || ""}
- Content language: ${brandProfile.content_language || campaign.language || ""}
- Website products/services available: ${brandProfile.website_product_mode_available ? "yes" : "unknown/no"}

Campaign:
- Title: ${campaign.title || ""}
- Description: ${campaign.description || ""}
- Event type: ${campaign.event_type || ""}
- Event date: ${campaign.event_date || "none"}
- Start date: ${campaign.start_date || "none"}
- End date: ${campaign.end_date || "none"}
- Campaign category: ${campaign.campaign_category || ""}
- Goal: ${campaign.campaign_goal || ""}
- Customer need: ${campaign.target_customer_need || ""}
- Relevance reason: ${campaign.relevance_reason || ""}
- Product selection guidance: ${campaign.product_selection_guidance || campaign.website_product_selection_hint || ""}
${formatCampaignProductTermGuidance(campaign)}
- Website content fit: ${campaign.website_content_fit || ""}
- Website content strategy: ${campaign.website_content_strategy || ""}
- Recommended post count from calendar: ${campaign.recommended_post_count || "not set"}
- Time zone: ${timeZone}

Return JSON in this exact shape:
{
  "strategy_summary": "Short internal summary of the campaign logic",
  "recommended_post_count": 4,
  "post_plan": [
    {
      "role": "Short customer-facing/internal role label",
      "purpose": "What this specific post should achieve",
      "strategic_reason": "Why this post exists in this exact position in the campaign sequence",
      "campaign_phase": "early | early_middle | middle | middle_late | trust | offer | last_chance | event_day | evergreen",
      "marketing_angle": "awareness | engagement | product_discovery | product_push | trust | offer | urgency",
      "customer_stage": "cold | warm | ready_to_buy",
      "cta_strength": "soft | medium | strong",
      "content_source_mode": "generic_campaign | mixed_campaign_and_website | website_product | website_service | website_carousel | ai_image_overlay | ai_image_text | problem_solution | tips | faq | checklist | comparison | case_example | seasonal",
      "timing_anchor": "inspiration | engagement | trust | conversion | deadline | event | evergreen",
      "publish_date": "YYYY-MM-DD or empty string",
      "publish_time": "HH:MM or empty string",
      "days_before_event": 14,
      "product_selection_guidance": "What product/service/category should this post use, and what to avoid",
      "product_match_terms": ["Short local-language product/category/search terms that identify products that truly fit this post"],
      "product_search_queries": ["10-12 simple, varied store-search queries, usually 1-3 words and never more than 4"],
      "product_avoid_terms": ["Short product/category/search terms that should be avoided for this post when better matches exist"],
      "product_search_intent": "Short internal explanation of the business-specific store-search strategy and what the product finder should prioritize",
      "visual_direction": "What type of visual should support this post"
    }
  ]
}

Strategic rules:
- Write all role, purpose and guidance fields in the campaign/brand content language.
- Choose the number of posts from campaign complexity and buying behavior, not a fixed template.
- Minor awareness campaigns may need 1-2 posts. Normal commercial campaigns usually need 3-4. Strong gift, shopping, booking, holiday or lead-time campaigns often need 4-6. Only use 7 if it is truly justified.
- For exact dated campaigns, schedule backwards from the event date. Respect ordering: awareness first, then discovery/engagement/trust, then product/offer, then urgency/event-day.
- For date ranges, schedule inside the range and avoid spreading posts lazily across months unless it is intentionally evergreen. A focused campaign push is usually 1-4 weeks.
- For evergreen campaigns, create a focused sequence over a short useful window unless the campaign is clearly meant to be recurring.
- Choose publish_date and publish_time when there is enough date information. Use empty string only if the client scheduler should decide.
- Times must fit the post's job: inspiration can be morning/midday, product/offer often lunch/afternoon, urgency often late afternoon/evening, relationship/event-day content can be morning or evening depending on context.
- Choose content_source_mode with care. Do not use website_product unless the business likely has concrete products/items. Use website_carousel when multiple ideas/options/products should be compared. Use problem_solution, tips, faq, checklist, comparison, case_example and seasonal whenever those newer content formats are a better strategic fit than a generic campaign post. Use ai_image_overlay or ai_image_text for emotional, deadline or strongly visual awareness posts.
- For every post that uses website_product, website_service, mixed_campaign_and_website or website_carousel, create product_match_terms, product_search_queries, product_avoid_terms and product_search_intent.
- Product terms must be created dynamically for this exact campaign, country, market, language and brand. Do not rely on a fixed Swedish or English keyword list.
- First use the campaign's saved product search strategy and assortment evidence to infer how this specific business names and groups products: motif/design-led, category-led, recipient/use-case-led, problem/benefit-led, style/material-led, brand/model-led or another pattern.
- product_search_intent must describe that business-specific search approach in one short sentence.
- product_match_terms should include concrete local theme, motif, category, recipient and use-case terms that can independently support genuine campaign relevance.
- Do not include broad assortment categories by themselves in product_match_terms for themed campaigns unless the category itself is the campaign.
- Product search queries must be simple searches a real website search box can use: usually 1-3 words and never more than 4 words. Create 10-12 queries for product/carousel posts unless the saved campaign metadata contains fewer strong queries.
- Preserve the campaign's saved product_search_queries and search mix whenever they are already useful. Narrow them for a specific post when needed, but do not replace a strong motif-led list with generic product-type combinations.
- Classify the campaign as a named theme/occasion, recipient/gift occasion, seasonal need/style, commercial promotion, category/product launch, identity/awareness or another suitable mode before adapting the queries.
- For motif/design-led stores plus a named theme, roughly 65-80% of queries should remain standalone motifs, symbols, characters, synonyms, expressions or title-like phrases. Only roughly 20-35% should combine a theme with a product type.
- For recipient/gift occasions, prioritize recipient names, relationships and title-like phrases. For seasonal campaigns, prioritize seasonal needs, styles, materials, activities and use cases.
- For commercial promotions such as broad sale events, do not search for products depicting the promotion name. Search the store's real hero categories, popular product families, strong motifs or commercially useful assortment areas supported by the campaign evidence.
- For a named occasion, season, event or cultural theme, make direct theme words, local synonyms, motif/title-like expressions and likely website-language variants the majority of the strongest queries. Generic gift, present or broad product-type searches are secondary and must never dominate a themed query list.
- Include common cross-language variants only when they are plausibly present in the store's product titles or search index; do not translate mechanically.
- Expand avoid terms with likely semantic and website-language equivalents when that prevents nearby but wrong products from entering the candidate pool.
- Use the campaign name once when useful, then diversify into distinct semantic roots. Do not prefix the campaign name to every query and do not repeat the same broad product type in most queries.
- Never return campaign goals, marketing sentences or explanatory text as a search query. Preserve useful multiword phrases; do not split them into unrelated single words.
- For motif/design-led stores, search primarily with motif and title-like words. For costume stores, search with costume, character, mask, makeup and accessory terms. Adapt equally for every other business type from the actual assortment evidence.
- Reject a search query if matching only its broadest word would likely return many irrelevant products.
- Before returning each product_match_term, ask whether a product matching only that term would still genuinely fit the campaign. If not, remove or rewrite it.
- product_avoid_terms should block nearby but wrong products or broad categories when better campaign-specific products exist. Do not over-block the whole store.
- Keep product terms compact. Avoid broad filler like "product", "shop", "gift" or "present" unless that word is truly central to the campaign search.
- Carry these product terms into product_selection_guidance as readable internal lines so later generation can use them.
- Do not invent discounts, shipping deadlines, stock, guarantees, reviews or product facts not supported by the business/campaign context.
- Do not create generic filler. Each post must have a different role and clear reason.
- Return JSON only.
      `,
    });

    const parsed = safeJsonParse(response.output_text);
    const normalizedPlan = normalizePlan(parsed, campaign);
    const finalPlan = normalizedPlan.post_plan.length > 0 ? normalizedPlan : buildFallbackPlan(campaign);

    const updatedCampaign = {
      ...campaign,
      recommended_post_count: finalPlan.recommended_post_count,
      post_plan: finalPlan.post_plan,
    };

    await supabase
      .from("brand_campaign_opportunities")
      .update({
        recommended_post_count: finalPlan.recommended_post_count,
        post_plan: finalPlan.post_plan,
      })
      .eq("id", campaign.id)
      .eq("user_id", user.id);

    return Response.json({
      campaign: updatedCampaign,
      post_plan: finalPlan.post_plan,
      strategy_summary: finalPlan.strategy_summary,
      source: "openai",
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not plan campaign." },
      { status: 500 }
    );
  }
}
