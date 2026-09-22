import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  SMART_ONBOARDING_GOALS,
  SMART_ONBOARDING_POST_COUNTS,
  getFallbackSmartOnboardingRecommendation,
  normalizeSmartOnboardingGoal,
  normalizeSmartOnboardingPostCount,
} from "../../../lib/smartOnboardingPlan";
import { enrichBrandProfileWithEffectiveProductMode } from "../../../lib/effectiveProductMode.js";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const model = process.env.CONTENT_PLAN_MODEL || "gpt-5.5";

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function safeJson(value) {
  try { return JSON.parse(value); } catch {
    const match = String(value || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = bearerToken(request);
  if (!supabaseUrl || !anonKey) return Response.json({ ok: false, error: "Supabase configuration is incomplete." }, { status: 500 });
  if (!token) return Response.json({ ok: false, error: "You must be logged in." }, { status: 401 });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return Response.json({ ok: false, error: "Your login session is not valid." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const brandProfileId = String(body?.brandProfileId || "").trim();
  if (!brandProfileId) return Response.json({ ok: false, error: "Brand profile is required." }, { status: 400 });

  const { data: brandProfile, error: brandError } = await supabase
    .from("brand_profiles")
    .select("id, user_id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, website_product_mode_available, website_service_mode_available")
    .eq("id", brandProfileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (brandError) return Response.json({ ok: false, error: brandError.message }, { status: 500 });
  if (!brandProfile) return Response.json({ ok: false, error: "Brand profile not found." }, { status: 404 });

  const { brandProfile: effectiveBrandProfile } = await enrichBrandProfileWithEffectiveProductMode({
    brandProfile,
    brandProfileId,
    userId: user.id,
    persist: true,
  });
  if (effectiveBrandProfile) Object.assign(brandProfile, effectiveBrandProfile);

  const { count: connectedPlatformCount } = await supabase
    .from("social_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "connected");

  const fallback = getFallbackSmartOnboardingRecommendation({ brandProfile, connectedPlatformCount });
  if (!process.env.OPENAI_API_KEY) return Response.json({ ok: true, ...fallback });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model,
      instructions: "You are Spreelo's onboarding strategist. Choose only the best primary social-media objective and a sustainable weekly posting frequency for this verified business. Return valid JSON only. Do not invent business facts and do not write customer-facing copy.",
      input: `Choose one onboarding recommendation.\n\nBUSINESS\nName: ${brandProfile.business_name || ""}\nIndustry: ${brandProfile.industry || ""}\nDescription: ${brandProfile.brand_description || ""}\nAudience: ${brandProfile.target_audience || ""}\nMarket: ${brandProfile.content_market || brandProfile.country_code || ""}\nVerified product catalog: ${Boolean(brandProfile.website_product_mode_available)}\nVerified services: ${Boolean(brandProfile.website_service_mode_available)}\nConnected social channels: ${Number(connectedPlatformCount || 0)}\n\nAllowed goal_id values: ${SMART_ONBOARDING_GOALS.join(", ")}\nAllowed post_count values: ${SMART_ONBOARDING_POST_COUNTS.join(", ")}\n\nReturn exactly: {"goal_id":"...","post_count":5}`,
    });
    const parsed = safeJson(response.output_text || "");
    const goalId = normalizeSmartOnboardingGoal(parsed?.goal_id, fallback.goalId);
    const postCount = normalizeSmartOnboardingPostCount(parsed?.post_count, fallback.postCount);
    return Response.json({ ok: true, goalId, postCount, source: "ai" });
  } catch (error) {
    console.warn("Smart onboarding recommendation fell back to deterministic strategy", error);
    return Response.json({ ok: true, ...fallback });
  }
}
