"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const marketOptions = [
  {
    label: "International / Global",
    countryCode: "GLOBAL",
    language: "English",
  },

  { label: "United States", countryCode: "US", language: "English" },
  { label: "United Kingdom", countryCode: "GB", language: "English" },
  { label: "Canada", countryCode: "CA", language: "English" },
  { label: "Australia", countryCode: "AU", language: "English" },
  { label: "New Zealand", countryCode: "NZ", language: "English" },
  { label: "Ireland", countryCode: "IE", language: "English" },

  { label: "Sweden", countryCode: "SE", language: "Swedish" },
  { label: "Denmark", countryCode: "DK", language: "Danish" },
  { label: "Norway", countryCode: "NO", language: "Norwegian" },
  { label: "Finland", countryCode: "FI", language: "Finnish" },

  { label: "Germany", countryCode: "DE", language: "German" },
  { label: "Netherlands", countryCode: "NL", language: "Dutch" },
  { label: "Belgium", countryCode: "BE", language: "Dutch" },
  { label: "France", countryCode: "FR", language: "French" },
  { label: "Spain", countryCode: "ES", language: "Spanish" },
  { label: "Italy", countryCode: "IT", language: "Italian" },
  { label: "Portugal", countryCode: "PT", language: "Portuguese" },
  { label: "Austria", countryCode: "AT", language: "German" },
  { label: "Switzerland", countryCode: "CH", language: "German" },
  { label: "Poland", countryCode: "PL", language: "Polish" },

  { label: "United Arab Emirates", countryCode: "AE", language: "English" },
  { label: "Singapore", countryCode: "SG", language: "English" },
  { label: "India", countryCode: "IN", language: "English" },
  { label: "South Africa", countryCode: "ZA", language: "English" },
  { label: "Brazil", countryCode: "BR", language: "Portuguese" },
  { label: "Mexico", countryCode: "MX", language: "Spanish" },

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
  "Portuguese",
  "Polish",
  "Arabic",
  "Hindi",
  "Other",
];

const analysisProgressStages = [
  {
    progress: 8,
    titleKey: "brand.analysisStage.readingTitle",
    descriptionKey: "brand.analysisStage.readingText",
  },
  {
    progress: 28,
    titleKey: "brand.analysisStage.understandingTitle",
    descriptionKey: "brand.analysisStage.understandingText",
  },
  {
    progress: 48,
    titleKey: "brand.analysisStage.checkingTitle",
    descriptionKey: "brand.analysisStage.checkingText",
  },
  {
    progress: 70,
    titleKey: "brand.analysisStage.campaignsTitle",
    descriptionKey: "brand.analysisStage.campaignsText",
  },
  {
    progress: 88,
    titleKey: "brand.analysisStage.strategyTitle",
    descriptionKey: "brand.analysisStage.strategyText",
  },
];

const ANALYSIS_STATUS_POLL_INTERVAL_MS = 2000;
const ANALYSIS_STATUS_MAX_POLLS = 180;
const ANALYSIS_DISPLAY_DURATION_MS = 210000; // 3.5 minutes

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function getSmoothAnalysisProgress(startedAt) {
  if (!startedAt) {
    return 1;
  }

  const elapsedMs = Date.now() - startedAt;
  const ratio = elapsedMs / ANALYSIS_DISPLAY_DURATION_MS;

  if (ratio >= 1) {
    return 99;
  }

  return Math.max(1, Math.min(99, ratio * 99));
}
function getFriendlyAnalysisError(value) {
  const cleanError = String(value || "");

  if (
    cleanError.includes("FUNCTION_INVOCATION_TIMEOUT") ||
    cleanError.toLowerCase().includes("timeout") ||
    cleanError.toLowerCase().includes("aborted")
  ) {
    return "Spreelo could not finish the website analysis in time. Please try again. If it still takes too long, add a short business description instead.";
  }

  if (
    cleanError.toLowerCase().includes("json") ||
    cleanError.toLowerCase().includes("parse") ||
    cleanError.toLowerCase().includes("openai response") ||
    cleanError.toLowerCase().includes("analysis result")
  ) {
    return "Spreelo could not read the analysis result correctly. Please try again.";
  }

  if (
    cleanError.toLowerCase().includes("website returned") ||
    cleanError.toLowerCase().includes("website did not return html") ||
    cleanError.toLowerCase().includes("fetch failed") ||
    cleanError.toLowerCase().includes("website url") ||
    cleanError.toLowerCase().includes("website is required")
  ) {
    return "Spreelo could not read this website right now. Please check the website URL or add a short business description instead.";
  }

  return (
    cleanError ||
    "Spreelo could not analyze this website right now. Please try again, or add a short business description instead."
  );
}

