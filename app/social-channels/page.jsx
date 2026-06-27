"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const SOCIAL_PLATFORMS = [
  {
    key: "facebook",
    eyebrowKey: "social.facebookEyebrow",
    titleKey: "social.facebookTitle",
    descriptionKey: "social.facebookDescription",
    connectHelpKey: "social.facebookConnectHelp",
    connectKey: "social.connectFacebook",
    connectingKey: "social.connectingFacebook",
    disconnectKey: "social.disconnectFacebook",
    disconnectConfirmKey: "social.disconnectFacebookConfirm",
    connectedAccountKey: "social.connectedPage",
    accountFallbackKey: "social.facebookPageFallback",
    idLabelKey: "social.pageId",
    noIdKey: "social.noPageId",
    iconSrc: "/social-icons/facebook.png",
  },
  {
    key: "instagram",
    eyebrowKey: "social.instagramEyebrow",
    titleKey: "social.instagramTitle",
    descriptionKey: "social.instagramDescription",
    connectHelpKey: "social.instagramConnectHelp",
    connectKey: "social.connectInstagram",
    connectingKey: "social.connectingInstagram",
    disconnectKey: "social.disconnectInstagram",
    disconnectConfirmKey: "social.disconnectInstagramConfirm",
    connectedAccountKey: "social.connectedInstagramAccount",
    accountFallbackKey: "social.instagramAccountFallback",
    idLabelKey: "social.instagramAccountId",
    noIdKey: "social.noInstagramAccountId",
    iconSrc: "/social-icons/instagram.png",
  },
];

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

function getConnectUrl({ platformKey, userId, brandProfileId }) {
  if (!userId || !brandProfileId) return "/social-channels";

  const params = new URLSearchParams({
    user_id: userId,
    brand_profile_id: brandProfileId,
  });

  if (platformKey === "instagram") {
    return `/api/auth/instagram/start?${params.toString()}`;
  }

  return `/api/meta/connect?${params.toString()}`;
}

function getSocialUrlMessage({ t }) {
  if (typeof window === "undefined") return "";

  const searchParams = new URLSearchParams(window.location.search);
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected === "instagram") {
    return t("social.instagramConnectedMessage");
  }

  if (connected === "facebook") {
    return t("social.facebookConnectedMessage");
  }

  if (!error) return "";

  const knownErrors = {
    missing_user: "social.errorMissingUser",
    missing_brand: "social.errorNoBrand",
    invalid_brand: "social.errorInvalidBrand",
    missing_instagram_env: "social.errorMissingInstagramEnv",
    instagram_cancelled: "social.errorInstagramCancelled",
    missing_instagram_code: "social.errorInstagramCode",
    invalid_instagram_state: "social.errorInstagramState",
    invalid_instagram_state_payload: "social.errorInstagramState",
    instagram_callback_failed: "social.errorInstagramCallback",
    missing_meta_env: "social.errorMetaEnv",
    meta_cancelled: "social.errorMetaCancelled",
    missing_meta_code: "social.errorMetaCode",
    invalid_state: "social.errorMetaState",
    invalid_state_payload: "social.errorMetaState",
    meta_callback_failed: "social.errorMetaCallback",
    no_pages_found: "social.errorNoFacebookPagesFound",
  };

  return t(knownErrors[error] || "social.errorGenericConnect");
}

