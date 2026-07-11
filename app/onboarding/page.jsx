"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const ANALYSIS_STATUS_POLL_INTERVAL_MS = 2000;
const ANALYSIS_STATUS_MAX_POLLS = 180;

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
    titleKey: "onboarding.analysis.readingWebsite.title",
    descriptionKey: "onboarding.analysis.readingWebsite.description",
  },
  {
    progress: 28,
    titleKey: "onboarding.analysis.understandingBusiness.title",
    descriptionKey: "onboarding.analysis.understandingBusiness.description",
  },
  {
    progress: 48,
    titleKey: "onboarding.analysis.checkingProducts.title",
    descriptionKey: "onboarding.analysis.checkingProducts.description",
  },
  {
    progress: 70,
    titleKey: "onboarding.analysis.buildingOpportunities.title",
    descriptionKey: "onboarding.analysis.buildingOpportunities.description",
  },
  {
    progress: 88,
    titleKey: "onboarding.analysis.preparingStrategy.title",
    descriptionKey: "onboarding.analysis.preparingStrategy.description",
  },
];

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

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function normalizeWebsiteUrl(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function isDuplicateDefaultBrandError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    error?.code === "23505" ||
    message.includes("duplicate key value") ||
    message.includes("brand_profiles_one_default_per_user_idx")
  );
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
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
        error: error?.message || "Could not run analysis.",
      };
    });

  for (let pollCount = 0; pollCount < ANALYSIS_STATUS_MAX_POLLS; pollCount += 1) {
    await sleep(pollCount === 0 ? 1000 : ANALYSIS_STATUS_POLL_INTERVAL_MS);

    const statusResponse = await fetch(
      `/api/analyze-brand/status?jobId=${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const statusResult = await readJsonResponse(statusResponse);

    if (!statusResponse.ok || !statusResult?.ok) {
      throw new Error(statusResult?.error || "Could not read analysis status.");
    }

    const job = statusResult.job;

    if (job?.status === "completed") {
      const remainingMs =
        ANALYSIS_DISPLAY_DURATION_MS - (Date.now() - displayStartedAt);

      if (remainingMs > 0) {
        await sleep(remainingMs);
      }

      return job;
    }

    if (job?.status === "failed") {
      throw new Error(job?.error_message || "Could not analyze brand.");
    }

    if (runFinished && runResult && !runResult.ok) {
      throw new Error(runResult.error || "Could not run analysis.");
    }
  }

  throw new Error("Brand analysis took too long. Please try again.");
}

export default function OnboardingPage() {
  const { t } = useUiText(["onboarding"]);

  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");

  const [contentMarket, setContentMarket] = useState("International / Global");
  const [countryCode, setCountryCode] = useState("GLOBAL");
  const [contentLanguage, setContentLanguage] = useState("English");
  const [contentSettingsTouched, setContentSettingsTouched] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const normalizedWebsiteUrl = useMemo(() => {
    return normalizeWebsiteUrl(websiteUrl);
  }, [websiteUrl]);

  async function getExistingBrand(userId) {
    const { data, error } = await supabase
      .from("brand_profiles")
      .select("id, business_name")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      throw error;
    }

    return (data || [])[0] || null;
  }

  function saveCurrentBrand(userId, brandId) {
    if (typeof window === "undefined" || !userId || !brandId) return;

    localStorage.setItem(getBrandStorageKey(userId), brandId);
    localStorage.setItem("spreelo_current_brand_id", brandId);
  }

  async function continueWithExistingBrand(userId) {
    const existingBrand = await getExistingBrand(userId);

    if (!existingBrand?.id) {
      return false;
    }

    saveCurrentBrand(userId, existingBrand.id);
    window.location.href = "/";
    return true;
  }

  useEffect(() => {
    async function checkUserAndBrand() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUser(user);

      try {
        const continued = await continueWithExistingBrand(user.id);

        if (continued) {
          return;
        }

        setChecking(false);
      } catch (error) {
        setMessage(error.message || t("onboarding.errorPrepareWorkspace"));
        setChecking(false);
      }
    }

    checkUserAndBrand();
  }, []);


  function handleMarketChange(event) {
    const selectedMarket = event.target.value;
    const selectedOption = marketOptions.find(
      (option) => option.label === selectedMarket
    );

    setContentMarket(selectedMarket);
    setCountryCode(selectedOption?.countryCode || "OTHER");
    setContentLanguage(selectedOption?.language || "English");
    setContentSettingsTouched(true);
    setMessage("");
  }

  async function handleLogout() {
    if (loading || loggingOut) return;

    setLoggingOut(true);
    setMessage("");

    try {
      if (typeof window !== "undefined") {
        if (user?.id) {
          localStorage.removeItem(getBrandStorageKey(user.id));
        }

        localStorage.removeItem("spreelo_current_brand_id");
        localStorage.removeItem("spreelo_onboarding_step");
        localStorage.removeItem("spreelo_selected_brand_id");
      }

      await supabase.auth.signOut();

      window.location.href = "/login";
    } catch (error) {
      setMessage(error.message || t("onboarding.errorLogout"));
      setLoggingOut(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user?.id || loading || loggingOut) return;

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = brandDescription.trim();

    if (!trimmedBusinessName) {
      setMessage(t("onboarding.errorBusinessName"));
      return;
    }

    if (!contentMarket || !countryCode) {
      setMessage(t("onboarding.errorMarket"));
      return;
    }

    if (!contentLanguage) {
      setMessage(t("onboarding.errorLanguage"));
      return;
    }

    if (!hasNoWebsite && !normalizedWebsiteUrl) {
      setMessage(t("onboarding.errorWebsite"));
      return;
    }

    if (hasNoWebsite && !trimmedDescription) {
      setMessage(t("onboarding.errorDescription"));
      return;
    }

    const displayStartedAt = Date.now();

    setLoading(true);
    setAnalysisProgress(1);
    setMessage("");

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
      const alreadyHasBrand = await continueWithExistingBrand(user.id);

      if (alreadyHasBrand) {
        return;
      }

      const { data: createdBrand, error: createError } = await supabase
        .from("brand_profiles")
        .insert({
          user_id: user.id,
          business_name: trimmedBusinessName,
          website_url: hasNoWebsite ? "" : normalizedWebsiteUrl,
          brand_description: hasNoWebsite ? trimmedDescription : "",
          industry: "",
          target_audience: "",
          content_market: contentMarket,
          country_code: countryCode,
          content_language: contentLanguage,
          is_default: true,
          updated_at: new Date().toISOString(),
        })
        .select("id, business_name")
        .single();

      if (createError) {
        if (isDuplicateDefaultBrandError(createError)) {
          const continued = await continueWithExistingBrand(user.id);

          if (continued) {
            return;
          }
        }

        throw new Error(createError.message || t("onboarding.errorCreateBrand"));
      }

      saveCurrentBrand(user.id, createdBrand.id);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const startResponse = await fetch("/api/analyze-brand/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          brandProfileId: createdBrand.id,
          businessName: trimmedBusinessName,
          websiteUrl: hasNoWebsite ? "" : normalizedWebsiteUrl,
          brandDescription: hasNoWebsite ? trimmedDescription : "",
          contentMarket: contentSettingsTouched ? contentMarket : "",
          countryCode: contentSettingsTouched ? countryCode : "",
          contentLanguage: contentSettingsTouched ? contentLanguage : "",
        }),
      });

      const startResult = await readJsonResponse(startResponse);

      if (!startResponse.ok || !startResult?.ok) {
        throw new Error(startResult?.error || t("onboarding.errorAnalyzeBrand"));
      }

      const jobId = String(startResult.jobId || startResult.job_id || startResult.job?.id || "");

      if (!jobId) {
        throw new Error(t("onboarding.errorAnalyzeBrand"));
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
        const runResult = await readJsonResponse(runResponse);

        return {
          ...runResult,
          ok: Boolean(runResponse.ok && runResult?.ok),
          httpOk: runResponse.ok,
          error: runResult?.error || t("onboarding.errorAnalyzeBrand"),
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

      setContentMarket(
        result.content_market || profile.content_market || contentMarket
      );
      setCountryCode(result.country_code || profile.country_code || countryCode);
      setContentLanguage(
        result.content_language || profile.content_language || contentLanguage
      );
      setContentSettingsTouched(false);
      setAnalysisProgress(100);
      setMessage(t("onboarding.ready"));

      await sleep(500);
      window.location.href = "/social-channels";
    } catch (error) {
      setMessage(error.message || t("onboarding.errorGeneric"));
      setLoading(false);
    } finally {
      clearInterval(progressInterval);
    }
  }

  if (checking) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand login-brand">
            <img
              src="/brand/spreelologo.png"
              alt="Spreelo"
              className="spreelo-logo-image"
            />
          </div>

          <p className="login-message">{t("onboarding.checkingWorkspace")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card onboarding-card">
        <div className="onboarding-card-top">
          <div className="brand login-brand">
            <img
              src="/brand/spreelologo.png"
              alt="Spreelo"
              className="spreelo-logo-image"
            />
          </div>

          <button
            type="button"
            className="onboarding-logout-button"
            onClick={handleLogout}
            disabled={loading || loggingOut}
          >
            {loggingOut ? t("onboarding.loggingOut") : t("onboarding.logout")}
          </button>
        </div>

        <div className="login-content">
          <p className="eyebrow">{t("onboarding.step")}</p>
          <h2>{t("onboarding.title")}</h2>
          <p>{t("onboarding.description")}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>{t("onboarding.businessName")}</label>
          <input
            className="input"
            type="text"
            placeholder={t("onboarding.businessNamePlaceholder")}
            value={businessName}
            onChange={(event) => {
              setBusinessName(event.target.value);
              setMessage("");
            }}
            required
            disabled={loading || loggingOut}
          />

          <label>{t("onboarding.websiteUrl")}</label>
          <input
            className="input"
            type="text"
            placeholder={t("onboarding.websiteUrlPlaceholder")}
            value={websiteUrl}
            onChange={(event) => {
              setWebsiteUrl(event.target.value);
              setMessage("");
            }}
            disabled={hasNoWebsite || loading || loggingOut}
          />

          <label className="onboarding-checkbox">
            <input
              type="checkbox"
              checked={hasNoWebsite}
              disabled={loading || loggingOut}
              onChange={(event) => {
                setHasNoWebsite(event.target.checked);
                setMessage("");

                if (event.target.checked) {
                  setWebsiteUrl("");
                } else {
                  setBrandDescription("");
                }
              }}
            />
            <span>{t("onboarding.noWebsite")}</span>
          </label>



          {hasNoWebsite && (
            <>
              <label>{t("onboarding.describeBusiness")}</label>
              <textarea
                className="input"
                rows={5}
                placeholder={t("onboarding.describeBusinessPlaceholder")}
                value={brandDescription}
                onChange={(event) => {
                  setBrandDescription(event.target.value);
                  setMessage("");
                }}
                required
                disabled={loading || loggingOut}
              />
            </>
          )}

          <button
            className="primary-button full"
            type="submit"
            disabled={loading || loggingOut}
          >
            {loading ? t("onboarding.settingUp") : t("onboarding.continue")}
          </button>
        </form>

        {loading ? (
          <div className="brand-profile-analysis-card onboarding-analysis-card">
            <div className="brand-profile-analysis-header">
              <div>
                <strong>{t("onboarding.analysis.title")}</strong>
                <p>{t("onboarding.analysis.description")}</p>
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
        ) : (
          message && <p className="login-message">{message}</p>
        )}
      </section>
    </main>
  );
}
