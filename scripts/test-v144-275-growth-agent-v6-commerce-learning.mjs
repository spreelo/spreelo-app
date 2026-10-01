import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildGrowthAgentCommerceProfile,
  buildGrowthAgentPlanningContext,
  getGrowthAgentFormatAdjustment,
} from "../lib/growthAgent.js";

const formats = [
  { id: "website_item", category: "product" },
  { id: "tips", category: "value" },
];

const commerceProfile = buildGrowthAgentCommerceProfile({
  commerceEvents: [
    { event_type: "purchase", occurred_at: "2026-09-25T12:00:00Z", content_type_id: "website_item", amount: 599, currency: "SEK", attribution_confidence: 0.85, source_provider: "shopify" },
    { event_type: "purchase", occurred_at: "2026-09-26T12:00:00Z", content_type_id: "website_item", amount: 299, currency: "SEK", attribution_confidence: 0.8, source_provider: "shopify" },
    { event_type: "conversion", occurred_at: "2026-09-27T12:00:00Z", content_type_id: "website_item", attribution_confidence: 0.7, source_provider: "analytics" },
    { event_type: "lead", occurred_at: "2026-09-28T12:00:00Z", content_type_id: "tips", attribution_confidence: 0.55, source_provider: "analytics" },
  ],
  performancePlanning: { active: true },
  webDataConnection: { provider: "shopify", status: "connected" },
});

assert.equal(commerceProfile.version, 6);
assert.equal(commerceProfile.learning_state, "early");
assert.equal(commerceProfile.provider, "shopify");
assert.equal(commerceProfile.commerce_event_count, 4);
assert.equal(commerceProfile.attributed_event_count, 4);
assert.equal(commerceProfile.purchase_like_event_count, 4);
assert.equal(commerceProfile.total_revenue, 898);
assert.match(commerceProfile.traffic_proxy_note, /not treated as purchases/i);

const collecting = buildGrowthAgentCommerceProfile({
  commerceEvents: [
    { event_type: "product_view", content_type_id: "website_item", attribution_confidence: 0.2 },
  ],
  performancePlanning: { active: true },
});
assert.equal(collecting.learning_state, "collecting");
assert.equal(collecting.attributed_event_count, 0);

const withCommerce = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: formats,
  recentHistory: [],
  activeRules: [],
  commerceProfile,
});
const withoutCommerce = buildGrowthAgentPlanningContext({
  enabled: true,
  goalId: "sell_more",
  selectedPlatforms: ["instagram"],
  availableFormats: formats,
  recentHistory: [],
  activeRules: [],
});
assert.ok(["v6", "v7"].includes(withCommerce.version));
assert.equal(withCommerce.commerce_profile.learning_state, "early");
assert.ok(getGrowthAgentFormatAdjustment(withCommerce, "website_item") > getGrowthAgentFormatAdjustment(withoutCommerce, "website_item"));
assert.ok(getGrowthAgentFormatAdjustment(withCommerce, "website_item") <= 9);

const route = fs.readFileSync(new URL("../app/api/plan-content/route.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/customers/[id]/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/admin/customers/[id]/page.jsx", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/v144_275_growth_agent_v6_commerce_learning.sql", import.meta.url), "utf8");
assert.match(route, /growth_agent_commerce_events/);
assert.match(route, /buildGrowthAgentCommerceProfile/);
assert.match(route, /commerce learning may use only explicitly normalized commerce events/i);
assert.match(api, /growth_agent_commerce_profiles/);
assert.match(page, /growthAgentCommerceState/);
assert.match(sql, /create table if not exists public\.growth_agent_commerce_events/);
assert.match(sql, /create table if not exists public\.growth_agent_commerce_profiles/);
assert.match(sql, /Clicks are not inserted as purchases or revenue/);
assert.match(sql, /revoke all on table public\.growth_agent_commerce_events from public, anon, authenticated/);

console.log("v144.275 Growth Agent V6 Commerce Learning tests passed");
