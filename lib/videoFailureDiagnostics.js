// Provider identity and the original failure survive local continuation wrappers.
export function videoFailureDetails(error, { provider = null, stage = null, taskId = null } = {}) {
  const causes = [];
  const seen = new Set();
  for (let current = error; current && !seen.has(current) && causes.length < 5; current = current.cause) {
    seen.add(current);
    causes.push({ code: String(current.code || ''), message: String(current.message || current).slice(0, 2000),
      http_status: Number(current.httpStatus || current.statusCode || current.status) || null });
  }
  const code = causes.find(c => c.code)?.code || 'VIDEO_FINALIZATION_ERROR';
  const message = causes[0]?.message || 'Unknown video failure';
  const httpStatus = causes.find(c => c.http_status)?.http_status || null;
  const source = provider || (/^KLING_/i.test(code) ? 'kling' : /^SHOTSTACK_/i.test(code) ? 'shotstack' : null);
  const auth = [401, 403].includes(httpStatus);
  const rateLimited = httpStatus === 429;
  return { provider: source, stage, task_id: taskId, code, message, http_status: httpStatus, causes,
    retryable: !auth && (rateLimited || httpStatus >= 500 || /timeout|timed out|ECONNRESET|fetch failed/i.test(message)),
    action: auth ? 'Kontrollera API-nyckel och behörighet hos leverantören. Återuppta befintligt jobb efter korrigering.'
      : rateLimited ? 'Leverantören begränsar anropen. Vänta på nästa statuskontroll av samma jobb.'
      : 'Kontrollera ursprungsfelet och befintligt task/render-ID. Återanvänd sparat material innan en ny generering övervägs.' };
}

export function classifyVideoProviderCreationFailure(error) {
  const details = videoFailureDetails(error);
  // Require an explicit provider code: website HTTP 429 must retain its own policy.
  if (!/^(KLING|SHOTSTACK)_/i.test(String(error?.code || ''))) return null;
  return { code: String(error.code).toLowerCase(),
    customerMessage: `Video provider ${details.provider || 'service'} could not complete this step. Check the provider task and API configuration before retrying. No replacement video should be submitted until the existing task is reconciled.` };
}

export function automationFailureHandoffError({error, handoffError, ruleId, postId, stage}) {
  const failure = new Error(`Job failed at ${stage}: ${error?.message || error}. Failure handling also failed: ${handoffError?.message || handoffError}`, {cause:error});
  failure.code = 'AUTOMATION_FAILURE_HANDOFF_ERROR';
  failure.originalFailure = {code:error?.code || null,message:String(error?.message || error),stage,rule_id:ruleId,post_id:postId || null};
  failure.handoffFailure = {code:handoffError?.code || null,message:String(handoffError?.message || handoffError)};
  return failure;
}
