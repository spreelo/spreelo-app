"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

const marketOptions = [
  {
    label: "International / Global",
    countryCode: "GLOBAL",
    language: "English",
  },
  { label: "United States", countryCode: "US", language: "English" },
  { label: "United Kingdom", countryCode: "GB", language: "English" },
  { label: "Germany", countryCode: "DE", language: "German" },
  { label: "Sweden", countryCode: "SE", language: "Swedish" },
  { label: "Denmark", countryCode: "DK", language: "Danish" },
  { label: "Norway", countryCode: "NO", language: "Norwegian" },
  { label: "Finland", countryCode: "FI", language: "Finnish" },
  { label: "Netherlands", countryCode: "NL", language: "Dutch" },
  { label: "France", countryCode: "FR", language: "French" },
  { label: "Spain", countryCode: "ES", language: "Spanish" },
  { label: "Italy", countryCode: "IT", language: "Italian" },
  { label: "Canada", countryCode: "CA", language: "English" },
  { label: "Australia", countryCode: "AU", language: "English" },
  { label: "India", countryCode: "IN", language: "English" },
  { label: "United Arab Emirates", countryCode: "AE", language: "English" },
  { label: "Other", countryCode: "OTHER", language: "English" },
];

const languageOptions = [
  "English",
  "Swedish",
  "German",
  "Danish",
  "Norwegian",
  "Finnish",
  "Dutch",
  "French",
  "Spanish",
  "Italian",
  "Arabic",
  "Hindi",
  "Other",
];

const analysisProgressStages = [
  {
    progress: 8,
    title: "Reading website content",
    description: "Spreelo is fetching the website or reading your business description.",
  },
  {
    progress: 28,
    title: "Understanding your business",
    description: "Spreelo is identifying industry, audience, market and language.",
  },
  {
    progress: 48,
    title: "Checking products and services",
    description: "Spreelo is deciding if website products or services can be safely used.",
  },
  {
    progress: 70,
    title: "Building campaign opportunities",
    description: "Spreelo is preparing relevant seasonal and campaign ideas.",
  },
  {
    progress: 88,
    title: "Preparing content strategy",
    description: "Spreelo is shaping the brand profile and content direction.",
  },
];

function getCurrentAnalysisStage(progress) {
  const currentStage =
    [...analysisProgressStages]
      .reverse()
      .find((stage) => progress >= stage.progress) || analysisProgressStages[0];

  return currentStage;
}

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

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

