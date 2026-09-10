"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import StripeBillingPanel from "../../components/StripeBillingPanel";
import SettingsPanels from "../../components/SettingsPanels";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";
import {
  Bell,
  ChevronRight,
  CreditCard,
  Languages,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  SUPPORTED_UI_LOCALES,
  getUiLanguageName,
} from "../../lib/i18n/defaultLabels";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function getLocaleBase(locale) {
  return String(locale || "en").toLowerCase().split("-")[0];
}

const PUBLISHING_TIME_ZONE_FALLBACKS = [
  "UTC",
  "Europe/Stockholm", "Europe/Copenhagen", "Europe/Oslo", "Europe/Helsinki", "Europe/London", "Europe/Dublin",
  "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels",
  "Europe/Warsaw", "Europe/Vienna", "Europe/Zurich", "Europe/Prague", "Europe/Athens", "Europe/Istanbul",
  "America/New_York", "America/Toronto", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Vancouver",
  "America/Mexico_City", "America/Sao_Paulo", "America/Bogota", "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires",
  "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Bangkok", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Jakarta",
  "Asia/Manila", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  "Australia/Perth", "Australia/Adelaide", "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne",
  "Pacific/Auckland", "Pacific/Honolulu",
];

function getPublishingTimeZones() {
  let supported = [];
  try {
    supported = typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  } catch {
    supported = [];
  }

  return Array.from(new Set(["UTC", ...PUBLISHING_TIME_ZONE_FALLBACKS, ...supported]))
    .filter(Boolean)
    .sort((a, b) => {
      if (a === "UTC") return -1;
      if (b === "UTC") return 1;
      return a.localeCompare(b);
    });
}

