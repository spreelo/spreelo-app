"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";
import { normalizeSingleContentLanguage } from "../../lib/contentLanguage";

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
  { label: "Europe", countryCode: "EU", language: "English" },

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

function getLanguageOptionLabel(t, language) {
  const normalizedLanguage = normalizeSingleContentLanguage(language);
  const translatedLabel = t(`brand.language.${normalizedLanguage}`);

  if (translatedLabel && !translatedLabel.startsWith("brand.language.")) {
    return translatedLabel;
  }

  return normalizedLanguage || "English";
}

function getMarketOptionLabel(t, market) {
  const translatedLabel = t(`brand.market.${market.countryCode}`);

  if (translatedLabel && !translatedLabel.startsWith("brand.market.")) {
    return translatedLabel;
  }

  return market.label || market.countryCode || "International / Global";
}

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
const ANALYSIS_MAIN_PROGRESS_DURATION_MS = 120000;
const ANALYSIS_DISPLAY_DURATION_MS = 150000; // Typical analysis reaches 96% after about 2.5 minutes.
const ANALYSIS_FINAL_CREEP_TIME_CONSTANT_MS = 60000;
const ANALYSIS_START_REQUEST_TIMEOUT_MS = 45000;
const ANALYSIS_STATUS_REQUEST_TIMEOUT_MS = 20000;
const ANALYSIS_SESSION_ATTEMPTS = 3;
const ANALYSIS_SESSION_TIMEOUT_MS = 12000;
const ANALYSIS_MIN_VISIBLE_DURATION_MS = 2500;
const BRAND_ASSETS_BUCKET = "brand-assets";
const MAX_LOGO_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_FILE_TYPES = new Set([
  "image/png",
  "image/webp",
  "image/jpeg",
  "image/jpg",
]);


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

  if (elapsedMs <= ANALYSIS_MAIN_PROGRESS_DURATION_MS) {
    const ratio = elapsedMs / ANALYSIS_MAIN_PROGRESS_DURATION_MS;
    return Math.max(1, Math.min(90, 1 + ratio * 89));
  }

  if (elapsedMs <= ANALYSIS_DISPLAY_DURATION_MS) {
    const finalStretchRatio =
      (elapsedMs - ANALYSIS_MAIN_PROGRESS_DURATION_MS) /
      (ANALYSIS_DISPLAY_DURATION_MS - ANALYSIS_MAIN_PROGRESS_DURATION_MS);

    return Math.min(96, 90 + finalStretchRatio * 6);
  }

  const finalPhaseElapsedMs = elapsedMs - ANALYSIS_DISPLAY_DURATION_MS;
  const finalCreep =
    2.8 *
    (1 -
      Math.exp(
        -finalPhaseElapsedMs / ANALYSIS_FINAL_CREEP_TIME_CONSTANT_MS
      ));

  return Math.min(98.8, 96 + finalCreep);
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Request timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getAnalysisSessionWithRetry() {
  let lastError = null;

  for (let attempt = 0; attempt < ANALYSIS_SESSION_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        ANALYSIS_SESSION_TIMEOUT_MS
      );

      if (data?.session?.access_token) {
        return { session: data.session, error: null };
      }

      if (!error) {
        return { session: null, error: null };
      }

      lastError = error;
    } catch (error) {
      lastError = error;
    }

    if (attempt < ANALYSIS_SESSION_ATTEMPTS - 1) {
      await sleep(800 * (attempt + 1));
    }
  }

  return { session: null, error: lastError };
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
  const [logoUrl, setLogoUrl] = useState("");
  const [logoStoragePath, setLogoStoragePath] = useState("");
  const [logoEnabledByDefault, setLogoEnabledByDefault] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [showLogoModal, setShowLogoModal] = useState(false);

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

  const normalizedContentLanguage = normalizeSingleContentLanguage(contentLanguage);

  const visibleLanguageOptions = useMemo(() => languageOptions, []);

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
          "id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, logo_url, logo_storage_path, logo_enabled_by_default, is_default, created_at"
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

      setLogoUrl(data.logo_url || "");
      setLogoStoragePath(data.logo_storage_path || "");
      setLogoEnabledByDefault(data.logo_enabled_by_default !== false);
      setLogoMessage("");

      const loadedMarket = data.content_market || "International / Global";
      const loadedCountryCode = data.country_code || "GLOBAL";
      const loadedContentLanguage = normalizeSingleContentLanguage(data.content_language, "English");

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

  function getSafeLogoFileName(fileName) {
    const cleanName = String(fileName || "logo")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    return cleanName || "logo.png";
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];

    if (!file || !user || !brandProfileId) return;

    setLogoMessage("");
    setMessage("");

    if (!ALLOWED_LOGO_FILE_TYPES.has(file.type)) {
      setLogoMessage(t("brand.logoErrorType"));
      event.target.value = "";
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE_BYTES) {
      setLogoMessage(t("brand.logoErrorSize"));
      event.target.value = "";
      return;
    }

    setLogoUploading(true);

    try {
      const safeFileName = getSafeLogoFileName(file.name);
      const storagePath = `logos/${user.id}/${brandProfileId}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BRAND_ASSETS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(BRAND_ASSETS_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData?.publicUrl || "";

      if (!publicUrl) {
        throw new Error(t("brand.logoErrorPublicUrl"));
      }

      const { error: updateError } = await supabase
        .from("brand_profiles")
        .update({
          logo_url: publicUrl,
          logo_storage_path: storagePath,
          logo_enabled_by_default: logoEnabledByDefault !== false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandProfileId)
        .eq("user_id", user.id);

      if (updateError) {
        await supabase.storage.from(BRAND_ASSETS_BUCKET).remove([storagePath]);
        throw updateError;
      }

      if (logoStoragePath && logoStoragePath !== storagePath) {
        await supabase.storage.from(BRAND_ASSETS_BUCKET).remove([logoStoragePath]);
      }

      setLogoUrl(publicUrl);
      setLogoStoragePath(storagePath);
      setLogoMessage(t("brand.logoUploaded"));
    } catch (error) {
      console.error("Could not upload brand logo:", error);
      setLogoMessage(error.message || t("brand.logoErrorUpload"));
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  }

  async function handleLogoDefaultChange(event) {
    const checked = event.target.checked;

    setLogoEnabledByDefault(checked);
    setLogoMessage("");
    setMessage("");

    if (!user || !brandProfileId) return;

    const { error } = await supabase
      .from("brand_profiles")
      .update({
        logo_enabled_by_default: checked,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandProfileId)
      .eq("user_id", user.id);

    if (error) {
      setLogoEnabledByDefault(!checked);
      setLogoMessage(error.message);
    }
  }

  async function handleRemoveLogo() {
    if (!user || !brandProfileId || logoUploading) return;

    setLogoUploading(true);
    setLogoMessage("");
    setMessage("");

    const pathToRemove = logoStoragePath;

    try {
      const { error } = await supabase
        .from("brand_profiles")
        .update({
          logo_url: null,
          logo_storage_path: null,
          logo_enabled_by_default: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandProfileId)
        .eq("user_id", user.id);

      if (error) throw error;

      if (pathToRemove) {
        await supabase.storage.from(BRAND_ASSETS_BUCKET).remove([pathToRemove]);
      }

      setLogoUrl("");
      setLogoStoragePath("");
      setLogoEnabledByDefault(false);
      setLogoMessage(t("brand.logoRemoved"));
    } catch (error) {
      console.error("Could not remove brand logo:", error);
      setLogoMessage(error.message || t("brand.logoErrorRemove"));
    } finally {
      setLogoUploading(false);
    }
  }

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
    let consecutiveStatusErrors = 0;
    let queuedPollsAfterRunFailure = 0;

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

      let statusResponse;
      let statusResult;

      try {
        statusResponse = await fetchWithTimeout(
          `/api/analyze-brand/status?jobId=${encodeURIComponent(jobId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
          ANALYSIS_STATUS_REQUEST_TIMEOUT_MS
        );

        statusResult = await readApiJson(statusResponse);

        if (!statusResponse.ok || !statusResult?.ok) {
          throw new Error(
            getFriendlyAnalysisError(
              statusResult?.error || t("brand.errorReadStatus")
            )
          );
        }

        consecutiveStatusErrors = 0;
      } catch (error) {
        consecutiveStatusErrors += 1;

        if (consecutiveStatusErrors < 4) {
          continue;
        }

        throw error;
      }

      const job = statusResult.job || {};

      
            if (job.status === "completed") {
        const remainingMs =
          ANALYSIS_MIN_VISIBLE_DURATION_MS - (Date.now() - displayStartedAt);

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
        if (job.status === "queued") {
          queuedPollsAfterRunFailure += 1;

          if (queuedPollsAfterRunFailure >= 5) {
            throw new Error(
              getFriendlyAnalysisError(
                runResult.error || t("brand.errorFinishAnalysis")
              )
            );
          }
        } else {
          // The browser can lose the long /run response while the server-side
          // job continues. In that case the job status is the source of truth.
          queuedPollsAfterRunFailure = 0;
        }
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
      const { session, error: sessionError } =
        await getAnalysisSessionWithRetry();

      if (!session?.access_token) {
        if (sessionError) {
          throw new Error(t("brand.errorVerifySession"));
        }

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

      const startResponse = await fetchWithTimeout(
        "/api/analyze-brand/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(analysisPayload),
        },
        ANALYSIS_START_REQUEST_TIMEOUT_MS
      );

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
        normalizeSingleContentLanguage(
          result.content_language || profile.content_language || contentLanguage,
          contentLanguage || "English"
        )
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
        logo_url: logoUrl || null,
        logo_storage_path: logoStoragePath || null,
        logo_enabled_by_default: logoEnabledByDefault !== false,
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

  async function deleteUserRowsByColumn(tableName, columnName, value) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(columnName, value)
      .eq("user_id", user.id);

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }
  }

  async function deletePostSlidesForPosts(postIds) {
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return;
    }

    const { error } = await supabase
      .from("post_slides")
      .delete()
      .in("post_id", postIds);

    if (error) {
      throw new Error(`post_slides: ${error.message}`);
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

      const { data: verifiedBrand, error: verifyBrandError } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("id", brandProfileId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (verifyBrandError) {
        throw new Error(`brand_profiles: ${verifyBrandError.message}`);
      }

      if (!verifiedBrand?.id) {
        throw new Error(t("brand.deleteErrorNoBrand"));
      }

      const { data: rulesToDelete, error: rulesLoadError } = await supabase
        .from("automation_rules")
        .select("id, uploaded_image_storage_path")
        .eq("brand_profile_id", brandProfileId)
        .eq("user_id", user.id);

      if (rulesLoadError) {
        throw new Error(`automation_rules: ${rulesLoadError.message}`);
      }

      const { data: postsToDelete, error: postsLoadError } = await supabase
        .from("posts")
        .select("id, image_storage_path, video_storage_path, content_format")
        .eq("brand_profile_id", brandProfileId)
        .eq("user_id", user.id);

      if (postsLoadError) {
        throw new Error(`posts: ${postsLoadError.message}`);
      }

      const ruleIds = (rulesToDelete || []).map((rule) => rule.id);
      const postIds = (postsToDelete || []).map((post) => post.id);
      const imagePaths = [
        ...(postsToDelete || [])
          .map((post) => post.image_storage_path)
          .filter(Boolean),
        ...(rulesToDelete || [])
          .map((rule) => rule.uploaded_image_storage_path)
          .filter(Boolean),
        ...(postsToDelete || [])
          .filter((post) => post.content_format === "animated_video")
          .flatMap((post) => [
            `${user.id}/${post.id}-animation-background.png`,
            `${user.id}/${post.id}-animation-product-card.png`,
            `${user.id}/${post.id}-animation-poster.png`,
          ]),
      ];
      const videoPaths = (postsToDelete || [])
        .map((post) => post.video_storage_path)
        .filter(Boolean);

      await deleteWebsiteContentHistory(ruleIds, postIds);
      await deletePostSlidesForPosts(postIds);

      if (imagePaths.length > 0) {
        const { error: storageDeleteError } = await supabase.storage
          .from("post-images")
          .remove(imagePaths);

        if (storageDeleteError) {
          throw new Error(`post-images storage: ${storageDeleteError.message}`);
        }
      }

      if (videoPaths.length > 0) {
        const { error: videoStorageDeleteError } = await supabase.storage
          .from("post-videos")
          .remove(videoPaths);

        if (videoStorageDeleteError) {
          throw new Error(
            `post-videos storage: ${videoStorageDeleteError.message}`
          );
        }
      }

      if (logoStoragePath) {
        const { error: logoDeleteError } = await supabase.storage
          .from(BRAND_ASSETS_BUCKET)
          .remove([logoStoragePath]);

        if (logoDeleteError) {
          throw new Error(`${BRAND_ASSETS_BUCKET} storage: ${logoDeleteError.message}`);
        }
      }

      await deleteRowsByColumn(
        "website_product_catalog",
        "brand_profile_id",
        brandProfileId
      );

      await deleteRowsByColumn(
        "brand_campaign_opportunities",
        "brand_profile_id",
        brandProfileId
      );

      if (ruleIds.length > 0) {
        const { error: releaseRulesError } = await supabase.rpc(
          "release_and_delete_automation_rules",
          { p_rule_ids: ruleIds }
        );

        if (releaseRulesError) {
          throw new Error(
            `automation_rules: ${releaseRulesError.message || "Could not release reserved credits before deleting the brand"}`
          );
        }
      }

      await deleteUserRowsByColumn("posts", "brand_profile_id", brandProfileId);

      await deleteUserRowsByColumn(
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
                          {getMarketOptionLabel(t, market)}
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
                      value={normalizedContentLanguage}
                      onChange={(event) => {
                        setContentLanguage(normalizeSingleContentLanguage(event.target.value));
                        setContentSettingsTouched(true);
                        setMessage("");
                      }}
                      disabled={analyzing || saving || deletingBrand}
                    >
                      {visibleLanguageOptions.map((language) => (
                        <option key={language} value={language}>
                          {getLanguageOptionLabel(t, language)}
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


            {showGeneratedFields && (
              <div className="brand-profile-logo-compact-card">
                <div className="brand-profile-logo-compact-main">
                  <div className={`brand-logo-compact-thumb ${logoUrl ? "has-logo" : "empty"}`}>
                    {logoUrl ? (
                      <img src={logoUrl} alt={t("brand.logoPreviewAlt")} />
                    ) : (
                      <span>PNG</span>
                    )}
                  </div>

                  <div>
                    <strong>{t("brand.logoCompactTitle")}</strong>
                    <p>
                      {logoUrl
                        ? t("brand.logoCompactTextReady")
                        : t("brand.logoCompactTextEmpty")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="brand-logo-compact-button"
                  onClick={() => {
                    setLogoMessage("");
                    setShowLogoModal(true);
                  }}
                  disabled={analyzing || saving || deletingBrand}
                >
                  {logoUrl ? t("brand.logoManageButton") : t("brand.logoAddButton")}
                </button>
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



        {showLogoModal && (
          <div className="brand-logo-modal-backdrop" role="presentation">
            <div
              className="brand-logo-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="brand-logo-modal-title"
            >
              <button
                type="button"
                className="brand-logo-modal-close"
                onClick={() => setShowLogoModal(false)}
                aria-label={t("brand.logoModalClose")}
                disabled={logoUploading}
              >
                ×
              </button>

              <div className="brand-logo-modal-header">
                <p className="dashboard-eyebrow">{t("brand.logoModalEyebrow")}</p>
                <h3 id="brand-logo-modal-title">{t("brand.logoModalTitle")}</h3>
                <p>{t("brand.logoModalText")}</p>
              </div>

              <div className="brand-logo-upload-panel brand-logo-upload-panel-modal">
                <div className={`brand-logo-preview ${logoUrl ? "has-logo" : "empty"}`}>
                  {logoUrl ? (
                    <img src={logoUrl} alt={t("brand.logoPreviewAlt")} />
                  ) : (
                    <div>
                      <span>PNG</span>
                      <strong>{t("brand.logoPreviewEmpty")}</strong>
                    </div>
                  )}
                </div>

                <div className="brand-logo-controls">
                  <div>
                    <strong>{t("brand.logoUploadTitle")}</strong>
                    <p>{t("brand.logoUploadText")}</p>
                  </div>

                  <div className="brand-logo-actions">
                    <label className="brand-logo-upload-button">
                      <input
                        type="file"
                        accept="image/png,image/webp,image/jpeg"
                        onChange={handleLogoUpload}
                        disabled={logoUploading || analyzing || saving || deletingBrand}
                      />
                      <span>{logoUploading ? t("brand.logoUploading") : t("brand.logoChooseFile")}</span>
                    </label>

                    {logoUrl && (
                      <button
                        type="button"
                        className="brand-logo-remove-button"
                        onClick={handleRemoveLogo}
                        disabled={logoUploading || analyzing || saving || deletingBrand}
                      >
                        {t("brand.logoRemove")}
                      </button>
                    )}
                  </div>

                  <label className="checkbox-row brand-profile-checkbox brand-logo-default-toggle">
                    <input
                      type="checkbox"
                      checked={logoEnabledByDefault}
                      onChange={handleLogoDefaultChange}
                      disabled={logoUploading || analyzing || saving || deletingBrand}
                    />
                    <span>{t("brand.logoDefaultToggle")}</span>
                  </label>

                  <p className="brand-profile-field-help">
                    {t("brand.logoDefaultHelp")}
                  </p>

                  {logoMessage && <p className="brand-logo-message">{logoMessage}</p>}
                </div>
              </div>

              <div className="brand-logo-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowLogoModal(false)}
                  disabled={logoUploading}
                >
                  {t("brand.logoModalDone")}
                </button>
              </div>
            </div>
          </div>
        )}

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
