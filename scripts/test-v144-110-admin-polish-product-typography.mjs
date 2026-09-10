import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const has = (text, needle, message) => assert.ok(text.includes(needle), message || `Missing ${needle}`);

const approvals = read("app/api/admin/post-approvals/route.js");
for (const needle of [
  "admin_rescue_resolved_at",
  "admin_regenerated_at",
  'String(item?.rescue_status || "") !== "used"',
]) has(approvals, needle, `Resolved failure queue guard missing ${needle}`);

for (const route of [
  "app/api/admin/post-approvals/regenerate/route.js",
  "app/api/admin/post-approvals/regenerate-product/route.js",
  "app/api/admin/post-approvals/regenerate-any/route.js",
]) {
  const source = read(route);
  has(source, "admin_rescue_resolved_at", `${route} must mark the repaired occurrence resolved`);
  has(source, 'status: "approval"', `${route} must move the durable work item into approval`);
  has(source, '.eq("occurrence_id",', `${route} must resolve older work items even when work_item_id is absent`);
}

const counts = read("app/api/admin/post-approvals/counts/route.js");
has(counts, '.neq("rescue_status", "used")', "Failed badge must not count consumed rescue rows");

const engine = read("app/api/cron/run-automations/route.js");
for (const needle of [
  "looksLikeStorefrontNavigationText",
  "sanitizeProductOverlayDescriptor",
  "sanitizeProductOverlayTitle",
  "productReferenceBuffer = null",
  "verified-product-reference.png",
  "image: referenceFiles",
  "Never render website navigation, breadcrumbs, category paths, URLs, slugs",
  'provider: "gpt-image-2-transparent-typography"',
]) has(engine, needle, `Product typography upgrade missing ${needle}`);

const automation = read("app/automation/page.jsx");
for (const needle of [
  "plan-v144110-channel-warning",
  "setShowSocialChannelRequiredModal(true)",
  'href="/social-channels"',
]) has(automation, needle, `Activation channel guard missing ${needle}`);

const cleanup = read("app/api/admin/test-data-cleanup/route.js");
for (const needle of [
  'const CONFIRMATION = "DELETE MY TEST DATA"',
  "const userId = context.user.id",
  '.eq("user_id", userId)',
  "release_reserved_automation_credit_system",
  '"admin_generation_work_items"',
  '"admin_review_cases"',
  '"automation_occurrences"',
  '"posts"',
]) has(cleanup, needle, `Admin cleanup safety missing ${needle}`);
assert.ok(!cleanup.includes('.delete().neq("user_id"'), "Cleanup must never delete other customer users");
assert.ok(!cleanup.includes('from("brand_profiles").delete'), "Cleanup must not delete brand profiles");

const page = read("app/admin/post-approvals/page.jsx");
for (const needle of [
  "admin-v144110-icon-tabs",
  "admin-v144110-tab-icon",
  't("admin.approvals.cleanMyTestPosts")',
  "/api/admin/post-approvals/counts",
  "/api/admin/test-data-cleanup",
]) has(page, needle, `Admin polish missing ${needle}`);

const css = read("app/styles/101-v144-110-admin-polish-product-typography.css");
for (const needle of [
  ".admin-v144110-icon-tabs",
  ".admin-v144110-tab-icon > b",
  ".plan-v144110-channel-warning",
  "width: min(520px,100%)",
  "min-height: 56px",
]) has(css, needle, `v144.110 CSS missing ${needle}`);

const globals = read("app/globals.css");
has(globals, "101-v144-110-admin-polish-product-typography.css", "v144.110 CSS must load last");

console.log("v144.110 admin polish / resolved rescue / product typography tests passed");
