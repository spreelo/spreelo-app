import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/v144_225_grow_brain_performance_learning.sql");
const cron = read("app/api/cron/analyze-brand-performance/route.js");
const vercel = read("vercel.json");
const planner = read("app/api/plan-content/route.js");

assert.match(migration, /create table if not exists public\.brand_performance_insights/);
assert.match(migration, /create table if not exists public\.brand_performance_learning_state/);
assert.match(migration, /grant select on public\.brand_performance_insights to authenticated/);
assert.match(migration, /unique \(brand_profile_id, dimension_type, platform, dimension_key\)/);
assert.match(cron, /rebuildBrandPerformanceInsights/);
assert.match(cron, /ANALYSIS_BATCH_LIMIT = 20/);
assert.match(vercel, /\/api\/cron\/analyze-brand-performance/);
assert.doesNotMatch(planner, /brand_performance_insights/);

const modulePath = pathToFileURL(path.join(root, "lib/performanceLearning.js")).href;
const learning = await import(modulePath);
const now = new Date("2026-09-20T12:00:00Z");
const rows = [];
for (let index = 0; index < 4; index += 1) {
  rows.push({
    post_id: `high-${index}`,
    user_id: "u1",
    brand_profile_id: "b1",
    platform: "instagram",
    content_type_id: "tips",
    content_format: "single_image",
    published_at: `2026-09-${10 + index}T10:00:00Z`,
    age_hours: 48,
    reach: 10000,
    engagements: 1000,
    shares: 120,
    saves: 90,
    clicks: 160,
  });
  rows.push({
    post_id: `low-${index}`,
    user_id: "u1",
    brand_profile_id: "b1",
    platform: "instagram",
    content_type_id: "website_item",
    content_format: "animated_video",
    published_at: `2026-09-${10 + index}T12:00:00Z`,
    age_hours: 48,
    reach: 10000,
    engagements: 100,
    shares: 10,
    saves: 6,
    clicks: 20,
  });
}

const result = learning.analyzeBrandPerformance(rows, { now });
assert.equal(result.eligible_post_count, 8);
assert.equal(result.state, "early");
const tips = result.insights.find((item) => item.dimension_type === "content_type" && item.dimension_key === "tips");
const product = result.insights.find((item) => item.dimension_type === "content_type" && item.dimension_key === "website_item");
assert.ok(tips, "tips insight should exist");
assert.ok(product, "website_item insight should exist");
assert.ok(tips.performance_score > 0, "high-engagement content should score positively");
assert.ok(product.performance_score < 0, "low-engagement content should score negatively");
assert.ok(tips.confidence > 0 && tips.confidence < 1);
assert.equal(tips.evidence_json.scoring.baseline, "same_platform_median");

console.log("v144.225 Grow Brain performance learning checks passed.");
