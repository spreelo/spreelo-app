"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

export default function Settings() {
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  async function handleDeleteAccount() {
    if (deletingAccount) return;

    if (confirmText !== "DELETE") {
      setDeleteMessage("Type DELETE to confirm account deletion.");
      return;
    }

    const confirmed = window.confirm(
      "This will permanently delete your Spreelo account, all brands, posts, content plans, campaign data and social connections. This cannot be undone."
    );

    if (!confirmed) return;

    setDeletingAccount(true);
    setDeleteMessage("Deleting your account...");

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
        throw new Error(result?.error || "Could not delete account.");
      }

      await supabase.auth.signOut();

      window.location.href = "/login";
    } catch (error) {
      setDeleteMessage(error.message || "Could not delete account.");
      setDeletingAccount(false);
    }
  }

  return (
    <AppLayout active="settings">
      <header className="topbar">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Manage your Spreelo workspace</h2>
        </div>
      </header>

      <section className="hero-card">
  <div>
    <p className="eyebrow">Account</p>
    <h3>Your account</h3>
    <p>
      Manage your Spreelo account and account data.
    </p>
  </div>

  <div className="prompt-box">
    <label>Signed in as</label>
    <div className="input">
      {currentUserEmail || "Signed in user"}
    </div>
  </div>
</section>
      <section className="settings-danger-zone">
        <div>
          <p className="eyebrow danger-eyebrow">Danger zone</p>
          <h3>Delete account</h3>
          <p>
            Permanently delete your Spreelo account, all brands, posts, content
            plans, campaign data, social connections and account settings.
          </p>
          <p className="danger-warning">
            This cannot be undone. Type <strong>DELETE</strong> to confirm.
          </p>
        </div>

        <div className="settings-danger-box">
          <label>Confirmation</label>
          <input
            className="input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="Type DELETE"
            disabled={deletingAccount}
          />

          <button
            type="button"
            className="danger-button full"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? "Deleting account..." : "Delete my account"}
          </button>

          {deleteMessage && (
            <p className="settings-delete-message">{deleteMessage}</p>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
