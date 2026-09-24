"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarHeart,
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
  PackageSearch,
  ScanSearch,
  ShoppingBag,
  Sparkles,
  Store,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { getValidAnalysisAccessToken } from "../../../lib/analysisSession";
import { ANALYSIS_VISUAL_MAX_PROGRESS, getSmoothAnalysisProgress } from "../../../lib/analysisProgress";
import {
  APP_LANGUAGE_SOURCE_STORAGE_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  getBrowserMatchedOfficialLocale,
  useUiText,
} from "../../../lib/i18n/useUiText";
import styles from "./page.module.css";

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

const EMBEDDED_SESSION_KEY = "spreelo_shopify_embedded_onboarding_session";

function getCurrentAnalysisStage(progress) {
  return [...analysisProgressStages].reverse().find((stage) => progress >= stage.progress) || analysisProgressStages[0];
}

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

async function readPayload(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || "Unexpected response" }; }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function primeShopifyOnboardingLocale() {
  if (typeof window === "undefined") return;

  const savedLocale = String(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || "").trim();
  const savedSource = String(localStorage.getItem(APP_LANGUAGE_SOURCE_STORAGE_KEY) || "").trim();
  const browserLocale = getBrowserMatchedOfficialLocale();

  // A deliberate Spreelo language choice always wins. App Store/bootstrap language
  // hints must never overwrite a language the customer explicitly selected.
  if (savedLocale && ["manual", "suggestion"].includes(savedSource)) return;

  // For seamless Shopify installs, the browser language is a better customer-facing
  // default than the Shopify Admin UI language. A merchant can run Shopify Admin in
  // English while their browser/customer language is Swedish, German, French, etc.
  if (browserLocale) {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, browserLocale);
    localStorage.setItem(APP_LANGUAGE_SOURCE_STORAGE_KEY, "browser");
  }
}

function shouldApplyShopifyLocaleFallback() {
  if (typeof window === "undefined") return false;
  const savedLocale = String(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || "").trim();
  const savedSource = String(localStorage.getItem(APP_LANGUAGE_SOURCE_STORAGE_KEY) || "").trim();
  if (savedLocale && ["manual", "suggestion", "browser"].includes(savedSource)) return false;
  return !getBrowserMatchedOfficialLocale();
}

