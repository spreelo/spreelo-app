import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

async function countRows(admin, table, applyFilters) {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  if (typeof applyFilters === "function") {
    query = applyFilters(query);
  }
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const [
      users,
      brands,
      posts,
      activeAutomations,
      backgrounds,
      failedMedia,
      pendingApproval,
      recentAdjustmentsResult,
    ] = await Promise.all([
      countRows(context.admin, "user_credit_balances"),
      countRows(context.admin, "brand_profiles"),
      countRows(context.admin, "posts"),
      countRows(context.admin, "automation_rules", (query) =>
        query.eq("is_active", true)
      ),
      countRows(context.admin, "video_background_assets", (query) =>
        query.eq("active", true)
      ),
      countRows(context.admin, "posts", (query) =>
        query.or("image_status.eq.failed,video_status.eq.failed")
      ),
      countRows(context.admin, "posts", (query) =>
        query.eq("status", "pending_approval")
      ),
      context.admin
        .from("admin_credit_adjustments")
        .select(
          "id, admin_email, target_email, amount, previous_balance, new_balance, reason, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (recentAdjustmentsResult.error) throw recentAdjustmentsResult.error;

    return Response.json({
      ok: true,
      stats: {
        users,
        brands,
        posts,
        activeAutomations,
        backgrounds,
        failedMedia,
        pendingApproval,
      },
      recentAdjustments: recentAdjustmentsResult.data || [],
    });
  } catch (error) {
    return Response.json(
      { ok: false, isAdmin: true, error: error.message || "Could not load admin overview." },
      { status: 500 }
    );
  }
}
