import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildGrowthAgentOpportunities,
  buildGrowthAgentPlanningContext,
  getGrowthAgentFormatAdjustment,
} from "../lib/growthAgent.js";

const now = new Date("2026-10-01T00:00:00Z");
const profile = {
  learning_state: "early",
  underexplored_content_types: ["tips"],
  strengths: [],
  weaknesses: [],
};
const productCatalog = [
  { title: "New Sauce", product_url: "https://example.com/new-sauce", is_active: true, last_seen_at: "2026-09-28T00:00:00Z", last_used_at: null, times_used: 0 },
  { title: "Never Used", product_url: "https://example.com/never", is_active: true, last_seen_at: "2026-08-01T00:00:00Z", last_used_at: null, times_used: 0 },
  { title: "Old Favorite", product_url: "https://example.com/old", is_active: true, last_seen_at: "2026-09-30T00:00:00Z", last_used_at: "2026-07-01T00:00:00Z", times_used: 2 },
];
const formats = [
  { id: "tips", category: "value" },
  { id: "website_item", category: "product" },
];
const opportunities = buildGrowthAgentOpportunities({
  productCatalog,
  upcomingCampaigns: [{ title: "Autumn launch", event_date: "2026-10-10", relevance_score: 75 }],
  growthProfile: profile,
  availableFormats: formats,
  now,
});

assert.ok(opportunities.some((item) => item.kind === "new_product" && item.product_title === "New Sauce"));
assert.ok(opportunities.some((item) => item.kind === "unused_product" && item.product_title === "Never Used"));
assert.ok(opportunities.some((item) => item.kind === "stale_product" && item.product_title === "Old Favorite"));
assert.ok(opportunities.some((item) => item.kind === "campaign_window"));
assert.ok(opportunities.some((item) => item.kind === "format_gap" && item.content_type_id === "tips"));
assert.ok(opportunities.length <= 12);

const context = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: formats,
  recentHistory: [],
  activeRules: [],
  growthProfile: profile,
  opportunities,
});
assert.ok(["v5", "v6", "v7"].includes(context.version));
assert.ok(context.opportunities.length > 0);
assert.ok(getGrowthAgentFormatAdjustment(context, "tips") > 0);
assert.ok(getGrowthAgentFormatAdjustment(context, "website_item") > 0);

const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/customers/[id]/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/admin/customers/[id]/page.jsx", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/v144_274_growth_agent_v5_opportunities.sql", import.meta.url), "utf8");
assert.match(route, /buildGrowthAgentOpportunities/);
assert.match(route, /website_product_catalog/);
assert.match(route, /GROWTH AGENT V(?:5 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES|6 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES \+ COMMERCE LEARNING|7 \+ GROWTH PROFILE \+ EXPERIMENTS \+ OPPORTUNITIES \+ COMMERCE LEARNING \+ CLOSED LOOP)/);
assert.match(api, /growth_agent_opportunities/);
assert.match(page, /growthAgentOpportunityReason/);
assert.match(sql, /create table if not exists public\.growth_agent_opportunities/);
assert.match(sql, /never rewrite active calendars/);
assert.match(sql, /revoke all on table public\.growth_agent_opportunities from public, anon, authenticated/);

console.log("v144.274 Growth Agent V5 Opportunity Detection tests passed");
