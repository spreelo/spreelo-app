import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { validateAdminRescueManifest } from "../../../../../lib/adminRescuePackages.js";
import { sendLifecycleEmail } from "../../../../../lib/lifecycleEmails.js";
import { resolveBestServerLocale } from "../../../../../lib/i18n/serverUiText.js";
import {
  replaceBrandCampaignOpportunities,
  saveBrandProfile,
} from "../../../analyze-brand/brandAnalysisEngine.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function approveBrandAnalysis({ admin, rescueCase, brand, manifest }) {
  const now = new Date().toISOString();
  const market = manifest.market_setup || {};
  const contentMarket = market.contentMarket || brand.content_market || "";
  const countryCode = market.countryCode || brand.country_code || "";
  const contentLanguage = market.contentLanguage || manifest.profile.detected_language || brand.content_language || "";
  const calendarYear = Number(manifest.calendar_year);

  await saveBrandProfile({
    supabase: admin,
    userId: rescueCase.user_id,
    brandProfileId: rescueCase.brand_profile_id,
    websiteUrl: manifest.website_url || brand.website_url || "",
    brandDescription: brand.brand_description || "",
    profile: manifest.profile,
    contentMarket,
    countryCode,
    contentLanguage,
    campaignCalendarYear: calendarYear,
    websiteProductMode: manifest.website_product_mode,
    websiteServiceMode: manifest.website_service_mode,
    websiteAccessStatus: "manual_rescue",
    websiteAccessMessage: "Website analysis was completed through Spreelo Admin Rescue using verified public sources.",
  });

  const campaigns = await replaceBrandCampaignOpportunities({
    supabase: admin,
    userId: rescueCase.user_id,
    brandProfileId: rescueCase.brand_profile_id,
    contentMarket,
    countryCode,
    contentLanguage,
    industry: manifest.profile.industry,
    campaignCalendarYear: calendarYear,
    opportunities: manifest.campaign_opportunities,
  });

  const { error: profileUpdateError } = await admin
    .from("brand_profiles")
    .update({
      calendar_generation_mode: "manual_rescue",
      analysis_rescue_required: false,
      last_manual_analysis_rescue_at: now,
      website_access_status: "manual_rescue",
      website_access_status_code: null,
      website_access_message: "Website analysis was completed through Spreelo Admin Rescue using verified public sources.",
      updated_at: now,
    })
    .eq("id", rescueCase.brand_profile_id)
    .eq("user_id", rescueCase.user_id);
  if (profileUpdateError) throw profileUpdateError;

  return {
    campaignCount: campaigns.length,
    calendarYear,
    brandName: manifest.profile.business_name || brand.business_name || "Spreelo",
    locale: resolveBestServerLocale({ languageCandidates: [contentLanguage] }),
  };
}

