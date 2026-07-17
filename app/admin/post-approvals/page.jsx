"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

async function getHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusMeta(status, t) {
  if (status === "approved") return { label: t("admin.approvals.approved"), className: "approved", Icon: CheckCircle2 };
  if (status === "rejected") return { label: t("admin.approvals.rejected"), className: "rejected", Icon: XCircle };
  return { label: t("admin.approvals.pending"), className: "pending", Icon: Clock3 };
}

export default function AdminPostApprovalsPage() {
  const { t } = useUiText(["admin"]);
  const [filter, setFilter] = useState("all");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    loadPosts();
  }, [filter]);

  async function loadPosts() {
    setLoading(true);
    setError("");
    try {
      const headers = await getHeaders();
      const response = await fetch(`/api/admin/post-approvals?status=${encodeURIComponent(filter)}`, { headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.loadError"));
      setPosts(payload?.posts || []);
      const nextDrafts = {};
      (payload?.posts || []).forEach((post) => {
        if (post.rejection) {
          nextDrafts[post.rejection.id] = {
            review_status: post.rejection.review_status || "new",
            refund_status: post.rejection.refund_status || "pending_review",
            admin_note: post.rejection.admin_note || "",
          };
        }
      });
      setDrafts(nextDrafts);
    } catch (loadError) {
      setError(loadError.message || t("admin.approvals.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(id, changes) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), ...changes },
    }));
  }

  async function saveReview(feedbackId) {
    setSavingId(feedbackId);
    setError("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ feedback_id: feedbackId, ...(drafts[feedbackId] || {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.saveError"));
      await loadPosts();
    } catch (saveError) {
      setError(saveError.message || t("admin.approvals.saveError"));
    } finally {
      setSavingId("");
    }
  }

  const counts = useMemo(() => ({
    all: posts.length,
    pending: posts.filter((item) => item.status === "pending_approval").length,
    approved: posts.filter((item) => item.status === "approved").length,
    rejected: posts.filter((item) => item.status === "rejected").length,
  }), [posts]);

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-approvals-page">
        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">{t("admin.approvals.kicker")}</span>
            <h1>{t("admin.approvals.title")}</h1>
            <p>{t("admin.approvals.description")}</p>
          </div>
          <button type="button" className="admin-primary-button" onClick={loadPosts}>
            <RefreshCw size={16} /> {t("admin.retry")}
          </button>
        </header>

        <div className="admin-approval-tabs">
          {[
            ["all", t("admin.approvals.all")],
            ["pending_approval", t("admin.approvals.pending")],
            ["approved", t("admin.approvals.approved")],
            ["rejected", t("admin.approvals.rejected")],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="admin-alert error">{error}</div> : null}

        {loading ? (
          <section className="admin-loading-card">
            <LoaderCircle className="admin-spin" size={22} /> {t("admin.approvals.loading")}
          </section>
        ) : (
          <section className="admin-approval-list">
            {posts.length === 0 ? (
              <div className="admin-empty-state"><FileCheck2 size={28} /><strong>{t("admin.approvals.empty")}</strong></div>
            ) : posts.map((post) => {
              const meta = statusMeta(post.status, t);
              const draft = post.rejection ? drafts[post.rejection.id] || {} : null;
              return (
                <article className="admin-approval-card" key={post.id}>
                  <div className="admin-approval-card-main">
                    <span className={`admin-approval-status ${meta.className}`}><meta.Icon size={16} />{meta.label}</span>
                    <div>
                      <small>{post.brand_name || t("admin.approvals.unknownBrand")} · {post.customer_email || "—"}</small>
                      <h2>{post.post_type || post.content_format || t("admin.approvals.post")}</h2>
                      <p>{String(post.content || "").slice(0, 260) || t("admin.approvals.noContent")}</p>
                    </div>
                    <dl>
                      <div><dt>{t("admin.approvals.created")}</dt><dd>{formatDate(post.created_at)}</dd></div>
                      <div><dt>{t("admin.approvals.scheduled")}</dt><dd>{formatDate(post.scheduled_for)}</dd></div>
                      <div><dt>{t("admin.approvals.platform")}</dt><dd>{post.platform || "—"}</dd></div>
                    </dl>
                  </div>

                  {post.rejection ? (
                    <div className="admin-rejection-review">
                      <div className="admin-rejection-copy">
                        <strong>{t("admin.approvals.customerReason")}</strong>
                        <span>{post.rejection.reason_category}</span>
                        <p>{post.rejection.reason_text}</p>
                      </div>
                      <div className="admin-rejection-fields">
                        <label>
                          <span>{t("admin.approvals.reviewStatus")}</span>
                          <select value={draft?.review_status || "new"} onChange={(event) => updateDraft(post.rejection.id, { review_status: event.target.value })}>
                            <option value="new">{t("admin.approvals.review.new")}</option>
                            <option value="reviewing">{t("admin.approvals.review.reviewing")}</option>
                            <option value="resolved">{t("admin.approvals.review.resolved")}</option>
                          </select>
                        </label>
                        <label>
                          <span>{t("admin.approvals.refundStatus")}</span>
                          <select value={draft?.refund_status || "pending_review"} onChange={(event) => updateDraft(post.rejection.id, { refund_status: event.target.value })}>
                            <option value="pending_review">{t("admin.approvals.refund.pending")}</option>
                            <option value="approved">{t("admin.approvals.refund.approved")}</option>
                            <option value="declined">{t("admin.approvals.refund.declined")}</option>
                            <option value="credited">{t("admin.approvals.refund.credited")}</option>
                          </select>
                        </label>
                        <label className="span-2">
                          <span>{t("admin.approvals.adminNote")}</span>
                          <textarea value={draft?.admin_note || ""} onChange={(event) => updateDraft(post.rejection.id, { admin_note: event.target.value })} />
                        </label>
                        <button type="button" className="admin-primary-button" disabled={savingId === post.rejection.id} onClick={() => saveReview(post.rejection.id)}>
                          {savingId === post.rejection.id ? <LoaderCircle className="admin-spin" size={16} /> : <Save size={16} />}
                          {t("admin.approvals.saveReview")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </AppLayout>
  );
}
