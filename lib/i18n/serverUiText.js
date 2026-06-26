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

async function translateMissingLabels({ locale, languageName, namespace, missingLabels }) {
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
      model: process.env.OPENAI_UI_TRANSLATION_MODEL || "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You translate SaaS product text, transactional emails and confirmation pages. Return only valid JSON. Preserve all JSON keys exactly. Preserve placeholders like {brandName}, {count}, {year}, {date}, {status}, {platform}, {postType}, {approveUrl}, and {imageUrl} exactly. Keep translations natural, clear and professional. Do not translate brand names such as Spreelo.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              target_locale: locale,
              target_language: languageName,
              namespace,
              labels: missingLabels,
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
  const translatedLabels = extractJsonObject(content);

  return Object.keys(missingLabels).reduce((safeLabels, key) => {
    const translatedValue = translatedLabels?.[key];

    safeLabels[key] =
      translatedValue === null ||
      translatedValue === undefined ||
      String(translatedValue).trim() === ""
        ? missingLabels[key]
        : String(translatedValue);

    return safeLabels;
  }, {});
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
