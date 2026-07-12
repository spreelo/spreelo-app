import { OPENAI_MODELS, withOpenAITemperature } from "../openaiSettings.js";
import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  getDefaultNamespaceLabels,
  getUiLanguageName,
  interpolateUiText,
  normalizeUiLocale,
} from "./defaultLabels.js";

const LANGUAGE_NAME_TO_LOCALE = SUPPORTED_UI_LOCALES.reduce((map, item) => {
  map.set(String(item.locale || "").toLowerCase(), item.locale);
  map.set(String(item.language || "").toLowerCase(), item.locale);
  map.set(String(item.nativeName || "").toLowerCase(), item.locale);
  return map;
}, new Map());

const EXTRA_LANGUAGE_ALIASES = new Map([
  ["chinese", "zh"],
  ["simplified chinese", "zh"],
  ["chinese simplified", "zh"],
  ["mandarin", "zh"],
  ["norwegian bokmal", "no"],
  ["norwegian bokmål", "no"],
  ["norsk bokmal", "no"],
  ["norsk bokmål", "no"],
  ["indonesian", "id"],
  ["bahasa indonesia", "id"],
]);

function parseAcceptLanguageHeader(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean);
}

export function resolveUiLocaleFromLanguageName(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return null;

  const lowerValue = rawValue.toLowerCase();
  const normalized = normalizeUiLocale(lowerValue);

  if (SUPPORTED_UI_LOCALES.some((item) => item.locale === normalized)) {
    return normalized;
  }

  if (LANGUAGE_NAME_TO_LOCALE.has(lowerValue)) {
    return LANGUAGE_NAME_TO_LOCALE.get(lowerValue);
  }

  if (EXTRA_LANGUAGE_ALIASES.has(lowerValue)) {
    return EXTRA_LANGUAGE_ALIASES.get(lowerValue);
  }

  return null;
}

export function resolveUiLocaleFromRequest(request) {
  const url = new URL(request.url);
  const urlLocale = resolveUiLocaleFromLanguageName(url.searchParams.get("lang"));

  if (urlLocale) return urlLocale;

  const acceptLanguageLocales = parseAcceptLanguageHeader(
    request.headers.get("accept-language")
  );

  for (const locale of acceptLanguageLocales) {
    const resolvedLocale = resolveUiLocaleFromLanguageName(locale);

    if (resolvedLocale) return resolvedLocale;
  }

  return DEFAULT_UI_LOCALE;
}


export function detectLikelyUiLocaleFromText(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const sample = text.slice(0, 2500);

  if (/[\u4E00-\u9FFF]/.test(sample)) return "zh";
  if (/[\u3040-\u30ff]/.test(sample)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(sample)) return "ko";
  if (/[\u0E00-\u0E7F]/.test(sample)) return "th";
  if (/[\u0900-\u097F]/.test(sample)) return "hi";
  if (/[\u0600-\u06FF]/.test(sample)) return "ar";

  const latinLower = sample.toLowerCase();

  if (/\b(och|att|för|som|med|det|den|du|din|dina|till|inte|eller|är|på|från|här|våra|vårt|passa|handla|se vårt|produkter)\b/.test(latinLower)) {
    return "sv";
  }

  if (/\b(og|ikke|eller|med|til|fra|vores|dine|køb|se vores)\b/.test(latinLower)) {
    return "da";
  }

  if (/\b(og|ikke|eller|med|til|fra|våre|dine|kjøp|se vårt)\b/.test(latinLower)) {
    return "no";
  }

  if (/[\u0400-\u04FF]/.test(sample)) {
    const lower = sample.toLowerCase();

    if (/[іїєґ]/i.test(sample)) return "uk";
    if (/\b(и|в|не|на|для|это|вы|что|как|по|от|при|если|или|уже|наш|ваш)\b/i.test(lower)) {
      return "ru";
    }

    return "ru";
  }

  return null;
}

