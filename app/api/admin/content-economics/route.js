import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import {
  DEFAULT_CONTENT_FORMAT_MAP,
  normalizeContentFormatRows,
} from "../../../../lib/contentFormatLibrary";
import {
  DEFAULT_REFERENCE_CREDIT_VALUE_SEK,
  getConfiguredContentCreditCost,
} from "../../../../lib/contentEconomics";

export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = new Set(["popular", "text", "image_ads", "video", "educational", "sales"]);
const MAX_ROWS = 10000;

const ECONOMICS_COLUMNS = [
  "content_type_id",
  "display_label",
  "description",
  "icon_name",
  "category",
  "is_featured",
  "active",
  "sort_order",
  "customer_credit_cost",
  "credit_variant_prices",
  "estimated_cost_sek",
  "available_starter",
  "available_growth",
  "available_pro",
  "pending_credit_cost",
  "pending_effective_at",
  "is_custom",
  "stats_reset_at",
  "updated_by",
  "updated_at",
].join(", ");

function cleanLabel(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim().slice(0, 80);
}

function cleanDescription(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 400) || null;
}

function parseCredit(value, fallback = 10) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) return fallback;
  return parsed;
}


function parseCreditVariantPrices(value, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  const result = {};
  Object.entries(source || {}).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,50}$/.test(key)) return;
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) return;
    result[key] = parsed;
  });
  return result;
}

function parseEstimatedCost(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000) {
    throw new Error("Estimated production cost must be a positive number or empty.");
  }
  return Math.round(parsed * 10000) / 10000;
}

