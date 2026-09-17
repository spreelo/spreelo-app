import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildThreadsAuthorizationUrl,
  createSignedThreadsState,
  getThreadsEnv,
} from "../../../../../lib/threadsOAuth";
import { hasAdminPlanLimitBypass } from "../../../../../lib/adminAuth";
import { checkSocialConnectionCapacity } from "../../../../../lib/planEntitlements";

function getSupabaseClient(authorizationHeader) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase environment variables");

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorizationHeader } },
  });
}

async function getAuthenticatedBrand({ request, brandProfileId }) {
  const authorizationHeader = request.headers.get("authorization") || "";
  if (!authorizationHeader.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 };

  const supabase = getSupabaseClient(authorizationHeader);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id) return { error: "Unauthorized", status: 401 };
  if (!brandProfileId) return { error: "Missing brand", status: 400 };

  const { data: brand, error: brandError } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("id", brandProfileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (brandError) return { error: brandError.message || "Could not verify brand", status: 500 };
  if (!brand?.id) return { error: "Invalid brand", status: 403 };

  return { user, brand, supabase };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const brandProfileId = String(body?.brand_profile_id || body?.brandProfileId || "").trim();
    const auth = await getAuthenticatedBrand({ request, brandProfileId });
    if (auth.error) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const capacity = hasAdminPlanLimitBypass(auth.user)
      ? { allowed: true }
      : await checkSocialConnectionCapacity(auth.supabase, auth.user.id, {
          brandProfileId,
          platform: "threads",
        });
    if (!capacity.allowed) {
      return NextResponse.json({ ok: false, error: "PLAN_LIMIT", planLimit: capacity.limitDetails }, { status: 409 });
    }

    const { appId, appSecret, redirectUri } = getThreadsEnv();
    if (!appId || !appSecret || !redirectUri) {
      return NextResponse.json({ ok: false, error: "Threads connection is not configured yet." }, { status: 500 });
    }

    const state = createSignedThreadsState({
      userId: auth.user.id,
      brandProfileId,
      redirectUri,
      secret: appSecret,
    });
    const url = buildThreadsAuthorizationUrl({ appId, redirectUri, state });
    const response = NextResponse.json({ ok: true, url });
    response.cookies.set("spreelo_threads_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("Threads OAuth start failed", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Could not start Threads connection." },
      { status: 500 }
    );
  }
}
