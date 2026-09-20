"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle, ShoppingBag, Sparkles, Store, ShieldCheck } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import styles from "./page.module.css";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

async function readPayload(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || "Unexpected response" }; }
}

export default function ShopifyOnboardingPage() {
  const [phase, setPhase] = useState("starting");
  const [shop, setShop] = useState(null);
  const [brands, setBrands] = useState([]);
  const [message, setMessage] = useState("");
  const [workingBrandId, setWorkingBrandId] = useState("");
  const [pending, setPending] = useState(null);
  const startedRef = useRef(false);

  const queryError = useMemo(() => {
    if (typeof window === "undefined") return "";
    return String(new URLSearchParams(window.location.search).get("error") || "").trim();
  }, []);

  function rememberBrand(userId, brandId) {
    if (!userId || !brandId || typeof window === "undefined") return;
    localStorage.setItem(getBrandStorageKey(userId), brandId);
    localStorage.setItem("spreelo_current_brand_id", brandId);
    localStorage.setItem("spreelo_selected_brand_id", brandId);
  }

  function goToGrowBrain(extra = {}) {
    const params = new URLSearchParams({ shopify: "connected", ...extra });
    window.location.href = `/grow-brain?${params.toString()}`;
  }

  function goToSocialChannels(extra = {}) {
    const params = new URLSearchParams({ onboarding: "shopify", shopify: "connected", ...extra });
    window.location.href = `/social-channels?${params.toString()}`;
  }

  async function startBrandAnalysis({ session, brand, required, activeShop }) {
    if (!required || !session?.access_token || !brand?.id) return "skipped";
    try {
      const response = await fetch("/api/analyze-brand/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          brandProfileId: brand.id,
          businessName: brand.business_name || activeShop?.name || "Shopify Store",
          websiteUrl: brand.website_url || (activeShop?.domain ? `https://${activeShop.domain}` : ""),
          brandDescription: "",
          contentMarket: "",
          countryCode: "",
          contentLanguage: "",
          notificationLocale: String(navigator?.language || "en").split("-")[0],
          timezone: (() => {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
            catch { return "UTC"; }
          })(),
        }),
      });
      const payload = await readPayload(response);
      return response.ok && payload?.ok ? "started" : "failed";
    } catch (error) {
      console.error("Could not auto-start Shopify brand analysis", error);
      return "failed";
    }
  }

  async function continueAfterConsent({ session, brand, analysisRequired, activeShop, routeToSocialChannels = false }) {
    setPhase("analyzing");
    const analysis = await startBrandAnalysis({ session, brand, required: analysisRequired, activeShop });
    setPhase("done");
    window.setTimeout(() => {
      const extra = {};
      if (analysis === "started") extra.analysis = "started";
      if (analysis === "failed") extra.analysis = "retry_available";
      if (routeToSocialChannels) {
        goToSocialChannels(extra);
        return;
      }
      goToGrowBrain(extra);
    }, 550);
  }

  async function finishConnection({ session, brandProfileId = "", createNew = false }) {
    setWorkingBrandId(createNew ? "new" : brandProfileId || "auto");
    setPhase((current) => current === "select_brand" ? "select_brand" : "connecting");
    setMessage("");

    const response = await fetch("/api/shopify/onboarding/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ brand_profile_id: brandProfileId || undefined, create_new: createNew }),
    });
    const payload = await readPayload(response);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Could not connect Shopify to Spreelo.");

    const activeShop = payload?.shop || shop;
    setShop(activeShop);
    if (payload?.needs_brand_selection) {
      setBrands(payload?.brands || []);
      setPhase("select_brand");
      setWorkingBrandId("");
      return;
    }

    if (!payload?.brand?.id) throw new Error("Spreelo connected Shopify, but could not resolve the brand workspace.");
    const { data: { user } } = await supabase.auth.getUser();
    rememberBrand(user?.id, payload.brand.id);

    const routeToSocialChannels = Boolean(payload?.first_brand_for_user);

    if (payload?.ai_consent_required) {
      setPending({
        brand: payload.brand,
        analysisRequired: Boolean(payload.analysis_required),
        activeShop,
        routeToSocialChannels,
      });
      setPhase("consent");
      setWorkingBrandId("");
      return;
    }

    await continueAfterConsent({
      session,
      brand: payload.brand,
      analysisRequired: Boolean(payload.analysis_required),
      activeShop,
      routeToSocialChannels,
    });
  }

  async function acceptAiConsent() {
    try {
      if (!pending?.brand?.id) throw new Error("The Shopify brand is missing.");
      setMessage("");
      setPhase("saving_consent");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your Spreelo session expired. Open Spreelo from Shopify again.");
      const response = await fetch("/api/shopify/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ brand_profile_id: pending.brand.id, accepted: true }),
      });
      const payload = await readPayload(response);
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Could not save your choice.");
      await continueAfterConsent({
        session,
        brand: pending.brand,
        analysisRequired: pending.analysisRequired,
        activeShop: pending.activeShop,
        routeToSocialChannels: Boolean(pending.routeToSocialChannels),
      });
    } catch (error) {
      setMessage(error?.message || "Could not save your choice.");
      setPhase("consent");
    }
  }

  function skipAiConsent() {
    if (pending?.routeToSocialChannels) {
      goToSocialChannels({ ai: "not_enabled" });
      return;
    }
    goToGrowBrain({ ai: "not_enabled" });
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      if (queryError) {
        setPhase("error");
        setMessage(queryError.replaceAll("_", " "));
        return;
      }

      try {
        setPhase("signing_in");
        const bootstrapResponse = await fetch("/api/shopify/onboarding/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const bootstrap = await readPayload(bootstrapResponse);
        if (!bootstrapResponse.ok || !bootstrap?.ok || !bootstrap?.token_hash) {
          throw new Error(bootstrap?.error || "Could not prepare your Shopify connection.");
        }
        setShop(bootstrap.shop || null);

        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
          token_hash: bootstrap.token_hash,
          type: bootstrap.verification_type || "email",
        });
        if (authError || !authData?.session?.access_token) {
          throw authError || new Error("Could not create your Spreelo session from Shopify.");
        }

        setPhase("connecting");
        await finishConnection({ session: authData.session });
      } catch (error) {
        console.error("Shopify onboarding failed", error);
        setMessage(error?.message || "Could not finish Shopify setup.");
        setPhase("error");
        setWorkingBrandId("");
      }
    }

    run();
  }, [queryError]);

  async function chooseBrand(brandProfileId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your Spreelo session expired. Open the app from Shopify again.");
      await finishConnection({ session, brandProfileId });
    } catch (error) {
      setMessage(error?.message || "Could not connect this brand.");
      setWorkingBrandId("");
      setPhase("select_brand");
    }
  }

  async function createBrand() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your Spreelo session expired. Open the app from Shopify again.");
      await finishConnection({ session, createNew: true });
    } catch (error) {
      setMessage(error?.message || "Could not create the Shopify brand.");
      setWorkingBrandId("");
      setPhase("select_brand");
    }
  }

  const title = phase === "select_brand"
    ? "Which Spreelo brand should use this Shopify store?"
    : phase === "consent" || phase === "saving_consent"
      ? "Let Grow Brain learn from this store?"
      : phase === "done"
        ? "Shopify is connected"
        : phase === "error"
          ? "We couldn't finish the Shopify setup"
          : phase === "analyzing"
            ? "Learning about your store"
            : "Connecting Shopify to Spreelo";

  const text = phase === "select_brand"
    ? "We found more than one possible workspace. Choose the right one, or create a new brand for this store."
    : phase === "consent" || phase === "saving_consent"
      ? "Shopify is connected. One optional permission remains before Spreelo uses store data to personalize AI for this brand."
      : phase === "done"
        ? "Your product catalog is ready for Spreelo."
        : phase === "error"
          ? "No store data was attached to another account. Open Spreelo from Shopify and try again."
          : phase === "analyzing"
            ? "Spreelo is starting the brand analysis automatically. You can continue while it runs."
            : "We're using the verified Shopify account that installed the app, so you don't need to type a store address or create another login.";

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.brand}><img src="/brand/spreelologo.png" alt="Spreelo" /></div>
        <div className={styles.iconWrap}>
          {phase === "done" ? <CheckCircle2 size={34} /> : phase === "consent" || phase === "saving_consent" ? <ShieldCheck size={34} /> : phase === "select_brand" ? <Store size={34} /> : <ShoppingBag size={34} />}
        </div>
        <div className={styles.kicker}><Sparkles size={15} /> Shopify setup</div>
        <h1>{title}</h1>
        <p className={styles.lead}>{text}</p>

        {shop?.domain ? (
          <div className={styles.shopCard}>
            <span><ShoppingBag size={18} /></span>
            <div><strong>{shop.name || "Shopify Store"}</strong><small>{shop.domain}</small></div>
          </div>
        ) : null}

        {phase === "select_brand" ? (
          <div className={styles.choices}>
            {brands.map((brand) => (
              <button key={brand.id} type="button" onClick={() => chooseBrand(brand.id)} disabled={Boolean(workingBrandId)}>
                <span className={styles.choiceIcon}><Store size={18} /></span>
                <span><strong>{brand.business_name || "Unnamed brand"}</strong><small>{brand.website_url || "No website added yet"}</small></span>
                {workingBrandId === brand.id ? <LoaderCircle className={styles.spin} size={18} /> : <ArrowRight size={18} />}
              </button>
            ))}
            <button type="button" className={styles.newBrand} onClick={createBrand} disabled={Boolean(workingBrandId)}>
              <span className={styles.choiceIcon}><Sparkles size={18} /></span>
              <span><strong>Create a new brand from this Shopify store</strong><small>Spreelo will fill in the store automatically.</small></span>
              {workingBrandId === "new" ? <LoaderCircle className={styles.spin} size={18} /> : <ArrowRight size={18} />}
            </button>
          </div>
        ) : phase === "consent" || phase === "saving_consent" ? (
          <div className={styles.consentBox}>
            <div className={styles.consentTitle}><ShieldCheck size={19} /><strong>Store-specific AI permission</strong></div>
            <p>By allowing this, Spreelo may use this store's Shopify data to personalize Grow Brain and create better content for this store.</p>
            <p><strong>Your Shopify data stays isolated to this brand and is not used to train a shared model across Spreelo customers.</strong></p>
            <div className={styles.consentActions}>
              <button type="button" className={styles.allow} onClick={acceptAiConsent} disabled={phase === "saving_consent"}>
                {phase === "saving_consent" ? <LoaderCircle className={styles.spin} size={18} /> : <ShieldCheck size={18} />}
                Allow and continue
              </button>
              <button type="button" className={styles.skip} onClick={skipAiConsent} disabled={phase === "saving_consent"}>Not now</button>
            </div>
          </div>
        ) : phase !== "error" && phase !== "done" ? (
          <div className={styles.progress} aria-live="polite">
            <LoaderCircle className={styles.spin} size={22} />
            <span>{phase === "signing_in" ? "Confirming your Shopify identity…" : phase === "analyzing" ? "Starting store analysis…" : "Securing the connection…"}</span>
          </div>
        ) : null}

        {message ? <div className={styles.error}>{message}</div> : null}

        {phase === "error" ? (
          <a className={styles.retry} href="https://admin.shopify.com">Open Shopify admin <ArrowRight size={17} /></a>
        ) : null}

        <div className={styles.security}>Shopify credentials stay server-side. Spreelo never asks you to paste an API key.</div>
      </section>
    </main>
  );
}
