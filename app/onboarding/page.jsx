"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const onboardingAnalyzingSteps = [
  "Creating your brand profile...",
  "Fetching your website content...",
  "Understanding your business...",
  "Checking if website product posts are available...",
  "Finding useful campaign opportunities...",
  "Creating your campaign calendar...",
  "Saving everything to your workspace...",
  "Almost done. This can take a little longer for larger websites...",
];

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

export default function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [brandDescription, setBrandDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [currentAnalyzingStep, setCurrentAnalyzingStep] = useState(0);

  const normalizedWebsiteUrl = useMemo(() => {
    return normalizeWebsiteUrl(websiteUrl);
  }, [websiteUrl]);

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

      const { data: existingBrands, error } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (error) {
        setMessage(error.message);
        setChecking(false);
        return;
      }

      if ((existingBrands || []).length > 0) {
        window.location.href = "/";
        return;
      }

      setChecking(false);
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
        return currentStep;
      }

      return currentStep + 1;
    });
  }, 4500);

  return () => clearInterval(interval);
}, [loading]);
  async function handleSubmit(event) {
    event.preventDefault();

    if (!user?.id || loading) return;

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = brandDescription.trim();

    if (!trimmedBusinessName) {
      setMessage("Add your business name first.");
      return;
    }

    if (!hasNoWebsite && !normalizedWebsiteUrl) {
      setMessage("Add your website URL, or select that you do not have a website.");
      return;
    }

    if (hasNoWebsite && !trimmedDescription) {
      setMessage("Describe your business first.");
      return;
    }

    setLoading(true);
    setMessage("Creating your brand profile...");

    try {
      const { data: createdBrand, error: createError } = await supabase
        .from("brand_profiles")
        .insert({
          user_id: user.id,
          business_name: trimmedBusinessName,
          website_url: hasNoWebsite ? "" : normalizedWebsiteUrl,
          brand_description: hasNoWebsite ? trimmedDescription : "",
          industry: "",
          target_audience: "",
          content_market: "International / Global",
          country_code: "GLOBAL",
          content_language: "English",
          is_default: true,
          updated_at: new Date().toISOString(),
        })
        .select("id, business_name")
        .single();

      if (createError) {
        throw new Error(createError.message || "Could not create brand profile.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(user.id), createdBrand.id);
      }

      setMessage(
        hasNoWebsite
          ? "Analyzing your business description..."
          : "Analyzing your website..."
      );

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
          contentMarket: "International / Global",
          countryCode: "GLOBAL",
          contentLanguage: "English",
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
        <div className="brand login-brand">
          <img
            src="/brand/spreelologo.png"
            alt="Spreelo"
            className="spreelo-logo-image"
          />
        </div>

        <div className="login-content">
          <p className="eyebrow">Step 1 of 3</p>
          <h2>Set up your business</h2>
          <p>
            Add your website and Spreelo will prepare your brand profile
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
            onChange={(event) => setBusinessName(event.target.value)}
            required
          />

          <label>Website URL</label>
          <input
            className="input"
            type="text"
            placeholder="example.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            disabled={hasNoWebsite}
          />

          <label className="onboarding-checkbox">
            <input
              type="checkbox"
              checked={hasNoWebsite}
              onChange={(event) => {
                setHasNoWebsite(event.target.checked);
                if (event.target.checked) {
                  setWebsiteUrl("");
                }
              }}
            />
            <span>I don’t have a website</span>
          </label>

          {hasNoWebsite && (
            <>
              <label>Describe your business</label>
              <textarea
                className="input"
                rows={5}
                placeholder="Tell Spreelo what your business does, who your customers are and what you offer."
                value={brandDescription}
                onChange={(event) => setBrandDescription(event.target.value)}
                required
              />
            </>
          )}

          <button className="primary-button full" type="submit" disabled={loading}>
            {loading ? "Setting up..." : "Continue"}
          </button>
        </form>

        {message && <p className="login-message">{message}</p>}
      </section>
    </main>
  );
}
