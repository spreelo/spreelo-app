import { createClient } from "@supabase/supabase-js";
import {
  getServerTranslations,
  resolveBestServerLocale,
} from "../../../../lib/i18n/serverUiText";

export const dynamic = "force-dynamic";

const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>";
const recentRequests = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function isRateLimited(request, email) {
  const now = Date.now();
  const forwardedFor = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const key = `${forwardedFor || "unknown"}:${email}`;
  const previous = recentRequests.get(key) || 0;
  recentRequests.set(key, now);

  if (recentRequests.size > 500) {
    for (const [entryKey, timestamp] of recentRequests.entries()) {
      if (now - timestamp > 10 * 60 * 1000) recentRequests.delete(entryKey);
    }
  }

  return now - previous < 55 * 1000;
}

function buildEmail({ t, code, locale }) {
  const safeCode = escapeHtml(code);
  const subject = t("emails.signIn.subject");
  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}"><body style="margin:0;background:#f1f3f8;font-family:Arial,Helvetica,sans-serif;color:#111a2e">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:38px 14px;background:radial-gradient(circle at 15% 0%,#eef2ff 0,transparent 38%),#f1f3f8"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;overflow:hidden;border:1px solid #e3e7ef;border-radius:24px;background:#ffffff;box-shadow:0 24px 64px rgba(24,33,58,.11)">
  <tr><td style="padding:28px 34px 24px;background:linear-gradient(135deg,#071b2d,#17395a);color:#fff">
    <div style="display:inline-block;padding:8px 11px;border-radius:11px;background:linear-gradient(135deg,#ff795c,#df462b);font-size:18px;font-weight:900">S</div>
    <span style="margin-left:9px;font-size:21px;font-weight:900;vertical-align:middle">spreelo</span>
  </td></tr>
  <tr><td style="padding:34px">
    <div style="margin-bottom:10px;color:#d55337;font-size:12px;font-weight:900;letter-spacing:.11em;text-transform:uppercase">${escapeHtml(t("emails.signIn.eyebrow"))}</div>
    <h1 style="margin:0 0 13px;font-size:31px;line-height:1.15;letter-spacing:-.035em">${escapeHtml(t("emails.signIn.title"))}</h1>
    <p style="margin:0;color:#667085;font-size:16px;line-height:1.65">${escapeHtml(t("emails.signIn.intro"))}</p>
    <div style="margin:28px 0;padding:24px;border:1px solid #eadfd8;border-radius:18px;background:linear-gradient(135deg,#fff7f2,#f8f6ff);text-align:center">
      <div style="margin-bottom:11px;color:#6b7280;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(t("emails.signIn.codeLabel"))}</div>
      <div style="font-size:42px;font-weight:900;letter-spacing:.23em;color:#101828">${safeCode}</div>
    </div>
    <p style="margin:0 0 8px;color:#475467;font-size:14px;line-height:1.6">${escapeHtml(t("emails.signIn.expires"))}</p>
    <p style="margin:0;color:#667085;font-size:14px;line-height:1.6">${escapeHtml(t("emails.signIn.ignore"))}</p>
  </td></tr>
  <tr><td style="padding:20px 34px;background:#f8fafc;color:#7a8497;font-size:12px;line-height:1.6">${escapeHtml(t("emails.signIn.security"))}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${t("emails.signIn.title")}\n\n${t("emails.signIn.intro")}\n\n${code}\n\n${t("emails.signIn.expires")}\n${t("emails.signIn.ignore")}`;
  return { subject, html, text };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!email) {
      return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }
    if (isRateLimited(request, email)) {
      return Response.json({ ok: false, code: "RATE_LIMIT", error: "Wait before requesting another code." }, { status: 429 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!supabaseUrl || !serviceRoleKey || !resendKey) {
      throw new Error("Sign-in email service is not configured.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const locale = resolveBestServerLocale({ request, languageCandidates: [body?.locale] });
    const redirectTo = String(body?.emailRedirectTo || `${process.env.NEXT_PUBLIC_APP_URL || "https://app.spreelo.com"}/login`);
    const linkOptions = {
      redirectTo,
      data: { app_locale: locale },
    };
    let linkResult = await admin.auth.admin.generateLink({ type: "magiclink", email, options: linkOptions });
    if (linkResult.error && /not found|does not exist/i.test(linkResult.error.message || "")) {
      linkResult = await admin.auth.admin.generateLink({ type: "signup", email, password: crypto.randomUUID(), options: linkOptions });
    }
    if (linkResult.error) throw linkResult.error;

    const code = String(linkResult.data?.properties?.email_otp || "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("Could not create a verification code.");

    const translator = await getServerTranslations({ supabaseAdmin: admin, locale, namespaces: ["emails"] });
    const emailContent = buildEmail({ ...translator, code, locale });
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: email, ...emailContent }),
    });
    if (!resendResponse.ok) throw new Error(await resendResponse.text());

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Could not send localized sign-in code", error);
    return Response.json({ ok: false, error: "Could not send the sign-in code. Try again shortly." }, { status: 500 });
  }
}
