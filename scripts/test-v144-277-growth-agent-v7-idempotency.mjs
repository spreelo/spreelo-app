import assert from "node:assert/strict";
import fs from "node:fs";
import { buildGrowthAgentClosedLoopCycleKey } from "../lib/growthAgent.js";

const base = {
  userId: "00000000-0000-0000-0000-000000000001",
  brandProfileId: "00000000-0000-0000-0000-000000000002",
  mode: "shadow",
  goalId: "sell_more",
  selectedPlatforms: ["facebook", "instagram"],
  planSource: "shadow_candidate",
  planningEventId: "event-123",
};
const a = buildGrowthAgentClosedLoopCycleKey(base);
const b = buildGrowthAgentClosedLoopCycleKey({ ...base, selectedPlatforms: ["instagram", "facebook"] });
assert.equal(a, b, "platform order must not change idempotency key");
assert.match(a, /^v7:[a-f0-9]{64}$/);
assert.notEqual(a, buildGrowthAgentClosedLoopCycleKey({ ...base, planningEventId: "event-124" }));

const fallbackA = buildGrowthAgentClosedLoopCycleKey({ ...base, planningEventId: null, now: 1_000_000 });
const fallbackB = buildGrowthAgentClosedLoopCycleKey({ ...base, planningEventId: null, now: 1_000_100 });
assert.equal(fallbackA, fallbackB, "fallback retries inside the same window must dedupe");

const growth = fs.readFileSync(new URL("../lib/growthAgent.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/automation/page.jsx", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/v144_277_growth_agent_v7_closed_loop_idempotency.sql", import.meta.url), "utf8");

assert.match(growth, /cycle_key: cycleKey/);
assert.match(growth, /error\?\.code.*23505/s);
assert.match(growth, /\.eq\("cycle_key", cycleKey\)/);
assert.match(route, /planningEventId = null/);
assert.match(route, /planningEventId,/);
assert.match(page, /growthPlanEventRef/);
assert.match(page, /planningEventId/);
assert.match(sql, /add column if not exists cycle_key text/);
assert.match(sql, /create unique index if not exists growth_agent_closed_loop_cycle_key_uidx/);
assert.match(sql, /alter column cycle_key set not null/);

console.log("v144.277 Growth Agent V7 idempotency tests passed");
