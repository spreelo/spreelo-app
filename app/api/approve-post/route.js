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

import {
  fetchTikTokCreatorInfo,
  getHealthyTikTokAccessToken,
  getTikTokEnv,
} from "../../../lib/tiktokOAuth.js";
import { recordBrandLearningEvent } from "../../../lib/brandLearning.js";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.spreelo.com";

function createFallbackTranslator() {
  const labels = {
    ...getDefaultNamespaceLabels("common"),
    ...getDefaultNamespaceLabels("approvePages"),
  };

  return {
    locale: "en",
    t(key, values = {}) {
      return interpolateUiText(labels[key] || key, values);
    },
  };
}

async function getApproveTranslations({ supabase, locale }) {
  if (!supabase) return createFallbackTranslator();

  try {
    return await getServerTranslations({
      supabaseAdmin: supabase,
      locale,
      namespaces: ["approvePages"],
    });
  } catch (error) {
    console.error("Could not load approve page translations", error);
    return createFallbackTranslator();
  }
}

async function getUserAppLanguage(supabase, userId) {
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (error || !data?.user) return null;

    const metadata = data.user.user_metadata || {};

    return (
      metadata.app_language ||
      metadata.appLanguage ||
      metadata.ui_language ||
      metadata.locale ||
      null
    );
  } catch (error) {
    console.error("Could not load user app language for approval page", error);
    return null;
  }
}

function resolveApprovalPageLocale({ request, url, post, brandProfile, userAppLanguage }) {
  const explicitUrlLocale = resolveUiLocaleFromLanguageName(
    url?.searchParams?.get("lang") || url?.searchParams?.get("locale")
  );

  if (explicitUrlLocale) return explicitUrlLocale;

  const userAppLocale = resolveUiLocaleFromLanguageName(userAppLanguage);

  if (userAppLocale) return userAppLocale;

  return resolveBestServerLocale({
    request,
    languageCandidates: [post?.language, brandProfile?.content_language],
  });
}

