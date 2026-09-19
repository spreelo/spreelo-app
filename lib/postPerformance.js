export const PERFORMANCE_SCHEMA_VERSION = 1;
export const PERFORMANCE_SUPPORTED_PLATFORMS = Object.freeze([
  "facebook",
  "instagram",
  "threads",
  "pinterest",
  "tiktok",
  "youtube",
]);

const TIKTOK_REQUIRED_SCOPE = "video.list";
const THREADS_REQUIRED_SCOPE = "threads_manage_insights";

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.round(parsed));
}

function sumMetric(values) {
  const present = values.map(finiteNumber).filter((value) => value !== null);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

function normalizePermissions(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\s,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function connectionHasPermission(connection, permission) {
  const permissions = new Set(normalizePermissions(connection?.permissions));
  return permissions.has(permission);
}

export function normalizePerformanceMetrics(metrics = {}) {
  const normalized = {
    views: nonNegativeInteger(metrics.views),
    reach: nonNegativeInteger(metrics.reach),
    impressions: nonNegativeInteger(metrics.impressions),
    likes: nonNegativeInteger(metrics.likes),
    comments: nonNegativeInteger(metrics.comments),
    shares: nonNegativeInteger(metrics.shares),
    saves: nonNegativeInteger(metrics.saves),
    clicks: nonNegativeInteger(metrics.clicks),
    engagements: nonNegativeInteger(metrics.engagements),
    watch_time_seconds: finiteNumber(metrics.watch_time_seconds),
    average_watch_time_seconds: finiteNumber(metrics.average_watch_time_seconds),
  };

  if (normalized.engagements === null) {
    normalized.engagements = sumMetric([
      normalized.likes,
      normalized.comments,
      normalized.shares,
      normalized.saves,
      normalized.clicks,
    ]);
  }
  return normalized;
}

export function hoursBetween(earlier, later = new Date()) {
  const start = new Date(earlier || 0).getTime();
  const end = later instanceof Date ? later.getTime() : new Date(later || 0).getTime();
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end)) return null;
  return Math.max(0, Number(((end - start) / 3_600_000).toFixed(2)));
}

export function nextCollectionDelayHours({ publishedAt, now = new Date(), failures = 0, status = "healthy" } = {}) {
  if (status === "scope_missing" || status === "unsupported") return 24 * 14;
  if (status === "auth_error") return 24 * 7;
  if (status === "not_found") return 24;
  if (status === "transient_error") return Math.min(24, Math.max(1, 2 ** Math.min(5, Number(failures || 0))));

  const age = hoursBetween(publishedAt, now);
  if (age === null) return 24;
  if (age < 24) return 3;
  if (age < 24 * 7) return 8;
  if (age < 24 * 30) return 24;
  if (age < 24 * 90) return 72;
  return 24 * 7;
}

