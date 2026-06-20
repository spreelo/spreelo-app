"use client";

import { useEffect, useMemo, useState } from "react";
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

const onboardingAnalyzingSteps = [
  "Creating your brand profile...",
  "Fetching your website content...",
  "Reading your business information...",
  "Detecting market and language...",
  "Preparing your AI profile...",
  "Finding relevant content opportunities...",
  "Building your campaign calendar...",
  "Saving everything to your workspace...",
  "Still working — some websites take a little longer to analyze.",
  "Almost there — Spreelo is preparing your brand setup.",
  "This can take up to a minute for larger websites.",
  "Still processing — please keep this page open.",
];

const longOnboardingStepStartIndex = 8;

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

export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");

  const [contentMarket, setContentMarket] = useState("International / Global");
  const [countryCode, setCountryCode] = useState("GLOBAL");
  const [contentLanguage, setContentLanguage] = useState("English");

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
        setMessage(error.message || "Could not prepare your workspace.");
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
        if (currentStep >= onboardingAnalyzingSteps.length - 1) {
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
      setMessage(error.message || "Could not log out.");
      setLoggingOut(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user?.id || loading || loggingOut) return;

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
      setMessage(
        "Add your website URL, or select that you do not have a website."
      );
      return;
    }

    if (hasNoWebsite && !trimmedDescription) {
      setMessage("Describe your business first.");
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

        throw new Error(
          createError.message || "Could not create brand profile."
        );
      }

      saveCurrentBrand(user.id, createdBrand.id);

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
          brandProfileId: createdBrand.id,
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

      setMessage("Your brand profile is ready.");
      window.location.href = "/social-channels";
    } catch (error) {
      setMessage(error.message || "Something went wrong.");
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

          <p className="login-message">Preparing your workspace...</p>
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
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>

        <div className="login-content">
          <p className="eyebrow">Step 1 of 3</p>
          <h2>Set up your business</h2>
          <p>
            Add your website or describe your business. Spreelo will prepare
            your brand profile, content ideas and campaign calendar
            automatically.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>Business name</label>
          <input
            className="input"
            type="text"
            placeholder="Example: Luna Studio"
            value={businessName}
            onChange={(event) => {
              setBusinessName(event.target.value);
              setMessage("");
            }}
            required
            disabled={loading || loggingOut}
          />

          <label>Website URL</label>
          <input
            className="input"
            type="text"
            placeholder="example.com"
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
            <span>I don’t have a website</span>
          </label>

          <div className="onboarding-market-grid">
            <div>
              <label>Content market</label>
              <select
                className="input"
                value={contentMarket}
                onChange={handleMarketChange}
                disabled={loading || loggingOut}
              >
                {marketOptions.map((option) => (
                  <option key={option.countryCode} value={option.label}>
                    {option.label}
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
                  setMessage("");
                }}
                disabled={loading || loggingOut}
              >
                {languageOptions.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasNoWebsite && (
            <>
              <label>Describe your business</label>
              <textarea
                className="input"
                rows={5}
                placeholder="Tell Spreelo what your business does, who your customers are and what you offer."
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
            {loading ? "Setting up..." : "Continue"}
          </button>
        </form>

        {loading ? (
          <div className="brand-profile-analyzing-card onboarding-analyzing-card">
            <div className="brand-profile-spinner" />

            <div>
              <strong>
                {onboardingAnalyzingSteps[currentAnalyzingStep]}
              </strong>
              <p>
                Spreelo is still working. Larger websites and campaign
                calendars can take a little longer, so please keep this page
                open.
              </p>
            </div>
          </div>
        ) : (
          message && <p className="login-message">{message}</p>
        )}
      </section>
    </main>
  );
}
