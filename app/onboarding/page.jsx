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

const onboardingAnalyzingStepKeys = [
  "onboarding.step.creatingProfile",
  "onboarding.step.fetchingWebsite",
  "onboarding.step.readingBusiness",
  "onboarding.step.detectingMarket",
  "onboarding.step.preparingProfile",
  "onboarding.step.findingOpportunities",
  "onboarding.step.buildingCalendar",
  "onboarding.step.savingWorkspace",
  "onboarding.step.stillWorking",
  "onboarding.step.almostThere",
  "onboarding.step.largeWebsite",
  "onboarding.step.keepOpen",
];

const longOnboardingStepStartIndex = 8;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function pollAnalysisStatus({ accessToken, jobId, runRequest }) {
  let runError = null;

  runRequest.catch((error) => {
    runError = error;
  });

  for (let pollCount = 0; pollCount < ANALYSIS_STATUS_MAX_POLLS; pollCount += 1) {
    const statusResponse = await fetch(
      `/api/analyze-brand/status?jobId=${encodeURIComponent(jobId)}`,
      {
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
      return job;
    }

    if (job?.status === "failed") {
      throw new Error(job?.error_message || "Could not analyze brand.");
    }

    if (runError) {
      throw runError;
    }

    await sleep(ANALYSIS_STATUS_POLL_INTERVAL_MS);
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

  const [contentMarket, setContentMarket] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [contentLanguage, setContentLanguage] = useState("");

  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [currentAnalyzingStep, setCurrentAnalyzingStep] = useState(0);

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

  useEffect(() => {
    if (!loading) {
      setCurrentAnalyzingStep(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentAnalyzingStep((currentStep) => {
        if (currentStep >= onboardingAnalyzingStepKeys.length - 1) {
          return longOnboardingStepStartIndex;
        }

        return currentStep + 1;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [loading]);

  function handleMarketChange(event) {
    const selectedMarket = event.target.value;
    const selectedOption = marketOptions.find(
      (option) => option.label === selectedMarket
    );

    setContentMarket(selectedMarket);
    setCountryCode(selectedOption?.countryCode || "OTHER");
    setContentLanguage(selectedOption?.language || "English");
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


    if (!hasNoWebsite && !normalizedWebsiteUrl) {
      setMessage(t("onboarding.errorWebsite"));
      return;
    }

    if (hasNoWebsite && !trimmedDescription) {
      setMessage(t("onboarding.errorDescription"));
      return;
    }

    setLoading(true);
    setCurrentAnalyzingStep(0);
    setMessage("");

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
          contentMarket,
          countryCode,
          contentLanguage,
        }),
      });

      const startResult = await readJsonResponse(startResponse);

      if (!startResponse.ok || !startResult?.ok || !startResult?.jobId) {
        throw new Error(startResult?.error || t("onboarding.errorAnalyzeBrand"));
      }

      const runRequest = fetch("/api/analyze-brand/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          jobId: startResult.jobId,
        }),
      }).then(async (runResponse) => {
        const runResult = await readJsonResponse(runResponse);

        if (!runResponse.ok || !runResult?.ok) {
          throw new Error(runResult?.error || t("onboarding.errorAnalyzeBrand"));
        }

        return runResult;
      });

      await pollAnalysisStatus({
        accessToken: session.access_token,
        jobId: startResult.jobId,
        runRequest,
      });

      setMessage(t("onboarding.ready"));
      window.location.href = "/social-channels";
    } catch (error) {
      setMessage(error.message || t("onboarding.errorGeneric"));
      setLoading(false);
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
          <div className="brand-profile-analyzing-card onboarding-analyzing-card">
            <div className="brand-profile-spinner" />

            <div>
              <strong>
                {t(onboardingAnalyzingStepKeys[currentAnalyzingStep])}
              </strong>
              <p>{t("onboarding.loaderText")}</p>
            </div>
          </div>
        ) : (
          message && <p className="login-message">{message}</p>
        )}
      </section>
    </main>
  );
}
