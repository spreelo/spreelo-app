import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const page = read("app/admin/post-approvals/page.jsx");
const api = read("app/api/admin/post-approvals/route.js");
const rescue = read("app/api/admin/post-approvals/rescue-import/route.js");
const regenCarousel = read("app/api/admin/post-approvals/regenerate/route.js");
const regenProduct = read("app/api/admin/post-approvals/regenerate-product/route.js");
const cron = read("app/api/cron/run-automations/route.js");
const sql = read("spreelo-v144.106-SQL.sql");
const globals = read("app/globals.css");

// Durable queue exists before post creation and has four admin lifecycle tabs.
assert.match(sql, /create table if not exists public\.admin_generation_work_items/u);
assert.match(sql, /admin_generation_work_item_from_rule/u);
assert.match(sql, /admin_generation_work_item_from_occurrence/u);
assert.match(sql, /admin_generation_work_item_from_post/u);
for (const key of ["admin.approvals.upcomingTab", "admin.approvals.approvalTab", "admin.approvals.failedTab", "admin.approvals.history"]) assert.match(page, new RegExp(`t\\("${key.replaceAll(".", "\\.")}"\\)`));
assert.match(api, /status === "upcoming" \? \["planned", "running"\]/u);
assert.match(api, /syntheticWorkItems/u);

// Failures before occurrence claim are attached to the pre-created work order.
assert.match(cron, /markAdminWorkItemFailedBeforeOccurrence/u);
assert.match(cron, /generation_failed_before_occurrence_claim/u);

// Rescue is human-in-the-loop through ChatGPT + structured ZIP import.
assert.match(page, /window\.open\("https:\/\/chatgpt\.com\/"/u);
assert.match(page, /t\("admin\.approvals\.uploadRescueZip"\)/u);
assert.match(page, /manifest\.json/u);
assert.match(rescue, /readZipEntries/u);
assert.match(rescue, /MAX_UNCOMPRESSED_BYTES/u);
assert.match(rescue, /inspectImageBytes\(imageEntry\.bytes\)/u);
assert.match(rescue, /rescue_status: "ready"/u);
assert.match(rescue, /admin_materials_authoritative: true/u);

// Imported product material is explicitly manual/authoritative and therefore bypasses a new website product fetch.
assert.match(regenCarousel, /if \(product\.manual_override === true\)/u);
assert.match(regenCarousel, /admin_materials_authoritative: true/u);
assert.match(regenProduct, /useManualOverride/u);
assert.match(regenProduct, /manual_override: true/u);
assert.match(regenCarousel, /work_item_id/u);
assert.match(regenProduct, /work_item_id/u);

// v144.106 visual layer is last.
assert.match(globals, /99-v144-106-admin-queue-rescue\.css/u);

console.log("v144.106 admin queue + rescue ZIP checks passed.");