function getApprovalExperienceCss() {
  return `
    :root {
      --sp-ink: #0b1733;
      --sp-muted: #68738b;
      --sp-line: #e4e8f1;
      --sp-soft: #f7f8fc;
      --sp-purple: #7627ee;
      --sp-purple-2: #9b2ee9;
      --sp-pink: #d91ebd;
      --sp-coral: #ff6258;
      --sp-green: #168a58;
      --sp-green-bg: #ecfbf3;
      --sp-green-line: #ccefdc;
      --sp-warn-bg: #fff7e9;
      --sp-warn-line: #f2d49b;
      --sp-error: #b42318;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--sp-ink);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      background:
        radial-gradient(circle at 7% 9%, rgba(119,39,238,.10), transparent 21%),
        radial-gradient(circle at 94% 88%, rgba(255,98,88,.15), transparent 25%),
        linear-gradient(135deg, #fbfbff 0%, #f7f8ff 58%, #fff8fb 100%);
    }
    body::before, body::after {
      content: "";
      position: fixed;
      pointer-events: none;
      z-index: 0;
    }
    body::before {
      left: 0; bottom: 7%; width: 135px; height: 160px;
      opacity: .46;
      background-image: radial-gradient(circle, #8e62ff 1.25px, transparent 1.35px);
      background-size: 14px 14px;
      mask-image: linear-gradient(90deg, #000, transparent);
    }
    body::after {
      right: -100px; bottom: -120px; width: 390px; height: 390px;
      background: linear-gradient(135deg, rgba(142,55,239,.23), rgba(255,90,106,.42));
      transform: rotate(18deg);
      border-radius: 70px;
      filter: blur(.2px);
    }
    .sp-page {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      padding: 28px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    .sp-shell {
      width: min(1460px, 100%);
      background: rgba(255,255,255,.985);
      border: 1px solid rgba(225,229,239,.94);
      border-radius: 26px;
      box-shadow: 0 26px 78px rgba(33,28,70,.10);
      overflow: hidden;
    }
    .sp-topbar {
      min-height: 78px;
      padding: 20px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      border-bottom: 1px solid var(--sp-line);
    }
    .sp-logo { display: block; width: 158px; height: auto; }
    .sp-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 14px;
      border-radius: 999px;
      border: 1px solid var(--sp-green-line);
      background: var(--sp-green-bg);
      color: var(--sp-green);
      font-size: 13px;
      font-weight: 800;
      white-space: nowrap;
    }
    .sp-status.is-error { color: var(--sp-error); background: #fff1f0; border-color: #ffd3ce; }
    .sp-status-icon {
      width: 20px; height: 20px; border-radius: 999px;
      display: grid; place-items: center;
      border: 1px solid currentColor;
      font-size: 12px; line-height: 1;
    }
    .sp-hero {
      padding: 26px 34px 10px;
      display: grid;
      grid-template-columns: minmax(0,1fr) auto;
      gap: 38px;
      align-items: start;
    }
    .sp-kicker { margin: 0 0 7px; color: #6e5d84; font-size: 11px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
    .sp-title { margin: 0; font-size: clamp(30px, 3.1vw, 43px); line-height: 1.08; letter-spacing: -.045em; font-weight: 900; }
    .sp-subtitle { margin: 8px 0 0; font-size: 16px; font-weight: 760; color: #17213a; }
    .sp-intro { margin: 6px 0 0; max-width: 790px; color: var(--sp-muted); font-size: 14px; line-height: 1.55; }
    .sp-stepper {
      min-width: 390px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: start;
      gap: 0;
      padding-top: 8px;
    }
    .sp-step { position: relative; text-align: center; color: #7b859b; font-size: 12px; font-weight: 750; }
    .sp-step:not(:last-child)::after {
      content: ""; position: absolute; top: 16px; left: calc(50% + 22px); right: calc(-50% + 22px);
      height: 2px; background: #e0e4ec;
    }
    .sp-step.done:not(:last-child)::after, .sp-step.active:not(:last-child)::after { background: linear-gradient(90deg,#c4a5ff,#e3d5ff); }
    .sp-step-dot {
      position: relative; z-index: 1; margin: 0 auto 8px; width: 34px; height: 34px; border-radius: 999px;
      display: grid; place-items: center; background: #f0f2f6; color: #748097; border: 1px solid #e4e7ed; font-size: 13px; font-weight: 900;
    }
    .sp-step.done .sp-step-dot { background: #f0f2f6; color: #29364e; }
    .sp-step.active { color: var(--sp-purple); }
    .sp-step.active .sp-step-dot { color: #fff; background: linear-gradient(135deg,var(--sp-purple),var(--sp-purple-2)); border-color: transparent; box-shadow: 0 8px 20px rgba(118,39,238,.22); }
    .sp-content { padding: 20px 34px 34px; }
    .sp-grid { display: grid; grid-template-columns: minmax(0,1.38fr) minmax(360px,.92fr); gap: 22px; align-items: stretch; }
    .sp-card { background: #fff; border: 1px solid var(--sp-line); border-radius: 17px; padding: 20px; box-shadow: 0 3px 10px rgba(25,28,52,.02); }
    .sp-card + .sp-card { margin-top: 15px; }
    .sp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
    .sp-card h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
    .sp-card p.sp-help { margin: 5px 0 0; color: var(--sp-muted); font-size: 12.5px; line-height: 1.45; }
    .sp-quote { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--sp-purple); background: #f3eaff; font-weight: 900; font-size: 24px; }
    .sp-media-wrap { position: relative; overflow: hidden; border-radius: 15px; background: #eaf7fc; min-height: 480px; display: grid; place-items: center; }
    .sp-media { display: block; width: 100%; height: 540px; object-fit: contain; background: #101319; }
    .sp-media.is-image { background: #f7f8fb; }
    .sp-empty { width: 100%; min-height: 460px; display: grid; place-items: center; color: #8a95a8; background: #f7f8fb; }
    .sp-carousel-stage { position: relative; width: 100%; height: 540px; background: #101319; }
    .sp-carousel-slide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity .18s ease; }
    .sp-carousel-slide.active { opacity: 1; }
    .sp-carousel-nav { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 10px; font-size: 12px; font-weight: 850; }
    .sp-nav-btn { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--sp-line); background: #fff; cursor: pointer; color: var(--sp-ink); font-size: 18px; }
    .sp-tabs { display: inline-flex; gap: 5px; padding: 4px; border-radius: 11px; border: 1px solid var(--sp-line); background: #fff; }
    .sp-platform { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 7px 11px; border-radius: 8px; color: #263149; font-size: 12px; font-weight: 850; }
    .sp-platform:first-child { background: #10182a; color: #fff; }
    .sp-platform img { width: 18px; height: 18px; object-fit: contain; }
    .sp-copy { color: #202b43; font-size: 14px; line-height: 1.75; white-space: normal; overflow-wrap: anywhere; }
    .sp-note { display: flex; align-items: flex-start; gap: 10px; padding: 13px 14px; border-radius: 12px; border: 1px solid #ffcdbf; background: #fff7f4; }
    .sp-note-icon { width: 25px; height: 25px; flex: 0 0 auto; border-radius: 8px; display: grid; place-items: center; background: #fff; font-weight: 900; }
    .sp-note strong, .sp-note span { display: block; }
    .sp-note strong { font-size: 12.5px; }
    .sp-note span { margin-top: 2px; font-size: 11.5px; color: var(--sp-muted); line-height: 1.4; }
    .sp-detail-row { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid #eef0f5; font-size: 12.5px; }
    .sp-detail-row:first-of-type { border-top: 0; }
    .sp-detail-label { display: flex; align-items: center; gap: 9px; color: #667188; }
    .sp-detail-value { font-weight: 800; color: #27324a; text-align: right; }
    .sp-actions { display: grid; grid-template-columns: minmax(0,.82fr) minmax(0,1.18fr); gap: 12px; margin-top: 16px; }
    .sp-btn { min-height: 52px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 18px; font: inherit; font-size: 14px; font-weight: 900; text-decoration: none; cursor: pointer; }
    .sp-btn-secondary { color: var(--sp-ink); background: #fff; border: 1.5px solid #b782ff; }
    .sp-btn-primary { color: #fff; border: 0; background: linear-gradient(95deg,var(--sp-purple) 0%,var(--sp-pink) 52%,var(--sp-coral) 100%); box-shadow: 0 12px 25px rgba(160,42,194,.18); }
    .sp-btn-dark { color: #fff; border: 0; background: #0d172b; box-shadow: 0 10px 23px rgba(13,23,43,.16); }
    .sp-btn:disabled { opacity: .48; cursor: not-allowed; }
    .sp-field { margin-top: 15px; }
    .sp-field:first-child { margin-top: 0; }
    .sp-field > label, .sp-section-label { display: block; margin-bottom: 7px; font-size: 12.5px; font-weight: 900; color: #202a41; }
    .sp-field small { display: block; margin-top: 6px; color: var(--sp-muted); font-size: 11.3px; line-height: 1.45; }
    .sp-input, .sp-select { width: 100%; border: 1px solid #d8dee9; border-radius: 11px; background: #fff; color: var(--sp-ink); padding: 11px 12px; font: inherit; outline: none; }
    .sp-input:focus, .sp-select:focus { border-color: #a569ff; box-shadow: 0 0 0 3px rgba(118,39,238,.09); }
    textarea.sp-input { min-height: 125px; resize: vertical; }
    .sp-section { margin-top: 16px; padding-top: 15px; border-top: 1px solid #edf0f5; }
    .sp-checks { display: grid; gap: 8px; }
    .sp-check { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border: 1px solid #e2e6ee; border-radius: 11px; background: #fff; cursor: pointer; }
    .sp-check input { margin-top: 3px; accent-color: var(--sp-purple); }
    .sp-check strong, .sp-check small { display: block; }
    .sp-check strong { font-size: 12.5px; }
    .sp-check small { margin-top: 2px; color: var(--sp-muted); font-size: 11px; line-height: 1.4; }
    .sp-check.disabled { opacity: .52; background: #f7f8fa; cursor: not-allowed; }
    .sp-commercial-options { display: none; margin-top: 8px; gap: 8px; }
    .sp-commercial.is-on .sp-commercial-options { display: grid; }
    .sp-consent { margin-top: 16px; padding: 12px; border: 1px solid #dfe4ee; background: #f8f9fc; border-radius: 12px; }
    .sp-mode { display: flex; align-items: flex-start; gap: 10px; padding: 12px 13px; margin-bottom: 14px; border-radius: 12px; font-size: 12px; line-height: 1.45; }
    .sp-mode.warn { background: var(--sp-warn-bg); border: 1px solid var(--sp-warn-line); }
    .sp-mode.ok { background: var(--sp-green-bg); border: 1px solid var(--sp-green-line); }
    .sp-mode strong, .sp-mode span { display: block; }
    .sp-mode span { margin-top: 2px; color: #616c82; }
    .sp-account { display: flex; align-items: center; gap: 10px; padding: 10px 11px; border: 1px solid var(--sp-line); border-radius: 12px; background: #f8f9fc; }
    .sp-account img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
    .sp-account strong, .sp-account span { display: block; }
    .sp-account span { font-size: 10.5px; color: var(--sp-muted); }
    .sp-account strong { font-size: 12.5px; margin: 1px 0; }
    .sp-next { margin-top: 13px; padding: 11px 12px; border: 1px solid #e3e7ef; border-radius: 11px; background: #fafbfe; font-size: 11.5px; color: var(--sp-muted); line-height: 1.45; }
    .sp-next strong { color: #28334a; }
    .sp-foot { margin: 11px 0 0; text-align: center; color: #929aaa; font-size: 10.5px; }
    .sp-success-wrap { padding: 26px 34px 42px; }
    .sp-success-card { max-width: 720px; margin: 20px auto 0; padding: 42px; border: 1px solid var(--sp-line); border-radius: 18px; text-align: center; background: #fff; box-shadow: 0 8px 26px rgba(25,28,52,.04); }
    .sp-success-icon { width: 64px; height: 64px; margin: 0 auto 18px; border-radius: 18px; display: grid; place-items: center; background: var(--sp-green-bg); border: 1px solid var(--sp-green-line); color: var(--sp-green); font-size: 28px; font-weight: 900; }
    .sp-success-card h2 { margin: 0; font-size: 31px; letter-spacing: -.035em; }
    .sp-success-card p { max-width: 560px; margin: 10px auto 0; color: var(--sp-muted); font-size: 14px; line-height: 1.6; }
    .sp-success-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 11px; margin-top: 24px; }
    .sp-success-actions .sp-btn { min-width: 160px; }
    @media (max-width: 980px) {
      .sp-page { padding: 14px; }
      .sp-hero { grid-template-columns: 1fr; gap: 18px; }
      .sp-stepper { min-width: 0; width: min(460px,100%); }
      .sp-grid { grid-template-columns: 1fr; }
      .sp-media, .sp-carousel-stage { height: min(74vw, 560px); }
    }
    @media (max-width: 620px) {
      .sp-page { padding: 7px; }
      .sp-shell { border-radius: 19px; }
      .sp-topbar { min-height: 66px; padding: 16px 18px; }
      .sp-logo { width: 132px; }
      .sp-status { font-size: 11px; padding: 7px 10px; }
      .sp-hero { padding: 22px 18px 8px; }
      .sp-title { font-size: 31px; }
      .sp-content { padding: 14px 18px 22px; }
      .sp-card { padding: 15px; }
      .sp-media-wrap { min-height: 0; }
      .sp-media, .sp-carousel-stage { height: 78vw; }
      .sp-actions { grid-template-columns: 1fr; }
      .sp-stepper { font-size: 10px; }
      .sp-success-wrap { padding: 10px 18px 28px; }
      .sp-success-card { padding: 30px 20px; }
      .sp-success-actions { flex-direction: column; }
      .sp-success-actions .sp-btn { width: 100%; }
    }
  `;
}

