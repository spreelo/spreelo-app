"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Share2,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useUiText } from "../lib/i18n/useUiText";
import LanguageSuggestionBanner from "./LanguageSuggestionBanner";

const navItems = [
  {
    id: "dashboard",
    labelKey: "layout.nav.dashboard",
    href: "/",
    Icon: LayoutDashboard,
  },
  {
    id: "automation",
    label: "AI Content Studio",
    labelKey: "layout.nav.aiContentStudio",
    href: "/automation",
    Icon: WandSparkles,
  },
  {
    id: "calendar",
    label: "Your AI Calendar",
    labelKey: "layout.nav.yourAiCalendar",
    href: "/calendar",
    Icon: CalendarDays,
  },
  {
    id: "brand",
    labelKey: "layout.nav.brand",
    href: "/brand",
    Icon: BadgeCheck,
  },
  {
    id: "social-channels",
    labelKey: "layout.nav.socialChannels",
    href: "/social-channels",
    Icon: Share2,
  },
  {
    id: "settings",
    labelKey: "layout.nav.settings",
    href: "/settings",
    Icon: Settings,
  },
];

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function SidebarMenuIcon({ Icon }) {
  return (
    <span className="sidebar-menu-icon-wrap" aria-hidden="true">
      <Icon className="sidebar-menu-icon" strokeWidth={1.9} />
    </span>
  );
}

export default function AppLayout({ active, children }) {
  const { t, locale } = useUiText(["layout"]);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState([]);
  const [currentBrandId, setCurrentBrandId] = useState("");
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

    if (brands.length === 0) {
      window.location.href = "/onboarding";
      return;
    }

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
      t("layout.createBrandPrompt")
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
      alert(error.message || t("layout.createBrandError"));
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


  function getNavLabel(item) {
    return t(item.labelKey);
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

          <p className="login-message">{t("layout.loadingWorkspace")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell spreelo-shell">
      <header className="spreelo-mobile-header">
        <a href="/" className="spreelo-mobile-logo">
          <img
            src="/brand/spreelologo.png"
            alt="Spreelo"
            className="spreelo-logo-image"
          />
        </a>

        <div className="spreelo-mobile-brand">
          <span>{t("common.currentBrand")}</span>
          <strong>
            {loadingBrands
              ? t("common.loading")
              : currentBrand?.business_name || t("common.noBrand")}
          </strong>
        </div>

        <button
          type="button"
          className={`spreelo-mobile-menu-button ${
            mobileMenuOpen ? "open" : ""
          }`}
          onClick={() => setMobileMenuOpen((current) => !current)}
          aria-label={mobileMenuOpen ? t("layout.closeMenu") : t("layout.openMenu")}
        >
          {mobileMenuOpen ? (
            <X className="spreelo-mobile-menu-icon" aria-hidden="true" />
          ) : (
            <Menu className="spreelo-mobile-menu-icon" aria-hidden="true" />
          )}
        </button>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          className="spreelo-mobile-menu-backdrop"
          aria-label={t("layout.closeMenu")}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`sidebar spreelo-sidebar ${
          mobileMenuOpen ? "mobile-open" : ""
        }`}
      >
        <div className="brand spreelo-brand">
          <img
            src="/brand/spreelologo.png"
            alt="Spreelo"
            className="spreelo-logo-image"
          />
        </div>

        <div className="current-brand-card">
          <label>{t("common.currentBrand")}</label>

          {loadingBrands ? (
            <div className="current-brand-loading">{t("layout.loadingBrands")}</div>
          ) : brandProfiles.length > 0 ? (
            <div className="current-brand-select-wrap">
              <span className="current-brand-business-icon" aria-hidden="true">
                <BriefcaseBusiness size={16} strokeWidth={1.9} />
              </span>

              <select
                className="current-brand-select"
                value={currentBrand?.id || ""}
                onChange={handleBrandChange}
              >
                {brandProfiles.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.business_name || t("common.unnamedBrand")}
                  </option>
                ))}
              </select>

              <ChevronDown
                className="current-brand-chevron"
                size={15}
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="current-brand-loading">{t("layout.noBrandYet")}</div>
          )}

          <button
            type="button"
            className="current-brand-new"
            onClick={handleCreateBrand}
            disabled={creatingBrand}
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            {creatingBrand ? t("layout.creating") : t("layout.addNewBrand")}
          </button>
        </div>

        <nav className="nav spreelo-nav">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={active === item.id ? "active" : ""}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
            >
              <SidebarMenuIcon Icon={item.Icon} />
              <span>{getNavLabel(item)}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer spreelo-sidebar-footer">
          <div className="sidebar-plan-card">
            <div className="sidebar-plan-icon" aria-hidden="true">
              <Sparkles size={17} strokeWidth={2.1} />
            </div>

            <div>
              <strong>{t("layout.planPro")}</strong>
              <span>{t("layout.upgradeText")}</span>
            </div>

            <ChevronRight
              className="sidebar-plan-arrow"
              size={18}
              strokeWidth={2}
              aria-hidden="true"
            />
          </div>

          <button
            type="button"
            className="sidebar-logout-button"
            onClick={handleLogout}
          >
            <LogOut size={15} strokeWidth={2} aria-hidden="true" />
            {t("layout.logout")}
          </button>
        </div>
      </aside>

      <section className="content spreelo-content">
        {active !== "settings" && <LanguageSuggestionBanner />}
        {children}
      </section>
    </main>
  );
}
