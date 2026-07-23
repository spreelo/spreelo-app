import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [contentPlanner, campaignPlanner, automationPage, automationCron, packageJson] =
  await Promise.all([
    read("app/api/plan-content/route.js"),
    read("app/api/plan-campaign/route.js"),
    read("app/automation/page.jsx"),
    read("app/api/cron/run-automations/route.js"),
    read("package.json"),
  ]);

// The standard content plan is now generated from the real brand, goal,
// available capabilities and recent successful history.
assert.ok(contentPlanner.includes('allowedGoals = new Set(["sell_more", "get_followers", "build_trust"])'));
assert.ok(contentPlanner.includes('from("automation_run_logs")'));
assert.ok(contentPlanner.includes('from("automation_rules")'));
assert.ok(contentPlanner.includes('from("brand_campaign_opportunities")'));
assert.ok(contentPlanner.includes("RECENT SUCCESSFUL CONTENT, NEWEST FIRST"));
assert.ok(contentPlanner.includes('"rotation_pool"'));
assert.ok(contentPlanner.toLowerCase().includes("look across roughly the last 8-12 weeks"));
assert.ok(contentPlanner.includes("Do not select Custom post/manual_prompt"));
assert.ok(contentPlanner.includes("customer cases, local-angle posts, comparisons or behind-the-scenes posts"));
assert.ok(contentPlanner.includes("buildFallbackItems"));
assert.ok(contentPlanner.includes('source: "fallback"'));

// The content studio requests the dynamic plan and stores an AI-curated
// rotation pool for future weekly runs.
assert.ok(automationPage.includes('fetch("/api/plan-content"'));
assert.ok(automationPage.includes("createDynamicRecommendedSlots"));
assert.ok(automationPage.includes("adaptiveVariants"));
assert.ok(automationPage.includes('selectionMode: "history_balanced"'));
assert.ok(automationPage.includes("slotCount: slots.length"));
assert.ok(automationPage.includes("lockedVariantIndex: 0"));
assert.ok(automationPage.includes("lockedVariantCycle: 0"));
assert.ok(automationPage.includes("contentTypeLabel: type?.label || planningStep.label"));

// Calendar campaigns must resolve to a real format. Egen idé/manual_prompt is
// reserved for a customer-created custom post and is not a campaign fallback.
for (const [sourceMode, contentTypeId] of [
  ["website_product", "website_item"],
  ["website_product_ad", "website_item_text_ad"],
  ["website_reel", "animated_website_item"],
  ["website_carousel", "carousel_website_item"],
  ["website_service", "service_focus"],
  ["problem_solution", "problem_solution"],
  ["tips", "tips"],
  ["faq", "faq"],
  ["checklist", "checklist"],
  ["mistakes", "mistakes"],
  ["myth_fact", "myth_fact"],
  ["mini_guide", "mini_guide"],
  ["seasonal", "seasonal"],
]) {
  assert.ok(
    automationPage.includes(`${sourceMode}: "${contentTypeId}"`),
    `Missing campaign mapping ${sourceMode} -> ${contentTypeId}`
  );
}
assert.ok(automationPage.includes('return mappedContentTypes[sourceMode] || "seasonal"'));
assert.ok(!automationPage.includes('return mappedContentTypes[sourceMode] || "manual_prompt"'));
assert.ok(automationPage.includes("CAMPAIGN_ACTIONABLE_SOURCE_MODES"));
assert.ok(automationPage.includes("if (CAMPAIGN_ACTIONABLE_SOURCE_MODES.has(explicitMode))"));

// New campaign plans and cached plans use only actionable Spreelo formats.
assert.ok(campaignPlanner.includes("actionableContentModes"));
assert.ok(campaignPlanner.includes("planHasOnlyActionableContentModes"));
assert.ok(campaignPlanner.includes("planHasRequiredProductSearchMetadata"));
assert.ok(campaignPlanner.includes("normalizeCampaignContentMode"));
assert.ok(campaignPlanner.includes('"website_product_ad"'));
assert.ok(campaignPlanner.includes('"website_reel"'));
assert.ok(campaignPlanner.includes("Never return generic_campaign, mixed_campaign_and_website"));
assert.ok(campaignPlanner.includes("Do not create customer cases, local-angle posts, comparisons or behind-the-scenes posts"));

// Weekly execution now evaluates approximately twelve weeks of successful
// content and penalizes recent/overused formats before choosing a variant.
assert.ok(automationCron.includes("ADAPTIVE_HISTORY_LOOKBACK_WEEKS = 12"));
assert.ok(automationCron.includes("loadAdaptiveWeeklyHistory"));
assert.ok(automationCron.includes("selectHistoryBalancedAdaptiveVariant"));
assert.ok(automationCron.includes('config.selectionMode === "history_balanced"'));
assert.ok(automationCron.includes("usedTypesByOwner"));
assert.ok(automationCron.includes("rememberAdaptiveWeeklySelection"));
assert.ok(automationCron.includes("recentProductCount"));
assert.ok(automationCron.includes("score -= usesInLastTwenty * 9"));
assert.ok(automationCron.includes("getLockedAdaptiveVariantSelection"));
assert.ok(automationCron.includes("writeAdaptiveVariantLockToStrategyNotes"));
assert.ok(automationCron.includes("ruleUpdatePayload.strategy_notes"));

assert.ok(packageJson.includes('"test:v128"'));

console.log("V128 dynamic strategy planner checks passed.");
