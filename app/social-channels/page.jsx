"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import PlanLimitModal from "../../components/PlanLimitModal";
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
  {
    key: "pinterest",
    eyebrowKey: "social.pinterestEyebrow",
    titleKey: "social.pinterestTitle",
    descriptionKey: "social.pinterestDescriptionV2",
    connectHelpKey: "social.pinterestConnectHelpV2",
    connectKey: "social.connectPinterest",
    connectingKey: "social.connectingPinterest",
    disconnectKey: "social.disconnectPinterest",
    disconnectConfirmKey: "social.disconnectPinterestConfirm",
    connectedAccountKey: "social.connectedPinterestBoard",
    accountFallbackKey: "social.pinterestBoardFallback",
    idLabelKey: "social.pinterestBoardId",
    noIdKey: "social.noPinterestBoardId",
    iconSrc: "/social-icons/pinterest.png",
  },
  {
    key: "threads",
    eyebrowKey: "social.threadsEyebrow",
    titleKey: "social.threadsTitle",
    descriptionKey: "social.threadsDescriptionV2",
    connectHelpKey: "social.threadsConnectHelpV2",
    connectKey: "social.connectThreads",
    connectingKey: "social.connectingThreads",
    disconnectKey: "social.disconnectThreads",
    disconnectConfirmKey: "social.disconnectThreadsConfirm",
    connectedAccountKey: "social.connectedThreadsAccount",
    accountFallbackKey: "social.threadsAccountFallback",
    idLabelKey: "social.threadsAccountId",
    noIdKey: "social.noThreadsAccountId",
    iconSrc: "/social-icons/threads.svg",
  },
  {
    key: "tiktok",
    eyebrowKey: "social.tiktokEyebrow",
    titleKey: "social.tiktokTitle",
    descriptionKey: "social.tiktokDescriptionV2",
    connectHelpKey: "social.tiktokConnectHelpV2",
    connectKey: "social.connectTikTok",
    connectingKey: "social.connectingTikTok",
    disconnectKey: "social.disconnectTikTok",
    disconnectConfirmKey: "social.disconnectTikTokConfirm",
    connectedAccountKey: "social.connectedTikTokAccount",
    accountFallbackKey: "social.tiktokAccountFallback",
    idLabelKey: "social.tiktokAccountId",
    noIdKey: "social.noTikTokAccountId",
    iconSrc: "/social-icons/tiktok.png",
  },
  {
    key: "youtube",
    eyebrowKey: "social.youtubeEyebrow",
    titleKey: "social.youtubeTitle",
    descriptionKey: "social.youtubeDescriptionV2",
    connectHelpKey: "social.youtubeConnectHelpV2",
    connectKey: "social.connectYouTube",
    connectingKey: "social.connectingYouTube",
    disconnectKey: "social.disconnectYouTube",
    disconnectConfirmKey: "social.disconnectYouTubeConfirm",
    connectedAccountKey: "social.connectedYouTubeChannel",
    accountFallbackKey: "social.youtubeChannelFallback",
    idLabelKey: "social.youtubeChannelId",
    noIdKey: "social.noYouTubeChannelId",
    iconSrc: "/social-icons/youtube.png",
  },
];

function getConnectionStatusKey(status) {
  if (status === "connected") return "social.status.connected";
  if (status === "expired" || status === "needs_reconnect") return "social.status.expired";
  if (status === "error") return "social.status.error";
  if (status === "disconnected") return "social.status.disconnected";
  return "social.status.notConnected";
}

function getStatusClass(status) {
  if (status === "connected") return "connected";
  if (status === "expired" || status === "needs_reconnect") return "warning";
  if (status === "error") return "error";
  return "neutral";
}

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function getConnectEndpoint(platformKey) {
  if (platformKey === "instagram") return "/api/auth/instagram/start";
  if (platformKey === "pinterest") return "/api/auth/pinterest/start";
  if (platformKey === "threads") return "/api/auth/threads/start";
  if (platformKey === "youtube") return "/api/auth/youtube/start";
  if (platformKey === "tiktok") return "/api/auth/tiktok/start";
  return "/api/meta/connect";
}

const SOCIAL_OAUTH_MESSAGE_TYPE = "spreelo-social-oauth-result";

