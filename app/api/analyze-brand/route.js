import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const WEBSITE_MAX_TEXT_CHARS = 18000;
const MAX_ANALYSES_PER_24_HOURS = 25;
const MIN_MINUTES_BETWEEN_ANALYSES = 1;
const MAX_CAMPAIGN_OPPORTUNITIES = 25;

function normalizeWebsiteUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (
    trimmedValue.startsWith("http://") ||
    trimmedValue.startsWith("https://")
  ) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripHtmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function getMetaContent(html, propertyNames) {
  for (const name of propertyNames) {
    const propertyRegex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );

    const propertyMatch = String(html || "").match(propertyRegex);

    if (propertyMatch?.[1]) {
      return decodeHtmlEntities(propertyMatch[1]);
    }

    const reversedRegex = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i"
    );

    const reversedMatch = String(html || "").match(reversedRegex);

    if (reversedMatch?.[1]) {
      return decodeHtmlEntities(reversedMatch[1]);
    }
  }

  return "";
}

function extractPageTitle(html) {
  const ogTitle = getMetaContent(html, ["og:title", "twitter:title"]);

  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch = String(html || "").match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  }

  return "";
}

function extractMetaDescription(html) {
  return getMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value || "").match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeDate(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return null;
  }

  const date = new Date(`${rawValue}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return rawValue;
}

function getYearFromDate(value, fallbackYear) {
  const normalizedDate = normalizeDate(value);

  if (!normalizedDate) {
    return fallbackYear;
  }

  return Number.parseInt(normalizedDate.slice(0, 4), 10);
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

function normalizeDateConfidence(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  if (["high", "medium", "low"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "medium";
}

function normalizeWebsiteContentFit(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  if (["strong", "medium", "weak"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "medium";
}

function normalizeWebsiteContentStrategy(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  if (["product", "service", "support", "none"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "support";
}

function normalizeWebsiteProductSelectionHint(value) {
  return String(value || "").trim().slice(0, 500);
}
function normalizeShortText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeCampaignCategory(value) {
  const normalizedValue = String(value || "").toLowerCase().trim();

  const allowedCategories = [
    "gift_campaign",
    "seasonal_campaign",
    "sales_campaign",
    "local_event",
    "educational_theme",
    "awareness_theme",
    "product_discovery",
    "trust_building",
    "engagement_theme",
    "booking_push",
    "limited_time_offer",
    "community_moment",
    "custom_campaign",
  ];

  if (allowedCategories.includes(normalizedValue)) {
    return normalizedValue;
  }

  return "custom_campaign";
}

function normalizeRecommendedAngles(value) {
  const rawAngles = Array.isArray(value) ? value : [];

  return rawAngles
    .map((angle) => String(angle || "").toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeCampaignBlueprint(rawOpportunity) {
  const recommendedAngles = normalizeRecommendedAngles(
    rawOpportunity?.recommended_angles || rawOpportunity?.campaign_angles
  );

  return {
    campaign_category: normalizeCampaignCategory(
      rawOpportunity?.campaign_category
    ),
    campaign_goal: normalizeShortText(rawOpportunity?.campaign_goal, 700),
    target_customer_need: normalizeShortText(
      rawOpportunity?.target_customer_need,
      700
    ),
    recommended_angles: recommendedAngles,
    product_selection_guidance: normalizeShortText(
      rawOpportunity?.product_selection_guidance ||
        rawOpportunity?.website_product_selection_hint,
      700
    ),
    tone_guidance: normalizeShortText(rawOpportunity?.tone_guidance, 500),
    cta_guidance: normalizeShortText(rawOpportunity?.cta_guidance, 500),
    image_guidance: normalizeShortText(rawOpportunity?.image_guidance, 500),
  };
}
function normalizeWebsiteProductMode(rawValue) {
  const rawMode = rawValue || {};

  const available = Boolean(rawMode.available);

  const reason = String(rawMode.reason || "")
    .trim()
    .slice(0, 500);

  return {
    available,
    reason: reason || (available
      ? "The website appears to contain sellable items that can be used for website-based posts."
      : "No clear sellable website item was found during brand analysis."),
  };
}
function normalizeCampaignOpportunity(rawOpportunity, fallbackYear) {
  const title = String(rawOpportunity?.title || "").trim();

  if (!title) {
    return null;
  }

  const eventDate = normalizeDate(rawOpportunity?.event_date);
  const startDate = normalizeDate(rawOpportunity?.start_date);
  const endDate = normalizeDate(rawOpportunity?.end_date);

  const eventYear = eventDate
    ? getYearFromDate(eventDate, fallbackYear)
    : startDate
    ? getYearFromDate(startDate, fallbackYear)
    : fallbackYear;

  const slug = slugify(rawOpportunity?.slug || title);

  return {
    title,
    slug,
    description: String(rawOpportunity?.description || "").trim(),
    event_type: String(rawOpportunity?.event_type || "campaign").trim(),
    event_date: eventDate,
    event_year: eventYear,
    start_date: startDate,
    end_date: endDate,
    relevance_reason: String(rawOpportunity?.relevance_reason || "").trim(),
    relevance_score: clampNumber(rawOpportunity?.relevance_score, 1, 5, 3),
    sales_score: clampNumber(rawOpportunity?.sales_score, 1, 5, 3),
    engagement_score: clampNumber(rawOpportunity?.engagement_score, 1, 5, 3),
    recommended_post_count: clampNumber(
      rawOpportunity?.recommended_post_count,
      1,
      10,
      5
    ),
    prompt_context: String(rawOpportunity?.prompt_context || "").trim(),
    campaign_angles: normalizeJsonArray(rawOpportunity?.campaign_angles),
    post_plan: normalizeJsonArray(rawOpportunity?.post_plan),
    date_confidence: normalizeDateConfidence(rawOpportunity?.date_confidence),
    website_content_fit: normalizeWebsiteContentFit(
      rawOpportunity?.website_content_fit
    ),
    website_content_strategy: normalizeWebsiteContentStrategy(
      rawOpportunity?.website_content_strategy
    ),
    website_product_selection_hint: normalizeWebsiteProductSelectionHint(
      rawOpportunity?.website_product_selection_hint
    ),

    campaign_category: normalizeCampaignCategory(
      rawOpportunity?.campaign_category
    ),
    campaign_goal: normalizeShortText(rawOpportunity?.campaign_goal, 700),
    target_customer_need: normalizeShortText(
      rawOpportunity?.target_customer_need,
      700
    ),
    recommended_angles: normalizeRecommendedAngles(
      rawOpportunity?.recommended_angles || rawOpportunity?.campaign_angles
    ),
    product_selection_guidance: normalizeShortText(
      rawOpportunity?.product_selection_guidance ||
        rawOpportunity?.website_product_selection_hint,
      700
    ),
    tone_guidance: normalizeShortText(rawOpportunity?.tone_guidance, 500),
    cta_guidance: normalizeShortText(rawOpportunity?.cta_guidance, 500),
    image_guidance: normalizeShortText(rawOpportunity?.image_guidance, 500),
    campaign_blueprint: normalizeCampaignBlueprint(rawOpportunity),
  };
}

function normalizeCampaignOpportunities(rawOpportunities, fallbackYear) {
  const opportunities = Array.isArray(rawOpportunities)
    ? rawOpportunities
    : [];

  const normalizedOpportunities = [];
  const usedSlugs = new Set();

  for (const rawOpportunity of opportunities) {
    const normalizedOpportunity = normalizeCampaignOpportunity(
      rawOpportunity,
      fallbackYear
    );

   if (!normalizedOpportunity) {
  continue;
}

if (normalizedOpportunity.event_year !== fallbackYear) {
  continue;
}

let finalSlug =
  normalizedOpportunity.slug || slugify(normalizedOpportunity.title);

    if (!finalSlug) {
      finalSlug = `campaign-${normalizedOpportunities.length + 1}`;
    }

    let uniqueSlug = finalSlug;
    let suffix = 2;

    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${finalSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(uniqueSlug);

    normalizedOpportunities.push({
      ...normalizedOpportunity,
      slug: uniqueSlug,
    });

    if (normalizedOpportunities.length >= MAX_CAMPAIGN_OPPORTUNITIES) {
      break;
    }
  }

  return normalizedOpportunities;
}

function getDefaultLanguage(contentLanguage, detectedLanguage) {
  const requestedLanguage = String(contentLanguage || "").trim();

  if (requestedLanguage) {
    return requestedLanguage;
  }

  const detected = String(detectedLanguage || "").toLowerCase();

  if (detected.includes("swedish") || detected.includes("svenska")) {
    return "Swedish";
  }

  if (detected.includes("english")) {
    return "English";
  }

  return detectedLanguage || "English";
}

async function fetchWebsiteHtml(websiteUrl) {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

  if (!normalizedWebsiteUrl) {
    throw new Error("Website URL is required");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    WEBSITE_FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(normalizedWebsiteUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SpreeloBot/1.0; +https://app.spreelo.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Website returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("Website did not return HTML");
    }

    const html = await response.text();

    return {
      url: normalizedWebsiteUrl,
      html,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkRateLimit({ supabase, userId }) {
  const now = new Date();

  const lastAllowedTime = new Date(
    now.getTime() - MIN_MINUTES_BETWEEN_ANALYSES * 60 * 1000
  ).toISOString();

  const last24Hours = new Date(
    now.getTime() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentRuns, error: recentError } = await supabase
    .from("brand_analysis_runs")
    .select("id, created_at")
    .eq("user_id", userId)
    .gte("created_at", last24Hours)
    .order("created_at", { ascending: false });

  if (recentError) {
    throw new Error(recentError.message || "Could not check analyze limit");
  }

  const runs = recentRuns || [];

  if (runs.length >= MAX_ANALYSES_PER_24_HOURS) {
    throw new Error(
      `Analyze limit reached. You can analyze your brand ${MAX_ANALYSES_PER_24_HOURS} times per 24 hours.`
    );
  }

  const latestRun = runs[0];

  if (latestRun?.created_at && latestRun.created_at > lastAllowedTime) {
    throw new Error(
      `Please wait ${MIN_MINUTES_BETWEEN_ANALYSES} minutes before analyzing again.`
    );
  }
}

async function logAnalysisRun({ supabase, userId, websiteUrl }) {
  const { error } = await supabase.from("brand_analysis_runs").insert({
    user_id: userId,
    website_url: websiteUrl || "manual_description",
  });

  if (error) {
    throw new Error(error.message || "Could not log analysis run");
  }
}

async function verifyBrandOwnership({ supabase, userId, brandProfileId }) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("id, business_name")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not verify brand profile");
  }

  if (!data?.id) {
    throw new Error("Brand profile not found.");
  }

  return data;
}

async function saveBrandProfile({
  supabase,
  userId,
  brandProfileId,
  websiteUrl,
  brandDescription,
  profile,
  contentMarket,
  countryCode,
  contentLanguage,
  campaignCalendarYear,
  websiteProductMode,
}) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .update({
      business_name: profile.business_name,
      website_url: websiteUrl || "",
      brand_description: brandDescription || "",
      industry: profile.industry,
      target_audience: profile.target_audience,
      content_market: contentMarket || "",
      country_code: countryCode || "",
      content_language: contentLanguage || "",
      campaign_calendar_year: campaignCalendarYear,
      campaign_calendar_generated_at: new Date().toISOString(),
      campaign_calendar_refreshed_at: new Date().toISOString(),
            website_product_mode_available: Boolean(
        websiteProductMode?.available
      ),
      website_product_mode_checked_at: websiteUrl
        ? new Date().toISOString()
        : null,
      website_product_mode_reason: websiteProductMode?.reason || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .select(
  "id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, campaign_calendar_year, campaign_calendar_generated_at, campaign_calendar_refreshed_at, website_product_mode_available, website_product_mode_checked_at, website_product_mode_reason"
)
    .single();

  if (error) {
    throw new Error(error.message || "Could not save brand profile");
  }

  return data;
}

async function replaceBrandCampaignOpportunities({
  supabase,
  userId,
  brandProfileId,
  contentMarket,
  countryCode,
  contentLanguage,
  industry,
  campaignCalendarYear,
  opportunities,
}) {
  const safeOpportunities = normalizeCampaignOpportunities(
    opportunities,
    campaignCalendarYear
  );

  const { error: deleteError } = await supabase
    .from("brand_campaign_opportunities")
    .delete()
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("event_year", campaignCalendarYear)
    .eq("is_ai_generated", true);

  if (deleteError) {
    throw new Error(
      deleteError.message || "Could not replace campaign opportunities"
    );
  }

  if (safeOpportunities.length === 0) {
    return [];
  }

  const now = new Date().toISOString();

  const rows = safeOpportunities.map((opportunity) => ({
    user_id: userId,
    brand_profile_id: brandProfileId,

    title: opportunity.title,
    slug: opportunity.slug,
    description: opportunity.description,

    country_code: countryCode || "",
    market: contentMarket || "",
    language: contentLanguage || "",
    industry: industry || "",

    event_type: opportunity.event_type,
    event_date: opportunity.event_date,
    event_year: opportunity.event_year,

    start_date: opportunity.start_date,
    end_date: opportunity.end_date,

    relevance_reason: opportunity.relevance_reason,
    relevance_score: opportunity.relevance_score,
    sales_score: opportunity.sales_score,
    engagement_score: opportunity.engagement_score,

    recommended_post_count: opportunity.recommended_post_count,

    prompt_context: opportunity.prompt_context,
    campaign_angles: opportunity.campaign_angles,
    post_plan: opportunity.post_plan,

       date_confidence: opportunity.date_confidence,
    website_content_fit: opportunity.website_content_fit,
    website_content_strategy: opportunity.website_content_strategy,
    website_product_selection_hint: opportunity.website_product_selection_hint,

    campaign_category: opportunity.campaign_category,
    campaign_goal: opportunity.campaign_goal,
    target_customer_need: opportunity.target_customer_need,
    recommended_angles: opportunity.recommended_angles,
    product_selection_guidance: opportunity.product_selection_guidance,
    tone_guidance: opportunity.tone_guidance,
    cta_guidance: opportunity.cta_guidance,
    image_guidance: opportunity.image_guidance,
    campaign_blueprint: opportunity.campaign_blueprint,

    is_ai_generated: true,
    is_hidden: false,
    is_active: true,
    is_archived: false,

    generated_at: now,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("brand_campaign_opportunities")
    .insert(rows)
        .select(
      "id, title, event_date, event_year, slug, website_content_fit, website_content_strategy, website_product_selection_hint, campaign_category, campaign_goal, target_customer_need, recommended_angles"
    );

  if (error) {
    throw new Error(error.message || "Could not save campaign opportunities");
  }

  return data || [];
}

async function analyzeWebsiteWithOpenAI({
  openai,
  businessName,
  websiteUrl,
  html,
  brandDescription,
  contentMarket,
  countryCode,
  contentLanguage,
  currentDate,
  campaignCalendarYear,
}) {
  const title = extractPageTitle(html);
  const description = extractMetaDescription(html);
  const visibleText = truncateText(stripHtmlToText(html), WEBSITE_MAX_TEXT_CHARS);

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You analyze business websites for a social media automation tool. Return strict JSON only. Do not write actual social media posts.",
      },
      {
        role: "user",
        content: `
Analyze this business and create:
1. A brand profile.
2. A list of marketing-relevant campaign opportunities for the brand's selected market.

User-entered business name:
${businessName || "Not provided"}

Website URL:
${websiteUrl}

Selected market/country:
${contentMarket || "Not provided"}

Country code:
${countryCode || "Not provided"}

Preferred content language:
${contentLanguage || "Use the strongest language from the website"}

Current date:
${currentDate}

Calendar year:
${campaignCalendarYear}

Optional user-provided brand description:
${brandDescription || "Not provided"}

Page title:
${title || "Not found"}

Meta description:
${description || "Not found"}

Visible website text:
${visibleText}

Return JSON only in this exact shape:
{
  "profile": {
    "business_name": "Business name",
    "industry": "Short but clear description of what the business does, written in the most suitable content language",
    "target_audience": "Clear description of the likely customers/audience, written in the most suitable content language",
    "detected_language": "Detected main language"
  },
  "website_product_mode": {
    "available": true,
    "reason": "Short internal explanation. True only if the website clearly appears to contain at least one sellable item with a title, own URL or product/listing page, and a relevant image or product/listing presentation."
  },
  "campaign_opportunities": [
    {
      "title": "Campaign or theme day name",
      "slug": "simple-url-safe-slug",
      "description": "Short explanation of the campaign opportunity",
      "event_type": "holiday | theme_day | seasonal | shopping | industry_day | custom_campaign",
      "event_date": "YYYY-MM-DD or null",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "date_confidence": "high | medium | low",
      "website_content_fit": "strong | medium | weak",
      "website_content_strategy": "product | service | support | none",
           "website_product_selection_hint": "Short instruction for what type of website product, service or offer should be selected for this campaign. Use an empty string when website_content_strategy is none.",
      "campaign_category": "gift_campaign | seasonal_campaign | sales_campaign | local_event | educational_theme | awareness_theme | product_discovery | trust_building | engagement_theme | booking_push | limited_time_offer | community_moment | custom_campaign",
      "campaign_goal": "What this campaign should achieve for the business",
      "target_customer_need": "The customer need, situation, problem, desire or buying intent this campaign is built around",
      "recommended_angles": ["awareness", "engagement", "product_discovery", "product_push", "trust", "offer", "urgency"],
      "product_selection_guidance": "Strategic guidance for what products, services or offers fit this campaign and what to avoid",
      "tone_guidance": "How the campaign should sound and feel",
      "cta_guidance": "How the call to action should develop across the campaign",
      "image_guidance": "What kind of images should support this campaign",
      "relevance_reason": "Why this opportunity fits this specific business",
      "relevance_score": 1,
      "sales_score": 1,
      "engagement_score": 1,
      "recommended_post_count": 5,
      "campaign_angles": ["angle 1", "angle 2"],
      "post_plan": [
        {
          "role": "Reminder",
          "days_before_event": 14,
          "purpose": "What this post should achieve"
        }
      ],
      "prompt_context": "Reusable prompt context for generating posts later. Do not include finished post copy."
    }
  ]
}

Rules:
- Return 15 to 20 campaign opportunities when the brand is ecommerce, fashion, beauty, gifts, retail, food, restaurants, local services or product-based.
- Return 10 to 20 campaign opportunities for other businesses, never more than 20.
- Do not create finished social media posts.
- Only create campaign opportunities for Calendar year ${campaignCalendarYear}.
- Do not create campaign opportunities for previous or future calendar years.
- Every event_date, start_date and end_date must be inside Calendar year ${campaignCalendarYear}. If an opportunity cannot be placed inside this year, omit it.
- Only include opportunities that are genuinely useful for this business, industry and selected market.
- For ecommerce, fashion, beauty, gifts, retail and product-based businesses, actively include relevant gift days, shopping days and seasonal buying moments when they fit the brand.
- Do not exclude Mother's Day, Father's Day or Valentine's Day just because they are broad holidays. For ecommerce, fashion, beauty, gifts and retail brands, these are often strong sales opportunities when connected naturally to gifts, outfits, shoes, accessories, beauty, personal style or products.
- For fashion ecommerce specifically, prioritize campaigns around outfit inspiration, gift buying, partywear, seasonal wardrobe updates, shoes, sneakers, accessories, sustainable fashion, school/graduation, weddings, festivals and major shopping days.
- Always consider these commercial campaign moments when relevant to the brand and selected market: Valentine's Day, Mother's Day, Father's Day, graduation season, wedding season, festival season, back to school, Black Friday, Cyber Monday, Singles Day, Christmas gifts, New Year outfits, seasonal sales and wardrobe refreshes.
- If the brand clearly sells products online, at least 50% of the campaign opportunities should have clear commercial usefulness, such as gifts, seasonal demand, shopping days, product categories, launches, offers or buying inspiration.
- When a campaign is connected to a gift day such as Father's Day, Mother's Day or Valentine's Day, the campaign should explain what type of products or services are suitable for that occasion.
- For ecommerce campaigns, do not use random products from the website. The selected product must naturally fit the campaign, the recipient, the buyer intent and the audience.
- For a toy store on Father's Day, suitable product angles could include board games, family games, building sets, puzzles, outdoor play, hobby kits or products that children and parents can enjoy together. Do not promote unrelated baby toys or random toys just because they exist on the website.
- For gift-day campaigns, think about who buys the gift, who receives it, and why the product makes sense for that occasion.
- Prefer fewer highly relevant campaign opportunities over many weak ones.
- Avoid forced or weak campaign ideas that do not clearly connect to what the business sells, offers or represents.
- Do not include irrelevant popular theme days just because they are well known, but do include broad commercial gift and shopping days when they naturally fit what the business sells.
- A cafe can use food theme days. A hair salon should get hair/beauty/self-care/gift/seasonal opportunities instead.
- Include industry-specific days when they are useful.
- Include important local holidays or cultural moments when they are useful for marketing.
- Include seasonal campaigns if exact date is uncertain.
- For exact dated events, event_date must be YYYY-MM-DD.
- For date ranges or seasons, use start_date and end_date.
- If date is uncertain, use date_confidence "low" and prefer a date range.
- The final post in post_plan should normally have days_before_event 0 when event_date exists.
- Earlier post_plan items should prepare the audience before the event.
- Every campaign opportunity must include a strategic campaign blueprint using campaign_category, campaign_goal, target_customer_need, recommended_angles, product_selection_guidance, tone_guidance, cta_guidance and image_guidance.
- The campaign blueprint should explain how this campaign should move the audience from interest to action.
- recommended_angles should contain the best marketing angles for the recommended_post_count.
- Use these standard marketing angles when possible: awareness, engagement, product_discovery, product_push, trust, offer, urgency.
- Use "main" only when the campaign has 1 post and the single post must combine multiple roles.
- Each post_plan item must include campaign_phase, marketing_angle, customer_stage and cta_strength.
- For customer_stage, use:
  - "cold" for early awareness, inspiration or engagement posts.
  - "warm" for product discovery, product push, education or trust-building posts.
  - "ready_to_buy" for offer, urgency, last chance, booking or buying-focused posts.
- For cta_strength, use:
  - "soft" for awareness and engagement.
  - "medium" for product discovery, product push, education and trust.
  - "strong" for offer, urgency, booking push and last chance.
- If recommended_post_count is 1, make the post_plan a strong allround post with marketing_angle "main", customer_stage "warm" and cta_strength "medium".
- If recommended_post_count is 2, prefer awareness → urgency.
- If recommended_post_count is 3, prefer awareness → product_push → urgency.
- If recommended_post_count is 4, prefer awareness → product_discovery → trust → urgency.
- If recommended_post_count is 5, prefer awareness → engagement → product_push → trust → urgency.
- If recommended_post_count is 6 or more, prefer awareness → engagement → product_discovery → product_push → trust → urgency, adding offer when useful.
- Do not make every post a reminder. Each post should have a distinct role in the campaign sequence.
- Do not make early posts too salesy. Do not make final posts too vague.
- recommended_post_count must be between 1 and 10.
- relevance_score, sales_score and engagement_score must be between 1 and 5.
- For each campaign opportunity, classify website_content_fit:
  - "strong" when the campaign has a clear natural match with products, services, offers, listings or content found on the website or in the description.
  - "medium" when website content may support the campaign but should not dominate it.
  - "weak" when using website products or services would feel forced or irrelevant.
- For each campaign opportunity, classify website_content_strategy:
  - "product" when posts should try to use a relevant product from the website.
  - "service" when posts should try to use a relevant service or offer from the website.
  - "support" when website content can be used as supporting context but the campaign theme should lead.
  - "none" when the campaign should not use website content automatically.
- If the business is an ecommerce store, do not automatically mark every campaign as product. Only use "product" when the campaign clearly connects to what the store sells.
- If website_content_fit is "weak", website_content_strategy should normally be "none".
- Always write website_product_selection_hint when website_content_strategy is "product" or "service".
- website_product_selection_hint should help the later automation choose a suitable website item. It should describe the product/service category, recipient, buying intent and what to avoid.
- If website_content_strategy is "none", website_product_selection_hint should be an empty string.
- Examples:
  - Gift campaign for a personalized pet portrait store: strong / product.
  - Father's Day for a personalized gift business: strong / product.
  - Allergy-related pet owner campaign for a business that only sells portraits: weak / none.
  - Educational awareness campaign with no clear product match: medium / support or weak / none.
  - Father's Day for a toy store: strong / product, with website_product_selection_hint focused on board games, family games, building sets, puzzles, outdoor play, hobby kits or products children and parents can enjoy together.
- The selected market/country is used mainly for campaign calendar relevance, holidays, cultural timing and content language.
- Do not automatically restrict the target audience geographically to the selected market unless the website or description clearly says the business only serves that country or local area.
- If the business appears remote, online, global or international, describe the target audience without limiting it to the selected market.
- Future campaign posts should be written for the selected content language and market context, but should not repeatedly mention the country unless it is naturally relevant.
- If the selected content language is Swedish, write user-facing fields in Swedish.
- If the selected content language is English, write user-facing fields in English.
- Keep prompt_context useful but concise.
- Avoid political or sensitive events unless they are clearly suitable and low-risk for business marketing.
- When choosing between a generic seasonal campaign and a strong commercial occasion for ecommerce or retail, prefer the stronger commercial occasion.
- Do not invent specific services, offers, products or locations not supported by the website or description.
- Also decide if "Sell something from my website" should be available for this brand.
- Set website_product_mode.available to true only if the website clearly appears to contain at least one concrete website item that can safely be used as a website-based post with a real website image.
- A suitable website item must normally have a clear title/name, its own dedicated product/listing/menu item/event/course/treatment/offer page or URL, and a relevant non-logo image connected to that exact item.
- Good examples: ecommerce product pages, real estate listings, menu items, event pages, course pages, bookable treatments with dedicated pages, or concrete offers with a clear individual page and a safe relevant image.
- Bad examples: generic service websites, artist pages, portfolio pages, spiritual service websites, consultant websites, informational websites, generic homepage text, logos, hero banners, about pages, blog posts, navigation links, vague services, broad service descriptions or offers without a concrete item page and safe item image.
- Service-only websites should normally return website_product_mode.available = false unless they have clear individual bookable offers with their own dedicated pages and relevant non-logo images.
- Artist, consultant, spiritual service, informational and portfolio websites should normally return website_product_mode.available = false.
- If website_product_mode.available is false, campaign opportunities should not use website_content_strategy "product" or "service". Use "support" or "none" instead.
- If unsure, set website_product_mode.available to false.
- Do not search the whole website. Base this check only on the provided page title, meta description and visible website text.
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!parsed?.profile) {
    throw new Error("Could not parse OpenAI response");
  }

  return {
    profile: {
      business_name: String(
        parsed.profile.business_name || businessName || ""
      ).trim(),
      industry: String(parsed.profile.industry || "").trim(),
      target_audience: String(parsed.profile.target_audience || "").trim(),
      detected_language: String(parsed.profile.detected_language || "").trim(),
    },
    website_product_mode: normalizeWebsiteProductMode(
      parsed.website_product_mode
    ),
    campaign_opportunities: Array.isArray(parsed.campaign_opportunities)
      ? parsed.campaign_opportunities
      : [],
  };
}

