import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONFIRMATION = "DELETE MY TEST DATA";

async function deleteForUser(admin, table, userId) {
  const result = await admin.from(table).delete().eq("user_id", userId);
  if (result.error && !new RegExp(`${table}|schema cache|does not exist`, "i").test(String(result.error.message || ""))) {
    throw result.error;
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const body = await request.json().catch(() => ({}));
    if (String(body?.confirmation || "").trim() !== CONFIRMATION) {
      return Response.json({ ok: false, error: `Type '${CONFIRMATION}' to confirm cleanup.` }, { status: 400 });
    }

    const userId = context.user.id;
    const { data: rules, error: rulesError } = await context.admin
      .from("automation_rules")
      .select("id, credit_reservation_status")
      .eq("user_id", userId);
    if (rulesError) throw rulesError;

    let releasedCredits = 0;
    for (const rule of rules || []) {
      if (String(rule.credit_reservation_status || "") === "reserved") {
        const { data, error } = await context.admin.rpc("release_reserved_automation_credit_system", {
          p_rule_id: rule.id,
          p_reason: "Reserved credits returned during admin test-data cleanup",
        });
        if (error && !/release_reserved_automation_credit_system|schema cache|does not exist/i.test(String(error.message || ""))) throw error;
        releasedCredits += Number(data?.released_credits || 0);
      }
    }

    // Stop the admin account's current plans before clearing the workbench, so
    // cron cannot immediately recreate Upcoming rows while new tests are being prepared.
    const now = new Date().toISOString();
    const ruleUpdate = await context.admin.from("automation_rules").update({
      is_active: false,
      next_run_at: null,
      queue_locked_until: null,
      retry_not_before: null,
      plan_state: "ended",
      plan_ended_at: now,
      updated_at: now,
    }).eq("user_id", userId);
    if (ruleUpdate.error) throw ruleUpdate.error;

    // Delete only generation/review data owned by the current admin account.
    // Customer accounts and brand profiles are never touched.
    for (const table of [
      "admin_generation_work_items",
      "admin_review_cases",
      "customer_notifications",
      "automation_run_logs",
      "automation_occurrences",
      "posts",
    ]) {
      await deleteForUser(context.admin, table, userId);
    }

    return Response.json({
      ok: true,
      user_id: userId,
      ended_rules: (rules || []).length,
      released_credits: releasedCredits,
      stats_recalculate_automatically: true,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not clear the admin account's test data." }, { status: 500 });
  }
}
