import { createClient } from "@supabase/supabase-js";
import {
  getDefaultNamespaceLabels,
  interpolateUiText,
} from "../../../lib/i18n/defaultLabels.js";
import {
  getServerTranslations,
  resolveBestServerLocale,
  resolveUiLocaleFromLanguageName,
} from "../../../lib/i18n/serverUiText.js";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.spreelo.com";
const CONTACT_EMAIL = "contact@spreelo.com";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fallbackTranslator() {
  const labels = {
    ...getDefaultNamespaceLabels("common"),
    ...getDefaultNamespaceLabels("rejectPages"),
  };
  return {
    locale: "en",
    t(key, values = {}) {
      return interpolateUiText(labels[key] || key, values);
    },
  };
}

async function translatorFor(supabase, locale) {
  if (!supabase) return fallbackTranslator();
  try {
    return await getServerTranslations({
      supabaseAdmin: supabase,
      locale,
      namespaces: ["rejectPages"],
    });
  } catch {
    return fallbackTranslator();
  }
}

function pageShell({ locale, title, body }) {
  return `<!doctype html>
<html lang="${escapeHtml(locale || "en")}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root{--ink:#151b29;--muted:#667085;--line:#e6ddd7;--accent:#c75d40;--deep:#8f3925;--wash:#fff3ec}
*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:28px;background:radial-gradient(circle at 20% 0,rgba(199,93,64,.10),transparent 30%),#f3eee6;font-family:Arial,sans-serif;color:var(--ink);display:grid;place-items:center}.card{width:min(680px,100%);padding:32px;border:1px solid var(--line);border-radius:22px;background:#fffdf9;box-shadow:0 28px 80px rgba(40,28,20,.13)}.brand{display:flex;align-items:center;gap:10px;margin-bottom:24px;font-weight:900;font-size:22px}.mark{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#e86e4e,var(--deep));box-shadow:0 9px 22px rgba(185,87,60,.28)}h1{margin:0;font-size:30px;letter-spacing:-.035em}p{color:var(--muted);line-height:1.65}.notice{margin:20px 0;padding:14px 16px;border:1px solid #f0cbbb;border-radius:12px;background:var(--wash);color:#6f3829;font-size:14px;line-height:1.55}label{display:block;margin-top:16px;font-size:13px;font-weight:800}select,textarea,input{width:100%;margin-top:7px;border:1px solid #d9dfe7;border-radius:11px;background:#fff;padding:12px 13px;font:inherit;color:var(--ink)}textarea{min-height:140px;resize:vertical}.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap}.button,button{min-height:46px;padding:0 19px;border-radius:11px;border:1px solid #d8dde6;font-size:14px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.secondary{background:#fff;color:#344054}.primary{border:0;color:#fff;background:linear-gradient(135deg,#d76b49,#a9472f);box-shadow:0 12px 25px rgba(176,72,43,.23)}.success{text-align:center}.success .icon{width:58px;height:58px;margin:0 auto 18px;border-radius:18px;display:grid;place-items:center;background:#e8f5e9;color:#2f7d40;font-size:28px}.small{font-size:13px;color:#7c8493}@media(max-width:600px){body{padding:14px}.card{padding:24px 20px}.actions{flex-direction:column-reverse}.button,button{width:100%}}
</style>
</head><body><main class="card"><div class="brand"><span class="mark">S</span><span>spreelo</span></div>${body}</main></body></html>`;
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function getContext(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { error: "configuration" };
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const url = new URL(request.url);
  const token = request.method === "POST"
    ? String((await request.clone().formData()).get("token") || "")
    : String(url.searchParams.get("token") || "");
  if (!token) return { admin, token: "", error: "token" };

  const { data: post, error } = await admin
    .from("posts")
    .select("id, user_id, brand_profile_id, status, approval_token, language, content, post_type, platform, scheduled_for")
    .eq("approval_token", token)
    .maybeSingle();
  if (error || !post) return { admin, token, error: "not_found" };

  let brand = null;
  if (post.brand_profile_id) {
    const { data } = await admin
      .from("brand_profiles")
      .select("id, business_name, content_language")
      .eq("id", post.brand_profile_id)
      .maybeSingle();
    brand = data || null;
  }

  const explicitLocale = resolveUiLocaleFromLanguageName(
    url.searchParams.get("lang") || url.searchParams.get("locale")
  );
  const locale = explicitLocale || resolveBestServerLocale({
    request,
    languageCandidates: [post.language, brand?.content_language],
  });
  const translator = await translatorFor(admin, locale);
  return { admin, token, post, brand, translator, locale: translator.locale };
}

async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html, text }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function GET(request) {
  const context = await getContext(request);
  const translator = context.translator || fallbackTranslator();
  const { t } = translator;

  if (context.error) {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.invalid.title"),
      body: `<div class="success"><div class="icon">!</div><h1>${escapeHtml(t("rejectPages.invalid.title"))}</h1><p>${escapeHtml(t("rejectPages.invalid.message"))}</p><div class="actions"><a class="button primary" href="${APP_URL}">${escapeHtml(t("rejectPages.openSpreelo"))}</a></div></div>`,
    }), context.error === "configuration" ? 500 : 400);
  }

  if (context.post.status === "rejected") {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.already.title"),
      body: `<div class="success"><div class="icon">✓</div><h1>${escapeHtml(t("rejectPages.already.title"))}</h1><p>${escapeHtml(t("rejectPages.already.message"))}</p></div>`,
    }));
  }

  if (context.post.status !== "pending_approval") {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.cannot.title"),
      body: `<div class="success"><div class="icon">!</div><h1>${escapeHtml(t("rejectPages.cannot.title"))}</h1><p>${escapeHtml(t("rejectPages.cannot.message"))}</p></div>`,
    }), 409);
  }

  const body = `
    <h1>${escapeHtml(t("rejectPages.form.title"))}</h1>
    <p>${escapeHtml(t("rejectPages.form.intro"))}</p>
    <div class="notice">${escapeHtml(t("rejectPages.form.notice"))}</div>
    <form method="post" action="/api/reject-post">
      <input type="hidden" name="token" value="${escapeHtml(context.token)}" />
      <input type="hidden" name="lang" value="${escapeHtml(translator.locale)}" />
      <label>${escapeHtml(t("rejectPages.form.reasonLabel"))}
        <select name="reason_category" required>
          <option value="">${escapeHtml(t("rejectPages.form.reasonPlaceholder"))}</option>
          <option value="incorrect_information">${escapeHtml(t("rejectPages.reason.incorrect"))}</option>
          <option value="wrong_product_or_service">${escapeHtml(t("rejectPages.reason.wrongProduct"))}</option>
          <option value="tone_or_wording">${escapeHtml(t("rejectPages.reason.tone"))}</option>
          <option value="image_or_video">${escapeHtml(t("rejectPages.reason.visual"))}</option>
          <option value="timing_or_campaign">${escapeHtml(t("rejectPages.reason.timing"))}</option>
          <option value="other">${escapeHtml(t("rejectPages.reason.other"))}</option>
        </select>
      </label>
      <label>${escapeHtml(t("rejectPages.form.detailsLabel"))}
        <textarea name="reason_text" required minlength="10" maxlength="3000" placeholder="${escapeHtml(t("rejectPages.form.detailsPlaceholder"))}"></textarea>
      </label>
      <div class="actions">
        <a class="button secondary" href="${APP_URL}">${escapeHtml(t("rejectPages.form.cancel"))}</a>
        <button class="primary" type="submit">${escapeHtml(t("rejectPages.form.submit"))}</button>
      </div>
    </form>`;

  return htmlResponse(pageShell({ locale: translator.locale, title: t("rejectPages.form.title"), body }));
}

