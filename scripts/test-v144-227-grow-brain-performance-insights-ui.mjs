import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../app/grow-brain/page.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/admin/grow-brain-performance-test/route.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/styles/152-v144-227-grow-brain-performance-insights.css", import.meta.url), "utf8");
const labels = fs.readFileSync(new URL("../lib/i18n/defaultLabels.js", import.meta.url), "utf8");
const planner = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");

assert.match(page, /brand_performance_insights/);
assert.match(page, /brand_performance_learning_state/);
assert.match(page, /PerformanceInsightCard/);
assert.match(page, /performanceLearningPlanningActive/);
assert.match(page, /relative_engagement/);
assert.match(page, /relative_exposure/);
assert.match(route, /export async function GET/);
assert.match(route, /has_test_data/);
assert.match(route, /relative_click/);
assert.match(css, /grow-v227-performance-learning/);
assert.match(css, /grow-v227-insight-groups/);
assert.match(labels, /growBrain\.performanceLearningTitle/);
assert.match(labels, /growBrain\.performanceSignal\.strong_positive/);
assert.doesNotMatch(planner, /brand_performance_insights/);

console.log("v144.227 Grow Brain performance insights UI checks passed.");
