// Reasoning support is model-specific. Never silently send an unsupported effort.
export function supportedReasoningEfforts(model) {
  const id=String(model||'').toLowerCase();
  if (/^gpt-6\.1-sol(?:$|[-.])/.test(id)) return ['low','medium','high','xhigh','max'];
  if (/^gpt-(?:5\.5|5\.6-sol)(?:$|[-.])/.test(id)) return ['none','low','medium','high','xhigh'];
  if (/^gpt-5(?:$|[-.])/.test(id)) return ['low','medium','high'];
  return [];
}
export const BASELINE_REASONING = Object.freeze({
  product_research:'low', editorial_headline:'none', carousel_creative:'none',
});
export function initialReasoningEffort(purpose,model) {
  const levels=supportedReasoningEfforts(model);
  const baseline=BASELINE_REASONING[purpose]||'medium';
  return levels.includes(baseline) ? baseline : (baseline==='none'&&levels.includes('low')?'low':levels.includes('medium')?'medium':levels[0]||null);
}
export function normalizeReasoningEffort(model, effort, {allowOmitted=true}={}) {
  if (effort===null||effort===undefined||effort==='') return allowOmitted?null:initialReasoningEffort('',model);
  if (!supportedReasoningEfforts(model).includes(effort)) throw new Error(`Reasoning effort ${effort} is not supported by ${model}`);
  return effort;
}
