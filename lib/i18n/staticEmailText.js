import {
  DEFAULT_UI_LOCALE,
  getDefaultNamespaceLabels,
  interpolateUiText,
  normalizeUiLocale,
} from "./defaultLabels.js";

// Compatibility wrapper retained for older server call sites. English is the
// only source copy. Non-English values may only come from the persistent
// ui_translation_packs cache created by the shared translation engine.
export function getStaticEmailLabels(locale, persistedLabels = {}) {
  const safeLocale = normalizeUiLocale(locale || DEFAULT_UI_LOCALE);
  const defaults = getDefaultNamespaceLabels("emails");
  if (safeLocale === DEFAULT_UI_LOCALE) return { ...defaults };
  return {
    ...defaults,
    ...(persistedLabels || {}),
  };
}

export function createStaticEmailTranslator(locale, persistedLabels = {}) {
  const labels = getStaticEmailLabels(locale, persistedLabels);
  return {
    locale: normalizeUiLocale(locale || DEFAULT_UI_LOCALE),
    labels,
    t(key, values = {}) {
      return interpolateUiText(labels[key] || key, values);
    },
  };
}
