"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: "⌂",
  },
  {
    id: "create",
    label: "Content",
    href: "/create",
    icon: "▦",
  },
  {
    id: "automation",
    label: "Automation",
    href: "/automation",
    icon: "✦",
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: "□",
  },
  {
    id: "brand",
    label: "Brand profile",
    href: "/brand",
    icon: "◎",
  },
  {
    id: "social-channels",
    label: "Social channels",
    href: "/social-channels",
    icon: "◉",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: "⚙",
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

  const [deleteConfirmBrandId, setDeleteConfirmBrandId] = useState("");
  const [deletingBrand, setDeletingBrand] = useState(false);
  const [brandActionMessage, setBrandActionMessage] = useState("");

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
    setDeleteConfirmBrandId("");
    setBrandActionMessage("");

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
    setBrandActionMessage("");
    setDeleteConfirmBrandId("");

    const { data, error } = await supabase
      .from("brand_profiles")
      .insert({
        user_id: user.id,
        business_name: trimmedBrandName,
        website_url: "",
        brand_description: "",
        industry: "",
        target_audience: "",
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

  function handleDeleteBrandStart() {
    setBrandActionMessage("");

    if (!currentBrand?.id) {
      setBrandActionMessage("No brand selected.");
      return;
    }

    if (brandProfiles.length <= 1) {
      setBrandActionMessage(
        "You cannot delete your last brand. Create another brand first."
      );
      return;
    }

    setDeleteConfirmBrandId(currentBrand.id);
  }

  function handleDeleteBrandCancel() {
    setDeleteConfirmBrandId("");
    setBrandActionMessage("");
  }

  async function deleteRows(tableName, brandId) {
    const { error } = await supabase.from(tableName).delete().eq("brand_id", brandId);

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }
  }

  async function handleDeleteBrandConfirm() {
    if (!user?.id || !currentBrand?.id || deletingBrand) return;

    const brandToDelete = currentBrand;

    if (brandProfiles.length <= 1) {
      setBrandActionMessage(
        "You cannot delete your last brand. Create another brand first."
      );
      return;
    }

    setDeletingBrand(true);
    setBrandActionMessage("");

    try {
      const remainingBrands = brandProfiles.filter(
        (brand) => brand.id !== brandToDelete.id
      );

      const nextBrand =
        remainingBrands.find((brand) => brand.is_default) ||
        remainingBrands[0] ||
        null;

      if (!nextBrand?.id) {
        throw new Error("Could not find another brand to switch to.");
      }

      await deleteRows("website_content_history", brandToDelete.id);
      await deleteRows("automation_rules", brandToDelete.id);
      await deleteRows("posts", brandToDelete.id);
      await deleteRows("social_connections", brandToDelete.id);

      const { error: deleteBrandError } = await supabase
        .from("brand_profiles")
        .delete()
        .eq("id", brandToDelete.id)
        .eq("user_id", user.id);

      if (deleteBrandError) {
        throw new Error(`brand_profiles: ${deleteBrandError.message}`);
      }

      if (brandToDelete.is_default && nextBrand.id) {
        await supabase
          .from("brand_profiles")
          .update({
            is_default: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextBrand.id)
          .eq("user_id", user.id);
      }

      const nextBrands = remainingBrands.map((brand) => {
        if (brand.id !== nextBrand.id) return brand;

        return {
          ...brand,
          is_default: brandToDelete.is_default ? true : brand.is_default,
        };
      });

      setBrandProfiles(nextBrands);
      setCurrentBrandId(nextBrand.id);
      setDeleteConfirmBrandId("");

      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(user.id), nextBrand.id);

        window.dispatchEvent(
          new CustomEvent("spreelo-current-brand-changed", {
            detail: {
              brandProfileId: nextBrand.id,
            },
          })
        );
      }

      window.location.href = "/brand";
    } catch (error) {
      console.error("Could not delete brand:", error);
      setBrandActionMessage(
        error.message || "Could not delete brand. Please try again."
      );
      setDeletingBrand(false);
    }
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
            <div className="brand-mark">S</div>
            <div>
              <h1>Spreelo</h1>
              <p>AI social media planner</p>
            </div>
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
          <div className="brand-mark spreelo-brand-mark">S</div>
          <div>
            <h1>Spreelo</h1>
            <p>AI social media planner</p>
          </div>
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
              disabled={deletingBrand}
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
            disabled={creatingBrand || deletingBrand}
          >
            {creatingBrand ? "Creating..." : "+ New brand"}
          </button>

          {brandProfiles.length > 0 && (
            <div className="current-brand-danger">
              {deleteConfirmBrandId === currentBrand?.id ? (
                <div className="current-brand-delete-confirm">
                  <p>
                    Permanently delete{" "}
                    <strong>{currentBrand?.business_name || "this brand"}</strong>?
                    This will delete its posts, saved plans, website history and
                    social connection. This cannot be undone.
                  </p>

                  <div className="current-brand-delete-actions">
                    <button
                      type="button"
                      className="current-brand-delete-confirm-button"
                      onClick={handleDeleteBrandConfirm}
                      disabled={deletingBrand}
                    >
                      {deletingBrand ? "Deleting..." : "Yes, delete permanently"}
                    </button>

                    <button
                      type="button"
                      className="current-brand-delete-cancel-button"
                      onClick={handleDeleteBrandCancel}
                      disabled={deletingBrand}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="current-brand-delete-button"
                  onClick={handleDeleteBrandStart}
                  disabled={deletingBrand}
                >
                  Delete brand
                </button>
              )}

              {brandActionMessage && (
                <p className="current-brand-action-message">
                  {brandActionMessage}
                </p>
              )}
            </div>
          )}
        </div>

        <nav className="nav spreelo-nav">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={active === item.id ? "active" : ""}
              href={item.href}
            >
              <span className="nav-icon">{item.icon}</span>
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
