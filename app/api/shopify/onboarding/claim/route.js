import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  saveShopifyConnection,
} from "../../../../../lib/shopifyOAuth.js";
import {
  brandMatchesExactShopifyShop,
  selectExactShopifyBrand,
} from "../../../../../lib/shopifyBrandIsolation.js";

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

async function clearLegacyAppStoreWebBinding(admin, { userId, brandProfileId, shopDomain }) {
  const staleBrandId = String(brandProfileId || "").trim();
  const normalizedShop = String(shopDomain || "").trim().toLowerCase();
  if (!staleBrandId || !normalizedShop) return false;

  const { data: row, error } = await admin
    .from("brand_web_data_connections")
    .select("brand_profile_id,detected_signals")
    .eq("user_id", userId)
    .eq("brand_profile_id", staleBrandId)
    .maybeSingle();
  if (error) throw error;

  const signals = row?.detected_signals || {};
  const signalShop = String(signals?.shop_domain || "").trim().toLowerCase();
  const appStoreDerived = String(signals?.install_source || "").trim() === "shopify_app_store";
  if (!row?.brand_profile_id || !appStoreDerived || signalShop !== normalizedShop) return false;

  const { error: deleteError } = await admin
    .from("brand_web_data_connections")
    .delete()
    .eq("user_id", userId)
    .eq("brand_profile_id", staleBrandId);
  if (deleteError) throw deleteError;
  return true;
}

async function ensureStandardSpreeloAccountState(admin, userId) {
  const selectColumns = "user_id,credits_remaining,monthly_credit_limit,plan_name,subscription_status,subscription_plan,purchased_credits_remaining,free_trial_status,free_trial_credit_amount";
  const { data: existing, error: existingError } = await admin
    .from("user_credit_balances")
    .select(selectColumns)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.user_id) return { created: false, balance: existing };

  // Match the ordinary Spreelo account lifecycle: a new Free workspace has the
  // same 100-credit offer, locked until an eligible social account is verified.
  const { data: created, error: createError } = await admin
    .from("user_credit_balances")
    .insert({
      user_id: userId,
      credits_remaining: 0,
      monthly_credit_limit: 0,
      plan_name: "Free",
      subscription_plan: "free",
      subscription_status: "free",
      purchased_credits_remaining: 0,
      cancel_at_period_end: false,
      free_trial_status: "locked",
      free_trial_credit_amount: 100,
    })
    .select(selectColumns)
    .single();

  if (createError) {
    // A parallel request may have initialized the same user between the SELECT
    // and INSERT. Re-read instead of ever overwriting an existing paid balance.
    if (String(createError.code || "") === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("user_credit_balances")
        .select(selectColumns)
        .eq("user_id", userId)
        .maybeSingle();
      if (racedError) throw racedError;
      if (raced?.user_id) return { created: false, balance: raced };
    }
    throw createError;
  }

  return { created: true, balance: created };
}

export async function POST(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = userClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const sessionId = String(
      body?.shopify_onboarding_session_id ||
      request.cookies.get("spreelo_shopify_onboarding")?.value ||
      ""
    ).trim();
    if (!sessionId) return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_SESSION_MISSING" }, { status: 401 });

    const requestedBrandId = String(body?.brand_profile_id || "").trim();
    const createNew = Boolean(body?.create_new);
    const admin = createSupabaseAdminClient();

    // Shopify must not create a second-class Spreelo account. Ensure the same
    // Free-plan/credit state that ordinary Spreelo sign-up relies on before we
    // create or link the merchant's first brand workspace.
    const accountState = await ensureStandardSpreeloAccountState(admin, user.id);

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
    // A Shopify install should only enter Spreelo's first-time social onboarding
    // when this account had no brand workspace before this install. Existing
    // Spreelo customers keep their normal flow even if they create a new brand.
    const firstBrandForUser = brandRows.length === 0;

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

    const webByBrand = new Map((webRows || []).map((row) => [String(row.brand_profile_id), row]));
    const exactBrandSelection = selectExactShopifyBrand({
      brands: brandRows,
      webConnections: webRows || [],
      shopDomain: onboarding.shop_domain,
      preferredBrandProfileId: existingConnection?.brand_profile_id || "",
    });
    const exactMatches = exactBrandSelection.matches;

    let selectedBrand = null;
    let createdBrand = false;

    if (requestedBrandId) {
      const requestedBrand = brandRows.find((brand) => brand.id === requestedBrandId) || null;
      if (!requestedBrand) return noStoreJson({ ok: false, error: "INVALID_BRAND_SELECTION" }, { status: 403 });
      const requestedWeb = webByBrand.get(String(requestedBrand.id)) || null;
      if (!brandMatchesExactShopifyShop({
        brand: requestedBrand,
        webConnection: requestedWeb,
        shopDomain: onboarding.shop_domain,
      })) {
        return noStoreJson({ ok: false, error: "SHOPIFY_BRAND_DOMAIN_MISMATCH" }, { status: 409 });
      }
      selectedBrand = requestedBrand;
    } else if (exactBrandSelection.match) {
      selectedBrand = exactBrandSelection.match;
    } else if (exactMatches.length > 1) {
      // Legacy duplicate brands may both carry the same exact myshopify identity.
      // Never guess between them; only expose exact-shop matches for explicit choice.
      return noStoreJson({
        ok: true,
        needs_brand_selection: true,
        shop: {
          domain: onboarding.shop_domain,
          name: onboarding.shop_name || "Shopify Store",
          primary_domain: onboarding.primary_domain || "",
        },
        brands: exactMatches.map(publicBrand),
        allow_create_new: false,
      });
    } else {
      // App Store installs are isolated by the immutable myshopify domain. A new
      // Shopify shop must never inherit an arbitrary existing Spreelo brand just
      // because the same user owns both. If no exact identity exists, create one.
      const websiteUrl = `https://${onboarding.shop_domain}`;
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

    const previousBrandProfileId = String(existingConnection?.brand_profile_id || "").trim();
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

    if (previousBrandProfileId && previousBrandProfileId !== selectedBrand.id) {
      await clearLegacyAppStoreWebBinding(admin, {
        userId: user.id,
        brandProfileId: previousBrandProfileId,
        shopDomain: onboarding.shop_domain,
      });
    }

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
      first_brand_for_user: firstBrandForUser,
      analysis_required: createdBrand || !selectedBrand.campaign_calendar_generated_at,
      ai_consent_required: !savedConnection?.ai_store_data_consent_at,
      account_initialized: true,
      free_trial_status: String(accountState?.balance?.free_trial_status || "locked"),
      free_trial_credit_amount: Number(accountState?.balance?.free_trial_credit_amount || 100),
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
