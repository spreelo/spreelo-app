import { isScaledSocialBatch, shouldSkipDailySocialCron, socialBatchLimit } from "../../../../lib/scaledSocialMaintenance.mjs";
import { NextResponse } from "next/server";
import {
  THREADS_TOKEN_REFRESH_WINDOW_DAYS,
  createSupabaseAdminClient,
  getThreadsTokenExpiresAt,
  refreshThreadsLongLivedToken,
} from "../../../../lib/threadsOAuth";

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${cronSecret}`;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Preserve legacy behavior unless scaled maintenance is explicitly enabled.
  if (shouldSkipDailySocialCron(request)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "scaled_dispatcher_active" });
  }

  const summary = { checked: 0, refreshed: 0, failed: 0 };

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const refreshBeforeIso = new Date(
      Date.now() + THREADS_TOKEN_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const nowIso = new Date().toISOString();

    let tokenQuery = supabaseAdmin
      .from("social_connections")
      .select("id, page_id, page_name, page_access_token, token_expires_at")
      .eq("platform", "threads")
      .eq("status", "connected")
      .not("page_access_token", "is", null)
      .or(`token_expires_at.is.null,token_expires_at.lte.${refreshBeforeIso}`)
      ;
    if (isScaledSocialBatch(request)) {
      tokenQuery = tokenQuery.order("token_expires_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true });
    }
    const { data: connections, error } = await tokenQuery.limit(socialBatchLimit(request, 50));
    if (error) throw error;

    summary.checked = (connections || []).length;

    for (const connection of connections || []) {
      try {
        const refreshed = await refreshThreadsLongLivedToken(connection.page_access_token);
        const { error: updateError } = await supabaseAdmin
          .from("social_connections")
          .update({
            page_access_token: refreshed.accessToken,
            token_expires_at: getThreadsTokenExpiresAt(refreshed.expiresIn),
            last_token_refresh_at: nowIso,
            last_connection_check_at: nowIso,
            last_connection_error: null,
            status: "connected",
            updated_at: nowIso,
          })
          .eq("id", connection.id);
        if (updateError) throw updateError;
        summary.refreshed += 1;
      } catch (refreshError) {
        console.error("Threads token refresh failed", {
          connectionId: connection.id,
          threadsUserId: connection.page_id,
          username: connection.page_name,
          message: refreshError.message,
        });
        await supabaseAdmin
          .from("social_connections")
          .update({
            status: "expired",
            last_connection_error: String(refreshError.message || "Threads token refresh failed").slice(0, 800),
            reauth_required_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", connection.id);
        summary.failed += 1;
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Threads token refresh cron failed", error);
    return NextResponse.json({ ok: false, error: "Could not refresh Threads tokens", summary }, { status: 500 });
  }
}
