"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

export default function AdminInvitePage() {
  const { t } = useUiText(["adminInvite"]);
  const invalidInviteText = t("adminInvite.invalid");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  const adminInviteApiErrorKeys = {
    ADMIN_INVITE_SERVER_CONFIG: "adminInvite.error.serverConfig",
    ADMIN_INVITE_LOGIN_REQUIRED: "adminInvite.error.loginRequired",
    ADMIN_INVITE_INVALID_SESSION: "adminInvite.error.invalidSession",
    ADMIN_INVITE_INVALID: "adminInvite.invalid",
    ADMIN_INVITE_REVOKED: "adminInvite.error.revoked",
    ADMIN_INVITE_USED: "adminInvite.error.used",
    ADMIN_INVITE_EXPIRED: "adminInvite.error.expired",
    ADMIN_INVITE_EMAIL_MISMATCH: "adminInvite.error.emailMismatch",
    ADMIN_INVITE_SYNC_FAILED: "adminInvite.error.sync",
  };

  function getAdminInviteApiError(payload) {
    const translationKey = adminInviteApiErrorKeys[String(payload?.code || "")];
    return translationKey ? t(translationKey) : t("adminInvite.error");
  }

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      const inviteToken = new URLSearchParams(window.location.search).get("token") || "";
      if (!inviteToken) {
        if (!cancelled) { setError(invalidInviteText); setReady(true); }
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const next = `/admin-invite?token=${encodeURIComponent(inviteToken)}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!cancelled) {
        setToken(inviteToken);
        setEmail(session.user?.email || "");
        setReady(true);
      }
    }
    prepare();
    return () => { cancelled = true; };
  }, [invalidInviteText]);

  async function acceptInvite() {
    setAccepting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("adminInvite.sessionExpired"));
      const response = await fetch("/api/admin-invite/accept", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getAdminInviteApiError(payload));
      await supabase.auth.refreshSession().catch(() => null);
      setAccepted(true);
    } catch (acceptError) {
      setError(acceptError?.message || t("adminInvite.error"));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="admin186-invite-page">
      <section className="admin186-invite-card">
        <img src="/brand/spreelologo.png" alt="Spreelo" className="admin186-invite-logo"/>
        {!ready ? <div className="admin186-loading"><LoaderCircle className="admin-spin" size={24}/>{t("adminInvite.loading")}</div> : accepted ? (
          <>
            <div className="admin186-success-icon"><CheckCircle2 size={34}/></div>
            <h1>{t("adminInvite.successTitle")}</h1>
            <p>{t("adminInvite.successText")}</p>
            <a className="admin186-primary-link" href="/admin">{t("adminInvite.openAdmin")}</a>
          </>
        ) : (
          <>
            <div className="admin186-invite-shield"><ShieldCheck size={30}/></div>
            <span className="admin186-eyebrow">{t("adminInvite.eyebrow")}</span>
            <h1>{t("adminInvite.title")}</h1>
            <p>{t("adminInvite.text")}</p>
            {email ? <div className="admin186-account"><small>{t("adminInvite.signedInAs")}</small><strong>{email}</strong></div> : null}
            {error ? <div className="admin186-alert error">{error}</div> : null}
            <button type="button" className="admin186-primary-button" onClick={acceptInvite} disabled={accepting || !token}>{accepting ? <LoaderCircle className="admin-spin" size={18}/> : <ShieldCheck size={18}/>} {accepting ? t("adminInvite.accepting") : t("adminInvite.accept")}</button>
            <p className="admin186-fineprint">{t("adminInvite.exactEmail")}</p>
          </>
        )}
      </section>
    </main>
  );
}
