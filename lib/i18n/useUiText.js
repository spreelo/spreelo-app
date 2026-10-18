"use client";

import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { UiLocaleContext } from "./uiLocaleContext.js";
import { isLanguageNeutralUiSource } from "./translationValidation.js";
import { writeOptionalBrowserCache } from "../browserStorage.js";
import { uiTranslationCache, EMPTY_UI_LABELS } from "./uiTranslationCache.js";
import { getStartupUiLabel } from "./startupUiText.js";
import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  getDefaultLabelsForNamespaces,
  interpolateUiText,
  normalizeUiLocale,
} from "./defaultLabels";

export const APP_LANGUAGE_STORAGE_KEY = "spreelo_app_language";
export const APP_LANGUAGE_SOURCE_STORAGE_KEY = "spreelo_app_language_source";
export const APP_LANGUAGE_CHANGED_EVENT = "spreelo_app_language_changed";
const TRANSLATION_CACHE_VERSION = "v30";
const PRELOAD_STORAGE_PREFIX = `spreelo_ui_preloaded_${TRANSLATION_CACHE_VERSION}`;
const PRELOAD_TTL_MS = 1000 * 60 * 60 * 24;
const INCOMPLETE_TRANSLATION_RETRY_MS = 5 * 60 * 1000;
// v144.22: preload only the small shell namespaces. Preloading every Spreelo
// namespace caused one language switch to fan out into thousands of labels and
// could keep /api/ui-translations alive until Vercel's 60-second timeout.
const PRELOAD_UI_NAMESPACES = ["common", "layout"];

const warmLocaleRequests = new Map();
const inFlightRequests = new Map();
const inFlightPreloads = new Set();
const validatedNamespacesByLocale = new Map();

function normalizeNamespaces(namespaces) {
  if (Array.isArray(namespaces)) {
    return Array.from(new Set(["common", ...namespaces].filter(Boolean)));
  }

  if (namespaces) {
    return Array.from(new Set(["common", namespaces]));
  }

  return ["common"];
}

function getPreloadStorageKey(locale) {
  return `${PRELOAD_STORAGE_PREFIX}_${locale}`;
}

function getValidatedNamespaceSet(locale) {
  const normalizedLocale = normalizeUiLocale(locale);
  if (!validatedNamespacesByLocale.has(normalizedLocale)) {
    validatedNamespacesByLocale.set(normalizedLocale, new Set());
  }
  return validatedNamespacesByLocale.get(normalizedLocale);
}

function areNamespacesValidatedForSession(locale, namespaces) {
  if (normalizeUiLocale(locale) === DEFAULT_UI_LOCALE) return true;
  const validated = getValidatedNamespaceSet(locale);
  return normalizeNamespaces(namespaces).every((namespace) => validated.has(namespace));
}

function markNamespacesValidatedForSession(locale, namespaces) {
  if (normalizeUiLocale(locale) === DEFAULT_UI_LOCALE) return;
  const validated = getValidatedNamespaceSet(locale);
  for (const namespace of normalizeNamespaces(namespaces)) validated.add(namespace);
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

function readStoredLabels(locale) { return uiTranslationCache.read(locale); }
function writeStoredLabels(locale, nextLabels) { uiTranslationCache.write(locale, nextLabels); }

// Prepare only existing packs. Navigation never waits for this optional read.
export async function warmStoredUiLocale(locale) {
  const normalizedLocale=normalizeUiLocale(locale);
  if(typeof window==='undefined'||normalizedLocale===DEFAULT_UI_LOCALE)return;
  const existing=warmLocaleRequests.get(normalizedLocale);
  if(existing && (existing.loaded||Date.now()-existing.startedAt<30000))return existing.promise;
  const state={startedAt:Date.now(),loaded:false,promise:null};
  state.promise=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(`/api/ui-translations/stored?locale=${encodeURIComponent(normalizedLocale)}`,{signal:controller.signal});
      if(!response.ok)return;
      const data=await response.json();if(data?.locale!==normalizedLocale)return;
      uiTranslationCache.write(normalizedLocale,data.labels,{persist:false,overwrite:false});
      state.loaded=true;
    }catch{}finally{clearTimeout(timeout);}
  })();
  warmLocaleRequests.set(normalizedLocale,state);return state.promise;
}

