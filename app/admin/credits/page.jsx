"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleDollarSign,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

function formatDateTime(value, locale = "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale || "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function getAdminHeaders(json = false) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}

export default function AdminCreditsPage() {
  const { t, locale } = useUiText(["admin"]);
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState(null);
  const [recentAdjustments, setRecentAdjustments] = useState([]);
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const queryEmail = new URLSearchParams(window.location.search).get("email") || "";
    if (queryEmail.trim()) {
      setEmail(queryEmail.trim());
      lookupAccount(null, queryEmail.trim());
      return;
    }
    loadRecentAdjustments();
  }, []);

  async function loadRecentAdjustments() {
    setLoading(true);
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/credits", { headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.credits.loadError"));
      setRecentAdjustments(payload?.recentAdjustments || []);
    } catch (loadError) {
      setError(loadError.message || t("admin.credits.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function lookupAccount(event, emailOverride = "") {
    event?.preventDefault();
    const normalizedEmail = String(emailOverride || email).trim().toLowerCase();
    if (!normalizedEmail) return;

    setSearching(true);
    setMessage("");
    setError("");
    setAccount(null);

    try {
      const headers = await getAdminHeaders();
      const response = await fetch(
        `/api/admin/credits?email=${encodeURIComponent(normalizedEmail)}`,
        { headers }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.credits.findError"));
      setAccount(payload?.account || null);
      setRecentAdjustments(payload?.recentAdjustments || []);
    } catch (lookupError) {
      setError(lookupError.message || t("admin.credits.findError"));
    } finally {
      setSearching(false);
    }
  }

  async function adjustCredits(event) {
    event.preventDefault();
    if (!account?.email || saving) return;

    const parsedAmount = Math.abs(Number.parseInt(amount, 10));
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError(t("admin.credits.amountError"));
      return;
    }

    const signedAmount = direction === "remove" ? -parsedAmount : parsedAmount;
    if (signedAmount < 0 && !window.confirm(t("admin.credits.confirmRemove", { count: parsedAmount, email: account.email }))) {
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const headers = await getAdminHeaders(true);
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: account.email,
          amount: signedAmount,
          reason,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.credits.adjustError"));

      setAccount(payload?.account || account);
      setRecentAdjustments(payload?.recentAdjustments || []);
      setReason("");
      setMessage(
        signedAmount > 0 ? t("admin.credits.adjustSuccessAdd", { count: Math.abs(signedAmount), balance: payload?.account?.balance?.credits_remaining ?? "—" }) : t("admin.credits.adjustSuccessRemove", { count: Math.abs(signedAmount), balance: payload?.account?.balance?.credits_remaining ?? "—" })
      );
    } catch (saveError) {
      setError(saveError.message || t("admin.credits.adjustError"));
    } finally {
      setSaving(false);
    }
  }

  const accountAdjustments = useMemo(() => {
    if (!account?.id) return [];
    return recentAdjustments.filter((item) => item.target_user_id === account.id);
  }, [recentAdjustments, account]);

  return (
    <AppLayout active="admin">
      <div className="admin-page">
        <a className="admin-back-link" href="/admin">
          <ArrowLeft size={16} aria-hidden="true" /> {t("admin.credits.back")}
        </a>

        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">{t("admin.credits.kicker")}</span>
            <h1>{t("admin.credits.title")}</h1>
            <p>{t("admin.credits.description")}</p>
          </div>
          <div className="admin-hero-badge">
            <ShieldCheck size={24} aria-hidden="true" />
            <div><strong>{t("admin.credits.protected")}</strong><span>{t("admin.credits.logged")}</span></div>
          </div>
        </header>

        {error ? <div className="admin-alert error">{error}</div> : null}
        {message ? <div className="admin-alert success">{message}</div> : null}

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-card-kicker">{t("admin.credits.lookupKicker")}</span>
              <h2>{t("admin.credits.findCustomer")}</h2>
            </div>
          </div>

          <form className="admin-search-form" onSubmit={lookupAccount}>
            <label>
              {t("admin.credits.loginEmail")}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="customer@example.com"
                autoComplete="off"
              />
            </label>
            <button type="submit" disabled={searching || !email.trim()}>
              {searching ? <LoaderCircle className="admin-spin" size={18} /> : <Search size={18} />}
              {searching ? t("admin.credits.searching") : t("admin.credits.findAccount")}
            </button>
          </form>
        </section>

        {account ? (
          <section className="admin-credit-layout">
            <article className="admin-panel admin-account-card">
              <span className="admin-card-kicker">{t("admin.credits.selectedAccount")}</span>
              <h2>{account.email}</h2>

              <div className="admin-account-balance">
                <CircleDollarSign size={24} aria-hidden="true" />
                <div>
                  <strong>{account.balance?.credits_remaining ?? t("admin.credits.noBalance")}</strong>
                  <span>{t("admin.credits.availableCredits")}</span>
                </div>
              </div>

              <dl className="admin-account-details">
                <div><dt>{t("admin.credits.plan")}</dt><dd>{account.balance?.plan_name || account.balance?.subscription_plan || "—"}</dd></div>
                <div><dt>{t("admin.credits.status")}</dt><dd>{account.balance?.subscription_status || "—"}</dd></div>
                <div><dt>{t("admin.credits.brands")}</dt><dd>{account.brandCount}</dd></div>
                <div><dt>{t("admin.credits.created")}</dt><dd>{formatDateTime(account.createdAt, locale)}</dd></div>
                <div><dt>{t("admin.credits.lastSignIn")}</dt><dd>{formatDateTime(account.lastSignInAt, locale)}</dd></div>
                <div><dt>{t("admin.credits.userId")}</dt><dd className="admin-mono">{account.id}</dd></div>
              </dl>
            </article>

            <article className="admin-panel">
              <span className="admin-card-kicker">{t("admin.credits.manualKicker")}</span>
              <h2>{t("admin.credits.changeBalance")}</h2>
              <p className="admin-panel-copy">{t("admin.credits.manualText")}</p>

              <form className="admin-adjust-form" onSubmit={adjustCredits}>
                <div className="admin-direction-toggle">
                  <button type="button" className={direction === "add" ? "active" : ""} onClick={() => setDirection("add")}>{t("admin.credits.add")}</button>
                  <button type="button" className={direction === "remove" ? "active danger" : ""} onClick={() => setDirection("remove")}>{t("admin.credits.remove")}</button>
                </div>

                <label>
                  {t("admin.credits.amount")}
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>

                <label>
                  {t("admin.credits.reason")}
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("admin.credits.reasonPlaceholder")}
                    rows="4"
                  />
                </label>

                <button className={direction === "remove" ? "danger" : ""} type="submit" disabled={saving || !reason.trim()}>
                  {saving ? <LoaderCircle className="admin-spin" size={18} /> : <CircleDollarSign size={18} />}
                  {saving ? t("admin.credits.saving") : direction === "add" ? t("admin.credits.add") : t("admin.credits.remove")}
                </button>
              </form>
            </article>
          </section>
        ) : null}

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-card-kicker">{t("admin.credits.audit")}</span>
              <h2>{account ? t("admin.credits.forAccount", { email: account.email }) : t("admin.credits.recent")}</h2>
            </div>
          </div>

          {loading ? (
            <div className="admin-empty-state"><LoaderCircle className="admin-spin" size={20} /> {t("admin.credits.loadingHistory")}</div>
          ) : (account ? accountAdjustments : recentAdjustments).length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{t("admin.credits.account")}</th><th>{t("admin.credits.change")}</th><th>{t("admin.credits.before")}</th><th>{t("admin.credits.after")}</th><th>{t("admin.credits.reason")}</th><th>{t("admin.credits.admin")}</th><th>{t("admin.credits.date")}</th></tr></thead>
                <tbody>
                  {(account ? accountAdjustments : recentAdjustments).map((item) => (
                    <tr key={item.id}>
                      <td>{item.target_email || "—"}</td>
                      <td className={Number(item.amount) >= 0 ? "positive" : "negative"}>{Number(item.amount) > 0 ? "+" : ""}{Number(item.amount || 0)}</td>
                      <td>{Number(item.previous_balance || 0)}</td>
                      <td>{Number(item.new_balance || 0)}</td>
                      <td>{item.reason}</td>
                      <td>{item.admin_email || "—"}</td>
                      <td>{formatDateTime(item.created_at, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">{t("admin.credits.none")}</div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