export function resolveBestServerLocale({ request, languageCandidates = [] } = {}) {
  for (const languageCandidate of languageCandidates) {
    const resolvedLocale = resolveUiLocaleFromLanguageName(languageCandidate);

    if (resolvedLocale) return resolvedLocale;
  }

  if (request) {
    return resolveUiLocaleFromRequest(request);
  }

  return DEFAULT_UI_LOCALE;
}

function shouldRetranslateLabel({ defaultValue, translatedValue, locale }) {
  if (translatedValue === null || translatedValue === undefined) {
    return true;
  }

  const translatedText = String(translatedValue).trim();
  const defaultText = String(defaultValue || "").trim();

  if (!translatedText) return true;

  if (locale === DEFAULT_UI_LOCALE) return false;

  if (defaultText && translatedText === defaultText) {
    return true;
  }

  return false;
}

function getLabelsNeedingTranslation(defaultLabels, translatedLabels, locale) {
  return Object.entries(defaultLabels).reduce(
    (labelsNeedingTranslation, [key, value]) => {
      const translatedValue = translatedLabels?.[key];

      if (
        shouldRetranslateLabel({
          defaultValue: value,
          translatedValue,
          locale,
        })
      ) {
        labelsNeedingTranslation[key] = value;
      }

      return labelsNeedingTranslation;
    },
    {}
  );
}

function extractJsonObject(text) {
  const rawText = String(text || "").trim();

  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {}

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return {};
  }

  try {
    return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
  } catch {
    return {};
  }
}

async function callOpenAiTranslation({ locale, languageName, namespace, labels, isRetry = false }) {
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openAiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODELS.uiTranslation,
      ...withOpenAITemperature("uiTranslation"),
      messages: [
        {
          role: "system",
          content: isRetry
            ? "You are translating SaaS product text, transactional emails and confirmation pages. The input values are English fallback labels. You MUST translate every value into the target language. Return only valid JSON. Preserve all JSON keys exactly. Preserve placeholders like {brandName}, {count}, {year}, {date}, {status}, {platform}, {postType}, {approveUrl}, and {imageUrl} exactly. Do not translate brand names such as Spreelo. Do not leave English text unchanged unless the value is a brand name, URL, code word, or placeholder-only string."
            : "You translate SaaS product text, transactional emails and confirmation pages. Return only valid JSON. Preserve all JSON keys exactly. Preserve placeholders like {brandName}, {count}, {year}, {date}, {status}, {platform}, {postType}, {approveUrl}, and {imageUrl} exactly. Keep translations natural, clear and professional. Do not translate brand names such as Spreelo.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              target_locale: locale,
              target_language: languageName,
              namespace,
              labels,
            },
            null,
            2
          ),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI translation failed: ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return extractJsonObject(content);
}

