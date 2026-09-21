"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Globe2,
  LogOut,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

const launchPlatforms = [
  { key: "facebook", label: "Facebook", icon: "/social-icons/facebook.png" },
  { key: "instagram", label: "Instagram", icon: "/social-icons/instagram.png" },
  { key: "linkedin", label: "LinkedIn", icon: "/social-icons/linkedin.png" },
  { key: "tiktok", label: "TikTok", icon: "/social-icons/tiktok.png" },
  { key: "youtube", label: "YouTube", icon: "/social-icons/youtube.png" },
  { key: "x", label: "X", icon: "/social-icons/x.png" },
  { key: "threads", label: "Threads", icon: "/social-icons/threads.svg" },
  { key: "pinterest", label: "Pinterest", icon: "/social-icons/pinterest.png" },
];

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function getCampaignDate(campaign) {
  return campaign?.event_date || campaign?.start_date || campaign?.end_date || "";
}

function getUpcomingCampaigns(campaigns) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...(campaigns || [])].sort((left, right) => {
    const leftTime = new Date(getCampaignDate(left) || "2999-12-31").getTime();
    const rightTime = new Date(getCampaignDate(right) || "2999-12-31").getTime();
    return leftTime - rightTime;
  });

  const upcoming = sorted.filter((campaign) => {
    const value = getCampaignDate(campaign);
    if (!value) return true;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp >= today.getTime();
  });

  return (upcoming.length > 0 ? upcoming : sorted).slice(0, 3);
}

