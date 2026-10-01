import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildGrowthAgentExperiments,
  buildGrowthAgentPlanningContext,
  getGrowthAgentFormatAdjustment,
} from "../lib/growthAgent.js";

const profile = {
  version: 3,
  learning_state: "established",
  data_quality: "strong",
  underexplored_content_types: ["tips", "guide_choice"],
  strengths: [
    { content_type_id: "animated_website_item", observations: 10, confidence: 0.74, score: 44 },
  ],
  weaknesses: [
    { content_type_id: "website_item_text_ad", observations: 9, confidence: 0.69, score: -28 },
  ],
};

const formats = [
  { id: "tips", category: "value" },
  { id: "guide_choice", category: "value" },
  { id: "animated_website_item", category: "product" },
  { id: "website_item_text_ad", category: "product" },
];

const experiments = buildGrowthAgentExperiments({
  growthProfile: profile,
  availableFormats: formats,
  recentHistory: [{ content_type_id: "website_item_text_ad" }],
  goalId: "sell_more",
});
assert.ok(experiments.length >= 2);
assert.ok(experiments.some((item) => item.kind === "content_type_exploration"));
assert.ok(experiments.every((item) => item.max_plan_share <= 0.2));

const context = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: formats,
  recentHistory: [],
  activeRules: [],
  growthProfile: profile,
  experiments,
});
assert.ok(["v4", "v5", "v6", "v7"].includes(context.version));
assert.equal(context.policy.experiment_share_max, 0.2);
assert.ok(context.experiments.length > 0);
assert.ok(getGrowthAgentFormatAdjustment(context, "tips") > 0);
assert.ok(getGrowthAgentFormatAdjustment(context, "animated_website_item") > 0);
assert.ok(getGrowthAgentFormatAdjustment(context, "animated_website_item") > getGrowthAgentFormatAdjustment(context, "website_item_text_ad"));

const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/customers/[id]/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/admin/customers/[id]/page.jsx", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/v144_273_growth_agent_v4_experiments.sql", import.meta.url), "utf8");
assert.match(route, /buildGrowthAgentExperiments/);
assert.match(route, /syncGrowthAgentExperiments/);
assert.match(route, /GROWTH AGENT V(?:4 \+ GROWTH PROFILE \+ EXPERIMENTS|5 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES|6 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES \+ COMMERCE LEARNING|7 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES \+ COMMERCE LEARNING \+ CLOSED LOOP)/);
assert.match(api, /growth_agent_experiments/);
assert.match(page, /growthAgentExperimentHypothesis/);
assert.match(sql, /create table if not exists public\.growth_agent_experiments/);
assert.match(sql, /max_plan_share numeric not null default 0\.2/);
assert.match(sql, /revoke all on table public\.growth_agent_experiments from public, anon, authenticated/);

console.log("v144.273 Growth Agent V4 Experiment Engine tests passed");
