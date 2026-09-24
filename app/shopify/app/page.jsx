"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";
import styles from "../onboarding/page.module.css";

const EMBEDDED_SESSION_KEY = "spreelo_shopify_embedded_onboarding_session";
const APP_BRIDGE_WAIT_MS = 12000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

async function waitForAppBridge() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < APP_BRIDGE_WAIT_MS) {
    if (typeof window !== "undefined" && typeof window.shopify?.idToken === "function") return window.shopify;
    await sleep(80);
  }
  throw new Error("Shopify App Bridge could not be initialized.");
}

async function readPayload(response) {
  try { return await response.json(); }
  catch { return {}; }
}

async function bootstrapEmbeddedShopify() {
  const shopify = await waitForAppBridge();
  let lastPayload = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const idToken = await shopify.idToken();
    const response = await fetch("/api/shopify/embedded/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });
    const payload = await readPayload(response);
    lastPayload = payload;
    if (response.ok && payload?.ok) return payload;
    if (response.status !== 401 || attempt > 0) {
      throw new Error(payload?.message || payload?.error || "Could not authenticate Shopify session.");
    }
  }

  throw new Error(lastPayload?.message || lastPayload?.error || "Could not authenticate Shopify session.");
}

export default function ShopifyEmbeddedAppPage() {
  const { t } = useUiText(["shopifyOnboarding"]);
  const [message, setMessage] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      try {
        const bootstrap = await bootstrapEmbeddedShopify();
        if (!bootstrap?.token_hash) throw new Error(t("shopifyOnboarding.error.sessionCreate"));

        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
          token_hash: bootstrap.token_hash,
          type: bootstrap.verification_type || "email",
        });
        if (authError || !authData?.session?.access_token) {
          throw authError || new Error(t("shopifyOnboarding.error.sessionCreate"));
        }

        if (bootstrap.mode === "existing" && bootstrap.brand_profile_id) {
          const userId = authData?.user?.id || authData?.session?.user?.id || "";
          if (userId) localStorage.setItem(getBrandStorageKey(userId), bootstrap.brand_profile_id);
          localStorage.setItem("spreelo_current_brand_id", bootstrap.brand_profile_id);
          localStorage.setItem("spreelo_selected_brand_id", bootstrap.brand_profile_id);
          sessionStorage.removeItem(EMBEDDED_SESSION_KEY);
          window.location.replace("/?shopify=embedded");
          return;
        }

        if (!bootstrap.onboarding_session_id) throw new Error(t("shopifyOnboarding.error.prepare"));
        sessionStorage.setItem(EMBEDDED_SESSION_KEY, bootstrap.onboarding_session_id);
        window.location.replace("/shopify/onboarding?embedded=1");
      } catch (error) {
        console.error("Could not open Spreelo inside Shopify", error);
        setMessage(error?.message || t("shopifyOnboarding.error.finish"));
      }
    }

    void run();
  }, [t]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.brand}>
          <img src="/brand/spreelologo-on-dark.png" alt="Spreelo" />
        </div>
        {!message ? <div className={styles.progress}><span className={styles.spin}>↻</span>{t("shopifyOnboarding.connecting.title")}</div> : null}
        <h1>{t("shopifyOnboarding.connecting.title")}</h1>
        <p className={styles.lead}>{message || t("shopifyOnboarding.connecting.text")}</p>
        {message ? (
          <button type="button" className={styles.retry} onClick={() => window.location.reload()}>
            {t("shopifyOnboarding.analysisError.retry")}
          </button>
        ) : null}
      </section>
    </main>
  );
}