function isProbablyStillEnglish({ sourceText, translatedText, locale }) {
  if (locale === DEFAULT_UI_LOCALE) return false;

  const source = String(sourceText || "").trim();
  const translated = String(translatedText || "").trim();

  if (!source || !translated) return false;
  if (source !== translated) return false;

  // Ignore values that are intentionally language-neutral.
  if (/^[\d\s.,:;!?()\-_/\\{}]+$/.test(source)) return false;
  if (/^https?:\/\//i.test(source)) return false;
  if (/^Spreelo$/i.test(source)) return false;

  return /[A-Za-z]{3,}/.test(source);
}

async function translateMissingLabels({ locale, languageName, namespace, missingLabels }) {
  const firstPass = await callOpenAiTranslation({
    locale,
    languageName,
    namespace,
    labels: missingLabels,
    isRetry: false,
  });

  let safeLabels = Object.keys(missingLabels).reduce((labels, key) => {
    const translatedValue = firstPass?.[key];

    labels[key] =
      translatedValue === null ||
      translatedValue === undefined ||
      String(translatedValue).trim() === ""
        ? missingLabels[key]
        : String(translatedValue);

    return labels;
  }, {});

  const stillEnglishLabels = Object.entries(safeLabels).reduce(
    (labels, [key, value]) => {
      if (
        isProbablyStillEnglish({
          sourceText: missingLabels[key],
          translatedText: value,
          locale,
        })
      ) {
        labels[key] = missingLabels[key];
      }

      return labels;
    },
    {}
  );

  if (Object.keys(stillEnglishLabels).length === 0) {
    return safeLabels;
  }

  const retryPass = await callOpenAiTranslation({
    locale,
    languageName,
    namespace,
    labels: stillEnglishLabels,
    isRetry: true,
  });

  safeLabels = Object.keys(stillEnglishLabels).reduce((labels, key) => {
    const translatedValue = retryPass?.[key];

    if (
      translatedValue !== null &&
      translatedValue !== undefined &&
      String(translatedValue).trim() !== "" &&
      !isProbablyStillEnglish({
        sourceText: missingLabels[key],
        translatedText: translatedValue,
        locale,
      })
    ) {
      labels[key] = String(translatedValue);
    }

    return labels;
  }, safeLabels);

  return safeLabels;
}

export async function getOrCreateServerNamespaceLabels({
  supabaseAdmin,
  locale,
  namespace,
}) {
  const safeLocale = normalizeUiLocale(locale);
  const defaultLabels = getDefaultNamespaceLabels(namespace);

  if (Object.keys(defaultLabels).length === 0) {
    return {};
  }

  if (safeLocale === DEFAULT_UI_LOCALE) {
    return defaultLabels;
  }

  const { data: existingPack, error: readError } = await supabaseAdmin
    .from("ui_translation_packs")
    .select("id, labels, status")
    .eq("locale", safeLocale)
    .eq("namespace", namespace)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const existingLabels = existingPack?.labels || {};
  const missingLabels = getLabelsNeedingTranslation(
    defaultLabels,
    existingLabels,
    safeLocale
  );

  if (Object.keys(missingLabels).length === 0) {
    return existingLabels;
  }

  const languageName = getUiLanguageName(safeLocale);

  if (existingPack?.id) {
    await supabaseAdmin
      .from("ui_translation_packs")
      .update({
        status: "updating",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPack.id);
  } else {
    await supabaseAdmin.from("ui_translation_packs").upsert(
      {
        locale: safeLocale,
        language: languageName,
        namespace,
        labels: existingLabels,
        status: "updating",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "locale,namespace",
      }
    );
  }

  const translatedMissingLabels = await translateMissingLabels({
    locale: safeLocale,
    languageName,
    namespace,
    missingLabels,
  });

  const mergedLabels = {
    ...existingLabels,
    ...translatedMissingLabels,
  };

  const { error: upsertError } = await supabaseAdmin.from("ui_translation_packs").upsert(
    {
      locale: safeLocale,
      language: languageName,
      namespace,
      labels: mergedLabels,
      status: "ready",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "locale,namespace",
    }
  );

  if (upsertError) {
    throw upsertError;
  }

  return mergedLabels;
}

export async function getServerTranslations({
  supabaseAdmin,
  locale = DEFAULT_UI_LOCALE,
  namespaces = [],
}) {
  const safeLocale = normalizeUiLocale(locale);
  const safeNamespaces = Array.from(new Set(["common", ...namespaces])).filter(Boolean);

  const labelsByNamespace = await Promise.all(
    safeNamespaces.map((namespace) =>
      getOrCreateServerNamespaceLabels({
        supabaseAdmin,
        locale: safeLocale,
        namespace,
      })
    )
  );

  const labels = Object.assign({}, ...labelsByNamespace);

  return {
    locale: safeLocale,
    labels,
    t(key, values = {}) {
      const fallback = getDefaultNamespaceLabels(key.split(".")[0])?.[key] || key;
      return interpolateUiText(labels[key] || fallback, values);
    },
  };
}
