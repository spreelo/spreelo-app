import { createClient } from "@supabase/supabase-js";
import { getServerTranslations, resolveBestServerLocale } from "../../../lib/i18n/serverUiText";
import { resolveLocaleFromUserMetadata } from "../../../lib/userAppLocale.js";

export const dynamic = "force-dynamic";

const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>";
const APP_URL = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://app.spreelo.com").replace(/\/$/, "");

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
    [t("emails.planActivated.goal"), summary.goal, "◎"],
    [t("emails.planActivated.frequency"), summary.frequency, "▣"],
    [t("emails.planActivated.start"), summary.start, "▷"],
    [t("emails.planActivated.channels"), summary.channels, "⌁"],
    [t("emails.planActivated.language"), summary.language, "A"],
    [t("emails.planActivated.credits"), summary.credits, "●"],
  ].filter(([, value]) => value);

  const formatItems = Array.isArray(summary.formats) ? summary.formats : [];
  const ctaUrl = `${APP_URL}/`;
  const logoUrl = `${APP_URL}/brand/spreelologo-on-dark.png`;
  const title = escapeHtml(t("emails.planActivated.title"));
  const intro = escapeHtml(t("emails.planActivated.intro", { brand: summary.brand || "" }));
  const button = escapeHtml(t("emails.planActivated.button"));

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#0b1830">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${title} · ${intro}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f6f8;margin:0;padding:0">
    <tr>
      <td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:660px;background:#071b2c;border-radius:22px;overflow:hidden;box-shadow:0 10px 32px rgba(8,27,44,.12)">
          <tr>
            <td style="padding:24px 28px 20px;background:#071b2c">
              <img src="${logoUrl}" width="132" alt="Spreelo" style="display:block;width:132px;max-width:132px;height:auto;border:0;outline:none;text-decoration:none">
            </td>
          </tr>
          <tr>
            <td style="padding:0 14px 14px;background:#071b2c">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff;border-radius:18px;overflow:hidden">
                <tr>
                  <td style="padding:34px 34px 22px">
                    <div style="font-size:12px;line-height:1.2;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:#ff5a3d;margin:0 0 10px">${escapeHtml(t("emails.planActivated.eyebrow"))}</div>
                    <h1 style="margin:0 0 12px;font-size:31px;line-height:1.14;font-weight:800;letter-spacing:-.02em;color:#0b1830">${title}</h1>
                    <p style="margin:0;color:#66758a;font-size:15px;line-height:1.65">${intro}</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 34px 24px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;background:#ffffff">
                      ${rows.map(([label,value,icon], index) => `<tr>
                        <td style="width:42px;padding:${index === 0 ? "14px" : "11px"} 0 ${index === rows.length - 1 ? "14px" : "11px"} 14px;vertical-align:middle${index < rows.length - 1 ? ";border-bottom:1px solid #edf0f3" : ""}">
                          <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:#f0efff;color:#5d55d8;font-size:14px;font-weight:800">${icon}</div>
                        </td>
                        <td style="padding:${index === 0 ? "14px" : "11px"} 10px ${index === rows.length - 1 ? "14px" : "11px"} 4px;color:#64748b;font-size:14px;line-height:1.35;vertical-align:middle${index < rows.length - 1 ? ";border-bottom:1px solid #edf0f3" : ""}">${escapeHtml(label)}</td>
                        <td align="right" style="padding:${index === 0 ? "14px" : "11px"} 16px ${index === rows.length - 1 ? "14px" : "11px"} 8px;color:#0b1830;font-size:14px;line-height:1.35;font-weight:800;vertical-align:middle${index < rows.length - 1 ? ";border-bottom:1px solid #edf0f3" : ""}">${escapeHtml(value)}</td>
                      </tr>`).join("")}
                    </table>
                  </td>
                </tr>

                ${formatItems.length ? `<tr><td style="padding:0 34px 24px">
                  <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#0b1830">${escapeHtml(t("emails.planActivated.formats"))}</h2>
                  <div>${formatItems.map((item) => `<span style="display:inline-block;margin:0 7px 7px 0;padding:8px 12px;border-radius:999px;background:#f0efff;color:#5148c8;font-size:13px;font-weight:800">${escapeHtml(item)}</span>`).join("")}</div>
                </td></tr>` : ""}

                <tr>
                  <td style="padding:0 34px 24px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f4f3ff;border-left:4px solid #655ce5;border-radius:12px">
                      <tr>
                        <td style="width:44px;padding:18px 0 18px 18px;vertical-align:top">
                          <div style="width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#dedbff;color:#5148c8;font-size:16px;font-weight:800">i</div>
                        </td>
                        <td style="padding:17px 20px 17px 12px">
                          <h2 style="margin:0 0 6px;font-size:17px;line-height:1.3;color:#0b1830">${escapeHtml(t("emails.planActivated.nextTitle"))}</h2>
                          <p style="margin:0;color:#66758a;font-size:14px;line-height:1.65">${escapeHtml(t("emails.planActivated.nextText"))}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 34px 28px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#ff5a3d" style="border-radius:11px;background:#ff5a3d">
                          <a href="${ctaUrl}" style="display:block;padding:15px 22px;color:#ffffff;text-decoration:none;font-size:15px;line-height:1.2;font-weight:800">${button} &nbsp;→</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 34px 28px">
                    <div style="height:1px;background:#e8ebef;margin-bottom:18px"></div>
                    <p style="margin:0;text-align:center;color:#8290a3;font-size:12px;line-height:1.6">${escapeHtml(t("emails.planActivated.thanks"))}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    const locale = resolveLocaleFromUserMetadata(
      user?.user_metadata || {},
      resolveBestServerLocale({ languageCandidates: [body?.locale, summary.language] })
    );
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
