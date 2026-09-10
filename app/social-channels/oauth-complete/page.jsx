"use client";

import { useEffect, useState } from "react";
import { useUiText } from "../../../lib/i18n/useUiText";

const MESSAGE_TYPE = "spreelo-social-oauth-result";

export default function SocialOAuthCompletePage() {
  const { t } = useUiText(["social"]);
  const [statusKey, setStatusKey] = useState("social.oauthCompleting");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected") || "";
    const error = params.get("error") || "";
    const pinterestTestPin = params.get("pinterest_test_pin") || "";
    const platform = connected || inferPlatformFromError(error);
    const success = Boolean(connected && !error);

    const payload = {
      type: MESSAGE_TYPE,
      platform,
      success,
      connected,
      error,
      pinterestTestPin,
    };

    if (window.opener && !window.opener.closed) {
      setStatusKey(success ? "social.oauthConnectedReturning" : "social.oauthReturning");
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {}
      const closeTimer = window.setTimeout(() => {
        try { window.close(); } catch {}
      }, 180);
      return () => window.clearTimeout(closeTimer);
    }

    const fallback = new URL("/social-channels", window.location.origin);
    if (connected) fallback.searchParams.set("connected", connected);
    if (error) fallback.searchParams.set("error", error);
    if (pinterestTestPin) fallback.searchParams.set("pinterest_test_pin", pinterestTestPin);
    window.location.replace(fallback.toString());
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Arial, sans-serif", background: "#f7f7f8", color: "#17181b" }}>
      <section style={{ width: "min(420px, 100%)", padding: 28, borderRadius: 18, background: "white", boxShadow: "0 16px 44px rgba(0,0,0,.08)", textAlign: "center" }}>
        <strong style={{ display: "block", fontSize: 20, marginBottom: 10 }}>Spreelo</strong>
        <p style={{ margin: 0, color: "#676b73", lineHeight: 1.5 }}>{t(statusKey)}</p>
      </section>
    </main>
  );
}

function inferPlatformFromError(error) {
  if (error.startsWith("instagram_")) return "instagram";
  if (error.startsWith("pinterest_")) return "pinterest";
  if (error.startsWith("threads_")) return "threads";
  if (error.startsWith("tiktok_") || error === "missing_tiktok_env" || error === "missing_tiktok_code" || error === "invalid_tiktok_state" || error === "invalid_tiktok_state_payload") return "tiktok";
  if (error.startsWith("youtube_") || error === "missing_youtube_env" || error === "missing_youtube_code" || error === "invalid_youtube_state" || error === "invalid_youtube_state_payload" || error === "no_youtube_channel") return "youtube";
  if (error.startsWith("meta_") || error === "invalid_state" || error === "invalid_state_payload" || error === "no_pages_found") return "facebook";
  return "";
}
