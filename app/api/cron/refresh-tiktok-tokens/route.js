import { isScaledSocialBatch, shouldSkipDailySocialCron, socialBatchLimit } from "../../../../lib/scaledSocialMaintenance.mjs";
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  fetchTikTokCreatorInfo,
  getHealthyTikTokAccessToken,
} from "../../../../lib/tiktokOAuth.js";
import { markConnectionExpiredAndAlert } from "../../../../lib/socialConnectionAlerts.js";

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

  const summary = { checked: 0, refreshed: 0, healthy: 0, reconnectRequired: 0, transientFailures: 0 };

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    let tokenQuery = supabaseAdmin
      .from("social_connections")
      .select("id, user_id, brand_profile_id, platform, page_id, page_name, page_access_token, token_expires_at, refresh_token, refresh_token_expires_at, permissions, status, last_connection_check_at")
      .eq("platform", "tiktok")
      .eq("status", "connected")
      ;
    if (isScaledSocialBatch(request)) {
      tokenQuery = tokenQuery.order("last_connection_check_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true });
    }
    const { data: connections, error } = await tokenQuery.limit(socialBatchLimit(request, 1000));
    if (error) throw error;

    for (const originalConnection of connections || []) {
      summary.checked += 1;
      let connection = originalConnection;
      try {
        const healthy = await getHealthyTikTokAccessToken({ supabase: supabaseAdmin, connection });
        connection = healthy.connection || connection;
        if (healthy.refreshed) summary.refreshed += 1;
        await fetchTikTokCreatorInfo(healthy.accessToken);
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("social_connections")
          .update({
            last_connection_check_at: nowIso,
            last_connection_error: null,
            reauth_required_at: null,
            updated_at: nowIso,
          })
          .eq("id", connection.id);
        summary.healthy += 1;
      } catch (connectionError) {
        if (!connectionError?.requiresReconnect) {
          await supabaseAdmin
            .from("social_connections")
            .update({
              last_connection_check_at: new Date().toISOString(),
              last_connection_error: String(connectionError?.message || "TikTok health check failed").slice(0, 1500),
            })
            .eq("id", connection.id);
          summary.transientFailures += 1;
          continue;
        }

        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("social_connections")
          .update({
            last_connection_check_at: nowIso,
            last_connection_error: String(connectionError?.message || "TikTok authorization is no longer valid").slice(0, 1500),
            reauth_required_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", connection.id);
        await markConnectionExpiredAndAlert({
          supabase: supabaseAdmin,
          connectionId: connection.id,
          platform: "tiktok",
          reason: connectionError?.message || "TikTok authorization is no longer valid",
          resendApiKey: process.env.RESEND_API_KEY,
          nowIso,
        });
        summary.reconnectRequired += 1;
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("TikTok token refresh cron failed", error);
    return NextResponse.json({ ok: false, error: "Could not refresh TikTok connections", summary }, { status: 500 });
  }
}