function formatTokenExpiry(value, t) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${t("social.tokenExpiresAt")} ${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

function SocialChannelCard({
  platform,
  connection,
  currentBrand,
  currentUser,
  loading,
  connectingPlatform,
  onConnectStart,
  onDisconnect,
  t,
}) {
  const isConnected = connection?.status === "connected";
  const isConnecting = connectingPlatform === platform.key;
  const connectUrl = getConnectUrl({
    platformKey: platform.key,
    userId: currentUser?.id,
    brandProfileId: currentBrand?.id,
  });
  const expiresText = formatTokenExpiry(connection?.token_expires_at, t);

  return (
    <section className="hero-card social-channel-card">
      <div className="social-channel-card-header">
        <div className="social-channel-title-row">
          <img
            src={platform.iconSrc}
            alt=""
            className="social-channel-icon"
            aria-hidden="true"
          />
          <div>
            <p className="eyebrow">{t(platform.eyebrowKey)}</p>
            <h3>{t(platform.titleKey)}</h3>
          </div>
        </div>
        <div className={getStatusClass(connection?.status)}>
          {t(getConnectionStatusKey(connection?.status))}
        </div>
      </div>

      <p>{t(platform.descriptionKey)}</p>

      <div className="prompt-box social-connect-box">
        {loading ? (
          <p className="login-message">{t("social.loadingConnection")}</p>
        ) : isConnected ? (
          <>
            <label>{t("social.connectedBrand")}</label>
            <div className="input">
              {currentBrand?.business_name || t("social.selectedBrandFallback")}
            </div>

            <label>{t(platform.connectedAccountKey)}</label>
            <div className="input">
              {connection.page_name || t(platform.accountFallbackKey)}
            </div>

            <label>{t(platform.idLabelKey)}</label>
            <div className="input">
              {connection.page_id || t(platform.noIdKey)}
            </div>

            {expiresText && <p className="social-token-note">{expiresText}</p>}

            <button
              type="button"
              className="secondary-button full"
              onClick={() => onDisconnect(platform, connection)}
            >
              {t(platform.disconnectKey)}
            </button>
          </>
        ) : (
          <>
            <label>{t("social.selectedBrand")}</label>
            <div className="input">
              {currentBrand?.business_name || t("social.noBrandSelected")}
            </div>

            <p>{t(platform.connectHelpKey)}</p>

            <a
              className={`primary-button social-connect-button ${
                isConnecting ? "loading" : ""
              }`}
              href={connectUrl}
              aria-busy={isConnecting}
              onClick={() => onConnectStart(platform.key)}
            >
              {isConnecting ? (
                <span
                  className="social-connect-spinner"
                  aria-label={t(platform.connectingKey)}
                />
              ) : (
                t(platform.connectKey)
              )}
            </a>
          </>
        )}
      </div>
    </section>
  );
}

export default function SocialChannelsPage() {
  const { t } = useUiText(["social"]);

  const [connectionsByPlatform, setConnectionsByPlatform] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBrand, setCurrentBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [connectingPlatform, setConnectingPlatform] = useState("");

  const selectedPlatforms = useMemo(() => SOCIAL_PLATFORMS, []);

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

  function getLatestConnectionsByPlatform(connections) {
    const nextConnections = {};

    for (const platform of selectedPlatforms) {
      const platformConnections = (connections || []).filter(
        (connection) => connection.platform === platform.key
      );

      const connectedConnection = platformConnections.find(
        (connection) => connection.status === "connected"
      );

      nextConnections[platform.key] =
        connectedConnection || platformConnections[0] || null;
    }

    return nextConnections;
  }

  async function loadConnections() {
    setLoading(true);
    setMessage("");
    setConnectingPlatform("");

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
      setConnectionsByPlatform({});
      setLoading(false);
      return;
    }

    if (!selectedBrand?.id) {
      setMessage(t("social.errorNoBrand"));
      setConnectionsByPlatform({});
      setLoading(false);
      return;
    }

    const { data: connections, error: connectionsError } = await supabase
      .from("social_connections")
      .select(
        "id, platform, page_id, page_name, status, created_at, updated_at, token_expires_at, brand_profile_id"
      )
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
      .in("platform", selectedPlatforms.map((platform) => platform.key))
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (connectionsError) {
      setMessage(connectionsError.message);
      setConnectionsByPlatform({});
      setLoading(false);
      return;
    }

    setConnectionsByPlatform(getLatestConnectionsByPlatform(connections || []));

    const urlMessage = getSocialUrlMessage({ t });

    if (urlMessage) {
      setMessage(urlMessage);

      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    setLoading(false);
  }

  async function handleDisconnect(platform, connection) {
    if (!connection?.id || !platform?.key) return;

    const confirmed = window.confirm(t(platform.disconnectConfirmKey));

    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("social_connections")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("user_id", currentUser.id)
      .eq("brand_profile_id", currentBrand.id)
      .eq("platform", platform.key);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadConnections();
  }

  return (
    <AppLayout active="social-channels">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t("social.eyebrow")}</p>
          <h2>{t("social.title")}</h2>
          {currentBrand?.business_name && (
            <p>
              {t("social.currentBrand")} <strong>{currentBrand.business_name}</strong>
            </p>
          )}
        </div>
      </header>

      {message && <p className="login-message">{message}</p>}

      <div className="social-channel-grid">
        {selectedPlatforms.map((platform) => (
          <SocialChannelCard
            key={platform.key}
            platform={platform}
            connection={connectionsByPlatform[platform.key]}
            currentBrand={currentBrand}
            currentUser={currentUser}
            loading={loading}
            connectingPlatform={connectingPlatform}
            onConnectStart={setConnectingPlatform}
            onDisconnect={handleDisconnect}
            t={t}
          />
        ))}
      </div>
    </AppLayout>
  );
}
