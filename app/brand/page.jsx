"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

export default function BrandProfile() {
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [user, setUser] = useState(null);
  const [profileHasBeenLoaded, setProfileHasBeenLoaded] = useState(false);

  const [lastAnalyzedWebsiteUrl, setLastAnalyzedWebsiteUrl] = useState("");
  const [lastAnalyzedBrandDescription, setLastAnalyzedBrandDescription] =
    useState("");

  const normalizedWebsiteUrl = useMemo(() => {
    return normalizeWebsiteUrl(websiteUrl);
  }, [websiteUrl]);

  const hasGeneratedProfile = useMemo(() => {
    return Boolean(industry.trim() || targetAudience.trim());
  }, [industry, targetAudience]);

  const shouldAnalyzeWebsite = useMemo(() => {
    if (hasNoWebsite) return false;
    if (!normalizedWebsiteUrl) return false;

    return normalizedWebsiteUrl !== lastAnalyzedWebsiteUrl;
  }, [hasNoWebsite, normalizedWebsiteUrl, lastAnalyzedWebsiteUrl]);

  const shouldAnalyzeDescription = useMemo(() => {
    if (!hasNoWebsite) return false;
    if (!brandDescription.trim()) return false;

    return brandDescription.trim() !== lastAnalyzedBrandDescription;
  }, [hasNoWebsite, brandDescription, lastAnalyzedBrandDescription]);

  const shouldAnalyze = shouldAnalyzeWebsite || shouldAnalyzeDescription;

  const mainButtonLabel = useMemo(() => {
    if (saving) return "Saving...";
    if (analyzing) return "Analyzing...";

    if (shouldAnalyzeWebsite) return "Save and analyze website";
    if (shouldAnalyzeDescription) return "Save and analyze description";

    return "Save";
  }, [saving, analyzing, shouldAnalyzeWebsite, shouldAnalyzeDescription]);

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
        const loadedWebsiteUrl = data.website_url || "";
        const loadedBrandDescription = data.brand_description || "";

        setBusinessName(data.business_name || "");
        setWebsiteUrl(loadedWebsiteUrl);
        setBrandDescription(loadedBrandDescription);
        setIndustry(data.industry || "");
        setTargetAudience(data.target_audience || "");

        setLastAnalyzedWebsiteUrl(normalizeWebsiteUrl(loadedWebsiteUrl));
        setLastAnalyzedBrandDescription(loadedBrandDescription.trim());

        if (!loadedWebsiteUrl && loadedBrandDescription) {
          setHasNoWebsite(true);
        }

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

  function handleNoWebsiteChange(event) {
    const checked = event.target.checked;

    setHasNoWebsite(checked);
    setMessage("");

    if (checked) {
      setWebsiteUrl("");
    }
  }

  async function handleMainSave() {
    if (!user) return;

    if (shouldAnalyze) {
      await analyzeBrand();
      return;
    }

    await saveProfile();
  }

  async function analyzeBrand() {
    setMessage("");

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = brandDescription.trim();

    if (!trimmedBusinessName) {
      setMessage("Add your business name first.");
      return;
    }

    if (!hasNoWebsite && !normalizedWebsiteUrl) {
      setMessage("Add a website URL, or select that you do not have a website.");
      return;
    }

    if (hasNoWebsite && !trimmedDescription) {
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
          websiteUrl: hasNoWebsite ? "" : normalizedWebsiteUrl,
          brandDescription: hasNoWebsite ? trimmedDescription : "",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not analyze brand.");
      }

      const profile = result.profile || {};

      setBusinessName(profile.business_name || trimmedBusinessName);
      setWebsiteUrl(profile.website_url || result.website_url || normalizedWebsiteUrl);
      setBrandDescription(profile.brand_description || trimmedDescription);
      setIndustry(profile.industry || "");
      setTargetAudience(profile.target_audience || "");
      setProfileHasBeenLoaded(true);

      setLastAnalyzedWebsiteUrl(
        hasNoWebsite ? "" : normalizeWebsiteUrl(profile.website_url || result.website_url || normalizedWebsiteUrl)
      );
      setLastAnalyzedBrandDescription(hasNoWebsite ? trimmedDescription : "");

      setMessage(
        hasNoWebsite
          ? "Brand description analyzed and saved."
          : "Website analyzed and saved."
      );
    } catch (error) {
      setMessage(error.message || "Could not analyze brand.");
    }

    setAnalyzing(false);
  }

  async function saveProfile() {
    if (!user) return;

    const trimmedBusinessName = businessName.trim();

    if (!trimmedBusinessName) {
      setMessage("Add your business name first.");
      return;
    }

    setSaving(true);
    setMessage("");

    const finalWebsiteUrl = hasNoWebsite ? "" : normalizeWebsiteUrl(websiteUrl);

    const { error } = await supabase.from("brand_profiles").upsert(
      {
        user_id: user.id,
        business_name: trimmedBusinessName,
        website_url: finalWebsiteUrl,
        brand_description: hasNoWebsite ? brandDescription.trim() : "",
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
      setWebsiteUrl(finalWebsiteUrl);
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
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Business context</p>
          <h3>Set up your brand profile</h3>

          <p>
            Spreelo uses this profile to understand your business, your audience
            and what kind of content it should create.
          </p>

          <div className="mini-info-card">
            <strong>Start simple</strong>
            <p>
              Add your business name and website. If you do not have a website,
              describe the business manually instead.
            </p>
          </div>
        </div>

        <div className="prompt-box">
          <label>Business name</label>
          <input
            className="input"
            placeholder="Example: Your Company"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            disabled={analyzing || saving}
          />

          <label>Website URL</label>
          <input
            className="input"
            placeholder="Example: https://www.yourbusiness.com"
            value={websiteUrl}
            onChange={(event) => {
              setWebsiteUrl(event.target.value);
              setHasNoWebsite(false);
              setMessage("");
            }}
            disabled={hasNoWebsite || analyzing || saving}
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hasNoWebsite}
              onChange={handleNoWebsiteChange}
              disabled={analyzing || saving}
            />
            <span>I do not have a website</span>
          </label>

          {hasNoWebsite && (
            <>
              <label>Describe your business</label>
              <textarea
                className="input prompt-textarea"
                placeholder="Describe what the business does, what you offer, who your customers are, what style or tone you want, and what Spreelo should know before creating posts."
                value={brandDescription}
                onChange={(event) => {
                  setBrandDescription(event.target.value);
                  setMessage("");
                }}
                disabled={analyzing || saving}
              />
            </>
          )}

          {hasGeneratedProfile && (
            <>
              <label>Industry</label>
              <textarea
                className="input prompt-textarea"
                placeholder="Example: Local service business helping homeowners with..."
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                disabled={analyzing || saving}
              />

              <label>Target audience</label>
              <textarea
                className="input prompt-textarea"
                placeholder="Example: Customers who need..."
                value={targetAudience}
                onChange={(event) => setTargetAudience(event.target.value)}
                disabled={analyzing || saving}
              />
            </>
          )}

          <button
            className="primary-button full"
            type="button"
            onClick={handleMainSave}
            disabled={saving || analyzing}
          >
            {mainButtonLabel}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>
    </AppLayout>
  );
}
