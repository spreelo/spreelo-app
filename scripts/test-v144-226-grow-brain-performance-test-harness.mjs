import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeBrandPerformance } from "../lib/performanceLearning.js";

const route = fs.readFileSync(new URL("../app/api/admin/grow-brain-performance-test/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/grow-brain/page.jsx", import.meta.url), "utf8");

assert.match(route, /getAdminContext/);
assert.match(route, /getTestBrandId/);
assert.match(route, /post_performance_latest/);
assert.match(route, /rebuildBrandPerformanceInsights/);
assert.match(route, /brand_performance_insights/);
assert.match(route, /brand_performance_learning_state/);
assert.match(route, /action === "cleanup"/);
assert.match(page, /grow-brain-performance-test/);
assert.match(page, /runPerformanceEngineTest/);

const now = new Date("2026-09-20T02:00:00Z");
const rows = [];
const platforms = [
  { key: "facebook", exposureBase: 48000 },
  { key: "instagram", exposureBase: 69000 },
];
const cohorts = [
  { type: "website_item", format: "single_image", factor: 1.35, er: 0.074, click: 0.017, share: 0.009, save: 0.012 },
  { type: "problem_solution", format: "single_image", factor: 1.0, er: 0.041, click: 0.010, share: 0.006, save: 0.008 },
  { type: "animated_website_item", format: "animated_video", factor: 0.63, er: 0.015, click: 0.0035, share: 0.002, save: 0.0025 },
];
let seq = 0;
for (const platform of platforms) {
  for (const cohort of cohorts) {
    for (let i = 0; i < 6; i += 1) {
      seq += 1;
      const wobble = 0.92 + ((i * 7 + seq * 3) % 17) / 100;
      const exposure = Math.round(platform.exposureBase * cohort.factor * wobble);
      const engagements = Math.max(1, Math.round(exposure * cohort.er * (0.94 + (i % 3) * 0.04)));
      const shares = Math.max(1, Math.round(exposure * cohort.share));
      const saves = Math.max(1, Math.round(exposure * cohort.save));
      const comments = Math.max(1, Math.round(engagements * 0.08));
      const likes = Math.max(1, engagements - shares - saves - comments);
      rows.push({
        post_id: `00000000-0000-4000-8000-${String(seq).padStart(12,"0")}`,
        platform: platform.key,
        user_id: "00000000-0000-4000-8000-000000000001",
        brand_profile_id: "00000000-0000-4000-8000-000000014226",
        content_type_id: cohort.type,
        content_format: cohort.format,
        published_at: new Date(now.getTime() - (16 + seq) * 86400000).toISOString(),
        captured_at: new Date(now.getTime() - 3600000).toISOString(),
        age_hours: (16 + seq) * 24,
        views: exposure,
        reach: platform.key === "facebook" ? Math.round(exposure * 0.88) : Math.round(exposure * 0.82),
        impressions: platform.key === "instagram" ? Math.round(exposure * 1.06) : null,
        likes, comments, shares, saves,
        clicks: Math.max(1, Math.round(exposure * cohort.click)),
        engagements: likes + comments + shares + saves,
      });
    }
  }
}

const analysis = analyzeBrandPerformance(rows, { now });
assert.equal(analysis.source_post_count, 36);
assert.equal(analysis.eligible_post_count, 36);
assert.equal(analysis.state, "established");
assert.ok(analysis.insight_count > 0);
assert.ok(analysis.insights.some((row) => ["positive","strong_positive"].includes(row.signal)), "expected positive signal");
assert.ok(analysis.insights.some((row) => ["negative","strong_negative"].includes(row.signal)), "expected negative signal");

console.log("v144.226 Grow Brain performance test harness checks passed.");
