"use client";

import { useState } from "react";
import AppLayout from "../../components/AppLayout";

export default function CreatePost() {
  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("English");
  const [postType, setPostType] = useState("Offer");
  const [generatedPost, setGeneratedPost] = useState("");

  function generateDraft() {
    if (!idea.trim()) {
      setGeneratedPost("Write a short idea first, then Vifsy can generate a post.");
      return;
    }

    const isSwedish = language === "Swedish";

    const intro = isSwedish
      ? `✨ Nytt inlägg för ${platform}`
      : `✨ New ${platform} post`;

    const toneLine = isSwedish
      ? `Ton: ${tone.toLowerCase()} · Typ: ${postType.toLowerCase()}`
      : `Tone: ${tone.toLowerCase()} · Type: ${postType.toLowerCase()}`;

    const body = isSwedish
      ? `Vi vill lyfta detta på ett tydligt och engagerande sätt:\n\n${idea}\n\nDet här är ett perfekt tillfälle att påminna våra följare, skapa intresse och få fler att agera.`
      : `We want to highlight this in a clear and engaging way:\n\n${idea}\n\nThis is a great opportunity to remind our audience, create interest and encourage people to take action.`;

    const callToAction = isSwedish
      ? "👉 Kontakta oss eller besök oss för att veta mer."
      : "👉 Contact us or visit us to learn more.";

    const hashtags = isSwedish
      ? "#företag #socialamedier #erbjudande"
      : "#business #socialmedia #marketing";

    setGeneratedPost(`${intro}\n${toneLine}\n\n${body}\n\n${callToAction}\n\n${hashtags}`);
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
            Choose platform, tone, language and post type. Vifsy will create a
            simple draft that can later be improved with real AI.
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
