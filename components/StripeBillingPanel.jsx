"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Check,
  Clapperboard,
  Coins,
  CreditCard,
  Crown,
  ExternalLink,
  GalleryHorizontalEnd,
  Layers,
  Leaf,
  LoaderCircle,
  Megaphone,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useUiText } from "../lib/i18n/useUiText";

const COMMON_FEATURE_KEYS = [
  "billing.allContentTypes",
  "billing.aiImages",
  "billing.aiVideoReels",
  "billing.campaignsIncluded",
  "billing.automaticPublishing",
];

const PLANS = [
  {
    key: "starter", name: "Starter", credits: 150, month: 299, year: 2990,
    monthLookup: "spreelo_starter_monthly", yearLookup: "spreelo_starter_yearly", rank: 1,
    audienceKey: "billing.planAudienceStarter", brands: 1, socialAccounts: 1, recurringPlans: 1,
  },
  {
    key: "growth", name: "Growth", credits: 450, month: 599, year: 5990,
    monthLookup: "spreelo_growth_monthly", yearLookup: "spreelo_growth_yearly", featured: true, rank: 2,
    audienceKey: "billing.planAudienceGrowth", brands: 2, socialAccounts: 5, recurringPlans: 3,
  },
  {
    key: "pro", name: "Pro", credits: 1000, month: 999, year: 9990,
    monthLookup: "spreelo_pro_monthly", yearLookup: "spreelo_pro_yearly", rank: 3,
    audienceKey: "billing.planAudiencePro", brands: 5, socialAccounts: null, recurringPlans: 8,
  },
];

const CREDIT_PACKS = [
  { lookup: "spreelo_credits_100", credits: 100, price: 199 },
  { lookup: "spreelo_credits_250", credits: 250, price: 399, featured: true },
  { lookup: "spreelo_credits_500", credits: 500, price: 699 },
];

function cleanPlanName(value) {
  return String(value || "").trim().toLowerCase().replace(/^plan\s*:\s*/i, "").replace(/\s+trial$/i, "");
}

