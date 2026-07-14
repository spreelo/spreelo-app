"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Building2,
  CircleDollarSign,
  FileVideo2,
  ImagePlay,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const initialStats = {
  users: 0,
  brands: 0,
  posts: 0,
  activeAutomations: 0,
  backgrounds: 0,
  failedMedia: 0,
  pendingApproval: 0,
};

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function getAdminHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(initialStats);
  const [recentAdjustments, setRecentAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    setError("");

    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/overview", { headers });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Could not load the admin dashboard.");
      }

      setStats({ ...initialStats, ...(payload?.stats || {}) });
      setRecentAdjustments(payload?.recentAdjustments || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load the admin dashboard.");
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: "Accounts", value: stats.users, Icon: Users },
    { label: "Brands", value: stats.brands, Icon: Building2 },
    { label: "Posts", value: stats.posts, Icon: Sparkles },
    { label: "Active automations", value: stats.activeAutomations, Icon: Bot },
    { label: "Video backgrounds", value: stats.backgrounds, Icon: ImagePlay },
    { label: "Pending approval", value: stats.pendingApproval, Icon: FileVideo2 },
  ];

  return (
    <AppLayout active="admin">
      <div className="admin-page">
        <header className="admin-hero">
          <div>
            <span className="admin-eyebrow">Spreelo administration</span>
            <h1>Admin dashboard</h1>
            <p>
              Manage shared creative assets, customer credits and operational checks from one protected workspace.
            </p>
          </div>

          <div className="admin-hero-badge">
            <ShieldCheck size={24} aria-hidden="true" />
            <div>
              <strong>Administrator</strong>
              <span>Server-protected access</span>
            </div>
          </div>
        </header>

        {error ? <div className="admin-alert error">{error}</div> : null}

        {loading ? (
          <section className="admin-loading-card">
            <LoaderCircle className="admin-spin" size={24} aria-hidden="true" />
            Loading admin data…
          </section>
        ) : (
          <>
            <section className="admin-stat-grid">
              {statCards.map(({ label, value, Icon }) => (
                <article className="admin-stat-card" key={label}>
                  <span className="admin-stat-icon"><Icon size={20} aria-hidden="true" /></span>
                  <strong>{Number(value || 0).toLocaleString()}</strong>
                  <span>{label}</span>
                </article>
              ))}
            </section>

            {stats.failedMedia > 0 ? (
              <div className="admin-alert warning">
                <AlertTriangle size={19} aria-hidden="true" />
                <div>
                  <strong>{stats.failedMedia} post{stats.failedMedia === 1 ? " has" : "s have"} failed media processing</strong>
                  <span>These should be reviewed in logs before retrying or compensating credits.</span>
                </div>
              </div>
            ) : null}

            <section className="admin-tool-grid">
              <a className="admin-tool-card" href="/video-backgrounds">
                <span className="admin-tool-icon"><ImagePlay size={24} aria-hidden="true" /></span>
                <div>
                  <span className="admin-card-kicker">Creative library</span>
                  <h2>Video backgrounds</h2>
                  <p>Upload, tag, preview and manage the reusable 9:16 motion background library.</p>
                </div>
                <strong>Open library →</strong>
              </a>

              <a className="admin-tool-card" href="/admin/credits">
                <span className="admin-tool-icon"><CircleDollarSign size={24} aria-hidden="true" /></span>
                <div>
                  <span className="admin-card-kicker">Customer support</span>
                  <h2>Credit adjustments</h2>
                  <p>Look up an account by email, add compensation credits or correct a balance with an audit trail.</p>
                </div>
                <strong>Manage credits →</strong>
              </a>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <span className="admin-card-kicker">Audit trail</span>
                  <h2>Recent credit adjustments</h2>
                </div>
                <a href="/admin/credits">View all</a>
              </div>

              {recentAdjustments.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Change</th>
                        <th>New balance</th>
                        <th>Reason</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAdjustments.map((item) => (
                        <tr key={item.id}>
                          <td>{item.target_email || "Unknown account"}</td>
                          <td className={Number(item.amount) >= 0 ? "positive" : "negative"}>
                            {Number(item.amount) > 0 ? "+" : ""}{Number(item.amount || 0)}
                          </td>
                          <td>{Number(item.new_balance || 0)}</td>
                          <td>{item.reason}</td>
                          <td>{formatDateTime(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state">No manual credit adjustments have been made yet.</div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
