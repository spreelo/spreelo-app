import { createClient } from "@supabase/supabase-js";
import { getServerTranslations, resolveBestServerLocale } from "../../../lib/i18n/serverUiText";

export const dynamic = "force-dynamic";

const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>";

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildHtml({ t, summary }) {
  const rows = [
    [t("emails.planActivated.goal"), summary.goal],
    [t("emails.planActivated.frequency"), summary.frequency],
    [t("emails.planActivated.start"), summary.start],
    [t("emails.planActivated.channels"), summary.channels],
    [t("emails.planActivated.language"), summary.language],
    [t("emails.planActivated.credits"), summary.credits],
  ].filter(([, value]) => value);

  const formatItems = Array.isArray(summary.formats) ? summary.formats : [];

  return `<!doctype html><html><body style="margin:0;background:#f3eee6;font-family:Arial,sans-serif;color:#151b29">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 14px;background:#f3eee6"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;background:#fffdf9;border:1px solid #eadfd7;border-radius:20px;overflow:hidden">
    <tr><td style="padding:30px 30px 22px;background:linear-gradient(135deg,#fff8f2,#fffdf9)">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#b9573c">Spreelo</div>
      <h1 style="margin:8px 0 10px;font-size:29px;line-height:1.2">${escapeHtml(t("emails.planActivated.title"))}</h1>
      <p style="margin:0;color:#667085;font-size:15px;line-height:1.7">${escapeHtml(t("emails.planActivated.intro", { brand: summary.brand || "" }))}</p>
    </td></tr>
    <tr><td style="padding:0 30px 22px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f1;border:1px solid #f0d5c7;border-radius:14px">
        <tr><td style="padding:18px 20px"><p style="margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9a4b34;font-weight:800">${escapeHtml(t("emails.planActivated.summary"))}</p>
        <table width="100%" cellpadding="0" cellspacing="0">${rows.map(([label,value]) => `<tr><td style="padding:7px 12px 7px 0;color:#7a6f68;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0;color:#151b29;font-size:14px;font-weight:700;text-align:right">${escapeHtml(value)}</td></tr>`).join("")}</table>
        </td></tr>
      </table>
    </td></tr>
    ${formatItems.length ? `<tr><td style="padding:0 30px 22px"><h2 style="margin:0 0 10px;font-size:17px">${escapeHtml(t("emails.planActivated.formats"))}</h2><div>${formatItems.map((item) => `<span style="display:inline-block;margin:0 7px 7px 0;padding:8px 11px;border-radius:999px;background:#f6ebe5;color:#7f3f2d;font-size:13px;font-weight:700">${escapeHtml(item)}</span>`).join("")}</div></td></tr>` : ""}
    <tr><td style="padding:0 30px 28px"><div style="padding:18px 20px;border-left:4px solid #c75d40;background:#fffaf5;border-radius:12px"><h2 style="margin:0 0 7px;font-size:17px">${escapeHtml(t("emails.planActivated.nextTitle"))}</h2><p style="margin:0;color:#667085;font-size:14px;line-height:1.65">${escapeHtml(t("emails.planActivated.nextText"))}</p></div></td></tr>
    <tr><td style="padding:23px 30px;background:#0b1724;color:#fff"><p style="margin:0;font-size:14px;line-height:1.6">${escapeHtml(t("emails.planActivated.thanks"))}</p></td></tr>
  </table>
  </td></tr></table></body></html>`;
}

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const token = bearerToken(request);
    if (!supabaseUrl || !anonKey || !token) {
      return Response.json({ ok: false, error: "Authentication is required." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.email) {
      return Response.json({ ok: false, error: "Your login session is not valid." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const summary = body?.summary || {};
    const locale = resolveBestServerLocale({ languageCandidates: [body?.locale, summary.language] });
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : null;
    const { t } = await getServerTranslations({
      supabaseAdmin: admin,
      locale,
      namespaces: ["emails"],
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: true, skipped: true, reason: "missing_resend_api_key" });
    }

    const html = buildHtml({ t, summary });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: user.email,
        subject: t("emails.planActivated.subject", { brand: summary.brand || "Spreelo" }),
        html,
        text: `${t("emails.planActivated.title")}\n\n${t("emails.planActivated.nextText")}\n\n${t("emails.planActivated.thanks")}`,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Could not send plan activation email", error);
    return Response.json({ ok: false, error: error.message || "Could not send email." }, { status: 500 });
  }
}
