import { createClient } from "@supabase/supabase-js";
import {
  ALL_UI_NAMESPACES,
  DEFAULT_UI_LOCALE,
  getDefaultNamespaceLabels,
  getUiLanguageName,
  normalizeUiLocale,
} from "../../../lib/i18n/defaultLabels.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  return Array.from(new Set(["common", ...namespaces])).slice(0, 8);
}

function shouldRetranslateLabel({ defaultValue, translatedValue, locale }) {
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
    return true;
  }

  return false;
}

function getLabelsNeedingTranslation(defaultLabels, translatedLabels, locale) {
  return Object.entries(defaultLabels).reduce((labelsNeedingTranslation, [key, value]) => {
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

async function translateMissingLabels({
  locale,
  languageName,
  namespace,
  missingLabels,
}) {
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
            "You translate SaaS user interface labels. Return only valid JSON. Preserve all JSON keys exactly. Preserve placeholders like {brandName}, {count}, {year}, {date}, {days}, and {number} exactly. Keep translations concise and natural for buttons, menus, form labels, tooltips, empty states and dashboard UI. Do not translate brand names such as Spreelo.",
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

async function getOrCreateNamespaceLabels({ supabaseAdmin, locale, namespace }) {
  const defaultLabels = getDefaultNamespaceLabels(namespace);

  if (Object.keys(defaultLabels).length === 0) {
    return {};
  }

  if (locale === DEFAULT_UI_LOCALE) {
    return defaultLabels;
  }

  const { data: existingPack, error: readError } = await supabaseAdmin
    .from("ui_translation_packs")
    .select("id, labels, status")
    .eq("locale", locale)
    .eq("namespace", namespace)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const existingLabels = existingPack?.labels || {};
  const missingLabels = getLabelsNeedingTranslation(
    defaultLabels,
    existingLabels,
    locale
  );

  if (Object.keys(missingLabels).length === 0) {
    return existingLabels;
  }

  const languageName = getUiLanguageName(locale);

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
        locale,
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
    locale,
    languageName,
    namespace,
    missingLabels,
  });

  const mergedLabels = {
    ...existingLabels,
    ...translatedMissingLabels,
  };

  const { error: upsertError } = await supabaseAdmin
    .from("ui_translation_packs")
    .upsert(
      {
        locale,
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = normalizeUiLocale(searchParams.get("locale"));
    const namespaces = parseNamespaces(searchParams.get("namespaces"));

    const supabaseAdmin = createSupabaseAdminClient();

    const labelsByNamespace = await Promise.all(
      namespaces.map(async (namespace) => {
        const labels = await getOrCreateNamespaceLabels({
          supabaseAdmin,
          locale,
          namespace,
        });

        return labels;
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
