import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.replace("Bearer ", "").trim();
}

async function getAuthenticatedUser({ supabaseAdmin, request }) {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

function sanitizePagesForClient(pages) {
  return (pages || []).map((page) => ({
    id: page.id,
    name: page.name || "Facebook Page",
    tasks: page.tasks || [],
  }));
}

async function getSelectionSession({ supabaseAdmin, sessionId, userId }) {
  const { data, error } = await supabaseAdmin
    .from("meta_page_selection_sessions")
    .select("id, user_id, brand_profile_id, pages, expires_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const isExpired = new Date(data.expires_at).getTime() < Date.now();

  if (isExpired) {
    return null;
  }

  return data;
}

async function getBrandForSession({ supabaseAdmin, userId, brandProfileId }) {
  if (!brandProfileId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id, business_name")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function saveFacebookConnection({
  supabaseAdmin,
  userId,
  brandProfileId,
  page,
}) {
  if (!brandProfileId) {
    throw new Error("Missing brand_profile_id for Facebook connection");
  }

  const nowIso = new Date().toISOString();

  const connectionPayload = {
    user_id: userId,
    brand_profile_id: brandProfileId,
    platform: "facebook",
    page_id: page.id,
    page_name: page.name || "Facebook Page",
    page_access_token: page.access_token,
    permissions: page.tasks || [],
    status: "connected",
    updated_at: nowIso,
  };

  /*
    One connected Facebook Page per brand.

    If this brand already has a Facebook connection, update that row.
    This prevents one brand from accidentally ending up with several active
    Facebook pages.
  */
  const { data: existingBrandConnection, error: existingBrandError } =
    await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("brand_profile_id", brandProfileId)
      .eq("platform", "facebook")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingBrandError) {
    throw existingBrandError;
  }

  if (existingBrandConnection?.id) {
    const { error: updateError } = await supabaseAdmin
      .from("social_connections")
      .update(connectionPayload)
      .eq("id", existingBrandConnection.id)
      .eq("user_id", userId)
      .eq("brand_profile_id", brandProfileId);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  /*
    If the same Facebook Page was previously connected to the same user but
    without brand_profile_id, or to an old wrong brand during earlier testing,
    do not reuse that row blindly. Create/update only for the selected brand.
  */
  const { error: insertError } = await supabaseAdmin
    .from("social_connections")
    .insert({
      ...connectionPayload,
      created_at: nowIso,
    });

  if (insertError) {
    throw insertError;
  }
}

export async function GET(request) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const user = await getAuthenticatedUser({ supabaseAdmin, request });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 }
      );
    }

    const selectionSession = await getSelectionSession({
      supabaseAdmin,
      sessionId,
      userId: user.id,
    });

    if (!selectionSession) {
      return NextResponse.json(
        { error: "Selection session not found or expired" },
        { status: 404 }
      );
    }

    if (!selectionSession.brand_profile_id) {
      return NextResponse.json(
        { error: "Selection session is missing brand_profile_id" },
        { status: 400 }
      );
    }

    const brand = await getBrandForSession({
      supabaseAdmin,
      userId: user.id,
      brandProfileId: selectionSession.brand_profile_id,
    });

    if (!brand) {
      return NextResponse.json(
        { error: "Selected brand not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pages: sanitizePagesForClient(selectionSession.pages),
      brand,
    });
  } catch (error) {
    console.error("Meta page selection GET error:", error);

    return NextResponse.json(
      { error: "Could not load Facebook pages" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const user = await getAuthenticatedUser({ supabaseAdmin, request });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const sessionId = body?.session_id;
    const pageId = body?.page_id;

    if (!sessionId || !pageId) {
      return NextResponse.json(
        { error: "Missing session_id or page_id" },
        { status: 400 }
      );
    }

    const selectionSession = await getSelectionSession({
      supabaseAdmin,
      sessionId,
      userId: user.id,
    });

    if (!selectionSession) {
      return NextResponse.json(
        { error: "Selection session not found or expired" },
        { status: 404 }
      );
    }

    if (!selectionSession.brand_profile_id) {
      return NextResponse.json(
        { error: "Selection session is missing brand_profile_id" },
        { status: 400 }
      );
    }

    const brand = await getBrandForSession({
      supabaseAdmin,
      userId: user.id,
      brandProfileId: selectionSession.brand_profile_id,
    });

    if (!brand) {
      return NextResponse.json(
        { error: "Selected brand not found" },
        { status: 404 }
      );
    }

    const selectedPage = (selectionSession.pages || []).find(
      (page) => page.id === pageId
    );

    if (!selectedPage?.access_token) {
      return NextResponse.json(
        { error: "Selected page token not found" },
        { status: 400 }
      );
    }

    await saveFacebookConnection({
      supabaseAdmin,
      userId: user.id,
      brandProfileId: selectionSession.brand_profile_id,
      page: selectedPage,
    });

    await supabaseAdmin
      .from("meta_page_selection_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      brand,
      page: {
        id: selectedPage.id,
        name: selectedPage.name || "Facebook Page",
      },
    });
  } catch (error) {
    console.error("Meta page selection POST error:", error);

    return NextResponse.json(
      { error: "Could not save selected Facebook page" },
      { status: 500 }
    );
  }
}