export function extractExternalPostIds(platform, receipt) {
  const normalizedPlatform = String(platform || "").trim().toLowerCase();
  const value = receipt && typeof receipt === "object" ? receipt : {};
  const raw = [];

  if (normalizedPlatform === "facebook") {
    raw.push(value.post_id, value.video_id, value.object_id, value.id);
  } else if (normalizedPlatform === "instagram") {
    raw.push(value.media_id, value.id);
  } else if (normalizedPlatform === "pinterest") {
    raw.push(value.pin_id, value.id);
  } else if (normalizedPlatform === "youtube") {
    raw.push(value.video_id, value.id);
  } else if (normalizedPlatform === "tiktok") {
    if (Array.isArray(value.post_ids)) raw.push(...value.post_ids);
    raw.push(value.post_id, value.id);
  } else if (normalizedPlatform === "threads") {
    raw.push(value.thread_id, value.id);
  }

  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function extractPostPerformanceTargets(post) {
  const targets = Array.isArray(post?.published_targets) ? post.published_targets : [];
  const receipts = post?.publish_receipts && typeof post.publish_receipts === "object"
    ? post.publish_receipts
    : {};

  return targets
    .map((platform) => String(platform || "").trim().toLowerCase())
    .filter((platform) => PERFORMANCE_SUPPORTED_PLATFORMS.includes(platform))
    .map((platform) => ({
      platform,
      receipt: receipts[platform] || null,
      externalIds: extractExternalPostIds(platform, receipts[platform]),
    }));
}

function apiError(message, { status = 0, code = null, scopeMissing = false, authError = false, notFound = false, transient = false, raw = null } = {}) {
  const error = new Error(message || "Performance API request failed");
  error.status = Number(status || 0);
  error.providerCode = code;
  error.scopeMissing = Boolean(scopeMissing);
  error.authError = Boolean(authError);
  error.notFound = Boolean(notFound);
  error.transient = Boolean(transient);
  error.raw = raw;
  return error;
}

async function fetchJson(url, options = {}, fallback = "Performance API request failed") {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;

  const providerMessage =
    data?.error?.message ||
    data?.message ||
    data?.error_description ||
    fallback;
  const providerCode = data?.error?.code || data?.code || null;
  const lower = `${providerMessage} ${providerCode || ""}`.toLowerCase();
  throw apiError(providerMessage, {
    status: response.status,
    code: providerCode,
    scopeMissing: response.status === 403 || /permission|scope|insufficient|not authorized/.test(lower),
    authError: response.status === 401 || /invalid.*token|expired.*token|oauth/.test(lower),
    notFound: response.status === 404 || /not found|does not exist/.test(lower),
    transient: response.status === 429 || response.status >= 500,
    raw: data,
  });
}

export function classifyPerformanceError(error) {
  if (error?.scopeMissing) return "scope_missing";
  if (error?.authError || error?.requiresReconnect) return "auth_error";
  if (error?.notFound) return "not_found";
  if (error?.transient || Number(error?.status || 0) === 429 || Number(error?.status || 0) >= 500) return "transient_error";
  return "transient_error";
}

export async function fetchYouTubePostMetrics({ accessToken, externalIds }) {
  const ids = [...new Set((externalIds || []).filter(Boolean))].slice(0, 50);
  if (!ids.length) throw apiError("YouTube publish receipt has no video id", { notFound: true });
  const params = new URLSearchParams({ part: "statistics", id: ids.join(",") });
  const data = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, "Could not fetch YouTube video statistics");
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) throw apiError("YouTube video was not found", { notFound: true });
  return {
    metrics: normalizePerformanceMetrics({
      views: sumMetric(items.map((item) => item?.statistics?.viewCount)),
      likes: sumMetric(items.map((item) => item?.statistics?.likeCount)),
      comments: sumMetric(items.map((item) => item?.statistics?.commentCount)),
    }),
    raw: { items: items.map((item) => ({ id: item?.id, statistics: item?.statistics || {} })) },
  };
}

