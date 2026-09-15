import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { runBrandAnalysisJob } from "../../analyze-brand/brandAnalysisEngine.js";
import {
  BRAND_ANALYSIS_JOB_SELECT,
  getCustomerFriendlyAnalysisError,
  updateBrandAnalysisJob,
} from "../../analyze-brand/jobHelpers.js";
import { sendLifecycleEmail } from "../../../../lib/lifecycleEmails.js";
import { isBrand429RescueActive } from "../../../../lib/brandWebsiteRescue.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Longer than Vercel's 300-second invocation limit so a replacement worker
// never overlaps a still-running invocation. A timed-out lease is reclaimed.
const WORKER_LEASE_SECONDS = 330;
const MAX_ANALYSIS_ATTEMPTS = 5;
const MAX_DIRECT_TIMEOUT_ATTEMPTS = 2;
const DIRECT_TIMEOUT_RETRY_SECONDS = 15;

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  return Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service-role configuration.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function nextAttemptIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function syncAnnualRenewalCompleted({ supabase, job }) {
  if (job?.analysis_kind !== "annual_calendar_refresh") return;
  const targetYear = Number(job.target_calendar_year || job?.result?.profile?.campaign_calendar_year || 0);
  if (!targetYear) return;
  const { error } = await supabase.from("brand_calendar_renewals").upsert({
    user_id: job.user_id,
    brand_profile_id: job.brand_profile_id,
    target_year: targetYear,
    mode: "automatic",
    status: "completed",
    analysis_job_id: job.id,
    campaign_count: Number(job?.result?.campaign_opportunities_count || 0),
    last_error: null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "brand_profile_id,target_year" });
  if (error) throw error;
}

