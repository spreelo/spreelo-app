import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

function inferMarketSetup({
  contentMarket,
  countryCode,
  contentLanguage,
}) {
  const providedMarket = String(contentMarket || "").trim();
  const providedCountryCode = String(countryCode || "").trim().toUpperCase();
  const providedLanguage = String(contentLanguage || "").trim();

  return {
    contentMarket: providedMarket,
    countryCode: providedCountryCode,
    contentLanguage: providedLanguage,
  };
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

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        },
        { status: 500 }
      );
    }

    const authorizationHeader = request.headers.get("authorization") || "";

    if (!authorizationHeader.startsWith("Bearer ")) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized.",
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
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const brandProfileId = String(body?.brandProfileId || "").trim();
    const businessName = String(body?.businessName || "").trim();
    const websiteUrl = normalizeWebsiteUrl(body?.websiteUrl);
    const brandDescription = String(body?.brandDescription || "").trim();

    const requestedMarketSetup = inferMarketSetup({
      contentMarket: body?.contentMarket,
      countryCode: body?.countryCode,
      contentLanguage: body?.contentLanguage,
    });

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

    const { data: job, error: insertError } = await supabase
      .from("brand_analysis_jobs")
      .insert({
        user_id: user.id,
        brand_profile_id: brandProfileId,

        status: "pending",
        step: "queued",
        progress: 0,

        website_url: websiteUrl || "",
        brand_description: brandDescription || "",
        business_name: businessName || "",

        content_market: requestedMarketSetup.contentMarket || "",
        country_code: requestedMarketSetup.countryCode || "",
        content_language: requestedMarketSetup.contentLanguage || "",

        result: {},
        error_message: "",
        internal_error: "",
      })
      .select(
        "id, status, step, progress, website_url, brand_description, business_name, content_market, country_code, content_language, created_at, updated_at"
      )
      .single();

    if (insertError) {
      throw new Error(insertError.message || "Could not start analysis.");
    }

    return Response.json({
      ok: true,
      job,
      job_id: job.id,
      message: "Brand analysis job started.",
    });
  } catch (error) {
    console.error("Start brand analysis failed:", {
      message: error?.message,
      stack: error?.stack,
    });

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Spreelo could not start the brand analysis right now.",
      },
      { status: 500 }
    );
  }
}
