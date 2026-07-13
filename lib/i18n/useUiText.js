"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_UI_NAMESPACES,
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  getDefaultLabelsForNamespaces,
  interpolateUiText,
  normalizeUiLocale,
} from "./defaultLabels";

export const APP_LANGUAGE_STORAGE_KEY = "spreelo_app_language";
export const APP_LANGUAGE_SOURCE_STORAGE_KEY = "spreelo_app_language_source";
export const APP_LANGUAGE_CHANGED_EVENT = "spreelo_app_language_changed";
const TRANSLATION_CACHE_VERSION = "v5";
const TRANSLATION_STORAGE_PREFIX = `spreelo_ui_labels_${TRANSLATION_CACHE_VERSION}`;
const PRELOAD_STORAGE_PREFIX = `spreelo_ui_preloaded_${TRANSLATION_CACHE_VERSION}`;
const PRELOAD_TTL_MS = 1000 * 60 * 60 * 24;

const translationMemory = new Map();
const inFlightRequests = new Map();
const inFlightPreloads = new Set();

function normalizeNamespaces(namespaces) {
  if (Array.isArray(namespaces)) {
    return Array.from(new Set(["common", ...namespaces].filter(Boolean)));
  }

  if (namespaces) {
    return Array.from(new Set(["common", namespaces]));
  }

  return ["common"];
}

function getStorageKey(locale) {
  return `${TRANSLATION_STORAGE_PREFIX}_${locale}`;
}

function getPreloadStorageKey(locale) {
  return `${PRELOAD_STORAGE_PREFIX}_${locale}`;
}

export function isOfficialUiLocale(locale) {
  const normalizedLocale = normalizeUiLocale(locale);

  return SUPPORTED_UI_LOCALES.some((item) => item.locale === normalizedLocale);
}

export function getBrowserMatchedOfficialLocale() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  const browserLocales = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language];

  for (const browserLocale of browserLocales) {
    const normalizedLocale = normalizeUiLocale(browserLocale);

    if (isOfficialUiLocale(normalizedLocale)) {
      return normalizedLocale;
    }
  }

  return null;
}

export function getBrowserOfficialLocale() {
  return getBrowserMatchedOfficialLocale() || DEFAULT_UI_LOCALE;
}

function readStoredLabels(locale) {
  if (typeof window === "undefined" || locale === DEFAULT_UI_LOCALE) {
    return {};
  }

  if (translationMemory.has(locale)) {
    return translationMemory.get(locale);
  }

  try {
    const raw = localStorage.getItem(getStorageKey(locale));
    const parsed = raw ? JSON.parse(raw) : {};

    if (parsed && typeof parsed === "object") {
      translationMemory.set(locale, parsed);
      return parsed;
    }
  } catch {
    localStorage.removeItem(getStorageKey(locale));
  }

  translationMemory.set(locale, {});
  return {};
}

function writeStoredLabels(locale, nextLabels) {
  if (typeof window === "undefined" || locale === DEFAULT_UI_LOCALE) return;

  const currentLabels = readStoredLabels(locale);
  const mergedLabels = {
    ...currentLabels,
    ...nextLabels,
  };

  translationMemory.set(locale, mergedLabels);

  try {
    localStorage.setItem(getStorageKey(locale), JSON.stringify(mergedLabels));
  } catch {
    // localStorage can be full or unavailable. Memory cache still helps this tab.
  }
}

function getInitialLocale() {
  if (typeof window === "undefined") return DEFAULT_UI_LOCALE;

  const params = new URLSearchParams(window.location.search);
  const urlLocale = params.get("lang") || params.get("locale");

  if (urlLocale) {
    const normalizedUrlLocale = normalizeUiLocale(urlLocale);
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalizedUrlLocale);
    localStorage.setItem(APP_LANGUAGE_SOURCE_STORAGE_KEY, "url");
    return normalizedUrlLocale;
  }

  const savedLocale = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);

  if (savedLocale) {
    return normalizeUiLocale(savedLocale);
  }

  const browserLocale = getBrowserOfficialLocale();

  if (browserLocale !== DEFAULT_UI_LOCALE) {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, browserLocale);
    localStorage.setItem(APP_LANGUAGE_SOURCE_STORAGE_KEY, "browser");
  }

  return browserLocale;
}

function hasAllRequiredLabels({ labels, fallbackLabels, locale }) {
  if (locale === DEFAULT_UI_LOCALE) return true;

  return Object.keys(fallbackLabels).every((key) => {
    const value = labels?.[key];

    return typeof value === "string" && value.trim() !== "";
  });
}