function changedFields(before = {}, after = {}) {
  const keys = [
    "display_label",
    "description",
    "category",
    "active",
    "customer_credit_cost",
    "credit_variant_prices",
    "estimated_cost_sek",
    "available_starter",
    "available_growth",
    "available_pro",
    "pending_credit_cost",
    "pending_effective_at",
    "stats_reset_at",
  ];
  const changed = {};
  keys.forEach((key) => {
    const a = before?.[key] ?? null;
    const b = after?.[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changed[key] = { from: a, to: b };
  });
  return changed;
}

function sanitizeUpdate(body, existing, userId) {
  const defaults = DEFAULT_CONTENT_FORMAT_MAP[existing.content_type_id] || {};
  let currentCredit = parseCredit(body?.customer_credit_cost, existing.customer_credit_cost || 10);
  let pendingCredit = body?.pending_credit_cost == null || body?.pending_credit_cost === ""
    ? null
    : parseCredit(body.pending_credit_cost, null);
  let pendingAt = body?.pending_effective_at ? new Date(body.pending_effective_at) : null;

  if (pendingAt && !Number.isFinite(pendingAt.getTime())) {
    throw new Error("Scheduled credit date is not valid.");
  }
  if (pendingCredit && !pendingAt) {
    throw new Error("Choose when the scheduled credit cost should take effect.");
  }
  if (!pendingCredit) pendingAt = null;

  if (pendingCredit && pendingAt && pendingAt.getTime() <= Date.now()) {
    currentCredit = pendingCredit;
    pendingCredit = null;
    pendingAt = null;
  }

  const requestedCategory = String(body?.category || existing.category || defaults.category || "popular");
  const category = ALLOWED_CATEGORIES.has(requestedCategory)
    ? requestedCategory
    : existing.category || defaults.category || "popular";
  let creditVariantPrices = parseCreditVariantPrices(
    body?.credit_variant_prices,
    existing.credit_variant_prices || {}
  );
  if (existing.content_type_id === "engagement_humor") {
    const hasExplicitVariantPrices =
      body?.credit_variant_prices &&
      typeof body.credit_variant_prices === "object" &&
      !Array.isArray(body.credit_variant_prices);
    if (hasExplicitVariantPrices && Number(creditVariantPrices.ai_video) > 0) {
      currentCredit = Number(creditVariantPrices.ai_video);
    } else {
      creditVariantPrices = { ...creditVariantPrices, ai_video: currentCredit };
    }
  }

  return {
    content_type_id: existing.content_type_id,
    display_label: cleanLabel(body?.display_label, existing.display_label || "") || null,
    description: cleanDescription(body?.description),
    category,
    active: body?.active === true,
    customer_credit_cost: currentCredit,
    credit_variant_prices: creditVariantPrices,
    estimated_cost_sek: parseEstimatedCost(body?.estimated_cost_sek),
    available_starter: body?.available_starter !== false,
    available_growth: body?.available_growth !== false,
    available_pro: body?.available_pro !== false,
    pending_credit_cost: pendingCredit,
    pending_effective_at: pendingAt ? pendingAt.toISOString() : null,
    stats_reset_at: existing.stats_reset_at || null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}

function aggregateUsage(logRows = [], creditRows = [], formats = [], period = "30d") {
  const formatMap = new Map((formats || []).map((row) => [String(row.content_type_id), row]));
  const now = Date.now();
  const periodStart = period === "7d"
    ? now - 7 * 24 * 60 * 60 * 1000
    : period === "all"
      ? 0
      : now - 30 * 24 * 60 * 60 * 1000;

  const map = new Map();
  const get = (id) => {
    const key = String(id || "unknown");
    if (!map.has(key)) {
      map.set(key, {
        generated: 0,
        succeeded: 0,
        failed: 0,
        durationTotalMs: 0,
        durationCount: 0,
        netCreditsCharged: 0,
      });
    }
    return map.get(key);
  };

  const allowedAfter = (id, value) => {
    const time = new Date(value || 0).getTime();
    if (!Number.isFinite(time)) return false;
    const row = formatMap.get(String(id || ""));
    const resetAt = period === "reset" && row?.stats_reset_at ? new Date(row.stats_reset_at).getTime() : 0;
    const threshold = period === "reset" ? resetAt : periodStart;
    return time >= threshold;
  };

  logRows.forEach((row) => {
    if (!allowedAfter(row.content_type_id, row.started_at)) return;
    const item = get(row.content_type_id);
    if (row.status === "success") {
      item.generated += 1;
      item.succeeded += 1;
    } else if (row.status === "failed") {
      item.failed += 1;
    }
    const duration = Number(row.duration_ms || 0);
    if (duration > 0 && ["success", "failed"].includes(row.status)) {
      item.durationTotalMs += duration;
      item.durationCount += 1;
    }
  });

  creditRows.forEach((row) => {
    if (!allowedAfter(row.content_type_id, row.created_at)) return;
    const item = get(row.content_type_id);
    item.netCreditsCharged += -Number(row.amount || 0);
  });

  return Object.fromEntries(
    [...map.entries()].map(([key, value]) => {
      const attempts = value.succeeded + value.failed;
      return [key, {
        generated: value.generated,
        failed: value.failed,
        failureRate: attempts ? value.failed / attempts : 0,
        avgDurationMs: value.durationCount ? Math.round(value.durationTotalMs / value.durationCount) : 0,
        netCreditsCharged: Math.round(value.netCreditsCharged),
      }];
    })
  );
}

async function loadPayload(context, period = "30d") {
  const safePeriod = ["7d", "30d", "reset", "all"].includes(period) ? period : "30d";
  const earliest = safePeriod === "7d"
    ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    : safePeriod === "30d"
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const formatsResult = await context.admin.from("content_format_library").select(ECONOMICS_COLUMNS).order("sort_order", { ascending: true });
  if (formatsResult.error) throw formatsResult.error;
  const rawFormats = formatsResult.data || [];

  let queryStart = earliest;
  if (safePeriod === "reset") {
    const resets = rawFormats.map((row) => row.stats_reset_at).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
    queryStart = resets.length ? new Date(Math.min(...resets)).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  let logsQuery = context.admin.from("automation_run_logs").select("content_type_id, status, duration_ms, started_at").order("started_at", { ascending: false }).limit(MAX_ROWS);
  let creditsQuery = context.admin.from("credit_reservation_events").select("content_type_id, event_type, amount, created_at").order("created_at", { ascending: false }).limit(MAX_ROWS);
  if (queryStart) {
    logsQuery = logsQuery.gte("started_at", queryStart);
    creditsQuery = creditsQuery.gte("created_at", queryStart);
  }

  const [settingsResult, logsResult, creditResult, auditResult] = await Promise.all([
    context.admin.from("content_economics_settings").select("setting_key, numeric_value, text_value, updated_at"),
    logsQuery,
    creditsQuery,
    context.admin.from("content_credit_audit").select("id, content_type_id, change_type, changed_fields, changed_by_email, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  if (settingsResult.error) throw settingsResult.error;

  const usage = aggregateUsage(logsResult.data || [], creditResult.data || [], rawFormats, safePeriod);
  const formats = normalizeContentFormatRows(rawFormats, { includeCustom: true }).map((row) => ({
    ...row,
    effective_credit_cost: getConfiguredContentCreditCost(row),
    usage_30d: usage[row.content_type_id] || {
      generated: 0,
      failed: 0,
      failureRate: 0,
      avgDurationMs: 0,
      netCreditsCharged: 0,
    },
  }));

  const settingsMap = Object.fromEntries((settingsResult.data || []).map((item) => [item.setting_key, item]));
  const referenceCreditValueSek = Number(settingsMap.reference_credit_value_sek?.numeric_value || DEFAULT_REFERENCE_CREDIT_VALUE_SEK);

  const overall = formats.reduce((summary, row) => {
    if (row.active) summary.activeTypes += 1;
    summary.totalGenerated += Number(row.usage_30d?.generated || 0);
    summary.totalFailed += Number(row.usage_30d?.failed || 0);
    summary.totalNetCredits += Number(row.usage_30d?.netCreditsCharged || 0);
    if (row.active) {
      summary.creditTotal += Number(row.effective_credit_cost || 0);
      summary.creditCount += 1;
    }
    return summary;
  }, { activeTypes: 0, totalGenerated: 0, totalFailed: 0, totalNetCredits: 0, creditTotal: 0, creditCount: 0 });

  const totalAttempts = overall.totalGenerated + overall.totalFailed;

  return {
    formats,
    referenceCreditValueSek,
    audit: auditResult.data || [],
    period: safePeriod,
    warnings: [logsResult.error?.message, creditResult.error?.message, auditResult.error?.message].filter(Boolean),
    summary: {
      activeTypes: overall.activeTypes,
      averageCredits: overall.creditCount ? Math.round((overall.creditTotal / overall.creditCount) * 10) / 10 : 0,
      generated30d: overall.totalGenerated,
      successRate30d: totalAttempts ? overall.totalGenerated / totalAttempts : 1,
      netCredits30d: overall.totalNetCredits,
    },
  };
}

async function insertAudit(context, { contentTypeId, changeType, before, after }) {
  const fields = changedFields(before, after);
  const { error } = await context.admin.from("content_credit_audit").insert({
    content_type_id: contentTypeId,
    change_type: changeType,
    changed_fields: fields,
    before_state: before || null,
    after_state: after || null,
    changed_by: context.user.id,
    changed_by_email: context.user.email || null,
  });
  if (error) throw error;
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const period = new URL(request.url).searchParams.get("period") || "30d";
    return Response.json({ ok: true, ...(await loadPayload(context, period)) });
  } catch (error) {
    return Response.json({
      ok: false,
      isAdmin: true,
      error: `${error.message || "Could not load Content & Credits."} Run supabase/v143_74_content_economics.sql before using this page.`,
    }, { status: 500 });
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "create_type");

    if (action === "reset_reliability") {
      const ids = Array.isArray(body?.content_type_ids)
        ? body.content_type_ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [String(body?.content_type_id || "").trim()].filter(Boolean);
      if (!ids.length || ids.length > 100) {
        return Response.json({ ok: false, error: "Choose between 1 and 100 content types to reset." }, { status: 400 });
      }
      const resetAt = new Date().toISOString();
      const { error } = await context.admin
        .from("content_format_library")
        .update({ stats_reset_at: resetAt, updated_by: context.user.id, updated_at: resetAt })
        .in("content_type_id", ids);
      if (error) throw error;
      for (const contentTypeId of ids) {
        await insertAudit(context, {
          contentTypeId,
          changeType: "reliability_reset",
          before: {},
          after: { stats_reset_at: resetAt },
        });
      }
      return Response.json({ ok: true, ...(await loadPayload(context, "reset")) });
    }

    if (action === "update_settings") {
      const value = Number(body?.reference_credit_value_sek);
      if (!Number.isFinite(value) || value <= 0 || value > 1000) {
        return Response.json({ ok: false, error: "Reference credit value must be greater than zero." }, { status: 400 });
      }
      const { error } = await context.admin.from("content_economics_settings").upsert({
        setting_key: "reference_credit_value_sek",
        numeric_value: Math.round(value * 10000) / 10000,
        updated_by: context.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "setting_key" });
      if (error) throw error;
      await insertAudit(context, {
        contentTypeId: "__global__",
        changeType: "reference_credit_value",
        before: {},
        after: { reference_credit_value_sek: value },
      });
      return Response.json({ ok: true, ...(await loadPayload(context)) });
    }

    const contentTypeId = String(body?.content_type_id || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,60}$/.test(contentTypeId)) {
      return Response.json({ ok: false, error: "Internal key must use lowercase letters, numbers and underscores." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await context.admin
      .from("content_format_library")
      .select("content_type_id")
      .eq("content_type_id", contentTypeId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return Response.json({ ok: false, error: "That content type already exists." }, { status: 409 });
    }

    const category = ALLOWED_CATEGORIES.has(String(body?.category || "")) ? String(body.category) : "popular";
    const payload = {
      content_type_id: contentTypeId,
      display_label: cleanLabel(body?.display_label, contentTypeId),
      description: cleanDescription(body?.description),
      icon_name: "Sparkles",
      category,
      is_featured: false,
      active: false,
      sort_order: Math.max(1000, Number(body?.sort_order || 9999)),
      customer_credit_cost: parseCredit(body?.customer_credit_cost, 10),
      credit_variant_prices: parseCreditVariantPrices(body?.credit_variant_prices, {}),
      estimated_cost_sek: parseEstimatedCost(body?.estimated_cost_sek),
      available_starter: body?.available_starter !== false,
      available_growth: body?.available_growth !== false,
      available_pro: body?.available_pro !== false,
      pending_credit_cost: null,
      pending_effective_at: null,
      is_custom: true,
      stats_reset_at: null,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await context.admin.from("content_format_library").insert(payload).select(ECONOMICS_COLUMNS).single();
    if (error) throw error;
    await insertAudit(context, { contentTypeId, changeType: "create", before: null, after: data });

    return Response.json({ ok: true, ...(await loadPayload(context)) });
  } catch (error) {
    return Response.json({ ok: false, isAdmin: true, error: error.message || "Could not create the content type." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const body = await request.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : [body];
    if (!updates.length || updates.length > 100) {
      return Response.json({ ok: false, error: "Choose between 1 and 100 content types to update." }, { status: 400 });
    }

    for (const update of updates) {
      const contentTypeId = String(update?.content_type_id || "").trim();
      if (!contentTypeId) throw new Error("Content type is missing.");

      const { data: existing, error: existingError } = await context.admin
        .from("content_format_library")
        .select(ECONOMICS_COLUMNS)
        .eq("content_type_id", contentTypeId)
        .single();
      if (existingError) throw existingError;

      const payload = sanitizeUpdate(update, existing, context.user.id);
      const { data: saved, error: saveError } = await context.admin
        .from("content_format_library")
        .update(payload)
        .eq("content_type_id", contentTypeId)
        .select(ECONOMICS_COLUMNS)
        .single();
      if (saveError) throw saveError;

      await insertAudit(context, { contentTypeId, changeType: updates.length > 1 ? "bulk_update" : "update", before: existing, after: saved });
    }

    return Response.json({ ok: true, ...(await loadPayload(context)) });
  } catch (error) {
    return Response.json({ ok: false, isAdmin: true, error: error.message || "Could not update content economics." }, { status: 500 });
  }
}