export async function POST(request) {
  const form = await request.formData();
  const token = String(form.get("token") || "").trim();
  const lang = String(form.get("lang") || "").trim();
  const reasonCategory = String(form.get("reason_category") || "").trim();
  const reasonText = String(form.get("reason_text") || "").trim();
  const url = new URL(request.url);
  if (lang) url.searchParams.set("lang", lang);
  if (token) url.searchParams.set("token", token);
  const syntheticRequest = new Request(url, { method: "GET", headers: request.headers });
  const context = await getContext(syntheticRequest);
  const translator = context.translator || fallbackTranslator();
  const { t } = translator;

  if (context.error || !reasonCategory || reasonText.length < 10) {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.invalid.title"),
      body: `<div class="success"><div class="icon">!</div><h1>${escapeHtml(t("rejectPages.invalid.title"))}</h1><p>${escapeHtml(t("rejectPages.form.validation"))}</p></div>`,
    }), 400);
  }

  if (context.post.status !== "pending_approval") {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.cannot.title"),
      body: `<div class="success"><div class="icon">!</div><h1>${escapeHtml(t("rejectPages.cannot.title"))}</h1><p>${escapeHtml(t("rejectPages.cannot.message"))}</p></div>`,
    }), 409);
  }

  let customerEmail = "";
  try {
    const { data } = await context.admin.auth.admin.getUserById(context.post.user_id);
    customerEmail = data?.user?.email || "";
  } catch {}

  const now = new Date().toISOString();
  const { error: feedbackError } = await context.admin
    .from("post_rejection_feedback")
    .insert({
      post_id: context.post.id,
      user_id: context.post.user_id,
      brand_profile_id: context.post.brand_profile_id,
      reason_category: reasonCategory,
      reason_text: reasonText,
      contact_email: customerEmail || null,
      review_status: "new",
      refund_status: "pending_review",
      created_at: now,
      updated_at: now,
    });

  if (feedbackError) {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.failed.title"),
      body: `<div class="success"><div class="icon">!</div><h1>${escapeHtml(t("rejectPages.failed.title"))}</h1><p>${escapeHtml(t("rejectPages.failed.message"))}</p></div>`,
    }), 500);
  }

  const { error: postError } = await context.admin
    .from("posts")
    .update({
      status: "rejected",
      approval_token: null,
      approved_at: null,
      updated_at: now,
    })
    .eq("id", context.post.id)
    .eq("status", "pending_approval");

  if (postError) {
    return htmlResponse(pageShell({
      locale: translator.locale,
      title: t("rejectPages.failed.title"),
      body: `<div class="success"><div class="icon">!</div><h1>${escapeHtml(t("rejectPages.failed.title"))}</h1><p>${escapeHtml(t("rejectPages.failed.message"))}</p></div>`,
    }), 500);
  }

  const brandName = context.brand?.business_name || "Spreelo customer";
  const adminHtml = `<h2>Rejected Spreelo post</h2><p><strong>Customer:</strong> ${escapeHtml(customerEmail || "Unknown")}</p><p><strong>Brand:</strong> ${escapeHtml(brandName)}</p><p><strong>Post:</strong> ${escapeHtml(context.post.post_type || "Post")}</p><p><strong>Category:</strong> ${escapeHtml(reasonCategory)}</p><p><strong>Feedback:</strong></p><p>${escapeHtml(reasonText).replace(/\n/g, "<br>")}</p><p>Review this item in the Spreelo admin approval inbox.</p>`;
  try {
    await sendResendEmail({
      to: CONTACT_EMAIL,
      subject: `Rejected Spreelo post · ${brandName}`,
      html: adminHtml,
      text: `Rejected Spreelo post\nCustomer: ${customerEmail}\nBrand: ${brandName}\nCategory: ${reasonCategory}\n\n${reasonText}`,
    });
    if (customerEmail) {
      await sendResendEmail({
        to: customerEmail,
        subject: t("rejectPages.email.subject"),
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#151b29"><h1>${escapeHtml(t("rejectPages.email.title"))}</h1><p style="line-height:1.7;color:#667085">${escapeHtml(t("rejectPages.email.message"))}</p><p style="line-height:1.7;color:#667085">${escapeHtml(t("rejectPages.email.refund"))}</p></div>`,
        text: `${t("rejectPages.email.title")}\n\n${t("rejectPages.email.message")}\n\n${t("rejectPages.email.refund")}`,
      });
    }
  } catch (emailError) {
    console.error("Could not send rejection notification email", emailError);
  }

  return htmlResponse(pageShell({
    locale: translator.locale,
    title: t("rejectPages.thanks.title"),
    body: `<div class="success"><div class="icon">✓</div><h1>${escapeHtml(t("rejectPages.thanks.title"))}</h1><p>${escapeHtml(t("rejectPages.thanks.message"))}</p><div class="notice">${escapeHtml(t("rejectPages.thanks.refund"))}</div><div class="actions"><a class="button primary" href="${APP_URL}">${escapeHtml(t("rejectPages.openSpreelo"))}</a></div></div>`,
  }));
}
