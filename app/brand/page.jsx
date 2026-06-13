"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

export default function BrandProfile() {
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [user, setUser] = useState(null);
  const [profileHasBeenLoaded, setProfileHasBeenLoaded] = useState(false);

  const hasUsefulProfile = useMemo(() => {
    return Boolean(
      businessName.trim() && industry.trim() && targetAudience.trim()
    );
  }, [businessName, industry, targetAudience]);

  const shouldShowProfileFields = profileHasBeenLoaded || hasUsefulProfile;

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
        .select(
          "business_name, website_url, brand_description, industry, target_audience"
        )
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        setMessage(error.message);
      }

      if (data) {
        setBusinessName(data.business_name || "");
        setWebsiteUrl(data.website_url || "");
        setBrandDescription(data.brand_description || "");
        setIndustry(data.industry || "");
        setTargetAudience(data.target_audience || "");

        if (
          data.business_name ||
          data.industry ||
          data.target_audience ||
          data.website_url ||
          data.brand_description
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

  async function analyzeBrand(source) {
    setMessage("");

    const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
    const trimmedDescription = brandDescription.trim();

    if (source === "website" && !normalizedWebsiteUrl) {
      setMessage("Add a website URL first.");
      return;
    }

    if (source === "description" && !trimmedDescription) {
      setMessage("Describe your business first.");
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
          websiteUrl: source === "website" ? normalizedWebsiteUrl : "",
          brandDescription: trimmedDescription,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not analyze brand.");
      }

      const profile = result.profile || {};

      setWebsiteUrl(profile.website_url || result.website_url || normalizedWebsiteUrl);
      setBrandDescription(profile.brand_description || trimmedDescription);
      setBusinessName(profile.business_name || "");
      setIndustry(profile.industry || "");
      setTargetAudience(profile.target_audience || "");
      setProfileHasBeenLoaded(true);

      setMessage(
        source === "website"
          ? "Website analyzed and brand profile saved."
          : "Description analyzed and brand profile saved."
      );
    } catch (error) {
      setMessage(error.message || "Could not analyze brand.");
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
        brand_description: brandDescription.trim(),
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
              : "Start with a website or description"}
          </h3>

          <p>
            {shouldShowProfileFields
              ? "Spreelo uses this profile to create posts that match your business, audience and offers."
              : "Add a website if you have one, or describe the business manually. Spreelo can build the profile from either source."}
          </p>

          <div className="mini-info-card">
            <strong>
              {shouldShowProfileFields
                ? "You can edit everything"
                : "Works without a website"}
            </strong>
            <p>
              {shouldShowProfileFields
                ? "Change the fields if needed, then save your updated brand profile."
                : "Useful for artists, creators, local businesses, clubs and companies without a website."}
            </p>
          </div>
        </div>

        <div className="prompt-box">
          <label>Website URL optional</label>
          <input
            className="input"
            placeholder="Example: https://www.yourbusiness.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            disabled={analyzing || saving}
          />

          <label>Describe your brand optional</label>
          <textarea
            className="input prompt-textarea"
            placeholder="Example: Cavero is a melodic EDM artist project inspired by Avicii, Alan Walker and Martin Garrix. The audience is people who enjoy emotional dance music, festival sounds and radio-friendly electronic pop."
            value={brandDescription}
            onChange={(event) => setBrandDescription(event.target.value)}
            disabled={analyzing || saving}
          />

          {!shouldShowProfileFields && (
            <>
              <button
                className="primary-button full"
                type="button"
                onClick={() => analyzeBrand("website")}
                disabled={analyzing || saving}
              >
                {analyzing ? "Analyzing..." : "Analyze website"}
              </button>

              <button
                className="secondary-button full"
                type="button"
                onClick={() => analyzeBrand("description")}
                disabled={analyzing || saving}
              >
                {analyzing ? "Generating..." : "Generate from description"}
              </button>
            </>
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
                onClick={() => analyzeBrand("website")}
                disabled={analyzing || saving}
              >
                {analyzing ? "Re-analyzing..." : "Re-analyze website"}
              </button>

              <button
                className="secondary-button full"
                type="button"
                onClick={() => analyzeBrand("description")}
                disabled={analyzing || saving}
              >
                {analyzing
                  ? "Regenerating..."
                  : "Regenerate from description"}
              </button>
            </>
          )}

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>
    </AppLayout>
  );
}
