import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPerformanceRow,
  connectionHasPermission,
  extractExternalPostIds,
  extractPostPerformanceTargets,
  nextCollectionDelayHours,
  normalizePerformanceMetrics,
} from "../lib/postPerformance.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

assert.deepEqual(extractExternalPostIds("youtube", { video_id: "yt-1" }), ["yt-1"]);
assert.deepEqual(extractExternalPostIds("instagram", { media_id: "ig-1" }), ["ig-1"]);
assert.deepEqual(extractExternalPostIds("facebook", { post_id: "fb-post", object_id: "fb-object" }), ["fb-post", "fb-object"]);
assert.deepEqual(extractExternalPostIds("tiktok", { post_ids: ["tt-1", "tt-2", "tt-1"] }), ["tt-1", "tt-2"]);
assert.equal(connectionHasPermission({ permissions: ["video.publish", "video.list"] }, "video.list"), true);
assert.equal(connectionHasPermission({ permissions: "video.publish,user.info.basic" }, "video.list"), false);

const normalized = normalizePerformanceMetrics({ views: "100", likes: 10, comments: 4, shares: 3, saves: 2, clicks: 1 });
assert.equal(normalized.views, 100);
assert.equal(normalized.engagements, 20);
assert.equal(normalized.reach, null);

const targets = extractPostPerformanceTargets({
  published_targets: ["instagram", "youtube", "threads"],
  publish_receipts: {
    instagram: { media_id: "ig-7" },
    youtube: { video_id: "yt-7" },
    threads: { thread_id: "th-7" },
  },
});
assert.deepEqual(targets.map((item) => item.platform), ["instagram", "youtube", "threads"]);
assert.deepEqual(targets[0].externalIds, ["ig-7"]);
assert.deepEqual(targets[2].externalIds, ["th-7"]);

const now = new Date("2026-09-19T12:00:00.000Z");
assert.equal(nextCollectionDelayHours({ publishedAt: "2026-09-19T06:00:00.000Z", now }), 3);
assert.equal(nextCollectionDelayHours({ publishedAt: "2026-09-17T06:00:00.000Z", now }), 8);
assert.equal(nextCollectionDelayHours({ publishedAt: "2026-09-01T06:00:00.000Z", now }), 24);
assert.equal(nextCollectionDelayHours({ publishedAt: "2026-07-01T06:00:00.000Z", now }), 72);
assert.equal(nextCollectionDelayHours({ publishedAt: "2026-09-19T06:00:00.000Z", now, status: "scope_missing" }), 336);

const row = buildPerformanceRow({
  post: {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    brand_profile_id: "33333333-3333-3333-3333-333333333333",
    post_type: "problem_solution",
    content_format: "single_image",
    published_at: "2026-09-19T06:00:00.000Z",
  },
  platform: "instagram",
  externalIds: ["ig-9"],
  metrics: { views: 80, likes: 7, comments: 2 },
  raw: { test: true },
  capturedAt: now,
});
assert.equal(row.external_post_id, "ig-9");
assert.equal(row.age_hours, 6);
assert.equal(row.engagements, 9);
assert.equal(row.metric_schema_version, 1);

const migration = read("supabase/v144_213_grow_brain_performance_collection.sql");
const cron = read("app/api/cron/collect-post-performance/route.js");
const publishCron = read("app/api/cron/run-automations/route.js");
const tiktokOAuth = read("lib/tiktokOAuth.js");
const instagramStart = read("app/api/auth/instagram/start/route.js");
const instagramCallback = read("app/api/auth/instagram/callback/route.js");
const vercel = read("vercel.json");

assert.match(migration, /create table if not exists public\.post_performance_latest/);
assert.match(migration, /create table if not exists public\.post_performance_snapshots/);
assert.match(migration, /create table if not exists public\.post_performance_collection_state/);
assert.match(migration, /auth\.uid\(\) = user_id/);
assert.match(cron, /discoverCollectionStates/);
assert.match(cron, /collectProviderMetrics/);
assert.match(cron, /post_performance_snapshots/);
assert.match(cron, /post_performance_latest/);
assert.match(publishCron, /post_id: String\(facebookExternalId\)/);
assert.match(publishCron, /media_id: String\(instagramResult\.id\)/);
assert.match(tiktokOAuth, /"video\.list"/);
assert.match(instagramStart, /instagram_business_manage_insights/);
assert.match(instagramCallback, /instagram_business_manage_insights/);
assert.match(vercel, /collect-post-performance/);

console.log("v144.213 Grow Brain performance collection checks passed.");
