"use client";

import { useLayoutEffect, useState } from "react";
import { UiLocaleContext } from "../lib/i18n/uiLocaleContext.js";
import { APP_LANGUAGE_CHANGED_EVENT, APP_LANGUAGE_STORAGE_KEY, getInitialLocale } from "../lib/i18n/useUiText.js";
import { normalizeUiLocale } from "../lib/i18n/defaultLabels.js";

export default function UiTextProvider({ children }) {
  const [runtime, setRuntime] = useState({ locale: "en", ready: false });
  useLayoutEffect(() => {
    const restore = (event) => {
      const locale = normalizeUiLocale(event?.detail?.locale || getInitialLocale());
      document.documentElement.lang = locale;
      setRuntime(current => current.ready && current.locale === locale ? current : { locale, ready: true });
    };
    const storage = (event) => {
      if (!event || event.key === null) restore();
      else if (event.key === APP_LANGUAGE_STORAGE_KEY) restore({ detail: { locale: event.newValue } });
    };
    restore();
    window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, restore);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, restore);
      window.removeEventListener("storage", storage);
    };
  }, []);

  return (
    <UiLocaleContext.Provider value={runtime}>
      {/* This is only the synchronous hydration bootstrap. Translations never
          hide, disable or cover the page while a request is in progress. */}
      <div data-ui-locale-ready={runtime.ready ? "true" : "false"} style={{ display: "contents", visibility: runtime.ready ? undefined : "hidden" }}>
        {children}
      </div>
    </UiLocaleContext.Provider>
  );
}
