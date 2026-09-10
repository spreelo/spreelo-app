import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  getDefaultNamespaceLabels,
  getDefaultLabelByKey,
  getUiLanguageName,
  interpolateUiText,
  normalizeUiLocale,
} from "./defaultLabels.js";
import { isLanguageNeutralUiSource, validateGeneratedUiTranslation } from "./translationValidation.js";

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
  ["tagalog", "fil"],
  ["filipino language", "fil"],
  ["bahasa malaysia", "ms"],
  ["malaysian", "ms"],
]);

const TRANSLATION_META_KEY = "__spreelo_translation_meta";
const TRANSLATION_LEASE_STALE_MS = 90 * 1000;
const TRANSLATION_LEASE_WAIT_MS = 30 * 1000;
const TRANSLATION_LEASE_POLL_MS = 500;

function sourceFingerprint(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getTranslationMeta(labels) {
  const meta = labels?.[TRANSLATION_META_KEY];
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
}

function stripTranslationMetadata(labels) {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return {};
  const { [TRANSLATION_META_KEY]: _meta, ...clean } = labels;
  return clean;
}

function getSourceFingerprints(labels) {
  const value = getTranslationMeta(labels).source_fingerprints;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function withSourceMetadata(labels, defaultLabels) {
  const meta = getTranslationMeta(labels);
  return {
    ...stripTranslationMetadata(labels),
    [TRANSLATION_META_KEY]: {
      ...meta,
      source_fingerprints: Object.fromEntries(
        Object.entries(defaultLabels || {}).map(([key, value]) => [key, sourceFingerprint(value)])
      ),
    },
  };
}

function sourceMetadataNeedsRefresh(labels, defaultLabels) {
  const stored = getSourceFingerprints(labels);
  return Object.entries(defaultLabels || {}).some(([key, value]) => stored[key] !== sourceFingerprint(value));
}


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

function shouldRetranslateLabel({ key, defaultValue, translatedValue, locale, translatedLabels }) {
  if (translatedValue === null || translatedValue === undefined) return true;
  const translatedText = String(translatedValue).trim();
  const defaultText = String(defaultValue || "").trim();
  if (!translatedText) return true;
  if (locale === DEFAULT_UI_LOCALE) return false;

  const storedFingerprint = getSourceFingerprints(translatedLabels)?.[String(key)];
  if (storedFingerprint && storedFingerprint !== sourceFingerprint(defaultValue)) return true;
  if (defaultText && translatedText === defaultText) {
    // Brand names, platform names, codes, URLs and placeholder-only strings are
    // valid persisted translations and must not trigger an AI call on every use.
    return !isLanguageNeutralUiSource(defaultText);
  }
  return false;
}

function getLabelsNeedingTranslation(defaultLabels, translatedLabels, locale) {
  return Object.entries(defaultLabels).reduce((labelsNeedingTranslation, [key, value]) => {
    if (shouldRetranslateLabel({
      key,
      defaultValue: value,
      translatedValue: translatedLabels?.[key],
      locale,
      translatedLabels,
    })) {
      labelsNeedingTranslation[key] = value;
    }
    return labelsNeedingTranslation;
  }, {});
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
      model: process.env.OPENAI_UI_TRANSLATION_MODEL || "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: isRetry
            ? "You are translating SaaS product text, transactional emails and confirmation pages. The input values are English fallback labels. You MUST translate every value into the target language. Return only valid JSON. Preserve all JSON keys exactly. Preserve placeholders like {brandName}, {count}, {index}, {year}, {date}, {status}, {platform}, {postType}, {campaign}, {channels}, {scheduledFor}, {approveUrl}, and {imageUrl} exactly. Do not translate brand names such as Spreelo. Do not leave English text unchanged unless the value is a brand name, URL, code word, or placeholder-only string."
            : "You translate SaaS product text, transactional emails and confirmation pages. Return only valid JSON. Preserve all JSON keys exactly. Preserve placeholders like {brandName}, {count}, {index}, {year}, {date}, {status}, {platform}, {postType}, {campaign}, {channels}, {scheduledFor}, {approveUrl}, and {imageUrl} exactly. Keep translations natural, clear and professional. Do not translate brand names such as Spreelo.",
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

function isInvalidServerTranslation({ sourceText, translatedText, locale }) {
  const source = String(sourceText || "").trim();
  const translated = String(translatedText || "").trim();
  return !validateGeneratedUiTranslation({
    sourceText,
    translatedText,
    locale,
    allowUnchanged: Boolean(source && translated === source && isLanguageNeutralUiSource(source)),
  }).valid;
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
        isInvalidServerTranslation({
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
      !isInvalidServerTranslation({
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

async function readServerTranslationPack({ supabaseAdmin, locale, namespace }) {
  const { data, error } = await supabaseAdmin
    .from("ui_translation_packs")
    .select("id, labels, status, updated_at")
    .eq("locale", locale)
    .eq("namespace", namespace)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function claimServerTranslationPack({ supabaseAdmin, locale, languageName, namespace, pack }) {
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - TRANSLATION_LEASE_STALE_MS).toISOString();
  if (!pack?.id) {
    const { data, error } = await supabaseAdmin
      .from("ui_translation_packs")
      .insert({ locale, language: languageName, namespace, labels: pack?.labels || {}, status: "updating", updated_at: now })
      .select("id")
      .maybeSingle();
    if (!error && data?.id) return true;
    if (error?.code !== "23505") throw error;
    return false;
  }
  let query = supabaseAdmin.from("ui_translation_packs")
    .update({ status: "updating", updated_at: now })
    .eq("id", pack.id);
  if (pack.status === "updating") query = query.lt("updated_at", staleCutoff);
  else if (pack.status === null || pack.status === undefined) query = query.is("status", null);
  else query = query.eq("status", pack.status);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function waitForServerTranslationPack({ supabaseAdmin, locale, namespace }) {
  const deadline = Date.now() + TRANSLATION_LEASE_WAIT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TRANSLATION_LEASE_POLL_MS));
    latest = await readServerTranslationPack({ supabaseAdmin, locale, namespace });
    if (!latest || latest.status !== "updating") return latest;
    const updated = new Date(latest.updated_at || 0).getTime();
    if (!Number.isFinite(updated) || Date.now() - updated > TRANSLATION_LEASE_STALE_MS) return latest;
  }
  return latest;
}

export async function getOrCreateServerNamespaceLabels({ supabaseAdmin, locale, namespace }) {
  const safeLocale = normalizeUiLocale(locale);
  const defaultLabels = getDefaultNamespaceLabels(namespace);
  if (Object.keys(defaultLabels).length === 0) return {};
  if (safeLocale === DEFAULT_UI_LOCALE) return defaultLabels;
  if (!supabaseAdmin) return defaultLabels;

  let pack = await readServerTranslationPack({ supabaseAdmin, locale: safeLocale, namespace });
  let persistedLabels = pack?.labels || {};
  const refreshRequested = pack?.status === "refresh_requested";
  let missingLabels = refreshRequested
    ? { ...defaultLabels }
    : getLabelsNeedingTranslation(defaultLabels, persistedLabels, safeLocale);
  const languageName = getUiLanguageName(safeLocale);

  if (Object.keys(missingLabels).length === 0) {
    if (pack?.id && sourceMetadataNeedsRefresh(persistedLabels, defaultLabels)) {
      const labelsWithMetadata = withSourceMetadata(persistedLabels, defaultLabels);
      const { error } = await supabaseAdmin.from("ui_translation_packs")
        .update({ labels: labelsWithMetadata, language: languageName, updated_at: new Date().toISOString() })
        .eq("id", pack.id)
        .or("status.neq.updating,status.is.null");
      if (error) throw error;
    }
    return stripTranslationMetadata(persistedLabels);
  }

  let claimed = await claimServerTranslationPack({
    supabaseAdmin,
    locale: safeLocale,
    languageName,
    namespace,
    pack,
  });
  if (!claimed) {
    const waited = await waitForServerTranslationPack({ supabaseAdmin, locale: safeLocale, namespace });
    if (waited?.status === "updating") {
      claimed = await claimServerTranslationPack({
        supabaseAdmin,
        locale: safeLocale,
        languageName,
        namespace,
        pack: waited,
      });
    }
    if (!claimed) return stripTranslationMetadata(waited?.labels || persistedLabels);
  }

  pack = await readServerTranslationPack({ supabaseAdmin, locale: safeLocale, namespace });
  persistedLabels = pack?.labels || persistedLabels;
  missingLabels = refreshRequested
    ? { ...defaultLabels }
    : getLabelsNeedingTranslation(defaultLabels, persistedLabels, safeLocale);

  if (Object.keys(missingLabels).length === 0) {
    const labelsWithMetadata = withSourceMetadata(persistedLabels, defaultLabels);
    await supabaseAdmin.from("ui_translation_packs")
      .update({ labels: labelsWithMetadata, status: "ready", updated_at: new Date().toISOString() })
      .eq("id", pack.id);
    return stripTranslationMetadata(labelsWithMetadata);
  }

  try {
    const translatedMissingLabels = await translateMissingLabels({
      locale: safeLocale,
      languageName,
      namespace,
      missingLabels,
    });
    const merged = withSourceMetadata({ ...stripTranslationMetadata(persistedLabels), ...translatedMissingLabels }, defaultLabels);
    const { error } = await supabaseAdmin.from("ui_translation_packs")
      .update({ locale: safeLocale, language: languageName, namespace, labels: merged, status: "ready", updated_at: new Date().toISOString() })
      .eq("id", pack.id);
    if (error) throw error;
    return stripTranslationMetadata(merged);
  } catch (error) {
    // Release the single-flight lease on failure. The next request can retry;
    // successful packs from other requests remain untouched.
    await supabaseAdmin.from("ui_translation_packs")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", pack.id);
    throw error;
  }
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
      const fallback = getDefaultLabelByKey(key) || key;
      return interpolateUiText(labels[key] || fallback, values);
    },
  };
}