export function getInitialLocale() {
  if (typeof window === "undefined") return DEFAULT_UI_LOCALE;

  const params = new URLSearchParams(window.location.search);
  const urlLocale = params.get("lang") || params.get("locale");

  if (urlLocale) {
    const normalizedUrlLocale = normalizeUiLocale(urlLocale);
    saveLanguagePreference(APP_LANGUAGE_STORAGE_KEY, normalizedUrlLocale);
    saveLanguagePreference(APP_LANGUAGE_SOURCE_STORAGE_KEY, "url");
    return normalizedUrlLocale;
  }

  const savedLocale = readLanguagePreference(APP_LANGUAGE_STORAGE_KEY);

  if (savedLocale) {
    return normalizeUiLocale(savedLocale);
  }

  const browserLocale = getBrowserOfficialLocale();

  if (browserLocale !== DEFAULT_UI_LOCALE) {
    saveLanguagePreference(APP_LANGUAGE_STORAGE_KEY, browserLocale);
    saveLanguagePreference(APP_LANGUAGE_SOURCE_STORAGE_KEY, "browser");
  }

  return browserLocale;
}

function readLanguagePreference(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function saveLanguagePreference(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
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

    // Background requests are bounded independently of page interactivity.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let data;
    try {
      const response = await fetch(`/api/ui-translations?${params.toString()}`, { signal: controller.signal });

      if (!response.ok) {
        throw new Error("Could not load UI translations.");
      }
      data = await response.json();
    } finally {
      clearTimeout(timeout);
    }
    const translatedLabels = data?.labels || {};

    writeStoredLabels(normalizedLocale, translatedLabels);
    // localStorage is only an instant-render cache. Validate every requested
    // namespace against the server once per browser session so a changed English
    // source value can invalidate exactly that translated key in the DB pack.
    markNamespacesValidatedForSession(normalizedLocale, normalizedNamespaces);

    return translatedLabels;
  })();

  inFlightRequests.set(requestKey, request);

  try {
    return await request;
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

export async function loadUiLabelsForLocale(locale, namespaces = []) {
  return fetchUiLabels({ locale, namespaces });
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

  void warmStoredUiLocale(normalizedLocale);
  const preloadKey = getPreloadStorageKey(normalizedLocale);
  const lastPreload = Number(readLanguagePreference(preloadKey) || 0);

  if (Date.now() - lastPreload < PRELOAD_TTL_MS) {
    return;
  }

  inFlightPreloads.add(normalizedLocale);

  try {
    await fetchUiLabels({
      locale: normalizedLocale,
      namespaces: PRELOAD_UI_NAMESPACES,
    });

    const preloadFallbackLabels = getDefaultLabelsForNamespaces(
      PRELOAD_UI_NAMESPACES
    );
    if (
      hasAllRequiredLabels({
        labels: readStoredLabels(normalizedLocale),
        fallbackLabels: preloadFallbackLabels,
        locale: normalizedLocale,
      })
    ) {
      writeOptionalBrowserCache(preloadKey, String(Date.now()));
    }
  } catch (error) {
    console.error("Could not preload UI translations:", error);
  } finally {
    inFlightPreloads.delete(normalizedLocale);
  }
}

export function useUiText(namespaces = []) {
  const { locale, ready: localeReady } = useContext(UiLocaleContext);
  const normalizedNamespaces = useMemo(
    () => normalizeNamespaces(namespaces),
    [Array.isArray(namespaces) ? namespaces.join("|") : namespaces]
  );
  const namespaceKey = normalizedNamespaces.join(",");
  const fallbackLabels = useMemo(
    () => getDefaultLabelsForNamespaces(normalizedNamespaces),
    [namespaceKey]
  );
  const [result, setResult] = useState({ locale: null, namespaces: "", labels: {}, settled: false });
  const [translationRetry, setTranslationRetry] = useState(0);

  // Read the target-language cache during render, not in a later effect. A
  // remounted page and a language switch cannot display the previous language.
  const cachedLabels = useSyncExternalStore(uiTranslationCache.subscribe, () => readStoredLabels(locale), () => EMPTY_UI_LABELS);
  const currentResult = result.locale === locale && result.namespaces === namespaceKey;
  const labels = cachedLabels;
  const settled = currentResult && result.settled;
  const liveText = useRef(null);
  liveText.current = { locale, localeReady, labels, cachedLabels, settled, fallbackLabels };

  useEffect(() => {
    if (!localeReady) return;
    let cancelled = false;
    let retryTimer = null;
    const normalizedLocale = normalizeUiLocale(locale);
    const update = (nextLabels, nextSettled) => {
      if (!cancelled) setResult({ locale: normalizedLocale, namespaces: namespaceKey, labels: nextLabels, settled: nextSettled });
    };
    async function refreshLabels() {
      if (normalizedLocale === DEFAULT_UI_LOCALE) return;
      const storedLabels = readStoredLabels(normalizedLocale);
      const complete = hasAllRequiredLabels({ labels: storedLabels, fallbackLabels, locale: normalizedLocale });
      if (complete && areNamespacesValidatedForSession(normalizedLocale, normalizedNamespaces)) {
        update(storedLabels, true);
        preloadUiLocale(normalizedLocale);
        return;
      }
      try {
        const translatedLabels = await fetchUiLabels({ locale: normalizedLocale, namespaces: normalizedNamespaces });
        if (cancelled) return;
        const mergedLabels = { ...readStoredLabels(normalizedLocale), ...translatedLabels };
        update(mergedLabels, true);
        const translationsComplete = hasAllRequiredLabels({ labels: mergedLabels, fallbackLabels, locale: normalizedLocale });
        if (translationsComplete) preloadUiLocale(normalizedLocale);
        else retryTimer = setTimeout(() => setTranslationRetry(current => current + 1), INCOMPLETE_TRANSLATION_RETRY_MS);
      } catch (error) {
        if (cancelled) return;
        console.error("Could not load UI translations:", error);
        // A genuine outage retains translated text and permits the established
        // source fallback for missing keys. It never creates a page-wide wait.
        update(readStoredLabels(normalizedLocale), true);
        retryTimer = setTimeout(() => setTranslationRetry(current => current + 1), Math.min(12000, 1800 + translationRetry * 800));
      }
    }
    refreshLabels();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [localeReady, locale, namespaceKey, fallbackLabels, translationRetry]);

  function setLocale(nextLocale, source = "manual") {
    const normalizedLocale = normalizeUiLocale(nextLocale);
    if (typeof window !== "undefined") {
      saveLanguagePreference(APP_LANGUAGE_STORAGE_KEY, normalizedLocale);
      saveLanguagePreference(APP_LANGUAGE_SOURCE_STORAGE_KEY, source);
      window.dispatchEvent(new CustomEvent(APP_LANGUAGE_CHANGED_EVENT, { detail: { locale: normalizedLocale, source } }));
    }
    preloadUiLocale(normalizedLocale);
  }

  function t(key, values = {}) {
    // Async event handlers can retain an older t() closure. Resolve against the
    // current pack so their messages do not keep an obsolete startup language.
    const { locale, localeReady, labels, cachedLabels, settled, fallbackLabels } = liveText.current;
    const translatedText = labels?.[key] ?? cachedLabels?.[key];
    if (localeReady && locale !== DEFAULT_UI_LOCALE && typeof translatedText === "string" && translatedText.trim() !== "") {
      return interpolateUiText(translatedText, values);
    }
    const fallbackText = fallbackLabels?.[key];
    const startupText = localeReady ? getStartupUiLabel(locale, key) : '';
    if (startupText) return interpolateUiText(startupText, values);
    // A missing label gets a local, non-empty placeholder during its first
    // background fetch. Existing labels, controls and the page stay available.
    const actionableMessage = /error|failed|unavailable|retry|confirm|warning|success/i.test(key);
    if (localeReady && locale !== DEFAULT_UI_LOCALE && !settled && fallbackText && !actionableMessage && !isLanguageNeutralUiSource(fallbackText)) return "…";
    return interpolateUiText(fallbackText || key, values);
  }

  return {
    t,
    locale,
    setLocale,
    loading: !localeReady,
    preloadUiLocale,
  };
}
