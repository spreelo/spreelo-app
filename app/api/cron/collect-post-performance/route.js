import { createClient } from "@supabase/supabase-js";
import { getHealthyPinterestAccessToken } from "../../../../lib/pinterestOAuth.js";
import { getHealthyTikTokAccessToken } from "../../../../lib/tiktokOAuth.js";
import { getHealthyYouTubeAccessToken } from "../../../../lib/youtubeOAuth.js";
import {
  buildPerformanceRow,
  classifyPerformanceError,
  collectProviderMetrics,
  extractPostPerformanceTargets,
  nextCollectionDelayHours,
} from "../../../../lib/postPerformance.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DISCOVERY_LOOKBACK_DAYS = 90;
const DISCOVERY_LIMIT = 700;
const COLLECTION_BATCH_LIMIT = 80;

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
  return new Date(base.getTime() + Number(hours || 0) * 3_600_000).toISOString();
}

function key(postId, platform) {
  return `${postId}:${platform}`;
}

function connectionKey(userId, brandProfileId, platform) {
  return `${userId}:${brandProfileId}:${platform}`;
}

async function discoverCollectionStates(supabase, now) {
  const since = new Date(now.getTime() - DISCOVERY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id,user_id,brand_profile_id,automation_rule_id,post_type,content_format,published_at,published_targets,publish_receipts,status")
    .not("published_at", "is", null)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(DISCOVERY_LIMIT);
  if (error) throw error;

  const candidates = [];
  for (const post of posts || []) {
    if (!post?.id || !post?.user_id || !post?.brand_profile_id) continue;
    for (const target of extractPostPerformanceTargets(post)) {
      if (!target.externalIds.length) continue;
      candidates.push({
        post_id: post.id,
        platform: target.platform,
        user_id: post.user_id,
        brand_profile_id: post.brand_profile_id,
        external_post_id: target.externalIds[0],
        status: "pending",
        next_collect_at: now.toISOString(),
        provider_metadata: { external_ids: target.externalIds },
        updated_at: now.toISOString(),
      });
    }
  }

  if (candidates.length) {
    const { error: upsertError } = await supabase
      .from("post_performance_collection_state")
      .upsert(candidates, { onConflict: "post_id,platform", ignoreDuplicates: true });
    if (upsertError) throw upsertError;
  }

  return { discoveredPosts: (posts || []).length, discoveredTargets: candidates.length };
}

async function loadDueStates(supabase, now) {
  const { data, error } = await supabase
    .from("post_performance_collection_state")
    .select("post_id,platform,user_id,brand_profile_id,external_post_id,status,last_attempt_at,last_success_at,next_collect_at,consecutive_failures,last_error,provider_metadata")
    .lte("next_collect_at", now.toISOString())
    .order("next_collect_at", { ascending: true })
    .limit(COLLECTION_BATCH_LIMIT);
  if (error) throw error;
  return data || [];
}

async function loadContext(supabase, states) {
  const postIds = [...new Set(states.map((row) => row.post_id).filter(Boolean))];
  const brandIds = [...new Set(states.map((row) => row.brand_profile_id).filter(Boolean))];
  const userIds = [...new Set(states.map((row) => row.user_id).filter(Boolean))];
  const platforms = [...new Set(states.map((row) => row.platform).filter(Boolean))];

  const postsPromise = postIds.length
    ? supabase
        .from("posts")
        .select("id,user_id,brand_profile_id,automation_rule_id,post_type,content_format,published_at,published_targets,publish_receipts,status")
        .in("id", postIds)
    : Promise.resolve({ data: [], error: null });
  const connectionsPromise = brandIds.length && userIds.length && platforms.length
    ? supabase
        .from("social_connections")
        .select("id,user_id,brand_profile_id,platform,page_id,page_name,page_access_token,token_expires_at,refresh_token,refresh_token_expires_at,permissions,status,updated_at")
        .in("brand_profile_id", brandIds)
        .in("user_id", userIds)
        .in("platform", platforms)
        .eq("status", "connected")
    : Promise.resolve({ data: [], error: null });

  const [postsResult, connectionsResult] = await Promise.all([postsPromise, connectionsPromise]);
  if (postsResult.error) throw postsResult.error;
  if (connectionsResult.error) throw connectionsResult.error;

  const posts = postsResult.data || [];
  const ruleIds = [...new Set(posts.map((post) => post.automation_rule_id).filter(Boolean))];
  const rulesResult = ruleIds.length
    ? await supabase.from("automation_rules").select("id,content_type_id").in("id", ruleIds)
    : { data: [], error: null };
  if (rulesResult.error) throw rulesResult.error;

  return {
    postById: new Map(posts.map((post) => [post.id, post])),
    connectionByKey: new Map(
      (connectionsResult.data || []).map((connection) => [
        connectionKey(connection.user_id, connection.brand_profile_id, connection.platform),
        connection,
      ])
    ),
    contentTypeByRuleId: new Map((rulesResult.data || []).map((rule) => [rule.id, rule.content_type_id])),
  };
}

async function getProviderAccessToken({ supabase, platform, connection }) {
  if (!connection?.page_access_token) {
    const error = new Error(`No connected ${platform} access token`);
    error.requiresReconnect = true;
    throw error;
  }

  if (platform === "youtube") {
    return getHealthyYouTubeAccessToken({ supabase, connection });
  }
  if (platform === "tiktok") {
    return getHealthyTikTokAccessToken({ supabase, connection });
  }
  if (platform === "pinterest") {
    return getHealthyPinterestAccessToken({ supabaseAdmin: supabase, connection });
  }
  return { accessToken: connection.page_access_token, connection, refreshed: false };
}

async function persistSuccess({ supabase, state, post, contentTypeId, externalIds, result, now }) {
  const row = buildPerformanceRow({
    post,
    platform: state.platform,
    externalIds,
    contentTypeId,
    metrics: result.metrics,
    raw: result.raw,
    capturedAt: now,
  });
  const latest = { ...row, updated_at: now.toISOString() };

  const [{ error: latestError }, { error: snapshotError }] = await Promise.all([
    supabase.from("post_performance_latest").upsert(latest, { onConflict: "post_id,platform" }),
    supabase.from("post_performance_snapshots").insert(row),
  ]);
  if (latestError) throw latestError;
  if (snapshotError) throw snapshotError;

  const delayHours = nextCollectionDelayHours({ publishedAt: post.published_at, now, status: "healthy" });
  const { error: stateError } = await supabase
    .from("post_performance_collection_state")
    .update({
      external_post_id: externalIds[0] || state.external_post_id || null,
      status: "healthy",
      last_attempt_at: now.toISOString(),
      last_success_at: now.toISOString(),
      next_collect_at: addHoursIso(now, delayHours),
      consecutive_failures: 0,
      last_error: null,
      provider_metadata: { ...(state.provider_metadata || {}), external_ids: externalIds },
      updated_at: now.toISOString(),
    })
    .eq("post_id", state.post_id)
    .eq("platform", state.platform);
  if (stateError) throw stateError;
}

async function persistFailure({ supabase, state, post, error, now }) {
  const status = classifyPerformanceError(error);
  const failures = Number(state.consecutive_failures || 0) + 1;
  const delayHours = nextCollectionDelayHours({
    publishedAt: post?.published_at,
    now,
    failures,
    status,
  });
  const { error: updateError } = await supabase
    .from("post_performance_collection_state")
    .update({
      status,
      last_attempt_at: now.toISOString(),
      next_collect_at: addHoursIso(now, delayHours),
      consecutive_failures: failures,
      last_error: String(error?.message || "Performance collection failed").slice(0, 1500),
      updated_at: now.toISOString(),
    })
    .eq("post_id", state.post_id)
    .eq("platform", state.platform);
  if (updateError) console.error("Could not persist performance collection failure", updateError);
  return status;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = {
    discoveredPosts: 0,
    discoveredTargets: 0,
    due: 0,
    collected: 0,
    scopeMissing: 0,
    authErrors: 0,
    notFound: 0,
    transientErrors: 0,
    skipped: 0,
    byPlatform: {},
  };

  try {
    const supabase = adminClient();
    const now = new Date();
    const discovery = await discoverCollectionStates(supabase, now);
    summary.discoveredPosts = discovery.discoveredPosts;
    summary.discoveredTargets = discovery.discoveredTargets;

    const states = await loadDueStates(supabase, now);
    summary.due = states.length;
    if (!states.length) return Response.json({ ok: true, summary });

    const context = await loadContext(supabase, states);

    for (const state of states) {
      const platform = String(state.platform || "").toLowerCase();
      summary.byPlatform[platform] ||= { due: 0, collected: 0, failed: 0 };
      summary.byPlatform[platform].due += 1;

      const post = context.postById.get(state.post_id);
      if (!post) {
        summary.skipped += 1;
        summary.byPlatform[platform].failed += 1;
        await persistFailure({ supabase, state, post: null, error: Object.assign(new Error("Spreelo post no longer exists"), { notFound: true }), now });
        continue;
      }

      const target = extractPostPerformanceTargets(post).find((item) => item.platform === platform);
      const externalIds = target?.externalIds?.length
        ? target.externalIds
        : Array.isArray(state.provider_metadata?.external_ids)
          ? state.provider_metadata.external_ids.map(String).filter(Boolean)
          : [state.external_post_id].filter(Boolean);
      if (!externalIds.length) {
        summary.skipped += 1;
        summary.byPlatform[platform].failed += 1;
        await persistFailure({ supabase, state, post, error: Object.assign(new Error("Provider publish receipt has no external post id"), { notFound: true }), now });
        continue;
      }

      const connection = context.connectionByKey.get(connectionKey(state.user_id, state.brand_profile_id, platform));
      if (!connection) {
        summary.authErrors += 1;
        summary.byPlatform[platform].failed += 1;
        await persistFailure({ supabase, state, post, error: Object.assign(new Error(`No connected ${platform} account found`), { requiresReconnect: true }), now });
        continue;
      }

      try {
        const healthy = await getProviderAccessToken({ supabase, platform, connection });
        const result = await collectProviderMetrics({
          platform,
          accessToken: healthy.accessToken,
          externalIds,
          connection: healthy.connection || connection,
          publishedAt: post.published_at,
          now,
        });
        await persistSuccess({
          supabase,
          state,
          post,
          externalIds,
          result,
          now,
          contentTypeId: context.contentTypeByRuleId.get(post.automation_rule_id) || post.post_type || null,
        });
        summary.collected += 1;
        summary.byPlatform[platform].collected += 1;
      } catch (error) {
        console.error("Grow Brain performance collection failed", {
          postId: state.post_id,
          platform,
          message: error?.message,
          status: error?.status || null,
          providerCode: error?.providerCode || null,
        });
        const failureStatus = await persistFailure({ supabase, state, post, error, now });
        summary.byPlatform[platform].failed += 1;
        if (failureStatus === "scope_missing") summary.scopeMissing += 1;
        else if (failureStatus === "auth_error") summary.authErrors += 1;
        else if (failureStatus === "not_found") summary.notFound += 1;
        else summary.transientErrors += 1;
      }
    }

    return Response.json({ ok: true, summary });
  } catch (error) {
    console.error("Grow Brain post performance cron failed", error);
    return Response.json({ ok: false, error: error?.message || "Performance collection failed", summary }, { status: 500 });
  }
}
