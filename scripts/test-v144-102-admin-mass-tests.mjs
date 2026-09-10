import fs from "node:fs";

const worker = fs.readFileSync("app/api/cron/run-automations/route.js", "utf8");
const api = fs.readFileSync("app/api/admin/mass-tests/route.js", "utf8");
const detailApi = fs.readFileSync("app/api/admin/mass-tests/[id]/route.js", "utf8");
const diagnostics = fs.readFileSync("app/api/admin/mass-tests/[id]/diagnostics/route.js", "utf8");
const page = fs.readFileSync("app/admin/mass-tests/page.jsx", "utf8");
const approvalsApi = fs.readFileSync("app/api/admin/post-approvals/route.js", "utf8");
const approvalsPage = fs.readFileSync("app/admin/post-approvals/page.jsx", "utf8");
const dashboard = fs.readFileSync("app/admin/page.jsx", "utf8");
const sql = fs.readFileSync("supabase/v144_102_admin_mass_tests.sql", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(sql.includes("create table if not exists public.admin_test_batches"), "Admin test batches SQL table missing");
for (const table of ["automation_rules","posts","automation_occurrences","automation_run_logs","admin_review_cases"]) {
  assert(sql.includes(`alter table public.${table}`), `Test context columns missing for ${table}`);
}
assert(sql.includes("is_admin_test boolean not null default false"), "Test marker missing");
assert(sql.includes("spreelo_copy_admin_test_context_to_occurrence"), "Occurrence test context trigger missing");
assert(sql.includes("revoke all on table public.admin_test_batches from anon, authenticated"), "Admin test batch RLS hardening missing");

assert(api.includes("getAdminContext"), "Mass test API must be admin-only");
assert(api.includes('.eq("user_id", context.user.id)'), "Mass tests are not restricted to the admin user's brands");
assert(api.includes("rules.length>500"), "Mass test batch cap missing");
assert(api.includes('runMode:"asap"'), "ASAP queue mode missing");
assert(api.includes("credit_bypass:true"), "Credit bypass batch metadata missing");
assert(api.includes('queue_source:campaignTitle ? "campaign" : "content_studio"') || fs.readFileSync("lib/adminMassTest.js","utf8").includes('queue_source:campaignTitle ? "campaign" : "content_studio"'), "Normal queue sources are not preserved");

assert(worker.includes("const isAdminTestRun = rule?.is_admin_test === true"), "Worker test-mode marker missing");
assert(worker.includes("if (!isAdminTestRun && !hasReservedCredits)"), "Customer balance bypass missing for tests");
assert(worker.includes("if (!isAdminTestRun && hasReservedCredits)"), "Reserved credit consumption bypass missing for tests");
assert(worker.includes("is_admin_test: isAdminTestRun"), "Generated post test marker missing");
assert(worker.includes('admin_review_status: isAdminTestRun ? "pending"'), "Test posts are not forced into normal admin review");
assert(worker.includes("!isAdminTestRun &&\n          effectivePostStatus"), "Direct customer delivery is not blocked before admin review for tests");
assert(worker.includes("admin_test_credit_bypass: isAdminTestRun"), "Occurrence completion does not record test credit bypass");
assert(worker.includes("admin_test_batch_id: rule?.is_admin_test === true ? rule.admin_test_batch_id"), "Run log test-batch marker missing");
assert(worker.includes("error_stack: safeStack || null"), "Durable diagnostic stack metadata missing");

assert(page.includes('t("adminMassTests.aiStudio")'), "Studio selector missing");
assert(page.includes('t("adminMassTests.calendarCampaigns")'), "Campaign selector missing");
assert(page.includes('t("adminMassTests.runEachFormat")'), "Repeat testing missing");
assert(page.includes('t("adminMassTests.customerCreditsZero")'), "Zero-credit test promise missing");
assert(page.includes('t("adminMassTests.viewInApprovals")'), "Normal Approvals link missing");
assert(page.includes('t("adminMassTests.copyErrorLog")'), "Per-job diagnostic copy action missing");
assert(page.includes('t("adminMassTests.rerunFailed")'), "Rerun failed action missing");
assert(detailApi.includes("rerun_failed"), "Rerun failed API missing");
assert(detailApi.includes("post_generation_cost_summaries"), "Actual generation cost aggregation missing");
assert(diagnostics.includes("Secrets/tokens are redacted automatically"), "Diagnostic secret redaction promise missing");
assert(diagnostics.includes("VERCEL_DEPLOYMENT_ID"), "Vercel deployment diagnostics missing");
assert(diagnostics.includes("failedRuleIds"), "Bulk diagnostics are not failure-focused");

assert(approvalsApi.includes("admin_test_batch_id"), "Godkänn API does not expose test context");
assert(approvalsPage.includes('t("admin.approvals.testMassTest")'), "Approvals test badge missing");
assert(approvalsPage.includes('t("admin.approvals.copyFullTestLog")'), "Approvals diagnostic copy button missing");
assert(approvalsPage.includes("testBatch"), "Godkänn batch filter missing");
assert(dashboard.includes('href="/admin/mass-tests"'), "Admin dashboard mass test entry missing");
assert(globals.includes("97-v144-102-admin-mass-tests.css"), "Mass test CSS import missing");

console.log("v144.102 admin mass tests checks passed");
