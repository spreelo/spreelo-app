import { httpUrl } from './klingAuditReferences.js';

// Persist both images BEFORE motion planning, which can fail independently.
// This is evidence only: it never marks a video ready or grants a generation.
export async function persistKlingOpeningAssets({
  supabase, postId, original, opening, websiteItem, openingSceneMode, referenceSafety,
}) {
  const originalUrl = httpUrl(original?.imageUrl);
  const openingUrl = httpUrl(opening?.imageUrl);
  if (!originalUrl || !openingUrl) throw new Error('Could not preserve both Kling comparison images. Check image storage before retrying; no video was ordered.');
  const { data: post, error } = await supabase.from('posts')
    .select('video_background_selection').eq('id', postId).maybeSingle();
  if (error || !post) throw new Error(`Could not load Kling comparison checkpoint. Check database access before retrying; no video was ordered. ${error?.message || 'Post missing'}`);
  const comparison = {
    original_image_url: originalUrl,
    original_storage_path: original.imageStoragePath || null,
    opening_image_url: openingUrl,
    opening_storage_path: opening.imageStoragePath || null,
    opening_kind: openingSceneMode === 'direct_scene' ? 'generated_scene' : 'pixel_preserving_fallback',
    identity_review: { status: 'disabled', confidence: null, reason: 'Separate opening-image identity review disabled by policy' },
    saved_at: new Date().toISOString(),
  };
  const selection = {
    ...post.video_background_selection,
    verified_product_image_url: originalUrl,
    verified_product_source_url: websiteItem?.image_url || null,
    verified_product_title: websiteItem?.title || websiteItem?.item_title || null,
    reference_safety: referenceSafety,
    opening_scene_mode: openingSceneMode,
    opening_image_comparison: comparison,
  };
  const { data: saved, error: saveError } = await supabase.from('posts')
    .update({ video_background_selection: selection, updated_at: new Date().toISOString() })
    .eq('id', postId).select('video_background_selection').maybeSingle();
  const confirmed = saved?.video_background_selection?.opening_image_comparison;
  if (saveError || confirmed?.original_image_url !== originalUrl || confirmed?.opening_image_url !== openingUrl) {
    throw new Error(`Could not save Kling comparison checkpoint. Check database access before retrying; no video was ordered. ${saveError?.message || 'Image references not confirmed'}`);
  }
  return comparison;
}
