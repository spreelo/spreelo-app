import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLASSIFICATION_MODEL =
  process.env.CONTENT_SOURCE_CLASSIFICATION_MODEL || "gpt-4.1-mini";
const MAX_HTML_CHARS = 500_000;
const MAX_TEXT_CHARS = 14_000;

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function normalizeText(value, maxLength = 400) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getMetaContent(html, names) {
  for (const name of names) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
    ];

    for (const pattern of patterns) {
      const match = String(html || "").match(pattern);
      if (match?.[1]) return decodeHtmlEntities(match[1]);
    }
  }

  return "";
}

function getPageTitle(html) {
  return (
    getMetaContent(html, ["og:title", "twitter:title"]) ||
    decodeHtmlEntities(String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
  );
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSameSite(candidateUrl, allowedUrls) {
  const candidateHost = getHost(candidateUrl);
  if (!candidateHost) return false;

  return allowedUrls.some((allowedUrl) => {
    const allowedHost = getHost(allowedUrl);
    if (!allowedHost) return false;
    return (
      candidateHost === allowedHost ||
      candidateHost.endsWith(`.${allowedHost}`) ||
      allowedHost.endsWith(`.${candidateHost}`)
    );
  });
}

function countProductLinks(html, pageUrl) {
  const urls = new Set();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = anchorRegex.exec(String(html || ""))) !== null) {
    try {
      const url = new URL(match[1], pageUrl);
      const path = url.pathname.toLowerCase();
      if (
        /\/(products?|produkt|produkter|p)\//.test(path) ||
        /\/[^/]+-[a-z0-9]{5,}(?:\.html)?$/.test(path)
      ) {
        urls.add(`${url.origin}${url.pathname}`);
      }
    } catch {
      // Ignore malformed links.
    }
  }

  return urls.size;
}

