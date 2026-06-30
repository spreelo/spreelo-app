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
        product_selection_guidance: normalizeShortText(item?.product_selection_guidance || "", 700),
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

    const { campaignOpportunityId, brandProfileId, timeZone = "Europe/Stockholm" } = await request.json();

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

    if (Array.isArray(campaign.post_plan) && campaign.post_plan.length > 0) {
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
      "content_source_mode": "generic_campaign | mixed_campaign_and_website | website_product | website_service | website_carousel | ai_image_overlay | ai_image_text",
      "timing_anchor": "inspiration | engagement | trust | conversion | deadline | event | evergreen",
      "publish_date": "YYYY-MM-DD or empty string",
      "publish_time": "HH:MM or empty string",
      "days_before_event": 14,
      "product_selection_guidance": "What product/service/category should this post use, and what to avoid",
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
- Choose content_source_mode with care. Do not use website_product unless the business likely has concrete products/items. Use website_carousel when multiple ideas/options/products should be compared. Use ai_image_overlay or ai_image_text for emotional, seasonal, deadline or awareness posts.
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