async function analyzeDescriptionWithOpenAI({
  openai,
  businessName,
  brandDescription,
  contentMarket,
  countryCode,
  contentLanguage,
  currentDate,
  campaignCalendarYear,
}) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You create brand profiles and marketing campaign opportunities from user-provided business descriptions. Return strict JSON only. Do not write actual social media posts.",
      },
      {
        role: "user",
        content: `
Create:
1. A brand profile.
2. A list of marketing-relevant campaign opportunities for this brand.

User-entered business name:
${businessName || "Not provided"}

Brand description:
${brandDescription}

Selected market/country:
${contentMarket || "Not provided"}

Country code:
${countryCode || "Not provided"}

Preferred content language:
${contentLanguage || "Use the strongest language from the description"}

Current date:
${currentDate}

Calendar year:
${campaignCalendarYear}

Return JSON only in this exact shape:
{
  "profile": {
    "business_name": "Business name",
    "industry": "Short but clear description of what the business does, written in the most suitable content language",
    "target_audience": "Clear description of the likely customers/audience, written in the most suitable content language",
    "detected_language": "Detected main language"
  },
  "campaign_opportunities": [
    {
      "title": "Campaign or theme day name",
      "slug": "simple-url-safe-slug",
      "description": "Short explanation of the campaign opportunity",
      "event_type": "holiday | theme_day | seasonal | shopping | industry_day | custom_campaign",
      "event_date": "YYYY-MM-DD or null",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "date_confidence": "high | medium | low",
      "website_content_fit": "strong | medium | weak",
      "website_content_strategy": "product | service | support | none",
      "website_product_selection_hint": "Short instruction for what type of website product, service or offer should be selected for this campaign. Use an empty string when website_content_strategy is none.",
      "relevance_reason": "Why this opportunity fits this specific business",
      "relevance_score": 1,
      "sales_score": 1,
      "engagement_score": 1,
      "recommended_post_count": 5,
      "campaign_angles": ["angle 1", "angle 2"],
      "post_plan": [
            {
          "role": "Campaign post role, for example Awareness, Product idea, Trust builder or Final reminder",
          "days_before_event": 14,
          "campaign_phase": "early | early_middle | middle | middle_late | late | last_chance | main",
          "marketing_angle": "awareness | engagement | product_discovery | product_push | trust | offer | urgency | main",
          "customer_stage": "cold | warm | ready_to_buy",
          "cta_strength": "soft | medium | strong",
          "purpose": "What this post should achieve in the campaign sequence"
        }
      ],
      "prompt_context": "Reusable prompt context for generating posts later. Do not include finished post copy."
    }
  ]
}

Rules:
- Return 15 to 20 campaign opportunities when the brand is ecommerce, fashion, beauty, gifts, retail, food, restaurants, local services or product-based.
- Return 10 to 20 campaign opportunities for other businesses, never more than 20.
- Do not create finished social media posts.
- Only create campaign opportunities for Calendar year ${campaignCalendarYear}.
- Do not create campaign opportunities for previous or future calendar years.
- Every event_date, start_date and end_date must be inside Calendar year ${campaignCalendarYear}. If an opportunity cannot be placed inside this year, omit it.
- Only include opportunities that are genuinely useful for this business, industry and selected market.
- For ecommerce, fashion, beauty, gifts, retail and product-based businesses, actively include relevant gift days, shopping days and seasonal buying moments when they fit the brand.
- Do not exclude Mother's Day, Father's Day or Valentine's Day just because they are broad holidays. For ecommerce, fashion, beauty, gifts and retail brands, these are often strong sales opportunities when connected naturally to gifts, outfits, shoes, accessories, beauty, personal style or products.
- For fashion ecommerce specifically, prioritize campaigns around outfit inspiration, gift buying, partywear, seasonal wardrobe updates, shoes, sneakers, accessories, sustainable fashion, school/graduation, weddings, festivals and major shopping days.
- Always consider these commercial campaign moments when relevant to the brand and selected market: Valentine's Day, Mother's Day, Father's Day, graduation season, wedding season, festival season, back to school, Black Friday, Cyber Monday, Singles Day, Christmas gifts, New Year outfits, seasonal sales and wardrobe refreshes.
- If the brand clearly sells products online, at least 50% of the campaign opportunities should have clear commercial usefulness, such as gifts, seasonal demand, shopping days, product categories, launches, offers or buying inspiration.
- When a campaign is connected to a gift day such as Father's Day, Mother's Day or Valentine's Day, the campaign should explain what type of products or services are suitable for that occasion.
- For ecommerce campaigns, do not use random products from the website. The selected product must naturally fit the campaign, the recipient, the buyer intent and the audience.
- For a toy store on Father's Day, suitable product angles could include board games, family games, building sets, puzzles, outdoor play, hobby kits or products that children and parents can enjoy together. Do not promote unrelated baby toys or random toys just because they exist on the website.
- For gift-day campaigns, think about who buys the gift, who receives it, and why the product makes sense for that occasion.
- Prefer fewer highly relevant campaign opportunities over many weak ones.
- Avoid forced or weak campaign ideas that do not clearly connect to what the business sells, offers or represents.
- Do not include irrelevant popular theme days just because they are well known, but do include broad commercial gift and shopping days when they naturally fit what the business sells.
- A cafe can use food theme days. A hair salon should get hair/beauty/self-care/gift/seasonal opportunities instead.
- Include industry-specific days when they are useful.
- Include important local holidays or cultural moments when they are useful for marketing.
- Include seasonal campaigns if exact date is uncertain.
- For exact dated events, event_date must be YYYY-MM-DD.
- For date ranges or seasons, use start_date and end_date.
- If date is uncertain, use date_confidence "low" and prefer a date range.
- The final post in post_plan should normally have days_before_event 0 when event_date exists.
- Earlier post_plan items should prepare the audience before the event.
- recommended_post_count must be between 1 and 10.
- relevance_score, sales_score and engagement_score must be between 1 and 5.
- For each campaign opportunity, classify website_content_fit:
  - "strong" when the campaign has a clear natural match with products, services, offers, listings or content found on the website or in the description.
  - "medium" when website content may support the campaign but should not dominate it.
  - "weak" when using website products or services would feel forced or irrelevant.
- For each campaign opportunity, classify website_content_strategy:
  - "product" when posts should try to use a relevant product from the website.
  - "service" when posts should try to use a relevant service or offer from the website.
  - "support" when website content can be used as supporting context but the campaign theme should lead.
  - "none" when the campaign should not use website content automatically.
- If the business is an ecommerce store, do not automatically mark every campaign as product. Only use "product" when the campaign clearly connects to what the store sells.
- If website_content_fit is "weak", website_content_strategy should normally be "none".
- Always write website_product_selection_hint when website_content_strategy is "product" or "service".
- website_product_selection_hint should help the later automation choose a suitable website item. It should describe the product/service category, recipient, buying intent and what to avoid.
- If website_content_strategy is "none", website_product_selection_hint should be an empty string.
- Examples:
  - Gift campaign for a personalized pet portrait store: strong / product.
  - Father's Day for a personalized gift business: strong / product.
  - Allergy-related pet owner campaign for a business that only sells portraits: weak / none.
  - Educational awareness campaign with no clear product match: medium / support or weak / none.
  - Father's Day for a toy store: strong / product, with website_product_selection_hint focused on board games, family games, building sets, puzzles, outdoor play, hobby kits or products children and parents can enjoy together.
- The selected market/country is used mainly for campaign calendar relevance, holidays, cultural timing and content language.
- Do not automatically restrict the target audience geographically to the selected market unless the website or description clearly says the business only serves that country or local area.
- If the business appears remote, online, global or international, describe the target audience without limiting it to the selected market.
- Future campaign posts should be written for the selected content language and market context, but should not repeatedly mention the country unless it is naturally relevant.
- If the selected content language is Swedish, write user-facing fields in Swedish.
- If the selected content language is English, write user-facing fields in English.
- Keep prompt_context useful but concise.
- Avoid political or sensitive events unless they are clearly suitable and low-risk for business marketing.
- When choosing between a generic seasonal campaign and a strong commercial occasion for ecommerce or retail, prefer the stronger commercial occasion.
- Do not invent specific services, offers, products or locations not supported by the description.
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!parsed?.profile) {
    throw new Error("Could not parse OpenAI response");
  }

   return {
    profile: {
      business_name: String(
        parsed.profile.business_name || businessName || ""
      ).trim(),
      industry: String(parsed.profile.industry || "").trim(),
      target_audience: String(parsed.profile.target_audience || "").trim(),
      detected_language: String(parsed.profile.detected_language || "").trim(),
    },
    website_product_mode: {
      available: false,
      reason:
        "No website was provided, so website product mode is not available.",
    },
    campaign_opportunities: Array.isArray(parsed.campaign_opportunities)
      ? parsed.campaign_opportunities
      : [],
  };
}

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !openaiApiKey) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or OPENAI_API_KEY.",
        },
        { status: 500 }
      );
    }

    const authorizationHeader = request.headers.get("authorization") || "";

    if (!authorizationHeader.startsWith("Bearer ")) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorizationHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const brandProfileId = String(body?.brandProfileId || "").trim();
    const businessName = String(body?.businessName || "").trim();
    const websiteUrl = normalizeWebsiteUrl(body?.websiteUrl);
    const brandDescription = String(body?.brandDescription || "").trim();

    const contentMarket = String(body?.contentMarket || "").trim();
    const countryCode = String(body?.countryCode || "").trim().toUpperCase();
    const requestedContentLanguage = String(
      body?.contentLanguage || ""
    ).trim();

    if (!brandProfileId) {
      return Response.json(
        {
          ok: false,
          error: "Missing brand profile.",
        },
        { status: 400 }
      );
    }

    if (!businessName) {
      return Response.json(
        {
          ok: false,
          error: "Business name is required.",
        },
        { status: 400 }
      );
    }

    if (!contentMarket || !countryCode) {
      return Response.json(
        {
          ok: false,
          error: "Choose the market/country this brand targets.",
        },
        { status: 400 }
      );
    }

    if (!requestedContentLanguage) {
      return Response.json(
        {
          ok: false,
          error: "Choose the content language for this brand.",
        },
        { status: 400 }
      );
    }

    if (!websiteUrl && !brandDescription) {
      return Response.json(
        {
          ok: false,
          error: "Add a website URL or describe your brand.",
        },
        { status: 400 }
      );
    }

    await verifyBrandOwnership({
      supabase,
      userId: user.id,
      brandProfileId,
    });

    await checkRateLimit({
      supabase,
      userId: user.id,
    });

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    const campaignCalendarYear = now.getUTCFullYear();

    let analysis;
    let finalWebsiteUrl = websiteUrl;

    if (websiteUrl) {
      const website = await fetchWebsiteHtml(websiteUrl);
      finalWebsiteUrl = website.url;

      analysis = await analyzeWebsiteWithOpenAI({
        openai,
        businessName,
        websiteUrl: website.url,
        html: website.html,
        brandDescription,
        contentMarket,
        countryCode,
        contentLanguage: requestedContentLanguage,
        currentDate,
        campaignCalendarYear,
      });
    } else {
      analysis = await analyzeDescriptionWithOpenAI({
        openai,
        businessName,
        brandDescription,
        contentMarket,
        countryCode,
        contentLanguage: requestedContentLanguage,
        currentDate,
        campaignCalendarYear,
      });
    }

    const profile = analysis.profile;
    const finalContentLanguage = getDefaultLanguage(
      requestedContentLanguage,
      profile.detected_language
    );

       const savedProfile = await saveBrandProfile({
      supabase,
      userId: user.id,
      brandProfileId,
      websiteUrl: finalWebsiteUrl,
      brandDescription,
      profile,
      contentMarket,
      countryCode,
      contentLanguage: finalContentLanguage,
      campaignCalendarYear,
      websiteProductMode: analysis.website_product_mode,
    });
    const savedOpportunities = await replaceBrandCampaignOpportunities({
      supabase,
      userId: user.id,
      brandProfileId,
      contentMarket,
      countryCode,
      contentLanguage: finalContentLanguage,
      industry: profile.industry,
      campaignCalendarYear,
      opportunities: analysis.campaign_opportunities,
    });

    await logAnalysisRun({
      supabase,
      userId: user.id,
      websiteUrl: finalWebsiteUrl,
    });

    return Response.json({
      ok: true,
      website_url: finalWebsiteUrl,
      profile: savedProfile,
      detected_language: profile.detected_language || null,
      campaign_opportunities_count: savedOpportunities.length,
      message: finalWebsiteUrl
        ? `Website analyzed, brand profile saved and ${savedOpportunities.length} campaign opportunities created.`
        : `Description analyzed, brand profile saved and ${savedOpportunities.length} campaign opportunities created.`,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || "Could not analyze brand.",
      },
      { status: 500 }
    );
  }
}
