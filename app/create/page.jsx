"use client";

import { useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const platformOptions = ["Instagram", "Facebook", "LinkedIn"];
const toneOptions = ["Friendly", "Professional", "Sales-focused", "Premium"];
const languageOptions = ["English", "Swedish"];
const postTypeOptions = ["Offer", "News", "Educational", "Reminder"];
const lengthOptions = ["Short", "Medium", "Long"];
const ctaTypeOptions = [
  "Learn more",
  "Visit website",
  "Contact us",
  "Book now",
  "Shop now",
];

export default function CreatePost() {
  const { t } = useUiText(["create"]);

  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("English");
  const [postType, setPostType] = useState("Offer");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [length, setLength] = useState("Medium");
  const [ctaType, setCtaType] = useState("Learn more");
  const [includeEmojis, setIncludeEmojis] = useState(true);
  const [includeHashtags, setIncludeHashtags] = useState(true);

  const [generatedPost, setGeneratedPost] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function generateDraft() {
    setMessage("");
    setGeneratedPost("");

    if (!idea.trim()) {
      setMessage(t("create.errorIdeaRequired"));
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
          websiteUrl,
          length,
          includeEmojis,
          includeHashtags,
          ctaType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || t("create.errorGenerate"));
        setGenerating(false);
        return;
      }

      setGeneratedPost(data.content || "");
    } catch (error) {
      setMessage(error.message || t("create.errorGeneric"));
    }

    setGenerating(false);
  }

  async function saveDraft() {
    setMessage("");

    if (!generatedPost.trim()) {
      setMessage(t("create.errorSaveBeforeGenerate"));
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
      website_url: websiteUrl,
      length,
      include_emojis: includeEmojis,
      include_hashtags: includeHashtags,
      cta_type: ctaType,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(t("create.draftSaved"));
    }

    setSaving(false);
  }

  return (
    <AppLayout active="create">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t("create.eyebrow")}</p>
          <h2>{t("create.title")}</h2>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{t("create.assistantEyebrow")}</p>
          <h3>{t("create.assistantTitle")}</h3>
          <p>{t("create.assistantText")}</p>
        </div>

        <div className="prompt-box">
          <div className="form-grid">
            <div>
              <label>{t("create.platform")}</label>
              <select
                className="input"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                {platformOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`create.platform.${option}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>{t("create.tone")}</label>
              <select
                className="input"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              >
                {toneOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`create.tone.${option}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>{t("create.language")}</label>
              <select
                className="input"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {languageOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`create.language.${option}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>{t("create.postType")}</label>
              <select
                className="input"
                value={postType}
                onChange={(event) => setPostType(event.target.value)}
              >
                {postTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`create.postType.${option}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>{t("create.length")}</label>
              <select
                className="input"
                value={length}
                onChange={(event) => setLength(event.target.value)}
              >
                {lengthOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`create.length.${option}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>{t("create.ctaType")}</label>
              <select
                className="input"
                value={ctaType}
                onChange={(event) => setCtaType(event.target.value)}
              >
                {ctaTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`create.ctaType.${option}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label>{t("create.websiteUrl")}</label>
          <input
            className="input"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder={t("create.websiteUrlPlaceholder")}
          />

          <label>{t("create.postIdea")}</label>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={t("create.postIdeaPlaceholder")}
          />

          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={includeEmojis}
                onChange={(event) => setIncludeEmojis(event.target.checked)}
              />
              {t("create.includeEmojis")}
            </label>

            <label>
              <input
                type="checkbox"
                checked={includeHashtags}
                onChange={(event) => setIncludeHashtags(event.target.checked)}
              />
              {t("create.includeHashtags")}
            </label>
          </div>

          <button
            className="primary-button full"
            onClick={generateDraft}
            disabled={generating}
          >
            {generating ? t("create.generating") : t("create.generateDraft")}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>

      {generatedPost && (
        <section className="result-card">
          <div className="result-header">
            <div>
              <p className="eyebrow">{t("create.generatedEyebrow")}</p>
              <h3>{t("create.yourPost")}</h3>
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => navigator.clipboard.writeText(generatedPost)}
              >
                {t("create.copyText")}
              </button>

              <button
                className="primary-button"
                onClick={saveDraft}
                disabled={saving}
              >
                {saving ? t("create.saving") : t("create.saveDraft")}
              </button>
            </div>
          </div>

          <div className="post-preview">
            {generatedPost.split("
").map((line, index) => (
              <p key={index}>{line || " "}</p>
            ))}
          </div>
        </section>
      )}
    </AppLayout>
  );
}
