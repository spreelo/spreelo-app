import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import {
  ALL_UI_NAMESPACES,
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  getUiLanguageName,
  normalizeUiLocale,
} from "../../../../lib/i18n/defaultLabels";

export const dynamic = "force-dynamic";

function getSupportedLocale(value) {
  const locale = normalizeUiLocale(value);
  return SUPPORTED_UI_LOCALES.some((item) => item.locale === locale)
    ? locale
    : null;
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const { data, error } = await context.admin
    .from("ui_translation_packs")
    .select("locale, namespace, status, updated_at")
    .order("locale", { ascending: true });

  if (error) {
    return Response.json(
      { ok: false, error: error.message || "Could not load translation status." },
      { status: 500 }
    );
  }

  const statuses = (data || []).reduce((result, item) => {
    const locale = normalizeUiLocale(item.locale);
    if (!result[locale]) result[locale] = [];
    result[locale].push({
      namespace: item.namespace,
      status: item.status || "ready",
      updatedAt: item.updated_at || null,
    });
    return result;
  }, {});

  return Response.json({
    ok: true,
    defaultLocale: DEFAULT_UI_LOCALE,
    namespaces: ALL_UI_NAMESPACES,
    locales: SUPPORTED_UI_LOCALES,
    statuses,
  });
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const requestedLocales = Array.isArray(body?.locales) ? body.locales : [];
  const locales = Array.from(
    new Set(requestedLocales.map(getSupportedLocale).filter(Boolean))
  ).filter((locale) => locale !== DEFAULT_UI_LOCALE);

  if (!locales.length) {
    return Response.json(
      { ok: false, error: "Choose at least one non-English language." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data: existingRows, error: readError } = await context.admin
    .from("ui_translation_packs")
    .select("locale, namespace, labels")
    .in("locale", locales)
    .in("namespace", ALL_UI_NAMESPACES);

  if (readError) {
    return Response.json(
      { ok: false, error: readError.message },
      { status: 500 }
    );
  }

  const existingLabelsByPack = new Map(
    (existingRows || []).map((row) => [
      `${normalizeUiLocale(row.locale)}::${row.namespace}`,
      row.labels || {},
    ])
  );

  const rows = locales.flatMap((locale) =>
    ALL_UI_NAMESPACES.map((namespace) => ({
      locale,
      language: getUiLanguageName(locale),
      namespace,
      labels: existingLabelsByPack.get(`${locale}::${namespace}`) || {},
      status: "refresh_requested",
      updated_at: now,
    }))
  );

  // Preserve existing labels and mark all selected language packs in one
  // batch. Each namespace is regenerated lazily the next time it is opened.
  const { error: upsertError } = await context.admin
    .from("ui_translation_packs")
    .upsert(rows, { onConflict: "locale,namespace" });

  if (upsertError) {
    return Response.json(
      { ok: false, error: upsertError.message },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    locales,
    namespaceCount: ALL_UI_NAMESPACES.length,
  });
}