const PUBLISHING_TIME_ZONES = getPublishingTimeZones();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function Settings() {
  const { t, locale, setLocale } = useUiText(["settings", "layout"]);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("account");
  const [profileName, setProfileName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState({
    review_app: true, review_email: true,
    comments_app: true, comments_email: false,
    published_app: true, published_email: true,
    failed_app: true, failed_email: true,
    campaign_start_app: true, campaign_start_email: true,
    campaign_end_app: true, campaign_end_email: true,
    credits_app: true, credits_email: true,
    account_app: true, account_email: false,
    paused: false,
  });
  const [creditBalance, setCreditBalance] = useState(null);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [publishingTimeZone, setPublishingTimeZone] = useState("Europe/Stockholm");
  const [publishingTimeZoneDraft, setPublishingTimeZoneDraft] = useState("Europe/Stockholm");
  const [savingTimeZone, setSavingTimeZone] = useState(false);
  const [currentBrandProfile, setCurrentBrandProfile] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteReasonDetails, setDeleteReasonDetails] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const recommendedLocale = SUPPORTED_UI_LOCALES.some(
    (item) => item.locale === locale
  )
    ? locale
    : "";
  const deleteConfirmWord = String(t("settings.deleteConfirmWord") || "DELETE").trim() || "DELETE";
  const deleteConfirmationLabel = t("settings.confirmation");
  const deletePlaceholder = t("settings.confirmPlaceholder", { word: deleteConfirmWord });
  const deleteButtonLabel = t("settings.deleteButton");
  const deletingAccountLabel = t("settings.deletingAccount");
  const deleteReasonOptions = [
    ["not_using", t("settings.deleteReasonNotUsing")],
    ["too_expensive", t("settings.deleteReasonTooExpensive")],
    ["missing_feature", t("settings.deleteReasonMissingFeature")],
    ["hard_to_use", t("settings.deleteReasonHardToUse")],
    ["results_not_good_enough", t("settings.deleteReasonResults")],
    ["privacy_data", t("settings.deleteReasonPrivacy")],
    ["other", t("settings.deleteReasonOther")],
  ];

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUser(user || null);
      setCurrentUserEmail(user?.email || "");
      setProfileName(user?.user_metadata?.full_name || user?.user_metadata?.name || "");
      const loadedTimeZone = user?.user_metadata?.publishing_timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Europe/Stockholm";
      setPublishingTimeZone(loadedTimeZone);
      setPublishingTimeZoneDraft(loadedTimeZone);
      setNotificationPreferences({
        review_app: user?.user_metadata?.notification_preferences?.review_app !== false,
        review_email: user?.user_metadata?.notification_preferences?.review_email !== false,
        comments_app: user?.user_metadata?.notification_preferences?.comments_app !== false,
        comments_email: user?.user_metadata?.notification_preferences?.comments_email === true,
        published_app: user?.user_metadata?.notification_preferences?.published_app !== false,
        published_email: user?.user_metadata?.notification_preferences?.published_email !== false,
        failed_app: user?.user_metadata?.notification_preferences?.failed_app !== false,
        failed_email: user?.user_metadata?.notification_preferences?.failed_email !== false,
        campaign_start_app: user?.user_metadata?.notification_preferences?.campaign_start_app !== false,
        campaign_start_email: user?.user_metadata?.notification_preferences?.campaign_start_email !== false,
        campaign_end_app: user?.user_metadata?.notification_preferences?.campaign_end_app !== false,
        campaign_end_email: user?.user_metadata?.notification_preferences?.campaign_end_email !== false,
        credits_app: user?.user_metadata?.notification_preferences?.credits_app !== false,
        credits_email: user?.user_metadata?.notification_preferences?.credits_email !== false,
        account_app: user?.user_metadata?.notification_preferences?.account_app !== false,
        account_email: user?.user_metadata?.notification_preferences?.account_email === true,
        paused: user?.user_metadata?.notification_preferences?.paused === true,
      });

      if (user?.id) {
        setLoadingCredits(true);
        const selectedBrandId = typeof window !== "undefined"
          ? localStorage.getItem(getBrandStorageKey(user.id))
          : "";
        const { data: brandRows } = await supabase
          .from("brand_profiles")
          .select("id, business_name, website_url, is_default, created_at")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true });
        const brands = brandRows || [];
        const brandData = brands.find((brand) => brand.id === selectedBrandId) || brands[0] || null;
        setCurrentBrandProfile(brandData);
        const { data: creditData } = await supabase
          .from("user_credit_balances")
          .select("credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, current_period_end, credits_renewed_at, next_credit_refresh_at, cancel_at_period_end, payment_provider, provider_customer_id, provider_subscription_id, subscription_price_amount, subscription_currency, subscription_interval, subscription_price_lookup_key, purchased_credits_remaining, trial_start, trial_end, pending_subscription_plan, pending_subscription_lookup_key, pending_subscription_effective_at, provider_subscription_schedule_id")
          .eq("user_id", user.id)
          .maybeSingle();
        setCreditBalance(creditData || null);
        setLoadingCredits(false);
      } else {
        setLoadingCredits(false);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (["account", "security", "notifications", "language", "billing"].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, []);

  useEffect(() => {
    function syncAvatar(event) {
      if (event?.detail?.user) setCurrentUser(event.detail.user);
    }
    window.addEventListener("spreelo-avatar-updated", syncAvatar);
    return () => window.removeEventListener("spreelo-avatar-updated", syncAvatar);
  }, []);

  const planName = useMemo(() => {
    const raw = String(creditBalance?.plan_name || creditBalance?.subscription_plan || "Free").trim();
    return raw.replace(/^plan\s*:\s*/i, "") || "Free";
  }, [creditBalance]);

  const creditRemaining = Number(creditBalance?.credits_remaining || 0);
  const creditLimit = Number(creditBalance?.monthly_credit_limit || 0);
  const creditPercent = creditLimit > 0 ? Math.max(0, Math.min(100, (creditRemaining / creditLimit) * 100)) : 0;

  const renewalLabel = useMemo(() => {
    const value = creditBalance?.current_period_end || creditBalance?.credits_renewed_at;
    if (!value) return t("settings.renewalUnknown");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("settings.renewalUnknown");
    try {
      return new Intl.DateTimeFormat(locale || "en", { day: "numeric", month: "short", year: "numeric" }).format(date);
    } catch {
      return date.toLocaleDateString(locale || "en");
    }
  }, [creditBalance, locale, t]);

  const settingsTabTitle = {
    account: t("settings.accountPageTitle"),
    security: t("settings.securityPageTitle"),
    notifications: t("settings.notificationsPageTitle"),
    language: t("settings.languagePageTitle"),
    billing: t("settings.billingPageTitle"),
  }[activeTab];

  async function handleLanguageChange(nextLocale) {
    if (!nextLocale || savingLanguage) return;

    setSavingLanguage(true);
    setLocale(nextLocale);

    try {
      await supabase.auth.updateUser({
        data: {
          app_locale: nextLocale,
          app_language: nextLocale,
        },
      });
    } catch {
      // The local UI language has already changed. Server-side email language will
      // fall back to brand/content language if user metadata cannot be updated.
    } finally {
      setSavingLanguage(false);
    }
  }

  async function handleTimeZoneChange(nextTimeZone) {
    if (!nextTimeZone || savingTimeZone || !currentUser?.id) return;

    setSavingTimeZone(true);
    setProfileMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("settings.signInAgain"));

      const response = await fetch("/api/settings/timezone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeZone: nextTimeZone }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Timezone could not be saved.");

      setPublishingTimeZone(nextTimeZone);
      // Keep a newer selection the user may have made while this request was saving.
      setPublishingTimeZoneDraft((currentDraft) => currentDraft === nextTimeZone ? nextTimeZone : currentDraft);
      setCurrentUser((current) => current ? {
        ...current,
        user_metadata: { ...(current.user_metadata || {}), publishing_timezone: nextTimeZone },
      } : current);
      setProfileMessage(t("settings.timeZoneSavedMessage", { count: result.updatedRules || 0 }));
    } catch (error) {
      setProfileMessage(error?.message || t("settings.timeZoneSaveError"));
    } finally {
      setSavingTimeZone(false);
    }
  }

  function selectTab(tab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url);
  }

  async function saveProfile() {
    if (savingProfile) return;
    setSavingProfile(true);
    setProfileMessage("");
    const { error } = await supabase.auth.updateUser({ data: { full_name: profileName.trim() } });
    setProfileMessage(error ? error.message : t("settings.profileSaved"));
    setSavingProfile(false);
  }

  async function removeProfileImage() {
    const oldPath = String(currentUser?.user_metadata?.spreelo_avatar_path || "").trim();
    const { data, error } = await supabase.auth.updateUser({
      data: { spreelo_avatar_url: null, spreelo_avatar_path: null },
    });
    if (error) {
      setProfileMessage(error.message || t("settings.profileImageRemoveError"));
      return;
    }
    const updatedUser = data?.user || currentUser;
    setCurrentUser(updatedUser);
    window.dispatchEvent(new CustomEvent("spreelo-avatar-updated", { detail: { user: updatedUser } }));
    if (oldPath) void supabase.storage.from("user-avatars").remove([oldPath]);
    setProfileMessage(t("settings.profileImageRemoved"));
  }

  async function saveNotifications() {
    if (savingNotifications) return;
    setSavingNotifications(true);
    setNotificationMessage("");
    const { error } = await supabase.auth.updateUser({
      data: { notification_preferences: notificationPreferences },
    });
    setNotificationMessage(error ? error.message : t("settings.notificationsSaved"));
    setSavingNotifications(false);
  }

  async function signOutOtherSessions() {
    setProfileMessage("");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setProfileMessage(error ? error.message : t("settings.otherSessionsSignedOut"));
  }

  function exportAccountData() {
    const exportedAt = new Date();
    const nextRefresh = creditBalance?.next_credit_refresh_at || creditBalance?.current_period_end;
    const priceAmount = Number(creditBalance?.subscription_price_amount || 0) / 100;
    const status = String(creditBalance?.subscription_status || "").replaceAll("_", " ") || "—";
    const rows = [
      [t("settings.exportName"), profileName || "—"],
      [t("settings.emailAddress"), currentUserEmail || "—"],
      [t("settings.exportAppLanguage"), locale || "—"],
      [t("settings.exportPublishingTimeZone"), publishingTimeZone || "—"],
      [t("settings.planLabel"), planName],
      [t("settings.exportSubscriptionStatus"), status],
      [t("settings.exportAvailableCredits"), creditRemaining],
      [t("settings.exportPlanCredits"), creditLimit || "—"],
      [t("settings.exportPurchasedCredits"), Number(creditBalance?.purchased_credits_remaining || 0)],
      [t("settings.exportNextRefresh"), nextRefresh ? new Date(nextRefresh).toLocaleString(locale, { dateStyle: "long", timeStyle: "short", timeZone: publishingTimeZone }) : "—"],
      [t("settings.exportPrice"), priceAmount ? `${priceAmount.toLocaleString(locale)} ${creditBalance?.subscription_currency || "SEK"} / ${creditBalance?.subscription_interval === "year" ? t("settings.exportYear") : t("settings.exportMonth")}` : "—"],
    ];
    const rowHtml = rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
    const documentTitle = t("settings.exportTitle");
    const createdLabel = t("settings.exportCreated", { date: exportedAt.toLocaleString(locale) });
    const note = t("settings.exportNote");
    const html = `<!doctype html><html lang="${escapeHtml(getLocaleBase(locale))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${documentTitle}</title><style>body{margin:0;background:#f5f7fa;color:#102036;font:16px/1.55 Arial,sans-serif}.page{max-width:760px;margin:40px auto;padding:0 20px}.card{overflow:hidden;border:1px solid #dce3eb;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(3,23,42,.10)}header{padding:30px;background:#03172a;color:#fff}h1{margin:0 0 8px;font-size:30px}header p{margin:0;color:#cfdae5}.content{padding:12px 30px 30px}table{width:100%;border-collapse:collapse}th,td{padding:15px 0;border-bottom:1px solid #e4e8ed;text-align:left;vertical-align:top}th{width:45%;color:#5b6b81;font-size:14px}td{font-weight:700}.note{margin:24px 0 0;padding:16px;border-radius:12px;background:#fff3ee;color:#6d392d;font-size:13px}@media(max-width:600px){.page{margin:16px auto}.content,header{padding:22px}th,td{display:block;width:auto}th{padding-bottom:3px;border:0}td{padding-top:0}}</style></head><body><main class="page"><section class="card"><header><h1>${documentTitle}</h1><p>${escapeHtml(createdLabel)}</p></header><div class="content"><table>${rowHtml}</table><p class="note">${escapeHtml(note)}</p></div></section></main></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `spreelo-account-summary-${exportedAt.toISOString().slice(0, 10)}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;

    if (confirmText.trim().toLocaleLowerCase() !== deleteConfirmWord.toLocaleLowerCase()) {
      setDeleteMessage(t("settings.errorTypeDelete", { word: deleteConfirmWord }));
      return;
    }

    setDeletingAccount(true);
    setDeleteMessage(t("settings.deletingMessage"));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: deleteReason || "not_provided",
          reason_details: deleteReasonDetails || "",
          locale,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || t("settings.errorDeleteAccount"));
      }

      await supabase.auth.signOut();

      window.location.href = "/login";
    } catch (error) {
      setDeleteMessage(error.message || t("settings.errorDeleteAccount"));
      setDeletingAccount(false);
    }
  }

  return (
    <AppLayout active="settings">
      <div className="settings-reference-page">
        <header className="settings-reference-header">
          <h1>{settingsTabTitle}</h1>
          <div className="settings-reference-credits"><span /><div><small>{t("settings.availableCredits")}</small><strong>{creditRemaining} <em>{creditLimit ? `/ ${t("settings.planCreditsMonthly", { count: creditLimit })}` : ""}</em></strong></div></div>
        </header>
        <nav className="settings-reference-tabs" aria-label={t("settings.quickSettingsLabel")}>
          <button type="button" className={activeTab === "account" ? "active" : ""} onClick={() => selectTab("account")}><UserRound />{t("settings.accountTab")}</button>
          <button type="button" className={activeTab === "security" ? "active" : ""} onClick={() => selectTab("security")}><ShieldCheck />{t("settings.securityTab")}</button>
          <button type="button" className={activeTab === "notifications" ? "active" : ""} onClick={() => selectTab("notifications")}><Bell />{t("settings.notificationsTab")}</button>
          <button type="button" className={activeTab === "language" ? "active" : ""} onClick={() => selectTab("language")}><Languages />{t("settings.languageTab")}</button>
          <button type="button" className={activeTab === "billing" ? "active" : ""} onClick={() => selectTab("billing")}><CreditCard />{t("settings.billingTab")}</button>
        </nav>
        <section className="settings-v14379-overview">
          <header className="settings-v14339-hero settings-v14379-hero">
            <div>
              <p className="eyebrow">{t("settings.eyebrow")}</p>
              <h2>{t("settings.title")}</h2>
              <p>{t("settings.heroText")}</p>
            </div>
          </header>

          <nav className="settings-unified-tabs" aria-label={t("settings.quickSettingsLabel")}>
            <button type="button" className={activeTab === "account" ? "active" : ""} onClick={() => selectTab("account")}><UserRound />{t("settings.accountTitle")}</button>
            <button type="button" className={activeTab === "security" ? "active" : ""} onClick={() => selectTab("security")}><ShieldCheck />{t("settings.securityTitle")}</button>
            <button type="button" className={activeTab === "notifications" ? "active" : ""} onClick={() => selectTab("notifications")}><Bell />{t("settings.notificationsTitle")}</button>
            <button type="button" className={activeTab === "language" ? "active" : ""} onClick={() => selectTab("language")}><Languages />{t("settings.languageTitle")}</button>
            <button type="button" className={activeTab === "billing" ? "active" : ""} onClick={() => selectTab("billing")}><CreditCard />{t("settings.planSubscriptionTitle")}</button>
          </nav>
          <section className="settings-v14379-quick-grid settings-unified-legacy-cards" aria-label={t("settings.quickSettingsLabel")}>
            <article className="settings-v14379-quick-card">
              <span className="settings-v14339-icon coral"><UserRound size={20} /></span>
              <div>
                <h3>{t("settings.accountTitle")}</h3>
                <p>{t("settings.accountTextShort")}</p>
                <strong className="settings-v14379-inline-value">{currentUserEmail || t("settings.signedInUserFallback")}</strong>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </article>

            <article className="settings-v14379-quick-card settings-v14379-language-card">
              <span className="settings-v14339-icon amber"><Languages size={20} /></span>
              <div>
                <h3>{t("settings.languageTitle")}</h3>
                <p>{t("settings.languageTextShort")}</p>
                <select className="input" value={recommendedLocale} onChange={(event) => handleLanguageChange(event.target.value)} disabled={savingLanguage}>
                  {!recommendedLocale && <option value="">{getUiLanguageName(locale)}</option>}
                  {SUPPORTED_UI_LOCALES.map((item) => <option key={item.locale} value={item.locale}>{item.nativeName || item.language}</option>)}
                </select>
              </div>
            </article>

            <article className="settings-v14379-quick-card">
              <span className="settings-v14339-icon violet"><CreditCard size={20} /></span>
              <div>
                <h3>{t("settings.planSubscriptionTitle")}</h3>
                <p>{t("settings.planSubscriptionText")}</p>
                <div className="settings-v14379-plan-summary">
                  <strong>{planName}</strong>
                  <span>{creditRemaining} / {creditLimit || "—"} {t("layout.creditsLeft")}</span>
                </div>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </article>

            <article className="settings-v14379-quick-card">
              <span className="settings-v14339-icon lavender"><Bell size={20} /></span>
              <div>
                <h3>{t("settings.alertsTitle")}</h3>
                <p>{t("settings.alertsText")}</p>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </article>

            <article className="settings-v14379-quick-card">
              <span className="settings-v14339-icon blue"><ShieldCheck size={20} /></span>
              <div>
                <h3>{t("settings.securityTitle")}</h3>
                <p>{t("settings.securityText")}</p>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </article>

            <article className="settings-v14379-quick-card">
              <span className="settings-v14339-icon green"><Mail size={20} /></span>
              <div>
                <h3>{t("settings.notificationsTitle")}</h3>
                <p>{t("settings.notificationsText")}</p>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </article>
          </section>
        </section>

        <SettingsPanels
          activeTab={activeTab}
          locale={locale}
          currentUser={currentUser}
          currentUserEmail={currentUserEmail}
          profileName={profileName}
          setProfileName={setProfileName}
          profileMessage={profileMessage}
          savingProfile={savingProfile}
          saveProfile={saveProfile}
          signOutOtherSessions={signOutOtherSessions}
          exportAccountData={exportAccountData}
          notificationPreferences={notificationPreferences}
          setNotificationPreferences={setNotificationPreferences}
          notificationMessage={notificationMessage}
          savingNotifications={savingNotifications}
          saveNotifications={saveNotifications}
          recommendedLocale={recommendedLocale}
          savingLanguage={savingLanguage}
          handleLanguageChange={handleLanguageChange}
          publishingTimeZone={publishingTimeZone}
          publishingTimeZoneDraft={publishingTimeZoneDraft}
          setPublishingTimeZoneDraft={setPublishingTimeZoneDraft}
          savingTimeZone={savingTimeZone}
          handleTimeZoneChange={handleTimeZoneChange}
          publishingTimeZoneOptions={PUBLISHING_TIME_ZONES}
          planName={planName}
          currentBrandName={currentBrandProfile?.business_name || ""}
          currentBrandWebsite={currentBrandProfile?.website_url || ""}
          requestProfileImageChange={() => window.dispatchEvent(new Event("spreelo-avatar-picker-requested"))}
          requestProfileImageRemove={removeProfileImage}
          creditRemaining={creditRemaining}
          creditLimit={creditLimit}
          renewalLabel={renewalLabel}
          onDeleteAccount={() => { setDeleteMessage(""); setDeleteModalOpen(true); }}
        />

        {activeTab === "billing" && <StripeBillingPanel initialBalance={creditBalance} onBalanceChange={setCreditBalance} />}

        {activeTab === "account" && <section className="settings-danger-zone settings-danger-zone-compact settings-v14339-danger settings-v14379-danger">
          <div>
            <p className="eyebrow danger-eyebrow">{t("settings.dangerEyebrow")}</p>
            <h3>{t("settings.deleteTitle")}</h3>
            <p>{t("settings.deleteText")}</p>
          </div>
          <button type="button" className="danger-button compact" onClick={() => { setDeleteMessage(""); setDeleteModalOpen(true); }} disabled={deletingAccount}>
            {t("settings.deleteOpenDialog")}
          </button>
        </section>}

      {deleteModalOpen && (
        <div className="settings-modal-backdrop" role="presentation">
          <div
            className="settings-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-modal-title"
          >
            <button
              type="button"
              className="settings-modal-close"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deletingAccount}
              aria-label={t("settings.cancel")}
            >
              ×
            </button>

            <p className="eyebrow danger-eyebrow">
              {t("settings.dangerEyebrow")}
            </p>
            <h3 id="delete-account-modal-title">
              {t("settings.deleteModalTitle")}
            </h3>
            <p>
              {t("settings.deleteModalIntro")}
            </p>
            <p className="danger-warning">
              {t("settings.deleteModalWarning")}
            </p>

            <div className="settings-delete-form">
              <label>{t("settings.deleteReasonLabel")}</label>
              <select
                className="input"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                disabled={deletingAccount}
              >
                <option value="">
                  {t("settings.deleteReasonPlaceholder")}
                </option>
                {deleteReasonOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p>{t("settings.deleteReasonOptional")}</p>

              <label>{t("settings.deleteReasonDetailsLabel")}</label>
              <textarea
                className="input"
                rows={3}
                value={deleteReasonDetails}
                onChange={(event) => setDeleteReasonDetails(event.target.value)}
                placeholder={t("settings.deleteReasonDetailsPlaceholder")}
                disabled={deletingAccount}
              />

              <label>{deleteConfirmationLabel}</label>
              <input
                className="input"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={deletePlaceholder}
                disabled={deletingAccount}
              />

              <p>{t("settings.deleteBillingNotice")}</p>
            </div>

            {deleteMessage && (
              <p className="settings-delete-message">{deleteMessage}</p>
            )}

            <div className="settings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingAccount}
              >
                {t("settings.cancel")}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? deletingAccountLabel : deleteButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppLayout>
  );
}