function formatDate(value, locale = "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale || "en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function StripeBillingPanel({ initialBalance = null, onBalanceChange }) {
  const { t, locale } = useUiText(["settings"]);
  const [billing, setBilling] = useState(initialBalance);
  const [freeTrialInfo, setFreeTrialInfo] = useState(null);
  const [interval, setInterval] = useState("month");
  const [intervalTouched, setIntervalTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyLookup, setBusyLookup] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [paymentLink, setPaymentLink] = useState("");

  const currentPlan = cleanPlanName(billing?.subscription_plan || billing?.plan_name || "free");
  const currentPlanConfig = PLANS.find((plan) => plan.key === currentPlan) || null;
  const currentRank = currentPlanConfig?.rank || 0;
  const stripeSubscriptionStatus = String(billing?.subscription_status || "").toLowerCase();
  const hasStripeSubscription = Boolean(
    billing?.payment_provider === "stripe" &&
    billing?.provider_subscription_id &&
    ["active", "trialing", "past_due", "unpaid", "paused"].includes(stripeSubscriptionStatus)
  );
  const canBuyExtraCredits = Boolean(
    billing?.payment_provider === "stripe" &&
    billing?.provider_subscription_id &&
    stripeSubscriptionStatus === "active"
  );
  const canChangePlan = stripeSubscriptionStatus === "active" && hasStripeSubscription;
  const cancelScheduled = Boolean(billing?.cancel_at_period_end);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  async function refreshBilling() {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("/api/stripe/status", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        if (payload?.billing) {
          setBilling(payload.billing);
          onBalanceChange?.(payload.billing);
        }
        setFreeTrialInfo(payload?.freeTrial || null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const savedInterval = String(billing?.subscription_interval || "").toLowerCase();
    if (!intervalTouched && ["month", "year"].includes(savedInterval)) setInterval(savedInterval);
  }, [billing?.subscription_interval, intervalTouched]);

  async function startCheckout(lookupKey) {
    if (busyLookup || busyAction) return;
    setBusyLookup(lookupKey);
    setMessage("");
    try {
      const token = await getToken();
      if (!token) { window.location.href = "/login"; return; }
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lookupKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) throw new Error(payload?.error || t("billing.checkoutError"));
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error?.message || t("billing.checkoutError"));
      setBusyLookup("");
      refreshBilling();
    }
  }

  async function pollForPlanChange(lookupKey) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 900 : 1800));
      const token = await getToken();
      if (!token) return false;
      const response = await fetch("/api/stripe/status", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      if (payload?.billing) {
        setBilling(payload.billing);
        onBalanceChange?.(payload.billing);
      }
      if (String(payload?.billing?.subscription_price_lookup_key || "") === lookupKey) return true;
    }
    return false;
  }

  async function changeSubscription(lookupKey, openPaymentWindow = false) {
    if (busyLookup || busyAction) return;
    const paymentWindow = openPaymentWindow
      ? window.open("about:blank", "spreelo-stripe-payment")
      : null;
    setBusyLookup(lookupKey);
    setMessage("");
    setPaymentLink("");
    try {
      const token = await getToken();
      const response = await fetch("/api/stripe/subscription/change", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lookupKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("billing.planChangeError"));
      if (payload?.paymentUrl) {
        if (paymentWindow) {
          paymentWindow.location.href = payload.paymentUrl;
          try { paymentWindow.focus(); } catch {}
          setMessage(t("billing.paymentOpenedNewTab"));
        } else {
          setPaymentLink(payload.paymentUrl);
          setMessage(t("billing.paymentNeedsOpening"));
        }
        void pollForPlanChange(lookupKey).then((changed) => {
          if (changed) {
            setPaymentLink("");
            setMessage(t("billing.planChanged"));
          }
        });
        return;
      }
      if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
      setMessage(payload?.scheduled ? t("billing.downgradeScheduled") : t("billing.planChangeProcessing"));
      if (!payload?.scheduled) {
        const changed = await pollForPlanChange(lookupKey);
        if (changed) setMessage(t("billing.planChanged"));
        else await refreshBilling();
      } else {
        await refreshBilling();
      }
    } catch (error) {
      if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
      setMessage(error?.message || t("billing.planChangeError"));
    } finally {
      setBusyLookup("");
    }
  }

  async function toggleCancellation(resume = false) {
    if (busyAction || busyLookup) return;
    setBusyAction(resume ? "resume" : "cancel");
    setMessage("");
    try {
      const token = await getToken();
      const response = await fetch("/api/stripe/subscription/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ resume }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("billing.cancelError"));
      setMessage(resume ? t("billing.cancellationReversed") : t("billing.cancellationScheduled"));
      await refreshBilling();
    } catch (error) {
      setMessage(error?.message || t("billing.cancelError"));
    } finally {
      setBusyAction("");
    }
  }

  async function cancelScheduledPlanChange() {
    if (busyAction || busyLookup || !billing?.pending_subscription_plan) return;
    setBusyAction("cancel-plan-change");
    setMessage("");
    try {
      const token = await getToken();
      const response = await fetch("/api/stripe/subscription/change/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("billing.cancelScheduledPlanChangeError"));
      setMessage(t("billing.scheduledPlanChangeCanceled"));
      await refreshBilling();
    } catch (error) {
      setMessage(error?.message || t("billing.cancelScheduledPlanChangeError"));
    } finally {
      setBusyAction("");
    }
  }

  const statusLabel = useMemo(() => {
    const status = String(billing?.subscription_status || "").toLowerCase();
    if (!status || currentPlan === "free") return t("billing.statusFree");
    if (status === "active") return t("billing.statusActive");
    if (status === "trialing") return t("billing.statusActive");
    if (status === "past_due") return t("billing.statusPastDue");
    if (status === "canceled" || status === "cancelled") return t("billing.statusFree");
    return status.replace(/_/g, " ");
  }, [billing, currentPlan, t]);

  return (
    <section id="spreelo-plans" className="stripe-reference-billing">
      <div className="stripe-reference-controls">
        <div className="stripe-reference-interval" role="group" aria-label={t("billing.billingPeriod")}>
          <button type="button" className={interval === "month" ? "active" : ""} onClick={() => { setIntervalTouched(true); setInterval("month"); }}>
            <strong>{t("billing.monthly")}</strong>
            <small>{t("billing.priceBilledMonthly")}</small>
          </button>
          <button type="button" className={interval === "year" ? "active" : ""} onClick={() => { setIntervalTouched(true); setInterval("year"); }}>
            <strong>{t("billing.yearly")} <span>{t("billing.twoMonthsFree")}</span></strong>
            <small>{t("billing.priceBilledYearly")}</small>
          </button>
        </div>
      </div>
      {billing?.pending_subscription_plan ? (
        <div className="stripe-reference-notice">
          <CalendarClock size={16} />
          <span>{t("billing.pendingPlanText", { plan: String(billing.pending_subscription_plan).replace(/^./, (c) => c.toUpperCase()), date: formatDate(billing?.pending_subscription_effective_at, locale) || "—" })}</span>
          <button
            type="button"
            className="stripe-reference-undo-plan-change"
            disabled={Boolean(busyAction) || Boolean(busyLookup)}
            onClick={cancelScheduledPlanChange}
          >
            {busyAction === "cancel-plan-change" ? <LoaderCircle className="billing-spin" size={14} /> : <XCircle size={14} />}
            {t("billing.cancelScheduledPlanChange")}
          </button>
        </div>
      ) : null}
      {!hasStripeSubscription && freeTrialInfo?.status === "locked" ? (
        <div className="stripe-trial-banner">
          <Sparkles size={18} />
          <div><strong>{t("billing.freeTrialLockedTitle")}</strong><span>{t("billing.freeTrialLockedText", { credits: freeTrialInfo.credits || 100, days: freeTrialInfo.days || 14 })}</span></div>
        </div>
      ) : null}
      {!hasStripeSubscription && freeTrialInfo?.status === "active" ? (
        <div className="stripe-trial-banner active">
          <CalendarClock size={18} />
          <div><strong>{t("billing.freeTrialActiveTitle")}</strong><span>{t("billing.freeTrialActiveText", { date: formatDate(freeTrialInfo.endsAt, locale) || "—" })}</span></div>
        </div>
      ) : null}
      {!hasStripeSubscription && ["expired", "used"].includes(String(freeTrialInfo?.status || "")) ? (
        <div className="stripe-trial-banner muted">
          <ShieldCheck size={18} />
          <div><strong>{t("billing.freeTrialUsedTitle")}</strong><span>{t("billing.freeTrialUsedText")}</span></div>
        </div>
      ) : null}
      <div className="stripe-reference-layout">
        <div className="stripe-reference-table">
          {PLANS.map((plan) => {
            const currentInterval = String(billing?.subscription_interval || "").toLowerCase();
            const activePlan = currentPlan === plan.key && hasStripeSubscription;
            const selected = activePlan && currentInterval === interval;
            const lookup = interval === "month" ? plan.monthLookup : plan.yearLookup;
            const price = interval === "month" ? plan.month : plan.year;
            const isUpgrade = canChangePlan && plan.rank > currentRank;
            const isDowngrade = canChangePlan && plan.rank < currentRank;
            const isImmediatePaidChange = Boolean(canChangePlan && (plan.rank > currentRank || (plan.rank === currentRank && currentInterval === "month" && interval === "year")));
            const pendingPlanKey = cleanPlanName(billing?.pending_subscription_plan);
            const hasPendingPlanChange = Boolean(pendingPlanKey);
            const pendingTarget = pendingPlanKey === plan.key;
            const disabled = busyLookup === lookup || (selected && hasStripeSubscription) || (hasPendingPlanChange && !selected);
            let buttonLabel = selected && hasStripeSubscription ? t("billing.currentPlan") : t("billing.choosePlan", { plan: plan.name });
            if (pendingTarget) buttonLabel = t("billing.planScheduledFor", { date: formatDate(billing?.pending_subscription_effective_at, locale) || "—" });
            else if (!selected && activePlan) buttonLabel = interval === "year" ? t("billing.switchYearly") : t("billing.switchMonthly");
            else if (!selected && isUpgrade) buttonLabel = t("billing.upgradeTo", { plan: plan.name });
            else if (!selected && isDowngrade) buttonLabel = t("billing.downgradeTo", { plan: plan.name });
            const fitText = plan.key === "starter"
              ? t("billing.fitStarter")
              : plan.key === "growth"
                ? t("billing.fitGrowth")
                : t("billing.fitPro");
            const audienceText = plan.key === "starter"
              ? t("billing.audienceStarterShort")
              : plan.key === "growth"
                ? t("billing.audienceGrowthShort")
                : t("billing.audienceProShort");
            return (
              <article key={plan.key} className={`stripe-reference-plan plan-${plan.key} ${activePlan ? "current" : ""}`}>
                <header>
                  <div className="stripe-reference-plan-title">
                    <span className="plan-icon">{plan.key === "starter" ? <Rocket /> : plan.key === "growth" ? <Leaf /> : <Crown />}</span>
                    <div className="stripe-reference-plan-heading-copy">
                      <div className="stripe-reference-plan-heading-line">
                        <h2>{plan.name}</h2>
                        {activePlan ? <span className="stripe-reference-current-badge">{t("billing.currentPlan")}</span> : null}
                      </div>
                      <small>{audienceText}</small>
                    </div>
                  </div>
                </header>
                <div className="price"><strong>{price.toLocaleString(locale || "en")} kr</strong><small>/{interval === "month" ? t("billing.monthShort") : t("billing.yearShort")}</small><em>{interval === "year" ? t("billing.priceBilledYearly") : t("billing.priceBilledMonthly")}</em></div>
                <div className="stripe-reference-features">
                  <div className="plan-feature credits"><Check />{t("billing.creditsPerMonth", { count: plan.credits })}</div>
                  <div className="plan-feature brands"><Check />{plan.brands === 1 ? t("billing.businessOne") : t("billing.businesses", { count: plan.brands })}</div>
                  <div className="plan-feature social"><Check />{plan.socialAccounts == null ? t("billing.socialAccountsUnlimited") : plan.socialAccounts === 1 ? t("billing.socialAccountLimitOne") : t("billing.socialAccountLimit", { count: plan.socialAccounts })}</div>
                  <div className="plan-feature recurring"><Check />{plan.recurringPlans === 1 ? t("billing.recurringPlanLimitOne") : t("billing.recurringPlanLimit", { count: plan.recurringPlans })}</div>
                </div>
                <div className="fit">{fitText}</div>
                <div className="action"><button type="button" disabled={disabled} onClick={() => selected ? null : hasStripeSubscription ? changeSubscription(lookup, isImmediatePaidChange) : startCheckout(lookup)}>{busyLookup === lookup ? <LoaderCircle className="billing-spin" /> : null}{buttonLabel}</button></div>
              </article>
            );
          })}
          <p className="stripe-reference-per-brand-note">{t("billing.perBrandLimitsNote")}</p>
        </div>
        <aside className="stripe-reference-packs">
          <h2>{t("billing.extraCreditsTitle")}</h2>
          <p>{t("billing.extraCreditsText")}</p>
          <div>{CREDIT_PACKS.map((pack) => <article key={pack.lookup}><span>+&nbsp; {pack.credits} {t("billing.credits")}</span><strong>{pack.price} kr</strong><button type="button" disabled={Boolean(busyLookup) || Boolean(busyAction) || !canBuyExtraCredits} onClick={() => startCheckout(pack.lookup)}>{busyLookup === pack.lookup ? <LoaderCircle className="billing-spin" /> : t("billing.buy")}</button></article>)}</div>
          <small>{t("billing.pricesIncludeVat")}</small>
          <a href="#spreelo-credit-info">{t("billing.learnMoreCredits")} →</a>
        </aside>
      </div>
      <div className="stripe-reference-benefits">
        <span><Check />{t("billing.includedAllPlans")}</span>
        <span><Layers />{t("billing.allContentTypes")}</span>
        <span><GalleryHorizontalEnd />{t("billing.aiImages")}</span>
        <span><Clapperboard />{t("billing.aiVideoReels")}</span>
        <span><Megaphone />{t("billing.campaignsIncluded")}</span>
        <span><CalendarDays />{t("billing.automaticPublishing")}</span>
      </div>
      <section id="spreelo-credit-info" className="stripe-reference-credit-info">
        <header><span className="credit-info-main-icon"><Sparkles /></span><div><h2>{t("billing.howCreditsWorkTitle")}</h2><p>{t("billing.howCreditsWorkText")}</p></div></header>
        <div>
          <article><span className="credit-info-icon"><RefreshCw /></span><div><strong>{t("billing.creditInfoRefreshTitle")}</strong><span>{t("billing.creditInfoRefreshText")}</span></div></article>
          <article><span className="credit-info-icon"><Coins /></span><div><strong>{t("billing.creditInfoPurchasedTitle")}</strong><span>{t("billing.creditInfoPurchasedText")}</span></div></article>
          <article><span className="credit-info-icon"><ShieldCheck /></span><div><strong>{t("billing.creditInfoUsageTitle")}</strong><span>{t("billing.creditInfoUsageText")}</span></div></article>
        </div>
      </section>
      <div className="stripe-reference-footer-row">
        <p className="stripe-reference-footnote">{interval === "year" ? t("billing.plansRenewYearly") : t("billing.plansRenewMonthly")}</p>
        {hasStripeSubscription ? (
          <div className="stripe-reference-account-actions">
            <span className="stripe-reference-status"><i className={hasStripeSubscription ? "active" : ""} /><small>{t("billing.subscriptionStatus")}</small><strong>{loading ? t("billing.loading") : statusLabel}</strong></span>
            <button type="button" className="stripe-reference-cancel" disabled={Boolean(busyAction)} onClick={() => toggleCancellation(cancelScheduled)}>
              {busyAction ? <LoaderCircle className="billing-spin" size={14} /> : cancelScheduled ? <ShieldCheck size={14} /> : <XCircle size={14} />}
              {cancelScheduled ? t("billing.keepSubscription") : t("billing.cancelSubscription")}
            </button>
          </div>
        ) : null}
      </div>
      {message ? <p className="stripe-billing-message">{message}</p> : null}
      {paymentLink ? <a className="stripe-billing-payment-link" href={paymentLink} target="_blank" rel="noreferrer">{t("billing.openPayment")} <ExternalLink /></a> : null}
    </section>
  );

}
