// v144.356: A real remote 429 has a different meaning from Spreelo's own
// request pacing. Both share a domain-wide cooldown, but only the former may
// permanently place a never-successful website into Admin Rescue.
export const WEBSITE_429_BACKOFF_MS = Object.freeze([
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  120 * 60_000,
]);

export function chooseWebsite429DelayMs({ consecutive429Count = 1, retryAfterMs = 0 } = {}) {
  const count = Math.max(1, Math.floor(Number(consecutive429Count) || 1));
  return Math.max(
    WEBSITE_429_BACKOFF_MS[Math.min(count - 1, WEBSITE_429_BACKOFF_MS.length - 1)],
    Math.max(0, Number(retryAfterMs) || 0)
  );
}

export function decideWebsite429Action({ realRemote429 = false, historicalSuccess = false, historyKnown = true } = {}) {
  if (realRemote429 && historyKnown && !historicalSuccess) return "permanent_rescue";
  // Unknown history must never cause an irreversible auto-ban.
  return "cooldown";
}

export function isCompletedWebsiteHistoryPost(post) {
  if (!post || !["published", "pending_approval", "approved", "scheduled"].includes(post.status)) return false;
  const videoRequired = post.content_format === 'animated_video' ||
    ['kling','shotstack'].includes(String(post.video_provider || '').toLowerCase()) ||
    ['ai_product_video','animated_website_item'].includes(post.content_type_id);
  if (post.video_status === "ready" && Boolean(post.video_storage_path || post.video_url)) return true;
  // A website product can also have produced a finished image/carousel post.
  if (post.status === "published") return true;
  if (videoRequired) return false;
  return ["pending_approval", "approved"].includes(post.status) &&
    post.image_status === "ready" && Boolean(post.image_url || post.image_storage_path) &&
    (post.content_format !== "animated_video" || post.video_status === "ready");
}
