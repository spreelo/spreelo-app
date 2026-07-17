import crypto from "crypto";
import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import {
  CONTENT_FORMAT_ASSET_BUCKET,
  CONTENT_FORMAT_ICON_OPTIONS,
  DEFAULT_CONTENT_FORMAT_MAP,
  normalizeContentFormatRows,
} from "../../../../lib/contentFormatLibrary";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_CATEGORIES = new Set(["popular", "text", "image_ads", "video", "educational", "sales"]);

function sanitizeFormatPayload(body, userId) {
  const contentTypeId = String(body?.content_type_id || "").trim();
  const defaults = DEFAULT_CONTENT_FORMAT_MAP[contentTypeId];

  if (!defaults) {
    throw new Error("Unknown content format.");
  }

  const iconName = CONTENT_FORMAT_ICON_OPTIONS.includes(String(body?.icon_name || ""))
    ? String(body.icon_name)
    : defaults.icon_name;
  const category = ALLOWED_CATEGORIES.has(String(body?.category || ""))
    ? String(body.category)
    : defaults.category;

  return {
    content_type_id: contentTypeId,
    icon_name: iconName,
    image_url: String(body?.image_url || "").trim() || null,
    image_storage_path: String(body?.image_storage_path || "").trim() || null,
    icon_url: String(body?.icon_url || "").trim() || null,
    icon_storage_path: String(body?.icon_storage_path || "").trim() || null,
    category,
    is_featured: Boolean(body?.is_featured),
    active: body?.active !== false,
    sort_order: Math.max(0, Math.min(9999, Number(body?.sort_order ?? defaults.sort_order) || defaults.sort_order)),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const { data, error } = await context.admin
    .from("content_format_library")
    .select("content_type_id, icon_name, image_url, image_storage_path, icon_url, icon_storage_path, category, is_featured, active, sort_order, updated_at")
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json(
      {
        ok: false,
        error: `${error.message}. Run supabase/content_format_library.sql and supabase/v73_plan_experience_and_approval_rejections.sql first.`,
      },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, formats: normalizeContentFormatRows(data || []) });
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (!new Set(["create_upload", "create_icon_upload"]).has(action)) {
    return Response.json({ ok: false, error: "Unknown content-format action." }, { status: 400 });
  }

  const contentTypeId = String(body?.content_type_id || "").trim();
  const contentType = String(body?.contentType || "").toLowerCase();
  const size = Number(body?.size || 0);

  if (!DEFAULT_CONTENT_FORMAT_MAP[contentTypeId]) {
    return Response.json({ ok: false, error: "Unknown content format." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return Response.json({ ok: false, error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  }

  if (!size || size > MAX_IMAGE_BYTES) {
    return Response.json({ ok: false, error: "The image must be smaller than 5 MB." }, { status: 400 });
  }

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const folder = action === "create_icon_upload" ? "icons" : "formats";
  const storagePath = `${folder}/${contentTypeId}-${crypto.randomUUID()}.${extension}`;
  const { data, error } = await context.admin.storage
    .from(CONTENT_FORMAT_ASSET_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    upload: {
      path: storagePath,
      token: data?.token,
    },
  });
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  let payload;

  try {
    payload = sanitizeFormatPayload(body, context.user.id);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }

  const { data: existing } = await context.admin
    .from("content_format_library")
    .select("image_storage_path, icon_storage_path")
    .eq("content_type_id", payload.content_type_id)
    .maybeSingle();

  const { data, error } = await context.admin
    .from("content_format_library")
    .upsert(payload, { onConflict: "content_type_id" })
    .select("content_type_id, icon_name, image_url, image_storage_path, icon_url, icon_storage_path, category, is_featured, active, sort_order, updated_at")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const pathsToRemove = [];
  if (
    existing?.image_storage_path &&
    existing.image_storage_path !== payload.image_storage_path
  ) {
    pathsToRemove.push(existing.image_storage_path);
  }
  if (
    existing?.icon_storage_path &&
    existing.icon_storage_path !== payload.icon_storage_path
  ) {
    pathsToRemove.push(existing.icon_storage_path);
  }
  if (pathsToRemove.length) {
    await context.admin.storage
      .from(CONTENT_FORMAT_ASSET_BUCKET)
      .remove(pathsToRemove);
  }

  return Response.json({ ok: true, format: data });
}