function getApprovalStepperHtml({ t, activeStep = 2 }) {
  const tr = typeof t === "function" ? t : (key) => key;
  const steps = [
    tr("approvePages.experience.stepCreated"),
    tr("approvePages.experience.stepReview"),
    tr("approvePages.experience.stepPublish"),
  ];
  return `<div class="sp-stepper">${steps.map((label, index) => {
    const step = index + 1;
    const state = step < activeStep ? "done" : step === activeStep ? "active" : "";
    const dot = step < activeStep ? "✓" : String(step);
    return `<div class="sp-step ${state}"><div class="sp-step-dot">${dot}</div><span>${escapeTikTokHtml(label)}</span></div>`;
  }).join("")}</div>`;
}

function getApprovalPlatformNames(platform, t = null) {
  const tr = typeof t === "function" ? t : (key) => key;
  const value = String(platform || "").toLowerCase();
  const definitions = [
    ["tiktok", "TikTok", "tiktok.png"],
    ["youtube", "YouTube", "youtube.png"],
    ["instagram", "Instagram", "instagram.png"],
    ["facebook", "Facebook", "facebook.png"],
    ["threads", "Threads", "threads.svg"],
    ["pinterest", "Pinterest", "pinterest.png"],
    ["linkedin", "LinkedIn", "linkedin.png"],
  ];
  const found = definitions.filter(([key]) => value.includes(key));
  if (found.length) return found;
  return [["social", String(platform || tr("approvePages.experience.socialMedia")), null]];
}

function getApprovalPlatformChipsHtml(platform, t = null) {
  return `<div class="sp-tabs">${getApprovalPlatformNames(platform, t).map(([, label, icon]) => `<span class="sp-platform">${icon ? `<img src="${APP_URL.replace(/\/$/, "")}/social-icons/${icon}" alt="">` : ""}${escapeTikTokHtml(label)}</span>`).join("")}</div>`;
}

function createHtmlPage({ title, message, status = "success", t, locale = "en" }) {
  const tr = typeof t === "function" ? t : (key) => key;
  const isSuccess = status === "success";
  const logoUrl = `${APP_URL.replace(/\/$/, "")}/brand/spreelologo.png`;
  return `<!doctype html>
<html lang="${escapeTikTokHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeTikTokHtml(title)}</title>
<style>${getApprovalExperienceCss()}</style>
</head>
<body>
<main class="sp-page"><section class="sp-shell">
<header class="sp-topbar"><img class="sp-logo" src="${escapeTikTokHtml(logoUrl)}" alt="Spreelo"><span class="sp-status ${isSuccess ? "" : "is-error"}"><span class="sp-status-icon">${isSuccess ? "✓" : "!"}</span>${escapeTikTokHtml(tr(isSuccess ? "approvePages.experience.readyToPublish" : "approvePages.experience.needsAttention"))}</span></header>
<section class="sp-hero"><div><p class="sp-kicker">${escapeTikTokHtml(tr("approvePages.experience.kicker"))}</p><h1 class="sp-title">${escapeTikTokHtml(title)}</h1><p class="sp-subtitle">${escapeTikTokHtml(tr(isSuccess ? "approvePages.experience.successSubtitle" : "approvePages.experience.errorSubtitle"))}</p></div>${getApprovalStepperHtml({ t: tr, activeStep: isSuccess ? 3 : 2 })}</section>
<div class="sp-success-wrap"><section class="sp-success-card"><div class="sp-success-icon">${isSuccess ? "✓" : "!"}</div><h2>${escapeTikTokHtml(title)}</h2><p>${escapeTikTokHtml(message)}</p><div class="sp-success-actions">${isSuccess ? `<button class="sp-btn sp-btn-secondary" type="button" onclick="window.close()">${escapeTikTokHtml(tr("approvePages.closePage"))}</button>` : ""}<a class="sp-btn sp-btn-primary" href="${escapeTikTokHtml(APP_URL)}">${escapeTikTokHtml(tr("approvePages.openSpreelo"))} →</a></div>${isSuccess ? `<div class="sp-next"><strong>${escapeTikTokHtml(tr("approvePages.experience.nextTitle"))}</strong><br>${escapeTikTokHtml(tr("approvePages.safeClose"))}</div>` : ""}</section></div>
</section></main>
</body></html>`;
}

function escapeTikTokHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isTikTokTarget(platform) {
  return String(platform || "").toLowerCase().replaceAll(" ", "").includes("tiktok");
}

function hasTikTokExplicitApproval(post) {
  return Boolean(post?.platform_publish_settings?.tiktok?.explicit_consent);
}

async function getTikTokApprovalContext({ supabase, post }) {
  const { data: connection, error } = await supabase
    .from("social_connections")
    .select("id, user_id, brand_profile_id, page_id, page_name, page_access_token, token_expires_at, refresh_token, refresh_token_expires_at, permissions, status")
    .eq("user_id", post.user_id)
    .eq("brand_profile_id", post.brand_profile_id)
    .eq("platform", "tiktok")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!connection?.id) {
    const reconnectError = new Error("TikTok is no longer connected for this brand. Reconnect TikTok in Spreelo before approving this post.");
    reconnectError.requiresReconnect = true;
    throw reconnectError;
  }
  const healthy = await getHealthyTikTokAccessToken({ supabase, connection });
  const creatorInfo = await fetchTikTokCreatorInfo(healthy.accessToken);
  return { connection: healthy.connection || connection, accessToken: healthy.accessToken, creatorInfo };
}

function getTikTokApprovalSlideMetadata(slide) {
  const metadata = slide?.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata;
  if (typeof metadata === "string") {
    try { return JSON.parse(metadata) || {}; } catch { return {}; }
  }
  return {};
}


