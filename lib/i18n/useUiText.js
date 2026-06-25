"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_UI_LOCALE,
  getDefaultLabelsForNamespaces,
  interpolateUiText,
  normalizeUiLocale,
} from "./defaultLabels";

const APP_LANGUAGE_STORAGE_KEY = "spreelo_app_language";
const translationCache = new Map();

function getInitialLocale() {
  if (typeof window === "undefined") return DEFAULT_UI_LOCALE;

  const params = new URLSearchParams(window.location.search);
  const urlLocale = params.get("lang") || params.get("locale");

  if (urlLocale) {
    const normalizedUrlLocale = normalizeUiLocale(urlLocale);
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalizedUrlLocale);
    return normalizedUrlLocale;
  }

  const savedLocale = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);

  if (savedLocale) {
    return normalizeUiLocale(savedLocale);
  }

  return DEFAULT_UI_LOCALE;
}

function normalizeNamespaces(namespaces) {
  if (Array.isArray(namespaces)) {
    return Array.from(new Set(["common", ...namespaces].filter(Boolean)));
  }

  if (namespaces) {
    return Array.from(new Set(["common", namespaces]));
  }

  return ["common"];
}

export function useUiText(namespaces = []) {
  const normalizedNamespaces = useMemo(
    () => normalizeNamespaces(namespaces),
    [Array.isArray(namespaces) ? namespaces.join("|") : namespaces]
  );

  const [locale, setLocaleState] = useState(DEFAULT_UI_LOCALE);
  const [labels, setLabels] = useState(() =>
    getDefaultLabelsForNamespaces(normalizedNamespaces)
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLabels() {
      const normalizedLocale = normalizeUiLocale(locale);
      const fallbackLabels = getDefaultLabelsForNamespaces(normalizedNamespaces);

      if (normalizedLocale === DEFAULT_UI_LOCALE) {
        setLabels(fallbackLabels);
        return;
      }

      const cacheKey = `${normalizedLocale}:${normalizedNamespaces.join(",")}`;

      if (translationCache.has(cacheKey)) {
        setLabels({
          ...fallbackLabels,
          ...translationCache.get(cacheKey),
        });
        return;
      }

      setLoading(true);

      try {
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

        translationCache.set(cacheKey, translatedLabels);

        if (!cancelled) {
          setLabels({
            ...fallbackLabels,
            ...translatedLabels,
          });
        }
      } catch (error) {
        console.error("Could not load UI translations:", error);

        if (!cancelled) {
          setLabels(fallbackLabels);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLabels();

    return () => {
      cancelled = true;
    };
  }, [locale, normalizedNamespaces.join(",")]);

  function setLocale(nextLocale) {
    const normalizedLocale = normalizeUiLocale(nextLocale);

    if (typeof window !== "undefined") {
      localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalizedLocale);
    }

    setLocaleState(normalizedLocale);
  }

  function t(key, values = {}) {
    const text = labels[key] || key;
    return interpolateUiText(text, values);
  }

  return {
    t,
    locale,
    setLocale,
    loading,
  };
}
