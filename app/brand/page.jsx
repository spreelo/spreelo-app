"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

export default function BrandProfile() {
  const [brandProfileId, setBrandProfileId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [showGeneratedFields, setShowGeneratedFields] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [user, setUser] = useState(null);

  const [lastAnalyzedWebsiteUrl, setLastAnalyzedWebsiteUrl] = useState("");
  const [lastAnalyzedBrandDescription, setLastAnalyzedBrandDescription] =
    useState("");

  const normalizedWebsiteUrl = useMemo(() => {
    return normalizeWebsiteUrl(websiteUrl);
  }, [websiteUrl]);

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

      const selectedBrandId =
        typeof window !== "undefined"
          ? localStorage.getItem(getBrandStorageKey(user.id))
          : "";

      let brandQuery = supabase
        .from("brand_profiles")
        .select(
          "id, business_name, website_url, brand_description, industry, target_audience, is_default, created_at"
        )
        .eq("user_id", user.id);

      if (selectedBrandId) {
        brandQuery = brandQuery.eq("id", selectedBrandId).maybeSingle();
      } else {
        brandQuery = brandQuery
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
      }

      const { data, error } = await brandQuery;

      if (error && error.code !== "PGRST116") {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setMessage("No brand profile found. Create a brand from the sidebar.");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(user.id), data.id);
      }

      const loadedWebsiteUrl = data.website_url || "";
      const loadedBrandDescription = data.brand_description || "";
      const loadedIndustry = data.industry || "";
      const loadedTargetAudience = data.target_audience || "";

      setBrandProfileId(data.id);
      setBusinessName(data.business_name || "");
      setWebsiteUrl(loadedWebsiteUrl);
      setBrandDescription(loadedBrandDescription);
      setIndustry(loadedIndustry);
      setTargetAudience(loadedTargetAudience);

      setLastAnalyzedWebsiteUrl(normalizeWebsiteUrl(loadedWebsiteUrl));
      setLastAnalyzedBrandDescription(loadedBrandDescription.trim());

      if (!loadedWebsiteUrl && loadedBrandDescription) {
        setHasNoWebsite(true);
      } else {
        setHasNoWebsite(false);
      }

      if (loadedIndustry || loadedTargetAudience) {
        setShowGeneratedFields(true);
      } else {
        setShowGeneratedFields(false);
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
    setShowGeneratedFields(false);

    if (checked) {
      setWebsiteUrl("");
      setIndustry("");
      setTargetAudience("");
    } else {
      setBrandDescription("");
      setIndustry("");
      setTargetAudience("");
    }
  }

  async function handleMainSave() {
    if (!user || !brandProfileId) return;

    if (shouldAnalyze || !showGeneratedFields) {
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
          brandProfileId,
          businessName: trimmedBusinessName,
          websiteUrl: hasNoWebsite ? "" : normalizedWebsiteUrl,
          brandDescription: hasNoWebsite ? trimmedDescription : "",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Could not analyze brand.");
      }

      const profile = result.profile || {};

      const finalWebsiteUrl =
        profile.website_url || result.website_url || normalizedWebsiteUrl;

      setBusinessName(profile.business_name || trimmedBusinessName);
      setWebsiteUrl(finalWebsiteUrl);
      setBrandDescription(profile.brand_description || trimmedDescription);
      setIndustry(profile.industry || "");
      setTargetAudience(profile.target_audience || "");
      setShowGeneratedFields(true);

      setLastAnalyzedWebsiteUrl(
        hasNoWebsite ? "" : normalizeWebsiteUrl(finalWebsiteUrl)
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
    if (!user || !brandProfileId) return;

    const trimmedBusinessName = businessName.trim();

    if (!trimmedBusinessName) {
      setMessage("Add your business name first.");
      return;
    }

    setSaving(true);
    setMessage("");

    const finalWebsiteUrl = hasNoWebsite ? "" : normalizeWebsiteUrl(websiteUrl);

    const { error } = await supabase
      .from("brand_profiles")
      .update({
        business_name: trimmedBusinessName,
        website_url: finalWebsiteUrl,
        brand_description: hasNoWebsite ? brandDescription.trim() : "",
        industry: industry.trim(),
        target_audience: targetAudience.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandProfileId)
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
    } else {
      setWebsiteUrl(finalWebsiteUrl);
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
            <strong>Current brand profile</strong>
            <p>
              Changes here only affect the brand selected in the sidebar. Other
              brands keep their own profile, automations and connected channels.
            </p>
          </div>
        </div>

        <div className="prompt-box">
          <label>Business name</label>
          <input
            className="input"
            placeholder="Example: Your Company"
            value={businessName}
            onChange={(event) => {
              setBusinessName(event.target.value);
              setMessage("");
            }}
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
              setShowGeneratedFields(false);
              setIndustry("");
              setTargetAudience("");
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
                placeholder="Describe what your business does, what you offer, who your customers are, what style or tone you want, and what Spreelo should know before creating posts."
                value={brandDescription}
                onChange={(event) => {
                  setBrandDescription(event.target.value);
                  setShowGeneratedFields(false);
                  setIndustry("");
                  setTargetAudience("");
                  setMessage("");
                }}
                disabled={analyzing || saving}
              />
            </>
          )}

          {showGeneratedFields && (
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
            disabled={saving || analyzing || !brandProfileId}
          >
            {mainButtonLabel}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>
    </AppLayout>
  );
}
