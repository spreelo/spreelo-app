"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

function getConnectionStatusKey(status) {
  if (status === "connected") return "social.status.connected";
  if (status === "expired") return "social.status.expired";
  if (status === "error") return "social.status.error";
  if (status === "disconnected") return "social.status.disconnected";

  return "social.status.notConnected";
}

function getStatusClass(status) {
  if (status === "connected") return "status-pill success";
  if (status === "expired") return "status-pill warning";
  if (status === "error") return "status-pill danger";

  return "status-pill";
}

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

export default function SocialChannelsPage() {
  const { t } = useUiText(["social"]);

  const [facebookConnection, setFacebookConnection] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBrand, setCurrentBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isConnectingFacebook, setIsConnectingFacebook] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  async function getCurrentBrandForUser(user) {
    const savedBrandId =
      typeof window !== "undefined"
        ? localStorage.getItem(getBrandStorageKey(user.id))
        : "";

    if (savedBrandId) {
      const { data: savedBrand, error: savedBrandError } = await supabase
        .from("brand_profiles")
        .select("id, business_name")
        .eq("id", savedBrandId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!savedBrandError && savedBrand?.id) {
        return savedBrand;
      }
    }

    const { data: defaultBrand, error: defaultBrandError } = await supabase
      .from("brand_profiles")
      .select("id, business_name")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultBrandError) {
      throw defaultBrandError;
    }

    if (defaultBrand?.id && typeof window !== "undefined") {
      localStorage.setItem(getBrandStorageKey(user.id), defaultBrand.id);
    }

    return defaultBrand || null;
  }

  async function loadConnections() {
    setLoading(true);
    setMessage("");
    setIsConnectingFacebook(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setCurrentUser(user);

    let selectedBrand = null;

    try {
      selectedBrand = await getCurrentBrandForUser(user);
      setCurrentBrand(selectedBrand);
    } catch (error) {
      setMessage(error.message || t("social.errorLoadBrand"));
      setFacebookConnection(null);
      setLoading(false);
      return;
    }

    if (!selectedBrand?.id) {
      setMessage(t("social.errorNoBrand"));
      setFacebookConnection(null);
      setLoading(false);
      return;
    }

    const { data: connectedConnection, error: connectedConnectionError } =
      await supabase
        .from("social_connections")
        .select(
          "id, platform, page_id, page_name, status, created_at, updated_at, token_expires_at, brand_profile_id"
        )
        .eq("user_id", user.id)
        .eq("brand_profile_id", selectedBrand.id)
        .eq("platform", "facebook")
        .eq("status", "connected")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    if (connectedConnectionError) {
      setMessage(connectedConnectionError.message);
      setFacebookConnection(null);
      setLoading(false);
      return;
    }

    if (connectedConnection) {
      setFacebookConnection(connectedConnection);
      setLoading(false);
      return;
    }

    const { data: latestConnection, error: latestConnectionError } =
      await supabase
        .from("social_connections")
        .select(
          "id, platform, page_id, page_name, status, created_at, updated_at, token_expires_at, brand_profile_id"
        )
        .eq("user_id", user.id)
        .eq("brand_profile_id", selectedBrand.id)
        .eq("platform", "facebook")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestConnectionError) {
      setMessage(latestConnectionError.message);
      setFacebookConnection(null);
    } else {
      setFacebookConnection(latestConnection || null);
    }

    setLoading(false);
  }

  async function handleDisconnect() {
    if (!facebookConnection?.id) return;

    const confirmed = window.confirm(t("social.disconnectConfirm"));

    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("social_connections")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", facebookConnection.id)
      .eq("user_id", currentUser.id)
      .eq("brand_profile_id", currentBrand.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadConnections();
  }

  const connectUrl =
    currentUser?.id && currentBrand?.id
      ? `/api/meta/connect?user_id=${currentUser.id}&brand_profile_id=${currentBrand.id}`
      : "/social-channels";

  return (
    <AppLayout active="social-channels">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t("social.eyebrow")}</p>
          <h2>{t("social.title")}</h2>
          {currentBrand?.business_name && (
            <p>
              {t("social.currentBrand")}{" "}
              <strong>{currentBrand.business_name}</strong>
            </p>
          )}
        </div>
      </header>

      {message && <p className="login-message">{message}</p>}

      <section className="hero-card">
        <div>
          <p className="eyebrow">{t("social.facebookEyebrow")}</p>
          <h3>{t("social.facebookTitle")}</h3>
          <p>{t("social.facebookDescription")}</p>
        </div>

        <div className="prompt-box social-connect-box">
          {loading ? (
            <p className="login-message">{t("social.loadingConnection")}</p>
          ) : facebookConnection?.status === "connected" ? (
            <>
              <label>{t("social.connectedBrand")}</label>
              <div className="input">
                {currentBrand?.business_name || t("social.selectedBrandFallback")}
              </div>

              <label>{t("social.connectedPage")}</label>
              <div className="input">
                {facebookConnection.page_name || t("social.facebookPageFallback")}
              </div>

              <label>{t("social.pageId")}</label>
              <div className="input">
                {facebookConnection.page_id || t("social.noPageId")}
              </div>

              <div className={getStatusClass(facebookConnection.status)}>
                {t(getConnectionStatusKey(facebookConnection.status))}
              </div>

              <button
                type="button"
                className="secondary-button full"
                onClick={handleDisconnect}
              >
                {t("social.disconnectFacebook")}
              </button>
            </>
          ) : (
            <>
              <label>{t("social.selectedBrand")}</label>
              <div className="input">
                {currentBrand?.business_name || t("social.noBrandSelected")}
              </div>

              <label>{t("social.statusLabel")}</label>
              <div className={getStatusClass(facebookConnection?.status)}>
                {t(getConnectionStatusKey(facebookConnection?.status))}
              </div>

              <p>{t("social.connectHelp")}</p>

              <a
                className={`primary-button social-connect-button ${
                  isConnectingFacebook ? "loading" : ""
                }`}
                href={connectUrl}
                aria-busy={isConnectingFacebook}
                onClick={() => {
                  setIsConnectingFacebook(true);
                }}
              >
                {isConnectingFacebook ? (
                  <span
                    className="social-connect-spinner"
                    aria-label={t("social.connectingFacebook")}
                  />
                ) : (
                  t("social.connectFacebook")
                )}
              </a>
            </>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
