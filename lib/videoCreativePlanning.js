// Bounded text-only recovery. Never orders an image, video or render.
export const CREATIVE_PLAN_MAX_ATTEMPTS = 2;
export const CREATIVE_PLAN_TIMEOUT_MS = 60_000;
export function creativePlanningFailure(error, {attempt=1,model='',nowMs=Date.now()}={}) {
  const status=Number(error?.status)||null;
  const permanent=/insufficient_quota|credit_balance_exhausted|invalid_api_key/i.test(`${error?.code||''} ${error?.message||''}`);
  const retryable=!permanent&&(error?.name==='APIConnectionTimeoutError'||error?.name==='APIConnectionError'||
    /timed?\s*out|timeout|ECONNRESET|fetch failed/i.test(String(error?.message||''))||
    status===408||status===429||status>=500);
  return {attempts:attempt,max_attempts:CREATIVE_PLAN_MAX_ATTEMPTS,model,
    status:retryable&&attempt<CREATIVE_PLAN_MAX_ATTEMPTS?'retry_pending':'fallback',
    next_retry_at:retryable&&attempt<CREATIVE_PLAN_MAX_ATTEMPTS?new Date(nowMs+30_000).toISOString():null,
    last_error:{message:String(error?.message||error).slice(0,500),status,code:error?.code||error?.name||null,request_id:error?.request_id||error?.requestID||null},
    action:retryable&&attempt<CREATIVE_PLAN_MAX_ATTEMPTS?'Resume text planning using the saved Kling movie; do not order another video.':'Planning unavailable after bounded recovery; deliver using verified product facts and retain the diagnostic.'};
}

// Animation runs in the existing generation worker. Allow one text-only
// transient recovery within a 60-second total budget, without retrying images.
export async function requestAnimatedCreativeResponse(openai, body) {
  const started=Date.now();
  try {return await openai.responses.create(body,{timeout:40_000,maxRetries:0});}
  catch(error) {
    const control=creativePlanningFailure(error);
    const remaining=Math.min(20_000,60_000-(Date.now()-started));
    if(control.status!=='retry_pending'||remaining<1_000)throw error;
    console.warn('Animation creative text planning recovering once',{...control,last_error:control.last_error});
    return openai.responses.create(body,{timeout:remaining,maxRetries:0});
  }
}