async function readApiJson(response) {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(getFriendlyAnalysisError(responseText));
  }
}

export default function BrandProfile() {
  const { t } = useUiText(["brand"]);
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
  const [contentSettingsTouched, setContentSettingsTouched] = useState(false);
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

  const visibleMarketOptions = useMemo(() => {
    const existingMarket = marketOptions.some(
      (market) => market.label === contentMarket
    );

    if (!contentMarket || existingMarket) {
      return marketOptions;
    }

    return [
      {
        label: contentMarket,
        countryCode: countryCode || "AUTO",
        language: contentLanguage || "",
      },
      ...marketOptions,
    ];
  }, [contentMarket, countryCode, contentLanguage]);

  const visibleLanguageOptions = useMemo(() => {
    if (!contentLanguage || languageOptions.includes(contentLanguage)) {
      return languageOptions;
    }

    return [contentLanguage, ...languageOptions];
  }, [contentLanguage]);

  const isBrandProfileReady = useMemo(() => {
    const hasBusinessName = Boolean(businessName.trim());
    const hasBusinessInput = hasNoWebsite
      ? Boolean(brandDescription.trim())
      : Boolean(normalizedWebsiteUrl);
    const hasAiProfile = Boolean(industry.trim() && targetAudience.trim());
    const hasMarketSetup = Boolean(
      contentMarket && countryCode && contentLanguage
    );

    return (
      hasBusinessName &&
      hasBusinessInput &&
      hasAiProfile &&
      hasMarketSetup &&
      showGeneratedFields &&
      !shouldAnalyze
    );
  }, [
    businessName,
    hasNoWebsite,
    brandDescription,
    normalizedWebsiteUrl,
    industry,
    targetAudience,
    contentMarket,
    countryCode,
    contentLanguage,
    showGeneratedFields,
    shouldAnalyze,
  ]);

  const mainButtonLabel = useMemo(() => {
    if (saving) return t("brand.saving");
    if (analyzing) return t("brand.analyzing");

    if (shouldAnalyzeWebsite) return t("brand.analyzeWebsiteButton");
    if (shouldAnalyzeDescription) {
      return t("brand.analyzeDescriptionButton");
    }

    return t("brand.saveButton");
  }, [t, saving, analyzing, shouldAnalyzeWebsite, shouldAnalyzeDescription]);

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
        setMessage(t("brand.errorNoProfile"));
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
        setMessage(t("brand.errorNoProfile"));
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
      setContentSettingsTouched(false);

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

  function handleMarketChange(event) {
    const nextMarket = event.target.value;
    const selectedMarket = visibleMarketOptions.find(
      (market) => market.label === nextMarket
    );

    setContentMarket(nextMarket);
    setCountryCode(selectedMarket?.countryCode || countryCode || "");
    setContentSettingsTouched(true);
    setMessage("");
  }

  function handleNoWebsiteChange(event) {
    const checked = event.target.checked;

    setHasNoWebsite(checked);
    setMessage("");
    setShowGeneratedFields(false);
    setContentSettingsTouched(false);

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

    async function pollAnalysisStatus({
    accessToken,
    jobId,
    runRequest,
    displayStartedAt,
  }) {
    let runFinished = false;
    let runResult = null;

    runRequest
      .then((result) => {
        runFinished = true;
        runResult = result;
      })
      .catch((error) => {
        runFinished = true;
        runResult = {
          ok: false,
          error: error?.message || t("brand.errorRunAnalysis"),
        };
      });

    for (let pollCount = 0; pollCount < ANALYSIS_STATUS_MAX_POLLS; pollCount++) {
      await sleep(
        pollCount === 0 ? 1000 : ANALYSIS_STATUS_POLL_INTERVAL_MS
      );

      const statusResponse = await fetch(
        `/api/analyze-brand/status?jobId=${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const statusResult = await readApiJson(statusResponse);

      if (!statusResponse.ok || !statusResult?.ok) {
        throw new Error(
          getFriendlyAnalysisError(
            statusResult?.error ||
              t("brand.errorReadStatus")
          )
        );
      }

      const job = statusResult.job || {};

      
            if (job.status === "completed") {
        const remainingMs =
          ANALYSIS_DISPLAY_DURATION_MS - (Date.now() - displayStartedAt);

        if (remainingMs > 0) {
          await sleep(remainingMs);
        }

        setAnalysisProgress(100);
        return job;
      }

      if (job.status === "failed") {
        throw new Error(
          getFriendlyAnalysisError(
            job.error_message || t("brand.errorFinishAnalysis")
          )
        );
      }

      if (runFinished && runResult && runResult.ok === false) {
        throw new Error(
          getFriendlyAnalysisError(
            runResult.error || t("brand.errorFinishAnalysis")
          )
        );
      }
    }

    throw new Error(
      t("brand.errorStillAnalyzing")
    );
  }

  async function analyzeBrand() {
    setMessage("");
    setAnalysisProgress(0);

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = brandDescription.trim();

    if (!trimmedBusinessName) {
      setMessage(t("brand.errorBusinessName"));
      return;
    }

    if (!hasNoWebsite && !normalizedWebsiteUrl) {
      setMessage(t("brand.errorWebsite"));
      return;
    }

    if (hasNoWebsite && !trimmedDescription) {
      setMessage(t("brand.errorDescription"));
      return;
    }
        const displayStartedAt = Date.now();

    setAnalysisProgress(1);
    setAnalyzing(true);

    const progressInterval = setInterval(() => {
      setAnalysisProgress((currentProgress) => {
        const smoothProgress = getSmoothAnalysisProgress(displayStartedAt);

        if (currentProgress >= 100) {
          return currentProgress;
        }

        return Math.max(currentProgress, smoothProgress);
      });
    }, 500);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const analysisPayload = {
        brandProfileId,
        businessName: trimmedBusinessName,
        websiteUrl: hasNoWebsite ? "" : normalizedWebsiteUrl,
        brandDescription: hasNoWebsite ? trimmedDescription : "",
        contentMarket: contentSettingsTouched ? contentMarket : "",
        countryCode: contentSettingsTouched ? countryCode : "",
        contentLanguage: contentSettingsTouched ? contentLanguage : "",
      };

      const startResponse = await fetch("/api/analyze-brand/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(analysisPayload),
      });

      const startResult = await readApiJson(startResponse);

      if (!startResponse.ok || !startResult?.ok) {
        throw new Error(
          getFriendlyAnalysisError(
            startResult?.error ||
              t("brand.errorStartAnalysis")
          )
        );
      }

      const jobId = String(startResult.job_id || startResult.job?.id || "");

      if (!jobId) {
        throw new Error(t("brand.errorCreateJob"));
      }

            setAnalysisProgress(getSmoothAnalysisProgress(displayStartedAt));

      const runRequest = fetch("/api/analyze-brand/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          jobId,
        }),
      }).then(async (runResponse) => {
        const runResult = await readApiJson(runResponse);

        return {
          ...runResult,
          ok: Boolean(runResponse.ok && runResult?.ok),
          httpOk: runResponse.ok,
        };
      });

           const completedJob = await pollAnalysisStatus({
        accessToken: session.access_token,
        jobId,
        runRequest,
        displayStartedAt,
      });

      const result = completedJob.result || {};
      const profile = result.profile || {};

      const finalWebsiteUrl =
        profile.website_url ||
        result.website_url ||
        (hasNoWebsite ? "" : normalizedWebsiteUrl);

      setBusinessName(profile.business_name || trimmedBusinessName);
      setWebsiteUrl(finalWebsiteUrl);
      setBrandDescription(profile.brand_description || trimmedDescription);
      setIndustry(profile.industry || "");
      setTargetAudience(profile.target_audience || "");

      setContentMarket(
        result.content_market || profile.content_market || contentMarket
      );
      setCountryCode(result.country_code || profile.country_code || countryCode);
      setContentLanguage(
        result.content_language || profile.content_language || contentLanguage
      );
      setContentSettingsTouched(false);
      setShowGeneratedFields(true);

      setLastAnalyzedWebsiteUrl(
        hasNoWebsite ? "" : normalizeWebsiteUrl(finalWebsiteUrl)
      );
      setLastAnalyzedBrandDescription(hasNoWebsite ? trimmedDescription : "");

      setMessage(
        hasNoWebsite
          ? t("brand.descriptionAnalyzed", {
              count: result.campaign_opportunities_count || 0,
            })
          : t("brand.websiteAnalyzed", {
              count: result.campaign_opportunities_count || 0,
            })
      );
    } catch (error) {
      setMessage(error.message || t("brand.errorAnalyze"));
       } finally {
      clearInterval(progressInterval);
      setAnalyzing(false);
    }
  }

  async function saveProfile() {
    if (!user || !brandProfileId) return;

    const trimmedBusinessName = businessName.trim();

    if (!trimmedBusinessName) {
      setMessage(t("brand.errorBusinessName"));
      return;
    }

    if (!contentMarket || !countryCode) {
      setMessage(t("brand.errorMarket"));
      return;
    }

    if (!contentLanguage) {
      setMessage(t("brand.errorLanguage"));
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
      setMessage(t("brand.saved"));
    }

    setSaving(false);
  }

  function handleDeleteStart() {
    setDeleteMessage("");

    if (!brandProfileId) {
      setDeleteMessage(t("brand.deleteErrorNoBrand"));
      return;
    }

    if (allBrands.length <= 1) {
      setDeleteMessage(t("brand.deleteErrorLastBrand"));
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
      setDeleteMessage(t("brand.deleteErrorLastBrand"));
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
        throw new Error(t("brand.deleteErrorSwitch"));
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
        error.message || t("brand.deleteErrorGeneric")
      );
      setDeletingBrand(false);
    }
  }

  if (loading) {
    return (
      <AppLayout active="brand">
        <section className="empty-card">
          <h3>{t("brand.loadingTitle")}</h3>
          <p>{t("brand.loadingText")}</p>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="brand">
      <div className="brand-profile-page">
        <header className="brand-profile-hero">
          <div>
            <p className="dashboard-eyebrow">{t("brand.eyebrow")}</p>
            <h2>{t("brand.heroTitle")}</h2>
            <span>{t("brand.heroText")}</span>
          </div>

          <div
            className={`brand-profile-hero-badge ${
              isBrandProfileReady ? "ready" : "needs-setup"
            }`}
          >
            <strong>
              {isBrandProfileReady ? t("brand.readyBadge") : t("brand.setupNeededBadge")}
            </strong>
            <span>
              {isBrandProfileReady
                ? t("brand.readyBadgeText")
                : t("brand.setupNeededBadgeText")}
            </span>
          </div>
        </header>

        <section className="brand-profile-layout">
          <aside className="brand-profile-guide-card">
            <div className="brand-profile-guide-icon">✦</div>

            <p className="dashboard-eyebrow">{t("brand.setupFlowEyebrow")}</p>
            <h3>{t("brand.setupFlowTitle")}</h3>

            <div className="brand-profile-step-list">
              <div>
                <span>1</span>
                <div>
                  <strong>{t("brand.stepBusinessTitle")}</strong>
                  <p>{t("brand.stepBusinessText")}</p>
                </div>
              </div>

              <div>
                <span>2</span>
                <div>
                  <strong>{t("brand.stepCampaignTitle")}</strong>
                  <p>{t("brand.stepCampaignText")}</p>
                </div>
              </div>

              <div>
                <span>3</span>
                <div>
                  <strong>{t("brand.stepAnalysisTitle")}</strong>
                  <p>{t("brand.stepAnalysisText")}</p>
                </div>
              </div>

              <div>
                <span>4</span>
                <div>
                  <strong>{t("brand.stepCreateTitle")}</strong>
                  <p>{t("brand.stepCreateText")}</p>
                </div>
              </div>
            </div>

            <div className="brand-profile-note-card">
              <strong>{t("brand.automaticSetupTitle")}</strong>
              <p>{t("brand.automaticSetupText")}</p>
            </div>
          </aside>

          <section className="brand-profile-form-card">
            <div className="brand-profile-form-header">
              <div>
                <p className="dashboard-eyebrow">{t("brand.businessContext")}</p>
                <h3>{t("brand.brandSetup")}</h3>
              </div>

              <span>{t("brand.currentBrand")}</span>
            </div>

            <div className="brand-profile-form-section">
              <h4>{t("brand.businessDetails")}</h4>

              <label>{t("brand.businessName")}</label>
              <input
                className="input"
                placeholder={t("brand.businessNamePlaceholder")}
                value={businessName}
                onChange={(event) => {
                  setBusinessName(event.target.value);
                  setMessage("");
                }}
                disabled={analyzing || saving || deletingBrand}
              />

              <label>{t("brand.websiteUrl")}</label>
              <input
                className="input"
                placeholder={t("brand.websiteUrlPlaceholder")}
                value={websiteUrl}
                onChange={(event) => {
                  setWebsiteUrl(event.target.value);
                  setHasNoWebsite(false);
                  setShowGeneratedFields(false);
                  setContentSettingsTouched(false);
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
                <span>{t("brand.noWebsite")}</span>
              </label>

              {hasNoWebsite && (
                <>
                  <label>{t("brand.describeBusiness")}</label>
                  <textarea
                    className="input prompt-textarea"
                    placeholder={t("brand.describeBusinessPlaceholder")}
                    value={brandDescription}
                    onChange={(event) => {
                      setBrandDescription(event.target.value);
                      setShowGeneratedFields(false);
                      setContentSettingsTouched(false);
                      setIndustry("");
                      setTargetAudience("");
                      setMessage("");
                    }}
                    disabled={analyzing || saving || deletingBrand}
                  />
                </>
              )}
            </div>

            {showGeneratedFields && (
              <div className="brand-profile-form-section market">
                <div className="brand-profile-section-title">
                  <div>
                    <h4>{t("brand.campaignSettingsTitle")}</h4>
                    <p>{t("brand.campaignSettingsText")}</p>
                  </div>

                  <span>{t("brand.autoSelected")}</span>
                </div>

                <div className="brand-profile-two-col">
                  <div>
                    <label>{t("brand.campaignMarket")}</label>
                    <select
                      className="input"
                      value={contentMarket}
                      onChange={handleMarketChange}
                      disabled={analyzing || saving || deletingBrand}
                    >
                      {visibleMarketOptions.map((market) => (
                        <option
                          key={`${market.countryCode}-${market.label}`}
                          value={market.label}
                        >
                          {t(`brand.market.${market.countryCode}`)}
                        </option>
                      ))}
                    </select>

                    <p className="brand-profile-field-help">
                      {t("brand.campaignMarketHelp")}
                    </p>
                  </div>

                  <div>
                    <label>{t("brand.postLanguage")}</label>
                    <select
                      className="input"
                      value={contentLanguage}
                      onChange={(event) => {
                        setContentLanguage(event.target.value);
                        setContentSettingsTouched(true);
                        setMessage("");
                      }}
                      disabled={analyzing || saving || deletingBrand}
                    >
                      {visibleLanguageOptions.map((language) => (
                        <option key={language} value={language}>
                          {t(`brand.language.${language}`)}
                        </option>
                      ))}
                    </select>

                    <p className="brand-profile-field-help">
                      {t("brand.postLanguageHelp")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {showGeneratedFields && (
              <div className="brand-profile-form-section ai-profile">
                <div className="brand-profile-section-title">
                  <div>
                    <h4>{t("brand.aiProfileTitle")}</h4>
                    <p>{t("brand.aiProfileText")}</p>
                  </div>

                  <span>{t("brand.generated")}</span>
                </div>

                <label>{t("brand.industry")}</label>
                <textarea
                  className="input prompt-textarea"
                  placeholder={t("brand.industryPlaceholder")}
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  disabled={analyzing || saving || deletingBrand}
                />

                <label>{t("brand.targetAudience")}</label>
                <textarea
                  className="input prompt-textarea"
                  placeholder={t("brand.targetAudiencePlaceholder")}
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
                    <strong>{t("brand.analysisTitle")}</strong>
                    <p>{t("brand.analysisText")}</p>
                  </div>

                  <span>{Math.min(99, Math.floor(analysisProgress))}%</span>
                </div>

                <div className="brand-profile-progress-track">
                  <div
                    className="brand-profile-progress-fill"
                    style={{ width: `${Math.min(analysisProgress, 98.8)}%` }}
                  />
                </div>

                <div className="brand-profile-analysis-current">
                  <strong>
                    {t(getCurrentAnalysisStage(analysisProgress).titleKey)}
                  </strong>
                  <p>{t(getCurrentAnalysisStage(analysisProgress).descriptionKey)}</p>
                </div>

                <div className="brand-profile-analysis-steps">
                  {analysisProgressStages.map((stage) => {
                    const isDone = analysisProgress >= stage.progress;
                    const isCurrent =
                      getCurrentAnalysisStage(analysisProgress).titleKey ===
                      stage.titleKey;

                    return (
                      <div
                        key={stage.titleKey}
                        className={`brand-profile-analysis-step ${
                          isDone ? "done" : ""
                        } ${isCurrent ? "current" : ""}`}
                      >
                        <span>{isDone ? "✓" : "○"}</span>
                        <strong>{t(stage.titleKey)}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {message && <p className="brand-profile-message">{message}</p>}

            <p className="brand-profile-disclaimer">
              {t("brand.disclaimer")}
            </p>
          </section>
        </section>

        <section className="danger-zone-card">
          <div>
            <p className="eyebrow danger-eyebrow">{t("brand.dangerEyebrow")}</p>
            <h3>{t("brand.deleteTitle")}</h3>
            <p>
              {t("brand.deleteTextBefore")}{" "}
              <strong>{businessName || t("brand.thisBrand")}</strong>
              {t("brand.deleteTextAfter")}
            </p>
            <p className="danger-zone-note">
              {t("brand.deleteNote")}
            </p>
          </div>

          <div className="danger-zone-actions">
            {deleteStep ? (
              <div className="delete-confirm-box">
                <p>
                  {t("brand.deleteConfirmTextBefore")}{" "}
                  <strong>{businessName || t("brand.thisBrand")}</strong>
                  {t("brand.deleteConfirmTextAfter")}
                </p>

                <div className="delete-confirm-actions">
                  <button
                    type="button"
                    className="danger-button"
                    onClick={handleDeleteConfirm}
                    disabled={deletingBrand}
                  >
                    {deletingBrand ? t("brand.deleting") : t("brand.deleteConfirmButton")}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDeleteCancel}
                    disabled={deletingBrand}
                  >
                    {t("brand.cancel")}
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
                {t("brand.deleteButton")}
              </button>
            )}

            {deleteMessage && <p className="danger-message">{deleteMessage}</p>}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
