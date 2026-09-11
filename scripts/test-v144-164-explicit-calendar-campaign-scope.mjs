import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const route = read("app/api/cron/run-automations/route.js");
const automation = read("app/automation/page.jsx");
const social = read("app/social-channels/page.jsx");

// Production campaign classification must use the explicit persisted source only.
const explicitStart = route.indexOf("function isExplicitCalendarCampaignRule(rule)");
const scopedStart = route.indexOf("function isCampaignScopedWebsiteRule(rule)");
const scopedEnd = route.indexOf("function hasProductSearchMetadata(rule)", scopedStart);
assert.ok(explicitStart >= 0 && scopedStart > explicitStart && scopedEnd > scopedStart, "Campaign scope helpers must exist");

const scopedBlock = route.slice(scopedStart, scopedEnd);
assert.match(scopedBlock, /return isExplicitCalendarCampaignRule\(rule\);/);
for (const legacySignal of [
  "campaign_phase",
  "marketing_angle",
  "customer_stage",
  "cta_strength",
  "campaign_goal",
  "target_customer_need",
  "strategy_notes",
  "campaign_post_index",
  "campaign_post_count",
]) {
  assert.ok(!scopedBlock.includes(`rule?.${legacySignal}`), `Ordinary strategy field ${legacySignal} must not classify a rule as a calendar campaign`);
}

// Execute the real two helper functions without touching external services.
const explicitEnd = route.indexOf("function getCustomerFacingCampaignTheme(rule)", explicitStart);
const explicitSource = route.slice(explicitStart, explicitEnd);
const scopedSource = scopedBlock;
const factory = new Function(`${explicitSource}\n${scopedSource}\nreturn { isExplicitCalendarCampaignRule, isCampaignScopedWebsiteRule };`);
const { isCampaignScopedWebsiteRule } = factory();

const ordinaryStrategicRule = {
  queue_source: "content_studio",
  campaign_phase: "conversion",
  marketing_angle: "product_push",
  campaign_goal: "Sell more",
  strategy_notes: "Use a strong product angle",
  campaign_post_index: 2,
  campaign_post_count: 5,
};
assert.equal(
  isCampaignScopedWebsiteRule(ordinaryStrategicRule),
  false,
  "A normal AI plan carrying strategic fields must stay outside calendar-campaign selection"
);
assert.equal(
  isCampaignScopedWebsiteRule({ queue_source: "campaign" }),
  true,
  "A real calendar campaign must keep campaign-scoped product selection"
);
assert.equal(
  isCampaignScopedWebsiteRule({ queue_source: " Campaign " }),
  true,
  "Campaign queue-source normalization must remain tolerant of casing/whitespace"
);
assert.equal(isCampaignScopedWebsiteRule({}), false);

// Creation remains explicit and unchanged: only real campaign slots persist queue_source=campaign.
assert.ok(
  automation.includes('queue_source: slot.isCampaignSlot ? "campaign" : "content_studio"'),
  "Saved rules must continue to carry an explicit queue_source discriminator"
);
assert.ok(
  automation.includes('isCampaignSlot: rule.queue_source === "campaign"'),
  "Existing rules loaded into the planner must use queue_source, not strategy metadata"
);
assert.ok(
  automation.includes('(rule) => rule?.queue_source === "campaign"'),
  "Grouped existing rules must use queue_source for campaign identity"
);
assert.ok(
  !automation.includes('rule.queue_source === "campaign" || rule.campaign_goal || rule.campaign_phase'),
  "Single-rule planner mode must not fall back to campaign goal/phase"
);

// Failure safety: all existing discovery fallbacks remain present. This patch only changes classification.
assert.ok(route.includes("Starting bounded product web-research fallback"), "Bounded web-research fallback must remain available");
assert.ok(route.includes("local_candidates_exhausted"), "Local exhaustion fallback reason must remain available");
assert.ok(route.includes("Product Engine V2"), "Product Engine path must remain intact");
assert.ok(route.includes("Store Map Product Agent"), "Store Map path must remain intact");

// Scope guard: Social Channels stays byte-for-byte unchanged.
const socialDigest = crypto.createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified baseline"
);

console.log("v144.164 explicit calendar-campaign scope regression checks passed.");
