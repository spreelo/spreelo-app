import { createClient } from "@supabase/supabase-js";
import {
  ALL_UI_NAMESPACES,
  DEFAULT_UI_LOCALE,
  getDefaultNamespaceLabels,
  getUiLanguageName,
  normalizeUiLocale,
} from "../../../lib/i18n/defaultLabels.js";
import { isLanguageNeutralUiSource, validateGeneratedUiTranslation } from "../../../lib/i18n/translationValidation.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_NAMESPACES_PER_REQUEST = 4;
const TRANSLATION_CHUNK_SIZE = 32;
const TRANSLATION_CONCURRENCY = 2;
const TRANSLATION_FETCH_TIMEOUT_MS = 24000;
const TRANSLATION_DEFER_MS = 5 * 60 * 1000;
const TRANSLATION_LEASE_STALE_MS = 90 * 1000;
const TRANSLATION_LEASE_WAIT_MS = 30 * 1000;
const TRANSLATION_LEASE_POLL_MS = 500;
const TRANSLATION_META_KEY = "__spreelo_translation_meta";


function sourceFingerprint(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getSourceFingerprints(labels) {
  const entries = labels?.[TRANSLATION_META_KEY]?.source_fingerprints;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return {};
  return entries;
}

function buildSourceFingerprints(defaultLabels) {
  return Object.fromEntries(
    Object.entries(defaultLabels || {}).map(([key, value]) => [key, sourceFingerprint(value)])
  );
}

function sourceMetadataNeedsRefresh(defaultLabels, labels) {
  const existing = getSourceFingerprints(labels);
  return Object.entries(defaultLabels || {}).some(
    ([key, value]) => existing[key] !== sourceFingerprint(value)
  );
}

function withTranslationMetadata({ labels, intentionalUnchangedKeys, deferredKeys, defaultLabels }) {
  return {
    ...stripTranslationMetadata(labels),
    [TRANSLATION_META_KEY]: {
      intentional_unchanged_keys: Array.from(intentionalUnchangedKeys || []).map(String).sort(),
      deferred_keys: deferredKeys || {},
      source_fingerprints: buildSourceFingerprints(defaultLabels),
    },
  };
}

function getIntentionalUnchangedKeys(labels) {
  const keys = labels?.[TRANSLATION_META_KEY]?.intentional_unchanged_keys;
  return new Set(Array.isArray(keys) ? keys.map((key) => String(key)) : []);
}

function getDeferredTranslationKeys(labels) {
  const entries = labels?.[TRANSLATION_META_KEY]?.deferred_keys;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return {};
  return entries;
}

function isTranslationKeyDeferred({ labels, key, defaultValue }) {
  const entry = getDeferredTranslationKeys(labels)?.[String(key)];
  if (!entry) return false;
  const until = new Date(entry.until || 0).getTime();
  const remainingMs = until - Date.now();
  if (!Number.isFinite(until) || remainingMs <= 0) return false;
  // v144.32: do not honor legacy six-hour deferrals. A transient provider
  // timeout may cool down briefly, but it must not leave new UI copy untranslated
  // for hours after the first visitor encountered it.
  if (remainingMs > TRANSLATION_DEFER_MS + 30_000) return false;
  return String(entry.source || "") === String(defaultValue || "");
}

function stripTranslationMetadata(labels) {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return {};
  const { [TRANSLATION_META_KEY]: _meta, ...clean } = labels;
  return clean;
}

function targetLocaleRequiresLocalizedScript(locale) {
  const language = String(locale || "").toLowerCase().split("-")[0];
  return new Set(["zh", "ja", "ko", "ar", "he", "th", "hi", "bn", "uk", "ru", "bg", "el"]).has(language);
}

function canAcceptIntentionalUnchanged({ locale, sourceText }) {
  const source = String(sourceText || "").trim();
  if (!source) return false;
  // Official brand/platform names, codes, URLs and placeholder-only values are
  // intentionally language-neutral even when the target language uses another script.
  if (isLanguageNeutralUiSource(source)) return true;
  if (targetLocaleRequiresLocalizedScript(locale) && /[A-Za-z]{2,}/.test(source)) return false;
  return source.length <= 40;
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseNamespaces(value) {
  const allowedNamespaces = new Set(ALL_UI_NAMESPACES);
  const namespaces = String(value || "common")
    .split(",")
    .map((namespace) => namespace.trim())
    .filter((namespace) => allowedNamespaces.has(namespace));

  return Array.from(new Set(["common", ...namespaces])).slice(0, MAX_NAMESPACES_PER_REQUEST);
}

function shouldRetranslateLabel({ key, defaultValue, translatedValue, locale, intentionalUnchangedKeys }) {
  if (translatedValue === null || translatedValue === undefined) {
    return true;
  }

  const translatedText = String(translatedValue).trim();
  const defaultText = String(defaultValue || "").trim();

  if (!translatedText) {
    return true;
  }

  if (locale === DEFAULT_UI_LOCALE) {
    return false;
  }

  // Repair old language packs that were created while the UI was still falling
  // back to English. This is what can make one language, such as Swedish, stay
  // English even though newer languages work.
  if (defaultText && translatedText === defaultText) {
    if (intentionalUnchangedKeys?.has(String(key))) return false;
    return true;
  }

  return false;
}

function getLabelsNeedingTranslation(defaultLabels, translatedLabels, locale) {
  const intentionalUnchangedKeys = getIntentionalUnchangedKeys(translatedLabels);
  const sourceFingerprints = getSourceFingerprints(translatedLabels);
  return Object.entries(defaultLabels).reduce((labelsNeedingTranslation, [key, value]) => {
    const translatedValue = translatedLabels?.[key];
    const storedFingerprint = sourceFingerprints?.[key];
    const sourceChanged = Boolean(storedFingerprint && storedFingerprint !== sourceFingerprint(value));

    if (
      (sourceChanged || shouldRetranslateLabel({
        key,
        defaultValue: value,
        translatedValue,
        locale,
        intentionalUnchangedKeys,
      })) &&
      !isTranslationKeyDeferred({ labels: translatedLabels, key, defaultValue: value })
    ) {
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

function chunkLabelEntries(labels, chunkSize = TRANSLATION_CHUNK_SIZE) {
  const entries = Object.entries(labels || {});
  const chunks = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(Object.fromEntries(entries.slice(index, index + chunkSize)));
  }
  return chunks;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );

  await Promise.all(runners);
  return results;
}

async function translateLabelChunk({
  locale,
  languageName,
  namespace,
  labels,
  chunkIndex,
}) {
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openAiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TRANSLATION_FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
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
              "You translate SaaS user interface labels. Return only one valid JSON object. Preserve all supplied label keys exactly and add one reserved array key named __intentional_unchanged_keys. Preserve placeholders like {brandName}, {count}, {year}, {date}, {days}, and {number} exactly. Keep translations concise and natural for buttons, menus, form labels, tooltips, empty states and dashboard UI. Do not translate brand names such as Spreelo. If—and only if—the correct natural target-language UI term is genuinely spelled exactly the same as the English source (for example a borrowed technical term), return that identical value and include its label key in __intentional_unchanged_keys. Never use that array merely because you are unsure or skipped a translation. For languages normally written in a non-Latin script, prefer the normal localized-script UI term rather than retaining English words.",
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                target_locale: locale,
                target_language: languageName,
                namespace,
                chunk: chunkIndex + 1,
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
    const translatedLabels = extractJsonObject(content);
    const declaredUnchanged = new Set(
      Array.isArray(translatedLabels?.__intentional_unchanged_keys)
        ? translatedLabels.__intentional_unchanged_keys.map((key) => String(key))
        : []
    );
    const intentionalUnchangedKeys = [];
    const safeLabels = Object.keys(labels).reduce((result, key) => {
      const translatedValue = translatedLabels?.[key];
      const allowUnchanged = Boolean(
        declaredUnchanged.has(key) &&
          String(translatedValue || "").trim() === String(labels[key] || "").trim() &&
          canAcceptIntentionalUnchanged({ locale, sourceText: labels[key] })
      );
      const validation = validateGeneratedUiTranslation({
        sourceText: labels[key],
        translatedText: translatedValue,
        locale,
        allowUnchanged,
      });

      if (validation.valid) {
        result[key] = String(translatedValue);
        if (allowUnchanged) intentionalUnchangedKeys.push(key);
      } else {
        console.warn("UI translation label deferred", {
          locale,
          namespace,
          chunkIndex: chunkIndex + 1,
          key,
          reason: validation.reason,
        });
      }
      return result;
    }, {});
    return { labels: safeLabels, intentionalUnchangedKeys };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `OpenAI UI translation chunk timed out after ${TRANSLATION_FETCH_TIMEOUT_MS} ms.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateMissingLabels({
  locale,
  languageName,
  namespace,
  missingLabels,
  onChunkTranslated = null,
}) {
  const chunks = chunkLabelEntries(missingLabels);
  if (!chunks.length) {
    return { translatedLabels: {}, failedKeys: [] };
  }

  const outcomes = await mapWithConcurrency(
    chunks,
    TRANSLATION_CONCURRENCY,
    async (chunk, chunkIndex) => {
      try {
        const translatedResult = await translateLabelChunk({
          locale,
          languageName,
          namespace,
          labels: chunk,
          chunkIndex,
        });
        const translated = translatedResult?.labels || {};
        const failedKeys = Object.keys(chunk).filter(
          (key) => !String(translated?.[key] || "").trim()
        );
        const intentionalUnchangedKeys = translatedResult?.intentionalUnchangedKeys || [];
        if (typeof onChunkTranslated === "function" && Object.keys(translated).length) {
          await onChunkTranslated({
            translated,
            intentionalUnchangedKeys,
            chunkIndex,
          });
        }
        return {
          translated,
          failedKeys,
          repairableFailedKeys: failedKeys,
          intentionalUnchangedKeys,
        };
      } catch (error) {
        console.warn("UI translation chunk deferred", {
          locale,
          namespace,
          chunkIndex: chunkIndex + 1,
          keyCount: Object.keys(chunk).length,
          message: error?.message || String(error),
        });
        return {
          translated: {},
          failedKeys: Object.keys(chunk),
          repairableFailedKeys: [],
          intentionalUnchangedKeys: [],
        };
      }
    }
  );

  const translatedLabels = Object.assign(
    {},
    ...outcomes.map((outcome) => outcome.translated || {})
  );
  let failedKeys = outcomes.flatMap((outcome) => outcome.failedKeys || []);
  let repairableFailedKeys = outcomes.flatMap((outcome) => outcome.repairableFailedKeys || []);
  const intentionalUnchangedKeys = outcomes.flatMap(
    (outcome) => outcome.intentionalUnchangedKeys || []
  );

  // One bounded repair pass is allowed only when OpenAI actually responded but
  // individual labels failed validation. A timeout/network/provider failure is
  // deferred immediately so one page visit can never trigger a second paid
  // request for the same failed chunk.
  if (repairableFailedKeys.length) {
    const repairLabels = Object.fromEntries(
      repairableFailedKeys.filter((key) => Object.prototype.hasOwnProperty.call(missingLabels, key)).map((key) => [key, missingLabels[key]])
    );
    try {
      const repair = await translateLabelChunk({
        locale,
        languageName,
        namespace,
        labels: repairLabels,
        chunkIndex: chunks.length,
      });
      Object.assign(translatedLabels, repair?.labels || {});
      intentionalUnchangedKeys.push(...(repair?.intentionalUnchangedKeys || []));
      if (typeof onChunkTranslated === "function" && Object.keys(repair?.labels || {}).length) {
        await onChunkTranslated({
          translated: repair.labels,
          intentionalUnchangedKeys: repair?.intentionalUnchangedKeys || [],
          chunkIndex: chunks.length,
        });
      }
      failedKeys = failedKeys.filter((key) => !String(repair?.labels?.[key] || "").trim());
      repairableFailedKeys = repairableFailedKeys.filter((key) => !String(repair?.labels?.[key] || "").trim());
    } catch (error) {
      console.warn("UI translation bounded repair deferred", {
        locale,
        namespace,
        keyCount: repairableFailedKeys.length,
        message: error?.message || String(error),
      });
    }
  }

  return { translatedLabels, failedKeys, intentionalUnchangedKeys };
}

async function readTranslationPack({ supabaseAdmin, locale, namespace }) {
  const { data, error } = await supabaseAdmin
    .from("ui_translation_packs")
    .select("id, labels, status, updated_at")
    .eq("locale", locale)
    .eq("namespace", namespace)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function claimTranslationPack({ supabaseAdmin, locale, languageName, namespace, existingPack }) {
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - TRANSLATION_LEASE_STALE_MS).toISOString();

  if (!existingPack?.id) {
    const { data, error } = await supabaseAdmin
      .from("ui_translation_packs")
      .insert({
        locale,
        language: languageName,
        namespace,
        labels: existingPack?.labels || {},
        status: "updating",
        updated_at: now,
      })
      .select("id")
      .maybeSingle();

    if (!error && data?.id) return true;
    if (error?.code !== "23505") throw error;
    return false;
  }

  let query = supabaseAdmin
    .from("ui_translation_packs")
    .update({ status: "updating", updated_at: now })
    .eq("id", existingPack.id);

  if (existingPack.status === "updating") {
    query = query.lt("updated_at", staleCutoff);
  } else if (existingPack.status === null || existingPack.status === undefined) {
    query = query.is("status", null);
  } else {
    query = query.eq("status", existingPack.status);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function waitForTranslationPack({ supabaseAdmin, locale, namespace }) {
  const deadline = Date.now() + TRANSLATION_LEASE_WAIT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TRANSLATION_LEASE_POLL_MS));
    latest = await readTranslationPack({ supabaseAdmin, locale, namespace });
    if (!latest || latest.status !== "updating") return latest;
    const updatedAt = new Date(latest.updated_at || 0).getTime();
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > TRANSLATION_LEASE_STALE_MS) return latest;
  }
  return latest;
}

async function persistSourceMetadataBaseline({ supabaseAdmin, locale, languageName, namespace, existingPack, defaultLabels }) {
  if (!existingPack?.id || !sourceMetadataNeedsRefresh(defaultLabels, existingPack.labels || {})) return;
  const existingLabels = existingPack.labels || {};
  const payload = withTranslationMetadata({
    labels: existingLabels,
    intentionalUnchangedKeys: getIntentionalUnchangedKeys(existingLabels),
    deferredKeys: getDeferredTranslationKeys(existingLabels),
    defaultLabels,
  });
  const { error } = await supabaseAdmin
    .from("ui_translation_packs")
    .update({ labels: payload, language: languageName, updated_at: new Date().toISOString() })
    .eq("id", existingPack.id)
    .or("status.neq.updating,status.is.null");
  if (error) throw error;
}

async function getOrCreateNamespaceLabels({ supabaseAdmin, locale, namespace }) {
  const defaultLabels = getDefaultNamespaceLabels(namespace);

  if (Object.keys(defaultLabels).length === 0) return {};
  if (locale === DEFAULT_UI_LOCALE) return defaultLabels;

  let existingPack = await readTranslationPack({ supabaseAdmin, locale, namespace });
  let existingLabels = existingPack?.labels || {};
  const refreshRequested = existingPack?.status === "refresh_requested";
  let missingLabels = refreshRequested
    ? { ...defaultLabels }
    : getLabelsNeedingTranslation(defaultLabels, existingLabels, locale);
  const languageName = getUiLanguageName(locale);

  if (Object.keys(missingLabels).length === 0) {
    // Existing installations predate source fingerprints. Seed them without an
    // AI call so every future English source change can invalidate only its key.
    await persistSourceMetadataBaseline({
      supabaseAdmin,
      locale,
      languageName,
      namespace,
      existingPack,
      defaultLabels,
    });
    return stripTranslationMetadata(existingLabels);
  }

  let claimed = await claimTranslationPack({
    supabaseAdmin,
    locale,
    languageName,
    namespace,
    existingPack,
  });

  if (!claimed) {
    const waitedPack = await waitForTranslationPack({ supabaseAdmin, locale, namespace });
    if (waitedPack?.status === "updating") {
      claimed = await claimTranslationPack({
        supabaseAdmin,
        locale,
        languageName,
        namespace,
        existingPack: waitedPack,
      });
    }
    if (!claimed) {
      return stripTranslationMetadata(waitedPack?.labels || existingLabels);
    }
    existingPack = waitedPack || existingPack;
  }

  // Re-read after acquiring the lease: another worker may have completed the
  // pack immediately before our atomic claim succeeded.
  existingPack = await readTranslationPack({ supabaseAdmin, locale, namespace });
  existingLabels = existingPack?.labels || existingLabels;
  const forceRefresh = refreshRequested || existingPack?.status === "refresh_requested";
  missingLabels = forceRefresh
    ? { ...defaultLabels }
    : getLabelsNeedingTranslation(defaultLabels, existingLabels, locale);

  if (Object.keys(missingLabels).length === 0) {
    const completedPayload = withTranslationMetadata({
      labels: existingLabels,
      intentionalUnchangedKeys: getIntentionalUnchangedKeys(existingLabels),
      deferredKeys: getDeferredTranslationKeys(existingLabels),
      defaultLabels,
    });
    await supabaseAdmin.from("ui_translation_packs").update({
      labels: completedPayload,
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", existingPack.id);
    return stripTranslationMetadata(completedPayload);
  }

  const existingIntentionalUnchangedKeys = getIntentionalUnchangedKeys(existingLabels);
  let progressiveLabels = stripTranslationMetadata(existingLabels);
  const progressiveIntentionalKeys = new Set(existingIntentionalUnchangedKeys);
  const progressiveDeferredKeys = { ...getDeferredTranslationKeys(existingLabels) };
  let progressWriteChain = Promise.resolve();

  const persistSuccessfulChunk = async ({ translated, intentionalUnchangedKeys = [] }) => {
    progressWriteChain = progressWriteChain.then(async () => {
      for (const [key, value] of Object.entries(translated || {})) {
        progressiveLabels[key] = value;
        delete progressiveDeferredKeys[String(key)];
        if (String(value || "").trim() !== String(defaultLabels?.[key] || "").trim()) {
          progressiveIntentionalKeys.delete(String(key));
        }
      }
      for (const key of intentionalUnchangedKeys || []) progressiveIntentionalKeys.add(String(key));
      const progressPayload = withTranslationMetadata({
        labels: progressiveLabels,
        intentionalUnchangedKeys: progressiveIntentionalKeys,
        deferredKeys: progressiveDeferredKeys,
        defaultLabels,
      });
      const { error: progressError } = await supabaseAdmin
        .from("ui_translation_packs")
        .update({
          locale,
          language: languageName,
          namespace,
          labels: progressPayload,
          status: "updating",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPack.id);
      if (progressError) throw progressError;
    });
    return progressWriteChain;
  };

  let translationOutcome;
  try {
    translationOutcome = await translateMissingLabels({
      locale,
      languageName,
      namespace,
      missingLabels,
      onChunkTranslated: persistSuccessfulChunk,
    });
    await progressWriteChain;
  } catch (translationError) {
    // Never strand a locale/namespace in an updating state after a provider or
    // persistence failure. Successful progressive chunks stay saved, while the
    // next visitor can claim and continue only the remaining keys.
    await progressWriteChain.catch(() => {});
    await supabaseAdmin
      .from("ui_translation_packs")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", existingPack.id);
    throw translationError;
  }

  const {
    translatedLabels: translatedMissingLabels,
    failedKeys,
    intentionalUnchangedKeys: newlyIntentionalUnchangedKeys,
  } = translationOutcome;

  const mergedIntentionalUnchangedKeys = new Set(existingIntentionalUnchangedKeys);
  const mergedDeferredKeys = { ...getDeferredTranslationKeys(existingLabels) };
  for (const key of newlyIntentionalUnchangedKeys || []) mergedIntentionalUnchangedKeys.add(String(key));
  for (const [key, translatedValue] of Object.entries(translatedMissingLabels || {})) {
    delete mergedDeferredKeys[String(key)];
    if (String(translatedValue || "").trim() !== String(defaultLabels?.[key] || "").trim()) {
      mergedIntentionalUnchangedKeys.delete(String(key));
    }
  }
  const deferredUntil = new Date(Date.now() + TRANSLATION_DEFER_MS).toISOString();
  for (const key of failedKeys || []) {
    mergedDeferredKeys[String(key)] = { source: String(defaultLabels?.[key] || ""), until: deferredUntil };
  }

  const mergedLabels = withTranslationMetadata({
    labels: { ...progressiveLabels, ...translatedMissingLabels },
    intentionalUnchangedKeys: mergedIntentionalUnchangedKeys,
    deferredKeys: mergedDeferredKeys,
    defaultLabels,
  });

  // A failed key is deferred in metadata, not left as an eternal "updating"
  // lock. A later request may claim the pack after the short defer window.
  const { error: upsertError } = await supabaseAdmin
    .from("ui_translation_packs")
    .update({
      locale,
      language: languageName,
      namespace,
      labels: mergedLabels,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingPack.id);

  if (upsertError) throw upsertError;
  return stripTranslationMetadata(mergedLabels);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = normalizeUiLocale(searchParams.get("locale"));
    const namespaces = parseNamespaces(searchParams.get("namespaces"));

    const supabaseAdmin = createSupabaseAdminClient();

    const labelsByNamespace = await mapWithConcurrency(
      namespaces,
      2,
      async (namespace) =>
        getOrCreateNamespaceLabels({
          supabaseAdmin,
          locale,
          namespace,
        })
    );

    const labels = Object.assign({}, ...labelsByNamespace);

    return Response.json({
      locale,
      namespaces,
      labels,
    });
  } catch (error) {
    console.error("UI translations failed:", error);

    return Response.json(
      {
        error: "Could not load UI translations.",
      },
      {
        status: 500,
      }
    );
  }
}