async function sendCompletionEmail({ supabase, job }) {
  if (!job?.id || !job?.user_id || job.analysis_completed_email_sent_at) return;

  const isAnnualRefresh = job.analysis_kind === "annual_calendar_refresh";
  const targetYear = Number(job.target_calendar_year || new Date().getUTCFullYear());

  try {
    if (isAnnualRefresh) {
      await syncAnnualRenewalCompleted({ supabase, job });
      await sendLifecycleEmail({
        supabaseAdmin: supabase,
        userId: job.user_id,
        emailType: "calendar_updated",
        entityKey: `${job.brand_profile_id}:${targetYear}`,
        locale: job.notification_locale || "en",
        brandName:
          job?.result?.profile?.business_name || job.business_name || "Spreelo",
        campaignCount: Number(job?.result?.campaign_opportunities_count || 0),
        calendarYear: targetYear,
        destinationPath: "/calendar",
      });
    } else {
      await sendLifecycleEmail({
        supabaseAdmin: supabase,
        userId: job.user_id,
        emailType: "analysis_completed",
        entityKey: job.id,
        locale: job.notification_locale || "en",
        brandName:
          job?.result?.profile?.business_name || job.business_name || "Spreelo",
        campaignCount: Number(job?.result?.campaign_opportunities_count || 0),
        destinationPath: `/onboarding/ready?brandId=${encodeURIComponent(
          job.brand_profile_id
        )}`,
      });
    }

    await supabase
      .from("brand_analysis_jobs")
      .update({
        analysis_completed_email_sent_at: new Date().toISOString(),
        analysis_completed_email_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .is("analysis_completed_email_sent_at", null);
  } catch (error) {
    console.error(isAnnualRefresh ? "Calendar update email failed" : "Brand analysis completion email failed", {
      jobId: job.id,
      message: error?.message,
    });
    await supabase
      .from("brand_analysis_jobs")
      .update({
        analysis_completed_email_error: String(
          error?.message || "Email delivery failed"
        ).slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

async function createManualRescueCaseForFailedJob({ supabase, job, error, customerError }) {
  const isAnnualRefresh = job.analysis_kind === "annual_calendar_refresh";
  const targetYear = isAnnualRefresh
    ? Number(job.target_calendar_year || new Date().getUTCFullYear() + 1)
    : 0;
  const now = new Date().toISOString();

  const { data: existingCase, error: existingCaseError } = await supabase
    .from("admin_rescue_cases")
    .select("id,status")
    .eq("brand_profile_id", job.brand_profile_id)
    .eq("case_type", isAnnualRefresh ? "annual_calendar" : "brand_analysis")
    .eq("target_year", targetYear)
    .maybeSingle();
  if (existingCaseError) throw existingCaseError;

  if (!existingCase) {
    const { error: rescueCaseError } = await supabase.from("admin_rescue_cases").insert({
      case_type: isAnnualRefresh ? "annual_calendar" : "brand_analysis",
      user_id: job.user_id,
      brand_profile_id: job.brand_profile_id,
      source_job_id: job.id,
      target_year: targetYear,
      status: "needed",
      error_code: String(error?.code || "analysis_failed").slice(0, 160),
      error_message: String(customerError || error?.message || "Analysis failed").slice(0, 4000),
      source_context: {
        website_url: job.website_url || "",
        business_name: job.business_name || "",
        content_market: job.content_market || "",
        country_code: job.country_code || "",
        content_language: job.content_language || "",
        analysis_kind: job.analysis_kind || "brand_analysis",
        target_calendar_year: targetYear || null,
      },
      updated_at: now,
    });
    if (rescueCaseError) throw rescueCaseError;
  }

  if (isAnnualRefresh) {
    const protectedStatus = existingCase?.status === "imported"
      ? "rescue_imported"
      : existingCase?.status === "completed"
        ? "completed"
        : "rescue_needed";
    const { error: renewalError } = await supabase.from("brand_calendar_renewals").upsert({
      user_id: job.user_id,
      brand_profile_id: job.brand_profile_id,
      target_year: targetYear,
      mode: "manual_rescue",
      status: protectedStatus,
      analysis_job_id: job.id,
      last_error: String(customerError || error?.message || "Annual calendar refresh failed").slice(0, 4000),
      updated_at: now,
    }, { onConflict: "brand_profile_id,target_year" });
    if (renewalError) throw renewalError;
  } else {
    const { error: profileError } = await supabase.from("brand_profiles").update({
      analysis_rescue_required: true,
      updated_at: now,
    }).eq("id", job.brand_profile_id).eq("user_id", job.user_id);
    if (profileError) throw profileError;
  }
}

async function retryOneCompletionEmail(supabase) {
  const { data: jobs, error } = await supabase
    .from("brand_analysis_jobs")
    .select(BRAND_ANALYSIS_JOB_SELECT)
    .eq("status", "completed")
    .is("analysis_completed_email_sent_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  if (jobs?.[0]) await sendCompletionEmail({ supabase, job: jobs[0] });
}

async function releaseJob({ supabase, job, updates }) {
  return updateBrandAnalysisJob({
    supabase,
    userId: job.user_id,
    jobId: job.id,
    expectedLeaseToken: job.lease_token,
    leaseToken: null,
    leaseExpiresAt: null,
    workerName: null,
    lastHeartbeatAt: new Date().toISOString(),
    ...updates,
  });
}

function isWebsiteSecurityBlocked(error) {
  return String(error?.code || "") === "WEBSITE_SECURITY_BLOCKED";
}

function isWebsiteFetchTimeout(error) {
  return String(error?.code || "") === "WEBSITE_FETCH_TIMEOUT";
}

async function saveWebsiteAccessState({ supabase, job, error, manualRescue = false }) {
  const { data: existingWebsiteAccess } = await supabase
    .from("brand_profiles")
    .select("website_access_status")
    .eq("id", job.brand_profile_id)
    .eq("user_id", job.user_id)
    .maybeSingle();
  const preserve429Rescue = isBrand429RescueActive(existingWebsiteAccess);
  const timedOut = isWebsiteFetchTimeout(error);
  const providerLabel = String(error?.providerLabel || "website security");
  const message = manualRescue
    ? timedOut
      ? "Spreelo could not reliably read the website after a short retry. The brand analysis and campaign calendar will be completed through manual rescue."
      : `${providerLabel} blocked Spreelo's automatic website analysis. The brand analysis and campaign calendar will be completed through manual rescue.`
    : "Spreelo's direct website connection timed out. One short automatic retry will be made before the analysis is handed to manual rescue.";

  const profileUpdates = {
    ...(preserve429Rescue
      ? {}
      : {
          website_access_status: timedOut ? "direct_fetch_timeout" : "security_blocked",
          website_security_provider: timedOut ? "unknown" : error?.provider || "unknown",
          website_security_confidence: timedOut ? "low" : error?.confidence || "low",
          website_access_status_code: timedOut ? 408 : Number(error?.status || 403),
          website_access_message: message,
          website_access_checked_at: new Date().toISOString(),
        }),
    updated_at: new Date().toISOString(),
  };
  if (manualRescue && job.analysis_kind !== "annual_calendar_refresh") {
    profileUpdates.analysis_rescue_required = true;
  }

  await supabase
    .from("brand_profiles")
    .update(profileUpdates)
    .eq("id", job.brand_profile_id)
    .eq("user_id", job.user_id);

  return message;
}

async function handoffToManualRescue({ supabase, job, error }) {
  const customerError = isWebsiteSecurityBlocked(error)
    ? "Spreelo could not read this website automatically because its security protection blocked the analysis connection."
    : isWebsiteFetchTimeout(error)
      ? "Spreelo could not read this website reliably after a short automatic retry."
      : getCustomerFriendlyAnalysisError(error);

  await saveWebsiteAccessState({
    supabase,
    job,
    error,
    manualRescue: true,
  }).catch((stateError) => {
    console.error("Could not persist website access state before analysis rescue", {
      jobId: job.id,
      message: stateError?.message,
    });
  });

  const rescueMessageCode = isWebsiteSecurityBlocked(error)
    ? "analysis_manual_rescue_security"
    : isWebsiteFetchTimeout(error)
      ? "analysis_manual_rescue_timeout"
      : "analysis_manual_rescue_pending";

  await releaseJob({
    supabase,
    job,
    updates: {
      status: "failed",
      step: "manual_rescue_pending",
      progress: 100,
      errorMessage: customerError,
      internalError: String(error?.message || "Unknown error").slice(0, 2000),
      failedAt: new Date().toISOString(),
      userMessageCode: rescueMessageCode,
      userMessage:
        "Automatic analysis stopped. Spreelo will complete the brand analysis and personal campaign calendar manually and email the customer when everything is ready.",
      // Keep the existing non-null next_attempt_at value. The durable queue schema
      // defines next_attempt_at as NOT NULL; status="failed" already makes this job
      // ineligible for future claims, so clearing the timestamp is unnecessary.
      openaiResponseId: null,
      webResearchEvidence: "",
      webResearchSources: [],
    },
  });

  await createManualRescueCaseForFailedJob({
    supabase,
    job,
    error,
    customerError,
  });

  console.warn("Brand analysis handed directly to manual rescue", {
    jobId: job.id,
    brandProfileId: job.brand_profile_id,
    code: error?.code || "analysis_failed",
    websiteUrl: job.website_url || "",
  });

  return {
    rescued: true,
    jobId: job.id,
    reason: isWebsiteSecurityBlocked(error)
      ? "website_security_manual_rescue"
      : isWebsiteFetchTimeout(error)
        ? "website_timeout_manual_rescue"
        : "analysis_manual_rescue",
  };
}

async function scheduleOneDirectTimeoutRetry({ supabase, job, error }) {
  await saveWebsiteAccessState({
    supabase,
    job,
    error,
    manualRescue: false,
  }).catch((stateError) => {
    console.error("Could not persist website timeout state", {
      jobId: job.id,
      message: stateError?.message,
    });
  });

  await releaseJob({
    supabase,
    job,
    updates: {
      status: "pending",
      step: "retry_waiting",
      progress: Math.max(10, Math.min(35, Number(job.progress || 10))),
      errorMessage: "",
      internalError: String(error?.message || "Website fetch timeout").slice(0, 2000),
      userMessageCode: "website_timeout_retry",
      userMessage:
        "The website connection timed out. Spreelo will make one short automatic retry before handing the analysis to manual rescue.",
      nextAttemptAt: nextAttemptIso(DIRECT_TIMEOUT_RETRY_SECONDS),
    },
  });

  return {
    deferred: true,
    reason: "website_timeout_retry",
    attemptCount: Number(job.attempt_count || 1),
  };
}

async function convertLegacyWebResearchJobToRescue({ supabase, job }) {
  const error = new Error(
    "Legacy blocked-website web research was stopped by v144.112 fail-fast rescue policy."
  );
  error.code = job.user_message_code === "website_direct_access_background_research"
    ? "WEBSITE_FETCH_TIMEOUT"
    : "WEBSITE_SECURITY_BLOCKED";
  return handoffToManualRescue({ supabase, job, error });
}

async function processClaimedJob({ supabase, job }) {
  let analysisJob = job;

  const updateJob = (updates) =>
    updateBrandAnalysisJob({
      supabase,
      userId: job.user_id,
      jobId: job.id,
      expectedLeaseToken: job.lease_token,
      lastHeartbeatAt: new Date().toISOString(),
      ...updates,
    });

  if (job.analysis_kind === "annual_calendar_refresh" && job.target_calendar_year) {
    const { error: renewalRunningError } = await supabase.from("brand_calendar_renewals").upsert({
      user_id: job.user_id,
      brand_profile_id: job.brand_profile_id,
      target_year: Number(job.target_calendar_year),
      mode: "automatic",
      status: "running",
      analysis_job_id: job.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_profile_id,target_year" });
    if (renewalRunningError) {
      console.error("Could not mark annual calendar renewal as running", { jobId: job.id, message: renewalRunningError.message });
    }
  }

  try {
    if (job.step === "web_research_waiting") {
      return convertLegacyWebResearchJobToRescue({ supabase, job });
    }

    const completedJob = await runBrandAnalysisJob({
      supabase,
      userId: job.user_id,
      job: analysisJob,
      updateJob,
    });
    await sendCompletionEmail({ supabase, job: completedJob });
    return { completed: true, jobId: job.id };
  } catch (error) {
    if (isWebsiteSecurityBlocked(error) && job.website_url) {
      // v144.112: a confirmed security block is terminal for automatic analysis.
      // Do not spend money on hosted web research or keep the customer waiting.
      return handoffToManualRescue({ supabase, job, error });
    }

    if (isWebsiteFetchTimeout(error) && job.website_url) {
      const attemptCount = Number(job.attempt_count || 1);
      if (attemptCount < MAX_DIRECT_TIMEOUT_ATTEMPTS) {
        return scheduleOneDirectTimeoutRetry({ supabase, job, error });
      }

      return handoffToManualRescue({ supabase, job, error });
    }

    const customerError = getCustomerFriendlyAnalysisError(error);
    const attemptCount = Number(job.attempt_count || 1);
    const canRetry = attemptCount < MAX_ANALYSIS_ATTEMPTS;

    if (canRetry) {
      await releaseJob({
        supabase,
        job,
        updates: {
          status: "pending",
          step: "retry_waiting",
          progress: Math.max(8, Math.min(88, Number(job.progress || 8))),
          errorMessage: "",
          internalError: String(error?.message || "Unknown error").slice(0, 2000),
          userMessageCode: "analysis_unusually_long",
          userMessage:
            "The analysis is taking unusually long. It is continuing securely in the background and Spreelo will email you when it is ready.",
          nextAttemptAt: nextAttemptIso(Math.min(180, 30 * attemptCount)),
        },
      });
      return { deferred: true, reason: "retry_scheduled", attemptCount };
    }

    await releaseJob({
      supabase,
      job,
      updates: {
        status: "failed",
        step: "failed",
        progress: 100,
        errorMessage: customerError,
        internalError: String(error?.message || "Unknown error").slice(0, 2000),
        failedAt: new Date().toISOString(),
        userMessageCode: "analysis_failed",
      },
    });
    await createManualRescueCaseForFailedJob({ supabase, job, error, customerError });
    throw error;
  }
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const workerName = `brand-analysis-${crypto.randomUUID().slice(0, 8)}`;

  try {
    const supabase = createAdminClient();
    await retryOneCompletionEmail(supabase).catch((error) => {
      console.error("Could not retry an analysis completion email", {
        message: error?.message,
      });
    });

    const { data: claimedJobs, error: claimError } = await supabase.rpc(
      "claim_brand_analysis_job",
      {
        p_worker_name: workerName,
        p_lease_seconds: WORKER_LEASE_SECONDS,
      }
    );

    if (claimError) throw claimError;
    const job = Array.isArray(claimedJobs) ? claimedJobs[0] : claimedJobs;

    if (!job?.id) {
      return Response.json({ ok: true, workerName, claimed: 0 });
    }

    console.info("Durable brand analysis job claimed", {
      workerName,
      jobId: job.id,
      attemptCount: job.attempt_count,
      step: job.step,
    });

    const result = await processClaimedJob({ supabase, job });
    return Response.json({ ok: true, workerName, claimed: 1, result });
  } catch (error) {
    console.error("Durable brand analysis worker failed", {
      workerName,
      message: error?.message,
      stack: error?.stack,
    });
    return Response.json(
      { ok: false, workerName, error: error?.message || "Analysis worker failed." },
      { status: 500 }
    );
  }
}
