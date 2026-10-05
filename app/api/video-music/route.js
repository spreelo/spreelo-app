import { isMissingMusicCatalog, loadVideoMusicDeletedIds, markVideoMusicDeleted, excludeDeletedVideoMusic } from "../../../lib/videoMusicDeletions.js";
import crypto from "crypto";
import { adminContextError, getAdminContext } from "../../../lib/adminAuth.js";
import {
  VIDEO_MUSIC_BUCKET,
  VIDEO_MUSIC_CATALOG_PATH,
  VIDEO_MUSIC_CATALOG_VERSION,
  buildDefaultVideoMusicCatalog,
  normalizeVideoMusicCatalog,
  normalizeVideoMusicTrack,
} from "../../../lib/videoMusicLibrary.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
]);

function normalizeText(value, maxLength = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeSlug(value, fallback = "") {
  const slug = normalizeText(value, 100)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function normalizeTags(value, limit = 60) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => normalizeSlug(item)).filter(Boolean))].slice(0, limit);
}

function normalizeAudioContentType(contentType, filename) {
  const raw = String(contentType || "").toLowerCase().trim();
  const lower = String(filename || "").toLowerCase();

  if (raw.includes("wav") || lower.endsWith(".wav")) return "audio/wav";
  if (raw === "audio/mpeg" || raw === "audio/mp3" || lower.endsWith(".mp3")) return "audio/mpeg";
  if (raw === "audio/mp4" || raw === "audio/x-m4a" || lower.endsWith(".m4a")) return "audio/mp4";
  if (raw === "audio/aac" || lower.endsWith(".aac")) return "audio/aac";
  return raw || "application/octet-stream";
}

function getExtension(contentType, filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".wav")) return "wav";
  if (lower.endsWith(".mp3")) return "mp3";
  if (lower.endsWith(".m4a")) return "m4a";
  if (lower.endsWith(".aac")) return "aac";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("aac")) return "aac";
  return null;
}

function buildEditableTrackPayload(body, existing = null) {
  const now = new Date().toISOString();
  return normalizeVideoMusicTrack({
    ...(existing || {}),
    id: existing?.id || body?.id,
    name: normalizeText(body?.name, 140) || existing?.name || "Untitled track",
    source_kind: existing?.source_kind || body?.source_kind || "uploaded",
    public_path: existing?.public_path || body?.public_path || null,
    public_url: existing?.public_url || body?.public_url || null,
    storage_path: existing?.storage_path || body?.storage_path || null,
    duration_seconds: existing?.duration_seconds ?? body?.duration_seconds,
    active: body?.active !== false,
    priority: Math.max(-100, Math.min(100, Number(body?.priority) || 0)),
    volume: Math.max(0, Math.min(1, Number(body?.volume ?? 0.5) || 0.5)),
    categories: normalizeTags(body?.categories),
    moods: normalizeTags(body?.moods),
    industries: normalizeTags(body?.industries),
    formats: normalizeTags(body?.formats),
    keywords: normalizeTags(body?.keywords, 100),
    energy: ["low", "medium", "high"].includes(normalizeSlug(body?.energy))
      ? normalizeSlug(body?.energy)
      : "medium",
    notes: normalizeText(body?.notes, 1200),
    created_at: existing?.created_at || body?.created_at || now,
    updated_at: now,
  });
}

async function ensureMusicBucket(admin) {
  const bucketOptions = {
    public: true,
    fileSizeLimit: MAX_AUDIO_BYTES,
    allowedMimeTypes: ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/aac", "application/json"],
  };
  const { data, error } = await admin.storage.getBucket(VIDEO_MUSIC_BUCKET);
  if (!error && data) {
    const updateResult = await admin.storage.updateBucket(VIDEO_MUSIC_BUCKET, bucketOptions);
    if (updateResult.error) throw updateResult.error;
    return;
  }

  const createResult = await admin.storage.createBucket(VIDEO_MUSIC_BUCKET, bucketOptions);

  if (createResult.error) {
    const message = String(createResult.error.message || "").toLowerCase();
    if (!message.includes("already") && !message.includes("exist")) {
      throw createResult.error;
    }
  }
}

async function readCatalog(admin) {
  await ensureMusicBucket(admin);
  const storage = admin.storage.from(VIDEO_MUSIC_BUCKET);
  const { data, error } = await storage.download(VIDEO_MUSIC_CATALOG_PATH);
  if (error && !isMissingMusicCatalog(error)) throw error;
  let catalog;
  if (!error && data) {
    // A corrupt or temporarily unavailable catalog must never reset deletions.
    const parsed = JSON.parse(await data.text());
    catalog = normalizeVideoMusicCatalog(parsed);
    if (Number(parsed?.version || 1) < VIDEO_MUSIC_CATALOG_VERSION) {
      catalog = await writeCatalog(admin, catalog);
    }
  } else if (isMissingMusicCatalog(error)) {
    catalog = await writeCatalog(admin, buildDefaultVideoMusicCatalog());
  } else {
    throw new Error("The music catalog could not be read.");
  }
  return excludeDeletedVideoMusic(catalog, await loadVideoMusicDeletedIds(storage));
}

