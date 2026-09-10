"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Share2,
  ShieldCheck,
  CreditCard,
  Globe2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useUiText } from "../lib/i18n/useUiText";
import LanguageSuggestionBanner from "./LanguageSuggestionBanner";
import PlanLimitModal from "./PlanLimitModal";
import { buildPlanLimitDetails, getPlanEntitlements, parsePlanLimitDatabaseError } from "../lib/planEntitlements";

const SESSION_CHECK_ATTEMPTS = 3;
const SESSION_CHECK_RETRY_DELAY_MS = 900;
const SESSION_REQUEST_TIMEOUT_MS = 12000;
const WORKSPACE_REQUEST_TIMEOUT_MS = 20000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Request timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const navItems = [
  {
    id: "dashboard",
    labelKey: "layout.nav.home",
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
    id: "admin",
    labelKey: "layout.nav.admin",
    href: "/admin",
    Icon: ShieldCheck,
    adminOnly: true,
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

function SpreeloLogo() {
  return (
    <span className="spreelo-logo-lockup spreelo-logo-lockup-official" aria-label="Spreelo">
      <img
        src="/brand/spreelologo-on-dark.png"
        alt=""
        className="spreelo-official-logo-image"
        aria-hidden="true"
      />
    </span>
  );
}

export default function AppLayout({ active, children }) {
  const { t, locale, loading: translationsLoading } = useUiText(["layout"]);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionCheckError, setSessionCheckError] = useState("");
  const [brandProfiles, setBrandProfiles] = useState([]);
  const [currentBrandId, setCurrentBrandId] = useState("");
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [showCreateBrandModal, setShowCreateBrandModal] = useState(false);
  const [newBrandWebsite, setNewBrandWebsite] = useState("");
  const [newBrandError, setNewBrandError] = useState("");
  const [planLimitDetails, setPlanLimitDetails] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAccessChecked, setAdminAccessChecked] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [creditBalance, setCreditBalance] = useState(null);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const avatarInputRef = useRef(null);

  const currentBrand = useMemo(() => {
    return (
      brandProfiles.find((brand) => brand.id === currentBrandId) ||
      brandProfiles[0] ||
      null
    );
  }, [brandProfiles, currentBrandId]);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    function requestAvatarPicker() {
      avatarInputRef.current?.click();
    }

    function syncAvatar(event) {
      const updatedUser = event?.detail?.user;
      if (updatedUser) setUser(updatedUser);
    }

    window.addEventListener("spreelo-avatar-picker-requested", requestAvatarPicker);
    window.addEventListener("spreelo-avatar-updated", syncAvatar);
    return () => {
      window.removeEventListener("spreelo-avatar-picker-requested", requestAvatarPicker);
      window.removeEventListener("spreelo-avatar-updated", syncAvatar);
    };
  }, []);

  async function getSessionWithRetry() {
    let lastError = null;

    for (let attempt = 0; attempt < SESSION_CHECK_ATTEMPTS; attempt++) {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_REQUEST_TIMEOUT_MS
        );

        if (data?.session?.user) {
          return { session: data.session, error: null };
        }

        if (!error) {
          return { session: null, error: null };
        }

        lastError = error;
      } catch (error) {
        lastError = error;
      }

      if (attempt < SESSION_CHECK_ATTEMPTS - 1) {
        await sleep(SESSION_CHECK_RETRY_DELAY_MS * (attempt + 1));
      }
    }

    return { session: null, error: lastError };
  }

  async function checkUser() {
    setCheckingSession(true);
    setSessionCheckError("");

    try {
      const { session, error } = await getSessionWithRetry();

      if (error) {
        console.error("Could not verify session:", error);
        setSessionCheckError(t("layout.sessionTemporaryError"));
        return;
      }

      if (!session?.user) {
        window.location.href = "/login";
        return;
      }

      setUser(session.user);

      const [brandsLoaded] = await Promise.all([
        loadBrands(session.user),
        checkAdminAccess(),
        loadCreditBalance(session.user),
      ]);

      if (!brandsLoaded) {
        setSessionCheckError(t("layout.workspaceTemporaryError"));
      }
    } catch (error) {
      console.error("Could not load workspace:", error);
      setSessionCheckError(t("layout.workspaceTemporaryError"));
    } finally {
      setCheckingSession(false);
    }
  }


  async function loadCreditBalance(currentUser) {
    setLoadingCredits(true);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("user_credit_balances")
          .select("credits_remaining, monthly_credit_limit, plan_name, subscription_plan, subscription_status, current_period_end, credits_renewed_at, trial_end, purchased_credits_remaining")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        WORKSPACE_REQUEST_TIMEOUT_MS
      );

      if (error) throw error;
      setCreditBalance(data || null);
    } catch (error) {
      console.error("Could not load credit balance:", error);
      setCreditBalance(null);
    } finally {
      setLoadingCredits(false);
    }
  }

  function getCreditResetLabel() {
    const value = creditBalance?.current_period_end || creditBalance?.credits_renewed_at;
    if (!value) return t("layout.creditsResetUnknown");

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("layout.creditsResetUnknown");

    try {
      return new Intl.DateTimeFormat(locale || "en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    } catch {
      return date.toLocaleDateString(locale || "en");
    }
  }

  function getPlanLabel() {
    const raw = String(
      creditBalance?.plan_name || creditBalance?.subscription_plan || "Free"
    ).trim();
    if (!raw) return "Free";
    return raw.replace(/^plan\s*:\s*/i, "");
  }

  async function checkAdminAccess() {
    let nextIsAdmin = false;
    try {
      const {
        data: { session },
      } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_REQUEST_TIMEOUT_MS
      );

      if (session?.access_token) {
        const response = await withTimeout(
          fetch("/api/admin/me", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          SESSION_REQUEST_TIMEOUT_MS
        );

        const payload = await response.json().catch(() => ({}));
        nextIsAdmin = Boolean(response.ok && payload?.isAdmin);
      }
    } catch {
      nextIsAdmin = false;
    } finally {
      setIsAdmin(nextIsAdmin);
      setAdminAccessChecked(true);
    }
    return nextIsAdmin;
  }

  async function loadBrands(currentUser) {
    setLoadingBrands(true);

    let data;

    try {
      const result = await withTimeout(
        supabase
          .from("brand_profiles")
          .select("id, business_name, is_default, created_at")
          .eq("user_id", currentUser.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true }),
        WORKSPACE_REQUEST_TIMEOUT_MS
      );

      if (result.error) {
        throw result.error;
      }

      data = result.data;
    } catch (error) {
      console.error("Could not load brands:", error);
      setBrandProfiles([]);
      setCurrentBrandId("");
      setLoadingBrands(false);
      return false;
    }

    const brands = data || [];
    setBrandProfiles(brands);

    if (brands.length === 0) {
      window.location.href = "/onboarding";
      return true;
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
    return true;
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

  function normalizeBrandWebsite(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function getBusinessNameFromWebsite(value) {
    try {
      // Treat numbered web front doors such as www2.hm.com as infrastructure,
      // never as the customer-facing company name.
      const hostname = new URL(value).hostname.replace(/^www\d*\./i, "");
      const label = hostname.split(".")[0] || hostname;
      const words = label
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) =>
          part.length <= 3
            ? part.toUpperCase()
            : part.charAt(0).toUpperCase() + part.slice(1)
        );
      return words.join(" ") || hostname;
    } catch {
      return "";
    }
  }

  function getCurrentPlanEntitlements() {
    return getPlanEntitlements(creditBalance?.subscription_plan || creditBalance?.plan_name || "free");
  }

  async function requestNewBrand() {
    if (loadingCredits) return;
    const hasAdminBypass = adminAccessChecked ? isAdmin : await checkAdminAccess();
    const entitlements = getCurrentPlanEntitlements();
    if (!hasAdminBypass && brandProfiles.length >= entitlements.brands) {
      setPlanLimitDetails(buildPlanLimitDetails({
        plan: entitlements.key,
        resource: "brands",
        current: brandProfiles.length,
        limit: entitlements.brands,
      }));
      setMobileMenuOpen(false);
      return;
    }
    setNewBrandError("");
    setShowCreateBrandModal(true);
    setMobileMenuOpen(false);
  }

  async function handleCreateBrand(event) {
    event?.preventDefault?.();
    if (!user?.id || creatingBrand) return;
    const entitlements = getCurrentPlanEntitlements();
    if (!isAdmin && brandProfiles.length >= entitlements.brands) {
      setShowCreateBrandModal(false);
      setPlanLimitDetails(buildPlanLimitDetails({ plan: entitlements.key, resource: "brands", current: brandProfiles.length, limit: entitlements.brands }));
      return;
    }
    const normalizedWebsite = normalizeBrandWebsite(newBrandWebsite);
    const derivedBrandName = getBusinessNameFromWebsite(normalizedWebsite);

    if (!normalizedWebsite || !derivedBrandName) {
      setNewBrandError(t("layout.createBrandWebsiteInvalid"));
      return;
    }

    setCreatingBrand(true);

    const { data, error } = await supabase
      .from("brand_profiles")
      .insert({
        user_id: user.id,
        business_name: derivedBrandName,
        website_url: normalizedWebsite,
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
      const limitDetails = parsePlanLimitDatabaseError(error);
      if (limitDetails) {
        setShowCreateBrandModal(false);
        setPlanLimitDetails(limitDetails);
      } else {
        setNewBrandError(error.message || t("layout.createBrandError"));
      }
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
    setShowCreateBrandModal(false);
    setNewBrandWebsite("");
    setNewBrandError("");
    window.location.href = `/brand?analyze=1&brand=${encodeURIComponent(data.id)}`;
  }


  function getNavLabel(item) {
    return t(item.labelKey);
  }

  function getUserDisplayName() {
    return (
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      String(user?.email || "").split("@")[0] ||
      t("layout.account")
    );
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id || avatarUploading) return;

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
      alert(t("layout.avatarInvalid"));
      return;
    }

    setAvatarUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `${user.id}/avatar-${Date.now()}.${extension}`;
      const oldPath = String(user?.user_metadata?.spreelo_avatar_path || "").trim();

      const { error: uploadError } = await supabase.storage
        .from("user-avatars")
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("user-avatars")
        .getPublicUrl(storagePath);
      const avatarUrl = publicUrlData?.publicUrl || "";
      if (!avatarUrl) throw new Error(t("layout.avatarUploadError"));

      const { data, error: updateError } = await supabase.auth.updateUser({
        data: {
          spreelo_avatar_url: avatarUrl,
          spreelo_avatar_path: storagePath,
        },
      });
      if (updateError) throw updateError;

      const updatedUser = data?.user || user;
      setUser(updatedUser);
      window.dispatchEvent(new CustomEvent("spreelo-avatar-updated", { detail: { user: updatedUser } }));

      if (oldPath && oldPath !== storagePath) {
        void supabase.storage.from("user-avatars").remove([oldPath]);
      }
    } catch (error) {
      console.error("Could not update avatar:", error);
      alert(error.message || t("layout.avatarUploadError"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (checkingSession || translationsLoading || sessionCheckError) {
    return (
      <main className="workspace-loader-page" aria-live="polite">
        <section className={`workspace-loader-card${sessionCheckError ? " error" : ""}`}>
          <div className="workspace-loader-brand">
            <img
              src="/brand/spreelologo.png"
              alt="Spreelo"
              className="workspace-loader-logo"
            />
          </div>

          {checkingSession || translationsLoading ? (
            <>
              <div className="workspace-loader-motion" aria-hidden="true">
                <span className="workspace-loader-aura aura-one" />
                <span className="workspace-loader-aura aura-two" />
                <span className="workspace-loader-ring ring-one">
                  <span className="workspace-loader-dot dot-one" />
                  <span className="workspace-loader-dot dot-two" />
                </span>
                <span className="workspace-loader-ring ring-two">
                  <span className="workspace-loader-dot dot-three" />
                  <span className="workspace-loader-dot dot-four" />
                </span>
                <span className="workspace-loader-core">
                  <img src="/brand/spreelo-mark.png" alt="" className="workspace-loader-core-mark" />
                </span>
              </div>
              <div className="workspace-loader-copy">
                <strong>{t("layout.preparingWorkspace")}</strong>
                <p>{t("layout.loadingWorkspace")}</p>
              </div>
              <div className="workspace-loader-progress" aria-hidden="true">
                <span />
              </div>
            </>
          ) : (
            <>
              <div className="workspace-loader-error-icon" aria-hidden="true">!</div>
              <div className="workspace-loader-copy">
                <strong>{t("layout.workspaceConnectionTitle")}</strong>
                <p>{sessionCheckError}</p>
              </div>
              <button
                type="button"
                className="primary-button full workspace-loader-retry"
                onClick={checkUser}
              >
                {t("layout.retry")}
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell spreelo-shell">
      <header className="spreelo-mobile-header">
        <div className="spreelo-mobile-topbar">
          <a href="/" className="spreelo-mobile-logo">
            <SpreeloLogo />
          </a>

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
        </div>

        <div className="spreelo-mobile-brandbar">
          <div className="spreelo-mobile-brand">
            <span>{t("common.currentBrand")}</span>
            <strong>
              {loadingBrands
                ? t("common.loading")
                : currentBrand?.business_name || t("common.noBrand")}
            </strong>
          </div>
          <ChevronDown className="spreelo-mobile-brand-chevron" size={20} aria-hidden="true" />
        </div>
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
          <SpreeloLogo />
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
            onClick={requestNewBrand}
            disabled={creatingBrand || loadingCredits}
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            {creatingBrand ? t("layout.creating") : t("layout.addNewBrand")}
          </button>
        </div>

        <nav className="nav spreelo-nav">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
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
          <a className="sidebar-plan-card sidebar-credit-card" href="/settings">
            <div className="sidebar-credit-heading">
              <span>{t("layout.planLabel", { plan: getPlanLabel() })}</span>
              <CreditCard size={16} aria-hidden="true" />
            </div>

            {loadingCredits ? (
              <p className="sidebar-credit-loading">{t("layout.loadingCredits")}</p>
            ) : creditBalance ? (
              <>
                <div className="sidebar-credit-count">
                  <strong>{Number(creditBalance.credits_remaining || 0)}</strong>
                  <span>/ {Number(creditBalance.monthly_credit_limit || 0)} {t("layout.creditsLeft")}</span>
                </div>
                <div className="sidebar-credit-progress" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          Number(creditBalance.monthly_credit_limit || 0) > 0
                            ? (Number(creditBalance.credits_remaining || 0) /
                                Number(creditBalance.monthly_credit_limit || 1)) *
                              100
                            : 0
                        )
                      )}%`,
                    }}
                  />
                </div>
                <small>{t("layout.creditsReset", { date: getCreditResetLabel() })}</small>
              </>
            ) : (
              <p className="sidebar-credit-loading">{t("layout.creditsUnavailable")}</p>
            )}
          </a>

          <div className="spreelo-user-profile-card">
            <button
              type="button"
              className="spreelo-user-avatar-button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label={t("layout.changeProfileImage")}
            >
              {user?.user_metadata?.spreelo_avatar_url ? (
                <img src={user.user_metadata.spreelo_avatar_url} alt="" />
              ) : (
                <span className="spreelo-user-avatar-fallback" aria-hidden="true">
                  <UserRound size={22} strokeWidth={1.9} />
                </span>
              )}
              <span className="spreelo-user-avatar-camera" aria-hidden="true">
                <Camera size={12} strokeWidth={2.1} />
              </span>
            </button>

            <div className="spreelo-user-profile-copy">
              <strong>{t("layout.account")}</strong>
              <span>{user?.email || ""}</span>
            </div>

            <ChevronDown className="spreelo-user-profile-chevron" size={16} aria-hidden="true" />

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              hidden
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

      {showCreateBrandModal ? (
        <div
          className="create-brand-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingBrand) {
              setShowCreateBrandModal(false);
            }
          }}
        >
          <section
            className="create-brand-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-brand-modal-title"
          >
            <button
              type="button"
              className="create-brand-modal-close"
              aria-label={t("layout.closeCreateBrand")}
              onClick={() => setShowCreateBrandModal(false)}
              disabled={creatingBrand}
            >
              <X size={20} />
            </button>

            <div className="create-brand-modal-icon" aria-hidden="true">
              <Globe2 size={25} />
            </div>
            <p className="create-brand-modal-eyebrow">{t("layout.createBrandEyebrow")}</p>
            <h2 id="create-brand-modal-title">{t("layout.createBrandTitle")}</h2>
            <p className="create-brand-modal-lead">{t("layout.createBrandDescription")}</p>

            <form onSubmit={handleCreateBrand}>
              <label htmlFor="create-brand-website">{t("layout.createBrandWebsiteLabel")}</label>
              <div className="create-brand-url-field">
                <Globe2 size={19} aria-hidden="true" />
                <input
                  id="create-brand-website"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoFocus
                  placeholder={t("layout.createBrandWebsitePlaceholder")}
                  value={newBrandWebsite}
                  onChange={(event) => {
                    setNewBrandWebsite(event.target.value);
                    setNewBrandError("");
                  }}
                  disabled={creatingBrand}
                />
              </div>
              <small>{t("layout.createBrandWebsiteHelp")}</small>
              {newBrandError ? <p className="create-brand-modal-error" role="alert">{newBrandError}</p> : null}
              <div className="create-brand-modal-actions">
                <button type="button" onClick={() => setShowCreateBrandModal(false)} disabled={creatingBrand}>
                  {t("layout.cancel")}
                </button>
                <button type="submit" className="primary" disabled={creatingBrand || !newBrandWebsite.trim()}>
                  {creatingBrand ? t("layout.creating") : t("layout.analyzeBrandWebsite")}
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <PlanLimitModal details={planLimitDetails} onClose={() => setPlanLimitDetails(null)} />

      <section className="content spreelo-content">
        {active !== "settings" && <LanguageSuggestionBanner />}
        {children}
      </section>
    </main>
  );
}
