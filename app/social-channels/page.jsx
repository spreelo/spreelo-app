"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const SOCIAL_PLATFORMS = [
  {
    key: "facebook",
    eyebrowKey: "social.facebookEyebrow",
    titleKey: "social.facebookTitle",
    descriptionKey: "social.facebookDescriptionV2",
    connectHelpKey: "social.facebookConnectHelpV2",
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
    descriptionKey: "social.instagramDescriptionV2",
    connectHelpKey: "social.instagramConnectHelpV2",
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
  if (status === "connected") return "connected";
  if (status === "expired") return "warning";
  if (status === "error") return "error";
  return "neutral";
}

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function getConnectEndpoint(platformKey) {
  return platformKey === "instagram"
    ? "/api/auth/instagram/start"
    : "/api/meta/connect";
}

function getSocialUrlMessage({ t }) {
  if (typeof window === "undefined") return "";
  const searchParams = new URLSearchParams(window.location.search);
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected === "instagram") return t("social.instagramConnectedMessageV2");
  if (connected === "facebook") return t("social.facebookConnectedMessageV2");
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

  return t("social.tokenExpiresAtV2", {
    date: date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  });
}

function ChannelCard({
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
  const expiresText = formatTokenExpiry(connection?.token_expires_at, t);
  const statusClass = getStatusClass(connection?.status);

  return (
    <article className={`social-v74-card ${isConnected ? "is-connected" : ""}`}>
      <div className="social-v74-card-top">
        <div className="social-v74-card-identity">
          <span className="social-v74-platform-icon">
            <img src={platform.iconSrc} alt="" aria-hidden="true" />
          </span>
          <div>
            <p>{t(platform.eyebrowKey)}</p>
            <h2>{t(platform.titleKey)}</h2>
          </div>
        </div>
        <span className={`social-v74-status ${statusClass}`}>
          {isConnected ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
          {t(getConnectionStatusKey(connection?.status))}
        </span>
      </div>

      <p className="social-v74-description">{t(platform.descriptionKey)}</p>

      {loading ? (
        <div className="social-v74-loading">
          <LoaderCircle size={18} className="social-v74-spin" />
          {t("social.loadingConnection")}
        </div>
      ) : isConnected ? (
        <div className="social-v74-connected-panel">
          <div className="social-v74-account-row">
            <div>
              <span>{t(platform.connectedAccountKey)}</span>
              <strong>{connection.page_name || t(platform.accountFallbackKey)}</strong>
            </div>
            <img src={platform.iconSrc} alt="" aria-hidden="true" />
          </div>

          <div className="social-v74-meta-grid">
            <div>
              <span>{t("social.connectedBrand")}</span>
              <strong>{currentBrand?.business_name || t("social.selectedBrandFallback")}</strong>
            </div>
            <div>
              <span>{t(platform.idLabelKey)}</span>
              <strong>{connection.page_id || t(platform.noIdKey)}</strong>
            </div>
          </div>

          {expiresText ? (
            <p className="social-v74-token-note"><ShieldCheck size={15} />{expiresText}</p>
          ) : null}

          <button
            type="button"
            className="social-v74-secondary-action"
            onClick={() => onDisconnect(platform, connection)}
          >
            <Unplug size={16} />
            {t(platform.disconnectKey)}
          </button>
        </div>
      ) : (
        <div className="social-v74-connect-panel">
          <div className="social-v74-brand-chip">
            <span>{t("social.selectedBrand")}</span>
            <strong>{currentBrand?.business_name || t("social.noBrandSelected")}</strong>
          </div>
          <p>{t(platform.connectHelpKey)}</p>
          <button
            type="button"
            className="social-v74-primary-action"
            aria-busy={isConnecting}
            disabled={isConnecting || !currentUser?.id || !currentBrand?.id}
            onClick={() => onConnectStart(platform)}
          >
            {isConnecting ? <LoaderCircle size={17} className="social-v74-spin" /> : <Link2 size={17} />}
            {isConnecting ? t(platform.connectingKey) : t(platform.connectKey)}
            {!isConnecting ? <ExternalLink size={15} /> : null}
          </button>
        </div>
      )}
    </article>
  );
}

export default function SocialChannelsPage() {
  const { t } = useUiText(["social"]);
  const [connectionsByPlatform, setConnectionsByPlatform] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBrand, setCurrentBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("info");
  const [connectingPlatform, setConnectingPlatform] = useState("");
  const selectedPlatforms = useMemo(() => SOCIAL_PLATFORMS, []);

  useEffect(() => {
    loadConnections();
  }, []);

  async function getCurrentBrandForUser(user) {
    const savedBrandId = typeof window !== "undefined"
      ? localStorage.getItem(getBrandStorageKey(user.id))
      : "";

    if (savedBrandId) {
      const { data: savedBrand, error: savedBrandError } = await supabase
        .from("brand_profiles")
        .select("id, business_name")
        .eq("id", savedBrandId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!savedBrandError && savedBrand?.id) return savedBrand;
    }

    const { data: defaultBrand, error: defaultBrandError } = await supabase
      .from("brand_profiles")
      .select("id, business_name")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultBrandError) throw defaultBrandError;
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
      nextConnections[platform.key] =
        platformConnections.find((connection) => connection.status === "connected") ||
        platformConnections[0] ||
        null;
    }
    return nextConnections;
  }

  async function loadConnections() {
    setLoading(true);
    setMessage("");
    setMessageKind("info");
    setConnectingPlatform("");

    const { data: { user } } = await supabase.auth.getUser();
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
      setMessageKind("error");
      setConnectionsByPlatform({});
      setLoading(false);
      return;
    }

    if (!selectedBrand?.id) {
      setMessage(t("social.errorNoBrand"));
      setMessageKind("error");
      setConnectionsByPlatform({});
      setLoading(false);
      return;
    }

    const { data: connections, error: connectionsError } = await supabase
      .from("social_connections")
      .select("id, platform, page_id, page_name, status, created_at, updated_at, token_expires_at, brand_profile_id")
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
      .in("platform", selectedPlatforms.map((platform) => platform.key))
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (connectionsError) {
      setMessage(connectionsError.message);
      setMessageKind("error");
      setConnectionsByPlatform({});
      setLoading(false);
      return;
    }

    setConnectionsByPlatform(getLatestConnectionsByPlatform(connections || []));
    const urlMessage = getSocialUrlMessage({ t });
    if (urlMessage) {
      setMessage(urlMessage);
      setMessageKind(new URLSearchParams(window.location.search).get("error") ? "error" : "success");
      window.history.replaceState({}, "", window.location.pathname);
    }
    setLoading(false);
  }

  async function handleConnect(platform) {
    if (!platform?.key || !currentBrand?.id) return;
    setMessage("");
    setConnectingPlatform(platform.key);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch(getConnectEndpoint(platform.key), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ brand_profile_id: currentBrand.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || t("social.errorGenericConnect"));
      }
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error.message || t("social.errorGenericConnect"));
      setMessageKind("error");
      setConnectingPlatform("");
    }
  }

  async function handleDisconnect(platform, connection) {
    if (!connection?.id || !platform?.key) return;
    if (!window.confirm(t(platform.disconnectConfirmKey))) return;

    setMessage("");
    const { error } = await supabase
      .from("social_connections")
      .update({ status: "disconnected", updated_at: new Date().toISOString() })
      .eq("id", connection.id)
      .eq("user_id", currentUser.id)
      .eq("brand_profile_id", currentBrand.id)
      .eq("platform", platform.key);

    if (error) {
      setMessage(error.message);
      setMessageKind("error");
      return;
    }

    setMessage(t("social.disconnectedMessageV2", { platform: t(platform.titleKey) }));
    setMessageKind("success");
    await loadConnections();
  }

  const connectedCount = Object.values(connectionsByPlatform).filter(
    (connection) => connection?.status === "connected"
  ).length;

  return (
    <AppLayout active="social-channels">
      <div className="social-v74-page">
        <header className="social-v74-hero">
          <div>
            <p className="social-v74-eyebrow">{t("social.eyebrowV2")}</p>
            <h1>{t("social.titleV2")}</h1>
            <p className="social-v74-hero-copy">{t("social.subtitleV2")}</p>
            {currentBrand?.business_name ? (
              <span className="social-v74-current-brand">
                {t("social.currentBrand")} <strong>{currentBrand.business_name}</strong>
              </span>
            ) : null}
          </div>
          <div className="social-v74-hero-summary">
            <span><CheckCircle2 size={18} /></span>
            <div>
              <strong>{t("social.connectedCount", { count: connectedCount })}</strong>
              <p>{t("social.connectedCountHelp")}</p>
            </div>
            <button type="button" onClick={loadConnections} aria-label={t("social.refresh")}>
              <RefreshCw size={17} className={loading ? "social-v74-spin" : ""} />
            </button>
          </div>
        </header>

        {message ? (
          <div className={`social-v74-notice ${messageKind}`} role="status">
            {messageKind === "success" ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
            <span>{message}</span>
          </div>
        ) : null}

        <section className="social-v74-intro-strip">
          <div>
            <strong>{t("social.introTitleV2")}</strong>
            <p>{t("social.introTextV2")}</p>
          </div>
          <span>{t("social.approvalReminderV2")}</span>
        </section>

        <div className="social-v74-grid">
          {selectedPlatforms.map((platform) => (
            <ChannelCard
              key={platform.key}
              platform={platform}
              connection={connectionsByPlatform[platform.key]}
              currentBrand={currentBrand}
              currentUser={currentUser}
              loading={loading}
              connectingPlatform={connectingPlatform}
              onConnectStart={handleConnect}
              onDisconnect={handleDisconnect}
              t={t}
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
