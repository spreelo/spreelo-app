import crypto from 'crypto';
import { adminContextError, getAdminContext } from '../../../lib/adminAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'image-backgrounds';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

function normalizeText(value, maxLength = 160) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeSlug(value, fallback = 'abstract') {
  const slug = normalizeText(value, 80)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

function normalizeTags(value, limit = 24) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map((item) => normalizeSlug(item, '')).filter(Boolean))].slice(0, limit);
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = normalizeSlug(value, fallback);
  return allowed.includes(normalized) ? normalized : fallback;
}

function buildAssetPayload(body, userId) {
  return {
    name: normalizeText(body?.name, 120) || 'Untitled background',
    family: normalizeSlug(body?.family, 'abstract'),
    moods: normalizeTags(body?.moods),
    industries: normalizeTags(body?.industries),
    campaigns: normalizeTags(body?.campaigns),
    colors: normalizeTags(body?.colors),
    brightness: normalizeChoice(body?.brightness, ['light', 'medium', 'dark'], 'medium'),
    season: normalizeSlug(body?.season, 'all'),
    text_safe: body?.text_safe !== false,
    label_safe: body?.label_safe !== false,
    crop_safe_1x1: body?.crop_safe_1x1 !== false,
    active: body?.active !== false,
    is_fallback: Boolean(body?.is_fallback),
    priority: Math.max(-100, Math.min(100, Number(body?.priority) || 0)),
    notes: normalizeText(body?.notes, 1000),
    width: Math.max(0, Math.round(Number(body?.width) || 0)) || null,
    height: Math.max(0, Math.round(Number(body?.height) || 0)) || null,
    uploaded_by: userId,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const { data, error } = await context.admin
    .from('image_background_assets')
    .select('*')
    .order('is_fallback', { ascending: false })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ ok: false, canManage: true, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, canManage: true, assets: data || [] });
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '');

  if (action === 'create_upload') {
    const contentType = String(body?.contentType || '').toLowerCase();
    const size = Number(body?.size || 0);

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return Response.json({ ok: false, error: 'Only PNG, JPG and WEBP image backgrounds are supported.' }, { status: 400 });
    }

    if (!size || size > MAX_IMAGE_BYTES) {
      return Response.json({ ok: false, error: 'The image must be smaller than 12 MB.' }, { status: 400 });
    }

    const assetId = crypto.randomUUID();
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const imagePath = `library/${assetId}.${extension}`;
    const imageUpload = await context.admin.storage.from(BUCKET).createSignedUploadUrl(imagePath);

    if (imageUpload.error) {
      return Response.json({ ok: false, error: imageUpload.error?.message || 'Could not create upload URL.' }, { status: 500 });
    }

    return Response.json({
      ok: true,
      assetId,
      image: {
        path: imagePath,
        token: imageUpload.data?.token,
      },
    });
  }

  if (action === 'complete_upload') {
    const assetId = String(body?.assetId || '').trim();
    const storagePath = String(body?.storage_path || '').trim();

    if (!assetId || !storagePath.startsWith(`library/${assetId}.`)) {
      return Response.json({ ok: false, error: 'The uploaded image path is invalid.' }, { status: 400 });
    }

    const { data: publicImage } = context.admin.storage.from(BUCKET).getPublicUrl(storagePath);
    const payload = {
      id: assetId,
      ...buildAssetPayload(body, context.user.id),
      storage_path: storagePath,
      public_url: publicImage?.publicUrl || null,
      created_at: new Date().toISOString(),
    };

    if (!payload.public_url) {
      return Response.json({ ok: false, error: 'Could not create a public image URL.' }, { status: 500 });
    }

    if (payload.is_fallback) {
      await context.admin.from('image_background_assets').update({ is_fallback: false }).neq('id', assetId);
    }

    const { data, error } = await context.admin
      .from('image_background_assets')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      await context.admin.storage.from(BUCKET).remove([storagePath]);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, asset: data });
  }

  return Response.json({ ok: false, error: 'Unknown background-library action.' }, { status: 400 });
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  if (!id) return Response.json({ ok: false, error: 'Background id is required.' }, { status: 400 });

  const payload = buildAssetPayload(body, context.user.id);
  delete payload.uploaded_by;

  if (payload.is_fallback) {
    await context.admin.from('image_background_assets').update({ is_fallback: false }).neq('id', id);
  }

  const { data, error } = await context.admin
    .from('image_background_assets')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, asset: data });
}

export async function DELETE(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) return Response.json({ ok: false, error: 'Background id is required.' }, { status: 400 });

  const { data: asset, error: loadError } = await context.admin
    .from('image_background_assets')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (loadError) {
    return Response.json({ ok: false, error: loadError.message }, { status: 404 });
  }

  const { error: deleteError } = await context.admin
    .from('image_background_assets')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return Response.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  await context.admin.storage.from(BUCKET).remove([asset?.storage_path].filter(Boolean));
  return Response.json({ ok: true });
}