function getOAuthPopupFeatures() {
  const width = 620;
  const height = 760;
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

function getSocialUrlMessageFromValues({ t, connected, error, pinterestTestPin }) {
  if (connected === "pinterest" && pinterestTestPin === "1") return t("social.pinterestSandboxVerifiedMessage");
  if (connected === "instagram") return t("social.instagramConnectedMessageV2");
  if (connected === "facebook") return t("social.facebookConnectedMessageV2");
  if (connected === "pinterest") return t("social.pinterestConnectedMessageV2");
  if (connected === "threads") return t("social.threadsConnectedMessageV2");
  if (connected === "youtube") return t("social.youtubeConnectedMessageV2");
  if (connected === "tiktok") return t("social.tiktokConnectedMessageV2");
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
    missing_pinterest_env: "social.errorMissingPinterestEnv",
    pinterest_cancelled: "social.errorPinterestCancelled",
    missing_pinterest_code: "social.errorPinterestCode",
    invalid_pinterest_state: "social.errorPinterestState",
    invalid_pinterest_state_payload: "social.errorPinterestState",
    pinterest_callback_failed: "social.errorPinterestCallback",
    pinterest_token_failed: "social.errorPinterestToken",
    pinterest_account_failed: "social.errorPinterestAccount",
    pinterest_save_failed: "social.errorPinterestSave",
    pinterest_schema_missing: "social.errorPinterestSchemaMissing",
    missing_threads_env: "social.errorMissingThreadsEnv",
    threads_cancelled: "social.errorThreadsCancelled",
    missing_threads_code: "social.errorThreadsCode",
    invalid_threads_state: "social.errorThreadsState",
    invalid_threads_state_payload: "social.errorThreadsState",
    threads_callback_failed: "social.errorThreadsCallback",
    missing_youtube_env: "social.errorMissingYouTubeEnv",
    youtube_cancelled: "social.errorYouTubeCancelled",
    missing_youtube_code: "social.errorYouTubeCode",
    invalid_youtube_state: "social.errorYouTubeState",
    invalid_youtube_state_payload: "social.errorYouTubeState",
    no_youtube_channel: "social.errorNoYouTubeChannel",
    youtube_callback_failed: "social.errorYouTubeCallback",
    missing_tiktok_env: "social.errorMissingTikTokEnv",
    tiktok_cancelled: "social.errorTikTokCancelled",
    missing_tiktok_code: "social.errorTikTokCode",
    invalid_tiktok_state: "social.errorTikTokState",
    invalid_tiktok_state_payload: "social.errorTikTokState",
    tiktok_publish_scope_denied: "social.errorTikTokScope",
    tiktok_token_failed: "social.errorTikTokToken",
    tiktok_callback_failed: "social.errorTikTokCallback",
  };

  return t(knownErrors[error] || "social.errorGenericConnect");
}

function getSocialUrlMessage({ t }) {
  if (typeof window === "undefined") return "";
  const searchParams = new URLSearchParams(window.location.search);
  return getSocialUrlMessageFromValues({
    t,
    connected: searchParams.get("connected"),
    error: searchParams.get("error"),
    pinterestTestPin: searchParams.get("pinterest_test_pin"),
  });
}