async function writeCatalog(admin, catalog) {
  await ensureMusicBucket(admin);
  const normalized = excludeDeletedVideoMusic(normalizeVideoMusicCatalog({
    ...catalog,
    updated_at: new Date().toISOString(),
  }), await loadVideoMusicDeletedIds(admin.storage.from(VIDEO_MUSIC_BUCKET)));
  const body = Buffer.from(JSON.stringify(normalized, null, 2), "utf8");
  const { error } = await admin.storage
    .from(VIDEO_MUSIC_BUCKET)
    .upload(VIDEO_MUSIC_CATALOG_PATH, body, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) throw error;
  return normalized;
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const catalog = await readCatalog(context.admin);
    return Response.json({
      ok: true,
      canManage: true,
      tracks: catalog.tracks || [],
      catalogUpdatedAt: catalog.updated_at || null,
      bucket: VIDEO_MUSIC_BUCKET,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        canManage: true,
        configurationMissing: true,
        error: error?.message || "Could not load the music library.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "create_upload") {
      const filename = normalizeText(body?.filename, 220);
      const contentType = normalizeAudioContentType(body?.contentType, filename);
      const size = Number(body?.size || 0);
      const extension = getExtension(contentType, filename);

      if (!extension || !ALLOWED_AUDIO_TYPES.has(contentType)) {
        return Response.json(
          { ok: false, error: "Use a WAV, MP3, M4A or AAC audio file." },
          { status: 400 }
        );
      }
      if (!size || size > MAX_AUDIO_BYTES) {
        return Response.json(
          { ok: false, error: "The audio file must be smaller than 30 MB." },
          { status: 400 }
        );
      }

      await ensureMusicBucket(context.admin);
      const assetId = crypto.randomUUID();
      const storagePath = `tracks/${assetId}.${extension}`;
      const upload = await context.admin.storage
        .from(VIDEO_MUSIC_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (upload.error) throw upload.error;

      return Response.json({
        ok: true,
        assetId,
        audio: {
          path: storagePath,
          token: upload.data?.token,
          contentType,
        },
      });
    }

    if (action === "complete_upload") {
      const assetId = String(body?.assetId || "").trim();
      const storagePath = String(body?.storage_path || "").trim();
      const durationSeconds = Number(body?.duration_seconds || 0);

      if (!assetId || !storagePath.startsWith(`tracks/${assetId}.`)) {
        return Response.json({ ok: false, error: "The uploaded audio path is invalid." }, { status: 400 });
      }
      if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
        return Response.json(
          { ok: false, error: "Music-library clips must be between 1 and 60 seconds long." },
          { status: 400 }
        );
      }

      const { data: publicAudio } = context.admin.storage
        .from(VIDEO_MUSIC_BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl = publicAudio?.publicUrl || null;
      if (!publicUrl) throw new Error("Could not create a public audio URL.");

      const catalog = await readCatalog(context.admin);
      if ((catalog.tracks || []).some((track) => track.id === assetId)) {
        return Response.json({ ok: false, error: "This audio asset already exists." }, { status: 409 });
      }

      const track = buildEditableTrackPayload(
        {
          ...body,
          id: assetId,
          source_kind: "uploaded",
          storage_path: storagePath,
          public_url: publicUrl,
          duration_seconds: durationSeconds,
        },
        null
      );
      const nextCatalog = await writeCatalog(context.admin, {
        ...catalog,
        tracks: [track, ...(catalog.tracks || [])],
      });

      return Response.json({ ok: true, track, catalogUpdatedAt: nextCatalog.updated_at });
    }

    return Response.json({ ok: false, error: "Unknown music-library action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not update the music library." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return Response.json({ ok: false, error: "Track id is required." }, { status: 400 });

  try {
    const catalog = await readCatalog(context.admin);
    const existing = (catalog.tracks || []).find((track) => track.id === id);
    if (!existing) return Response.json({ ok: false, error: "Track not found." }, { status: 404 });

    const track = buildEditableTrackPayload({ ...body, id }, existing);
    const tracks = (catalog.tracks || []).map((item) => (item.id === id ? track : item));
    const nextCatalog = await writeCatalog(context.admin, { ...catalog, tracks });
    return Response.json({ ok: true, track, catalogUpdatedAt: nextCatalog.updated_at });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save the track." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return Response.json({ ok: false, error: "Track id is required." }, { status: 400 });

  try {
    const catalog = await readCatalog(context.admin);
    const existing = (catalog.tracks || []).find((track) => track.id === id);
    if (!existing) {
      const deleted = await loadVideoMusicDeletedIds(context.admin.storage.from(VIDEO_MUSIC_BUCKET));
      if (deleted.has(id)) return Response.json({ ok: true });
      return Response.json({ ok: false, error: "Track not found." }, { status: 404 });
    }

    // Persist deletion before touching the shared catalog. Concurrent writes
    // cannot undo this independent object. A repeated DELETE is safe.
    await markVideoMusicDeleted(context.admin.storage.from(VIDEO_MUSIC_BUCKET), id);
    const tracks = (catalog.tracks || []).filter((track) => track.id !== id);
    try { await writeCatalog(context.admin, { ...catalog, tracks }); }
    catch (error) { console.warn("Music deletion persisted; catalog compaction deferred", { id, message: error.message }); }

    if (existing.source_kind === "uploaded" && existing.storage_path) {
      const removal = await context.admin.storage
        .from(VIDEO_MUSIC_BUCKET)
        .remove([existing.storage_path]);
      if (removal.error) {
        console.warn("Music catalog updated but uploaded audio could not be removed", {
          id,
          storagePath: existing.storage_path,
          message: removal.error.message || String(removal.error),
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not delete the track." },
      { status: 500 }
    );
  }
}
