const LANGUAGE_NEUTRAL_EXACT_VALUES = new Set([
  "Spreelo",
  "TikTok",
  "YouTube",
  "YouTube Shorts",
  "Pinterest",
  "Instagram",
  "Facebook",
  "Facebook Reels",
  "Threads",
  "LinkedIn",
  "Snapchat",
  "Weibo",
  "OpenAI",
  "Supabase",
  "Vercel",
  "Resend",
  "Stripe",
  "Meta",
  "Kling",
  "Kling · AI video",
  "Shotstack",
  "AI",
  "API",
  "URL",
  "SEO",
  "FAQ",
  "SKU",
  "PNG",
  "MP4",
  "P90",
  "SEK",
  "USD",
  "EUR",
]);

const TARGET_SCRIPT_TESTS = {
  ar: /[\u0600-\u06FF]/,
  hi: /[\u0900-\u097F]/,
  th: /[\u0E00-\u0E7F]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/,
  ko: /[\uAC00-\uD7AF]/,
  zh: /[\u4E00-\u9FFF]/,
  uk: /[\u0400-\u04FF]/,
  ru: /[\u0400-\u04FF]/,
  bg: /[\u0400-\u04FF]/,
  el: /[\u0370-\u03FF]/,
};

function getPlaceholders(value) {
  return String(value || "")
    .match(/\{[A-Za-z0-9_]+\}/g)
    ?.sort() || [];
}

function placeholdersMatch(sourceText, translatedText) {
  const source = getPlaceholders(sourceText);
  const translated = getPlaceholders(translatedText);
  return source.length === translated.length && source.every((item, index) => item === translated[index]);
}

export function isLanguageNeutralUiSource(value) {
  const source = String(value || "").trim();
  if (!source) return true;
  if (LANGUAGE_NEUTRAL_EXACT_VALUES.has(source)) return true;
  if (/^https?:\/\//i.test(source)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)) return true;
  if (/^(?:\{[A-Za-z0-9_]+\}[\s:.,;!?%+()\-_/\\]*)+$/.test(source)) return true;
  if (/^[\d\s.,:;!?%+()\-_/\\{}]+$/.test(source)) return true;
  if (/^[A-Z0-9._+\-/]{1,8}$/.test(source) && !/[a-z]/.test(source)) return true;
  return false;
}

function normalizedWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\{[A-Za-z0-9_]+\}/g, " ")
    .match(/[a-z]+/g) || [];
}

function sourceSimilarityTooHigh(sourceText, translatedText) {
  const sourceWords = normalizedWords(sourceText);
  const translatedWords = normalizedWords(translatedText);
  if (sourceWords.length < 3 || translatedWords.length < 3) return false;
  const sourceSet = new Set(sourceWords);
  const overlap = translatedWords.filter((word) => sourceSet.has(word)).length;
  const denominator = Math.max(sourceWords.length, translatedWords.length);
  return denominator > 0 && overlap / denominator >= 0.8;
}

function targetScriptMissing(sourceText, translatedText, locale) {
  const shortLocale = String(locale || "").toLowerCase().split("-")[0];
  const scriptTest = TARGET_SCRIPT_TESTS[shortLocale];
  if (!scriptTest) return false;
  const source = String(sourceText || "").trim();
  const translated = String(translatedText || "").trim();
  if (isLanguageNeutralUiSource(source) || normalizedWords(source).length < 2) return false;
  return !scriptTest.test(translated);
}

/**
 * Guardrail for generated UI and email packs.
 *
 * English is the sole source language. Generated values must preserve
 * placeholders and must not silently remain English. For languages that use a
 * distinct script we additionally require that script for non-trivial copy.
 */
export function validateGeneratedUiTranslation({ sourceText, translatedText, locale, allowUnchanged = false }) {
  const source = String(sourceText || "").trim();
  const translated = String(translatedText || "").trim();
  const normalizedLocale = String(locale || "en").trim().toLowerCase();

  if (!translated) return { valid: false, reason: "empty" };
  if (!placeholdersMatch(source, translated)) return { valid: false, reason: "placeholder_mismatch" };

  if (
    normalizedLocale !== "en" &&
    source &&
    translated === source &&
    !isLanguageNeutralUiSource(source) &&
    allowUnchanged !== true
  ) {
    return { valid: false, reason: "unchanged_english" };
  }

  if (
    normalizedLocale !== "en" &&
    sourceSimilarityTooHigh(source, translated) &&
    !isLanguageNeutralUiSource(source) &&
    allowUnchanged !== true
  ) {
    return { valid: false, reason: "likely_english" };
  }

  if (normalizedLocale !== "en" && targetScriptMissing(source, translated, normalizedLocale)) {
    return { valid: false, reason: "target_script_missing" };
  }

  return { valid: true, reason: null };
}
