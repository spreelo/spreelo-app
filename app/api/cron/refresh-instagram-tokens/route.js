import { NextResponse } from "next/server";
import {
  INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS,
  createSupabaseAdminClient,
  getInstagramTokenExpiresAt,
  refreshInstagramLongLivedToken,
} from "../../../../lib/instagramOAuth";

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = {
    checked: 0,
    refreshed: 0,
    failed: 0,
  };

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const refreshBeforeIso = new Date(
      Date.now() + INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const nowIso = new Date().toISOString();

    const { data: connections, error } = await supabaseAdmin
      .from("social_connections")
      .select("id, user_id, page_id, page_name, page_access_token, token_expires_at")
      .eq("platform", "instagram")
      .eq("status", "connected")
      .not("page_access_token", "is", null)
      .or(`token_expires_at.is.null,token_expires_at.lte.${refreshBeforeIso}`)
      .limit(50);

    if (error) {
      throw error;
    }

    const instagramConnections = connections || [];
    summary.checked = instagramConnections.length;

    for (const connection of instagramConnections) {
      try {
        const refreshedToken = await refreshInstagramLongLivedToken(
          connection.page_access_token
        );

        const { error: updateError } = await supabaseAdmin
          .from("social_connections")
          .update({
            page_access_token: refreshedToken.accessToken,
            token_expires_at: getInstagramTokenExpiresAt(refreshedToken.expiresIn),
            status: "connected",
            updated_at: nowIso,
          })
          .eq("id", connection.id);

        if (updateError) {
          throw updateError;
        }

        summary.refreshed += 1;
      } catch (refreshError) {
        console.error("Instagram token refresh failed", {
          connectionId: connection.id,
          instagramUserId: connection.page_id,
          instagramUsername: connection.page_name,
          message: refreshError.message,
        });

        await supabaseAdmin
          .from("social_connections")
          .update({
            status: "expired",
            updated_at: nowIso,
          })
          .eq("id", connection.id);

        summary.failed += 1;
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Instagram token refresh cron failed:", error);

    return NextResponse.json(
      { ok: false, error: "Could not refresh Instagram tokens", summary },
      { status: 500 }
    );
  }
}