async function loadApprovalCarouselSlides({ supabase, postId }) {
  const { data, error } = await supabase
    .from("post_slides")
    .select("slide_order, image_url, metadata")
    .eq("post_id", postId)
    .order("slide_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function markGeneralPostApproved({ supabase, post }) {
  if (!post?.id) throw new Error("Post is missing from the approval request");
  const approvedAt = post.approved_at || new Date().toISOString();
  const { error: updateError } = await supabase
    .from("posts")
    .update({
      status: "approved",
      approved_at: approvedAt,
      publish_locked_until: null,
      next_publish_attempt_at: null,
      last_publish_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);
  if (updateError) throw updateError;

  await supabase
    .from("admin_review_cases")
    .update({
      status: "customer_approved",
      needs_review: false,
      updated_at: new Date().toISOString(),
    })
    .eq("post_id", post.id);

  // Grow Brain step 1: record the customer's explicit approval as a brand-level
  // learning signal. The helper is deliberately fail-open, so a missing/new
  // learning table can never block the existing approval flow.
  await recordBrandLearningEvent({
    supabase,
    post,
    eventType: "approved",
  });

  return approvedAt;
}

async function renderTikTokApprovalResponse({ supabase, post, token, translator }) {
  const { creatorInfo } = await getTikTokApprovalContext({ supabase, post });
  const { publicPostingReady, allowPrivateTesting } = getTikTokEnv();
  const carouselSlides = String(post.content_format || "") === "carousel"
    ? await loadApprovalCarouselSlides({ supabase, postId: post.id })
    : [];
  return new Response(
    createTikTokApprovalHtml({
      post,
      token,
      creatorInfo,
      carouselSlides,
      locale: translator.locale,
      publicPostingReady,
      allowPrivateTesting,
      t: translator.t,
    }),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function createGeneralApprovalPreviewHtml({ post, token, carouselSlides = [], locale = "en", t }) {
  const tr = typeof t === "function" ? t : (key) => key;
  const logoUrl = `${APP_URL.replace(/\/$/, "")}/brand/spreelologo.png`;
  const isVideo = Boolean(post.video_url) || String(post.content_format || "") === "animated_video";
  const isCarousel = String(post.content_format || "") === "carousel";
  const safeContent = escapeTikTokHtml(post.content || "").replace(/\n/g, "<br>");
  const slides = (carouselSlides || [])
    .filter((slide) => slide?.image_url)
    .sort((a, b) => Number(a?.slide_order || 0) - Number(b?.slide_order || 0));

  let media = `<div class="sp-empty">${escapeTikTokHtml(tr("approvePages.tiktok.previewUnavailable"))}</div>`;
  if (isVideo && post.video_url) {
    media = `<div class="sp-media-wrap"><video id="approvalVideo" class="sp-media" src="${escapeTikTokHtml(post.video_url)}" poster="${escapeTikTokHtml(post.image_url || "")}" controls playsinline></video></div>`;
  } else if (isCarousel && slides.length) {
    media = `<div class="sp-media-wrap"><div class="sp-carousel-stage">${slides.map((slide, index) => `<img class="sp-carousel-slide${index === 0 ? " active" : ""}" data-slide="${index}" src="${escapeTikTokHtml(slide.image_url)}" alt="">`).join("")}</div></div><div class="sp-carousel-nav"><button type="button" class="sp-nav-btn" id="generalPrev" aria-label="${escapeTikTokHtml(tr("approvePages.tiktok.previous"))}">←</button><span id="generalCounter">1 / ${slides.length}</span><button type="button" class="sp-nav-btn" id="generalNext" aria-label="${escapeTikTokHtml(tr("approvePages.tiktok.next"))}">→</button></div>`;
  } else if (post.image_url) {
    media = `<div class="sp-media-wrap"><img class="sp-media is-image" src="${escapeTikTokHtml(post.image_url)}" alt=""></div>`;
  }

  const tiktokNote = isTikTokTarget(post.platform)
    ? `<div class="sp-note"><div class="sp-note-icon">♪</div><div><strong>${escapeTikTokHtml(tr("approvePages.preview.tiktokStepTitle"))}</strong><span>${escapeTikTokHtml(tr("approvePages.preview.tiktokStepHelp"))}</span></div></div>`
    : "";

  const formatValue = isVideo ? tr("approvePages.preview.videoFormat") : isCarousel ? tr("approvePages.preview.carouselFormat", { count: slides.length }) : tr("approvePages.preview.imageFormat");

  return `<!doctype html>
<html lang="${escapeTikTokHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeTikTokHtml(tr("approvePages.preview.pageTitle"))}</title>
<style>${getApprovalExperienceCss()}
.sp-preview-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:14px;border-top:1px solid #edf0f5;padding-top:14px}.sp-meta{display:flex;align-items:center;gap:10px;padding:0 16px;border-left:1px solid #edf0f5}.sp-meta:first-child{border-left:0;padding-left:6px}.sp-meta-icon{width:32px;height:32px;border-radius:9px;background:#f3f4f8;display:grid;place-items:center;font-size:15px}.sp-meta strong,.sp-meta span{display:block}.sp-meta strong{font-size:12.5px}.sp-meta span{font-size:10.5px;color:var(--sp-muted);margin-top:2px}@media(max-width:620px){.sp-preview-meta{grid-template-columns:1fr}.sp-meta{border-left:0;border-top:1px solid #edf0f5;padding:10px 0}.sp-meta:first-child{border-top:0}}</style>
</head>
<body>
<main class="sp-page"><section class="sp-shell">
<header class="sp-topbar"><img class="sp-logo" src="${escapeTikTokHtml(logoUrl)}" alt="Spreelo"><span class="sp-status"><span class="sp-status-icon">✓</span>${escapeTikTokHtml(tr("approvePages.experience.readyToPublish"))}</span></header>
<section class="sp-hero"><div><p class="sp-kicker">${escapeTikTokHtml(tr("approvePages.preview.eyebrow"))}</p><h1 class="sp-title">${escapeTikTokHtml(tr("approvePages.preview.titleV2"))}</h1><p class="sp-subtitle">${escapeTikTokHtml(tr("approvePages.preview.subtitleV2"))}</p><p class="sp-intro">${escapeTikTokHtml(tr("approvePages.preview.intro"))}</p></div>${getApprovalStepperHtml({ t: tr, activeStep: 2 })}</section>
<div class="sp-content"><div class="sp-grid">
<section class="sp-card"><div class="sp-card-head"><div><h2>${escapeTikTokHtml(tr("approvePages.preview.mediaTitle"))}</h2><p class="sp-help">${escapeTikTokHtml(tr(isVideo ? "approvePages.preview.videoHint" : isCarousel ? "approvePages.preview.carouselHint" : "approvePages.preview.imageHint"))}</p></div>${getApprovalPlatformChipsHtml(post.platform, tr)}</div>${media}
<div class="sp-preview-meta"><div class="sp-meta"><div class="sp-meta-icon">◷</div><div><strong id="mediaDuration">${escapeTikTokHtml(isVideo ? tr("approvePages.preview.loadingMedia") : "—")}</strong><span>${escapeTikTokHtml(tr("approvePages.preview.duration"))}</span></div></div><div class="sp-meta"><div class="sp-meta-icon">▣</div><div><strong id="mediaFormat">${escapeTikTokHtml(formatValue)}</strong><span>${escapeTikTokHtml(tr("approvePages.preview.format"))}</span></div></div><div class="sp-meta"><div class="sp-meta-icon">▤</div><div><strong id="mediaResolution">${escapeTikTokHtml(isVideo ? tr("approvePages.preview.loadingMedia") : "—")}</strong><span>${escapeTikTokHtml(tr("approvePages.preview.resolution"))}</span></div></div></div>
</section>
<aside><section class="sp-card"><div class="sp-card-head"><div><h2>${escapeTikTokHtml(tr("approvePages.preview.copyTitle"))}</h2></div><span class="sp-quote">“</span></div><div class="sp-copy">${safeContent}</div></section>
<section class="sp-card"><div class="sp-card-head"><div><h2>${escapeTikTokHtml(tr("approvePages.preview.detailsTitle"))}</h2></div></div><div class="sp-detail-row"><span class="sp-detail-label">◎ ${escapeTikTokHtml(tr("approvePages.preview.selectedChannels"))}</span><span class="sp-detail-value">${getApprovalPlatformNames(post.platform, tr).map(([,label])=>escapeTikTokHtml(label)).join(" · ")}</span></div>${tiktokNote ? `<div style="margin-top:12px">${tiktokNote}</div>` : ""}<div class="sp-detail-row"><span class="sp-detail-label">◷ ${escapeTikTokHtml(tr("approvePages.preview.releaseTiming"))}</span><span class="sp-detail-value">${escapeTikTokHtml(tr("approvePages.preview.releaseTimingValue"))}</span></div></section>
<div class="sp-actions"><a class="sp-btn sp-btn-secondary" href="/api/reject-post?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale)}">${escapeTikTokHtml(tr("approvePages.preview.reject"))}</a><form method="post" action="/api/approve-post" style="margin:0"><input type="hidden" name="token" value="${escapeTikTokHtml(token)}"><input type="hidden" name="ui_locale" value="${escapeTikTokHtml(locale)}"><input type="hidden" name="general_approval" value="1"><button class="sp-btn sp-btn-primary" style="width:100%" type="submit">✓ ${escapeTikTokHtml(tr("approvePages.preview.approveV2"))}</button></form></div>
</aside></div></div>
</section></main>
<script>
const slides=[...document.querySelectorAll('.sp-carousel-slide')];let slideIndex=0;const generalCounter=document.getElementById('generalCounter');function showGeneralSlide(next){if(!slides.length)return;slideIndex=(next+slides.length)%slides.length;slides.forEach((el,i)=>el.classList.toggle('active',i===slideIndex));if(generalCounter)generalCounter.textContent=(slideIndex+1)+' / '+slides.length;}document.getElementById('generalPrev')?.addEventListener('click',()=>showGeneralSlide(slideIndex-1));document.getElementById('generalNext')?.addEventListener('click',()=>showGeneralSlide(slideIndex+1));
const approvalVideo=document.getElementById('approvalVideo');if(approvalVideo){approvalVideo.addEventListener('loadedmetadata',()=>{const duration=document.getElementById('mediaDuration');const format=document.getElementById('mediaFormat');const resolution=document.getElementById('mediaResolution');if(duration&&Number.isFinite(approvalVideo.duration)){const seconds=Math.max(0,Math.round(approvalVideo.duration));duration.textContent='00:'+String(seconds).padStart(2,'0');}if(resolution&&approvalVideo.videoWidth&&approvalVideo.videoHeight){resolution.textContent=approvalVideo.videoWidth+'×'+approvalVideo.videoHeight;}if(format&&approvalVideo.videoWidth&&approvalVideo.videoHeight){const gcd=(a,b)=>b?gcd(b,a%b):a;const d=gcd(approvalVideo.videoWidth,approvalVideo.videoHeight);const rw=Math.round(approvalVideo.videoWidth/d);const rh=Math.round(approvalVideo.videoHeight/d);format.textContent=(rw<=30&&rh<=30)?(rw+':'+rh):${JSON.stringify(tr("approvePages.preview.videoFormat"))};}});}
</script>
</body></html>`;
}

function createTikTokApprovalHtml({
  post,
  token,
  creatorInfo,
  carouselSlides = [],
  locale = "en",
  publicPostingReady,
  allowPrivateTesting,
  t,
}) {
  const tr = typeof t === "function" ? t : (key) => key;
  const isVideo = Boolean(post.video_url) || String(post.content_format || "") === "animated_video";
  const isCarousel = String(post.content_format || "") === "carousel";
  const mediaOverrides = post?.platform_publish_settings?.tiktok?.media_overrides || {};
  const singlePreviewUrl = isVideo ? post.video_url : (mediaOverrides.image_url || post.image_url);
  const slides = isCarousel
    ? (carouselSlides || []).map((slide) => {
        const metadata = getTikTokApprovalSlideMetadata(slide);
        return {
          imageUrl: metadata.tiktok_image_url || slide?.image_url || "",
          order: Number(slide?.slide_order || 0),
        };
      }).filter((slide) => slide.imageUrl).sort((a,b) => a.order-b.order)
    : [];

  const privacyOptions = Array.isArray(creatorInfo?.privacy_level_options) ? creatorInfo.privacy_level_options : [];
  const labels = {
    PUBLIC_TO_EVERYONE: tr("approvePages.tiktok.visibilityEveryone"),
    MUTUAL_FOLLOW_FRIENDS: tr("approvePages.tiktok.visibilityFriends"),
    FOLLOWER_OF_CREATOR: tr("approvePages.tiktok.visibilityFollowers"),
    SELF_ONLY: tr("approvePages.tiktok.visibilityOnlyMe"),
  };
  const options = privacyOptions.map((value) => `<option value="${escapeTikTokHtml(value)}">${escapeTikTokHtml(labels[value] || value)}</option>`).join("");

  const modeNotice = publicPostingReady
    ? `<div class="sp-mode ok"><div class="sp-note-icon">✓</div><div><strong>${escapeTikTokHtml(tr("approvePages.tiktok.publicTitle"))}</strong><span>${escapeTikTokHtml(tr("approvePages.tiktok.publicHelp"))}</span></div></div>`
    : allowPrivateTesting
      ? `<div class="sp-mode warn"><div class="sp-note-icon">i</div><div><strong>${escapeTikTokHtml(tr("approvePages.tiktok.testTitle"))}</strong><span>${escapeTikTokHtml(tr("approvePages.tiktok.testHelp"))}</span></div></div>`
      : `<div class="sp-mode warn"><div class="sp-note-icon">!</div><div><strong>${escapeTikTokHtml(tr("approvePages.tiktok.notReadyTitle"))}</strong><span>${escapeTikTokHtml(tr("approvePages.tiktok.notReadyHelp"))}</span></div></div>`;

  const canSubmit = publicPostingReady || allowPrivateTesting;
  const media = isCarousel && slides.length
    ? `<div class="sp-media-wrap"><div class="sp-carousel-stage">${slides.map((slide,index)=>`<img class="sp-carousel-slide${index===0?" active":""}" data-slide="${index}" src="${escapeTikTokHtml(slide.imageUrl)}" alt="${escapeTikTokHtml(tr("approvePages.tiktok.previewTitle"))}">`).join("")}</div></div><div class="sp-carousel-nav"><button type="button" class="sp-nav-btn" id="carouselPrev" aria-label="${escapeTikTokHtml(tr("approvePages.tiktok.previous"))}">←</button><span id="carouselCounter">${escapeTikTokHtml(tr("approvePages.tiktok.slideCounter", { index: 1, count: slides.length }))}</span><button type="button" class="sp-nav-btn" id="carouselNext" aria-label="${escapeTikTokHtml(tr("approvePages.tiktok.next"))}">→</button></div>`
    : singlePreviewUrl
      ? (isVideo
        ? `<div class="sp-media-wrap"><video class="sp-media" src="${escapeTikTokHtml(singlePreviewUrl)}" controls playsinline></video></div>`
        : `<div class="sp-media-wrap"><img class="sp-media is-image" src="${escapeTikTokHtml(singlePreviewUrl)}" alt="${escapeTikTokHtml(tr("approvePages.tiktok.previewTitle"))}"></div>`)
      : `<div class="sp-empty">${escapeTikTokHtml(tr("approvePages.tiktok.previewUnavailable"))}</div>`;
  const titleMax = isVideo ? 2200 : 4000;
  const logoUrl = `${APP_URL.replace(/\/$/, "")}/brand/spreelologo.png`;
  const accountUsername = String(creatorInfo?.creator_username || "").replace(/^@/, "");

  return `<!doctype html>
<html lang="${escapeTikTokHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeTikTokHtml(tr("approvePages.tiktok.pageTitle"))}</title>
<style>${getApprovalExperienceCss()}
.sp-tiktok-grid{grid-template-columns:minmax(0,1.08fr) minmax(390px,.92fr)}.sp-settings-card{max-height:none}.sp-account-row{display:flex;justify-content:flex-end;margin-top:11px}.sp-tiktok-submit{width:100%;margin-top:16px}.sp-tiktok-preview-note{margin-top:12px;color:var(--sp-muted);font-size:11px;text-align:center}@media(max-width:980px){.sp-tiktok-grid{grid-template-columns:1fr}.sp-account-row{justify-content:flex-start}}</style>
</head>
<body>
<main class="sp-page"><section class="sp-shell">
<header class="sp-topbar"><img class="sp-logo" src="${escapeTikTokHtml(logoUrl)}" alt="Spreelo"><span class="sp-status"><span class="sp-status-icon">✓</span>${escapeTikTokHtml(tr("approvePages.experience.readyToPublish"))}</span></header>
<section class="sp-hero"><div><p class="sp-kicker">${escapeTikTokHtml(tr("approvePages.tiktok.eyebrow"))}</p><h1 class="sp-title">${escapeTikTokHtml(tr("approvePages.tiktok.title"))}</h1><p class="sp-subtitle">${escapeTikTokHtml(tr("approvePages.tiktok.subtitleV2"))}</p><p class="sp-intro">${escapeTikTokHtml(tr("approvePages.tiktok.intro"))}</p><div class="sp-account-row"><div class="sp-account">${creatorInfo?.creator_avatar_url ? `<img src="${escapeTikTokHtml(creatorInfo.creator_avatar_url)}" alt="">` : ""}<div><span>${escapeTikTokHtml(tr("approvePages.tiktok.connectedAccount"))}</span><strong>${escapeTikTokHtml(creatorInfo?.creator_nickname || "TikTok")}</strong>${accountUsername ? `<span>@${escapeTikTokHtml(accountUsername)}</span>` : ""}</div></div></div></div>${getApprovalStepperHtml({ t: tr, activeStep: 2 })}</section>
<div class="sp-content">${modeNotice}<div class="sp-grid sp-tiktok-grid">
<section class="sp-card"><div class="sp-card-head"><div><h2>${escapeTikTokHtml(tr("approvePages.tiktok.previewTitle"))}</h2><p class="sp-help">${escapeTikTokHtml(tr("approvePages.tiktok.previewHelp"))}</p></div>${getApprovalPlatformChipsHtml("TikTok", tr)}</div>${media}<p class="sp-tiktok-preview-note">${escapeTikTokHtml(tr("approvePages.tiktok.translationReady"))}</p></section>
<section class="sp-card sp-settings-card"><div class="sp-card-head"><div><h2>${escapeTikTokHtml(tr("approvePages.tiktok.settingsTitle"))}</h2><p class="sp-help">${escapeTikTokHtml(tr("approvePages.tiktok.settingsHelp"))}</p></div></div>
<form method="post" action="/api/approve-post"><input type="hidden" name="token" value="${escapeTikTokHtml(token)}"><input type="hidden" name="ui_locale" value="${escapeTikTokHtml(locale)}"><input type="hidden" name="tiktok" value="1">
<div class="sp-field"><label for="title">${escapeTikTokHtml(tr("approvePages.tiktok.caption"))}</label><textarea class="sp-input" id="title" name="title" maxlength="${titleMax}">${escapeTikTokHtml(post.content || "")}</textarea><small>${escapeTikTokHtml(tr("approvePages.tiktok.captionHelp"))}</small></div>
<div class="sp-section"><div class="sp-field"><label for="privacy">${escapeTikTokHtml(tr("approvePages.tiktok.visibility"))}</label><select class="sp-select" id="privacy" name="privacy_level" required><option value="">${escapeTikTokHtml(tr("approvePages.tiktok.visibilityPlaceholder"))}</option>${options}</select><small>${escapeTikTokHtml(tr("approvePages.tiktok.visibilityHelp"))}</small></div></div>
<div class="sp-section"><span class="sp-section-label">${escapeTikTokHtml(tr("approvePages.tiktok.interactions"))}</span><div class="sp-checks"><label class="sp-check ${creatorInfo?.comment_disabled ? "disabled" : ""}"><input type="checkbox" name="allow_comment" value="1" ${creatorInfo?.comment_disabled ? "disabled" : ""}><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.allowComments"))}</strong><small>${escapeTikTokHtml(tr(creatorInfo?.comment_disabled ? "approvePages.tiktok.disabledByAccount" : "approvePages.tiktok.offUntilChosen"))}</small></span></label>${isVideo ? `<label class="sp-check ${creatorInfo?.duet_disabled ? "disabled" : ""}"><input type="checkbox" name="allow_duet" value="1" ${creatorInfo?.duet_disabled ? "disabled" : ""}><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.allowDuet"))}</strong><small>${escapeTikTokHtml(tr(creatorInfo?.duet_disabled ? "approvePages.tiktok.disabledByAccount" : "approvePages.tiktok.offUntilChosen"))}</small></span></label><label class="sp-check ${creatorInfo?.stitch_disabled ? "disabled" : ""}"><input type="checkbox" name="allow_stitch" value="1" ${creatorInfo?.stitch_disabled ? "disabled" : ""}><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.allowStitch"))}</strong><small>${escapeTikTokHtml(tr(creatorInfo?.stitch_disabled ? "approvePages.tiktok.disabledByAccount" : "approvePages.tiktok.offUntilChosen"))}</small></span></label>` : ""}</div></div>
<div id="commercialBox" class="sp-section sp-commercial"><span class="sp-section-label">${escapeTikTokHtml(tr("approvePages.tiktok.commercialTitle"))}</span><label class="sp-check"><input id="commercialToggle" type="checkbox" name="commercial_content" value="1"><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.commercialToggle"))}</strong><small>${escapeTikTokHtml(tr("approvePages.tiktok.commercialHelp"))}</small></span></label><div class="sp-commercial-options"><label class="sp-check"><input type="checkbox" name="brand_organic" value="1"><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.yourBrand"))}</strong><small>${escapeTikTokHtml(tr("approvePages.tiktok.yourBrandHelp"))}</small></span></label><label class="sp-check"><input type="checkbox" name="brand_content" value="1"><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.brandedContent"))}</strong><small>${escapeTikTokHtml(tr("approvePages.tiktok.brandedContentHelp"))}</small></span></label></div></div>
<div class="sp-consent"><span class="sp-section-label">${escapeTikTokHtml(tr("approvePages.tiktok.consentTitle"))}</span><label class="sp-check"><input type="checkbox" name="tiktok_consent" value="1" required><span><strong>${escapeTikTokHtml(tr("approvePages.tiktok.consent"))}</strong><small>${escapeTikTokHtml(tr("approvePages.tiktok.consentHelp"))}</small></span></label></div>
<button class="sp-btn sp-btn-primary sp-tiktok-submit" type="submit" ${canSubmit ? "" : "disabled"}>✓ ${escapeTikTokHtml(tr("approvePages.tiktok.submitV2"))}</button></form>
<div class="sp-next"><strong>${escapeTikTokHtml(tr("approvePages.tiktok.nextTitle"))}</strong><br>${escapeTikTokHtml(tr("approvePages.tiktok.nextHelp"))}</div><p class="sp-foot">${escapeTikTokHtml(tr("approvePages.tiktok.foot"))}</p>
</section></div></div>
</section></main>
<script>
const commercialToggle=document.getElementById('commercialToggle');const commercialBox=document.getElementById('commercialBox');commercialToggle?.addEventListener('change',()=>commercialBox.classList.toggle('is-on',commercialToggle.checked));
const slides=[...document.querySelectorAll('.sp-carousel-slide')];const counter=document.getElementById('carouselCounter');let slideIndex=0;const counterTemplate=${JSON.stringify(tr("approvePages.tiktok.slideCounter", { index: "__INDEX__", count: "__COUNT__" }))};function showSlide(next){if(!slides.length)return;slideIndex=(next+slides.length)%slides.length;slides.forEach((el,i)=>el.classList.toggle('active',i===slideIndex));if(counter)counter.textContent=counterTemplate.replace('__INDEX__',String(slideIndex+1)).replace('__COUNT__',String(slides.length));}document.getElementById('carouselPrev')?.addEventListener('click',()=>showSlide(slideIndex-1));document.getElementById('carouselNext')?.addEventListener('click',()=>showSlide(slideIndex+1));
</script>
</body></html>`;
}

function htmlResponse({ title, message, status = "success", httpStatus = 200, t, locale }) {
  return new Response(
    createHtmlPage({
      title,
      message,
      status,
      t,
      locale,
    }),
    {
      status: httpStatus,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

export async function GET(request) {
  const requestLocale = resolveBestServerLocale({ request });
  let translator = createFallbackTranslator();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      translator = await getApproveTranslations({ locale: requestLocale });
      return htmlResponse({
        title: translator.t("approvePages.configurationError.title"),
        message: translator.t("approvePages.configurationError.message"),
        status: "error",
        httpStatus: 500,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const previewRequested = url.searchParams.get("preview") === "1";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!token) {
      translator = await getApproveTranslations({ supabase, locale: requestLocale });
      return htmlResponse({
        title: translator.t("approvePages.invalidLink.title"),
        message: translator.t("approvePages.invalidLink.message"),
        status: "error",
        httpStatus: 400,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, user_id, status, approval_token, language, brand_profile_id, automation_rule_id, content_format, platform, tone, post_type, content, image_url, video_url, platform_publish_settings, approved_at, published_at")
      .eq("approval_token", token)
      .single();

    let brandProfile = null;
    if (post?.brand_profile_id) {
      const { data: loadedBrandProfile } = await supabase
        .from("brand_profiles")
        .select("id, content_language")
        .eq("id", post.brand_profile_id)
        .maybeSingle();
      brandProfile = loadedBrandProfile || null;
    }

    const userAppLanguage = await getUserAppLanguage(supabase, post?.user_id);
    const postLocale = resolveApprovalPageLocale({ request, url, post, brandProfile, userAppLanguage });
    translator = await getApproveTranslations({ supabase, locale: postLocale });

    if (postError || !post) {
      return htmlResponse({
        title: translator.t("approvePages.notFound.title"),
        message: translator.t("approvePages.notFound.message"),
        status: "error",
        httpStatus: 404,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const tikTokTarget = isTikTokTarget(post.platform);
    const tikTokApprovalMissing = tikTokTarget && !hasTikTokExplicitApproval(post);
    console.log("Approval link opened", {
      postId: post.id,
      status: post.status,
      platform: post.platform || null,
      previewRequested,
      tikTokTarget,
      tikTokApprovalMissing,
    });

    if (post.status === "published" || post.status === "rejected") {
      return htmlResponse({
        title: translator.t("approvePages.cannotApprove.title"),
        message: translator.t("approvePages.cannotApprove.message", { status: post.status }),
        status: "error",
        httpStatus: 409,
        t: translator.t,
        locale: translator.locale,
      });
    }

    // The play button is a preview-only path. It must never approve on open.
    if (previewRequested && post.status === "pending_approval") {
      const carouselSlides = String(post.content_format || "") === "carousel"
        ? await loadApprovalCarouselSlides({ supabase, postId: post.id })
        : [];
      return new Response(
        createGeneralApprovalPreviewHtml({
          post,
          token,
          carouselSlides,
          locale: translator.locale,
          t: translator.t,
        }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // If general approval already happened but TikTok still needs its mandatory
    // choices, opening either approval path resumes exactly at the TikTok step.
    if (post.status === "approved" && tikTokApprovalMissing) {
      try {
        return await renderTikTokApprovalResponse({ supabase, post, token, translator });
      } catch (tiktokError) {
        return htmlResponse({
          title: translator.t("approvePages.tiktok.connectionTitle"),
          message: translator.t(tiktokError?.requiresReconnect ? "approvePages.tiktok.reconnectMessage" : "approvePages.tiktok.connectionMessage"),
          status: "error",
          httpStatus: tiktokError?.requiresReconnect ? 409 : 502,
          t: translator.t,
          locale: translator.locale,
        });
      }
    }

    if (post.status === "approved") {
      return htmlResponse({
        title: translator.t("approvePages.alreadyApproved.title"),
        message: translator.t("approvePages.alreadyApproved.message"),
        status: "success",
        httpStatus: 200,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const repairableStatus = ["pending_approval", "failed"].includes(post.status);
    if (!repairableStatus) {
      return htmlResponse({
        title: translator.t("approvePages.cannotApprove.title"),
        message: translator.t("approvePages.cannotApprove.message", { status: post.status }),
        status: "error",
        httpStatus: 409,
        t: translator.t,
        locale: translator.locale,
      });
    }

    // Direct email approval: release all ordinary destinations immediately.
    // TikTok remains a separate second consent step and must not gate the others.
    const approvedAt = await markGeneralPostApproved({ supabase, post });
    const approvedPost = { ...post, status: "approved", approved_at: approvedAt };

    if (tikTokTarget && !hasTikTokExplicitApproval(approvedPost)) {
      try {
        return await renderTikTokApprovalResponse({ supabase, post: approvedPost, token, translator });
      } catch (tiktokError) {
        return htmlResponse({
          title: translator.t("approvePages.tiktok.connectionTitle"),
          message: translator.t(tiktokError?.requiresReconnect ? "approvePages.tiktok.reconnectMessage" : "approvePages.tiktok.connectionMessage"),
          status: "error",
          httpStatus: tiktokError?.requiresReconnect ? 409 : 502,
          t: translator.t,
          locale: translator.locale,
        });
      }
    }

    const isCarouselPost = post.content_format === "carousel";
    return htmlResponse({
      title: translator.t(isCarouselPost ? "approvePages.carouselApprovedV2.title" : "approvePages.approved.title"),
      message: translator.t(isCarouselPost ? "approvePages.carouselApprovedV2.message" : "approvePages.approved.message"),
      status: "success",
      httpStatus: 200,
      t: translator.t,
      locale: translator.locale,
    });
  } catch (error) {
    return htmlResponse({
      title: translator.t("approvePages.unexpected.title"),
      message: translator.t("approvePages.unexpected.message"),
      status: "error",
      httpStatus: 500,
      t: translator.t,
      locale: translator.locale,
    });
  }
}

export async function POST(request) {
  let translator = createFallbackTranslator();
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) throw new Error("approval_configuration_incomplete");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const form = await request.formData();
    const token = String(form.get("token") || "").trim();
    if (!token) throw new Error("approval_token_missing");

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, user_id, brand_profile_id, automation_rule_id, status, approval_token, language, content_format, platform, tone, post_type, content, image_url, video_url, platform_publish_settings, approved_at, published_at")
      .eq("approval_token", token)
      .single();
    if (postError || !post) throw new Error("approval_link_invalid");

    const requestedUiLocale = resolveUiLocaleFromLanguageName(form.get("ui_locale"));
    const userAppLanguage = await getUserAppLanguage(supabase, post.user_id);
    const postUiLocale =
      requestedUiLocale ||
      resolveUiLocaleFromLanguageName(userAppLanguage) ||
      resolveUiLocaleFromLanguageName(post.language) ||
      "en";
    translator = await getApproveTranslations({ supabase, locale: postUiLocale });

    if (form.get("general_approval") === "1") {
      if (["published", "rejected"].includes(post.status)) {
        throw new Error(`approval_status_blocked:${post.status}`);
      }
      if (!["pending_approval", "approved", "failed"].includes(post.status)) {
        throw new Error(`approval_status_blocked:${post.status}`);
      }

      if (post.status !== "approved") {
        const approvedAt = await markGeneralPostApproved({ supabase, post });
        post.status = "approved";
        post.approved_at = approvedAt;
      }

      if (isTikTokTarget(post.platform) && !hasTikTokExplicitApproval(post)) {
        return await renderTikTokApprovalResponse({ supabase, post, token, translator });
      }

      const isCarouselPost = post.content_format === "carousel";
      return htmlResponse({
        title: translator.t(isCarouselPost ? "approvePages.carouselApprovedV2.title" : "approvePages.approved.title"),
        message: translator.t(isCarouselPost ? "approvePages.carouselApprovedV2.message" : "approvePages.approved.message"),
        status: "success",
        t: translator.t,
        locale: translator.locale,
      });
    }

    if (!isTikTokTarget(post.platform)) throw new Error("approval_tiktok_only");
    const alreadyHasTikTokApproval = hasTikTokExplicitApproval(post);
    console.log("TikTok approval submitted", {
      postId: post.id,
      previousStatus: post.status,
      alreadyHasTikTokApproval,
    });

    if (post.status === "approved" && alreadyHasTikTokApproval) {
      return htmlResponse({
        title: translator.t("approvePages.alreadyApproved.title"),
        message: translator.t("approvePages.alreadyApproved.message"),
        status: "success",
        t: translator.t,
        locale: translator.locale,
      });
    }

    const repairableTikTokApproval = !alreadyHasTikTokApproval && ["approved", "failed"].includes(post.status);
    if (post.status !== "pending_approval" && !repairableTikTokApproval) {
      throw new Error(`approval_status_blocked:${post.status}`);
    }

    // Legacy/recovery protection: TikTok consent is step two. If an old post
    // reaches this form while still pending, record the general approval first.
    if (post.status === "pending_approval") {
      const approvedAt = await markGeneralPostApproved({ supabase, post });
      post.status = "approved";
      post.approved_at = approvedAt;
    }

    const { creatorInfo } = await getTikTokApprovalContext({ supabase, post });
    const privacyLevel = String(form.get("privacy_level") || "").trim();
    const availablePrivacy = Array.isArray(creatorInfo?.privacy_level_options) ? creatorInfo.privacy_level_options : [];
    if (!privacyLevel || !availablePrivacy.includes(privacyLevel)) {
      throw new Error("approval_visibility_invalid");
    }

    const { publicPostingReady, allowPrivateTesting } = getTikTokEnv();
    // TikTok public publishing is not enabled until the Content Posting API audit is complete.
    if (!publicPostingReady) {
      if (!allowPrivateTesting) throw new Error("approval_tiktok_public_not_ready");
      if (privacyLevel !== "SELF_ONLY") throw new Error("approval_tiktok_private_only");
    }

    const isVideo = Boolean(post.video_url) || String(post.content_format || "") === "animated_video";
    const allowComment = form.get("allow_comment") === "1" && !creatorInfo?.comment_disabled;
    const allowDuet = isVideo && form.get("allow_duet") === "1" && !creatorInfo?.duet_disabled;
    const allowStitch = isVideo && form.get("allow_stitch") === "1" && !creatorInfo?.stitch_disabled;
    const commercialContent = form.get("commercial_content") === "1";
    const brandOrganic = commercialContent && form.get("brand_organic") === "1";
    const brandContent = commercialContent && form.get("brand_content") === "1";
    if (commercialContent && !brandOrganic && !brandContent) throw new Error("approval_commercial_choice");
    if (brandContent && privacyLevel === "SELF_ONLY") throw new Error("approval_branded_private");
    if (form.get("tiktok_consent") !== "1") throw new Error("approval_consent_missing");

    const titleLimit = isVideo ? 2200 : 4000;
    let title = String(form.get("title") || post.content || "").slice(0, titleLimit);
    if (/[\uD800-\uDBFF]$/.test(title)) title = title.slice(0, -1);

    const currentSettings = post.platform_publish_settings && typeof post.platform_publish_settings === "object"
      ? post.platform_publish_settings
      : {};
    const approvedAt = post.approved_at || new Date().toISOString();
    const platformPublishSettings = {
      ...currentSettings,
      tiktok: {
        ...((currentSettings?.tiktok && typeof currentSettings.tiktok === "object") ? currentSettings.tiktok : {}),
        title,
        privacy_level: privacyLevel,
        disable_comment: !allowComment,
        disable_duet: isVideo ? !allowDuet : undefined,
        disable_stitch: isVideo ? !allowStitch : undefined,
        brand_content_toggle: Boolean(brandContent),
        brand_organic_toggle: Boolean(brandOrganic),
        is_aigc: isVideo ? true : undefined,
        video_cover_timestamp_ms: isVideo ? 1000 : undefined,
        creator_nickname: creatorInfo?.creator_nickname || null,
        creator_username: creatorInfo?.creator_username || null,
        approved_at: new Date().toISOString(),
        explicit_consent: true,
      },
    };

    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "approved",
        approved_at: approvedAt,
        platform_publish_settings: platformPublishSettings,
        publish_locked_until: null,
        next_publish_attempt_at: null,
        last_publish_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);
    if (updateError) throw updateError;

    await supabase
      .from("admin_review_cases")
      .update({ status: "customer_approved", needs_review: false, updated_at: new Date().toISOString() })
      .eq("post_id", post.id);

    return htmlResponse({
      title: translator.t("approvePages.tiktok.approvedTitle"),
      message: translator.t("approvePages.tiktok.approvedMessage"),
      status: "success",
      t: translator.t,
      locale: translator.locale,
    });
  } catch (error) {
    const rawCode = String(error?.message || "");
    const statusMatch = rawCode.match(/^approval_status_blocked:(.+)$/);
    const validationKey =
      rawCode === "approval_configuration_incomplete" ? "approvePages.validation.configurationIncomplete" :
      rawCode === "approval_token_missing" ? "approvePages.validation.tokenMissing" :
      rawCode === "approval_link_invalid" ? "approvePages.validation.linkInvalid" :
      rawCode === "approval_tiktok_only" ? "approvePages.validation.tiktokOnly" :
      rawCode === "approval_visibility_invalid" ? "approvePages.validation.visibility" :
      rawCode === "approval_tiktok_public_not_ready" ? "approvePages.validation.tiktokPublicNotReady" :
      rawCode === "approval_tiktok_private_only" ? "approvePages.validation.tiktokPrivateOnly" :
      rawCode === "approval_commercial_choice" ? "approvePages.validation.commercialChoice" :
      rawCode === "approval_branded_private" ? "approvePages.validation.brandedPrivate" :
      rawCode === "approval_consent_missing" ? "approvePages.validation.consent" :
      null;
    console.error("Approval submission failed", { code: rawCode, message: error?.message || null });
    return htmlResponse({
      title: translator.t("approvePages.tiktok.failedTitle"),
      message: statusMatch
        ? translator.t("approvePages.validation.statusBlocked", { status: statusMatch[1] })
        : validationKey
          ? translator.t(validationKey)
          : translator.t("approvePages.tiktok.failedMessage"),
      status: "error",
      httpStatus: 400,
      t: translator.t,
      locale: translator.locale,
    });
  }
}
