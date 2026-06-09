"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

export default function BrandProfile() {
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

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

      const { data, error } = await supabase
        .from("brand_profiles")
        .select("business_name, website_url, industry, target_audience")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        setMessage(error.message);
      }

      if (data) {
        setBusinessName(data.business_name || "");
        setWebsiteUrl(data.website_url || "");
        setIndustry(data.industry || "");
        setTargetAudience(data.target_audience || "");
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

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

  async function saveProfile() {
    if (!user) return;

    setSaving(true);
    setMessage("");

    const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

    const { error } = await supabase.from("brand_profiles").upsert(
      {
        user_id: user.id,
        business_name: businessName.trim(),
        website_url: normalizedWebsiteUrl,
        industry: industry.trim(),
        target_audience: targetAudience.trim(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      setMessage(error.message);
    } else {
      setWebsiteUrl(normalizedWebsiteUrl);
      setMessage("Brand profile saved.");
    }

    setSaving(false);
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
      <header className="topbar">
        <div>
          <p className="eyebrow">Brand profile</p>
          <h2>Teach Spreelo about your business</h2>
        </div>
        <button
          className="primary-button"
          onClick={saveProfile}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Business context</p>
          <h3>Your brand voice matters</h3>
          <p>
            Spreelo will use this information to create posts that sound like
            your business, match your audience and fit your offers.
          </p>

          <div className="mini-info-card">
            <strong>Website URL is important</strong>
            <p>
              Spreelo can use your website later to find products, services,
              listings and offers for automated posts.
            </p>
          </div>
        </div>

        <div className="prompt-box">
          <label>Business name</label>
          <input
            className="input"
            placeholder="Example: Spreelo"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
          />

          <label>Website URL</label>
          <input
            className="input"
            placeholder="Example: https://www.yourbusiness.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />

          <label>Industry</label>
          <input
            className="input"
            placeholder="Example: Restaurant, salon, ecommerce..."
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          />

          <label>Target audience</label>
          <textarea
            placeholder="Example: Local customers, small business owners, parents..."
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
          />

          <button
            className="primary-button full"
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save brand profile"}
          </button>

          {message && <p className="login-message">{message}</p>}
        </div>
      </section>
    </AppLayout>
  );
}
