import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const has = (text, needle, message) => assert.ok(text.includes(needle), message || `Missing ${needle}`);

const sql = read("supabase/v144_109_rescue_center_annual_calendar_email.sql");
for (const needle of [
  "calendar_generation_mode",
  "analysis_rescue_required",
  "analysis_kind",
  "target_calendar_year",
  "create table if not exists public.brand_calendar_renewals",
  "create table if not exists public.admin_rescue_cases",
  "'calendar_updated'",
]) has(sql, needle, `SQL migration missing ${needle}`);

const serverUi = read("lib/i18n/serverUiText.js");
for (const needle of [
  'ui_translation_packs',
  'translateMissingLabels',
  'source_fingerprints',
  'claimServerTranslationPack',
]) has(serverUi, needle, `Persistent server translation engine missing ${needle}`);
const staticEmail = read("lib/i18n/staticEmailText.js");
for (const needle of [
  'getDefaultNamespaceLabels("emails")',
  'getStaticEmailLabels',
  'persistedLabels',
]) has(staticEmail, needle);
assert.ok(!/["']sv["']\s*:/.test(staticEmail), "Email source must not contain a Swedish static translation pack");
assert.ok(!/["']da["']\s*:/.test(staticEmail), "Email source must not contain a Danish static translation pack");
assert.ok(!/["']no["']\s*:/.test(staticEmail), "Email source must not contain a Norwegian static translation pack");

const lifecycle = read("lib/lifecycleEmails.js");
for (const needle of [
  'emailType === "calendar_updated"',
  "emails.calendarUpdated.subject",
  "calendarYear",
]) has(lifecycle, needle);

const activation = read("app/api/plan-activation-email/route.js");
has(activation, 'namespaces: ["emails"]', "Plan activation email must use the shared static email namespace");
assert.ok(!activation.includes("api.openai.com"), "Plan activation email must not call OpenAI directly");

const engine = read("app/api/analyze-brand/brandAnalysisEngine.js");
for (const needle of ["job.target_calendar_year", "requestedCalendarYear", "campaignCalendarYear"]) has(engine, needle);

const helpers = read("app/api/analyze-brand/jobHelpers.js");
for (const needle of ["analysis_kind", "target_calendar_year", "analysisKind", "targetCalendarYear"]) has(helpers, needle);

const worker = read("app/api/cron/run-brand-analysis-jobs/route.js");
for (const needle of [
  'emailType: "calendar_updated"',
  "createManualRescueCaseForFailedJob",
  'case_type: isAnnualRefresh ? "annual_calendar" : "brand_analysis"',
  'status: "needed"',
  'rescue_needed',
  'status: "running"',
]) has(worker, needle);

const annual = read("app/api/cron/calendar-renewal-maintenance/route.js");
for (const needle of [
  'now.getUTCMonth() === 11 ? year + 1 : year',
  'calendar_generation_mode === "manual_rescue"',
  'analysis_kind: "annual_calendar_refresh"',
  'target_calendar_year: targetYear',
  'emailType: "calendar_updated"',
]) has(annual, needle);
assert.ok(!annual.includes("return null;\n  return year + 1"), "Annual target year must not jump over unfinished current-year renewals after New Year");

const rescueLib = read("lib/adminRescuePackages.js");
for (const needle of [
  "parseAdminRescuePackage",
  "validateAdminRescueManifest",
  "buildAdminRescueBrief",
  'source_type: "chatgpt_analysis_rescue"',
  'source_type: "chatgpt_calendar_rescue"',
  "verified_sources",
]) has(rescueLib, needle);

for (const route of [
  "app/api/admin/rescue-center/route.js",
  "app/api/admin/rescue-center/export/route.js",
  "app/api/admin/rescue-center/import/route.js",
  "app/api/admin/rescue-center/approve/route.js",
]) {
  assert.ok(fs.existsSync(path.join(root, route)), `${route} is missing`);
}
const approve = read("app/api/admin/rescue-center/approve/route.js");
for (const needle of [
  "replaceBrandCampaignOpportunities",
  "saveBrandProfile",
  'calendar_generation_mode: "manual_rescue"',
  'emailType: "calendar_updated"',
  'emailType: "analysis_completed"',
]) has(approve, needle);

const centerApi = read("app/api/admin/rescue-center/route.js");
for (const needle of [
  "productFailures",
  "annualBrands",
  'action === "prepare_annual_rescue"',
  'action === "retry_calendar_email"',
  'action === "set_calendar_mode"',
]) has(centerApi, needle);

const page = read("app/admin/rescue-center/page.jsx");
for (const needle of [
  't("adminRescue.failedAnalyses")',
  't("adminRescue.failedPosts")',
  't("adminRescue.annualRenewal")',
  't("adminRescue.createBrief")',
  't("adminRescue.importPreview")',
  't("adminRescue.customerInformed")',
]) has(page, needle);

const adminPage = read("app/admin/page.jsx");
has(adminPage, 'href="/admin/rescue-center"', "Admin dashboard must link to Rescue Center");

const globals = read("app/globals.css");
has(globals, "100-v144-109-rescue-center.css", "Rescue Center CSS must be loaded");

const vercel = JSON.parse(read("vercel.json"));
assert.ok(vercel.crons.some((item) => item.path === "/api/cron/calendar-renewal-maintenance"), "Annual calendar cron missing from vercel.json");

const legacyAnalysis = read("app/api/analyze-brand/route.js");
has(legacyAnalysis, 'case_type: "brand_analysis"', "Legacy synchronous security failures must surface in Rescue Center");
has(legacyAnalysis, "analysis_rescue_required: true");

const productRescue = read("app/api/admin/post-approvals/rescue-import/route.js");
for (const needle of ["remote_image_url", "fetchRemoteProductImage", 'rescue_status: "ready"']) has(productRescue, needle, "Existing v144.108 product rescue must remain intact");

console.log("v144.109 Rescue Center / annual calendar / persistent email i18n tests passed");