export default function BrandProfile() {
  const [brandProfileId, setBrandProfileId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [contentMarket, setContentMarket] = useState("International / Global");
  const [countryCode, setCountryCode] = useState("GLOBAL");
  const [contentLanguage, setContentLanguage] = useState("English");
  const [showGeneratedFields, setShowGeneratedFields] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [user, setUser] = useState(null);

  const [allBrands, setAllBrands] = useState([]);
  const [deleteStep, setDeleteStep] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

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

  const isBrandProfileReady = useMemo(() => {
  const hasBusinessName = Boolean(businessName.trim());
  const hasMarketSetup = Boolean(contentMarket && countryCode && contentLanguage);
  const hasBusinessInput = hasNoWebsite
    ? Boolean(brandDescription.trim())
    : Boolean(normalizedWebsiteUrl);
  const hasAiProfile = Boolean(industry.trim() && targetAudience.trim());

  return (
    hasBusinessName &&
    hasMarketSetup &&
    hasBusinessInput &&
    hasAiProfile &&
    showGeneratedFields &&
    !shouldAnalyze
  );
}, [
  businessName,
  contentMarket,
  countryCode,
  contentLanguage,
  hasNoWebsite,
  brandDescription,
  normalizedWebsiteUrl,
  industry,
  targetAudience,
  showGeneratedFields,
  shouldAnalyze,
]);

  const mainButtonLabel = useMemo(() => {
    if (saving) return "Saving...";
    if (analyzing) return "Analyzing...";

    if (shouldAnalyzeWebsite) return "Analyze brand & create campaign calendar";
    if (shouldAnalyzeDescription)
      return "Analyze description & create campaign calendar";

    return "Save brand profile";
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

      const { data: brandListData, error: brandListError } = await supabase
        .from("brand_profiles")
        .select("id, business_name, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (brandListError) {
        setMessage(brandListError.message);
        setLoading(false);
        return;
      }

      const brands = brandListData || [];
      setAllBrands(brands);

      const selectedBrandId =
        typeof window !== "undefined"
          ? localStorage.getItem(getBrandStorageKey(user.id))
          : "";

      const selectedBrandExists = brands.some(
        (brand) => brand.id === selectedBrandId
      );

      const fallbackBrand =
        brands.find((brand) => brand.is_default) || brands[0] || null;

      const brandIdToLoad = selectedBrandExists
        ? selectedBrandId
        : fallbackBrand?.id || "";

      if (!brandIdToLoad) {
        setMessage("No brand profile found. Create a brand from the sidebar.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("brand_profiles")
        .select(
          "id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, is_default, created_at"
        )
        .eq("user_id", user.id)
        .eq("id", brandIdToLoad)
        .maybeSingle();

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

      const loadedMarket = data.content_market || "International / Global";
      const loadedCountryCode = data.country_code || "GLOBAL";
      const loadedContentLanguage = data.content_language || "English";

      setContentMarket(loadedMarket);
      setCountryCode(loadedCountryCode);
      setContentLanguage(loadedContentLanguage);

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

  useEffect(() => {
  if (!analyzing) {
    setAnalysisProgress(0);
    return;
  }

  setAnalysisProgress((currentProgress) =>
    currentProgress > 0 ? currentProgress : 4
  );

  const interval = setInterval(() => {
    setAnalysisProgress((currentProgress) => {
      if (currentProgress >= 95) return 95;

      if (currentProgress < 20) return currentProgress + 4;
      if (currentProgress < 45) return currentProgress + 3;
      if (currentProgress < 75) return currentProgress + 2;

      return currentProgress + 1;
    });
  }, 1200);

  return () => clearInterval(interval);
}, [analyzing]);
  
  function handleMarketChange(event) {
    const nextMarket = event.target.value;
    const selectedMarket = marketOptions.find(
      (market) => market.label === nextMarket
    );

    setContentMarket(nextMarket);
    setCountryCode(selectedMarket?.countryCode || "");
    setContentLanguage(selectedMarket?.language || contentLanguage || "English");
    setShowGeneratedFields(false);
    setMessage("");
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
setAnalysisProgress(0);

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = brandDescription.trim();

    if (!trimmedBusinessName) {
      setMessage("Add your business name first.");
      return;
    }

    if (!contentMarket || !countryCode) {
      setMessage("Choose the market/country this brand targets.");
      return;
    }

    if (!contentLanguage) {
      setMessage("Choose the content language for this brand.");
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

    setAnalysisProgress(4);
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
          contentMarket,
          countryCode,
          contentLanguage,
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
      setContentMarket(profile.content_market || contentMarket);
      setCountryCode(profile.country_code || countryCode);
      setContentLanguage(profile.content_language || contentLanguage);
      setShowGeneratedFields(true);

      setLastAnalyzedWebsiteUrl(
        hasNoWebsite ? "" : normalizeWebsiteUrl(finalWebsiteUrl)
      );
      setLastAnalyzedBrandDescription(hasNoWebsite ? trimmedDescription : "");

      setMessage(
        result.message ||
          (hasNoWebsite
            ? "Brand description analyzed, saved and campaign calendar created."
            : "Website analyzed, saved and campaign calendar created.")
      );
    } catch (error) {
      setMessage(error.message || "Could not analyze brand.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveProfile() {
    if (!user || !brandProfileId) return;

    const trimmedBusinessName = businessName.trim();

    if (!trimmedBusinessName) {
      setMessage("Add your business name first.");
      return;
    }

    if (!contentMarket || !countryCode) {
      setMessage("Choose the market/country this brand targets.");
      return;
    }

    if (!contentLanguage) {
      setMessage("Choose the content language for this brand.");
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
        content_market: contentMarket,
        country_code: countryCode,
        content_language: contentLanguage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandProfileId)
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
    } else {
      setWebsiteUrl(finalWebsiteUrl);
      setMessage("Brand profile saved. AI setup is ready.");
    }

    setSaving(false);
  }

  function handleDeleteStart() {
    setDeleteMessage("");

    if (!brandProfileId) {
      setDeleteMessage("No brand selected.");
      return;
    }

    if (allBrands.length <= 1) {
      setDeleteMessage(
        "You cannot delete your last brand. Create another brand first."
      );
      return;
    }

    setDeleteStep(true);
  }

  function handleDeleteCancel() {
    setDeleteStep(false);
    setDeleteMessage("");
  }

  async function deleteRowsByColumn(tableName, columnName, value) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(columnName, value);

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }
  }

  async function deleteWebsiteContentHistory(ruleIds, postIds) {
    if (ruleIds.length > 0) {
      const { error } = await supabase
        .from("website_content_history")
        .delete()
        .in("automation_rule_id", ruleIds);

      if (error) {
        throw new Error(`website_content_history: ${error.message}`);
      }
    }

    if (postIds.length > 0) {
      const { error } = await supabase
        .from("website_content_history")
        .delete()
        .in("post_id", postIds);

      if (error) {
        throw new Error(`website_content_history: ${error.message}`);
      }
    }
  }

  async function handleDeleteConfirm() {
    if (!user || !brandProfileId || deletingBrand) return;

    if (allBrands.length <= 1) {
      setDeleteMessage(
        "You cannot delete your last brand. Create another brand first."
      );
      return;
    }

    setDeletingBrand(true);
    setDeleteMessage("");

    try {
      const brandToDelete = allBrands.find(
        (brand) => brand.id === brandProfileId
      );

      const remainingBrands = allBrands.filter(
        (brand) => brand.id !== brandProfileId
      );

      const nextBrand =
        remainingBrands.find((brand) => brand.is_default) ||
        remainingBrands[0] ||
        null;

      if (!nextBrand?.id) {
        throw new Error("Could not find another brand to switch to.");
      }

      const { data: rulesToDelete, error: rulesLoadError } = await supabase
        .from("automation_rules")
        .select("id")
        .eq("brand_profile_id", brandProfileId);

      if (rulesLoadError) {
        throw new Error(`automation_rules: ${rulesLoadError.message}`);
      }

      const { data: postsToDelete, error: postsLoadError } = await supabase
        .from("posts")
        .select("id, image_storage_path")
        .eq("brand_profile_id", brandProfileId);

      if (postsLoadError) {
        throw new Error(`posts: ${postsLoadError.message}`);
      }

      const ruleIds = (rulesToDelete || []).map((rule) => rule.id);
      const postIds = (postsToDelete || []).map((post) => post.id);
      const imagePaths = (postsToDelete || [])
        .map((post) => post.image_storage_path)
        .filter(Boolean);

      await deleteWebsiteContentHistory(ruleIds, postIds);

      if (imagePaths.length > 0) {
        const { error: storageDeleteError } = await supabase.storage
          .from("post-images")
          .remove(imagePaths);

        if (storageDeleteError) {
          throw new Error(`post-images storage: ${storageDeleteError.message}`);
        }
      }

      await deleteRowsByColumn(
        "brand_campaign_opportunities",
        "brand_profile_id",
        brandProfileId
      );

      await deleteRowsByColumn(
        "automation_rules",
        "brand_profile_id",
        brandProfileId
      );

      await deleteRowsByColumn("posts", "brand_profile_id", brandProfileId);

      await deleteRowsByColumn(
        "social_connections",
        "brand_profile_id",
        brandProfileId
      );

      const { error: deleteBrandError } = await supabase
        .from("brand_profiles")
        .delete()
        .eq("id", brandProfileId)
        .eq("user_id", user.id);

      if (deleteBrandError) {
        throw new Error(`brand_profiles: ${deleteBrandError.message}`);
      }

      if (brandToDelete?.is_default && nextBrand.id) {
        await supabase
          .from("brand_profiles")
          .update({
            is_default: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextBrand.id)
          .eq("user_id", user.id);
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(user.id), nextBrand.id);

        window.dispatchEvent(
          new CustomEvent("spreelo-current-brand-changed", {
            detail: {
              brandProfileId: nextBrand.id,
            },
          })
        );
      }

      window.location.href = "/brand";
    } catch (error) {
      console.error("Could not delete brand:", error);
      setDeleteMessage(
        error.message || "Could not delete brand. Please try again."
      );
      setDeletingBrand(false);
    }
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
      <div className="brand-profile-page">
        <header className="brand-profile-hero">
          <div>
            <p className="dashboard-eyebrow">Brand profile</p>
            <h2>Teach Spreelo about your brand</h2>
            <span>
  Set your business context, market and language. Spreelo uses this
  to create better regular posts, campaign ideas and content plans.
</span>
          </div>

         <div
  className={`brand-profile-hero-badge ${
    isBrandProfileReady ? "ready" : "needs-setup"
  }`}
>
  <strong>
    {isBrandProfileReady ? "AI setup ready" : "Setup needed"}
  </strong>
  <span>
    {isBrandProfileReady
      ? "You can now create content with Content Creator or choose campaign ideas in Calendar."
      : "Complete and save your brand profile before creating content."}
  </span>
</div>
        </header>

        <section className="brand-profile-layout">
          <aside className="brand-profile-guide-card">
            <div className="brand-profile-guide-icon">✦</div>

            <p className="dashboard-eyebrow">Setup flow</p>
           <h3>From brand info to content ideas</h3>

            <div className="brand-profile-step-list">
              <div>
                <span>1</span>
                <div>
                  <strong>Business details</strong>
                  <p>Add your website or describe the business manually.</p>
                </div>
              </div>

              <div>
                <span>2</span>
                <div>
                  <strong>Market & language</strong>
                  <p>
                    Choose where the brand creates content and in which
                    language.
                  </p>
                </div>
              </div>

              <div>
                <span>3</span>
                <div>
                <strong>AI analysis</strong>
<p>
  Spreelo analyzes the brand and prepares better content ideas.
</p>
                </div>
              </div>

              <div>
                <span>4</span>
                <div>
                  <strong>Create content</strong>
<p>
  Use Content Creator for regular posts or Calendar for
  campaign-based plans.
</p>
                </div>
              </div>
            </div>

            <div className="brand-profile-note-card">
              <strong>Recommended default</strong>
              <p>
                Use International / Global unless the brand clearly targets a
                specific local market.
              </p>
            </div>
          </aside>

          <section className="brand-profile-form-card">
            <div className="brand-profile-form-header">
              <div>
                <p className="dashboard-eyebrow">Business context</p>
                <h3>Brand setup</h3>
              </div>

              <span>Current brand</span>
            </div>

            <div className="brand-profile-form-section">
              <h4>Business details</h4>

              <label>Business name</label>
              <input
                className="input"
                placeholder="Example: Your Company"
                value={businessName}
                onChange={(event) => {
                  setBusinessName(event.target.value);
                  setMessage("");
                }}
                disabled={analyzing || saving || deletingBrand}
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
                disabled={hasNoWebsite || analyzing || saving || deletingBrand}
              />

              <label className="checkbox-row brand-profile-checkbox">
                <input
                  type="checkbox"
                  checked={hasNoWebsite}
                  onChange={handleNoWebsiteChange}
                  disabled={analyzing || saving || deletingBrand}
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
                    disabled={analyzing || saving || deletingBrand}
                  />
                </>
              )}
            </div>

            <div className="brand-profile-form-section market">
              <div className="brand-profile-section-title">
                <div>
                  <h4>Market setup</h4>
                  <p>
                    Used for campaign ideas, theme days, seasonal timing and
                    language.
                  </p>
                </div>
              </div>

              <div className="brand-profile-two-col">
                <div>
                  <label>Content market</label>
                  <select
                    className="input"
                    value={contentMarket}
                    onChange={handleMarketChange}
                    disabled={analyzing || saving || deletingBrand}
                  >
                    {marketOptions.map((market) => (
                      <option key={market.countryCode} value={market.label}>
                        {market.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Content language</label>
                  <select
                    className="input"
                    value={contentLanguage}
                    onChange={(event) => {
                      setContentLanguage(event.target.value);
                      setShowGeneratedFields(false);
                      setMessage("");
                    }}
                    disabled={analyzing || saving || deletingBrand}
                  >
                    {languageOptions.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {showGeneratedFields && (
              <div className="brand-profile-form-section ai-profile">
                <div className="brand-profile-section-title">
                  <div>
                    <h4>AI profile</h4>
                    <p>You can adjust these fields before saving.</p>
                  </div>

                  <span>Generated</span>
                </div>

                <label>Industry</label>
                <textarea
                  className="input prompt-textarea"
                  placeholder="Example: Local service business helping homeowners with..."
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  disabled={analyzing || saving || deletingBrand}
                />

                <label>Target audience</label>
                <textarea
                  className="input prompt-textarea"
                  placeholder="Example: Customers who need..."
                  value={targetAudience}
                  onChange={(event) => setTargetAudience(event.target.value)}
                  disabled={analyzing || saving || deletingBrand}
                />
              </div>
            )}

            <button
              className="brand-profile-primary-button"
              type="button"
              onClick={handleMainSave}
              disabled={saving || analyzing || deletingBrand || !brandProfileId}
            >
              {mainButtonLabel}
            </button>

           {analyzing && (
  <div className="brand-profile-analysis-card">
    <div className="brand-profile-analysis-header">
      <div>
        <strong>Analyzing your brand</strong>
        <p>
          This usually takes 1–2 minutes. Please keep this page open while
          Spreelo reads your website and prepares your campaign calendar.
        </p>
      </div>

      <span>{Math.round(analysisProgress)}%</span>
    </div>

    <div className="brand-profile-progress-track">
      <div
        className="brand-profile-progress-fill"
        style={{ width: `${Math.min(analysisProgress, 95)}%` }}
      />
    </div>

    <div className="brand-profile-analysis-current">
      <strong>{getCurrentAnalysisStage(analysisProgress).title}</strong>
      <p>{getCurrentAnalysisStage(analysisProgress).description}</p>
    </div>

    <div className="brand-profile-analysis-steps">
      {analysisProgressStages.map((stage) => {
        const isDone = analysisProgress >= stage.progress;
        const isCurrent =
          getCurrentAnalysisStage(analysisProgress).title === stage.title;

        return (
          <div
            key={stage.title}
            className={`brand-profile-analysis-step ${
              isDone ? "done" : ""
            } ${isCurrent ? "current" : ""}`}
          >
            <span>{isDone ? "✓" : "○"}</span>
            <strong>{stage.title}</strong>
          </div>
        );
      })}
    </div>
  </div>
)}
            {message && <p className="brand-profile-message">{message}</p>}

            <p className="brand-profile-disclaimer">
              Campaign dates are suggested by AI and may vary by market, region
              or year. You can edit or move campaign dates later in the
              calendar.
            </p>
          </section>
        </section>

        <section className="danger-zone-card">
          <div>
            <p className="eyebrow danger-eyebrow">Danger zone</p>
            <h3>Delete this brand</h3>
            <p>
              Permanently delete{" "}
              <strong>{businessName || "this brand"}</strong>, including its
              generated posts, saved plans, automation rules, website history,
              campaign opportunities and social connection.
            </p>
            <p className="danger-zone-note">
              This cannot be undone. You cannot delete your last remaining
              brand.
            </p>
          </div>

          <div className="danger-zone-actions">
            {deleteStep ? (
              <div className="delete-confirm-box">
                <p>
                  Are you sure you want to permanently delete{" "}
                  <strong>{businessName || "this brand"}</strong>?
                </p>

                <div className="delete-confirm-actions">
                  <button
                    type="button"
                    className="danger-button"
                    onClick={handleDeleteConfirm}
                    disabled={deletingBrand}
                  >
                    {deletingBrand ? "Deleting..." : "Yes, delete permanently"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDeleteCancel}
                    disabled={deletingBrand}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="danger-button"
                onClick={handleDeleteStart}
                disabled={deletingBrand}
              >
                Delete brand
              </button>
            )}

            {deleteMessage && <p className="danger-message">{deleteMessage}</p>}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
