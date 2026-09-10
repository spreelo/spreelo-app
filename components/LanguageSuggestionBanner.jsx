"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_UI_LOCALE,
  getSupportedUiLocale,
  getUiNativeLanguageName,
  normalizeUiLocale,
} from "../lib/i18n/defaultLabels";
import {
  getBrowserMatchedOfficialLocale,
  useUiText,
} from "../lib/i18n/useUiText";

const DISMISS_STORAGE_PREFIX = "spreelo_language_suggestion_dismissed";

function getLanguageNameInLocale(languageLocale, displayLocale) {
  const normalizedLanguageLocale = normalizeUiLocale(languageLocale);
  const normalizedDisplayLocale = normalizeUiLocale(displayLocale);

  try {
    const displayNames = new Intl.DisplayNames([normalizedDisplayLocale], {
      type: "language",
    });

    return displayNames.of(normalizedLanguageLocale) || getUiNativeLanguageName(normalizedLanguageLocale);
  } catch {
    return getUiNativeLanguageName(normalizedLanguageLocale);
  }
}

function getDismissKey(currentLocale, browserLocale) {
  return `${DISMISS_STORAGE_PREFIX}_${currentLocale}_${browserLocale}`;
}

export default function LanguageSuggestionBanner() {
  const { t, locale, setLocale } = useUiText(["common"]);
  const [browserLocale, setBrowserLocale] = useState(DEFAULT_UI_LOCALE);
  const [visible, setVisible] = useState(false);

  const normalizedLocale = normalizeUiLocale(locale);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextBrowserLocale = getBrowserMatchedOfficialLocale();
    const normalizedCurrentLocale = normalizeUiLocale(locale);

    setBrowserLocale(nextBrowserLocale);

    if (!nextBrowserLocale) {
      setVisible(false);
      return;
    }

    if (nextBrowserLocale === normalizedCurrentLocale) {
      setVisible(false);
      return;
    }

    if (!getSupportedUiLocale(nextBrowserLocale)) {
      setVisible(false);
      return;
    }

    const dismissKey = getDismissKey(normalizedCurrentLocale, nextBrowserLocale);

    setVisible(localStorage.getItem(dismissKey) !== "1");
  }, [locale]);

  if (!visible) return null;

  const browserNativeName = getUiNativeLanguageName(browserLocale);
  const currentNativeName = getUiNativeLanguageName(normalizedLocale);
  const browserLanguage = getLanguageNameInLocale(browserLocale, browserLocale);


  function handleSwitchLanguage() {
    setLocale(browserLocale, "suggestion");
    setVisible(false);
  }

  function handleKeepCurrent() {
    if (typeof window !== "undefined") {
      localStorage.setItem(getDismissKey(normalizedLocale, browserLocale), "1");
    }

    setVisible(false);
  }

  return (
    <div
      className="language-suggestion-banner"
      dir={browserLocale === "ar" ? "rtl" : "ltr"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 14px",
        border: "1px solid rgba(99, 102, 241, 0.18)",
        borderRadius: "16px",
        background: "rgba(255, 255, 255, 0.92)",
        boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
        margin: "12px",
        color: "#0f172a",
        fontSize: "14px",
        lineHeight: 1.4,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: "220px", flex: "1 1 320px" }}>
        <strong style={{ display: "block", marginBottom: "2px" }}>
          {t("common.languageSuggestion.message", { browserLanguage })}
        </strong>
        <span>{t("common.languageSuggestion.question", { browserNativeName })}</span>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="primary-button"
          onClick={handleSwitchLanguage}
          style={{ minHeight: "36px", padding: "8px 12px" }}
        >
          {t("common.languageSuggestion.switchButton", { browserNativeName })}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={handleKeepCurrent}
          style={{ minHeight: "36px", padding: "8px 12px" }}
        >
          {t("common.languageSuggestion.keepButton", { currentNativeName })}
        </button>
      </div>
    </div>
  );
}
