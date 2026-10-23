/**
 * v144.395: account for paid OpenAI work that does not produce a post.
 * Shares the existing service-role-only ledger with post generation. Never writes
 * to customer-facing posts or associates unrelated jobs with an existing post.
 * Metering failures must NEVER change the customer-facing generation result.
 */
import { createClient } from "@supabase/supabase-js";
import { createGenerationCostTracker, wrapOpenAIForCostTracking } from "./generationCostTracking.js";

export function createSupplementalOpenAITracker({ supabase = null, userId = null, sessionId = null } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = supabase || (url && key ? createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) : null);
  return admin ? createGenerationCostTracker({
    supabase: admin,
    generationUserId: userId || null,
    generationSessionId: sessionId || null,
  }) : null;
}

export function wrapSupplementalOpenAIClient(openai, context = {}) {
  const tracker = createSupplementalOpenAITracker(context);
  if (!tracker) return openai;
  const namespace = String(context.operationNamespace || "").replace(/[^a-z0-9_]/gi, "_");
  if (!namespace) return wrapOpenAIForCostTracking(openai, () => tracker);
  const scoped = {
    recordOpenAI(operation, request, response) {
      // Background completion is submitted and retrieved by different handlers.
      // Keep its stable operation across both so it is never billed twice.
      const scopedOperation = operation === "responses.background"
        ? operation : `${namespace}.${operation}`;
      return tracker.recordOpenAI(scopedOperation, request, response);
    },
  };
  return wrapOpenAIForCostTracking(openai, () => scoped);
}

/** Record a successful raw-fetch OpenAI response with usage data, if supplied.
 * No fabricated token quantities or prices when provider omits usage.
 */
export async function recordSupplementalOpenAIHttpResponse({
  supabase, userId, sessionId, operation, request, response, httpResponse,
} = {}) {
  try {
    if (!response || !httpResponse?.ok) return;
    const tracker = createSupplementalOpenAITracker({ supabase, userId, sessionId });
    if (!tracker) return;
    const requestId = httpResponse.headers?.get?.("x-request-id") || null;
    await tracker.recordOpenAI(operation, request || {}, {
      ...response,
      _request_id: response.id || requestId,
    });
  } catch (error) {
    console.warn("Supplemental OpenAI usage could not be recorded", {
      operation,
      message: String(error?.message || error),
    });
  }
}
