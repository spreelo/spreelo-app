import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STRATEGIC_CONTENT_TYPES,
  STRATEGIC_PRODUCT_CONTENT_TYPES,
  STRATEGIC_EDITORIAL_CONTENT_TYPES,
  CONTENT_GOAL_WEIGHTS,
  CONTENT_TYPE_TIMING,
  getContentGoalWeight,
  getContentTypePreferredTimes,
} from "../lib/contentPlanningStrategy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const automation = read("app/automation/page.jsx");
const contentPlanner = read("app/api/plan-content/route.js");
const campaignPlanner = read("app/api/plan-campaign/route.js");
const campaignPolicy = read("lib/calendarCampaignPolicy.js");
const cron = read("app/api/cron/run-automations/route.js");
const recurring = read("app/api/recurring-plan/route.js");
const upcoming = read("app/api/upcoming-plan/route.js");
const planPage = read("app/plans/[id]/page.jsx");
const packageJson = read("package.json");

const expectedProducts = [
  "website_item",
  "website_item_text_ad",
  "animated_website_item",
  "ai_product_video",
  "carousel_website_item",
];
const expectedEditorial = [
  "problem_solution",
  "tips",
  "faq",
  "guide_choice",
  "service_focus",
  "engagement_humor",
];
const expectedStrategic = [...expectedProducts, ...expectedEditorial];

assert.deepEqual([...STRATEGIC_PRODUCT_CONTENT_TYPES], expectedProducts);
assert.deepEqual([...STRATEGIC_EDITORIAL_CONTENT_TYPES], expectedEditorial);
assert.deepEqual([...STRATEGIC_CONTENT_TYPES], expectedStrategic);

// All current automatically selectable formats have one shared timing profile.
for (const id of expectedStrategic) {
  assert.ok(CONTENT_TYPE_TIMING[id], `Missing timing profile for ${id}`);
  assert.ok(getContentTypePreferredTimes(id).length >= 3, `Missing preferred times for ${id}`);
  for (const goal of ["sell_more", "get_followers", "build_trust"]) {
    assert.ok(Number.isFinite(getContentGoalWeight(goal, id)), `Missing ${goal} score for ${id}`);
    assert.ok(CONTENT_GOAL_WEIGHTS[goal][id] > 0, `Non-positive ${goal} score for ${id}`);
  }
}

// Special customer-directed builders must not be silently auto-selected.
for (const id of ["manual_prompt", "giveaway", "focus_source"]) {
  assert.ok(!STRATEGIC_CONTENT_TYPES.includes(id), `${id} must remain customer-directed`);
}

// AI Content Studio uses the shared goal/timing strategy and knows the complete current set.
assert.match(contentPlanner, /CONTENT_GOAL_WEIGHTS, getContentGoalWeight/);
assert.match(contentPlanner, /id:\s*"ai_product_video"/);
assert.match(contentPlanner, /Select service_focus only when there is credible service evidence/);
assert.match(contentPlanner, /Seasonality is a context layer, not a format/);
assert.match(contentPlanner, /Number of posts in the next week: \$\{postCount\}/);
assert.match(automation, /const smartPostingTypePreferences = CONTENT_TYPE_TIMING/);
assert.match(automation, /function getGoalPlanningSteps\(/);
assert.match(automation, /verifiedServiceModeAvailable = hasVerifiedServiceEvidence\(currentBrandProfile\)/);
assert.match(automation, /getGoalPlanningSteps\([\s\S]*?verifiedServiceModeAvailable/);

// Week-to-week variation uses the same goal-fit table, 12-week history and shared timing.
assert.match(cron, /ADAPTIVE_HISTORY_LOOKBACK_WEEKS = 12/);
assert.match(cron, /selectionMode !== "history_balanced"/);
assert.match(cron, /getContentGoalWeight\(goalId, contentTypeId, 60\)/);
assert.match(cron, /isStrategicProductContentType\(contentTypeId\)/);
assert.match(cron, /getContentTypePreferredTimes\(contentTypeId\)/);
assert.match(automation, /selectionMode:\s*"history_balanced"/);
assert.match(automation, /verifiedServiceModeAvailable,[\s\S]*?selectedPlatforms: slotDestinationKeys/);
// Automatic engagement/humour stays on the static AI-image variant unless the customer chooses otherwise manually.
assert.match(automation, /type\.id === "engagement_humor" \? "single_image"/);
assert.match(automation, /creditVariant:\s*type\.id === "engagement_humor" \? "ai_image"/);

// Calendar campaign planner can use every current strategic content type.
const campaignModeByType = {
  website_item: "website_product",
  website_item_text_ad: "website_product_ad",
  animated_website_item: "website_reel",
  ai_product_video: "website_ai_video",
  carousel_website_item: "website_carousel",
  service_focus: "website_service",
  problem_solution: "problem_solution",
  tips: "tips",
  faq: "faq",
  guide_choice: "guide_choice",
  engagement_humor: "engagement_humor",
};
for (const [typeId, sourceMode] of Object.entries(campaignModeByType)) {
  assert.ok(automation.includes(`${typeId}: "${sourceMode}"`), `Missing browser campaign mapping ${typeId}`);
  assert.ok(campaignPlanner.includes(`"${sourceMode}"`), `Missing server campaign mode ${sourceMode}`);
}
assert.match(campaignPlanner, /Select website_service only when verified service evidence exists/);
assert.match(campaignPlanner, /website_ai_video is a premium generative-video format, optional and never mandatory/);
assert.match(campaignPolicy, /campaignSupportsDirectAiProductVideo/);
assert.match(campaignPolicy, /aiVideoCount <= 1/);
assert.match(automation, /function getCampaignTypeAwarePublishTime\(/);
assert.match(automation, /flexibleContentTypeIds/);

// Season/date may influence campaign ideas, but must not force engagement_humor.
for (const source of [automation, campaignPlanner, campaignPolicy]) {
  assert.doesNotMatch(source, /hasTimelyContext/);
  assert.doesNotMatch(source, /season\|holiday[\s\S]{0,250}preferred\.push\("engagement_humor"\)/i);
  assert.doesNotMatch(source, /holiday\|christmas[\s\S]{0,250}engagement_humor/i);
}

// All schedule preview/execution surfaces read the shared timing helper.
for (const source of [recurring, upcoming, planPage]) {
  assert.match(source, /getContentTypePreferredTimes/);
}

// The existing five product-generation contracts remain intact. This release changes planning,
// not the production prompts that made those formats work well.
assert.match(automation, /Create a premium 4:5 editorial product post around the verified product/);
assert.match(automation, /Create a 6-second 9:16 AI product video from the verified product image/);
assert.match(automation, /Identify several concrete products, services, listings, offers or other sellable items from the website/);

assert.ok(packageJson.includes('"test:v144.182"'));
console.log("v144.182 smart content mix + campaign + weekly strategy checks passed.");
