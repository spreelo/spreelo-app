import { createClient } from "@supabase/supabase-js";
import { getContentGoalWeight } from "../../../../lib/contentPlanningStrategy.js";
import {
  getBrandLearningContentTypeAdjustment,
} from "../../../../lib/brandLearning.js";
import {
  getPerformanceLearningContentTypeAdjustment,
  loadBrandPerformancePlanningContext,
} from "../../../../lib/performanceLearning.js";
import {
  parseWeeklyVariation, localWeeklySlotUtc, getWeeklyCycle,
  chooseWeeklyVariant, lockWeeklyVariant,
} from "../../../../lib/weeklyVariationPlanner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BATCH_SIZE = 18;
const CONCURRENCY = 3;
const HISTORY_LIMIT = 80;

function getAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role is unavailable.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function authOk(request) {
  return Boolean(process.env.CRON_SECRET &&
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`);
}

async function planOneBrand(admin, claim) {
  const brandId = claim.brand_profile_id;
  const weekStart = claim.week_start;
  const { data: rules, error: rulesError } = await admin.from("automation_rules")
    .select("id,user_id,brand_profile_id,weekday,publish_time,timezone,schedule_type,strategy_notes,content_type_id,created_at,updated_at,is_active,recurring_plan_group_id")
    .eq("brand_profile_id", brandId).eq("schedule_type", "weekly").eq("is_active", true)
    .order("id").limit(300);
  if (rulesError) throw rulesError;
  if ((rules || []).length === 300) throw new Error("Weekly rule pool exceeds bounded planning limit; refusing partial plan");

  const eligible = (rules || []).map((rule) => ({ rule, config: parseWeeklyVariation(rule) }))
    .filter((entry) => entry.config);
  // Choose slots in actual publication order, not arbitrary DB insertion order.
  const publishOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  eligible.sort((a, b) => {
    const dayDifference = publishOrder.indexOf(a.rule.weekday) - publishOrder.indexOf(b.rule.weekday);
    if (dayDifference) return dayDifference;
    return String(a.rule.publish_time || "").localeCompare(String(b.rule.publish_time || ""));
  });
  if (!eligible.length) return { changed: 0, skipped: 0 };

  const [historyResult, learningResult, performanceResult] = await Promise.all([
    admin.from("automation_run_logs").select("content_type_id,started_at")
      .eq("brand_profile_id", brandId).eq("status", "success")
      .order("started_at", { ascending: false }).limit(HISTORY_LIMIT),
    admin.from("brand_learning_profiles").select("profile_json,learning_state,source_event_count,approved_count,rejected_count,last_event_at")
      .eq("brand_profile_id", brandId).maybeSingle(),
    loadBrandPerformancePlanningContext({supabase:admin,brandProfileId:brandId,userId:eligible[0].rule.user_id})
      .catch((error) => { console.warn("Weekly performance signal unavailable", {brandId,message:error.message}); return null; }),
  ]);
  if (historyResult.error) throw historyResult.error;
  // Learning signals are advisory; a missing profile must not block planning.
  const learningProfile = learningResult.error ? null : learningResult.data;
  const performanceLearning = performanceResult || null;
  const recentTypes = (historyResult.data || []).map((row) => row.content_type_id).filter(Boolean);
  const selectedThisWeek = new Set();
  let changed = 0;
  let skipped = 0;

  for (const {rule,config} of eligible) {
    const target = localWeeklySlotUtc(weekStart, rule.weekday, rule.publish_time, rule.timezone);
    const cycle = getWeeklyCycle(rule, config, target);
    // Respect an existing per-week lock (e.g. a manual or already claimed run).
    if (Number(config.lockedVariantCycle) === cycle &&
        Number.isInteger(config.lockedVariantIndex) &&
        config.lockedVariantIndex >= 0 && config.lockedVariantIndex < config.variants.length) {
      const chosen = config.variants[config.lockedVariantIndex];
      if (chosen?.contentTypeId) selectedThisWeek.add(chosen.contentTypeId);
      skipped += 1;
      continue;
    }
    const variantIndex = chooseWeeklyVariant({
      rule, config, cycle, recentTypes, selectedThisWeek,
      goalWeight: (goal, type) => getContentGoalWeight(goal, type, 60),
      learningAdjustment: (type) => getBrandLearningContentTypeAdjustment(learningProfile, type, {
        minObservations: 3, maxAdjustment: 12,
      }),
      performanceAdjustment: (type) => getPerformanceLearningContentTypeAdjustment(
        performanceLearning?.insights || [], type, {
          goalId: config.goalId,
          selectedPlatforms: config.selectedPlatforms || [],
          learningState: performanceLearning?.learningState || "collecting",
          minObservations: 4, minConfidence: 0.35, maxAdjustment: 14,
        }
      ),
    });
    const nextNotes = lockWeeklyVariant(rule, config, cycle, variantIndex);
    // CAS prevents racing with a customer's manual save or another worker.
    const { data: updated, error } = await admin.from("automation_rules")
      .update({strategy_notes:nextNotes})
      .eq("id", rule.id).eq("strategy_notes", rule.strategy_notes)
      .select("id");
    if (error) throw error;
    if (!updated?.length) { skipped += 1; continue; }
    changed += 1;
    const selectedType = config.variants[variantIndex]?.contentTypeId;
    if (selectedType) selectedThisWeek.add(selectedType);
    console.info("Weekly variation slot locked without AI", {
      brandId, weekStart, ruleId:rule.id, contentTypeId:selectedType, cycle,
    });
  }
  return { changed, skipped };
}

export async function GET(request) {
  if (!authOk(request)) return Response.json({ ok: false, error: "Unauthorized" }, {status:401});
  try {
    const admin = getAdmin();
    const { data: claims, error: claimError } = await admin.rpc("claim_weekly_variation_plans", {p_limit:BATCH_SIZE});
    if (claimError) throw new Error(`Run supabase/v144_393_weekly_variation_planning.sql first: ${claimError.message}`);
    let planned = 0;
    let changed = 0;
    let skipped = 0;
    let errors = 0;
    const queue = [...(claims || [])];
    const work = async () => {
      while (queue.length) {
        const claim = queue.shift();
        if (!claim) return;
        try {
          const result = await planOneBrand(admin, claim);
          const { data: completed, error } = await admin.from("weekly_variation_plan_runs")
            .update({status:"completed",changed_rules:result.changed,skipped_rules:result.skipped,completed_at:new Date().toISOString(),last_error:null})
            .eq("brand_profile_id",claim.brand_profile_id).eq("week_start",claim.week_start)
            .eq("claim_token",claim.claim_token).eq("status","running").select("brand_profile_id");
          if (error) throw error;
          if (completed?.length) { planned += 1; changed += result.changed; skipped += result.skipped; }
        } catch (error) {
          errors += 1;
          console.error("Sunday night variation planning failed", {brandId:claim.brand_profile_id,message:error.message});
          await admin.from("weekly_variation_plan_runs")
            .update({status:"failed",last_error:String(error.message).slice(0,2000)})
            .eq("brand_profile_id",claim.brand_profile_id).eq("week_start",claim.week_start)
            .eq("claim_token",claim.claim_token).eq("status","running");
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(CONCURRENCY,queue.length)},work));
    return Response.json({ok:errors===0,claimed:(claims||[]).length,planned,changed,skipped,errors,aiCalls:0});
  } catch (error) {
    console.error("Weekly variation cron unavailable", {message:error.message});
    return Response.json({ok:false,error:error.message},{status:503});
  }
}
