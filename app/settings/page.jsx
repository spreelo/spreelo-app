"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

export default function Settings() {
  const { t } = useUiText(["settings"]);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserEmail(user?.email || "");
    }

    loadUser();
  }, []);

  async function handleDeleteAccount() {
    if (deletingAccount) return;

    if (confirmText !== "DELETE") {
      setDeleteMessage(t("settings.errorTypeDelete"));
      return;
    }

    const confirmed = window.confirm(t("settings.deleteConfirmDialog"));

    if (!confirmed) return;

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
        },
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
      <header className="topbar">
        <div>
          <p className="eyebrow">{t("settings.eyebrow")}</p>
          <h2>{t("settings.title")}</h2>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{t("settings.accountEyebrow")}</p>
          <h3>{t("settings.accountTitle")}</h3>
          <p>{t("settings.accountText")}</p>
        </div>

        <div className="prompt-box">
          <label>{t("settings.signedInAs")}</label>
          <div className="input">
            {currentUserEmail || t("settings.signedInUserFallback")}
          </div>
        </div>
      </section>

      <section className="settings-danger-zone">
        <div>
          <p className="eyebrow danger-eyebrow">
            {t("settings.dangerEyebrow")}
          </p>
          <h3>{t("settings.deleteTitle")}</h3>
          <p>{t("settings.deleteText")}</p>
          <p className="danger-warning">
            {t("settings.deleteWarningBefore")} <strong>DELETE</strong>{" "}
            {t("settings.deleteWarningAfter")}
          </p>
        </div>

        <div className="settings-danger-box">
          <label>{t("settings.confirmation")}</label>
          <input
            className="input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={t("settings.confirmPlaceholder")}
            disabled={deletingAccount}
          />

          <button
            type="button"
            className="danger-button full"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount
              ? t("settings.deletingAccount")
              : t("settings.deleteButton")}
          </button>

          {deleteMessage && (
            <p className="settings-delete-message">{deleteMessage}</p>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
