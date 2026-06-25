import { createClient } from "@supabase/supabase-js";
import {
  getCustomerFriendlyAnalysisError,
  readBrandAnalysisJob,
  updateBrandAnalysisJob,
  verifyBrandAnalysisOwnership,
} from "../jobHelpers";

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

    const job = await readBrandAnalysisJob({
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

    await verifyBrandAnalysisOwnership({
      supabase,
      userId: user.id,
      brandProfileId: job.brand_profile_id,
    });

    await updateBrandAnalysisJob({
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
      Nästa del:
      Här kopplar vi in den riktiga analysmotorn.

      Planerat flöde:
      - reading_website / 15
      - detecting_language / 25
      - finding_products / 40
      - creating_profile / 65
      - creating_campaigns / 85
      - saving / 95
      - completed / 100

      Just nu är denna route förberedd för job/status-flödet.
      Själva analysmotorn kopplas in i nästa steg via brandAnalysisEngine.js.
    */

    const waitingJob = await updateBrandAnalysisJob({
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

    const customerError = getCustomerFriendlyAnalysisError(error);

    if (supabase && user && jobId) {
      try {
        await updateBrandAnalysisJob({
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
