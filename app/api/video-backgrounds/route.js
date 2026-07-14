import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "video-backgrounds";
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function getAdminValues(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeText(value, maxLength = 160) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeSlug(value, fallback = "abstract") {
  const slug = normalizeText(value, 80)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function normalizeTags(value, limit = 24) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => normalizeSlug(item, "")).filter(Boolean))].slice(0, limit);
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = normalizeSlug(value, fallback);
  return allowed.includes(normalized) ? normalized : fallback;
}

function buildAssetPayload(body, userId) {
  return {
    name: normalizeText(body?.name, 120) || "Untitled background",
    family: normalizeSlug(body?.family, "abstract"),
    moods: normalizeTags(body?.moods),
    industries: normalizeTags(body?.industries),
    campaigns: normalizeTags(body?.campaigns),
    colors: normalizeTags(body?.colors),
    brightness: normalizeChoice(body?.brightness, ["light", "medium", "dark"], "medium"),
    energy: normalizeChoice(body?.energy, ["low", "medium", "high"], "low"),
    season: normalizeSlug(body?.season, "all"),
    text_safe: body?.text_safe !== false,
    logo_safe: body?.logo_safe !== false,
    crop_safe_916: body?.crop_safe_916 !== false,
    active: body?.active !== false,
    is_fallback: Boolean(body?.is_fallback),
    priority: Math.max(-100, Math.min(100, Number(body?.priority) || 0)),
    notes: normalizeText(body?.notes, 1000),
    duration_seconds: Math.max(0, Number(body?.duration_seconds) || 0) || null,
    width: Math.max(0, Math.round(Number(body?.width) || 0)) || null,
    height: Math.max(0, Math.round(Number(body?.height) || 0)) || null,
    fps: Math.max(0, Number(body?.fps) || 0) || null,
    uploaded_by: userId,
    updated_at: new Date().toISOString(),
  };
}

async function getAdminContext(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = getBearerToken(request);

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Supabase environment variables are missing.", status: 500 };
  }

  if (!token) {
    return { error: "You must be logged in.", status: 401 };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return { error: "Your login session is not valid.", status: 401 };
  }

  const adminEmails = getAdminValues("SPREELO_ADMIN_EMAILS");
  const adminUserIds = getAdminValues("SPREELO_ADMIN_USER_IDS");
  const email = String(user.email || "").toLowerCase();
  const isConfigured = adminEmails.length > 0 || adminUserIds.length > 0;
  const isAdmin = adminEmails.includes(email) || adminUserIds.includes(String(user.id).toLowerCase());

  if (!isConfigured) {
    return {
      error: "Set SPREELO_ADMIN_EMAILS or SPREELO_ADMIN_USER_IDS in Vercel before managing the shared background library.",
      status: 503,
      configurationMissing: true,
      user,
    };
  }

  if (!isAdmin) {
    return { error: "This page is only available to Spreelo administrators.", status: 403, user };
  }

  return {
    user,
    admin: createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

function contextError(context) {
  return Response.json(
    {
      ok: false,
      canManage: false,
      error: context.error,
      configurationMissing: Boolean(context.configurationMissing),
    },
    { status: context.status || 500 }
  );
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return contextError(context);

  const { data, error } = await context.admin
    .from("video_background_assets")
    .select("*")
    .order("is_fallback", { ascending: false })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ ok: false, canManage: true, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, canManage: true, assets: data || [] });
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return contextError(context);

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "create_upload") {
    const contentType = String(body?.contentType || "").toLowerCase();
    const size = Number(body?.size || 0);

    if (!contentType.includes("mp4")) {
      return Response.json({ ok: false, error: "Only MP4 background videos are supported." }, { status: 400 });
    }

    if (!size || size > MAX_VIDEO_BYTES) {
      return Response.json({ ok: false, error: "The MP4 must be smaller than 60 MB." }, { status: 400 });
    }

    const assetId = crypto.randomUUID();
    const videoPath = `library/${assetId}.mp4`;
    const posterPath = `library/${assetId}-poster.jpg`;
    const [videoUpload, posterUpload] = await Promise.all([
      context.admin.storage.from(BUCKET).createSignedUploadUrl(videoPath),
      context.admin.storage.from(BUCKET).createSignedUploadUrl(posterPath),
    ]);

    if (videoUpload.error || posterUpload.error) {
      return Response.json(
        { ok: false, error: videoUpload.error?.message || posterUpload.error?.message || "Could not create upload URLs." },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      assetId,
      video: {
        path: videoPath,
        token: videoUpload.data?.token,
      },
      poster: {
        path: posterPath,
        token: posterUpload.data?.token,
      },
    });
  }

  if (action === "complete_upload") {
    const assetId = String(body?.assetId || "").trim();
    const storagePath = String(body?.storage_path || "").trim();
    const posterStoragePath = String(body?.poster_storage_path || "").trim();

    if (!assetId || storagePath !== `library/${assetId}.mp4`) {
      return Response.json({ ok: false, error: "The uploaded video path is invalid." }, { status: 400 });
    }

    const { data: publicVideo } = context.admin.storage.from(BUCKET).getPublicUrl(storagePath);
    const { data: publicPoster } = context.admin.storage.from(BUCKET).getPublicUrl(posterStoragePath);
    const payload = {
      id: assetId,
      ...buildAssetPayload(body, context.user.id),
      storage_path: storagePath,
      public_url: publicVideo?.publicUrl || null,
      poster_storage_path: posterStoragePath || null,
      poster_url: publicPoster?.publicUrl || null,
      created_at: new Date().toISOString(),
    };

    if (!payload.public_url) {
      return Response.json({ ok: false, error: "Could not create a public video URL." }, { status: 500 });
    }

    if (payload.is_fallback) {
      await context.admin.from("video_background_assets").update({ is_fallback: false }).neq("id", assetId);
    }

    const { data, error } = await context.admin
      .from("video_background_assets")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      await context.admin.storage.from(BUCKET).remove([storagePath, posterStoragePath].filter(Boolean));
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, asset: data });
  }

  return Response.json({ ok: false, error: "Unknown background-library action." }, { status: 400 });
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return contextError(context);

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();

  if (!id) {
    return Response.json({ ok: false, error: "Background id is required." }, { status: 400 });
  }

  const payload = buildAssetPayload(body, context.user.id);
  delete payload.uploaded_by;

  if (payload.is_fallback) {
    await context.admin.from("video_background_assets").update({ is_fallback: false }).neq("id", id);
  }

  const { data, error } = await context.admin
    .from("video_background_assets")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, asset: data });
}

export async function DELETE(request) {
  const context = await getAdminContext(request);
  if (context.error) return contextError(context);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (!id) {
    return Response.json({ ok: false, error: "Background id is required." }, { status: 400 });
  }

  const { data: asset, error: loadError } = await context.admin
    .from("video_background_assets")
    .select("storage_path, poster_storage_path")
    .eq("id", id)
    .single();

  if (loadError) {
    return Response.json({ ok: false, error: loadError.message }, { status: 404 });
  }

  const { error: deleteError } = await context.admin
    .from("video_background_assets")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return Response.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  await context.admin.storage
    .from(BUCKET)
    .remove([asset?.storage_path, asset?.poster_storage_path].filter(Boolean));

  return Response.json({ ok: true });
}
