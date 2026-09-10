"use client";

import {
  ArrowRight,
  CircleCheck,
  Download,
  Laptop,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { SUPPORTED_UI_LOCALES } from "../lib/i18n/defaultLabels";
import { useUiText } from "../lib/i18n/useUiText";

export default function SettingsPanels({
  activeTab,
  locale,
  currentUser,
  currentUserEmail,
  profileName,
  setProfileName,
  profileMessage,
  savingProfile,
  saveProfile,
  signOutOtherSessions,
  exportAccountData,
  recommendedLocale,
  savingLanguage,
  handleLanguageChange,
  defaultPostLanguageDraft,
  setDefaultPostLanguageDraft,
  savedDefaultPostLanguage,
  savingDefaultPostLanguage,
  handleDefaultPostLanguageChange,
  supportedContentLanguages = [],
  planName,
  onDeleteAccount,
  publishingTimeZone,
  publishingTimeZoneDraft,
  setPublishingTimeZoneDraft,
  savingTimeZone,
  handleTimeZoneChange,
  publishingTimeZoneOptions = [],
  currentBrandName,
  currentBrandWebsite,
  requestProfileImageChange,
  requestProfileImageRemove,
}) {
  const { t } = useUiText(["settings"]);
  const name = profileName || currentUserEmail?.split("@")[0] || t("settings.userFallback");
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const emailVerified = Boolean(currentUser?.email_confirmed_at || currentUser?.confirmed_at);

  if (activeTab === "account") {
    return (
      <section className="settings-reference-workspace settings-ref-account">
        <div className="settings-ref-account-main">
          <section className="settings-ref-profile-block">
            <div className="settings-ref-section-intro">
              <h2>{t("settings.profileTitle")}</h2>
              <p>{t("settings.profileText")}</p>
            </div>
            <div className="settings-ref-profile">
              <span className={currentUser?.user_metadata?.spreelo_avatar_url ? "has-image" : ""}>{currentUser?.user_metadata?.spreelo_avatar_url ? <img src={currentUser.user_metadata.spreelo_avatar_url} alt="" /> : initials}</span>
              <div className="settings-ref-profile-actions">
                <button type="button" onClick={requestProfileImageChange}>{t("settings.changeProfilePicture")}</button>
                {currentUser?.user_metadata?.spreelo_avatar_url ? <button type="button" className="remove" onClick={requestProfileImageRemove}>{t("settings.removeProfilePicture")}</button> : null}
              </div>
            </div>
          </section>

          <div className="settings-ref-labelled-section">
            <div><h3>{t("settings.contactDetailsTitle")}</h3><p>{t("settings.contactDetailsText")}</p></div>
            <div className="settings-ref-rows">
              <label><strong>{t("settings.nameLabel")}</strong><input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={t("settings.namePlaceholder")} /><button type="button" onClick={saveProfile}>{savingProfile ? t("settings.saving") : t("settings.save")}</button></label>
              <div><strong>{t("settings.emailAddress")}</strong><span>{currentUserEmail}</span><em>{t("settings.verified")}</em></div>
            </div>
          </div>

          <div className="settings-ref-labelled-section">
            <div><h3>{t("settings.workspaceTitle")}</h3><p>{t("settings.workspaceText")}</p></div>
            <div className="settings-ref-rows">
              <div><strong>{t("settings.companyLabel")}</strong><span>{currentBrandName || "—"}</span></div>
              <div><strong>{t("settings.websiteLabel")}</strong><span>{currentBrandWebsite || "—"}</span></div>
            </div>
          </div>

          <div className="settings-ref-labelled-section account-management">
            <div><h3>{t("settings.accountManagementTitle")}</h3><p>{t("settings.accountManagementText")}</p></div>
            <div className="settings-ref-action-rows">
              <button type="button" onClick={exportAccountData}><Download /><span><strong>{t("settings.downloadSummary")}</strong><small>{t("settings.downloadSummaryText")}</small></span><ArrowRight /></button>
              <button type="button" className="danger" onClick={onDeleteAccount}><Trash2 /><span><strong>{t("settings.deleteTitle")}</strong><small>{t("settings.deleteAccountShortText")}</small></span><ArrowRight /></button>
            </div>
          </div>
          {profileMessage && <p className="settings-ref-message">{profileMessage}</p>}
        </div>
        <aside className="settings-ref-account-aside">
          <h2>{t("settings.accountOverview")}</h2>
          <div className="settings-ref-account-facts">
            <div><span>{t("settings.roleLabel")}</span><strong>{t("settings.ownerLabel")}</strong></div>
            <div><span>{t("settings.planLabel")}</span><strong>{planName}</strong></div>
            <div><span>{t("settings.memberSince")}</span><strong>{currentUser?.created_at ? new Date(currentUser.created_at).getFullYear() : "—"}</strong></div>
          </div>
          <a href="/brand">{t("settings.openBrandProfile")}</a>
        </aside>
      </section>
    );
  }

  if (activeTab === "security") {
    return (
      <section className="settings-reference-workspace settings-ref-security">
        <div className="settings-ref-security-main">
          <div className="settings-ref-labelled-section"><div><h3>{t("settings.signInTitle")}</h3><p>{t("settings.signInText")}</p></div><div className="settings-ref-card"><header><LockKeyhole /><span><strong>{t("settings.emailCodeSignIn")}</strong><small>{t("settings.emailCodeSignInText")}</small></span><em>{t("settings.active")}</em></header><div><strong>{t("settings.emailAddress")}</strong><span>{currentUserEmail}</span><em className={emailVerified ? "" : "pending"}>{emailVerified ? t("settings.verified") : t("settings.notVerified")}</em></div><div><strong>{t("settings.signInMethod")}</strong><span>{t("settings.oneTimeCodeEmail")}</span></div><div><strong>{t("settings.lastSignedIn")}</strong><span>{currentUser?.last_sign_in_at ? new Date(currentUser.last_sign_in_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—"}</span></div></div></div>
          <div className="settings-ref-labelled-section"><div><h3>{t("settings.thisSession")}</h3><p>{t("settings.thisSessionText")}</p></div><div className="settings-ref-card sessions"><div><Laptop /><strong>{t("settings.thisDevice")}</strong><em>{t("settings.activeNow")}</em></div></div></div>
          <div className="settings-ref-labelled-section"><div><h3>{t("settings.otherDevices")}</h3><p>{t("settings.otherDevicesText")}</p></div><div className="settings-ref-action-rows"><button type="button" onClick={signOutOtherSessions}><LogOut /><span><strong>{t("settings.signOutOtherDevices")}</strong><small>{t("settings.signOutOtherDevicesText")}</small></span><ArrowRight /></button></div></div>
          {profileMessage && <p className="settings-ref-message">{profileMessage}</p>}
        </div>
        <aside className="settings-ref-security-aside factual"><h2>{t("settings.accountProtection")}</h2><ShieldCheck /><h3>{emailVerified ? t("settings.emailVerifiedTitle") : t("settings.verifyEmailTitle")}</h3><p>{t("settings.emailVerificationText")}</p><ul><li><CircleCheck />{t("settings.noReusablePassword")}</li><li><CircleCheck />{t("settings.temporaryCodes")}</li><li><CircleCheck />{t("settings.sessionsRevocable")}</li></ul></aside>
      </section>
    );
  }

  if (activeTab === "notifications") {
    return (
      <section className="settings-reference-workspace settings-ref-notifications settings-ref-notifications-factual">
        <div className="settings-ref-notification-summary">
          <header><span><Mail /></span><div><h2>{t("settings.importantEmails")}</h2><p>{t("settings.importantEmailsText")}</p></div></header>
          <div><CircleCheck /><span><strong>{t("settings.signInCode")}</strong><small>{t("settings.signInCodeText")}</small></span><em>{t("settings.always")}</em></div>
          <div><CircleCheck /><span><strong>{t("settings.failuresRequiringAction")}</strong><small>{t("settings.failuresRequiringActionText")}</small></span><em>{t("settings.important")}</em></div>
          <div><CircleCheck /><span><strong>{t("settings.planAccountEvents")}</strong><small>{t("settings.planAccountEventsText")}</small></span><em>{t("settings.important")}</em></div>
        </div>
        <aside className="settings-ref-delivery factual"><h2>{t("settings.deliveryAddress")}</h2><p>{t("settings.emailAddress")}<strong>{currentUserEmail}</strong></p><p>{t("settings.verificationLabel")}<em className={emailVerified ? "" : "pending"}>{emailVerified ? t("settings.verified") : t("settings.notVerified")}</em></p><hr /><p className="settings-ref-delivery-note">{t("settings.deliveryControlsNote")}</p></aside>
      </section>
    );
  }

  if (activeTab === "language") {
    const hasUnsavedTimeZone = publishingTimeZoneDraft !== publishingTimeZone;
    return (
      <section className="settings-reference-workspace settings-ref-language settings-ref-language-factual">
        <div className="settings-ref-language-card">
          <div className="settings-ref-language-section app-language"><div><h2>{t("settings.appLanguageHeading")}</h2><p>{t("settings.appLanguageDescription")}</p></div><label className="settings-ref-language-select"><span>{t("settings.chooseLanguage")}</span><select value={recommendedLocale} onChange={(event) => handleLanguageChange(event.target.value)} disabled={savingLanguage}>{SUPPORTED_UI_LOCALES.map((item) => <option key={item.locale} value={item.locale}>{item.nativeName || item.language}</option>)}</select><small>{savingLanguage ? t("settings.savingLanguage") : t("settings.languageSavedText")}</small></label></div>
          <div className="settings-ref-language-section default-post-language">
            <div><h2>{t("settings.defaultPostLanguageHeading")}</h2><p>{t("settings.defaultPostLanguageDescription", { brandName: currentBrandName || t("settings.currentBrandFallback") })}</p></div>
            <div className="settings-ref-language-select">
              <label>
                <span>{t("settings.choosePostLanguage")}</span>
                <select value={defaultPostLanguageDraft} onChange={(event) => setDefaultPostLanguageDraft(event.target.value)} disabled={savingDefaultPostLanguage || !currentBrandName}>
                  {supportedContentLanguages.map((item) => <option key={item.locale} value={item.language}>{item.nativeName || item.language}</option>)}
                </select>
              </label>
              <button type="button" className="settings-ref-timezone-save" onClick={() => handleDefaultPostLanguageChange(defaultPostLanguageDraft)} disabled={savingDefaultPostLanguage || !currentBrandName || defaultPostLanguageDraft === savedDefaultPostLanguage}>{savingDefaultPostLanguage ? t("settings.savingDefaultPostLanguage") : defaultPostLanguageDraft === savedDefaultPostLanguage ? t("settings.defaultPostLanguageSavedShort") : t("settings.saveDefaultPostLanguage")}</button>
              <small>{t("settings.defaultPostLanguageHelp")}</small>
              <a className="settings-ref-inline-brand-link" href="/brand"><span><strong>{t("settings.openBrandProfile")}</strong><small>{t("settings.openBrandProfileText")}</small></span><ArrowRight /></a>
            </div>
          </div>
          <div className="settings-ref-language-section publishing-timezone"><div><h2>{t("settings.publishingTimeZone")}</h2><p>{t("settings.publishingTimeZoneText")}</p></div><div className="settings-ref-language-select"><label><span>{t("settings.workspaceTimeZone")}</span><select value={publishingTimeZoneDraft} onChange={(event) => setPublishingTimeZoneDraft(event.target.value)} aria-busy={savingTimeZone}>{Array.from(new Set([publishingTimeZoneDraft, ...publishingTimeZoneOptions].filter(Boolean))).map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ").replace("/", " / ")}</option>)}</select></label><button type="button" className="settings-ref-timezone-save" onClick={() => handleTimeZoneChange(publishingTimeZoneDraft)} disabled={savingTimeZone || !hasUnsavedTimeZone}>{savingTimeZone ? t("settings.savingTimeZone") : hasUnsavedTimeZone ? t("settings.saveTimeZone") : t("settings.timeZoneSaved")}</button><small>{t("settings.timeZoneAiPlansText")}</small></div></div>
          {profileMessage && <p className="settings-ref-message">{profileMessage}</p>}
        </div>
        <aside className="settings-ref-language-aside factual"><h2>{t("settings.threeChoices")}</h2><ol><li><strong>{t("settings.appLanguageHeading")}</strong><span>{t("settings.appLanguageChoiceText")}</span></li><li><strong>{t("settings.defaultPostLanguageHeading")}</strong><span>{t("settings.postLanguageChoiceText")}</span></li><li><strong>{t("settings.timeZoneLabel")}</strong><span>{t("settings.timeZoneChoiceText")}</span></li></ol></aside>
      </section>
    );
  }

  return null;
}
