import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  normalizeHostname,
  saveShopifyConnection,
} from "../../../../../lib/shopifyOAuth.js";

export const dynamic = "force-dynamic";

function userClient(authorizationHeader) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorizationHeader } },
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function localeToLanguage(value) {
  const code = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
  return ({ sv: "Swedish", da: "Danish", no: "Norwegian", nb: "Norwegian", nn: "Norwegian", de: "German", fi: "Finnish", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pt: "Portuguese" })[code] || "English";
}

function asWebsiteUrl(value, shopDomain) {
  const raw = String(value || "").trim();
  if (raw) return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return `https://${shopDomain}`;
}

function publicBrand(brand) {
  return {
    id: brand.id,
    business_name: brand.business_name || "",
    website_url: brand.website_url || "",
  };
}

function noStoreJson(payload, init = {}) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = userClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });

    const sessionId = String(request.cookies.get("spreelo_shopify_onboarding")?.value || "").trim();
    if (!sessionId) return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_SESSION_MISSING" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const requestedBrandId = String(body?.brand_profile_id || "").trim();
    const createNew = Boolean(body?.create_new);
    const admin = createSupabaseAdminClient();

    const { data: onboarding, error: onboardingError } = await admin
      .from("shopify_onboarding_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (onboardingError) throw onboardingError;
    if (!onboarding?.id || onboarding.status !== "ready_to_claim") {
      return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_NOT_READY" }, { status: 409 });
    }
    if (new Date(onboarding.expires_at || 0).getTime() <= Date.now()) {
      return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_SESSION_EXPIRED" }, { status: 410 });
    }
    if (!onboarding.installer_email_verified || normalizeEmail(user.email) !== normalizeEmail(onboarding.installer_email)) {
      return noStoreJson({ ok: false, error: "SHOPIFY_IDENTITY_MISMATCH" }, { status: 403 });
    }

    const { data: otherLink } = await admin
      .from("shopify_connections")
      .select("id,user_id,brand_profile_id")
      .eq("shop_domain", onboarding.shop_domain)
      .neq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (otherLink?.id) {
      return noStoreJson({ ok: false, error: "SHOP_ALREADY_LINKED_TO_ANOTHER_SPRELO_ACCOUNT" }, { status: 409 });
    }

    const { data: brands, error: brandError } = await admin
      .from("brand_profiles")
      .select("id,business_name,website_url,is_default,created_at,campaign_calendar_generated_at")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (brandError) throw brandError;
    const brandRows = brands || [];

    const { data: existingConnection } = await admin
      .from("shopify_connections")
      .select("brand_profile_id")
      .eq("user_id", user.id)
      .eq("shop_domain", onboarding.shop_domain)
      .maybeSingle();

    const { data: webRows } = brandRows.length
      ? await admin
          .from("brand_web_data_connections")
          .select("brand_profile_id,website_url,detected_signals")
          .eq("user_id", user.id)
          .in("brand_profile_id", brandRows.map((brand) => brand.id))
      : { data: [] };

    const targetHosts = new Set([
      normalizeHostname(onboarding.shop_domain),
      normalizeHostname(onboarding.primary_domain),
    ].filter(Boolean));
    const webByBrand = new Map((webRows || []).map((row) => [row.brand_profile_id, row]));
    const exactMatches = brandRows.filter((brand) => {
      const web = webByBrand.get(brand.id);
      const candidates = [
        normalizeHostname(brand.website_url),
        normalizeHostname(web?.website_url),
        normalizeHostname(web?.detected_signals?.shop_domain),
      ].filter(Boolean);
      return candidates.some((host) => targetHosts.has(host));
    });

    let selectedBrand = null;
    let createdBrand = false;

    if (requestedBrandId) {
      selectedBrand = brandRows.find((brand) => brand.id === requestedBrandId) || null;
      if (!selectedBrand) return noStoreJson({ ok: false, error: "INVALID_BRAND_SELECTION" }, { status: 403 });
    } else if (createNew || brandRows.length === 0) {
      const websiteUrl = asWebsiteUrl(onboarding.primary_domain, onboarding.shop_domain);
      const { data: newBrand, error: createError } = await admin
        .from("brand_profiles")
        .insert({
          user_id: user.id,
          business_name: String(onboarding.shop_name || onboarding.shop_domain.split(".")[0] || "Shopify Store").trim(),
          website_url: websiteUrl,
          brand_description: "",
          industry: "",
          target_audience: "",
          content_market: "International / Global",
          country_code: "GLOBAL",
          content_language: localeToLanguage(onboarding.installer_locale),
          is_default: brandRows.length === 0,
          updated_at: new Date().toISOString(),
        })
        .select("id,business_name,website_url,is_default,created_at,campaign_calendar_generated_at")
        .single();
      if (createError) throw createError;
      selectedBrand = newBrand;
      createdBrand = true;
    } else if (existingConnection?.brand_profile_id) {
      selectedBrand = brandRows.find((brand) => brand.id === existingConnection.brand_profile_id) || null;
    } else if (exactMatches.length === 1) {
      selectedBrand = exactMatches[0];
    } else if (brandRows.length === 1 && !String(brandRows[0].website_url || "").trim()) {
      selectedBrand = brandRows[0];
    }

    if (!selectedBrand) {
      return noStoreJson({
        ok: true,
        needs_brand_selection: true,
        shop: {
          domain: onboarding.shop_domain,
          name: onboarding.shop_name || "Shopify Store",
          primary_domain: onboarding.primary_domain || "",
        },
        brands: brandRows.map(publicBrand),
      });
    }

    const websiteUrl = asWebsiteUrl(onboarding.primary_domain, onboarding.shop_domain);
    if (!String(selectedBrand.website_url || "").trim()) {
      const { data: updatedBrand, error: brandUpdateError } = await admin
        .from("brand_profiles")
        .update({ website_url: websiteUrl, updated_at: new Date().toISOString() })
        .eq("id", selectedBrand.id)
        .eq("user_id", user.id)
        .select("id,business_name,website_url,is_default,created_at,campaign_calendar_generated_at")
        .single();
      if (brandUpdateError) throw brandUpdateError;
      selectedBrand = updatedBrand;
    }

    await saveShopifyConnection({
      supabaseAdmin: admin,
      userId: user.id,
      brandProfileId: selectedBrand.id,
      shop: onboarding.shop_domain,
      token: {
        access_token: onboarding.access_token,
        refresh_token: onboarding.refresh_token,
        access_token_expires_at: onboarding.access_token_expires_at,
        refresh_token_expires_at: onboarding.refresh_token_expires_at,
        scopes: onboarding.scopes || [],
      },
    });

    const { data: savedConnection, error: installUpdateError } = await admin.from("shopify_connections").update({
      install_source: "shopify_app_store",
      app_store_installed_at: onboarding.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("shop_domain", onboarding.shop_domain)
      .select("id,ai_store_data_consent_at,ai_store_data_consent_version")
      .maybeSingle();
    if (installUpdateError) throw installUpdateError;

    const { data: currentWeb } = await admin
      .from("brand_web_data_connections")
      .select("detected_signals")
      .eq("brand_profile_id", selectedBrand.id)
      .maybeSingle();
    await admin.from("brand_web_data_connections").upsert({
      brand_profile_id: selectedBrand.id,
      user_id: user.id,
      status: "connected",
      provider: "shopify",
      website_url: websiteUrl,
      detected_platform: "shopify",
      detected_signals: {
        ...(currentWeb?.detected_signals || {}),
        shop_domain: onboarding.shop_domain,
        primary_domain: onboarding.primary_domain || null,
        install_source: "shopify_app_store",
      },
      connected_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_profile_id" });

    await admin.from("shopify_onboarding_sessions").update({
      status: "claimed",
      claimed_user_id: user.id,
      claimed_brand_profile_id: selectedBrand.id,
      claimed_at: new Date().toISOString(),
      installer_email: null,
      installer_shopify_user_id: null,
      installer_locale: null,
      access_token: null,
      refresh_token: null,
      updated_at: new Date().toISOString(),
    }).eq("id", onboarding.id);

    const response = noStoreJson({
      ok: true,
      connected: true,
      created_brand: createdBrand,
      analysis_required: createdBrand || !selectedBrand.campaign_calendar_generated_at,
      ai_consent_required: !savedConnection?.ai_store_data_consent_at,
      brand: publicBrand(selectedBrand),
      shop: {
        domain: onboarding.shop_domain,
        name: onboarding.shop_name || "Shopify Store",
        primary_domain: onboarding.primary_domain || "",
      },
    });
    response.cookies.delete("spreelo_shopify_onboarding");
    return response;
  } catch (error) {
    console.error("Shopify onboarding claim failed", error);
    return noStoreJson({ ok: false, error: error?.message || "Could not connect Shopify to Spreelo." }, { status: 500 });
  }
}