function buildDeterministicSignals({ html, text, pageUrl }) {
  const lowerHtml = String(html || "").toLowerCase();
  const lowerText = String(text || "").toLowerCase();
  const path = (() => {
    try {
      return new URL(pageUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  return {
    productSchema:
      /["']@type["']\s*:\s*["']product["']/.test(lowerHtml) ||
      /schema\.org\/product/.test(lowerHtml),
    collectionPath: /\/(collections?|categories?|kategori|kategorier|shop|butik)\//.test(path),
    productPath: /\/(products?|produkt|produkter)\//.test(path),
    productLinkCount: countProductLinks(html, pageUrl),
    commerceSignals: [
      /add to cart|lägg till i kundvagn|köp nu|buy now|checkout/.test(lowerText),
      /pricecurrency|itemprop=["']price|product:price/.test(lowerHtml),
      /\b(?:sek|eur|usd|gbp|dkk|nok|kr|€|\$|£)\b/.test(lowerText),
    ].filter(Boolean).length,
  };
}

function normalizeClassification(value, websiteProductModeAvailable, signals) {
  const normalized = String(value || "").toLowerCase();

  if (!websiteProductModeAvailable) {
    return "focus_page";
  }

  if (normalized === "exact_product") return "exact_product";
  if (normalized === "product_category") return "product_category";

  if (signals.productSchema || (signals.productPath && signals.commerceSignals >= 1)) {
    return "exact_product";
  }

  if (
    signals.collectionPath ||
    signals.productLinkCount >= 4
  ) {
    return "product_category";
  }

  return "focus_page";
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SpreeloBot/1.0; +https://spreelo.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8,sv;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`Website returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("The URL did not return a normal web page");
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    return {
      html,
      finalUrl: normalizeUrl(response.url) || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return Response.json({ ok: false, error: "You must be logged in." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !anonKey || !openaiApiKey) {
      return Response.json({ ok: false, error: "Required server configuration is missing." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ ok: false, error: "Your login session is not valid." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brandProfileId || "").trim();
    const requestedUrl = normalizeUrl(body?.url);

    if (!brandProfileId || !requestedUrl) {
      return Response.json({ ok: false, error: "Enter a valid page URL." }, { status: 400 });
    }

    const { data: brandProfile, error: brandError } = await authClient
      .from("brand_profiles")
      .select(
        "id, website_url, website_product_source_url, website_product_mode_available"
      )
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandError || !brandProfile) {
      return Response.json({ ok: false, error: "The selected brand could not be verified." }, { status: 404 });
    }

    const allowedUrls = [brandProfile.website_url, brandProfile.website_product_source_url]
      .map(normalizeUrl)
      .filter(Boolean);

    if (!allowedUrls.length || !isSameSite(requestedUrl, allowedUrls)) {
      return Response.json(
        {
          ok: false,
          error: "The page must belong to the selected brand website or its approved shop domain.",
        },
        { status: 400 }
      );
    }

    const { html, finalUrl } = await fetchPage(requestedUrl);
    if (!isSameSite(finalUrl, allowedUrls)) {
      return Response.json(
        { ok: false, error: "The page redirected outside the selected brand website." },
        { status: 400 }
      );
    }

    const text = stripHtmlToText(html).slice(0, MAX_TEXT_CHARS);
    const title = normalizeText(getPageTitle(html), 180) || normalizeText(finalUrl, 180);
    const metaDescription = normalizeText(
      getMetaContent(html, ["description", "og:description", "twitter:description"]),
      500
    );
    const signals = buildDeterministicSignals({ html, text, pageUrl: finalUrl });

    const openai = new OpenAI({ apiKey: openaiApiKey });
    let aiResult = {};

    try {
      const completion = await openai.chat.completions.create({
        model: CLASSIFICATION_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Classify one verified website page for a social-content planning tool. Return strict JSON only. Do not invent facts.",
          },
          {
            role: "user",
            content: `
Classify this page as one of:
- exact_product: one specific purchasable product page
- product_category: a category, collection, shop listing or page containing multiple products
- focus_page: any other page, service, section, article, event or information page

The brand has been verified as a web shop: ${Boolean(
              brandProfile.website_product_mode_available
            ) ? "yes" : "no"}

Rules:
- If the brand is not a verified web shop, always use focus_page.
- A service or auction information page is focus_page, not a product page.
- Do not classify a page as product/category only because it contains one price-like number.
- Summarize only what is clearly supported by the supplied page.

URL: ${finalUrl}
Page title: ${title}
Meta description: ${metaDescription || "Not provided"}
Deterministic signals: ${JSON.stringify(signals)}
Page text excerpt:
${text.slice(0, 9000)}

Return exactly:
{
  "classification": "exact_product|product_category|focus_page",
  "display_title": "short human-readable page title",
  "summary": "one or two factual sentences about what this page contains"
}
            `.trim(),
          },
        ],
      });

      aiResult = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    } catch (classificationError) {
      console.warn("Focused content source AI classification failed; using deterministic classification", {
        brandProfileId,
        url: finalUrl,
        message: classificationError.message,
      });
    }

    const sourceScope = normalizeClassification(
      aiResult?.classification,
      Boolean(brandProfile.website_product_mode_available),
      signals
    );
    const displayTitle =
      normalizeText(aiResult?.display_title, 180) || title || "Selected page";
    const summary =
      normalizeText(aiResult?.summary, 900) ||
      metaDescription ||
      normalizeText(text, 900) ||
      "The selected page was verified.";

    return Response.json({
      ok: true,
      source: {
        url: finalUrl,
        sourceScope,
        displayTitle,
        summary,
        verifiedAt: new Date().toISOString(),
        websiteProductModeAvailable: Boolean(
          brandProfile.website_product_mode_available
        ),
        classificationModel: CLASSIFICATION_MODEL,
      },
    });
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? "The website took too long to respond."
        : error?.message || "The page could not be inspected.";

    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
