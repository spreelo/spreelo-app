import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const WEBSITE_MAX_TEXT_CHARS = 18000;
const MAX_ANALYSES_PER_24_HOURS = 5;
const MIN_MINUTES_BETWEEN_ANALYSES = 2;

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
}) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .update({
      business_name: profile.business_name,
      website_url: websiteUrl || "",
      brand_description: brandDescription || "",
      industry: profile.industry,
      target_audience: profile.target_audience,
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .select(
      "id, business_name, website_url, brand_description, industry, target_audience"
    )
    .single();

  if (error) {
    throw new Error(error.message || "Could not save brand profile");
  }

  return data;
}

async function analyzeWebsiteWithOpenAI({
  openai,
  businessName,
  websiteUrl,
  html,
  brandDescription,
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
          "You analyze business websites and return strict JSON only. Do not invent details that are not supported by the provided website content and optional brand description.",
      },
      {
        role: "user",
        content: `
Analyze this business and create a brand profile for a social media automation tool.

User-entered business name:
${businessName || "Not provided"}

Website URL:
${websiteUrl}

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
  "business_name": "Business name",
  "industry": "Short but clear description of what the business does, written in the same language as the strongest source",
  "target_audience": "Clear description of the likely customers/audience, written in the same language as the strongest source",
  "detected_language": "Detected main language"
}

Rules:
- Use only information supported by the website content and optional brand description.
- Do not make up products, locations, services or claims.
- If the user-entered business name is provided, prefer that name unless the website clearly shows a better official name.
- Write business_name as the official business name, not translated.
- Industry should be useful for generating social media posts.
- Target audience should be practical and specific, not vague.
- If Swedish dominates, write industry and target_audience in Swedish.
- If English dominates, write industry and target_audience in English.
- Keep each field concise but useful.
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    throw new Error("Could not parse OpenAI response");
  }

  return {
    business_name: String(parsed.business_name || businessName || "").trim(),
    industry: String(parsed.industry || "").trim(),
    target_audience: String(parsed.target_audience || "").trim(),
    detected_language: String(parsed.detected_language || "").trim(),
  };
}

async function analyzeDescriptionWithOpenAI({
  openai,
  businessName,
  brandDescription,
}) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You create brand profiles from user-provided business descriptions and return strict JSON only. Do not invent unsupported claims.",
      },
      {
        role: "user",
        content: `
Create a brand profile for a social media automation tool based on this user-provided description.

User-entered business name:
${businessName || "Not provided"}

Brand description:
${brandDescription}

Return JSON only in this exact shape:
{
  "business_name": "Business name",
  "industry": "Short but clear description of what the business does, written in the same language as the description",
  "target_audience": "Clear description of the likely customers/audience, written in the same language as the description",
  "detected_language": "Detected main language"
}

Rules:
- Use only information supported by the description.
- Do not invent products, locations, services or claims.
- If the user-entered business name is provided, use it as the business_name.
- Industry should be useful for generating social media posts.
- Target audience should be practical and specific, not vague.
- If the description is Swedish, answer in Swedish.
- If the description is English, answer in English.
- Keep each field concise but useful.
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    throw new Error("Could not parse OpenAI response");
  }

  return {
    business_name: String(parsed.business_name || businessName || "").trim(),
    industry: String(parsed.industry || "").trim(),
    target_audience: String(parsed.target_audience || "").trim(),
    detected_language: String(parsed.detected_language || "").trim(),
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

    let profile;
    let finalWebsiteUrl = websiteUrl;

    if (websiteUrl) {
      const website = await fetchWebsiteHtml(websiteUrl);
      finalWebsiteUrl = website.url;

      profile = await analyzeWebsiteWithOpenAI({
        openai,
        businessName,
        websiteUrl: website.url,
        html: website.html,
        brandDescription,
      });
    } else {
      profile = await analyzeDescriptionWithOpenAI({
        openai,
        businessName,
        brandDescription,
      });
    }

    const savedProfile = await saveBrandProfile({
      supabase,
      userId: user.id,
      brandProfileId,
      websiteUrl: finalWebsiteUrl,
      brandDescription,
      profile,
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
      message: finalWebsiteUrl
        ? "Website analyzed and brand profile saved."
        : "Description analyzed and brand profile saved.",
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