async function approveAnnualCalendar({ admin, rescueCase, brand, manifest }) {
  const now = new Date().toISOString();
  const targetYear = Number(rescueCase.target_year);
  const campaigns = await replaceBrandCampaignOpportunities({
    supabase: admin,
    userId: rescueCase.user_id,
    brandProfileId: rescueCase.brand_profile_id,
    contentMarket: brand.content_market || manifest.market_setup?.contentMarket || "",
    countryCode: brand.country_code || manifest.market_setup?.countryCode || "",
    contentLanguage: brand.content_language || manifest.market_setup?.contentLanguage || "",
    industry: brand.industry || manifest.profile?.industry || "",
    campaignCalendarYear: targetYear,
    opportunities: manifest.campaign_opportunities,
  });

  const { error: brandUpdateError } = await admin
    .from("brand_profiles")
    .update({
      campaign_calendar_year: targetYear,
      campaign_calendar_generated_at: now,
      campaign_calendar_refreshed_at: now,
      calendar_generation_mode: "manual_rescue",
      last_manual_calendar_rescue_at: now,
      updated_at: now,
    })
    .eq("id", rescueCase.brand_profile_id)
    .eq("user_id", rescueCase.user_id);
  if (brandUpdateError) throw brandUpdateError;

  const { error: renewalError } = await admin.from("brand_calendar_renewals").upsert({
    user_id: rescueCase.user_id,
    brand_profile_id: rescueCase.brand_profile_id,
    target_year: targetYear,
    mode: "manual_rescue",
    status: "completed",
    campaign_count: campaigns.length,
    last_error: null,
    completed_at: now,
    updated_at: now,
  }, { onConflict: "brand_profile_id,target_year" });
  if (renewalError) throw renewalError;

  return {
    campaignCount: campaigns.length,
    calendarYear: targetYear,
    brandName: brand.business_name || manifest.profile?.business_name || "Spreelo",
    locale: resolveBestServerLocale({ languageCandidates: [brand.content_language, manifest.market_setup?.contentLanguage] }),
  };
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const body = await request.json().catch(() => ({}));
    const caseId = String(body?.caseId || "").trim();
    if (!caseId) return Response.json({ ok: false, error: "caseId is required." }, { status: 400 });

    const { data: rescueCase, error: caseError } = await context.admin
      .from("admin_rescue_cases")
      .select("id,case_type,user_id,brand_profile_id,source_job_id,target_year,status,error_code,error_message,imported_manifest,imported_at")
      .eq("id", caseId)
      .maybeSingle();
    if (caseError) throw caseError;
    if (!rescueCase) return Response.json({ ok: false, error: "Rescue case was not found." }, { status: 404 });
    if (rescueCase.status === "completed") return Response.json({ ok: true, alreadyCompleted: true });
    if (rescueCase.status !== "imported" || !rescueCase.imported_manifest || !Object.keys(rescueCase.imported_manifest).length) {
      return Response.json({ ok: false, error: "Import a rescue package and review the preview before approval." }, { status: 409 });
    }

    const { data: brand, error: brandError } = await context.admin
      .from("brand_profiles")
      .select("id,user_id,business_name,website_url,brand_description,industry,target_audience,content_market,country_code,content_language,campaign_calendar_year,calendar_generation_mode,analysis_rescue_required,website_product_mode_available,website_product_mode_reason,website_product_source_url,website_service_mode_available,website_service_mode_reason,website_service_source_url")
      .eq("id", rescueCase.brand_profile_id)
      .eq("user_id", rescueCase.user_id)
      .maybeSingle();
    if (brandError) throw brandError;
    if (!brand) return Response.json({ ok: false, error: "Brand was not found." }, { status: 404 });

    const manifest = validateAdminRescueManifest({
      manifest: rescueCase.imported_manifest,
      rescueCase,
      brand,
    });

    const result = rescueCase.case_type === "annual_calendar"
      ? await approveAnnualCalendar({ admin: context.admin, rescueCase, brand, manifest })
      : await approveBrandAnalysis({ admin: context.admin, rescueCase, brand, manifest });

    const now = new Date().toISOString();
    const { error: caseUpdateError } = await context.admin
      .from("admin_rescue_cases")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", rescueCase.id);
    if (caseUpdateError) throw caseUpdateError;

    let email = { sent: false, skipped: false };
    try {
      if (rescueCase.case_type === "annual_calendar") {
        email = await sendLifecycleEmail({
          supabaseAdmin: context.admin,
          userId: rescueCase.user_id,
          emailType: "calendar_updated",
          entityKey: `${rescueCase.brand_profile_id}:${result.calendarYear}`,
          locale: result.locale,
          brandName: result.brandName,
          campaignCount: result.campaignCount,
          calendarYear: result.calendarYear,
          destinationPath: "/calendar",
        });
      } else {
        email = await sendLifecycleEmail({
          supabaseAdmin: context.admin,
          userId: rescueCase.user_id,
          emailType: "analysis_completed",
          entityKey: `manual-rescue:${rescueCase.id}`,
          locale: result.locale,
          brandName: result.brandName,
          campaignCount: result.campaignCount,
          destinationPath: `/onboarding/ready?brandId=${encodeURIComponent(rescueCase.brand_profile_id)}`,
        });
      }
    } catch (emailError) {
      // The actual rescue is complete. Lifecycle email failures are retriable
      // and must never roll back a valid analysis/calendar.
      email = { sent: false, error: String(emailError?.message || "Email delivery failed") };
      console.error("Manual rescue completion email failed", {
        caseId: rescueCase.id,
        caseType: rescueCase.case_type,
        message: email.error,
      });
    }

    return Response.json({
      ok: true,
      caseId: rescueCase.id,
      status: "completed",
      campaignCount: result.campaignCount,
      calendarYear: result.calendarYear,
      email,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not approve rescue package." }, { status: 500 });
  }
}
