"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LoaderCircle, MailPlus, RefreshCw, ShieldCheck, Trash2, UserRoundCog } from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

async function adminHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function formatDate(value, locale) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function AdminTeamPage() {
  const { t, locale } = useUiText(["adminTeam"]);
  const [data, setData] = useState({ configured: [], members: [], invites: [], primaryEmail: "" });
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyEmail, setBusyEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const adminTeamApiErrorKeys = {
    ADMIN_TEAM_PRIMARY_ONLY: "adminTeam.error.primaryOnly",
    ADMIN_TEAM_INVALID_EMAIL: "adminTeam.error.invalidEmail",
    ADMIN_TEAM_CONFIGURED_ALREADY: "adminTeam.error.configuredAlready",
    ADMIN_TEAM_ACTIVE_ALREADY: "adminTeam.error.activeAlready",
    ADMIN_TEAM_EMAIL_REQUIRED: "adminTeam.error.emailRequired",
    ADMIN_TEAM_CONFIGURED_CANNOT_REVOKE: "adminTeam.error.configuredCannotRevoke",
    ADMIN_TEAM_ACTIVE_NOT_FOUND: "adminTeam.error.activeNotFound",
    ADMIN_TEAM_ACCOUNT_LOAD_FAILED: "adminTeam.error.accountLoad",
    ADMIN_TEAM_REVOKE_SAFETY_FAILED: "adminTeam.error.revokeSafe",
  };

  function getAdminTeamApiError(payload, fallbackKey) {
    const translationKey = adminTeamApiErrorKeys[String(payload?.code || "")];
    return translationKey ? t(translationKey) : t(fallbackKey);
  }

  const activeMembers = useMemo(() => (data.members || []).filter((item) => item.status === "active"), [data.members]);
  const pendingInvites = useMemo(() => (data.invites || []).filter((item) => !item.accepted_at && !item.revoked_at && new Date(item.expires_at).getTime() > Date.now()), [data.invites]);

  async function loadTeam() {
    setLoading(true);
    setError("");
    try {
      const headers = await adminHeaders();
      const response = await fetch("/api/admin/team", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getAdminTeamApiError(payload, "adminTeam.error.load"));
      setData(payload);
    } catch (loadError) {
      setError(loadError?.message || t("adminTeam.error.load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTeam(); }, []);

  async function sendInvite(event) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    setError("");
    try {
      const headers = await adminHeaders();
      const response = await fetch("/api/admin/team", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, locale }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getAdminTeamApiError(payload, "adminTeam.error.send"));
      setEmail("");
      setMessage(t("adminTeam.inviteSent", { email: payload?.invite?.email || email }));
      await loadTeam();
    } catch (sendError) {
      setError(sendError?.message || t("adminTeam.error.send"));
    } finally {
      setSending(false);
    }
  }

  async function revoke(emailToRevoke) {
    if (!window.confirm(t("adminTeam.revokeConfirm", { email: emailToRevoke }))) return;
    setBusyEmail(emailToRevoke);
    setMessage("");
    setError("");
    try {
      const headers = await adminHeaders();
      const response = await fetch("/api/admin/team", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ email: emailToRevoke }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getAdminTeamApiError(payload, "adminTeam.error.revoke"));
      setMessage(t("adminTeam.revoked", { email: emailToRevoke }));
      await loadTeam();
    } catch (revokeError) {
      setError(revokeError?.message || t("adminTeam.error.revoke"));
    } finally {
      setBusyEmail("");
    }
  }

  return (
    <AppLayout>
      <main className="admin186-team-page">
        <section className="admin186-team-hero">
          <div className="admin186-team-icon"><UserRoundCog size={28}/></div>
          <div>
            <span>{t("adminTeam.eyebrow")}</span>
            <h1>{t("adminTeam.title")}</h1>
            <p>{t("adminTeam.subtitle")}</p>
          </div>
          <button type="button" className="admin186-icon-button" onClick={loadTeam} aria-label={t("adminTeam.refresh")}><RefreshCw size={18}/></button>
        </section>

        {error ? <div className="admin186-alert error">{error}</div> : null}
        {message ? <div className="admin186-alert success"><CheckCircle2 size={17}/>{message}</div> : null}

        <section className="admin186-team-card">
          <div className="admin186-card-head"><div><h2>{t("adminTeam.inviteTitle")}</h2><p>{t("adminTeam.inviteText")}</p></div><MailPlus size={22}/></div>
          <form className="admin186-invite-form" onSubmit={sendInvite}>
            <label>
              <span>{t("adminTeam.emailLabel")}</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("adminTeam.emailPlaceholder")}/>
            </label>
            <button type="submit" disabled={sending || !email.trim()}>{sending ? <LoaderCircle className="admin-spin" size={18}/> : <MailPlus size={18}/>} {sending ? t("adminTeam.sending") : t("adminTeam.sendInvite")}</button>
          </form>
          <p className="admin186-security-note"><ShieldCheck size={16}/>{t("adminTeam.securityNote")}</p>
        </section>

        <section className="admin186-team-card">
          <div className="admin186-card-head"><div><h2>{t("adminTeam.activeTitle")}</h2><p>{t("adminTeam.activeText")}</p></div></div>
          {loading ? <div className="admin186-loading"><LoaderCircle className="admin-spin" size={22}/>{t("adminTeam.loading")}</div> : (
            <div className="admin186-member-list">
              {(data.configured || []).map((item) => (
                <article key={`configured-${item.email}`} className="admin186-member-row">
                  <div><strong>{item.email}</strong><span>{item.source === "primary" ? t("adminTeam.primaryAdmin") : t("adminTeam.configuredAdmin")}</span></div>
                  <b className="active"><CheckCircle2 size={14}/>{t("adminTeam.active")}</b>
                </article>
              ))}
              {activeMembers.map((item) => (
                <article key={`member-${item.email}`} className="admin186-member-row">
                  <div><strong>{item.email}</strong><span>{t("adminTeam.joined", { date: formatDate(item.accepted_at, locale) })}</span></div>
                  <div className="admin186-member-actions"><b className="active"><CheckCircle2 size={14}/>{t("adminTeam.active")}</b><button type="button" disabled={busyEmail === item.email} onClick={() => revoke(item.email)}>{busyEmail === item.email ? <LoaderCircle className="admin-spin" size={16}/> : <Trash2 size={16}/>} {t("adminTeam.revoke")}</button></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="admin186-team-card">
          <div className="admin186-card-head"><div><h2>{t("adminTeam.pendingTitle")}</h2><p>{t("adminTeam.pendingText")}</p></div><Clock3 size={21}/></div>
          {!loading && pendingInvites.length === 0 ? <p className="admin186-empty">{t("adminTeam.noPending")}</p> : null}
          <div className="admin186-member-list">
            {pendingInvites.map((item) => (
              <article key={item.id} className="admin186-member-row">
                <div><strong>{item.email}</strong><span>{t("adminTeam.expires", { date: formatDate(item.expires_at, locale) })}</span></div>
                <b className="pending"><Clock3 size={14}/>{t("adminTeam.pending")}</b>
              </article>
            ))}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
