// Rejected clicks do not move the end of the existing cooldown.
export function createLoginCodeRateLimit({ now = Date.now, cooldownMs = 55000 } = {}) {
  const recent = new Map();
  return (request, email) => {
    const time = now();
    const address = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const key = `${address || "unknown"}:${email}`;
    const previous = recent.get(key);
    const remaining = previous == null ? 0 : Math.max(0, cooldownMs - (time - previous));
    if (remaining > 0) return { limited: true, retryAfterSeconds: Math.ceil(remaining / 1000) };
    recent.set(key, time);
    if (recent.size > 500) for (const [entry, timestamp] of recent) {
      if (time - timestamp > 10 * 60 * 1000) recent.delete(entry);
    }
    return { limited: false, retryAfterSeconds: 0 };
  };
}
