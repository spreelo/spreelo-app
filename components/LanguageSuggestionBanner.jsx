"use client";

import { useEffect, useMemo, useState } from "react";
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

const COPY = {
  en: {
    message: "Your browser language appears to be {browserLanguage}.",
    question: "Switch to {browserNativeName}?",
    switchButton: "Switch to {browserNativeName}",
    keepButton: "Keep {currentNativeName}",
  },
  sv: {
    message: "Din webbläsare verkar vara inställd på {browserLanguage}.",
    question: "Vill du byta till {browserNativeName}?",
    switchButton: "Byt till {browserNativeName}",
    keepButton: "Fortsätt på {currentNativeName}",
  },
  fi: {
    message: "Selaimesi kieli näyttää olevan {browserLanguage}.",
    question: "Haluatko vaihtaa kieleksi {browserNativeName}?",
    switchButton: "Vaihda kieleksi {browserNativeName}",
    keepButton: "Jatka kielellä {currentNativeName}",
  },
  da: {
    message: "Din browser ser ud til at være indstillet til {browserLanguage}.",
    question: "Vil du skifte til {browserNativeName}?",
    switchButton: "Skift til {browserNativeName}",
    keepButton: "Fortsæt på {currentNativeName}",
  },
  no: {
    message: "Nettleseren din ser ut til å være satt til {browserLanguage}.",
    question: "Vil du bytte til {browserNativeName}?",
    switchButton: "Bytt til {browserNativeName}",
    keepButton: "Fortsett på {currentNativeName}",
  },
  de: {
    message: "Dein Browser scheint auf {browserLanguage} eingestellt zu sein.",
    question: "Möchtest du zu {browserNativeName} wechseln?",
    switchButton: "Zu {browserNativeName} wechseln",
    keepButton: "Bei {currentNativeName} bleiben",
  },
  fr: {
    message: "La langue de votre navigateur semble être {browserLanguage}.",
    question: "Voulez-vous passer à {browserNativeName} ?",
    switchButton: "Passer à {browserNativeName}",
    keepButton: "Continuer en {currentNativeName}",
  },
  es: {
    message: "El idioma de tu navegador parece ser {browserLanguage}.",
    question: "¿Quieres cambiar a {browserNativeName}?",
    switchButton: "Cambiar a {browserNativeName}",
    keepButton: "Continuar en {currentNativeName}",
  },
  pt: {
    message: "O idioma do seu navegador parece ser {browserLanguage}.",
    question: "Deseja mudar para {browserNativeName}?",
    switchButton: "Mudar para {browserNativeName}",
    keepButton: "Continuar em {currentNativeName}",
  },
  it: {
    message: "La lingua del tuo browser sembra essere {browserLanguage}.",
    question: "Vuoi passare a {browserNativeName}?",
    switchButton: "Passa a {browserNativeName}",
    keepButton: "Continua in {currentNativeName}",
  },
  nl: {
    message: "Je browsertaal lijkt {browserLanguage} te zijn.",
    question: "Wil je overschakelen naar {browserNativeName}?",
    switchButton: "Schakel over naar {browserNativeName}",
    keepButton: "Doorgaan in {currentNativeName}",
  },
  pl: {
    message: "Język Twojej przeglądarki wygląda na {browserLanguage}.",
    question: "Czy chcesz przełączyć na {browserNativeName}?",
    switchButton: "Przełącz na {browserNativeName}",
    keepButton: "Pozostań przy {currentNativeName}",
  },
  tr: {
    message: "Tarayıcı diliniz {browserLanguage} gibi görünüyor.",
    question: "{browserNativeName} diline geçmek ister misiniz?",
    switchButton: "{browserNativeName} diline geç",
    keepButton: "{currentNativeName} ile devam et",
  },
  ar: {
    message: "يبدو أن لغة متصفحك هي {browserLanguage}.",
    question: "هل تريد التبديل إلى {browserNativeName}؟",
    switchButton: "التبديل إلى {browserNativeName}",
    keepButton: "المتابعة بـ {currentNativeName}",
  },
  hi: {
    message: "आपके ब्राउज़र की भाषा {browserLanguage} लगती है.",
    question: "क्या आप {browserNativeName} पर स्विच करना चाहते हैं?",
    switchButton: "{browserNativeName} पर स्विच करें",
    keepButton: "{currentNativeName} में जारी रखें",
  },
  id: {
    message: "Bahasa browser Anda tampaknya {browserLanguage}.",
    question: "Ingin beralih ke {browserNativeName}?",
    switchButton: "Beralih ke {browserNativeName}",
    keepButton: "Tetap gunakan {currentNativeName}",
  },
  ja: {
    message: "ブラウザの言語は{browserLanguage}のようです。",
    question: "{browserNativeName}に切り替えますか？",
    switchButton: "{browserNativeName}に切り替える",
    keepButton: "{currentNativeName}のままにする",
  },
  ko: {
    message: "브라우저 언어가 {browserLanguage}로 설정된 것 같습니다.",
    question: "{browserNativeName}(으)로 전환할까요?",
    switchButton: "{browserNativeName}(으)로 전환",
    keepButton: "{currentNativeName} 유지",
  },
  zh: {
    message: "你的浏览器语言似乎是{browserLanguage}。",
    question: "要切换到{browserNativeName}吗？",
    switchButton: "切换到{browserNativeName}",
    keepButton: "继续使用{currentNativeName}",
  },
  th: {
    message: "ภาษาของเบราว์เซอร์คุณดูเหมือนเป็น {browserLanguage}",
    question: "ต้องการเปลี่ยนเป็น {browserNativeName} หรือไม่?",
    switchButton: "เปลี่ยนเป็น {browserNativeName}",
    keepButton: "ใช้ {currentNativeName} ต่อ",
  },
  uk: {
    message: "Схоже, мова вашого браузера — {browserLanguage}.",
    question: "Перейти на {browserNativeName}?",
    switchButton: "Перейти на {browserNativeName}",
    keepButton: "Продовжити {currentNativeName}",
  },
  ru: {
    message: "Похоже, язык вашего браузера — {browserLanguage}.",
    question: "Переключиться на {browserNativeName}?",
    switchButton: "Переключиться на {browserNativeName}",
    keepButton: "Продолжить на {currentNativeName}",
  },
  bg: {
    message: "Езикът на браузъра ви изглежда е {browserLanguage}.",
    question: "Искате ли да превключите на {browserNativeName}?",
    switchButton: "Превключи на {browserNativeName}",
    keepButton: "Продължи на {currentNativeName}",
  },
};

function formatText(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

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
  const { locale, setLocale } = useUiText(["common"]);
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

  const copy = useMemo(() => {
    return COPY[browserLocale] || COPY.en;
  }, [browserLocale]);

  if (!visible) return null;

  const browserNativeName = getUiNativeLanguageName(browserLocale);
  const currentNativeName = getUiNativeLanguageName(normalizedLocale);
  const browserLanguage = getLanguageNameInLocale(browserLocale, browserLocale);

  const values = {
    browserLanguage,
    browserNativeName,
    currentNativeName,
  };

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
          {formatText(copy.message, values)}
        </strong>
        <span>{formatText(copy.question, values)}</span>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="primary-button"
          onClick={handleSwitchLanguage}
          style={{ minHeight: "36px", padding: "8px 12px" }}
        >
          {formatText(copy.switchButton, values)}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={handleKeepCurrent}
          style={{ minHeight: "36px", padding: "8px 12px" }}
        >
          {formatText(copy.keepButton, values)}
        </button>
      </div>
    </div>
  );
}
