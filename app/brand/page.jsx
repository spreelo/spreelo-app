"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

export default function BrandProfile() {
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [user, setUser] = useState(null);
  const [profileHasBeenLoaded, setProfileHasBeenLoaded] = useState(false);

  const hasCompleteProfile = useMemo(() => {
    return Boolean(
      businessName.trim() &&
        websiteUrl.trim() &&
        industry.trim() &&
        targetAudience.trim()
    );
  }, [businessName, websiteUrl, industry, targetAudience]);

  const shouldShowProfileFields = profileHasBeenLoaded || hasCompleteProfile;

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("brand_profiles")
        .select("business_name, website_url, industry, target_audience")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        setMessage(error.message);
      }

      if (data) {
        setBusinessName(data.business_name || "");
        setWebsiteUrl(data.website_url || "");
        setIndustry(data.industry || "");
        setTargetAudience(data.target_audience || "");

        if (
          data.business_name ||
          data.industry ||
          data.target_audience ||
          data.website_url
        ) {
          setProfileHasBeenLoaded(true);
        }
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  function normalizeWebsiteUrl(value) {
    const trimmedValue = String(value || "").trim();

    if (!trimmedValue) {
      return "";
    }

    if (
      trimmedValue.startsWith("http://") ||
      trimmedValue.startsWith("https://")
    ) {
      return trimmedValue;
    }

    return `https://${trimmedValue}`;
  }

  async function analyzeAndSaveWebsite() {
    setMessage("");

    const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

    if (!normalizedWebsiteUrl) {
      setMessage("Add a website URL first.");
      return;
    }

    setAnalyzing(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          websiteUrl: normalizedWebsiteUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not analyze website.");
      }

      const profile = result.profile || {};

      setWebsiteUrl(profile.website_url || result.website_url || normalizedWebsiteUrl);
      setBusinessName(profile.business_name || "");
      setIndustry(profile.industry || "");
      setTargetAudience(profile.target_audience || "");
      setProfileHasBeenLoaded(true);

      setMessage("Website analyzed and brand profile saved.");
    } catch (error) {
      setMessage(error.message || "Could not analyze website.");
    }

    setAnalyzing(false);
  }

  async function saveProfile() {
    if (!user) return;

    setSaving(true);
    setMessage("");

    const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

    const { error } = await supabase.from("brand_profiles").upsert(
      {
        user_id: user.id,
        business_name: businessName.trim(),
        website_url: normalizedWebsiteUrl,
        industry: industry.trim(),
        target_audience: targetAudience.trim(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      setMessage(error.message);
    } else {
      setWebsiteUrl(normalizedWebsiteUrl);
      setProfileHasBeenLoaded(true);
      setMessage("Brand profile saved.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <AppLayout active="brand">
        <section className="empty-card">
          <h3>Loading brand profile...</h3>
          <p>Please wait while Spreelo loads your business information.</p>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="brand">
      <header className="topbar">
        <div>
          <p className="eyebrow">Brand profile</p>
          <h2>Teach Spreelo about your business</h2>
        </div>

        {shouldShowProfileFields && (
          <button
            className="primary-button"
            onClick={saveProfile}
            disabled={saving || analyzing}
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        )}
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Business context</p>
          <h3>
            {shouldShowProfileFields
              ? "Review your brand profile"
              : "Start with your website"}
          </h3>

          <p>
            {shouldShowProfileFields
              ? "Spreelo uses this profile to create posts that match your business, audience and offers."
              : "Add your website and Spreelo will analyze it, create your brand profile and save it automatically."}
          </p>

          <div className="mini-info-card">
            <strong>
              {shouldShowProfileFields
                ? "You can edit everything"
                : "One click setup"}
            </strong>
            <p>
              {shouldShowProfileFields
                ? "Change the fields if needed, then save your updated brand profile."
                : "Spreelo will detect what the business does and describe the audience in the same language as the website."}
            </p>
          </div>
        </div>

        <div className="prompt-box">
          <label>Website URL</label>
          <input
            className="input"
            placeholder="Example: https://www.yourbusiness.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            disabled={analyzing || saving}
          />

          {!shouldShowProfileFields && (
            <button
              className="primary-button full"
              type="button"
              onClick={analyzeAndSaveWebsite}
              disabled={analyzing || saving}
            >
              {analyzing
                ? "Analyzing and saving..."
                : "Analyze and save brand profile"}
            </button>
          )}

          {shouldShowProfileFields && (
            <>
              <label>Business name</label>
              <input
                className="input"
                placeholder="Example: Spreelo"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                disabled={analyzing || saving}
              />

              <label>Industry</label>
              <textarea
                className="input prompt-textarea"
                placeholder="Example: Online pet store selling food, toys and accessories..."
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                disabled={analyzing || saving}
              />

              <label>Target audience</label>
              <textarea
                className="input prompt-textarea"
                placeholder="Example: Pet owners who want quality products and convenient online shopping..."
                value={targetAudience}
                onChange={(event) => setTargetAudience(event.target.value)}
                disabled={analyzing || saving}
              />

              <button
                className="primary-button full"
                onClick={saveProfile}
                disabled={saving || analyzing}
              >
                {saving ? "Saving..." : "Save brand profile"}
              </button>

              <button
                className="secondary-button full"
                type="button"
                onClick={analyzeAndSaveWebsite}
                disabled={analyzing || saving}
              >
                {analyzing ? "Re-analyzing..." : "Re-analyze website"}
              </button>
            </>
          )}

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>
    </AppLayout>
  );
}
