import { createHash } from "node:crypto";
import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import { getContentGoalWeight } from "../../../../lib/contentPlanningStrategy.js";
import {
  buildPerformanceLearningPlannerContext,
  getPerformanceLearningContentTypeAdjustment,
} from "../../../../lib/performanceLearning.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_MARKER = "grow-brain-step3a-engine-test";
const GOALS = ["sell_more", "get_followers", "build_trust"];
const TEST_CONTENT_TYPES = ["website_item", "problem_solution", "animated_website_item"];
const TEST_PLATFORMS = ["instagram"];

function getTestBrandId(userId) {
  const hex = createHash("sha256").update(`${TEST_MARKER}:${userId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function round(value, digits = 2) {
  const number = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function normalizeShares(rows, key) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row[key] || 0)), 0);
  return rows.map((row) => ({
    ...row,
    [`${key}_share`]: total > 0 ? round((Math.max(0, Number(row[key] || 0)) / total) * 100, 1) : 0,
  }));
}

function buildGoalScenario(insights, learningState, goalId, selectedPlatforms = TEST_PLATFORMS) {
  let rows = TEST_CONTENT_TYPES.map((contentTypeId) => {
    const baseWeight = getContentGoalWeight(goalId, contentTypeId, 60);
    const adjustment = getPerformanceLearningContentTypeAdjustment(insights, contentTypeId, {
      goalId,
      selectedPlatforms,
      learningState,
      minObservations: 4,
      minConfidence: 0.35,
      maxAdjustment: 14,
    });
    return {
      content_type_id: contentTypeId,
      base_weight: round(baseWeight, 2),
      grow_brain_adjustment: round(adjustment, 2),
      adjusted_weight: round(Math.max(1, baseWeight + adjustment), 2),
      direction: adjustment > 0.05 ? "boost" : adjustment < -0.05 ? "reduce" : "unchanged",
    };
  });
  rows = normalizeShares(rows, "base_weight");
  rows = normalizeShares(rows, "adjusted_weight");
  return {
    goal_id: goalId,
    selected_platforms: selectedPlatforms,
    rows,
  };
}

function findAdjustment(scenario, contentTypeId) {
  return Number(scenario?.rows?.find((row) => row.content_type_id === contentTypeId)?.grow_brain_adjustment || 0);
}

async function loadTestLearning(admin, userId, testBrandId) {
  const [{ data: insights, error: insightError }, { data: state, error: stateError }] = await Promise.all([
    admin
      .from("brand_performance_insights")
      .select("dimension_type,platform,dimension_key,observation_count,performance_score,confidence,signal,relative_exposure,relative_engagement,relative_click,relative_share,relative_save,last_post_at,computed_at")
      .eq("brand_profile_id", testBrandId)
      .eq("user_id", userId)
      .order("confidence", { ascending: false }),
    admin
      .from("brand_performance_learning_state")
      .select("learning_state,eligible_post_count,insight_count,status,last_analyzed_at,last_error")
      .eq("brand_profile_id", testBrandId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (insightError) throw insightError;
  if (stateError) throw stateError;
  return { insights: insights || [], state: state || null };
}

function runVerification(insights, state) {
  const learningState = state?.learning_state || "collecting";
  const scenarios = GOALS.map((goalId) => buildGoalScenario(insights, learningState, goalId));
  const collectingScenarios = GOALS.map((goalId) => buildGoalScenario(insights, "collecting", goalId));
  const earlyScenarios = GOALS.map((goalId) => buildGoalScenario(insights, "early", goalId));
  const facebookScenario = buildGoalScenario(insights, learningState, "get_followers", ["facebook"]);
  const instagramScenario = scenarios.find((scenario) => scenario.goal_id === "get_followers");

  const positiveAdjustments = scenarios.map((scenario) => findAdjustment(scenario, "website_item"));
  const negativeAdjustments = scenarios.map((scenario) => findAdjustment(scenario, "animated_website_item"));
  const collectingAdjustments = collectingScenarios.flatMap((scenario) => scenario.rows.map((row) => Math.abs(row.grow_brain_adjustment)));
  const establishedAbs = scenarios.flatMap((scenario) => scenario.rows.map((row) => Math.abs(row.grow_brain_adjustment)));
  const earlyAbs = earlyScenarios.flatMap((scenario) => scenario.rows.map((row) => Math.abs(row.grow_brain_adjustment)));

  const goalSensitiveValues = GOALS.map((goalId) => round(findAdjustment(scenarios.find((scenario) => scenario.goal_id === goalId), "website_item"), 2));
  const platformInstagram = round(findAdjustment(instagramScenario, "website_item"), 2);
  const platformFacebook = round(findAdjustment(facebookScenario, "website_item"), 2);

  const plannerContext = buildPerformanceLearningPlannerContext(insights, {
    goalId: "get_followers",
    selectedPlatforms: TEST_PLATFORMS,
    learningState,
    maxSignals: 8,
  });

  const checks = {
    test_data_ready: state?.status === "healthy" && state?.learning_state === "established" && Number(state?.eligible_post_count || 0) === 36 && insights.length > 0,
    positive_signal_boosts: positiveAdjustments.some((value) => value > 0),
    negative_signal_reduces: negativeAdjustments.some((value) => value < 0),
    collecting_has_zero_influence: collectingAdjustments.every((value) => value === 0),
    early_is_weaker_than_established: establishedAbs.every((value, index) => value === 0 || earlyAbs[index] < value),
    influence_cap_respected: scenarios.every((scenario) => scenario.rows.every((row) => Math.abs(row.grow_brain_adjustment) <= 14.0001)),
    no_hard_bans: scenarios.every((scenario) => scenario.rows.every((row) => row.adjusted_weight > 0)),
    goal_sensitive: new Set(goalSensitiveValues).size > 1,
    platform_aware: platformInstagram !== platformFacebook,
    planner_context_active: plannerContext.active === true && plannerContext.rules?.hard_bans === false && plannerContext.rules?.preserve_exploration === true,
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    scenarios,
    diagnostics: {
      goal_sensitive_adjustments: goalSensitiveValues,
      instagram_adjustment: platformInstagram,
      facebook_adjustment: platformFacebook,
      planner_context: plannerContext,
    },
  };
}

async function handle(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const userId = context.user.id;
  const testBrandId = getTestBrandId(userId);
  try {
    const { insights, state } = await loadTestLearning(context.admin, userId, testBrandId);
    if (!state || !insights.length) {
      return Response.json({
        ok: true,
        ready: false,
        passed: false,
        test_brand_id: testBrandId,
        error_code: "step3a_test_data_missing",
        message: "Run the Step 3A engine test first so Step 4 can verify planning influence against persisted test insights.",
      });
    }
    const verification = runVerification(insights, state);
    return Response.json({
      ok: true,
      ready: true,
      test_brand_id: testBrandId,
      state,
      insight_count: insights.length,
      ...verification,
    });
  } catch (error) {
    return Response.json({ ok: false, ready: false, passed: false, error: error?.message || "Could not verify Grow Brain Step 4 planning influence." }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
