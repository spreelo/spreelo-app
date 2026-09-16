import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const sql = read("supabase/v144_183_recurring_credit_pause_resume.sql");
const cron = read("app/api/cron/run-automations/route.js");
const automation = read("app/automation/page.jsx");
const dashboard = read("app/page.jsx");
const recurring = read("app/api/recurring-plan/route.js");
const planPage = read("app/plans/[id]/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const entitlements = read("lib/planEntitlements.js");
const packageJson = read("package.json");

// Durable plan-level credit pause metadata and stable weekly grouping.
for (const column of [
  "recurring_plan_group_id",
  "plan_pause_reason",
  "plan_paused_at",
  "credit_pause_required_amount",
  "credit_pause_balance_at_pause",
]) assert.ok(sql.includes(column), `Missing ${column}`);

assert.match(sql, /plan_pause_reason[\s\S]*insufficient_credits/);
assert.match(sql, /create or replace function public\.spreelo_pause_recurring_plan_for_credits_system/);
assert.match(sql, /create or replace function public\.spreelo_pause_recurring_occurrence_for_credit_shortage/);
assert.match(sql, /create or replace function public\.spreelo_finalize_recurring_plan_credit_cycle/);
assert.match(sql, /create or replace function public\.spreelo_resume_credit_paused_recurring_plans_system/);
assert.match(sql, /create or replace function public\.resume_credit_paused_recurring_plan/);
assert.match(sql, /create trigger spreelo_auto_resume_credit_paused_plans/);
assert.match(sql, /after update of credits_remaining/);
assert.match(sql, /when \(new\.credits_remaining > old\.credits_remaining\)/);

// Resumption must skip missed posts and reserve the complete next cycle before reactivation.
assert.match(sql, /spreelo_next_weekly_run_at_v144183/);
assert.match(sql, /if v_candidate <= v_local_now then[\s\S]*interval '7 days'/);
assert.match(sql, /credits_remaining = credits_remaining - v_required/);
assert.match(sql, /plan_state = 'active'/);
assert.match(sql, /credit_reservation_status = 'reserved'/);
assert.match(sql, /next_run_at = public\.spreelo_next_weekly_run_at_v144183/);

// Successful and failed weekly occurrences both join the same complete-cycle barrier.
assert.match(sql, /create or replace function public\.consume_reserved_automation_credit/);
assert.match(sql, /spreelo_finalize_recurring_plan_credit_cycle\(p_rule_id\)/);
assert.match(sql, /create or replace function public\.spreelo_defer_recurring_rule_reservation_to_cycle_system/);
assert.match(cron, /spreelo_defer_recurring_rule_reservation_to_cycle_system/);
assert.match(cron, /isRecurringRuleCreditCycleReady/);
assert.match(cron, /\["consumed", "unfunded"\]/);
assert.match(cron, /spreelo_reconcile_weekly_reservation_for_execution/);
assert.match(cron, /spreelo_pause_recurring_occurrence_for_credit_shortage/);
assert.match(cron, /recurring_plans_paused_for_credits/);

// New plans receive one stable group id shared by every weekday rule.
assert.match(automation, /const recurringPlanGroupId =/);
assert.match(automation, /recurring_plan_group_id: recurringPlanGroupId/);
assert.match(entitlements, /recurring_plan_group_id/);
assert.match(recurring, /pauseReason:/);

// Manual pause is distinct from credit pause and never treated as auto-resumable.
assert.match(dashboard, /plan_pause_reason: isActive \? null : "manual"/);
assert.match(dashboard, /plan\.pauseReason === "insufficient_credits"/);
assert.match(dashboard, /resume_credit_paused_recurring_plan/);

// Customer-visible status/help text is fully keyed in the English source locale.
for (const key of [
  "planManager.pausedForCredits",
  "planManager.creditPauseHelp",
  "dashboard.planStatus.pausedForCredits",
  "dashboard.creditPauseHelp",
  "dashboard.creditPauseResumeNeedsCredits",
]) assert.ok(labels.includes(`"${key}"`), `Missing i18n key ${key}`);
assert.match(planPage, /planManager\.pausedForCredits/);
assert.match(planPage, /planManager\.creditPauseHelp/);

assert.ok(packageJson.includes('"test:v144.183"'));
console.log("v144.183 recurring credit pause/resume checks passed.");
