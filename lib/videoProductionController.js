// v144.347 Production Controller. A separate, durable state machine for local
// post-processing. Never spend another provider video generation to repair text.
// Data is stored in posts.video_background_selection.finalization_control.
export const VIDEO_PRODUCTION_VERSION = 347;
export const MAX_FINALIZATION_ATTEMPTS = 3; // initial attempt + at most two technical retries
export const FINALIZATION_BACKOFF_MS = 5 * 60 * 1000;

const REVIEW_CODES = new Set([
  'KLING_TYPOGRAPHY_LAYOUT_UNSAFE',
  'KLING_TYPOGRAPHY_SUBMISSION_UNKNOWN',
  'KLING_TYPOGRAPHY_DESIGN_FAILED',
  'TYPOGRAPHY_DESIGN_CONTRAST_REJECTED',
  'VIDEO_ADVERTISING_DESIGN_REJECTED',
  'KLING_RENDER_DESIGN_REJECTED',
  'SHOTSTACK_DESIGN_REVIEW_REJECTED',
  'QUALITY_FALLBACK_SUBMISSION_UNKNOWN',
  'SHOTSTACK_SUBMISSION_UNKNOWN',
  'SHOTSTACK_RENDER_FAILED',
  'SHOTSTACK_RENDER_TIMEOUT',
]);

export function classifyProductionFailure(error, selection = {}) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || 'Unknown finalization failure');
  const typography = String(selection?.text_overlay_status || '').toLowerCase();
  const rejectedRender = selection?.shotstack_design_review?.status === 'rejected';
  const unknownSubmission = /(?:submission|request) outcome is unknown|previous attempt failed/i.test(message);
  const creativeStatus = typography === 'failed' || typography === 'blocked_layout' || rejectedRender;
  const permanent = REVIEW_CODES.has(code) || creativeStatus || unknownSubmission ||
    /(?:not approved|needs review|visual quality rejected|no sufficiently clear region|invalid api key|insufficient_quota|credit_balance_exhausted)/i.test(message) ||
    [400, 401, 403].includes(Number(error?.httpStatus || error?.status || error?.statusCode || 0));
  const stage = creativeStatus || /TYPOGRAPHY|DESIGN|ADVERTISING/i.test(code) ||
    /typography|design review|advertising.*review/i.test(message)
    ? 'kling_advertising_design' : 'kling_video_finalization';
  return { permanent, stage, code: code || 'KLING_FINALIZATION_ERROR', message };
}

export function nextFinalizationControl({ current = {}, error, selection = {}, nowMs = Date.now() }) {
  const previous = Number(current?.attempts) || 0;
  const attempts = Math.min(10000, Math.max(0, previous) + 1);
  const failure = classifyProductionFailure(error, selection);
  const terminal = failure.permanent || attempts >= MAX_FINALIZATION_ATTEMPTS;
  const waitMs = FINALIZATION_BACKOFF_MS * Math.min(4, 2 ** (attempts - 1));
  const control = {
    version: VIDEO_PRODUCTION_VERSION,
    state: terminal ? 'needs_repair' : 'retry_scheduled',
    attempts,
    max_attempts: MAX_FINALIZATION_ATTEMPTS,
    last_error_code: failure.code,
    last_error_message: failure.message.slice(0, 800),
    last_failed_at: new Date(nowMs).toISOString(),
    next_retry_at: terminal ? null : new Date(nowMs + waitMs).toISOString(),
    provider_regeneration_allowed: false,
  };
  return { terminal, stage: failure.stage, failure, control };
}

// This is a durable gate as well as a cron backoff. Old, stuck records whose
// image-creation step already definitively failed must be surfaced for review.
export function finalizationJobGate(post, nowMs = Date.now()) {
  const selection = post?.video_background_selection || {};
  const control = selection.finalization_control || {};
  if (control.state === 'needs_repair' || Number(control.attempts || 0) >= MAX_FINALIZATION_ATTEMPTS) {
    return { action: 'review', reason: 'Finalization retry budget exhausted or blocked', stage: 'kling_video_finalization' };
  }
  if (selection.text_overlay_status === 'failed' || selection.text_overlay_status === 'blocked_layout' ||
      selection.shotstack_design_review?.status === 'rejected') {
    return { action: 'review', reason: 'Previously rejected advertising design requires repair', stage: 'kling_advertising_design' };
  }
  if (String(post?.video_status || '') === 'finalization_retry') {
    const at = new Date(control.next_retry_at || 0).getTime();
    if (Number.isFinite(at) && at > nowMs) return { action: 'defer', reason: 'Finalization retry backoff' };
  }
  return { action: 'proceed', reason: 'Ready to finalize' };
}

export function canRegenerateTypographyAfterKnownRejection(error, attempt, maximum = 2) {
  if (attempt >= maximum) return false;
  if (error?.code === 'VIDEO_ADVERTISING_DESIGN_REJECTED') return true;
  const message = String(error?.message || '');
  return /typography did not reproduce the exact locked|visually empty|contained a background-sized opaque|contained a large opaque panel|excessive translucent haze|touched the canvas edge|end card is missing GPT Image CTA|returned no transparent/i.test(message);
}
