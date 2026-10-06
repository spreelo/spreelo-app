"use client";

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Globe2,
  LoaderCircle,
  MousePointerClick,
  ShoppingBag,
  Sparkles,
  Wifi,
  X,
} from "lucide-react";
import styles from "./GrowBrainConnectModal.module.css";

function Chip({ tone = "neutral", children }) {
  return <span className={`${styles.chip} ${styles[`chip${tone}`]}`}>{children}</span>;
}

export default function GrowBrainConnectModal({
  t,
  locale,
  view,
  webProvider,
  webProviderMeta,
  websiteDiscovery,
  websiteConnection,
  websiteConnectError,
  websiteDiscovering,
  currentBrand,
  connectedPlatformCount = 0,
  onRequestClose,
  onDismissIntro,
  onDiscover,
  onPrepare,
  onDisconnectShopify,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button, a[href]")?.focus();

    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestClose();
      }
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onRequestClose]);

  const WebProviderIcon = webProviderMeta?.icon || Globe2;
  const websiteUrl =
    websiteConnection?.website_url ||
    websiteDiscovery?.website_url ||
    currentBrand?.website_url ||
    "";

  function renderIntro() {
    return (
      <>
        <div className={styles.badgeIcon} aria-hidden="true">
          <Sparkles size={19} />
        </div>
        <span className={styles.eyebrow}>{t("growBrain.webConnectEyebrow")}</span>
        <h2 id="grow-brain-connect-title">{t("growBrain.webConnectIntroTitle")}</h2>
        <p className={styles.lead}>{t("growBrain.webConnectIntroText")}</p>

        <div className={styles.statusList}>
          <article className={styles.statusRow}>
            <span className={`${styles.statusIcon} ${styles.social}`} aria-hidden="true"><Wifi size={18} /></span>
            <div className={styles.statusCopy}>
              <strong>{t("growBrain.webDataSocial")}</strong>
              <p>{t("growBrain.webConnectStatusSocialText")}</p>
            </div>
            <Chip tone={connectedPlatformCount > 0 ? "success" : "neutral"}>
              {connectedPlatformCount > 0 ? t("growBrain.webConnectStatusConnected") : t("growBrain.webConnectStatusPending")}
            </Chip>
          </article>

          <article className={styles.statusRow}>
            <span className={`${styles.statusIcon} ${styles.website}`} aria-hidden="true"><Globe2 size={18} /></span>
            <div className={styles.statusCopy}>
              <strong>{t("growBrain.webDataWebsite")}</strong>
              <p>{t("growBrain.webConnectStatusWebsiteText")}</p>
            </div>
            <Chip>{t("growBrain.webConnectStatusOptional")}</Chip>
          </article>

          <article className={styles.statusRow}>
            <span className={`${styles.statusIcon} ${styles.sales}`} aria-hidden="true"><ShoppingBag size={18} /></span>
            <div className={styles.statusCopy}>
              <strong>{t("growBrain.webDataSales")}</strong>
              <p>{t("growBrain.webConnectStatusSalesText")}</p>
            </div>
            <Chip>{t("growBrain.webConnectStatusOptional")}</Chip>
          </article>
        </div>

        {websiteUrl ? (
          <div className={styles.websiteRow}>
            <div>
              <span>{t("growBrain.webConnectCurrentWebsiteLabel")}</span>
              <strong>{websiteUrl}</strong>
            </div>
            <a href="/brand" className={styles.secondaryGhost}>{t("growBrain.webConnectChangeWebsite")}</a>
          </div>
        ) : null}

        {websiteConnectError ? <p className={styles.error} role="alert">{websiteConnectError}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={websiteDiscovering} onClick={onDiscover}>
            <Globe2 size={17} />
            <span>{t("growBrain.webConnectButton")}</span>
          </button>
          <button type="button" className={styles.secondary} onClick={onDismissIntro}>{t("growBrain.webConnectNotNow")}</button>
        </div>

        <p className={styles.optional}>{t("growBrain.webConnectOptionalText")}</p>
      </>
    );
  }

  function renderDiscovering() {
    return (
      <div className={styles.centered}>
        <span className={styles.orb} aria-hidden="true"><LoaderCircle size={28} className={styles.spin} /></span>
        <span className={styles.eyebrow}>{t("growBrain.webConnectEyebrow")}</span>
        <h2 id="grow-brain-connect-title">{t("growBrain.webConnectScanningTitle")}</h2>
        <p className={styles.lead}>{t("growBrain.webConnectScanningText")}</p>
      </div>
    );
  }

  function renderRecommendation() {
    return (
      <>
        <div className={styles.badgeIcon} aria-hidden="true"><WebProviderIcon size={21} /></div>
        <span className={styles.eyebrow}>{t("growBrain.webConnectEyebrow")}</span>
        <h2 id="grow-brain-connect-title">
          {websiteDiscovery?.needs_website_url
            ? t("growBrain.webConnectNeedWebsiteTitle")
            : t("growBrain.webConnectFoundTitle", { provider: webProviderMeta.label })}
        </h2>
        <p className={styles.lead}>
          {websiteDiscovery?.needs_website_url
            ? t("growBrain.webConnectNeedWebsiteText")
            : t(webProviderMeta.descriptionKey)}
        </p>

        {websiteDiscovery?.technologies?.length ? (
          <div className={styles.techList}>
            {websiteDiscovery.technologies.map((technology) => (
              <span key={technology.id}>{technology.label}</span>
            ))}
          </div>
        ) : null}

        {websiteDiscovery?.fetch_error ? (
          <div className={styles.softNote}><CircleAlert size={15} /><span>{t("growBrain.webConnectPartialDetection")}</span></div>
        ) : null}

        <div className={styles.recommendationBox}>
          <span>{t("growBrain.webConnectRecommended")}</span>
          <strong>{webProviderMeta.label}</strong>
          <small>{t("growBrain.webConnectRecommendedHelp")}</small>
        </div>

        {webProvider === "shopify" && !websiteDiscovery?.needs_website_url ? (
          <div className={styles.softNote}><CircleAlert size={15} /><span>{t("growBrain.shopifyAiConsent")}</span></div>
        ) : null}

        {websiteConnectError ? <p className={styles.error} role="alert">{websiteConnectError}</p> : null}

        <div className={styles.actions}>
          {websiteDiscovery?.needs_website_url ? (
            <a className={styles.primaryLink} href="/brand">
              <span>{t("growBrain.webConnectAddWebsite")}</span>
              <ArrowRight size={16} />
            </a>
          ) : (
            <button type="button" className={styles.primary} onClick={onPrepare}>
              <span>{webProvider === "shopify" ? t("growBrain.shopifyAiConsentAction") : t("growBrain.webConnectChoosePath")}</span>
              <ArrowRight size={16} />
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={onRequestClose}>{t("growBrain.webConnectClose")}</button>
        </div>
      </>
    );
  }

  function renderConnected() {
    return (
      <>
        <div className={`${styles.badgeIcon} ${styles.success}`} aria-hidden="true"><CheckCircle2 size={21} /></div>
        <span className={styles.eyebrow}>{t("growBrain.webConnectEyebrow")}</span>
        <h2 id="grow-brain-connect-title">{t("growBrain.shopifyConnectedTitle")}</h2>
        <p className={styles.lead}>{t("growBrain.shopifyConnectedText")}</p>
        <div className={styles.softNote}><ShoppingBag size={15} /><span>{websiteConnection?.detected_signals?.shop_domain || t("growBrain.shopifyConnectedStore")}</span></div>
        {websiteConnectError ? <p className={styles.error} role="alert">{websiteConnectError}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onRequestClose}>{t("growBrain.webConnectDone")}</button>
          <button type="button" className={styles.secondary} onClick={onDisconnectShopify}>{t("growBrain.shopifyDisconnect")}</button>
        </div>
      </>
    );
  }

  function renderPrepared() {
    return (
      <>
        <div className={`${styles.badgeIcon} ${styles.success}`} aria-hidden="true"><CheckCircle2 size={21} /></div>
        <span className={styles.eyebrow}>{t("growBrain.webConnectEyebrow")}</span>
        <h2 id="grow-brain-connect-title">{t("growBrain.webConnectPreparedTitle")}</h2>
        <p className={styles.lead}>{t("growBrain.webConnectPreparedText", { provider: webProviderMeta.label })}</p>
        <div className={styles.softNote}><Sparkles size={15} /><span>{t("growBrain.webConnectPreparedSafety")}</span></div>
        <div className={styles.actions}><button type="button" className={styles.primary} onClick={onRequestClose}>{t("growBrain.webConnectDone")}</button></div>
      </>
    );
  }

  let content = renderIntro();
  if (view === "discovering") content = renderDiscovering();
  else if (view === "recommendation") content = renderRecommendation();
  else if (view === "connected") content = renderConnected();
  else if (view === "prepared") content = renderPrepared();

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onRequestClose();
    }}>
      <section className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="grow-brain-connect-title" lang={locale}>
        <button type="button" className={styles.close} onClick={onRequestClose} aria-label={t("growBrain.webConnectClose")}>
          <X size={20} />
        </button>

        <div className={styles.scroll}>
          <div className={styles.shell}>
            <aside className={styles.visual} aria-hidden="true">
              <img src="/grow-brain/grow-brain-web-connect-v319.png" alt="" width="768" height="1024" />
            </aside>
            <div className={styles.panel}>
              {content}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
