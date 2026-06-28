const RESEND_FROM_EMAIL = "Spreelo <noreply@spreelo.com>";
const DEFAULT_ALERT_EMAIL = "contact@spreelo.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.spreelo.com";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSocialAlertEmailRecipient() {
  return (
    process.env.SOCIAL_CONNECTION_ALERT_EMAIL ||
    process.env.SPREELO_ALERT_EMAIL ||
    process.env.ADMIN_ALERT_EMAIL ||
    DEFAULT_ALERT_EMAIL
  );
}

function normalizePlatformLabel(platform) {
  const normalized = String(platform || "").toLowerCase();

  if (normalized === "instagram") {
    return "Instagram";
  }

  if (normalized === "facebook") {
    return "Facebook";
  }

  return platform || "Social channel";
}

export function isConnectionAuthFailure(errorOrMessage) {
  const message =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : errorOrMessage?.message || "";

  return /code:\s*190\b|invalid access token|error validating access token|session has expired|access token has expired|token.*expired|expired.*token|token.*invalid|permission|permissions|requires .*permission|not authorized|not authorised/i.test(
    message
  );
}

export async function sendSocialConnectionAlertEmail({
  resendApiKey,
  platform,
  pageName,
  pageId,
  userId,
  brandProfileId,
  reason,
  status = "expired",
}) {
  if (!resendApiKey) {
    console.warn("Social connection alert email skipped: missing RESEND_API_KEY", {
      platform,
      pageName,
      pageId,
      userId,
      brandProfileId,
      status,
    });
    return { skipped: true, reason: "missing_resend_api_key" };
  }

  const to = getSocialAlertEmailRecipient();
  const platformLabel = normalizePlatformLabel(platform);
  const safePageName = pageName || pageId || "Unknown account";
  const subject = `VARNING: Spreelo social publicering kräver kontroll (${platformLabel})`;
  const createdAt = new Date().toISOString();

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:680px;margin:0 auto;padding:24px;">
      <div style="border:1px solid #fecaca;background:#fff7f7;border-radius:16px;padding:20px;">
        <h1 style="margin:0 0 12px;font-size:22px;color:#991b1b;">Intern driftvarning: social publicering kräver kontroll</h1>
        <p style="margin:0 0 16px;">Spreelo har upptäckt att en ${escapeHtml(platformLabel)}-koppling inte längre fungerar för publicering eller token-förnyelse. Detta mail skickas endast internt till Spreelo-admin, inte till kunden.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;">Plattform</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(platformLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Berört konto/sida</td><td style="padding:6px 0;">${escapeHtml(safePageName)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Page/IG ID</td><td style="padding:6px 0;">${escapeHtml(pageId || "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">User ID</td><td style="padding:6px 0;">${escapeHtml(userId || "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Brand profile ID</td><td style="padding:6px 0;">${escapeHtml(brandProfileId || "-")}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Tid</td><td style="padding:6px 0;">${escapeHtml(createdAt)}</td></tr>
        </table>
        <p style="margin:16px 0 4px;color:#6b7280;">Orsak</p>
        <pre style="white-space:pre-wrap;background:#111827;color:#f9fafb;border-radius:12px;padding:12px;font-size:13px;">${escapeHtml(reason || "Unknown reason")}</pre>
        <p style="margin:18px 0 0;">Kontrollera Meta-token, permissions, appinställningar och berörd social connection i Spreelo innan kunden påverkas mer.</p>
        <p style="margin:14px 0 0;"><a href="${escapeHtml(APP_URL)}/social-channels" style="display:inline-block;background:#111827;color:white;text-decoration:none;padding:10px 14px;border-radius:999px;font-weight:700;">Öppna Social channels</a></p>
      </div>
    </div>
  `;

  const text = [
    `VARNING: Spreelo social publicering kräver kontroll (${platformLabel})`,
    `Plattform: ${platformLabel}`,
    `Berört konto/sida: ${safePageName}`,
    `Page/IG ID: ${pageId || "-"}`,
    `User ID: ${userId || "-"}`,
    `Brand profile ID: ${brandProfileId || "-"}`,
    `Status: ${status}`,
    `Tid: ${createdAt}`,
    `Orsak: ${reason || "Unknown reason"}`,
    `Internt admin-länk: ${APP_URL}/social-channels`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Resend social alert email failed");
  }

  return response.json();
}

export async function markConnectionExpiredAndAlert({
  supabase,
  connectionId,
  platform,
  reason,
  resendApiKey,
  nowIso = new Date().toISOString(),
}) {
  if (!connectionId) {
    return { skipped: true, reason: "missing_connection_id" };
  }

  const { data: connection, error: loadError } = await supabase
    .from("social_connections")
    .select("id, user_id, brand_profile_id, platform, page_id, page_name, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (loadError) {
    console.error("Could not load social connection before alert", {
      connectionId,
      platform,
      message: loadError.message,
    });
    return { skipped: true, reason: "load_failed" };
  }

  if (!connection?.id) {
    return { skipped: true, reason: "connection_not_found" };
  }

  if (connection.status === "expired" || connection.status === "needs_reconnect") {
    return { skipped: true, reason: "already_marked" };
  }

  const { error: updateError } = await supabase
    .from("social_connections")
    .update({
      status: "expired",
      updated_at: nowIso,
    })
    .eq("id", connection.id);

  if (updateError) {
    console.error("Could not mark social connection as expired", {
      connectionId: connection.id,
      platform: connection.platform || platform,
      message: updateError.message,
    });
    return { skipped: true, reason: "update_failed" };
  }

  try {
    await sendSocialConnectionAlertEmail({
      resendApiKey,
      platform: connection.platform || platform,
      pageName: connection.page_name,
      pageId: connection.page_id,
      userId: connection.user_id,
      brandProfileId: connection.brand_profile_id,
      reason,
      status: "expired",
    });

    console.log("Social connection alert email sent", {
      connectionId: connection.id,
      platform: connection.platform || platform,
      pageId: connection.page_id,
    });

    return { alerted: true };
  } catch (alertError) {
    console.error("Could not send social connection alert email", {
      connectionId: connection.id,
      platform: connection.platform || platform,
      message: alertError.message,
    });

    return { alerted: false, reason: "email_failed" };
  }
}