function formatTokenExpiry(value, t, platformKey) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const formattedDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (platformKey === "pinterest") {
    return t("social.pinterestAutoRefreshActive");
  }

  if (platformKey === "youtube") {
    return t("social.youtubeAutoRefreshActive");
  }

  if (platformKey === "tiktok") {
    return t("social.tiktokAutoRefreshActive");
  }

  return t("social.tokenExpiresAtV2", { date: formattedDate });
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
  const expiresText = formatTokenExpiry(connection?.token_expires_at, t, platform.key);
  const statusClass = getStatusClass(connection?.status);

  return (
    <article data-platform={platform.key} className={`social-v74-card ${isConnected ? "is-connected" : ""}`}>
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
  const [connectionSuccess, setConnectionSuccess] = useState(null);
  const [planLimitDetails, setPlanLimitDetails] = useState(null);
  const [oauthFlow, setOauthFlow] = useState(null);
  const oauthPopupRef = useRef(null);
  const oauthPollRef = useRef(null);
  const oauthResultReceivedRef = useRef(false);
  const loadConnectionsRef = useRef(null);
  const tRef = useRef(t);
  const currentBrandRef = useRef(currentBrand);
  const selectedPlatforms = useMemo(() => SOCIAL_PLATFORMS, []);
  tRef.current = t;
  currentBrandRef.current = currentBrand;

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    function clearPopupPoll() {
      if (oauthPollRef.current) {
        window.clearInterval(oauthPollRef.current);
        oauthPollRef.current = null;
      }
    }

    async function handleOAuthMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== SOCIAL_OAUTH_MESSAGE_TYPE) return;

      const platformKey = String(event.data?.platform || "").trim();
      if (!platformKey) return;

      oauthResultReceivedRef.current = true;
      clearPopupPoll();
      try { oauthPopupRef.current?.close(); } catch {}
      oauthPopupRef.current = null;
      setConnectingPlatform("");
      setOauthFlow(null);

      if (event.data?.success) {
        await loadConnectionsRef.current?.();
        const platform = SOCIAL_PLATFORMS.find((item) => item.key === platformKey);
        if (platform) {
          setMessage(getSocialUrlMessageFromValues({
            t: tRef.current,
            connected: platformKey,
            pinterestTestPin: String(event.data?.pinterestTestPin || ""),
          }));
          setMessageKind("success");
          setConnectionSuccess({ platform, brandName: currentBrandRef.current?.business_name || "" });
        }
        return;
      }

      const errorCode = String(event.data?.error || "").trim();
      const errorMessage = getSocialUrlMessageFromValues({ t: tRef.current, error: errorCode });
      setMessage(errorMessage || tRef.current("social.errorGenericConnect"));
      setMessageKind("error");
    }

    window.addEventListener("message", handleOAuthMessage);
    return () => {
      window.removeEventListener("message", handleOAuthMessage);
      clearPopupPoll();
      try { oauthPopupRef.current?.close(); } catch {}
    };
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
    const connectedPlatformKey = new URLSearchParams(window.location.search).get("connected");
    const urlMessage = getSocialUrlMessage({ t });
    if (urlMessage) {
      setMessage(urlMessage);
      setMessageKind(new URLSearchParams(window.location.search).get("error") ? "error" : "success");
      if (connectedPlatformKey) {
        const platform = selectedPlatforms.find((item) => item.key === connectedPlatformKey);
        if (platform) setConnectionSuccess({ platform, brandName: selectedBrand.business_name || "" });
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
    setLoading(false);
  }

  loadConnectionsRef.current = loadConnections;

  function closeOAuthPopup() {
    if (oauthPollRef.current) {
      window.clearInterval(oauthPollRef.current);
      oauthPollRef.current = null;
    }
    try { oauthPopupRef.current?.close(); } catch {}
    oauthPopupRef.current = null;
  }

  async function startOAuthInPopup(platform, { reusePopup = false } = {}) {
    if (!platform?.key || !currentBrand?.id) return;

    setMessage("");
    setConnectingPlatform(platform.key);
    oauthResultReceivedRef.current = false;

    let popup = reusePopup ? oauthPopupRef.current : null;
    if (!popup || popup.closed) {
      popup = window.open("about:blank", `spreelo_oauth_${platform.key}`, getOAuthPopupFeatures());
      oauthPopupRef.current = popup;
    }

    if (popup && !reusePopup) {
      try {
        popup.document.title = "Spreelo";
        popup.document.body.innerHTML = `<style>@keyframes spreeloSpin{to{transform:rotate(360deg)}}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 42%,#f7f9fc 0,#fff 46%);font-family:Arial,sans-serif;color:#0b1b2f}</style><main style="min-height:100vh;display:grid;place-items:center;padding:28px"><div style="width:min(360px,100%);text-align:center"><div style="display:inline-grid;place-items:center;width:58px;height:58px;margin-bottom:18px;border-radius:18px;background:linear-gradient(145deg,#ff7255,#cc482d);color:#fff;font-size:30px;font-weight:800;box-shadow:0 14px 32px rgba(219,76,45,.22)">S</div><strong style="display:block;font-size:24px;line-height:1.15;letter-spacing:-.02em">Spreelo</strong><div style="width:28px;height:28px;margin:22px auto 16px;border:3px solid #dbe3ec;border-top-color:#ef5f43;border-radius:50%;animation:spreeloSpin .8s linear infinite"></div><p style="margin:0;color:#53637a;font-size:17px;line-height:1.5;font-weight:600">Preparing secure sign-in…</p><small style="display:block;margin-top:8px;color:#8a96a7;font-size:13px;line-height:1.45">You will be redirected automatically.</small></div></main>`;
      } catch {}
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        closeOAuthPopup();
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
      if (payload?.planLimit) {
        closeOAuthPopup();
        setPlanLimitDetails(payload.planLimit);
        setConnectingPlatform("");
        setOauthFlow(null);
        return;
      }
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || t("social.errorGenericConnect"));
      }

      if (!popup || popup.closed) {
        // Popup blockers are rare, but never leave the customer stuck.
        window.location.href = payload.url;
        return;
      }

      setOauthFlow({
        platformKey: platform.key,
        popupClosed: false,
      });

      popup.location.href = payload.url;
      try { popup.focus(); } catch {}

      if (oauthPollRef.current) window.clearInterval(oauthPollRef.current);
      oauthPollRef.current = window.setInterval(() => {
        const currentPopup = oauthPopupRef.current;
        if (!currentPopup || currentPopup.closed) {
          window.clearInterval(oauthPollRef.current);
          oauthPollRef.current = null;
          oauthPopupRef.current = null;
          if (!oauthResultReceivedRef.current) {
            setConnectingPlatform("");
            setOauthFlow((current) => current?.platformKey === platform.key
              ? { ...current, popupClosed: true }
              : current);
          }
        }
      }, 500);
    } catch (error) {
      closeOAuthPopup();
      setMessage(error.message || t("social.errorGenericConnect"));
      setMessageKind("error");
      setConnectingPlatform("");
      setOauthFlow(null);
    }
  }

  async function handleConnect(platform) {
    await startOAuthInPopup(platform);
  }

  async function continueOAuthFlow() {
    const platform = selectedPlatforms.find((item) => item.key === oauthFlow?.platformKey);
    if (!platform) return;
    await startOAuthInPopup(platform, { reusePopup: true });
  }

  function cancelOAuthFlow() {
    closeOAuthPopup();
    setConnectingPlatform("");
    setOauthFlow(null);
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
          <div className="social-v14342-hero-text">
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

        <section className="social-v14339-connect-shell">
          <div className="social-v14339-connect-head">
            <div>
              <strong>{t("social.introTitleV2")}</strong>
              <p>{t("social.introTextV2")}</p>
            </div>
            <span>{t("social.approvalReminderV2")}</span>
          </div>

          <div className="social-v74-grid social-v14339-grid">
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
          <div className="social-v14339-security-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{t("social.securityNoteV2")}</span>
          </div>
        </section>
        {oauthFlow ? (
          <div className="social-oauth-helper-backdrop" role="presentation">
            <section className="social-oauth-helper" role="dialog" aria-modal="true" aria-label={t("social.oauthPopupTitle")}>
              <span className="social-oauth-helper-icon">
                <img
                  src={selectedPlatforms.find((item) => item.key === oauthFlow.platformKey)?.iconSrc || "/social-icons/instagram.png"}
                  alt=""
                  aria-hidden="true"
                />
              </span>
              <p className="social-v74-eyebrow">{t("social.oauthPopupEyebrow")}</p>
              <h2>{t("social.oauthPopupTitle")}</h2>
              <p>{t(
                oauthFlow.popupClosed ? "social.oauthPopupClosedText" : "social.oauthPopupText",
                { platform: t(selectedPlatforms.find((item) => item.key === oauthFlow.platformKey)?.eyebrowKey || "social.instagramEyebrow") }
              )}</p>
              {oauthFlow.platformKey === "instagram" ? (
                <div className="social-oauth-helper-tip">
                  <strong>{t("social.oauthInstagramFirstLoginTitle")}</strong>
                  <span>{t("social.oauthInstagramFirstLoginText")}</span>
                </div>
              ) : null}
              <div className="social-oauth-helper-actions">
                <button type="button" onClick={cancelOAuthFlow}>{t("social.oauthCancel")}</button>
                <button type="button" className="primary" onClick={continueOAuthFlow}>
                  {t("social.oauthContinue")}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        <PlanLimitModal details={planLimitDetails} onClose={() => setPlanLimitDetails(null)} />
        {connectionSuccess ? (
          <div className="social-success-backdrop" role="presentation">
            <section className="social-success-modal" role="dialog" aria-modal="true" aria-label={t("social.success.title")}>
              <span className="social-success-icon"><img src={connectionSuccess.platform.iconSrc} alt="" /></span>
              <p className="social-v74-eyebrow">{t("social.success.eyebrow")}</p>
              <h2>{t("social.success.title")}</h2>
              <p>{t("social.success.text", { platform: t(connectionSuccess.platform.eyebrowKey), brandName: connectionSuccess.brandName })}</p>
              <div className="social-success-actions">
                <button type="button" onClick={() => setConnectionSuccess(null)}>{t("social.success.addAnother")}</button>
                <button type="button" className="primary" onClick={() => { window.location.href = "/automation"; }}>{t("social.success.planPosts")}</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
