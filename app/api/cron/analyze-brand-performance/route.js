import { createClient } from "@supabase/supabase-js";
import {
  isPerformanceLearningStorageMissingError,
  rebuildBrandPerformanceInsights,
} from "../../../../lib/performanceLearning.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DISCOVERY_LIMIT = 1500;
const ANALYSIS_BATCH_LIMIT = 20;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "");
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function addHoursIso(date, hours) {
  const base = date instanceof Date ? date : new Date(date || Date.now());
  return new Date(base.getTime() + Math.max(0, Number(hours || 0)) * 3_600_000).toISOString();
}

async function discoverBrandStates(supabase, now) {
  const { data, error } = await supabase
    .from("post_performance_latest")
    .select("user_id,brand_profile_id,captured_at")
    .not("brand_profile_id", "is", null)
    .not("user_id", "is", null)
    .order("captured_at", { ascending: false })
    .limit(DISCOVERY_LIMIT);
  if (error) throw error;

  const unique = new Map();
  for (const row of data || []) {
    if (!row?.brand_profile_id || !row?.user_id) continue;
    const existing = unique.get(row.brand_profile_id);
    if (!existing || String(row.captured_at || "") > String(existing.captured_at || "")) {
      unique.set(row.brand_profile_id, row);
    }
  }

  const latestByBrand = [...unique.values()];
  if (!latestByBrand.length) return 0;

  const brandIds = latestByBrand.map((row) => row.brand_profile_id);
  const { data: existingStates, error: stateError } = await supabase
    .from("brand_performance_learning_state")
    .select("brand_profile_id,last_source_at")
    .in("brand_profile_id", brandIds);
  if (stateError) throw stateError;
  const existingByBrand = new Map((existingStates || []).map((row) => [row.brand_profile_id, row]));

  const candidates = latestByBrand
    .filter((row) => {
      const existing = existingByBrand.get(row.brand_profile_id);
      if (!existing) return true;
      return String(row.captured_at || "") > String(existing.last_source_at || "");
    })
    .map((row) => ({
      brand_profile_id: row.brand_profile_id,
      user_id: row.user_id,
      status: "pending",
      last_source_at: row.captured_at || null,
      next_analysis_at: now.toISOString(),
      consecutive_failures: 0,
      last_error: null,
      updated_at: now.toISOString(),
    }));

  if (candidates.length) {
    const { error: upsertError } = await supabase
      .from("brand_performance_learning_state")
      .upsert(candidates, { onConflict: "brand_profile_id" });
    if (upsertError) throw upsertError;
  }

  return candidates.length;
}

async function loadDueStates(supabase, now) {
  const { data, error } = await supabase
    .from("brand_performance_learning_state")
    .select("brand_profile_id,user_id,status,next_analysis_at,consecutive_failures,last_source_at,last_analyzed_at")
    .lte("next_analysis_at", now.toISOString())
    .order("next_analysis_at", { ascending: true })
    .limit(ANALYSIS_BATCH_LIMIT);
  if (error) throw error;
  return data || [];
}

async function persistFailure(supabase, state, error, now) {
  const failures = Number(state?.consecutive_failures || 0) + 1;
  const delayHours = Math.min(24, Math.max(1, 2 ** Math.min(4, failures - 1)));
  const { error: updateError } = await supabase
    .from("brand_performance_learning_state")
    .update({
      status: "error",
      consecutive_failures: failures,
      last_error: String(error?.message || error || "Performance learning failed").slice(0, 1500),
      next_analysis_at: addHoursIso(now, delayHours),
      updated_at: now.toISOString(),
    })
    .eq("brand_profile_id", state.brand_profile_id)
    .eq("user_id", state.user_id);
  if (updateError) console.error("Could not persist Grow Brain performance learning failure", updateError);
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = {
    discoveredBrands: 0,
    due: 0,
    analyzed: 0,
    failed: 0,
    sourcePosts: 0,
    eligiblePosts: 0,
    insights: 0,
  };

  try {
    const supabase = adminClient();
    const now = new Date();
    summary.discoveredBrands = await discoverBrandStates(supabase, now);
    const states = await loadDueStates(supabase, now);
    summary.due = states.length;

    for (const state of states) {
      try {
        const analysis = await rebuildBrandPerformanceInsights({
          supabase,
          brandProfileId: state.brand_profile_id,
          userId: state.user_id,
          now,
        });
        summary.analyzed += 1;
        summary.sourcePosts += Number(analysis?.source_post_count || 0);
        summary.eligiblePosts += Number(analysis?.eligible_post_count || 0);
        summary.insights += Number(analysis?.insight_count || 0);
      } catch (error) {
        summary.failed += 1;
        console.error("Grow Brain performance learning failed", {
          brandProfileId: state.brand_profile_id,
          message: error?.message || String(error),
        });
        await persistFailure(supabase, state, error, now);
      }
    }

    return Response.json({ ok: true, summary });
  } catch (error) {
    const storageMissing = isPerformanceLearningStorageMissingError(error);
    console.error("Grow Brain performance learning cron failed", error);
    return Response.json({
      ok: false,
      storageMissing,
      error: error?.message || "Performance learning failed",
      summary,
    }, { status: storageMissing ? 503 : 500 });
  }
}
