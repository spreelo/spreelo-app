import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildGrowthAgentProfile,
  buildGrowthAgentPlanningContext,
  getGrowthProfileFormatAdjustment,
  getGrowthAgentFormatAdjustment,
} from "../lib/growthAgent.js";

const performancePlanning = {
  learning_state: "established",
  active: true,
  positive_signals: [
    { dimension_type: "content_type", dimension_key: "animated_website_item", platform: "instagram", observation_count: 12, confidence: 0.78, goal_adjusted_score: 55, signal: "strong_positive", relative_engagement: 1.8 },
    { dimension_type: "content_type", dimension_key: "tips", platform: "instagram", observation_count: 8, confidence: 0.66, goal_adjusted_score: 28, signal: "positive", relative_save: 1.5 },
    { dimension_type: "platform_content_type", dimension_key: "engagement_humor", platform: "instagram", observation_count: 7, confidence: 0.61, goal_adjusted_score: 18, signal: "positive" },
    { dimension_type: "content_type", dimension_key: "guide_choice", platform: "all", observation_count: 6, confidence: 0.58, goal_adjusted_score: 16, signal: "positive" },
  ],
  negative_signals: [
    { dimension_type: "content_type", dimension_key: "website_item_text_ad", platform: "instagram", observation_count: 10, confidence: 0.72, goal_adjusted_score: -34, signal: "negative" },
    { dimension_type: "content_type", dimension_key: "faq", platform: "instagram", observation_count: 6, confidence: 0.56, goal_adjusted_score: -13, signal: "negative" },
  ],
};

const profile = buildGrowthAgentProfile({
  performancePlanning,
  selectedPlatforms: ["instagram"],
  recentHistory: [
    { content_type_id: "website_item_text_ad" },
    { content_type_id: "website_item_text_ad" },
    { content_type_id: "tips" },
  ],
  customerLearning: { learning_state: "established" },
});

assert.equal(profile.version, 3);
assert.equal(profile.learning_state, "established");
assert.equal(profile.data_quality, "strong");
assert.ok(profile.observation_count > 0);
assert.ok(profile.strengths.some((row) => row.content_type_id === "animated_website_item"));
assert.ok(profile.weaknesses.some((row) => row.content_type_id === "website_item_text_ad"));
assert.ok(getGrowthProfileFormatAdjustment(profile, "animated_website_item") > 0);
assert.ok(getGrowthProfileFormatAdjustment(profile, "website_item_text_ad") < 0);

const collecting = buildGrowthAgentProfile({
  performancePlanning: { learning_state: "collecting", positive_signals: [], negative_signals: [] },
});
assert.equal(collecting.learning_state, "collecting");
assert.equal(getGrowthProfileFormatAdjustment(collecting, "tips"), 0);

const context = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: [
    { id: "animated_website_item", category: "product" },
    { id: "website_item_text_ad", category: "product" },
  ],
  recentHistory: [],
  activeRules: [],
  performancePlanning,
  customerLearning: { learning_state: "established" },
  growthProfile: profile,
});
assert.ok(["v3", "v4", "v5", "v6", "v7"].includes(context.version));
assert.equal(context.growth_profile.version, 3);
assert.ok(getGrowthAgentFormatAdjustment(context, "animated_website_item") > getGrowthAgentFormatAdjustment(context, "website_item_text_ad"));

const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/customers/[id]/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/admin/customers/[id]/page.jsx", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/v144_272_growth_agent_v3_growth_profile.sql", import.meta.url), "utf8");
assert.match(route, /buildGrowthAgentProfile/);
assert.match(route, /saveGrowthAgentProfile/);
assert.match(route, /GROWTH AGENT V(?:3 \+ GROWTH PROFILE|4 \+ GROWTH PROFILE \+ EXPERIMENTS|5 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES|6 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES \+ COMMERCE LEARNING|7 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES \+ COMMERCE LEARNING \+ CLOSED LOOP)/);
assert.match(api, /growth_agent_profiles/);
assert.match(page, /growthAgentLearningState/);
assert.match(sql, /create table if not exists public\.growth_agent_profiles/);
assert.match(sql, /revoke all on table public\.growth_agent_profiles from public, anon, authenticated/);

console.log("v144.272 Growth Agent V3 Growth Profile tests passed");
