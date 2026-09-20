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
    dimension_key: "website_item",
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
    dimension_key: "website_item",
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
    dimension_type: "platform_content_type",
    platform: "facebook",
    dimension_key: "website_item",
    observation_count: 8,
    confidence: 0.68,
    performance_score: 27,
    signal: "positive",
    relative_exposure: 1.12,
    relative_engagement: 1.32,
    relative_click: 1.08,
    relative_share: 1.23,
    relative_save: 1.18,
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

const established = learning.getPerformanceLearningContentTypeAdjustment(insights, "website_item", {
  goalId: "get_followers",
  selectedPlatforms: ["instagram"],
  learningState: "established",
  maxAdjustment: 14,
});
const early = learning.getPerformanceLearningContentTypeAdjustment(insights, "website_item", {
  goalId: "get_followers",
  selectedPlatforms: ["instagram"],
  learningState: "early",
  maxAdjustment: 14,
});
const collecting = learning.getPerformanceLearningContentTypeAdjustment(insights, "website_item", {
  goalId: "get_followers",
  selectedPlatforms: ["instagram"],
  learningState: "collecting",
  maxAdjustment: 14,
});
const negative = learning.getPerformanceLearningContentTypeAdjustment(insights, "animated_website_item", {
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  learningState: "established",
  maxAdjustment: 14,
});
const instagram = established;
const facebook = learning.getPerformanceLearningContentTypeAdjustment(insights, "website_item", {
  goalId: "get_followers",
  selectedPlatforms: ["facebook"],
  learningState: "established",
  maxAdjustment: 14,
});
const goalValues = ["sell_more", "get_followers", "build_trust"].map((goalId) => learning.getPerformanceLearningContentTypeAdjustment(insights, "website_item", {
  goalId,
  selectedPlatforms: ["instagram"],
  learningState: "established",
  maxAdjustment: 14,
}));

assert.ok(established > 0, "positive evidence should increase planning weight");
assert.ok(negative < 0, "negative evidence should reduce planning weight");
assert.equal(collecting, 0, "collecting state must have zero influence");
assert.ok(Math.abs(early) < Math.abs(established), "early influence should be weaker than established influence");
assert.ok(Math.abs(established) <= 14 && Math.abs(negative) <= 14, "Step 4 adjustment cap must remain intact");
assert.notEqual(instagram, facebook, "platform-specific evidence should alter the adjustment");
assert.ok(new Set(goalValues.map((value) => value.toFixed(2))).size > 1, "goal-specific metric weighting should change the adjustment");

const route = read("app/api/admin/grow-brain-step4-test/route.js");
assert.match(route, /getPerformanceLearningContentTypeAdjustment/);
assert.match(route, /getContentGoalWeight/);
assert.match(route, /positive_signal_boosts/);
assert.match(route, /negative_signal_reduces/);
assert.match(route, /collecting_has_zero_influence/);
assert.match(route, /early_is_weaker_than_established/);
assert.match(route, /influence_cap_respected/);
assert.match(route, /no_hard_bans/);
assert.match(route, /goal_sensitive/);
assert.match(route, /platform_aware/);
assert.match(route, /planner_context_active/);

const page = read("app/grow-brain/page.jsx");
assert.match(page, /runStep4PlanningTest/);
assert.match(page, /grow-brain-step4-test/);
assert.match(page, /grow-v230-step4-scenarios/);
assert.match(page, /step4TestBeforeAfter/);

const labels = read("lib/i18n/defaultLabels.js");
assert.match(labels, /growBrain\.step4TestTitle/);
assert.match(labels, /growBrain\.step4Check\.positive_signal_boosts/);
assert.match(labels, /growBrain\.step4Check\.no_hard_bans/);

const css = read("app/styles/154-v144-230-grow-brain-step4-verification.css");
assert.match(css, /grow-v230-step4-scenarios/);
assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css, /@media\(max-width:760px\)/);

console.log("v144.230 Grow Brain Step 4 verification harness checks passed.");
