"use client";

import { ArrowUpRight, LockKeyhole, X } from "lucide-react";
import { useUiText } from "../lib/i18n/useUiText";

function resourceLabelKey(resource, limit) {
  const singular = Number(limit) === 1;
  if (resource === "brands") return singular ? "billing.limitResourceBrandOne" : "billing.limitResourceBrands";
  if (resource === "socialAccounts") return singular ? "billing.limitResourceSocialAccountOne" : "billing.limitResourceSocialAccounts";
  return singular ? "billing.limitResourceRecurringPlanOne" : "billing.limitResourceRecurringPlans";
}

export default function PlanLimitModal({ details, onClose }) {
  const { t } = useUiText(["settings"]);
  if (!details) return null;

  const resourceLabel = t(resourceLabelKey(details.resource, details.limit));
  const planName = details.planName || String(details.plan || "").replace(/^./, (c) => c.toUpperCase());
  const recommendedPlanName = details.recommendedPlanName || (details.recommendedPlan
    ? String(details.recommendedPlan).replace(/^./, (c) => c.toUpperCase())
    : "");

  return (
    <div className="plan-limit-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="plan-limit-modal" role="dialog" aria-modal="true" aria-labelledby="plan-limit-title">
        <button type="button" className="plan-limit-modal-close" onClick={onClose} aria-label={t("common.close")}>
          <X size={18} />
        </button>
        <span className="plan-limit-modal-icon"><LockKeyhole size={22} /></span>
        <p className="eyebrow">{t("billing.limitEyebrow")}</p>
        <h2 id="plan-limit-title">{t("billing.limitTitle", { plan: planName })}</h2>
        <p>{t("billing.limitCurrentText", { plan: planName, limit: details.limit, resource: resourceLabel })}</p>
        {recommendedPlanName ? (
          <div className="plan-limit-modal-upgrade">
            <strong>{t("billing.limitUpgradeTitle", { plan: recommendedPlanName })}</strong>
            <span>{details.recommendedUnlimited
              ? t("billing.limitUpgradeUnlimitedText", { plan: recommendedPlanName, resource: resourceLabel })
              : t("billing.limitUpgradeText", { plan: recommendedPlanName, limit: details.recommendedLimit, resource: resourceLabel })}</span>
          </div>
        ) : (
          <div className="plan-limit-modal-upgrade">
            <strong>{t("billing.limitHighestPlanTitle")}</strong>
            <span>{t("billing.limitHighestPlanText")}</span>
          </div>
        )}
        <div className="plan-limit-modal-actions">
          <button type="button" onClick={onClose}>{t("billing.limitClose")}</button>
          {recommendedPlanName ? (
            <a href="/settings#spreelo-plans" className="primary">
              {t("billing.limitViewPlans")} <ArrowUpRight size={16} />
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
