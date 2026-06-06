"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";

export default function EditPostPage() {
  const params = useParams();
  const postId = params.id;

  const [post, setPost] = useState(null);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          "id, platform, tone, language, post_type, idea, content, status, created_at"
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

    const { error } = await supabase
      .from("posts")
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Post updated.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <AppLayout active="dashboard">
        <section className="empty-card">
          <h3>Loading post...</h3>
          <p>Please wait while Spreelo loads your draft.</p>
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

  return (
    <AppLayout active="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">Edit draft</p>
          <h2>Edit your saved post</h2>
        </div>

        <div className="button-row">
          <a className="secondary-button" href="/">
            Back
          </a>
          <button
            className="secondary-button"
            onClick={() => navigator.clipboard.writeText(content)}
          >
            Copy text
          </button>
          <button
            className="primary-button"
            onClick={savePost}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </header>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">
              {post.platform} · {post.post_type}
            </p>
            <h3>
              {post.tone} · {post.language}
            </h3>
          </div>
          <span className="status-pill">{post.status}</span>
        </div>

        <div className="edit-post-grid">
          <div>
            <label className="field-label">Original idea</label>
            <div className="idea-box">
              {post.idea || "No original idea saved."}
            </div>
          </div>

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
