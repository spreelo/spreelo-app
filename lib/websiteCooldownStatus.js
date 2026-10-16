// Use the persisted occurrence retry time, never the publication schedule.
export function getWebsiteCooldownState(plan) {
  if (!plan || ["paused", "ended"].includes(plan.plan_state)) return null;
  const rules = Array.isArray(plan?.rules) ? plan.rules : [plan];
  const waiting = rules.filter((rule) =>
    rule?.generation_occurrence_status === "retry_pending" &&
    rule?.generation_failure_code === "website_rate_limited" &&
    rule?.is_active !== false && !["paused", "ended"].includes(rule?.plan_state)
  ).sort((a, b) => {
    const time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
    return time(a.retry_not_before) - time(b.retry_not_before);
  });
  if (!waiting.length) return null;
  const rule = waiting[0];
  return {
    retryAt: Number.isFinite(Date.parse(rule.retry_not_before)) ? rule.retry_not_before : null,
    timeZone: rule.timezone || undefined,
  };
}
