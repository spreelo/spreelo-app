"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: "/icons/sidebar/dashboard.png",
  },
  {
    id: "create",
    label: "Content",
    href: "/create",
    icon: "/icons/sidebar/content.png",
  },
{
  id: "automation",
  label: "Content Creator",
  href: "/automation",
  icon: "/icons/sidebar/automation.png",
},
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: "/icons/sidebar/calendar.png",
  },
  {
    id: "brand",
    label: "Brand profile",
    href: "/brand",
    icon: "/icons/sidebar/brand-profile.png",
  },
  {
    id: "social-channels",
    label: "Social channels",
    href: "/social-channels",
    icon: "/icons/sidebar/social-channels.png",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: "/icons/sidebar/settings.png",
  },
];

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

export default function AppLayout({ active, children }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState([]);
  const [currentBrandId, setCurrentBrandId] = useState("");
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [creatingBrand, setCreatingBrand] = useState(false);

  const currentBrand = useMemo(() => {
    return (
      brandProfiles.find((brand) => brand.id === currentBrandId) ||
      brandProfiles[0] ||
      null
    );
  }, [brandProfiles, currentBrandId]);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUser(user);
      await loadBrands(user);
      setCheckingSession(false);
    }

    checkUser();
  }, []);

  async function loadBrands(currentUser) {
    setLoadingBrands(true);

    const { data, error } = await supabase
      .from("brand_profiles")
      .select("id, business_name, is_default, created_at")
      .eq("user_id", currentUser.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Could not load brands:", error);
      setBrandProfiles([]);
      setCurrentBrandId("");
      setLoadingBrands(false);
      return;
    }

    const brands = data || [];
    setBrandProfiles(brands);

    const storageKey = getBrandStorageKey(currentUser.id);
    const savedBrandId =
      typeof window !== "undefined" ? localStorage.getItem(storageKey) : "";

    const savedBrandExists = brands.some((brand) => brand.id === savedBrandId);
    const defaultBrand = brands.find((brand) => brand.is_default) || brands[0];

    const nextBrandId = savedBrandExists
      ? savedBrandId
      : defaultBrand?.id || "";

    setCurrentBrandId(nextBrandId);

    if (nextBrandId && typeof window !== "undefined") {
      localStorage.setItem(storageKey, nextBrandId);
    }

    setLoadingBrands(false);
  }

  function handleBrandChange(event) {
    const nextBrandId = event.target.value;

    setCurrentBrandId(nextBrandId);

    if (user?.id && typeof window !== "undefined") {
      localStorage.setItem(getBrandStorageKey(user.id), nextBrandId);
    }

    window.dispatchEvent(
      new CustomEvent("spreelo-current-brand-changed", {
        detail: {
          brandProfileId: nextBrandId,
        },
      })
    );

    window.location.reload();
  }

  async function handleCreateBrand() {
    if (!user?.id || creatingBrand) return;

    const brandName = window.prompt(
      "What should this brand or business be called?"
    );

    const trimmedBrandName = String(brandName || "").trim();

    if (!trimmedBrandName) return;

    setCreatingBrand(true);

    const { data, error } = await supabase
  .from("brand_profiles")
  .insert({
    user_id: user.id,
    business_name: trimmedBrandName,
    website_url: "",
    brand_description: "",
    industry: "",
    target_audience: "",
    content_market: "International / Global",
    country_code: "GLOBAL",
    content_language: "English",
    is_default: brandProfiles.length === 0,
    updated_at: new Date().toISOString(),
  })
      .select("id, business_name, is_default, created_at")
      .single();

    if (error) {
      console.error("Could not create brand:", error);
      alert(error.message || "Could not create brand.");
      setCreatingBrand(false);
      return;
    }

    const nextBrands = [...brandProfiles, data];

    setBrandProfiles(nextBrands);
    setCurrentBrandId(data.id);

    if (typeof window !== "undefined") {
      localStorage.setItem(getBrandStorageKey(user.id), data.id);
    }

    setCreatingBrand(false);
    window.location.href = "/brand";
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (checkingSession) {
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

          <p className="login-message">Loading your workspace...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell spreelo-shell">
      <aside className="sidebar spreelo-sidebar">
      <div className="brand spreelo-brand">
  <img
    src="/brand/spreelologo.png"
    alt="Spreelo"
    className="spreelo-logo-image"
  />
</div>

        <div className="current-brand-card">
          <label>Current brand</label>

          {loadingBrands ? (
            <div className="current-brand-loading">Loading brands...</div>
          ) : brandProfiles.length > 0 ? (
            <select
              className="current-brand-select"
              value={currentBrand?.id || ""}
              onChange={handleBrandChange}
            >
              {brandProfiles.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.business_name || "Unnamed brand"}
                </option>
              ))}
            </select>
          ) : (
            <div className="current-brand-loading">No brand yet</div>
          )}

          <button
            type="button"
            className="current-brand-new"
            onClick={handleCreateBrand}
            disabled={creatingBrand}
          >
            {creatingBrand ? "Creating..." : "+ New brand"}
          </button>
        </div>

        <nav className="nav spreelo-nav">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={active === item.id ? "active" : ""}
              href={item.href}
            >
<img
  src={item.icon}
  alt=""
  className="sidebar-menu-icon"
/>
<span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer spreelo-sidebar-footer">
          <div className="sidebar-plan-card">
            <div className="sidebar-plan-icon">✦</div>
            <div>
              <strong>Plan: Pro</strong>
              <span>Upgrade for more credits & features</span>
            </div>
            <span className="sidebar-plan-arrow">›</span>
          </div>

          <div className="sidebar-user-email">{user?.email}</div>

          <button type="button" onClick={handleLogout}>
            <span>⇱</span>
            Log out
          </button>
        </div>
      </aside>

      <section className="content spreelo-content">{children}</section>
    </main>
  );
}