export async function fetchTikTokPostMetrics({ accessToken, externalIds, connection }) {
  if (!connectionHasPermission(connection, TIKTOK_REQUIRED_SCOPE)) {
    throw apiError("TikTok video.list permission is required for performance collection", { scopeMissing: true });
  }
  const ids = [...new Set((externalIds || []).filter(Boolean))].slice(0, 20);
  if (!ids.length) throw apiError("TikTok publish receipt has no public post id", { notFound: true });
  const fields = "id,like_count,comment_count,share_count,view_count";
  const data = await fetchJson(`https://open.tiktokapis.com/v2/video/query/?fields=${encodeURIComponent(fields)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filters: { video_ids: ids } }),
  }, "Could not fetch TikTok video statistics");
  const videos = Array.isArray(data?.data?.videos) ? data.data.videos : [];
  if (!videos.length) throw apiError("TikTok video was not found", { notFound: true, raw: data });
  return {
    metrics: normalizePerformanceMetrics({
      views: sumMetric(videos.map((item) => item?.view_count)),
      likes: sumMetric(videos.map((item) => item?.like_count)),
      comments: sumMetric(videos.map((item) => item?.comment_count)),
      shares: sumMetric(videos.map((item) => item?.share_count)),
    }),
    raw: { videos },
  };
}

function pinterestDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function aggregatePinterestDailyMetrics(data) {
  const containers = Object.values(data || {}).filter((value) => value && typeof value === "object");
  const rows = containers.flatMap((container) => Array.isArray(container?.daily_metrics) ? container.daily_metrics : []);
  const totals = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row?.metrics || {})) {
      const parsed = finiteNumber(value);
      if (parsed !== null) totals[key] = Number(totals[key] || 0) + parsed;
    }
  }
  return totals;
}

export async function fetchPinterestPostMetrics({ accessToken, externalIds, publishedAt, now = new Date() }) {
  const pinId = String(externalIds?.[0] || "").trim();
  if (!pinId) throw apiError("Pinterest publish receipt has no Pin id", { notFound: true });
  const startFloor = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
  const published = new Date(publishedAt || startFloor);
  const start = published > startFloor ? published : startFloor;
  const params = new URLSearchParams({
    start_date: pinterestDate(start),
    end_date: pinterestDate(now),
    app_types: "ALL",
    metric_types: [
      "IMPRESSION",
      "SAVE",
      "PIN_CLICK",
      "OUTBOUND_CLICK",
    ].join(","),
    split_field: "NO_SPLIT",
  });
  const data = await fetchJson(`https://api.pinterest.com/v5/pins/${encodeURIComponent(pinId)}/analytics?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  }, "Could not fetch Pinterest Pin analytics");
  const totals = aggregatePinterestDailyMetrics(data);
  return {
    metrics: normalizePerformanceMetrics({
      impressions: totals.IMPRESSION,
      saves: totals.SAVE,
      clicks: sumMetric([totals.PIN_CLICK, totals.OUTBOUND_CLICK]),
    }),
    raw: { totals, window: { start_date: pinterestDate(start), end_date: pinterestDate(now) } },
  };
}

function mapMetaInsightValues(data) {
  const values = {};
  for (const item of Array.isArray(data?.data) ? data.data : []) {
    const name = String(item?.name || item?.title || "").trim();
    if (!name) continue;
    const totalValue = finiteNumber(item?.total_value?.value);
    const firstValue = finiteNumber(item?.values?.[0]?.value);
    values[name] = totalValue ?? firstValue;
  }
  return values;
}

export async function fetchInstagramPostMetrics({ accessToken, externalIds }) {
  const mediaId = String(externalIds?.[0] || "").trim();
  if (!mediaId) throw apiError("Instagram publish receipt has no media id", { notFound: true });
  const version = String(process.env.INSTAGRAM_GRAPH_API_VERSION || "v21.0").trim();
  const base = `https://graph.instagram.com/${version}/${encodeURIComponent(mediaId)}`;
  const metadataParams = new URLSearchParams({ fields: "id,media_type,like_count,comments_count", access_token: accessToken });
  const metadata = await fetchJson(`${base}?${metadataParams.toString()}`, {}, "Could not fetch Instagram media metadata");

  let insights = {};
  let insightUnavailable = null;
  const insightMetricAttempts = [
    "views,reach,saved,shares,total_interactions",
    "views,reach",
  ];
  for (const metric of insightMetricAttempts) {
    try {
      const insightParams = new URLSearchParams({ metric, access_token: accessToken });
      const insightData = await fetchJson(`${base}/insights?${insightParams.toString()}`, {}, "Could not fetch Instagram media insights");
      insights = mapMetaInsightValues(insightData);
      insightUnavailable = null;
      break;
    } catch (error) {
      if (error?.scopeMissing || Number(error?.status || 0) === 400) {
        insightUnavailable = String(error?.message || "Instagram insight metrics unavailable").slice(0, 500);
        continue;
      }
      throw error;
    }
  }

  return {
    metrics: normalizePerformanceMetrics({
      views: insights.views,
      reach: insights.reach,
      likes: metadata?.like_count ?? insights.likes,
      comments: metadata?.comments_count ?? insights.comments,
      shares: insights.shares,
      saves: insights.saved,
      engagements: insights.total_interactions,
    }),
    raw: { metadata, insights, insight_unavailable: insightUnavailable },
  };
}


export async function fetchThreadsPostMetrics({ accessToken, externalIds, connection }) {
  if (!connectionHasPermission(connection, THREADS_REQUIRED_SCOPE)) {
    throw apiError("Threads threads_manage_insights permission is required for performance collection", { scopeMissing: true });
  }

  const threadId = String(externalIds?.[0] || "").trim();
  if (!threadId) throw apiError("Threads publish receipt has no thread id", { notFound: true });

  const metricAttempts = [
    "views,likes,replies,reposts,quotes,shares",
    "likes,replies,reposts,quotes",
    "likes,replies",
  ];
  let insightData = null;
  let unavailable = null;

  for (const metric of metricAttempts) {
    try {
      const params = new URLSearchParams({ metric, access_token: accessToken });
      insightData = await fetchJson(
        `https://graph.threads.net/v1.0/${encodeURIComponent(threadId)}/insights?${params.toString()}`,
        {},
        "Could not fetch Threads post insights"
      );
      unavailable = null;
      break;
    } catch (error) {
      if (error?.scopeMissing || Number(error?.status || 0) === 400) {
        unavailable = String(error?.message || "Threads insight metrics unavailable").slice(0, 500);
        if (error?.scopeMissing) throw error;
        continue;
      }
      throw error;
    }
  }

  if (!insightData) {
    throw apiError(unavailable || "Threads post insights are unavailable", { notFound: false, transient: true });
  }

  const insights = mapMetaInsightValues(insightData);
  const propagated = insights.shares ?? sumMetric([insights.reposts, insights.quotes]);

  return {
    metrics: normalizePerformanceMetrics({
      views: insights.views,
      likes: insights.likes,
      comments: insights.replies,
      shares: propagated,
    }),
    raw: {
      insights,
      provider_breakdown: {
        replies: insights.replies ?? null,
        reposts: insights.reposts ?? null,
        quotes: insights.quotes ?? null,
        shares: insights.shares ?? null,
      },
      unavailable,
    },
  };
}

export async function fetchFacebookPostMetrics({ accessToken, externalIds }) {
  const objectId = String(externalIds?.[0] || "").trim();
  if (!objectId) throw apiError("Facebook publish receipt has no post id", { notFound: true });
  const version = String(process.env.FACEBOOK_GRAPH_API_VERSION || "v25.0").trim();
  const base = `https://graph.facebook.com/${version}/${encodeURIComponent(objectId)}`;
  let metadata = null;
  let unavailable = null;
  const fieldAttempts = [
    "id,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares",
    "id,reactions.limit(0).summary(true),comments.limit(0).summary(true)",
    "id",
  ];
  for (const fields of fieldAttempts) {
    try {
      const params = new URLSearchParams({ fields, access_token: accessToken });
      metadata = await fetchJson(`${base}?${params.toString()}`, {}, "Could not fetch Facebook post engagement");
      break;
    } catch (error) {
      if (Number(error?.status || 0) === 400 && !error?.scopeMissing && !error?.authError) {
        unavailable = String(error?.message || "Facebook engagement field unavailable").slice(0, 500);
        continue;
      }
      throw error;
    }
  }
  if (!metadata) throw apiError("Facebook post engagement is unavailable", { notFound: true });

  return {
    metrics: normalizePerformanceMetrics({
      likes: metadata?.reactions?.summary?.total_count,
      comments: metadata?.comments?.summary?.total_count,
      shares: metadata?.shares?.count,
    }),
    raw: { metadata, unavailable },
  };
}

const PERFORMANCE_PROVIDER_REGISTRY = Object.freeze({
  facebook: ({ accessToken, externalIds }) => fetchFacebookPostMetrics({ accessToken, externalIds }),
  instagram: ({ accessToken, externalIds }) => fetchInstagramPostMetrics({ accessToken, externalIds }),
  threads: ({ accessToken, externalIds, connection }) => fetchThreadsPostMetrics({ accessToken, externalIds, connection }),
  pinterest: ({ accessToken, externalIds, publishedAt, now }) => fetchPinterestPostMetrics({ accessToken, externalIds, publishedAt, now }),
  tiktok: ({ accessToken, externalIds, connection }) => fetchTikTokPostMetrics({ accessToken, externalIds, connection }),
  youtube: ({ accessToken, externalIds }) => fetchYouTubePostMetrics({ accessToken, externalIds }),
});

export async function collectProviderMetrics({ platform, accessToken, externalIds, connection, publishedAt, now = new Date() }) {
  const normalizedPlatform = String(platform || "").toLowerCase();
  const collector = PERFORMANCE_PROVIDER_REGISTRY[normalizedPlatform];
  if (!collector) {
    throw apiError(`Performance collection is not supported for ${platform}`, { scopeMissing: false });
  }
  return collector({ accessToken, externalIds, connection, publishedAt, now });
}

export function buildPerformanceRow({ post, platform, externalIds, contentTypeId, metrics, raw, capturedAt = new Date() }) {
  const captured = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const normalized = normalizePerformanceMetrics(metrics);
  return {
    post_id: post.id,
    platform,
    user_id: post.user_id,
    brand_profile_id: post.brand_profile_id,
    external_post_id: String(externalIds?.[0] || "").trim() || null,
    content_type_id: String(contentTypeId || post.post_type || "").trim().toLowerCase() || null,
    content_format: String(post.content_format || "").trim().toLowerCase() || null,
    published_at: post.published_at || null,
    captured_at: captured.toISOString(),
    age_hours: hoursBetween(post.published_at, captured),
    ...normalized,
    metric_schema_version: PERFORMANCE_SCHEMA_VERSION,
    provider_payload: raw && typeof raw === "object" ? raw : {},
  };
}
