import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GROWTH_AGENT_CLOSED_LOOP_VERSION,
  buildGrowthAgentClosedLoopSnapshot,
  buildGrowthAgentPlanningContext,
} from "../lib/growthAgent.js";

assert.equal(GROWTH_AGENT_CLOSED_LOOP_VERSION, 7);

const snapshot = buildGrowthAgentClosedLoopSnapshot({
  growthProfile: {
    version: 3,
    learning_state: "early",
    data_quality: "developing",
    observation_count: 18,
    evidence_count: 4,
    average_confidence: 0.62,
  },
  commerceProfile: {
    version: 6,
    learning_state: "early",
    attributed_event_count: 3,
    purchase_like_event_count: 2,
    total_revenue: 898,
    average_attribution_confidence: 0.74,
  },
});

assert.equal(snapshot.observation_count, 18);
assert.equal(snapshot.evidence_count, 4);
assert.equal(snapshot.commerce_attributed_event_count, 3);
assert.equal(snapshot.commerce_total_revenue, 898);

const context = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: [{ id: "tips", category: "value" }],
  recentHistory: [],
  activeRules: [],
});
assert.equal(context.version, "v7");
assert.equal(context.policy.closed_loop_feedback_enabled, true);
assert.equal(context.policy.closed_loop_feedback_is_not_causation, true);
assert.equal(context.policy.no_existing_calendar_rewrites, true);

const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/customers/[id]/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/admin/customers/[id]/page.jsx", import.meta.url), "utf8");
const labels = fs.readFileSync(new URL("../lib/i18n/defaultLabels.js", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/v144_276_growth_agent_v7_closed_loop.sql", import.meta.url), "utf8");

assert.match(route, /reconcileGrowthAgentClosedLoopCycles/);
assert.match(route, /saveGrowthAgentClosedLoopCycle/);
assert.match(route, /GROWTH AGENT V7 .* CLOSED LOOP/);
assert.match(route, /feedback, never as proof that a plan caused the result/i);
assert.match(api, /growth_agent_closed_loop_cycles/);
assert.match(api, /closedLoopCycles/);
assert.match(page, /growthAgentClosedLoopStatus/);
assert.match(labels, /growthAgentClosedLoopFeedbackValue/);
assert.match(sql, /create table if not exists public\.growth_agent_closed_loop_cycles/);
assert.match(sql, /active calendars are never rewritten/i);
assert.match(sql, /not treated as causal proof/i);
assert.match(sql, /revoke all on table public\.growth_agent_closed_loop_cycles from public, anon, authenticated/);

console.log("v144.276 Growth Agent V7 Closed Loop tests passed");
