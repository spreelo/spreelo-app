import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertPublicHttpUrl } from "../../../../../lib/security.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabaseClient(authorizationHeader) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables");
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorizationHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeWebsiteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

async function fetchPublicHtml(rawUrl) {
  let current = await assertPublicHttpUrl(normalizeWebsiteUrl(rawUrl));
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SpreeloBot/1.0; +https://app.spreelo.com)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new Error("Website redirect could not be followed safely.");
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website returned ${response.status}`);
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html")) throw new Error("Website did not return HTML");
      const html = (await response.text()).slice(0, 1200000);
      return { url: current, html };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Website could not be read.");
}


function extractShopifyShopDomain(websiteUrl, html = "") {
  const source = `${websiteUrl}\n${html}`;
  const matches = source.match(/[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com/gi) || [];
  for (const match of matches) {
    const normalized = String(match || "").toLowerCase();
    if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) return normalized;
  }
  return null;
}

function detectWebsiteStack(websiteUrl, html = "") {
  const source = `${websiteUrl}\n${html}`.toLowerCase();
  const technologies = [];
  const add = (id, label) => {
    if (!technologies.some((item) => item.id === id)) technologies.push({ id, label });
  };

  if (/cdn\.shopify\.com|shopify\.theme|shopify-section|myshopify\.com|shopify-payment-button|shopify-features/i.test(source)) add("shopify", "Shopify");
  if (/woocommerce|wc-ajax|woocommerce-product|wp-content\/plugins\/woocommerce/i.test(source)) add("woocommerce", "WooCommerce");
  if (/googletagmanager\.com\/gtag\/js\?[^"'<>]*id=g-|gtag\([^)]*config[^)]*g-[a-z0-9]+/i.test(source)) add("google_analytics", "Google Analytics");
  if (/googletagmanager\.com\/(?:gtm\.js|ns\.html)\?[^"'<>]*id=gtm-[a-z0-9]+/i.test(source)) add("google_tag_manager", "Google Tag Manager");
  if (/wp-content\/|wp-includes\/|wordpress/i.test(source)) add("wordpress", "WordPress");
  if (/wixstatic\.com|wixsite\.com|wix-code-sdk/i.test(source)) add("wix", "Wix");
  if (/static1\.squarespace\.com|squarespace\.com\/universal\/scripts-compressed/i.test(source)) add("squarespace", "Squarespace");
  if (/webflow\.js|website-files\.com|webflow\.io/i.test(source)) add("webflow", "Webflow");

  let provider = "universal";
  if (technologies.some((item) => item.id === "shopify")) provider = "shopify";
  else if (technologies.some((item) => item.id === "woocommerce")) provider = "woocommerce";
  else if (technologies.some((item) => item.id === "google_analytics")) provider = "google_analytics";
  else if (technologies.some((item) => item.id === "google_tag_manager")) provider = "google_tag_manager";
  else if (technologies.some((item) => item.id === "wordpress")) provider = "wordpress";

  return { provider, technologies };
}

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || "").trim();
    if (!brandProfileId) return NextResponse.json({ ok: false, error: "Missing brand" }, { status: 400 });

    const { data: brand, error: brandError } = await supabase
      .from("brand_profiles")
      .select("id,website_url")
      .eq("id", brandProfileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (brandError) throw brandError;
    if (!brand?.id) return NextResponse.json({ ok: false, error: "Invalid brand" }, { status: 403 });

    const websiteUrl = normalizeWebsiteUrl(brand.website_url);
    if (!websiteUrl) {
      return NextResponse.json({
        ok: true,
        website_url: "",
        provider: "universal",
        technologies: [],
        could_read_website: false,
        needs_website_url: true,
      });
    }

    let finalUrl = websiteUrl;
    let html = "";
    let fetchError = "";
    try {
      const website = await fetchPublicHtml(websiteUrl);
      finalUrl = website.url;
      html = website.html;
    } catch (error) {
      fetchError = error?.message || "Website could not be read.";
    }

    const detection = detectWebsiteStack(finalUrl, html);
    const shopDomain = detection.provider === "shopify" ? extractShopifyShopDomain(finalUrl, html) : null;
    const now = new Date().toISOString();
    const payload = {
      brand_profile_id: brand.id,
      user_id: user.id,
      status: "discovered",
      provider: detection.provider,
      website_url: finalUrl,
      detected_platform: detection.provider,
      detected_signals: {
        technologies: detection.technologies,
        could_read_website: Boolean(html),
        fetch_error: fetchError || null,
        shop_domain: shopDomain,
      },
      discovered_at: now,
      last_error: fetchError || null,
      updated_at: now,
    };
    const { data: connection, error: connectionError } = await supabase
      .from("brand_web_data_connections")
      .upsert(payload, { onConflict: "brand_profile_id" })
      .select("*")
      .single();
    if (connectionError) throw connectionError;

    return NextResponse.json({
      ok: true,
      website_url: finalUrl,
      provider: detection.provider,
      technologies: detection.technologies,
      could_read_website: Boolean(html),
      fetch_error: fetchError || null,
      shop_domain: shopDomain,
      connection,
    });
  } catch (error) {
    console.error("Grow Brain website discovery failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Could not inspect website." }, { status: 500 });
  }
}
