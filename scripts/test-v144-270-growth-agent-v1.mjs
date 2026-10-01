import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildGrowthAgentPlanningContext,
  getGrowthAgentFormatAdjustment,
} from "../lib/growthAgent.js";

const context = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: [
    { id: "website_item", category: "product" },
    { id: "tips", category: "education" },
    { id: "engagement_humor", category: "engagement" },
  ],
  recentHistory: [
    { content_type_id: "tips", product_titles: [] },
    { content_type_id: "tips", product_titles: [] },
    { content_type_id: "website_item", product_titles: ["Product A"] },
  ],
  activeRules: [{ content_type_id: "tips", is_active: true }],
  performancePlanning: {
    active: true,
    positive_signals: [
      { dimension_type: "content_type", dimension_key: "website_item", performance_score: 70, confidence: 0.8, observation_count: 9, signal: "strong_positive" },
    ],
  },
  customerLearning: { learning_state: "established" },
});

assert.equal(context.enabled, true);
assert.ok(["v1", "v3", "v4", "v5", "v6", "v7"].includes(context.version));
assert.equal(context.policy.ai_calls_per_plan, 1);
assert.equal(context.policy.preserve_existing_engines, true);
assert.ok(context.recently_used_products.some((item) => item.title === "product a"));
assert.ok(getGrowthAgentFormatAdjustment(context, "tips") < 0, "overused format should be gently reduced");
assert.ok(getGrowthAgentFormatAdjustment(context, "website_item") > getGrowthAgentFormatAdjustment(context, "tips"));

const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const automation = fs.readFileSync(new URL("../app/automation/page.jsx", import.meta.url), "utf8");
assert.match(route, /GROWTH AGENT V(?:1|3|4|5|6|7)/);
assert.match(route, /isGrowthAgentV1EnabledForUser|loadGrowthAgentMode/);
const helper = fs.readFileSync(new URL("../lib/growthAgent.js", import.meta.url), "utf8");
assert.match(helper, /preserve_existing_engines/);
assert.match(route, /product_focus/);
assert.match(automation, /Growth Agent reasoning/);
assert.match(automation, /Product selection focus/);
assert.doesNotMatch(route, /from\("shopify_products"\).*delete/s);

console.log("v144.270 Growth Agent V1 tests passed");
