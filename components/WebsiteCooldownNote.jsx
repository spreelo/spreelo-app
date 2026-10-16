"use client";

import { getWebsiteCooldownState } from "../lib/websiteCooldownStatus.js";
import { useUiText } from "../lib/i18n/useUiText";

export default function WebsiteCooldownNote({ plan }) {
  const { t, locale } = useUiText(["common"]);
  const waiting = getWebsiteCooldownState(plan);
  if (!waiting) return null;
  let date = null;
  if (waiting.retryAt) {
    try {
      date = new Intl.DateTimeFormat(locale || "en", {
        dateStyle: "short", timeStyle: "short", timeZone: waiting.timeZone,
      }).format(new Date(waiting.retryAt));
    } catch {
      date = new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" })
        .format(new Date(waiting.retryAt)) + " UTC";
    }
  }
  return (
    <small role="status" style={{ display: "block", marginTop: 6, fontSize: 13.5, lineHeight: 1.45 }}>
      {t("common.websiteCooldown.reason")} {date
        ? t("common.websiteCooldown.nextAttempt", { date })
        : t("common.websiteCooldown.automaticResume")} {t("common.websiteCooldown.noAction")}
    </small>
  );
}
