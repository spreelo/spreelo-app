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

export async function GET(request) {
  try {
    const { supabase, user, error: authError } =
      await getAuthenticatedUser(request);

    if (authError || !supabase || !user) {
      return Response.json(
        {
          ok: false,
          error: authError || "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = String(searchParams.get("jobId") || "").trim();

    if (!jobId) {
      return Response.json(
        {
          ok: false,
          error: "Missing analysis job.",
        },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("brand_analysis_jobs")
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
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (jobError) {
      throw new Error(jobError.message || "Could not read analysis status.");
    }

    if (!job?.id) {
      return Response.json(
        {
          ok: false,
          error: "Analysis job not found.",
        },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      job,
    });
  } catch (error) {
    console.error("Read brand analysis status failed:", {
      message: error?.message,
      stack: error?.stack,
    });

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Spreelo could not read the brand analysis status right now.",
      },
      { status: 500 }
    );
  }
}
