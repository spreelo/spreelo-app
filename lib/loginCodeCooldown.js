const prefix = "spreelo_login_code_retry_";
export function remainingLoginCodeCooldown(storage, email, now = Date.now()) {
  try {
    const until = Number(storage?.getItem(prefix + String(email).trim().toLowerCase()) || 0);
    return Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  } catch { return 0; }
}
export function saveLoginCodeCooldown(storage, email, seconds, now = Date.now()) {
  try { storage?.setItem(prefix + String(email).trim().toLowerCase(), String(now + Math.max(0, Number(seconds) || 0) * 1000)); } catch { /* The server remains authoritative. */ }
}
export function loginCodeRequestError(response, payload, fallback) {
  const error = new Error(payload?.error || fallback);
  error.code = payload?.code || "LOGIN_CODE_REQUEST_FAILED";
  error.status = response.status;
  const seconds = Number(payload?.retry_after_seconds || response.headers?.get("retry-after") || 60);
  error.retryAfterSeconds = Number.isFinite(seconds) ? Math.max(1, Math.min(3600, Math.ceil(seconds))) : 60;
  return error;
}
export function isLoginCodeRateLimitError(error) {
  return error?.status === 429 || error?.code === "RATE_LIMIT" || /rate limit|too many requests|429/i.test(String(error?.message || ""));
}
