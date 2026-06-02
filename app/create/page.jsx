"use client";

import { useState } from "react";
import AppLayout from "../../components/AppLayout";

export default function CreatePost() {
  const [idea, setIdea] = useState("");
  const [generatedPost, setGeneratedPost] = useState("");

  function generateDraft() {
    if (!idea.trim()) {
      setGeneratedPost("Write a short idea first, then Vifsy can generate a post.");
      return;
    }

    setGeneratedPost(
      `🚀 New update from our business!\n\n${idea}\n\nWe are excited to share this with our customers and community. Stay tuned for more updates, offers and useful content.\n\n#business #socialmedia #update`
    );
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
          <h3>Tell Vifsy what you want to post</h3>
          <p>
            Start by describing your offer, news, product or idea. Vifsy will
            create a simple draft you can later improve, save or schedule.
          </p>
        </div>

        <div className="prompt-box">
          <label>Post idea</label>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="Example: We want to promote our new lunch menu this week..."
          />

          <button className="primary-button full" onClick={generateDraft}>
            Generate draft
          </button>
        </div>
      </section>

      {generatedPost && (
        <section className="result-card">
          <div className="result-header">
            <div>
              <p className="eyebrow">Generated draft</p>
              <h3>Your post</h3>
            </div>
            <button
              className="secondary-button"
              onClick={() => navigator.clipboard.writeText(generatedPost)}
            >
              Copy text
            </button>
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
