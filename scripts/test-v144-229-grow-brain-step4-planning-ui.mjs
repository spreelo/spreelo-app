import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const learning = await import(pathToFileURL(path.join(root, "lib/performanceLearning.js")).href);

const insights = [
  {
    dimension_type: "content_type",
    platform: "all",
    dimension_key: "tips",
    observation_count: 12,
    confidence: 0.82,
    performance_score: 42,
    signal: "strong_positive",
    relative_exposure: 1.25,
    relative_engagement: 1.75,
    relative_click: 1.18,
    relative_share: 1.9,
    relative_save: 1.7,
  },
  {
    dimension_type: "platform_content_type",
    platform: "instagram",
    dimension_key: "tips",
    observation_count: 8,
    confidence: 0.72,
    performance_score: 48,
    signal: "strong_positive",
    relative_exposure: 1.3,
    relative_engagement: 1.85,
    relative_click: 1.2,
    relative_share: 2.0,
    relative_save: 1.8,
  },
  {
    dimension_type: "content_type",
    platform: "all",
    dimension_key: "animated_website_item",
    observation_count: 10,
    confidence: 0.78,
    performance_score: -38,
    signal: "strong_negative",
    relative_exposure: 0.8,
    relative_engagement: 0.58,
    relative_click: 0.52,
    relative_share: 0.66,
    relative_save: 0.62,
  },
];

const positive = learning.getPerformanceLearningContentTypeAdjustment(insights, "tips", {
  goalId: "get_followers",
  selectedPlatforms: ["instagram"],
  learningState: "established",
});
const negative = learning.getPerformanceLearningContentTypeAdjustment(insights, "animated_website_item", {
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  learningState: "established",
});
const collecting = learning.getPerformanceLearningContentTypeAdjustment(insights, "tips", {
  goalId: "get_followers",
  selectedPlatforms: ["instagram"],
  learningState: "collecting",
});
assert.ok(positive > 0, "reliable positive evidence should boost planning");
assert.ok(negative < 0, "reliable negative evidence should gently reduce planning weight");
assert.equal(collecting, 0, "collecting state must not influence planning");
assert.ok(Math.abs(positive) <= 14 && Math.abs(negative) <= 14, "planning influence must stay capped");

const context = learning.buildPerformanceLearningPlannerContext(insights, {
  goalId: "get_followers",
  selectedPlatforms: ["instagram"],
  learningState: "established",
});
assert.equal(context.active, true);
assert.ok(context.positive_signals.length >= 1);
assert.ok(context.negative_signals.length >= 1);
assert.equal(context.rules.hard_bans, false);
assert.equal(context.rules.preserve_exploration, true);

const planner = read("app/api/plan-content/route.js");
assert.match(planner, /loadBrandPerformancePlanningContext/);
assert.match(planner, /getPerformanceLearningContentTypeAdjustment/);
assert.match(planner, /GROW BRAIN PERFORMANCE SIGNALS/);
assert.match(planner, /Never hard-ban a format from performance learning/);

const cron = read("app/api/cron/run-automations/route.js");
assert.match(cron, /loadAdaptiveWeeklyPerformanceLearning/);
assert.match(cron, /performanceLearningByOwner/);
assert.match(cron, /getPerformanceLearningContentTypeAdjustment/);

const automation = read("app/automation/page.jsx");
assert.match(automation, /selectedPlatforms:\s*slotDestinationKeys/);

const css = read("app/styles/153-v144-229-grow-brain-step4-ui-polish.css");
assert.match(css, /grow-v227-performance-head p[\s\S]*font-size:13\.5px/);
assert.match(css, /grow-v227-insight-title>strong[\s\S]*font-size:13\.5px/);
assert.match(css, /grow-v216-top-card[\s\S]*border:1px solid #e7e8ee!important/);
assert.match(css, /grow-v216-top-metrics small[\s\S]*white-space:normal!important/);

const page = read("app/grow-brain/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
assert.match(page, /performanceLearningPlanningActive/);
assert.match(labels, /growBrain\.performanceLearningPlanningActive/);

console.log("v144.229 Grow Brain Step 4 planning + UI polish checks passed.");
