import { createHash, randomUUID } from "node:crypto";
import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import { rebuildBrandPerformanceInsights } from "../../../../lib/performanceLearning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_MARKER = "grow-brain-step3a-engine-test";

function getTestBrandId(userId) {
  const hex = createHash("sha256").update(`${TEST_MARKER}:${userId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isoDaysAgo(now, days, hourOffset = 0) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000 + hourOffset * 60 * 60 * 1000).toISOString();
}

async function cleanupTestData(admin, userId, testBrandId) {
  const operations = [
    admin.from("brand_performance_insights").delete().eq("brand_profile_id", testBrandId).eq("user_id", userId),
    admin.from("brand_performance_learning_state").delete().eq("brand_profile_id", testBrandId).eq("user_id", userId),
    admin.from("post_performance_latest").delete().eq("brand_profile_id", testBrandId).eq("user_id", userId),
  ];
  const results = await Promise.all(operations);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
}

function buildSyntheticRows(userId, testBrandId, now = new Date()) {
  const platforms = [
    {
      key: "facebook",
      exposureBase: 48000,
      modifiers: {
        website_item: { exposure: 0.94, engagement: 0.93, click: 0.96, share: 0.90, save: 0.92 },
        problem_solution: { exposure: 1.04, engagement: 1.08, click: 1.02, share: 1.10, save: 1.08 },
        animated_website_item: { exposure: 1.08, engagement: 1.12, click: 1.08, share: 1.10, save: 1.06 },
      },
    },
    {
      key: "instagram",
      exposureBase: 69000,
      modifiers: {
        website_item: { exposure: 1.12, engagement: 1.15, click: 1.10, share: 1.18, save: 1.16 },
        problem_solution: { exposure: 0.98, engagement: 1.00, click: 1.00, share: 0.98, save: 1.00 },
        animated_website_item: { exposure: 0.88, engagement: 0.82, click: 0.86, share: 0.84, save: 0.86 },
      },
    },
  ];
  const cohorts = [
    {
      contentType: "website_item",
      contentFormat: "single_image",
      count: 6,
      exposureFactor: 1.35,
      engagementRate: 0.074,
      clickRate: 0.017,
      shareRate: 0.009,
      saveRate: 0.012,
    },
    {
      contentType: "problem_solution",
      contentFormat: "single_image",
      count: 6,
      exposureFactor: 1.0,
      engagementRate: 0.041,
      clickRate: 0.010,
      shareRate: 0.006,
      saveRate: 0.008,
    },
    {
      contentType: "animated_website_item",
      contentFormat: "animated_video",
      count: 6,
      exposureFactor: 0.63,
      engagementRate: 0.015,
      clickRate: 0.0035,
      shareRate: 0.002,
      saveRate: 0.0025,
    },
  ];

  const rows = [];
  let sequence = 0;
  for (const platform of platforms) {
    for (const cohort of cohorts) {
      for (let index = 0; index < cohort.count; index += 1) {
        sequence += 1;
        const wobble = 0.92 + ((index * 7 + sequence * 3) % 17) / 100;
        const modifier = platform.modifiers?.[cohort.contentType] || { exposure: 1, engagement: 1, click: 1, share: 1, save: 1 };
        const exposure = Math.round(platform.exposureBase * cohort.exposureFactor * modifier.exposure * wobble);
        const totalInteractions = Math.max(1, Math.round(exposure * cohort.engagementRate * modifier.engagement * (0.94 + (index % 3) * 0.04)));
        const shares = Math.max(1, Math.round(exposure * cohort.shareRate * modifier.share));
        const saves = Math.max(1, Math.round(exposure * cohort.saveRate * modifier.save));
        const comments = Math.max(1, Math.round(totalInteractions * 0.08));
        const likes = Math.max(1, totalInteractions - shares - saves - comments);
        const clicks = Math.max(1, Math.round(exposure * cohort.clickRate * modifier.click));
        const publishedAt = isoDaysAgo(now, 16 + sequence, index % 4);
        const capturedAt = isoDaysAgo(now, 1, -(sequence % 8));
        rows.push({
          post_id: randomUUID(),
          platform: platform.key,
          user_id: userId,
          brand_profile_id: testBrandId,
          external_post_id: `${TEST_MARKER}-${platform.key}-${sequence}`,
          content_type_id: cohort.contentType,
          content_format: cohort.contentFormat,
          published_at: publishedAt,
          captured_at: capturedAt,
          age_hours: (16 + sequence) * 24,
          views: exposure,
          reach: platform.key === "facebook" ? Math.round(exposure * 0.88) : Math.round(exposure * 0.82),
          impressions: platform.key === "instagram" ? Math.round(exposure * 1.06) : null,
          likes,
          comments,
          shares,
          saves,
          clicks,
          engagements: likes + comments + shares + saves,
          watch_time_seconds: cohort.contentFormat === "animated_video" ? exposure * 8.5 : null,
          average_watch_time_seconds: cohort.contentFormat === "animated_video" ? 6.2 : null,
          metric_schema_version: 1,
          provider_payload: { test_marker: TEST_MARKER, synthetic: true },
          updated_at: capturedAt,
        });
      }
    }
  }
  return rows;
}

function compactInsight(row) {
  const numericOrNull = (value) => value === null || value === undefined ? null : Number(value);
  return {
    dimension_type: row.dimension_type,
    platform: row.platform,
    dimension_key: row.dimension_key,
    observation_count: Number(row.observation_count || 0),
    performance_score: Number(row.performance_score || 0),
    confidence: Number(row.confidence || 0),
    signal: row.signal,
    avg_exposure: numericOrNull(row.avg_exposure),
    avg_interactions: numericOrNull(row.avg_interactions),
    engagement_rate: numericOrNull(row.engagement_rate),
    click_rate: numericOrNull(row.click_rate),
    share_rate: numericOrNull(row.share_rate),
    save_rate: numericOrNull(row.save_rate),
    relative_exposure: numericOrNull(row.relative_exposure),
    relative_engagement: numericOrNull(row.relative_engagement),
    relative_click: numericOrNull(row.relative_click),
    relative_share: numericOrNull(row.relative_share),
    relative_save: numericOrNull(row.relative_save),
    last_post_at: row.last_post_at || null,
    computed_at: row.computed_at || null,
  };
}

async function readPersistedTestResult(admin, userId, testBrandId) {
  const { data: persistedInsights, error: insightError } = await admin
    .from("brand_performance_insights")
    .select("dimension_type,platform,dimension_key,observation_count,performance_score,confidence,signal,avg_exposure,avg_interactions,engagement_rate,click_rate,share_rate,save_rate,relative_exposure,relative_engagement,relative_click,relative_share,relative_save,last_post_at,computed_at")
    .eq("brand_profile_id", testBrandId)
    .eq("user_id", userId)
    .order("confidence", { ascending: false });
  if (insightError) throw insightError;

  const { data: state, error: stateError } = await admin
    .from("brand_performance_learning_state")
    .select("learning_state,source_post_count,eligible_post_count,insight_count,status,last_analyzed_at,last_error")
    .eq("brand_profile_id", testBrandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (stateError) throw stateError;

  const insights = (persistedInsights || []).map(compactInsight);
  const positive = insights.filter((item) => ["positive", "strong_positive"].includes(item.signal));
  const negative = insights.filter((item) => ["negative", "strong_negative"].includes(item.signal));
  return {
    insights,
    state,
    top_positive: positive.sort((a, b) => b.performance_score - a.performance_score).slice(0, 4),
    top_negative: negative.sort((a, b) => a.performance_score - b.performance_score).slice(0, 4),
  };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const userId = context.user.id;
  const testBrandId = getTestBrandId(userId);
  try {
    const persisted = await readPersistedTestResult(context.admin, userId, testBrandId);
    const hasTestData = Boolean(persisted.state || persisted.insights.length);
    const passed = Boolean(
      hasTestData
      && persisted.state?.status === "healthy"
      && persisted.state?.learning_state === "established"
      && Number(persisted.state?.eligible_post_count || 0) === 36
      && persisted.top_positive.length > 0
      && persisted.top_negative.length > 0
    );
    return Response.json({
      ok: true,
      passed,
      action: "status",
      test_brand_id: testBrandId,
      ...persisted,
      has_test_data: hasTestData,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load Grow Brain performance test status." }, { status: 500 });
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const userId = context.user.id;
  const testBrandId = getTestBrandId(userId);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "run").trim().toLowerCase();

    if (action === "cleanup") {
      await cleanupTestData(context.admin, userId, testBrandId);
      return Response.json({ ok: true, action: "cleanup", test_brand_id: testBrandId });
    }

    if (action !== "run") {
      return Response.json({ ok: false, error: "Unsupported test action." }, { status: 400 });
    }

    await cleanupTestData(context.admin, userId, testBrandId);
    const syntheticRows = buildSyntheticRows(userId, testBrandId, new Date());
    const { error: insertError } = await context.admin.from("post_performance_latest").insert(syntheticRows);
    if (insertError) throw insertError;

    const analysis = await rebuildBrandPerformanceInsights({
      supabase: context.admin,
      brandProfileId: testBrandId,
      userId,
      now: new Date(),
    });

    const persisted = await readPersistedTestResult(context.admin, userId, testBrandId);
    const { insights, state, top_positive: persistedPositive, top_negative: persistedNegative } = persisted;
    const positive = insights.filter((item) => ["positive", "strong_positive"].includes(item.signal));
    const negative = insights.filter((item) => ["negative", "strong_negative"].includes(item.signal));
    const checks = {
      rows_inserted: syntheticRows.length === 36,
      eligible_posts: Number(state?.eligible_post_count || 0) === 36,
      state_healthy: state?.status === "healthy",
      established_learning: state?.learning_state === "established",
      insights_persisted: Number(state?.insight_count || 0) > 0 && insights.length > 0,
      positive_signal_found: positive.length > 0,
      negative_signal_found: negative.length > 0,
    };
    const passed = Object.values(checks).every(Boolean);

    return Response.json({
      ok: true,
      passed,
      action: "run",
      test_brand_id: testBrandId,
      inserted_rows: syntheticRows.length,
      state,
      checks,
      insights,
      top_positive: persistedPositive,
      top_negative: persistedNegative,
      analysis_summary: analysis?.summary || null,
      cleanup_available: true,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      passed: false,
      error: error?.message || "Grow Brain performance test failed.",
      test_brand_id: testBrandId,
    }, { status: 500 });
  }
}
