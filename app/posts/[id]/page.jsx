"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";

function formatDate(value) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status) {
  if (!status) return "Draft";

  const labels = {
    draft: "Draft",
    pending_approval: "Pending approval",
    approved: "Approved",
    scheduled: "Scheduled",
    published: "Published",
    failed: "Failed",
    rejected: "Discarded",
  };

  return labels[status] || status;
}

function formatImageStatus(status) {
  if (!status || status === "none") return null;

  const labels = {
    generating: "Image generating",
    ready: "Image ready",
    failed: "Image failed",
  };

  return labels[status] || status;
}

function getStatusClass(status) {
  if (status === "pending_approval") return "status-pill warning";
  if (status === "approved") return "status-pill success";
  if (status === "published") return "status-pill success";
  if (status === "failed") return "status-pill danger";
  if (status === "rejected") return "status-pill danger";

  return "status-pill";
}

function getImageStatusClass(status) {
  if (status === "ready") return "status-pill success";
  if (status === "generating") return "status-pill warning";
  if (status === "failed") return "status-pill danger";

  return "status-pill";
}

export default function EditPostPage() {
  const params = useParams();
  const postId = params.id;

  const [post, setPost] = useState(null);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    async function loadPost() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt"
        )
        .eq("id", postId)
        .eq("user_id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
      }

      if (data) {
        setPost(data);
        setContent(data.content || "");
      }

      setLoading(false);
    }

    if (postId) {
      loadPost();
    }
  }, [postId]);

  async function savePost() {
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("posts")
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .select(
        "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt"
      )
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setPost(data);
      setContent(data.content || "");
      setMessage("Post updated.");
    }

    setSaving(false);
  }

  async function approvePost() {
    const confirmApprove = window.confirm(
      "Approve this post? After approval, Spreelo will publish it automatically within a few minutes if the selected platform is connected."
    );

    if (!confirmApprove) return;

    setApproving(true);
    setMessage("");

    const approvedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("posts")
      .update({
        content,
        status: "approved",
        approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq("id", postId)
      .select(
        "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt"
      )
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setPost(data);
      setContent(data.content || "");
      setMessage(
        "Post approved. Spreelo will publish it automatically within a few minutes if the selected platform is connected."
      );
    }

    setApproving(false);
  }

  async function discardPost() {
    const confirmDiscard = window.confirm(
      "Discard this post? It will disappear from pending approval and will not be published."
    );

    if (!confirmDiscard) return;

    setDiscarding(true);
    setMessage("");

    const discardedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("posts")
      .update({
        status: "rejected",
        updated_at: discardedAt,
      })
      .eq("id", postId)
      .select(
        "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt"
      )
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setPost(data);
      setContent(data.content || "");
      setMessage("Post discarded. It will not be published.");
    }

    setDiscarding(false);
  }

  if (loading) {
    return (
      <AppLayout active="dashboard">
        <section className="empty-card">
          <h3>Loading post...</h3>
          <p>Please wait while Spreelo loads your post.</p>
        </section>
      </AppLayout>
    );
  }

  if (!post) {
    return (
      <AppLayout active="dashboard">
        <section className="empty-card">
          <h3>Post not found</h3>
          <p>This post could not be found or you do not have access to it.</p>
          <br />
          <a className="primary-button" href="/">
            Back to dashboard
          </a>
        </section>
      </AppLayout>
    );
  }

  const isPendingApproval = post.status === "pending_approval";
  const isAutomationPost = post.source === "automation";
  const sourceLabel =
    post.source_label ||
    (isAutomationPost ? "Generated by automation" : "Manual draft");

  const imageStatusLabel = formatImageStatus(post.image_status);

  return (
    <AppLayout active="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {isPendingApproval ? "Review post" : "Edit post"}
          </p>
          <h2>
            {isPendingApproval
              ? "Review and approve this post"
              : "Edit your saved post"}
          </h2>
        </div>

        <div className="button-row">
          <a className="secondary-button" href="/">
            Back
          </a>

          <button
            type="button"
            className="secondary-button"
            onClick={() => navigator.clipboard.writeText(content)}
          >
            Copy text
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={savePost}
            disabled={saving || approving || discarding}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          {isPendingApproval && (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={discardPost}
                disabled={saving || approving || discarding}
              >
                {discarding ? "Discarding..." : "Discard"}
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={approvePost}
                disabled={saving || approving || discarding}
              >
                {approving ? "Approving..." : "Approve"}
              </button>
            </>
          )}
        </div>
      </header>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">
              {post.platform || "Platform not set"} ·{" "}
              {post.post_type || "Post"}
            </p>
            <h3>
              {post.tone || "Tone not set"} ·{" "}
              {post.language || "Language not set"}
            </h3>
          </div>

          <div className="post-meta-row">
            <span className={getStatusClass(post.status)}>
              {formatStatus(post.status)}
            </span>

            {isAutomationPost && (
              <span className="status-pill">Generated by automation</span>
            )}

            {imageStatusLabel && (
              <span className={getImageStatusClass(post.image_status)}>
                {imageStatusLabel}
              </span>
            )}
          </div>
        </div>

        <div className="idea-box">
          <p>
            <strong>Source:</strong> {sourceLabel}
          </p>

          <p>
            <strong>Created:</strong> {formatDate(post.created_at)}
          </p>

          {post.scheduled_for && (
            <p>
              <strong>Scheduled/generated for:</strong>{" "}
              {formatDate(post.scheduled_for)}
            </p>
          )}

          {post.approved_at && (
            <p>
              <strong>Approved:</strong> {formatDate(post.approved_at)}
            </p>
          )}

          {post.published_at && (
            <p>
              <strong>Published:</strong> {formatDate(post.published_at)}
            </p>
          )}

          {isPendingApproval && (
            <p>
              <strong>Note:</strong> After approval, Spreelo will publish this
              post automatically within a few minutes if the selected platform is
              connected.
            </p>
          )}

          {post.status === "rejected" && (
            <p>
              <strong>Note:</strong> This post was discarded and will not be
              published.
            </p>
          )}
        </div>

        {post.image_url && (
          <div className="edit-post-image-block">
            <div className="edit-post-image-header">
              <div>
                <label className="field-label">Generated image</label>
                <p>
                  This is the image that will be used together with the post
                  content.
                </p>
              </div>

              {post.image_url && (
                <a
                  className="secondary-button small-button"
                  href={post.image_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open image
                </a>
              )}
            </div>

            <img src={post.image_url} alt="Generated post image" />
          </div>
        )}

        {!post.image_url && imageStatusLabel && (
          <div className="idea-box">
            <p>
              <strong>Image status:</strong> {imageStatusLabel}
            </p>
          </div>
        )}

        <div className="edit-post-grid">
          {post.idea && (
            <div>
              <label className="field-label">Original idea</label>
              <div className="idea-box">{post.idea}</div>
            </div>
          )}

          <div>
            <label className="field-label">Post content</label>
            <textarea
              className="large-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>

        {message && <p className="login-message">{message}</p>}
      </section>
    </AppLayout>
  );
}
