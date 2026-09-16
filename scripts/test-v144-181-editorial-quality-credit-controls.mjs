import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const editorial = read("lib/editorialContentStrategy.js");
const automation = read("app/automation/page.jsx");
const worker = read("app/api/cron/run-automations/route.js");
const sql = read("supabase/v144_181_editorial_quality_post_types_and_credit_controls.sql");
const labels = read("lib/i18n/defaultLabels.js");
const economics = read("lib/contentEconomics.js");
const admin = read("app/admin/content-credits/page.jsx");
const adminApi = read("app/api/admin/content-economics/route.js");
const analysis = read("app/api/analyze-brand/brandAnalysisEngine.js");
const legacyAnalysis = read("app/api/analyze-brand/route.js");
const rescuePackages = read("lib/adminRescuePackages.js");
const rescueUi = read("app/admin/post-approvals/page.jsx");
const rescueFormat = read("lib/postRescueFormat.js");
const kling = read("lib/kling.js");
const campaignPlan = read("app/api/plan-campaign/route.js");
const massTest = read("lib/adminMassTest.js");

// Final customer-facing editorial set.
for (const id of ["problem_solution", "tips", "faq", "guide_choice", "service_focus", "engagement_humor"]) {
  assert.match(editorial, new RegExp(`\\"${id}\\"`));
}
for (const id of ["mistakes", "checklist", "myth_fact", "seasonal", "mini_guide", "behind_scenes", "case_example", "local", "comparison"]) {
  assert.match(editorial, new RegExp(`${id}:`));
  assert.match(sql, new RegExp(`'${id}'`));
}
assert.match(editorial, /seasonal:\s*"tips"/);
assert.doesNotMatch(campaignPlan, /seasonal:\s*"engagement_humor"/);
assert.doesNotMatch(automation, /seasonal:\s*"engagement_humor"/);
assert.doesNotMatch(massTest, /seasonal:\s*"engagement_humor"/);
assert.doesNotMatch(campaignPlan, /season\|holiday[\s\S]{0,250}preferred\.push\("engagement_humor"\)/);
assert.doesNotMatch(campaignPlan, /holiday\|christmas[\s\S]{0,250}preferred\.push\("engagement_humor"\)/);
assert.doesNotMatch(read("lib/calendarCampaignPolicy.js"), /season\|holiday[\s\S]{0,250}preferred\.push\("engagement_humor"\)/);

// Product formats remain the established five and their core contracts stay intact.
for (const id of ["website_item", "website_item_text_ad", "animated_website_item", "ai_product_video", "carousel_website_item"]) {
  assert.match(automation, new RegExp(`id:\\s*"${id}"`));
}
assert.match(automation, /Create a premium 4:5 editorial product post around the verified product/);
assert.match(automation, /Create a 6-second 9:16 AI product video from the verified product image/);
assert.match(automation, /Identify several concrete products, services, listings, offers or other sellable items from the website/);

// Service in focus is independently verified, including mixed product+service businesses.
assert.match(sql, /website_service_mode_available boolean not null default false/);
assert.match(sql, /website_service_source_url text/);
assert.match(editorial, /profile\?\.website_service_mode_available === true/);
assert.match(analysis, /"website_service_mode"/);
assert.match(analysis, /Evaluate website_service_mode independently from website_product_mode/);
assert.match(legacyAnalysis, /"website_service_mode"/);
assert.match(worker, /brandProfile\?\.website_service_source_url/);
assert.match(worker, /String\(rule\?\.content_type_id \|\| ""\)\.trim\(\) !== "service_focus"/);

// Problem & solution prefers website evidence but can safely continue without forcing a product.
assert.match(automation, /type\.id === "problem_solution"\s*\? websiteAvailable/);
assert.match(worker, /editorial_non_product_fallback/);
assert.match(worker, /contentTypeId === "problem_solution"/);
assert.match(worker, /isOptionalEditorialProductUnavailableError/);

// Engagement & humour: manual format selection, video default, DB-driven variant credit prices.
assert.match(automation, /setEngagementMediaVariant\("ai_video"\)/);
for (const variant of ["ai_video", "ai_image", "product_image"]) {
  assert.match(automation, new RegExp(`id:\\s*"${variant}"`));
  assert.match(economics, new RegExp(`${variant}:`));
}
assert.match(sql, /credit_variant_prices jsonb/);
assert.match(adminApi, /credit_variant_prices/);
assert.match(admin, /admin\.contentCredits\.variantPricingTitle/);
assert.match(admin, /ai_video:\s*event\.target\.value/);
assert.match(worker, /ENGAGEMENT_AI_VIDEO_DURATION_SECONDS/);
assert.match(kling, /durationSeconds:\s*requestedDurationSeconds/);
// Automatic/adaptive planning must not silently choose the expensive video variant.
assert.match(automation, /const engagementVariant = type\.id === "engagement_humor"[\s\S]*?"ai_image"/);
assert.match(automation, /const isEngagement = type\?\.id === "engagement_humor"/);
assert.match(automation, /creditCostResolver:\s*getCurrentCreditCost/);
assert.match(automation, /contentFormat:\s*"single_image",\n\s*animationStyle:\s*null,\n\s*},\n\s*\/\/ Legacy editorial ids/);

// Rescue preserves the same editorial quality contract and product-first rescue where appropriate.
assert.match(rescueUi, /EDITORIAL QUALITY CONTRACT/);
assert.match(rescueUi, /buildEditorialQualityInstruction/);
assert.match(rescueFormat, /contentType === "problem_solution" && usesWebsiteContent/);
assert.match(rescuePackages, /website_service_mode/);
assert.match(rescuePackages, /Evaluate website_service_mode independently from product\/catalog mode/);

// Every new/renamed visible surface has canonical English i18n keys.
for (const key of [
  "automation.contentType.problem_solution.label",
  "automation.contentType.tips.label",
  "automation.contentType.faq.label",
  "automation.contentType.guide_choice.label",
  "automation.contentType.service_focus.label",
  "automation.contentType.engagement_humor.label",
  "automation.engagementMedia.title",
  "automation.engagementMedia.aiVideo",
  "automation.engagementMedia.aiImage",
  "automation.engagementMedia.productImage",
  "automation.formatGroup.products",
  "automation.formatGroup.content",
  "automation.formatGroup.createSelf",
  "admin.contentCredits.title",
  "admin.contentCredits.variantPricingTitle",
]) {
  assert.ok(labels.includes(`"${key}"`), `Missing English source key: ${key}`);
}

console.log("v144.181 editorial quality + post-type credit-control checks passed.");
