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

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
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
    loadRecentAdjustments();
  }, []);

  async function loadRecentAdjustments() {
    setLoading(true);
    setError("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/credits", { headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Could not load credit history.");
      setRecentAdjustments(payload?.recentAdjustments || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load credit history.");
    } finally {
      setLoading(false);
    }
  }

  async function lookupAccount(event) {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
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
      if (!response.ok) throw new Error(payload?.error || "Could not find the account.");
      setAccount(payload?.account || null);
      setRecentAdjustments(payload?.recentAdjustments || []);
    } catch (lookupError) {
      setError(lookupError.message || "Could not find the account.");
    } finally {
      setSearching(false);
    }
  }

  async function adjustCredits(event) {
    event.preventDefault();
    if (!account?.email || saving) return;

    const parsedAmount = Math.abs(Number.parseInt(amount, 10));
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a positive whole number of credits.");
      return;
    }

    const signedAmount = direction === "remove" ? -parsedAmount : parsedAmount;
    if (signedAmount < 0 && !window.confirm(`Remove ${parsedAmount} credits from ${account.email}?`)) {
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
      if (!response.ok) throw new Error(payload?.error || "Could not adjust credits.");

      setAccount(payload?.account || account);
      setRecentAdjustments(payload?.recentAdjustments || []);
      setReason("");
      setMessage(
        `${signedAmount > 0 ? "Added" : "Removed"} ${Math.abs(signedAmount)} credits. New balance: ${payload?.account?.balance?.credits_remaining ?? "—"}.`
      );
    } catch (saveError) {
      setError(saveError.message || "Could not adjust credits.");
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
          <ArrowLeft size={16} aria-hidden="true" /> Admin dashboard
        </a>

        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">Customer support</span>
            <h1>Credit adjustments</h1>
            <p>Find a Spreelo account by its exact login email and adjust credits with a permanent audit record.</p>
          </div>
          <div className="admin-hero-badge">
            <ShieldCheck size={24} aria-hidden="true" />
            <div><strong>Protected tool</strong><span>All changes are logged</span></div>
          </div>
        </header>

        {error ? <div className="admin-alert error">{error}</div> : null}
        {message ? <div className="admin-alert success">{message}</div> : null}

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-card-kicker">Account lookup</span>
              <h2>Find customer</h2>
            </div>
          </div>

          <form className="admin-search-form" onSubmit={lookupAccount}>
            <label>
              Spreelo login email
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
              {searching ? "Searching…" : "Find account"}
            </button>
          </form>
        </section>

        {account ? (
          <section className="admin-credit-layout">
            <article className="admin-panel admin-account-card">
              <span className="admin-card-kicker">Selected account</span>
              <h2>{account.email}</h2>

              <div className="admin-account-balance">
                <CircleDollarSign size={24} aria-hidden="true" />
                <div>
                  <strong>{account.balance?.credits_remaining ?? "No balance row"}</strong>
                  <span>available credits</span>
                </div>
              </div>

              <dl className="admin-account-details">
                <div><dt>Plan</dt><dd>{account.balance?.plan_name || account.balance?.subscription_plan || "—"}</dd></div>
                <div><dt>Status</dt><dd>{account.balance?.subscription_status || "—"}</dd></div>
                <div><dt>Brands</dt><dd>{account.brandCount}</dd></div>
                <div><dt>Account created</dt><dd>{formatDateTime(account.createdAt)}</dd></div>
                <div><dt>Last sign-in</dt><dd>{formatDateTime(account.lastSignInAt)}</dd></div>
                <div><dt>User ID</dt><dd className="admin-mono">{account.id}</dd></div>
              </dl>
            </article>

            <article className="admin-panel">
              <span className="admin-card-kicker">Manual adjustment</span>
              <h2>Change credit balance</h2>
              <p className="admin-panel-copy">Use this for goodwill credits, compensation or a clearly documented correction.</p>

              <form className="admin-adjust-form" onSubmit={adjustCredits}>
                <div className="admin-direction-toggle">
                  <button type="button" className={direction === "add" ? "active" : ""} onClick={() => setDirection("add")}>Add credits</button>
                  <button type="button" className={direction === "remove" ? "active danger" : ""} onClick={() => setDirection("remove")}>Remove credits</button>
                </div>

                <label>
                  Number of credits
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
                  Reason
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Example: Compensation for failed video render"
                    rows="4"
                  />
                </label>

                <button className={direction === "remove" ? "danger" : ""} type="submit" disabled={saving || !reason.trim()}>
                  {saving ? <LoaderCircle className="admin-spin" size={18} /> : <CircleDollarSign size={18} />}
                  {saving ? "Saving…" : direction === "add" ? "Add credits" : "Remove credits"}
                </button>
              </form>
            </article>
          </section>
        ) : null}

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-card-kicker">Audit trail</span>
              <h2>{account ? `Adjustments for ${account.email}` : "Recent adjustments"}</h2>
            </div>
          </div>

          {loading ? (
            <div className="admin-empty-state"><LoaderCircle className="admin-spin" size={20} /> Loading history…</div>
          ) : (account ? accountAdjustments : recentAdjustments).length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Account</th><th>Change</th><th>Before</th><th>After</th><th>Reason</th><th>Admin</th><th>Date</th></tr></thead>
                <tbody>
                  {(account ? accountAdjustments : recentAdjustments).map((item) => (
                    <tr key={item.id}>
                      <td>{item.target_email || "—"}</td>
                      <td className={Number(item.amount) >= 0 ? "positive" : "negative"}>{Number(item.amount) > 0 ? "+" : ""}{Number(item.amount || 0)}</td>
                      <td>{Number(item.previous_balance || 0)}</td>
                      <td>{Number(item.new_balance || 0)}</td>
                      <td>{item.reason}</td>
                      <td>{item.admin_email || "—"}</td>
                      <td>{formatDateTime(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">No credit adjustments found.</div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
