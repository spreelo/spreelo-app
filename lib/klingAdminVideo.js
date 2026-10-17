function mediaUrl(value) {
  try { const url = new URL(String(value || "").trim()); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
// This helper is ADMIN ONLY. It never writes a source clip into video_url or
// changes customer delivery, approval or publication readiness.
export function adminVideoSources(post) {
  const selection = post?.video_background_selection || {};
  const finalUrl = mediaUrl(post?.video_url);
  const sourceUrl = mediaUrl(selection.kling_source_storage_url || selection.kling_source_url);
  return { previewUrl: finalUrl || sourceUrl, sourceUrl, finalUrl, isSourcePreview: !finalUrl && Boolean(sourceUrl) };
}

export function adminOpeningImages(post) {
  const comparison = post?.video_background_selection?.opening_image_comparison;
  if (!comparison) return null;
  const originalUrl = mediaUrl(comparison.original_image_url);
  const openingUrl = mediaUrl(comparison.opening_image_url);
  return originalUrl && openingUrl ? { originalUrl, openingUrl, isFallback: comparison.opening_kind === 'pixel_preserving_fallback' } : null;
}
