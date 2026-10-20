// v144.385: opt-in, bounded social maintenance. Existing daily cron behavior is unchanged
// until SPREELO_SCALED_SOCIAL_MAINTENANCE=true is explicitly configured.
export const SCALED_SOCIAL_ENV_KEY = "SPREELO_SCALED_SOCIAL_MAINTENANCE";
export const SCALED_SOCIAL_BATCH_HEADER = "x-spreelo-social-batch";
const PER_PROVIDER_BATCH_SIZE = 25;

export function scaledSocialEnabled(environment = process.env) {
  return environment?.[SCALED_SOCIAL_ENV_KEY] === "true";
}

export function isScaledSocialBatch(request, environment = process.env) {
  return scaledSocialEnabled(environment) && request?.headers?.get(SCALED_SOCIAL_BATCH_HEADER) === "1";
}

export function shouldSkipDailySocialCron(request, environment = process.env) {
  return scaledSocialEnabled(environment) && !isScaledSocialBatch(request, environment);
}

export function socialBatchLimit(request, legacyLimit, environment = process.env) {
  return isScaledSocialBatch(request, environment) ? PER_PROVIDER_BATCH_SIZE : legacyLimit;
}

export const SOCIAL_PLATFORMS = Object.freeze(["instagram", "threads", "pinterest", "youtube", "tiktok"]);
export function socialPlatformForMinute(minute) {
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || minute % 5 !== 0) return null;
  return SOCIAL_PLATFORMS[(minute / 5) % SOCIAL_PLATFORMS.length];
}
