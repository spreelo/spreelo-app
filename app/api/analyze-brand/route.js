import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const WEBSITE_MAX_TEXT_CHARS = 18000;
const MAX_ANALYSES_PER_24_HOURS = 5;
const MIN_MINUTES_BETWEEN_ANALYSES = 2;
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .select(
      "id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, campaign_calendar_year, campaign_calendar_generated_at, campaign_calendar_refreshed_at"
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
    .select("id, title, event_date, event_year, slug");

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
- Return 10 to 20 campaign opportunities, never more than 20.
- Do not create finished social media posts.
- Only include opportunities that are genuinely useful for this business, industry and selected market.
- Do not include irrelevant popular theme days just because they are well known.
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
- If the selected content language is Swedish, write user-facing fields in Swedish.
- If the selected content language is English, write user-facing fields in English.
- Keep prompt_context useful but concise.
- Avoid political or sensitive events unless they are clearly suitable and low-risk for business marketing.
- Do not invent specific services, offers, products or locations not supported by the website or description.
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
- Return 10 to 20 campaign opportunities, never more than 20.
- Do not create finished social media posts.
- Only include opportunities that are genuinely useful for this business, industry and selected market.
- Do not include irrelevant popular theme days just because they are well known.
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
- If the selected content language is Swedish, write user-facing fields in Swedish.
- If the selected content language is English, write user-facing fields in English.
- Keep prompt_context useful but concise.
- Avoid political or sensitive events unless they are clearly suitable and low-risk for business marketing.
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