export default function OnboardingReadyPage() {
  const { t, locale } = useUiText(["onboardingReady"]);
  const [brand, setBrand] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignCount, setCampaignCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const upcomingCampaigns = useMemo(
    () => getUpcomingCampaigns(campaigns),
    [campaigns]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          window.location.href = "/login";
          return;
        }

        const params = new URLSearchParams(window.location.search);
        let brandId = String(
          params.get("brandId") ||
            localStorage.getItem(getBrandStorageKey(user.id)) ||
            localStorage.getItem("spreelo_current_brand_id") ||
            ""
        ).trim();

        if (!brandId) {
          const { data: fallbackBrands, error: fallbackError } = await supabase
            .from("brand_profiles")
            .select("id")
            .eq("user_id", user.id)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1);

          if (fallbackError) throw fallbackError;
          brandId = String(fallbackBrands?.[0]?.id || "");
        }

        if (!brandId) {
          window.location.href = "/onboarding";
          return;
        }

        const [{ data: profile, error: profileError }, campaignResult] =
          await Promise.all([
            supabase
              .from("brand_profiles")
              .select(
                "id, business_name, website_url, brand_description, industry, target_audience, content_market, country_code, content_language, logo_url"
              )
              .eq("id", brandId)
              .eq("user_id", user.id)
              .single(),
            supabase
              .from("brand_campaign_opportunities")
              .select(
                "id, title, description, relevance_reason, event_date, start_date, end_date, is_active",
                { count: "exact" }
              )
              .eq("brand_profile_id", brandId)
              .eq("is_active", true)
              .limit(80),
          ]);

        if (profileError) throw profileError;
        if (campaignResult.error) throw campaignResult.error;

        localStorage.setItem(getBrandStorageKey(user.id), brandId);
        localStorage.setItem("spreelo_current_brand_id", brandId);

        if (!cancelled) {
          setBrand(profile);
          setCampaigns(campaignResult.data || []);
          setCampaignCount(
            Number(campaignResult.count ?? campaignResult.data?.length ?? 0)
          );
        }
      } catch (loadError) {
        console.error("Could not load onboarding results:", loadError);
        if (!cancelled) {
          setError(loadError?.message || t("onboardingReady.errorText"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, []);

  function formatCampaignDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(locale || "en", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="onboarding-ready-page">
        <section className="onboarding-ready-loader" aria-live="polite">
          <img src="/brand/spreelologo.png" alt="Spreelo" />
          <span />
          <p>{t("onboardingReady.loading")}</p>
        </section>
      </main>
    );
  }

  if (error || !brand) {
    return (
      <main className="onboarding-ready-page">
        <section className="onboarding-ready-error">
          <ShieldCheck size={32} aria-hidden="true" />
          <h1>{t("onboardingReady.errorTitle")}</h1>
          <p>{error || t("onboardingReady.errorText")}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {t("onboardingReady.retry")}
          </button>
        </section>
      </main>
    );
  }

  const brandName = brand.business_name || "Spreelo";
  const brandTitleToken = "__SPREELO_BRAND_NAME__";
  const readyTitleParts = t("onboardingReady.title", {
    brandName: brandTitleToken,
  }).split(brandTitleToken);
  const profileRows = [
    {
      label: t("onboardingReady.industry"),
      value: brand.industry || brand.brand_description,
      Icon: Building2,
    },
    {
      label: t("onboardingReady.audience"),
      value: brand.target_audience,
      Icon: UserRound,
    },
    {
      label: t("onboardingReady.market"),
      value: brand.content_market || brand.country_code,
      Icon: Target,
    },
    {
      label: t("onboardingReady.language"),
      value: brand.content_language,
      Icon: Globe2,
    },
  ];

  return (
    <main className="onboarding-ready-page">
      <header className="onboarding-ready-topbar">
        <img src="/brand/spreelologo.png" alt="Spreelo" />
        <button type="button" onClick={handleLogout} disabled={loggingOut}>
          <LogOut size={17} aria-hidden="true" />
          {t("onboardingReady.logout")}
        </button>
      </header>

      <section className="onboarding-ready-hero">
        <div className="onboarding-ready-hero-copy">
          <span className="onboarding-ready-eyebrow">
            <CheckCircle2 size={17} aria-hidden="true" />
            {t("onboardingReady.eyebrow")}
          </span>
          <h1>
            {readyTitleParts[0]}
            <span>{brandName}</span>
            {readyTitleParts.slice(1).join(brandTitleToken)}
          </h1>
          <p>{t("onboardingReady.description")}</p>
          <div className="onboarding-ready-actions">
            <a className="is-primary" href={`/social-channels?brandId=${encodeURIComponent(brand.id)}`}>
              {t("onboardingReady.connectChannels")}
              <ArrowRight size={19} aria-hidden="true" />
            </a>
            <a href="/calendar">{t("onboardingReady.viewCalendar")}</a>
          </div>
        </div>

        <div className="onboarding-ready-hero-status" aria-hidden="true">
          <header>
            <span><Sparkles size={22} /></span>
            <div>
              <small>SPREELO AI</small>
              <strong>{t("onboardingReady.resultBadge")}</strong>
            </div>
            <CheckCircle2 size={22} />
          </header>
          <div>
            <span><Check size={15} /> {t("onboardingReady.profileTitle")}</span>
            <span><Check size={15} /> {t("onboardingReady.calendarTitle")}</span>
            <span><Check size={15} /> {t("onboardingReady.strategyTitle")}</span>
          </div>
        </div>
      </section>

      <section className="onboarding-ready-created-grid">
        <article>
          <span><BadgeCheck size={23} /></span>
          <div>
            <h2>{t("onboardingReady.profileTitle")}</h2>
            <p>{t("onboardingReady.profileText")}</p>
          </div>
        </article>
        <article>
          <span><CalendarDays size={23} /></span>
          <div>
            <h2>{t("onboardingReady.calendarTitle")}</h2>
            <p>{t("onboardingReady.calendarText", { count: campaignCount })}</p>
          </div>
        </article>
        <article>
          <span><WandSparkles size={23} /></span>
          <div>
            <h2>{t("onboardingReady.strategyTitle")}</h2>
            <p>{t("onboardingReady.strategyText")}</p>
          </div>
        </article>
      </section>

      <section className="onboarding-ready-main-grid">
        <article className="onboarding-ready-analysis-card">
          <header>
            <div>
              <span>{t("onboardingReady.resultBadge")}</span>
              <h2>{t("onboardingReady.analysisTitle", { brandName })}</h2>
              <p>{t("onboardingReady.analysisDescription")}</p>
            </div>
            {brand.logo_url ? <img src={brand.logo_url} alt={brandName} /> : null}
          </header>

          <div className="onboarding-ready-profile-grid">
            {profileRows.map(({ label, value, Icon }) => (
              <div key={label}>
                <span><Icon size={18} aria-hidden="true" /></span>
                <dl>
                  <dt>{label}</dt>
                  <dd>{value || t("onboardingReady.notAvailable")}</dd>
                </dl>
              </div>
            ))}
          </div>

          {brand.website_url && (
            <div className="onboarding-ready-website">
              <Globe2 size={18} aria-hidden="true" />
              <span>{t("onboardingReady.website")}</span>
              <strong>{brand.website_url}</strong>
            </div>
          )}

          <footer>
            <p>{t("onboardingReady.profileHint")}</p>
            <a href="/brand">{t("onboardingReady.openProfile")}</a>
          </footer>
        </article>

        <article className="onboarding-ready-campaign-card">
          <span className="onboarding-ready-card-eyebrow">
            <CalendarDays size={17} />
            {t("onboardingReady.calendarTitle")}
          </span>
          <h2>{t("onboardingReady.campaignTitle")}</h2>
          <p>{t("onboardingReady.campaignDescription")}</p>

          <div className="onboarding-ready-campaign-list">
            {upcomingCampaigns.length > 0 ? (
              upcomingCampaigns.map((campaign) => (
                <div key={campaign.id}>
                  <span>{formatCampaignDate(getCampaignDate(campaign))}</span>
                  <strong>{campaign.title}</strong>
                  <p>{campaign.description || campaign.relevance_reason}</p>
                </div>
              ))
            ) : (
              <p className="onboarding-ready-empty">{t("onboardingReady.noCampaigns")}</p>
            )}
          </div>

          <a href="/calendar">
            {t("onboardingReady.viewCalendar")}
            <ArrowRight size={18} />
          </a>
        </article>
      </section>

      <section className="onboarding-ready-channels">
        <div className="onboarding-ready-channels-copy">
          <span>{t("onboardingReady.channelsEyebrow")}</span>
          <h2>{t("onboardingReady.channelsTitle")}</h2>
          <p>{t("onboardingReady.channelsDescription")}</p>
          <small><ShieldCheck size={16} /> {t("onboardingReady.channelsNote")}</small>
        </div>

        <div className="onboarding-ready-platforms" aria-label={t("onboardingReady.channelsTitle")}>
          {launchPlatforms.map((platform) => (
            <div key={platform.key} title={platform.label}>
              {platform.icon ? (
                <img src={platform.icon} alt="" />
              ) : (
                <span>{platform.fallback}</span>
              )}
              <strong>{platform.label}</strong>
            </div>
          ))}
        </div>

        <a href={`/social-channels?brandId=${encodeURIComponent(brand.id)}`}>
          {t("onboardingReady.connectChannels")}
          <ArrowRight size={19} />
        </a>
      </section>

      <section className="onboarding-ready-automation">
        <div>
          <span><Sparkles size={24} /></span>
          <div>
            <h2>{t("onboardingReady.automationTitle")}</h2>
            <p>{t("onboardingReady.automationText")}</p>
          </div>
        </div>
        <a href={`/social-channels?brandId=${encodeURIComponent(brand.id)}`}>
          {t("onboardingReady.continue")}
          <ArrowRight size={19} />
        </a>
      </section>
    </main>
  );
}
