"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarHeart,
  Check,
  Circle,
  Globe2,
  LogOut,
  PackageSearch,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { getValidAnalysisAccessToken } from "../../lib/analysisSession";
import {
  ANALYSIS_VISUAL_MAX_PROGRESS,
  getSmoothAnalysisProgress,
} from "../../lib/analysisProgress";
import { useUiText } from "../../lib/i18n/useUiText";

const ANALYSIS_STATUS_POLL_INTERVAL_MS = 5000;
const ANALYSIS_STATUS_MAX_POLLS = 720;
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
    icon: ScanSearch,
  },
  {
    progress: 28,
    titleKey: "onboarding.analysis.understandingBusiness.title",
    descriptionKey: "onboarding.analysis.understandingBusiness.description",
    icon: Sparkles,
  },
  {
    progress: 48,
    titleKey: "onboarding.analysis.checkingProducts.title",
    descriptionKey: "onboarding.analysis.checkingProducts.description",
    icon: PackageSearch,
  },
  {
    progress: 70,
    titleKey: "onboarding.analysis.buildingOpportunities.title",
    descriptionKey: "onboarding.analysis.buildingOpportunities.description",
    icon: CalendarHeart,
  },
  {
    progress: 88,
    titleKey: "onboarding.analysis.preparingStrategy.title",
    descriptionKey: "onboarding.analysis.preparingStrategy.description",
    icon: WandSparkles,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAnalysisRescueReason(code) {
  if (code === "analysis_manual_rescue_security") return "security";
  if (code === "analysis_manual_rescue_timeout") return "timeout";
  return "generic";
}

function isManualAnalysisRescueCode(code) {
  return String(code || "").startsWith("analysis_manual_rescue_");
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
  onStatus,
}) {
  let currentAccessToken = accessToken;

  for (let pollCount = 0; pollCount < ANALYSIS_STATUS_MAX_POLLS; pollCount += 1) {
    await sleep(pollCount === 0 ? 1000 : ANALYSIS_STATUS_POLL_INTERVAL_MS);

    const requestStatus = (token) =>
      fetch(`/api/analyze-brand/status?jobId=${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

    currentAccessToken = await getValidAnalysisAccessToken({
      supabase,
      fallbackAccessToken: currentAccessToken,
    });
    let statusResponse = await requestStatus(currentAccessToken);

    if (statusResponse.status === 401) {
      currentAccessToken = await getValidAnalysisAccessToken({
        supabase,
        fallbackAccessToken: currentAccessToken,
        forceRefresh: true,
      });
      statusResponse = await requestStatus(currentAccessToken);
    }

    const statusResult = await readJsonResponse(statusResponse);

    if (!statusResponse.ok || !statusResult?.ok) {
      throw new Error(statusResult?.error || "Could not read analysis status.");
    }

    const job = statusResult.job;

    if (job) {
      onStatus?.(job);
    }

    if (job?.status === "completed") {
      return job;
    }

    if (job?.status === "failed") {
      if (isManualAnalysisRescueCode(job?.user_message_code)) {
        return job;
      }
      throw new Error(job?.error_message || "Could not analyze brand.");
    }

  }

  throw new Error("Brand analysis took too long. Please try again.");
}

export default function OnboardingPage() {
  const { t, locale } = useUiText(["onboarding"]);

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
  const [analysisNoticeCode, setAnalysisNoticeCode] = useState("background");
  const [analysisRescuePending, setAnalysisRescuePending] = useState(false);
  const [analysisRescueReason, setAnalysisRescueReason] = useState("generic");
  const analysisStartedAtRef = useRef(0);
  const reportedProgressRef = useRef(0);

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
    if (!loading || !analysisStartedAtRef.current) return undefined;

    const updateVisualProgress = () => {
      const timedProgress = getSmoothAnalysisProgress(
        analysisStartedAtRef.current
      );

      setAnalysisProgress((currentProgress) =>
        Math.max(currentProgress, Math.min(ANALYSIS_VISUAL_MAX_PROGRESS, timedProgress))
      );
    };

    updateVisualProgress();
    const intervalId = window.setInterval(updateVisualProgress, 250);

    return () => window.clearInterval(intervalId);
  }, [loading]);


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

    analysisStartedAtRef.current = Date.now();
    reportedProgressRef.current = 1;
    setLoading(true);
    setAnalysisProgress(1);
    setAnalysisNoticeCode("background");
    setAnalysisRescuePending(false);
    setAnalysisRescueReason("generic");
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

      const analysisAccessToken = await getValidAnalysisAccessToken({
        supabase,
        fallbackAccessToken: session.access_token,
      });

      const startResponse = await fetch("/api/analyze-brand/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${analysisAccessToken}`,
        },
        body: JSON.stringify({
          brandProfileId: createdBrand.id,
          businessName: trimmedBusinessName,
          websiteUrl: hasNoWebsite ? "" : normalizedWebsiteUrl,
          brandDescription: hasNoWebsite ? trimmedDescription : "",
          contentMarket: contentSettingsTouched ? contentMarket : "",
          countryCode: contentSettingsTouched ? countryCode : "",
          contentLanguage: contentSettingsTouched ? contentLanguage : "",
          notificationLocale: locale || "en",
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

      setAnalysisProgress(5);

      const completedJob = await pollAnalysisStatus({
        accessToken: analysisAccessToken,
        jobId,
        onStatus: (job) => {
          const nextProgress = Number(job?.progress || 0);

          if (Number.isFinite(nextProgress)) {
            reportedProgressRef.current = Math.max(
              reportedProgressRef.current,
              Math.max(1, Math.min(100, nextProgress))
            );
          }

          if (job?.user_message_code === "website_blocked_background_research") {
            setAnalysisNoticeCode("blocked");
          } else if (
            job?.user_message_code === "analysis_unusually_long" ||
            Date.now() - analysisStartedAtRef.current > 90_000
          ) {
            setAnalysisNoticeCode("long");
          }
        },
      });

      if (isManualAnalysisRescueCode(completedJob?.user_message_code)) {
        setAnalysisProgress(100);
        analysisStartedAtRef.current = 0;
        setLoading(false);
        setMessage("");
        setAnalysisRescueReason(getAnalysisRescueReason(completedJob.user_message_code));
        setAnalysisRescuePending(true);
        return;
      }

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
      analysisStartedAtRef.current = 0;
      setMessage(t("onboarding.ready"));

      await sleep(350);
      window.location.href = `/onboarding/ready?brandId=${encodeURIComponent(createdBrand.id)}`;
    } catch (error) {
      analysisStartedAtRef.current = 0;
      setMessage(error.message || t("onboarding.errorGeneric"));
      setLoading(false);
    }
  }

  const currentAnalysisStage = getCurrentAnalysisStage(analysisProgress);
  const currentAnalysisStageIndex = analysisProgressStages.findIndex(
    (stage) => stage.titleKey === currentAnalysisStage.titleKey
  );
  const displayProgress = Math.min(99, Math.floor(analysisProgress));

  if (checking) {
    return (
      <main className="onboarding-refresh-page">
        <section className="onboarding-refresh-loading" aria-live="polite">
          <img src="/brand/spreelologo.png" alt="Spreelo" />
          <span className="onboarding-refresh-spinner" aria-hidden="true" />
          <p>{t("onboarding.checkingWorkspace")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`onboarding-refresh-page ${loading ? "is-analyzing" : ""}`}>
      <section className="onboarding-refresh-shell">
        <aside className="onboarding-refresh-story" aria-label={t("onboarding.storyAriaLabel")}>
          <img
            src="/brand/spreelologo.png"
            alt="Spreelo"
            className="onboarding-refresh-logo"
          />

          <div className="onboarding-refresh-story-copy">
            <span>{t("onboarding.welcomeEyebrow")}</span>
            <h1>{t("onboarding.storyTitle")}</h1>
            <p>{t("onboarding.storyText")}</p>
          </div>

          <div className="onboarding-refresh-story-steps">
            <article>
              <span><Building2 size={22} aria-hidden="true" /></span>
              <div>
                <strong>{t("onboarding.storyStepOneTitle")}</strong>
                <p>{t("onboarding.storyStepOneText")}</p>
              </div>
            </article>
            <article>
              <span><Sparkles size={22} aria-hidden="true" /></span>
              <div>
                <strong>{t("onboarding.storyStepTwoTitle")}</strong>
                <p>{t("onboarding.storyStepTwoText")}</p>
              </div>
            </article>
            <article>
              <span><ArrowRight size={22} aria-hidden="true" /></span>
              <div>
                <strong>{t("onboarding.storyStepThreeTitle")}</strong>
                <p>{t("onboarding.storyStepThreeText")}</p>
              </div>
            </article>
          </div>

          <div className="onboarding-refresh-saas-preview" aria-hidden="true">
            <header>
              <span><Sparkles size={17} /></span>
              <div><strong>{t("onboarding.brandIntelligence")}</strong><i /></div>
              <b>AI</b>
            </header>
            <div className="onboarding-refresh-saas-chart">
              <span /><span /><span /><span /><span /><span />
              <i />
            </div>
            <div className="onboarding-refresh-saas-insights">
              <article><span><Building2 size={15} /></span><i /><b /></article>
              <article><span><Sparkles size={15} /></span><i /><b /></article>
              <article><span><CalendarHeart size={15} /></span><i /><b /></article>
            </div>
          </div>
        </aside>

        <section className="onboarding-refresh-main">
          <header className="onboarding-refresh-topbar">
            <img
              src="/brand/spreelologo.png"
              alt="Spreelo"
              className="onboarding-refresh-mobile-logo"
            />

            <button
              type="button"
              className="onboarding-refresh-logout"
              onClick={handleLogout}
              disabled={loading || loggingOut}
            >
              <LogOut size={17} aria-hidden="true" />
              {loggingOut ? t("onboarding.loggingOut") : t("onboarding.logout")}
            </button>
          </header>

          {!loading ? (
            <div className="onboarding-refresh-form-view">
              <div className="onboarding-refresh-heading">
                <p>{t("onboarding.formEyebrow")}</p>
                <h2>{t("onboarding.title")}</h2>
                <span>{t("onboarding.description")}</span>
              </div>

              <form onSubmit={handleSubmit} className="onboarding-refresh-form">
                <label htmlFor="onboarding-business-name">{t("onboarding.businessName")}</label>
                <input
                  id="onboarding-business-name"
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

                <label htmlFor="onboarding-website-url">{t("onboarding.websiteUrl")}</label>
                <div className="onboarding-refresh-input-with-icon">
                  <Globe2 size={19} aria-hidden="true" />
                  <input
                    id="onboarding-website-url"
                    type="text"
                    placeholder={t("onboarding.websiteUrlPlaceholder")}
                    value={websiteUrl}
                    onChange={(event) => {
                      setWebsiteUrl(event.target.value);
                      setMessage("");
                    }}
                    disabled={hasNoWebsite || loading || loggingOut}
                  />
                </div>

                <button
                  className="onboarding-refresh-primary"
                  type="submit"
                  disabled={loading || loggingOut}
                >
                  <span>{t("onboarding.continue")}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              </form>

              {message && <p className="onboarding-refresh-message" role="status">{message}</p>}

              <div className="onboarding-refresh-security-note">
                <ShieldCheck size={21} aria-hidden="true" />
                <div>
                  <strong>{t("onboarding.securityTitle")}</strong>
                  <p>{t("onboarding.securityText")}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="onboarding-refresh-analysis" aria-live="polite">
              <div className="onboarding-refresh-analysis-hero">
                <div
                  className="onboarding-refresh-progress-ring"
                  style={{ "--analysis-progress": `${displayProgress * 3.6}deg` }}
                >
                  <span>{displayProgress}%</span>
                </div>

                <div>
                  <p>{t("onboarding.analysisEyebrow")}</p>
                  <h2>{t("onboarding.analysis.title")}</h2>
                  <span>{t("onboarding.analysis.description")}</span>
                </div>
              </div>

              <div className="onboarding-refresh-analysis-summary">
                <Building2 size={20} aria-hidden="true" />
                <div>
                  <span>{t("onboarding.businessName")}</span>
                  <strong>{businessName}</strong>
                </div>
                <div>
                  <span>{hasNoWebsite ? t("onboarding.describeBusiness") : t("onboarding.websiteUrl")}</span>
                  <strong>{hasNoWebsite ? brandDescription : normalizedWebsiteUrl}</strong>
                </div>
              </div>

              <div className="onboarding-refresh-analysis-track">
                <div style={{ width: `${Math.min(analysisProgress, 98.8)}%` }} />
              </div>

              <div className="onboarding-refresh-stage-list">
                {analysisProgressStages.map((stage, index) => {
                  const StageIcon = stage.icon || Circle;
                  const isDone = index < currentAnalysisStageIndex;
                  const isCurrent = currentAnalysisStage.titleKey === stage.titleKey;

                  return (
                    <article
                      key={stage.titleKey}
                      className={`${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
                    >
                      <span>
                        {isDone ? <Check size={16} aria-hidden="true" /> : <StageIcon size={17} aria-hidden="true" />}
                      </span>
                      <div>
                        <strong>{t(stage.titleKey)}</strong>
                        {isCurrent && <p>{t(stage.descriptionKey)}</p>}
                      </div>
                    </article>
                  );
                })}
              </div>

            </div>
          )}
        </section>
      </section>

      {analysisRescuePending && (
        <div className="analysis-rescue-customer-backdrop" role="presentation">
          <section className="analysis-rescue-customer-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-rescue-title">
            <div className="analysis-rescue-customer-icon" aria-hidden="true"><ShieldCheck size={28} /></div>
            <p className="analysis-rescue-customer-eyebrow">{t("onboarding.rescue.eyebrow")}</p>
            <h2 id="onboarding-rescue-title">{t("onboarding.rescue.title")}</h2>
            <p className="analysis-rescue-customer-lead">{t(analysisRescueReason === "security" ? "onboarding.rescue.reasonSecurity" : analysisRescueReason === "timeout" ? "onboarding.rescue.reasonTimeout" : "onboarding.rescue.text")}</p>
            <div className="analysis-rescue-customer-points">
              <article><Check size={18} aria-hidden="true" /><span>{t("onboarding.rescue.noAction")}</span></article>
              <article><CalendarHeart size={18} aria-hidden="true" /><span>{t("onboarding.rescue.calendar")}</span></article>
              <article><ArrowRight size={18} aria-hidden="true" /><span>{t("onboarding.rescue.email")}</span></article>
            </div>
            <button type="button" className="analysis-rescue-customer-primary" onClick={() => { setAnalysisRescuePending(false); window.location.href = "/"; }}>
              {t("onboarding.rescue.button")}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
