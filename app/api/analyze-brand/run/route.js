import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const authorizationHeader = request.headers.get("authorization") || "";

  if (!authorizationHeader.startsWith("Bearer ")) {
    return {
      supabase: null,
      user: null,
      error: "Unauthorized.",
    };
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
    return {
      supabase,
      user: null,
      error: "Unauthorized.",
    };
  }

  return {
    supabase,
    user,
    error: "",
  };
}

async function updateJob({
  supabase,
  userId,
  jobId,
  status,
  step,
  progress,
  result,
  errorMessage,
  internalError,
  startedAt,
  completedAt,
  failedAt,
}) {
  const updatePayload = {
    updated_at: new Date().toISOString(),
  };

  if (status !== undefined) {
    updatePayload.status = status;
  }

  if (step !== undefined) {
    updatePayload.step = step;
  }

  if (progress !== undefined) {
    updatePayload.progress = progress;
  }

  if (result !== undefined) {
    updatePayload.result = result;
  }

  if (errorMessage !== undefined) {
    updatePayload.error_message = errorMessage;
  }

  if (internalError !== undefined) {
    updatePayload.internal_error = internalError;
  }

  if (startedAt !== undefined) {
    updatePayload.started_at = startedAt;
  }

  if (completedAt !== undefined) {
    updatePayload.completed_at = completedAt;
  }

  if (failedAt !== undefined) {
    updatePayload.failed_at = failedAt;
  }

  const { data, error } = await supabase
    .from("brand_analysis_jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select(
      [
        "id",
        "brand_profile_id",
        "status",
        "step",
        "progress",
        "website_url",
        "brand_description",
        "business_name",
        "content_market",
        "country_code",
        "content_language",
        "result",
        "error_message",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
        "failed_at",
      ].join(", ")
    )
    .single();

  if (error) {
    throw new Error(error.message || "Could not update analysis job.");
  }

  return data;
}

async function readJob({ supabase, userId, jobId }) {
  const { data: job, error } = await supabase
    .from("brand_analysis_jobs")
    .select(
      [
        "id",
        "user_id",
        "brand_profile_id",
        "status",
        "step",
        "progress",
        "website_url",
        "brand_description",
        "business_name",
        "content_market",
        "country_code",
        "content_language",
        "result",
        "error_message",
        "internal_error",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
        "failed_at",
      ].join(", ")
    )
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not read analysis job.");
  }

  return job;
}

async function verifyBrandOwnership({ supabase, userId, brandProfileId }) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("id, business_name")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not verify brand profile.");
  }

  if (!data?.id) {
    throw new Error("Brand profile not found.");
  }

  return data;
}

function getCustomerFriendlyError(error) {
  const message = String(error?.message || "");

  if (
    message.includes("FUNCTION_INVOCATION_TIMEOUT") ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("aborted")
  ) {
    return "Spreelo could not finish the website analysis in time. Please try again. If it still takes too long, add a short business description instead.";
  }

  if (
    message.toLowerCase().includes("json") ||
    message.toLowerCase().includes("parse") ||
    message.toLowerCase().includes("openai response") ||
    message.toLowerCase().includes("analysis result")
  ) {
    return "Spreelo could not read the analysis result correctly. Please try again.";
  }

  if (
    message.toLowerCase().includes("website returned") ||
    message.toLowerCase().includes("website did not return html") ||
    message.toLowerCase().includes("fetch failed") ||
    message.toLowerCase().includes("website url")
  ) {
    return "Spreelo could not read this website right now. Please check the website URL or add a short business description instead.";
  }

  return (
    message ||
    "Spreelo could not finish the brand analysis right now. Please try again."
  );
}

export async function POST(request) {
  let supabase = null;
  let user = null;
  let jobId = "";

  try {
    const authResult = await getAuthenticatedUser(request);

    supabase = authResult.supabase;
    user = authResult.user;

    if (authResult.error || !supabase || !user) {
      return Response.json(
        {
          ok: false,
          error: authResult.error || "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    jobId = String(body?.jobId || body?.job_id || "").trim();

    if (!jobId) {
      return Response.json(
        {
          ok: false,
          error: "Missing analysis job.",
        },
        { status: 400 }
      );
    }

    const job = await readJob({
      supabase,
      userId: user.id,
      jobId,
    });

    if (!job?.id) {
      return Response.json(
        {
          ok: false,
          error: "Analysis job not found.",
        },
        { status: 404 }
      );
    }

    if (job.status === "completed") {
      return Response.json({
        ok: true,
        job,
        message: "Brand analysis job is already completed.",
      });
    }

    if (job.status === "running") {
      return Response.json({
        ok: true,
        job,
        message: "Brand analysis job is already running.",
      });
    }

    await verifyBrandOwnership({
      supabase,
      userId: user.id,
      brandProfileId: job.brand_profile_id,
    });

    const startedJob = await updateJob({
      supabase,
      userId: user.id,
      jobId,
      status: "running",
      step: "starting",
      progress: 5,
      errorMessage: "",
      internalError: "",
      startedAt: new Date().toISOString(),
    });

    /*
      Nästa del, 3D-2:
      Här ska vi koppla in den riktiga analysmotorn.

      Flödet ska bli:
      - reading_website / 15
      - detecting_language / 25
      - finding_products / 40
      - creating_profile / 65
      - creating_campaigns / 85
      - saving / 95
      - completed / 100

      Vi lägger inte in själva analysen här ännu, för då hade vi behövt
      kopiera hela gamla app/api/analyze-brand/route.js. Det ska vi undvika.
    */

    const waitingJob = await updateJob({
      supabase,
      userId: user.id,
      jobId,
      status: "pending",
      step: "waiting_for_analysis_engine",
      progress: 10,
      result: {
        message:
          "Analysis job was started. The analysis engine will be connected in the next implementation step.",
      },
    });

    return Response.json({
      ok: true,
      job: waitingJob,
      message: "Brand analysis job runner is ready.",
    });
  } catch (error) {
    console.error("Run brand analysis failed:", {
      jobId,
      message: error?.message,
      stack: error?.stack,
    });

    const customerError = getCustomerFriendlyError(error);

    if (supabase && user && jobId) {
      try {
        await updateJob({
          supabase,
          userId: user.id,
          jobId,
          status: "failed",
          step: "failed",
          progress: 100,
          errorMessage: customerError,
          internalError: String(error?.message || "Unknown error").slice(
            0,
            2000
          ),
          failedAt: new Date().toISOString(),
        });
      } catch (updateError) {
        console.error("Could not mark analysis job as failed:", {
          jobId,
          message: updateError?.message,
        });
      }
    }

    return Response.json(
      {
        ok: false,
        error: customerError,
      },
      { status: 500 }
    );
  }
}
