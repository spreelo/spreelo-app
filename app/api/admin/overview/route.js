import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

async function countRows(admin, table, applyFilters) {
  // Some admin tables use user_id or another primary key instead of id.
  // Selecting * with head:true counts rows without assuming a specific column.
  let query = admin.from(table).select("*", { count: "exact", head: true });
  if (typeof applyFilters === "function") {
    query = applyFilters(query);
  }
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function safeAdminQuery(label, fallback, queryFunction) {
  try {
    return { value: await queryFunction(), warning: null };
  } catch (error) {
    console.error(`Admin overview query failed (${label}):`, error);
    return {
      value: fallback,
      warning: {
        key: label,
        message: error?.message || `Could not load ${label}.`,
      },
    };
  }
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const results = await Promise.all([
    safeAdminQuery("accounts", 0, () =>
      countRows(context.admin, "user_credit_balances")
    ),
    safeAdminQuery("brands", 0, () =>
      countRows(context.admin, "brand_profiles")
    ),
    safeAdminQuery("posts", 0, () => countRows(context.admin, "posts")),
    safeAdminQuery("activeAutomations", 0, () =>
      countRows(context.admin, "automation_rules", (query) =>
        query.eq("is_active", true)
      )
    ),
    safeAdminQuery("backgrounds", 0, () =>
      countRows(context.admin, "video_background_assets", (query) =>
        query.eq("active", true)
      )
    ),
    safeAdminQuery("failedMedia", 0, () =>
      // Only surface posts whose overall generation actually failed.
      // A post may still be usable as text even when an optional image failed.
      countRows(context.admin, "posts", (query) => query.eq("status", "failed"))
    ),
    safeAdminQuery("pendingApproval", 0, () =>
      countRows(context.admin, "posts", (query) =>
        query.eq("status", "pending_approval")
      )
    ),
    safeAdminQuery("recentAdjustments", [], async () => {
      const { data, error } = await context.admin
        .from("admin_credit_adjustments")
        .select(
          "id, admin_email, target_email, amount, previous_balance, new_balance, reason, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      return data || [];
    }),
  ]);

  const [
    users,
    brands,
    posts,
    activeAutomations,
    backgrounds,
    failedMedia,
    pendingApproval,
    recentAdjustments,
  ] = results;
  const warnings = results.map((result) => result.warning).filter(Boolean);

  return Response.json({
    ok: true,
    partial: warnings.length > 0,
    warnings,
    stats: {
      users: users.value,
      brands: brands.value,
      posts: posts.value,
      activeAutomations: activeAutomations.value,
      backgrounds: backgrounds.value,
      failedMedia: failedMedia.value,
      pendingApproval: pendingApproval.value,
    },
    recentAdjustments: recentAdjustments.value,
  });
}