async function fetchUiLabels({ locale, namespaces }) {
  const normalizedLocale = normalizeUiLocale(locale);
  const normalizedNamespaces = normalizeNamespaces(namespaces);
  const requestKey = `${normalizedLocale}:${normalizedNamespaces.join(",")}`;

  if (normalizedLocale === DEFAULT_UI_LOCALE) {
    return getDefaultLabelsForNamespaces(normalizedNamespaces);
  }

  if (inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey);
  }

  const request = (async () => {
    const params = new URLSearchParams({
      locale: normalizedLocale,
      namespaces: normalizedNamespaces.join(","),
    });

    const response = await fetch(`/api/ui-translations?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Could not load UI translations.");
    }

    const data = await response.json();
    const translatedLabels = data?.labels || {};

    writeStoredLabels(normalizedLocale, translatedLabels);

    return translatedLabels;
  })();

  inFlightRequests.set(requestKey, request);

  try {
    return await request;
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

export async function preloadUiLocale(locale) {
  const normalizedLocale = normalizeUiLocale(locale);

  if (
    typeof window === "undefined" ||
    normalizedLocale === DEFAULT_UI_LOCALE ||
    inFlightPreloads.has(normalizedLocale)
  ) {
    return;
  }

  const preloadKey = getPreloadStorageKey(normalizedLocale);
  const lastPreload = Number(localStorage.getItem(preloadKey) || 0);

  if (Date.now() - lastPreload < PRELOAD_TTL_MS) {
    return;
  }

  inFlightPreloads.add(normalizedLocale);

  try {
    await fetchUiLabels({
      locale: normalizedLocale,
      namespaces: ALL_UI_NAMESPACES,
    });

    localStorage.setItem(preloadKey, String(Date.now()));
  } catch (error) {
    console.error("Could not preload UI translations:", error);
  } finally {
    inFlightPreloads.delete(normalizedLocale);
  }
}

export function useUiText(namespaces = []) {
  const normalizedNamespaces = useMemo(
    () => normalizeNamespaces(namespaces),
    [Array.isArray(namespaces) ? namespaces.join("|") : namespaces]
  );

  const [locale, setLocaleState] = useState(() => getInitialLocale());

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncLocaleFromStorage() {
      const storedLocale = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);

      if (!storedLocale) return;

      const normalizedStoredLocale = normalizeUiLocale(storedLocale);

      setLocaleState((currentLocale) => {
        const normalizedCurrentLocale = normalizeUiLocale(currentLocale);

        return normalizedCurrentLocale === normalizedStoredLocale
          ? currentLocale
          : normalizedStoredLocale;
      });
    }

    function handleStorage(event) {
      if (!event || event.key === APP_LANGUAGE_STORAGE_KEY) {
        syncLocaleFromStorage();
      }
    }

    window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, syncLocaleFromStorage);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, syncLocaleFromStorage);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const fallbackLabels = useMemo(
    () => getDefaultLabelsForNamespaces(normalizedNamespaces),
    [normalizedNamespaces.join(",")]
  );

  const [labels, setLabels] = useState(() => {
    const initialLocale = getInitialLocale();

    if (initialLocale === DEFAULT_UI_LOCALE) {
      return fallbackLabels;
    }

    return readStoredLabels(initialLocale);
  });

  const [loading, setLoading] = useState(() => {
    const initialLocale = getInitialLocale();

    if (initialLocale === DEFAULT_UI_LOCALE) return false;

    return !hasAllRequiredLabels({
      labels: readStoredLabels(initialLocale),
      fallbackLabels,
      locale: initialLocale,
    });
  });

  useEffect(() => {
    let cancelled = false;

    async function loadLabels() {
      const normalizedLocale = normalizeUiLocale(locale);

      if (typeof window !== "undefined") {
        localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalizedLocale);
      }

      if (normalizedLocale === DEFAULT_UI_LOCALE) {
        setLabels(fallbackLabels);
        setLoading(false);
        return;
      }

      const storedLabels = readStoredLabels(normalizedLocale);
      const storedLabelsComplete = hasAllRequiredLabels({
        labels: storedLabels,
        fallbackLabels,
        locale: normalizedLocale,
      });

      if (storedLabelsComplete) {
        setLabels(storedLabels);
        setLoading(false);
        preloadUiLocale(normalizedLocale);
        return;
      }

      setLabels(storedLabels);
      setLoading(true);

      try {
        const translatedLabels = await fetchUiLabels({
          locale: normalizedLocale,
          namespaces: normalizedNamespaces,
        });

        if (!cancelled) {
          const mergedLabels = {
            ...readStoredLabels(normalizedLocale),
            ...translatedLabels,
          };

          setLabels(mergedLabels);
          setLoading(false);
          preloadUiLocale(normalizedLocale);
        }
      } catch (error) {
        console.error("Could not load UI translations:", error);

        if (!cancelled) {
          setLabels(fallbackLabels);
          setLoading(false);
        }
      }
    }

    loadLabels();

    return () => {
      cancelled = true;
    };
  }, [locale, normalizedNamespaces.join(","), fallbackLabels]);

  function setLocale(nextLocale, source = "manual") {
    const normalizedLocale = normalizeUiLocale(nextLocale);

    if (typeof window !== "undefined") {
      localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalizedLocale);
      localStorage.setItem(APP_LANGUAGE_SOURCE_STORAGE_KEY, source);
      window.dispatchEvent(
        new CustomEvent(APP_LANGUAGE_CHANGED_EVENT, {
          detail: { locale: normalizedLocale, source },
        })
      );
    }

    setLocaleState(normalizedLocale);
    preloadUiLocale(normalizedLocale);
  }

  function t(key, values = {}) {
    const translatedText = labels?.[key];

    if (typeof translatedText === "string" && translatedText.trim() !== "") {
      return interpolateUiText(translatedText, values);
    }

    const fallbackText = fallbackLabels?.[key];

    if (locale !== DEFAULT_UI_LOCALE && loading && fallbackText) {
      return "";
    }

    return interpolateUiText(fallbackText || key, values);
  }

  return {
    t,
    locale,
    setLocale,
    loading,
    preloadUiLocale,
  };
}
