import { createClient } from '@supabase/supabase-js';

let cachedAdmin;
let lastSuccessWrite = 0;

export function classifyOpenAiServiceError(error, trustedOpenAiCall = false) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || error?.error?.code || '').toLowerCase();
  const type = String(error?.type || error?.error?.type || '').toLowerCase();
  if (/insufficient_quota|credit_balance_exhausted/.test(`${code} ${type} ${message}`) || /no credits remaining|exceeded your current quota/.test(message)) return 'insufficient_quota';
  if (trustedOpenAiCall && (Number(error?.status) === 429 || /rate.?limit|too many requests/.test(message))) return 'rate_limit';
  if (trustedOpenAiCall && (Number(error?.status) >= 500 || /timeout|timed out|connection|fetch failed|service unavailable/.test(message))) return 'service_unavailable';
  return null;
}

// Observe requests already made by Spreelo. This never calls an AI provider.
// Health reporting must not prevent the original request from completing.
export async function recordOpenAiRuntimeResult({ admin = null, error = null, operation = 'generation' } = {}) {
  const issue = error ? classifyOpenAiServiceError(error, true) : null;
  if (error && !issue) return;
  if (!error && Date.now() - lastSuccessWrite < 60000) return;
  try {
    if (!admin) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return;
      cachedAdmin ||= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      admin = cachedAdmin;
    }
    const now = new Date().toISOString();
    const { error: writeError } = await admin.from('system_health_status').upsert({
      system_key: 'openai_runtime',
      label: 'OpenAI · Actual requests',
      status: error ? 'down' : 'up',
      checked_at: now,
      ...(error ? { last_failure_at: now } : { last_ok_at: now }),
      message: error ? `OpenAI request failed: ${issue}.` : 'A real OpenAI request completed successfully.',
      details: { issue, operation, observedAt: now },
    }, { onConflict: 'system_key' });
    if (!writeError && !error) lastSuccessWrite = Date.now();
    // After a failure, the very next successful request must record recovery.
    if (error) lastSuccessWrite = 0;
  } catch {
    // Optional telemetry, including older installations without health tables.
  }
}
