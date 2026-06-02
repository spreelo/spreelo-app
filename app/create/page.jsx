"use client";

import { useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

export default function CreatePost() {
  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("English");
  const [postType, setPostType] = useState("Offer");
  const [generatedPost, setGeneratedPost] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function generateDraft() {
    setMessage("");
    setGeneratedPost("");

    if (!idea.trim()) {
      setMessage("Write a short idea first, then Vifsy can generate a post.");
      return;
    }

    setGenerating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    try {
      const response = await fetch("/api/generate-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          idea,
          platform,
          tone,
          language,
          postType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Could not generate post.");
        setGenerating(false);
        return;
      }

      setGeneratedPost(data.content || "");
    } catch (error) {
      setMessage(error.message || "Something went wrong.");
    }

    setGenerating(false);
  }

  async function saveDraft() {
    setMessage("");

    if (!generatedPost.trim()) {
      setMessage("Generate a post before saving.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      platform,
      tone,
      language,
      post_type: postType,
      idea,
      content: generatedPost,
      status: "draft",
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Draft saved.");
    }

    setSaving(false);
  }

  return (
    <AppLayout active="create">
      <header className="topbar">
        <div>
          <p className="eyebrow">Create post</p>
          <h2>Generate social media content</h2>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">AI assistant</p>
          <h3>Build a post draft</h3>
          <p>
            Choose platform, tone, language and post type. Vifsy will use your
            brand profile to create a real AI-generated draft.
          </p>
        </div>

        <div className="prompt-box">
          <div className="form-grid">
            <div>
              <label>Platform</label>
              <select
                className="input"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option>Instagram</option>
                <option>Facebook</option>
                <option>LinkedIn</option>
              </select>
            </div>

            <div>
              <label>Tone</label>
              <select
                className="input"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              >
                <option>Friendly</option>
                <option>Professional</option>
                <option>Sales-focused</option>
                <option>Premium</option>
              </select>
            </div>

            <div>
              <label>Language</label>
              <select
                className="input"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option>English</option>
                <option>Swedish</option>
              </select>
            </div>

            <div>
              <label>Post type</label>
              <select
                className="input"
                value={postType}
                onChange={(event) => setPostType(event.target.value)}
              >
                <option>Offer</option>
                <option>News</option>
                <option>Educational</option>
                <option>Reminder</option>
              </select>
            </div>
          </div>

          <label>Post idea</label>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="Example: We want to promote our new lunch menu this week..."
          />

          <button
            className="primary-button full"
            onClick={generateDraft}
            disabled={generating}
          >
            {generating ? "Generating..." : "Generate AI draft"}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>

      {generatedPost && (
        <section className="result-card">
          <div className="result-header">
            <div>
              <p className="eyebrow">Generated draft</p>
              <h3>Your post</h3>
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => navigator.clipboard.writeText(generatedPost)}
              >
                Copy text
              </button>

              <button
                className="primary-button"
                onClick={saveDraft}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save draft"}
              </button>
            </div>
          </div>

          <div className="post-preview">
            {generatedPost.split("\n").map((line, index) => (
              <p key={index}>{line || "\u00A0"}</p>
            ))}
          </div>
        </section>
      )}
    </AppLayout>
  );
}