async function pollAnalysisStatus({ accessToken, jobId, onStatus }) {
  let currentAccessToken = accessToken;

  for (let pollCount = 0; pollCount < 720; pollCount += 1) {
    await sleep(pollCount === 0 ? 1000 : 5000);

    currentAccessToken = await getValidAnalysisAccessToken({
      supabase,
      fallbackAccessToken: currentAccessToken,
    });

    const requestStatus = (token) => fetch(`/api/analyze-brand/status?jobId=${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    let response = await requestStatus(currentAccessToken);
    if (response.status === 401) {
      currentAccessToken = await getValidAnalysisAccessToken({
        supabase,
        fallbackAccessToken: currentAccessToken,
        forceRefresh: true,
      });
      response = await requestStatus(currentAccessToken);
    }

    const payload = await readPayload(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "Could not read analysis status.");
    }

    if (payload?.job) onStatus?.(payload.job);
    if (payload?.job?.status === "completed") return payload.job;
    if (payload?.job?.status === "failed") {
      throw new Error(payload?.job?.error_message || "Could not analyze this store.");
    }
  }

  throw new Error("Brand analysis took too long. Please try again.");
}

export default function ShopifyOnboardingPage() {
  // Prime locale synchronously before useUiText reads localStorage so the very first
  // visible Shopify onboarding frame can use the customer's browser language.
  useState(() => {
    primeShopifyOnboardingLocale();
    return true;
  });
  const { t, locale, setLocale, loading: translationsLoading } = useUiText(["shopifyOnboarding", "onboarding"]);
  const [phase, setPhase] = useState("starting");
  const [shop, setShop] = useState(null);
  const [brands, setBrands] = useState([]);
  const [message, setMessage] = useState("");
  const [workingBrandId, setWorkingBrandId] = useState("");
  const [pending, setPending] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisFailure, setAnalysisFailure] = useState(null);
  const [analysisRetryContext, setAnalysisRetryContext] = useState(null);
  const analysisStartedAtRef = useRef(0);
  const startedRef = useRef(false);

  const queryError = useMemo(() => {
    if (typeof window === "undefined") return "";
    return String(new URLSearchParams(window.location.search).get("error") || "").trim();
  }, []);
  const embeddedMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("embedded") === "1";
  }, []);

  useEffect(() => {
    if (phase !== "analyzing" || !analysisStartedAtRef.current) return;
    const timer = window.setInterval(() => {
      const timedProgress = getSmoothAnalysisProgress(analysisStartedAtRef.current);
      setAnalysisProgress((current) => Math.min(ANALYSIS_VISUAL_MAX_PROGRESS, Math.max(current, timedProgress)));
    }, 700);
    return () => window.clearInterval(timer);
  }, [phase]);

  function rememberBrand(userId, brandId) {
    if (!userId || !brandId || typeof window === "undefined") return;
    localStorage.setItem(getBrandStorageKey(userId), brandId);
    localStorage.setItem("spreelo_current_brand_id", brandId);
    localStorage.setItem("spreelo_selected_brand_id", brandId);
  }

  function goToGrowBrain(brandId = "", extra = {}) {
    const params = new URLSearchParams({ shopify: "connected", ...extra });
    if (brandId) params.set("brandId", brandId);
    window.location.href = `/grow-brain?${params.toString()}`;
  }

  function goToSocialChannels(brandId = "", extra = {}) {
    const params = new URLSearchParams({ onboarding: "shopify", shopify: "connected", ...extra });
    if (brandId) params.set("brandId", brandId);
    window.location.href = `/social-channels?${params.toString()}`;
  }

  function requestWelcomeEmail(accessToken) {
    if (!accessToken) return;
    fetch("/api/account/welcome-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ locale: locale || "en" }),
      keepalive: true,
    }).catch((error) => {
      console.error("Could not request Shopify welcome email", error);
    });
  }

  async function startBrandAnalysis({ session, brand, required, activeShop }) {
    if (!required || !session?.access_token || !brand?.id) return { status: "skipped", jobId: "" };
    try {
      const response = await fetch("/api/analyze-brand/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          brandProfileId: brand.id,
          businessName: brand.business_name || activeShop?.name || t("shopifyOnboarding.storeFallback"),
          websiteUrl: brand.website_url || (activeShop?.domain ? `https://${activeShop.domain}` : ""),
          brandDescription: "",
          contentMarket: "",
          countryCode: "",
          contentLanguage: "",
          notificationLocale: String(locale || navigator?.language || "en").split("-")[0],
          timezone: (() => {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
            catch { return "UTC"; }
          })(),
        }),
      });
      const payload = await readPayload(response);
      const jobId = String(payload?.jobId || payload?.job_id || payload?.job?.id || "").trim();
      if (!response.ok || !payload?.ok || !jobId) {
        return {
          status: "failed",
          jobId: "",
          errorCode: String(payload?.error || "analysis_start_failed"),
          errorMessage: String(payload?.message || payload?.error || "").trim(),
          analysisLimit: payload?.analysisLimit || null,
        };
      }
      return { status: "started", jobId };
    } catch (error) {
      console.error("Could not auto-start Shopify brand analysis", error);
      return {
        status: "failed",
        jobId: "",
        errorCode: "analysis_start_failed",
        errorMessage: String(error?.message || "").trim(),
        analysisLimit: null,
      };
    }
  }

  function goToAnalysisSummary(brandId) {
    window.location.href = `/onboarding/ready?brandId=${encodeURIComponent(brandId)}&source=shopify`;
  }

  function formatAnalysisLimitDate(value, timezone) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat(locale || "en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
      }).format(new Date(value));
    } catch {
      try { return new Date(value).toLocaleString(locale || undefined); }
      catch { return String(value); }
    }
  }

  function getAnalysisLimitDetails(failure) {
    const limit = failure?.analysisLimit || null;
    const reason = String(limit?.reason || "").trim();
    const code = String(failure?.errorCode || "").trim();
    if (code !== "analysis_usage_limit") return null;

    const timezone = String(limit?.timezone || "").trim();
    const plan = String(limit?.plan || "free").trim();
    if (reason === "daily_limit") {
      return {
        title: t("shopifyOnboarding.analysisError.dailyTitle"),
        text: t("shopifyOnboarding.analysisError.dailyText", {
          count: Number(limit?.dailyCount || 0),
          limit: Number(limit?.dailyLimit || 0),
          date: formatAnalysisLimitDate(limit?.dailyResetAt, timezone),
        }),
        meta: t("shopifyOnboarding.analysisError.planMeta", { plan }),
      };
    }
    if (reason === "monthly_limit") {
      return {
        title: t("shopifyOnboarding.analysisError.monthlyTitle"),
        text: t("shopifyOnboarding.analysisError.monthlyText", {
          count: Number(limit?.monthlyCount || 0),
          limit: Number(limit?.monthlyLimit || 0),
          date: formatAnalysisLimitDate(limit?.monthlyResetAt, timezone),
        }),
        meta: t("shopifyOnboarding.analysisError.planMeta", { plan }),
      };
    }
    if (reason === "cooldown") {
      return {
        title: t("shopifyOnboarding.analysisError.cooldownTitle"),
        text: t("shopifyOnboarding.analysisError.cooldownText", {
          date: formatAnalysisLimitDate(limit?.retryAt, timezone),
        }),
        meta: t("shopifyOnboarding.analysisError.planMeta", { plan }),
      };
    }
    return null;
  }

  function describeAnalysisFailure(failure) {
    const details = getAnalysisLimitDetails(failure);
    if (details?.text) return details.text;
    if (failure?.errorMessage) return failure.errorMessage;
    return t("shopifyOnboarding.analysisError.generic");
  }

  function stopOnAnalysisFailure({ failure, brand, activeShop, routeToAnalysisSummary }) {
    analysisStartedAtRef.current = 0;
    setAnalysisFailure(failure || { errorCode: "analysis_failed" });
    setAnalysisRetryContext({ brand, activeShop, routeToAnalysisSummary: Boolean(routeToAnalysisSummary) });
    setPhase("analysis_error");
  }

  async function continueAfterConsent({ session, brand, analysisRequired, activeShop, routeToAnalysisSummary = false }) {
    if (!analysisRequired && !routeToAnalysisSummary) {
      setPhase("done");
      window.setTimeout(() => goToGrowBrain(brand?.id || ""), 350);
      return;
    }

    setAnalysisFailure(null);
    setAnalysisRetryContext({ brand, activeShop, routeToAnalysisSummary: Boolean(routeToAnalysisSummary) });
    analysisStartedAtRef.current = Date.now();
    setAnalysisProgress(5);
    setPhase("analyzing");
    const analysis = await startBrandAnalysis({ session, brand, required: analysisRequired, activeShop });

    if (routeToAnalysisSummary) {
      if (analysis.status === "started" && analysis.jobId) {
        try {
          await pollAnalysisStatus({
            accessToken: session.access_token,
            jobId: analysis.jobId,
            onStatus: (job) => {
              const serverProgress = Number(job?.progress || 0);
              if (Number.isFinite(serverProgress) && serverProgress > 0) {
                setAnalysisProgress((current) => Math.min(99, Math.max(current, serverProgress)));
              }
            },
          });
          setAnalysisProgress(100);
          analysisStartedAtRef.current = 0;
          setPhase("done");
          window.setTimeout(() => goToAnalysisSummary(brand.id), 350);
          return;
        } catch (error) {
          console.error("Shopify first-time analysis did not complete in onboarding", error);
          stopOnAnalysisFailure({
            failure: { errorCode: "analysis_job_failed", errorMessage: String(error?.message || "").trim() },
            brand,
            activeShop,
            routeToAnalysisSummary,
          });
          return;
        }
      }

      stopOnAnalysisFailure({ failure: analysis, brand, activeShop, routeToAnalysisSummary });
      return;
    }

    if (analysis.status === "failed") {
      stopOnAnalysisFailure({ failure: analysis, brand, activeShop, routeToAnalysisSummary });
      return;
    }

    setAnalysisProgress(100);
    analysisStartedAtRef.current = 0;
    setPhase("done");
    window.setTimeout(() => {
      const extra = {};
      if (analysis.status === "started") extra.analysis = "started";
      goToGrowBrain(brand?.id || "", extra);
    }, 550);
  }

  async function retryAnalysis() {
    if (!analysisRetryContext?.brand?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("shopifyOnboarding.error.sessionExpired"));
      await continueAfterConsent({
        session,
        brand: analysisRetryContext.brand,
        analysisRequired: true,
        activeShop: analysisRetryContext.activeShop,
        routeToAnalysisSummary: analysisRetryContext.routeToAnalysisSummary,
      });
    } catch (error) {
      setAnalysisFailure({ errorCode: "analysis_retry_failed", errorMessage: String(error?.message || "").trim() });
      setPhase("analysis_error");
    }
  }

  async function finishConnection({ session, brandProfileId = "", createNew = false }) {
    setWorkingBrandId(createNew ? "new" : brandProfileId || "auto");
    setPhase((current) => current === "select_brand" ? "select_brand" : "connecting");
    setMessage("");

    const embeddedSessionId = typeof window !== "undefined"
      ? String(sessionStorage.getItem(EMBEDDED_SESSION_KEY) || "").trim()
      : "";
    const response = await fetch("/api/shopify/onboarding/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        brand_profile_id: brandProfileId || undefined,
        create_new: createNew,
        shopify_onboarding_session_id: embeddedSessionId || undefined,
      }),
    });
    const payload = await readPayload(response);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || t("shopifyOnboarding.error.connect"));

    const activeShop = payload?.shop || shop;
    setShop(activeShop);
    if (payload?.needs_brand_selection) {
      setBrands(payload?.brands || []);
      setPhase("select_brand");
      setWorkingBrandId("");
      return;
    }

    if (!payload?.brand?.id) throw new Error(t("shopifyOnboarding.error.workspace"));
    if (typeof window !== "undefined" && embeddedSessionId) {
      sessionStorage.removeItem(EMBEDDED_SESSION_KEY);
    }
    const { data: { user } } = await supabase.auth.getUser();
    rememberBrand(user?.id, payload.brand.id);

    const routeToAnalysisSummary = Boolean(payload?.analysis_required);

    // Shopify is only an acquisition/authentication bridge. Once the merchant
    // has a Spreelo session, initialize the same account lifecycle as the
    // ordinary Spreelo sign-up path (welcome lifecycle mail is deduplicated
    // server-side, so this is safe for existing accounts too).
    if (payload?.first_brand_for_user) {
      requestWelcomeEmail(session.access_token);
    }

    if (payload?.ai_consent_required) {
      setPending({
        brand: payload.brand,
        analysisRequired: Boolean(payload.analysis_required),
        activeShop,
        routeToAnalysisSummary,
      });
      setPhase("consent");
      setWorkingBrandId("");
      return;
    }

    await continueAfterConsent({
      session,
      brand: payload.brand,
      analysisRequired: Boolean(payload.analysis_required),
      activeShop,
      routeToAnalysisSummary,
    });
  }

  async function acceptAiConsent() {
    try {
      if (!pending?.brand?.id) throw new Error(t("shopifyOnboarding.error.brandMissing"));
      setMessage("");
      setPhase("saving_consent");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("shopifyOnboarding.error.sessionExpired"));
      const response = await fetch("/api/shopify/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ brand_profile_id: pending.brand.id, accepted: true }),
      });
      const payload = await readPayload(response);
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || t("shopifyOnboarding.error.saveChoice"));
      await continueAfterConsent({
        session,
        brand: pending.brand,
        analysisRequired: pending.analysisRequired,
        activeShop: pending.activeShop,
        routeToAnalysisSummary: Boolean(pending.routeToAnalysisSummary),
      });
    } catch (error) {
      setMessage(error?.message || t("shopifyOnboarding.error.saveChoice"));
      setPhase("consent");
    }
  }

  async function skipAiConsent() {
    try {
      if (!pending?.brand?.id) throw new Error(t("shopifyOnboarding.error.brandMissing"));
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("shopifyOnboarding.error.sessionExpired"));
      await continueAfterConsent({
        session,
        brand: pending.brand,
        analysisRequired: pending.analysisRequired,
        activeShop: pending.activeShop,
        routeToAnalysisSummary: Boolean(pending.routeToAnalysisSummary),
      });
    } catch (error) {
      setMessage(error?.message || t("shopifyOnboarding.error.continue"));
      setPhase("consent");
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      if (queryError) {
        setPhase("error");
        setMessage(t("shopifyOnboarding.error.finish"));
        return;
      }

      try {
        if (embeddedMode) {
          setPhase("connecting");
          const embeddedSessionId = String(sessionStorage.getItem(EMBEDDED_SESSION_KEY) || "").trim();
          if (!embeddedSessionId) throw new Error(t("shopifyOnboarding.error.prepare"));
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error(t("shopifyOnboarding.error.sessionExpired"));
          await finishConnection({ session });
          return;
        }

        setPhase("signing_in");
        const bootstrapResponse = await fetch("/api/shopify/onboarding/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const bootstrap = await readPayload(bootstrapResponse);
        if (!bootstrapResponse.ok || !bootstrap?.ok || !bootstrap?.token_hash) {
          throw new Error(bootstrap?.error || t("shopifyOnboarding.error.prepare"));
        }
        setShop(bootstrap.shop || null);
        // Shopify's associated-user locale describes the Admin UI language. Use it
        // only as a fallback when Spreelo has no explicit/browser language signal.
        if (bootstrap?.locale && shouldApplyShopifyLocaleFallback()) {
          setLocale(bootstrap.locale, "shopify");
        }

        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
          token_hash: bootstrap.token_hash,
          type: bootstrap.verification_type || "email",
        });
        if (authError || !authData?.session?.access_token) {
          throw authError || new Error(t("shopifyOnboarding.error.sessionCreate"));
        }

        setPhase("connecting");
        await finishConnection({ session: authData.session });
      } catch (error) {
        console.error("Shopify onboarding failed", error);
        setMessage(error?.message || t("shopifyOnboarding.error.finish"));
        setPhase("error");
        setWorkingBrandId("");
      }
    }

    run();
  }, [queryError, embeddedMode]);

  async function chooseBrand(brandProfileId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("shopifyOnboarding.error.sessionExpired"));
      await finishConnection({ session, brandProfileId });
    } catch (error) {
      setMessage(error?.message || t("shopifyOnboarding.error.connectBrand"));
      setWorkingBrandId("");
      setPhase("select_brand");
    }
  }

  async function createBrand() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("shopifyOnboarding.error.sessionExpired"));
      await finishConnection({ session, createNew: true });
    } catch (error) {
      setMessage(error?.message || t("shopifyOnboarding.error.createBrand"));
      setWorkingBrandId("");
      setPhase("select_brand");
    }
  }

  // Historical English test phrases now live in translation keys: "don't need to type a store address", "Store-specific AI permission", "Allow and continue", "Not now".
  const title = phase === "select_brand"
    ? t("shopifyOnboarding.selectBrand.title")
    : phase === "consent" || phase === "saving_consent"
      ? t("shopifyOnboarding.consent.title")
      : phase === "done"
        ? t("shopifyOnboarding.done.title")
        : phase === "error"
          ? t("shopifyOnboarding.error.title")
          : phase === "analysis_error"
            ? t("shopifyOnboarding.analysisError.title")
            : phase === "analyzing"
              ? t("shopifyOnboarding.analysis.title")
              : t("shopifyOnboarding.connecting.title");

  const text = phase === "select_brand"
    ? t("shopifyOnboarding.selectBrand.text")
    : phase === "consent" || phase === "saving_consent"
      ? t("shopifyOnboarding.consent.text")
      : phase === "done"
        ? t("shopifyOnboarding.done.text")
        : phase === "error"
          ? t("shopifyOnboarding.error.text")
          : phase === "analysis_error"
            ? t("shopifyOnboarding.analysisError.text")
            : phase === "analyzing"
              ? t("shopifyOnboarding.analysis.text")
              : t("shopifyOnboarding.connecting.text");

  const currentAnalysisStage = getCurrentAnalysisStage(analysisProgress);
  const currentAnalysisStageIndex = analysisProgressStages.findIndex((stage) => stage.titleKey === currentAnalysisStage.titleKey);
  const displayProgress = Math.min(99, Math.floor(analysisProgress));
  const analysisLimitDetails = phase === "analysis_error" ? getAnalysisLimitDetails(analysisFailure) : null;

  // Never flash English source labels while a non-English persistent translation
  // pack is being loaded/generated for the first Shopify onboarding visit.
  if (translationsLoading && String(locale || "en").toLowerCase() !== "en") {
    return (
      <main className={styles.page}>
        <section className={styles.shell} aria-busy="true">
          <div className={styles.brand}><img src="/brand/spreelologo.png" alt="Spreelo" /></div>
          <div className={styles.iconWrap}><LoaderCircle className={styles.spin} size={34} /></div>
          <div className={styles.languageLoadingDots} aria-hidden="true"><span /><span /><span /></div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.brand}><img src="/brand/spreelologo.png" alt="Spreelo" /></div>
        <div className={styles.iconWrap}>
          {phase === "done" ? <CheckCircle2 size={34} /> : phase === "consent" || phase === "saving_consent" ? <ShieldCheck size={34} /> : phase === "analysis_error" ? <ShieldCheck size={34} /> : phase === "select_brand" ? <Store size={34} /> : <ShoppingBag size={34} />}
        </div>
        <div className={styles.kicker}><Sparkles size={15} /> {t("shopifyOnboarding.kicker")}</div>
        <h1>{title}</h1>
        <p className={styles.lead}>{text}</p>

        {shop?.domain ? (
          <div className={styles.shopCard}>
            <span><ShoppingBag size={18} /></span>
            <div><strong>{shop.name || t("shopifyOnboarding.storeFallback")}</strong><small>{shop.domain}</small></div>
          </div>
        ) : null}

        {phase === "select_brand" ? (
          <div className={styles.choices}>
            {brands.map((brand) => (
              <button key={brand.id} type="button" onClick={() => chooseBrand(brand.id)} disabled={Boolean(workingBrandId)}>
                <span className={styles.choiceIcon}><Store size={18} /></span>
                <span><strong>{brand.business_name || t("common.unnamedBrand")}</strong><small>{brand.website_url || t("shopifyOnboarding.selectBrand.noWebsite")}</small></span>
                {workingBrandId === brand.id ? <LoaderCircle className={styles.spin} size={18} /> : <ArrowRight size={18} />}
              </button>
            ))}
            <button type="button" className={styles.newBrand} onClick={createBrand} disabled={Boolean(workingBrandId)}>
              <span className={styles.choiceIcon}><Sparkles size={18} /></span>
              <span><strong>{t("shopifyOnboarding.selectBrand.createTitle")}</strong><small>{t("shopifyOnboarding.selectBrand.createText")}</small></span>
              {workingBrandId === "new" ? <LoaderCircle className={styles.spin} size={18} /> : <ArrowRight size={18} />}
            </button>
          </div>
        ) : phase === "consent" || phase === "saving_consent" ? (
          <div className={styles.consentBox}>
            <div className={styles.consentTitle}><ShieldCheck size={19} /><strong>{t("shopifyOnboarding.consent.permissionTitle")}</strong></div>
            <p>{t("shopifyOnboarding.consent.permissionText")}</p>
            <p><strong>{t("shopifyOnboarding.consent.isolationText")}</strong></p>
            <div className={styles.consentActions}>
              <button type="button" className={styles.allow} onClick={acceptAiConsent} disabled={phase === "saving_consent"}>
                {phase === "saving_consent" ? <LoaderCircle className={styles.spin} size={18} /> : <ShieldCheck size={18} />}
                {t("shopifyOnboarding.consent.allow")}
              </button>
              <button type="button" className={styles.skip} onClick={skipAiConsent} disabled={phase === "saving_consent"}>{t("shopifyOnboarding.consent.notNow")}</button>
            </div>
          </div>
        ) : phase === "analyzing" ? (
          <div className={styles.analysisProgress} aria-live="polite">
            <div className={styles.analysisProgressHead}>
              <div>
                <strong>{t("shopifyOnboarding.analysis.progressTitle")}</strong>
                <span>{t(currentAnalysisStage.descriptionKey)}</span>
              </div>
              <b>{displayProgress}%</b>
            </div>
            <div className={styles.analysisTrack} aria-hidden="true">
              <div style={{ width: `${Math.min(analysisProgress, 98.8)}%` }} />
            </div>
            <div className={styles.analysisSteps}>
              {analysisProgressStages.map((stage, index) => {
                const StageIcon = stage.icon || Circle;
                const isDone = analysisProgress >= 100 || index < currentAnalysisStageIndex;
                const isCurrent = analysisProgress < 100 && currentAnalysisStage.titleKey === stage.titleKey;
                return (
                  <article key={stage.titleKey} className={`${isDone ? styles.isDone : ""} ${isCurrent ? styles.isCurrent : ""}`}>
                    <span className={styles.analysisDot}>
                      {isDone ? <Check size={14} aria-hidden="true" /> : <StageIcon size={15} aria-hidden="true" />}
                    </span>
                    <strong>{t(stage.titleKey)}</strong>
                  </article>
                );
              })}
            </div>
          </div>
        ) : phase === "analysis_error" ? (
          <div className={styles.analysisError} role="alert">
            <ShieldCheck size={24} aria-hidden="true" />
            <div>
              <strong>{analysisLimitDetails?.title || t("shopifyOnboarding.analysisError.problemTitle")}</strong>
              <p>{describeAnalysisFailure(analysisFailure)}</p>
              {analysisLimitDetails?.meta ? <small className={styles.analysisErrorMeta}>{analysisLimitDetails.meta}</small> : null}
              {analysisLimitDetails ? <small className={styles.analysisErrorNote}>{t("shopifyOnboarding.analysisError.connectedSafe")}</small> : null}
            </div>
            <div className={styles.analysisErrorActions}>
              <button type="button" onClick={retryAnalysis}>
                <LoaderCircle size={17} aria-hidden="true" />
                {t("shopifyOnboarding.analysisError.retry")}
              </button>
              <button type="button" className={styles.analysisErrorSecondary} onClick={() => goToSocialChannels(analysisRetryContext?.brand?.id || "", { analysis: "retry_available" })}>
                {t("shopifyOnboarding.analysisError.continue")}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : phase !== "error" && phase !== "done" ? (
          <div className={styles.progress} aria-live="polite">
            <LoaderCircle className={styles.spin} size={22} />
            <span>{phase === "signing_in" ? t("shopifyOnboarding.progress.confirmingIdentity") : t("shopifyOnboarding.progress.securingConnection")}</span>
          </div>
        ) : null}

        {message ? <div className={styles.error}>{message}</div> : null}

        {phase === "error" ? (
          <a className={styles.retry} href="https://admin.shopify.com">{t("shopifyOnboarding.error.openAdmin")} <ArrowRight size={17} /></a>
        ) : null}

        <div className={styles.security}>{t("shopifyOnboarding.security")}</div>
      </section>
    </main>
  );
}
