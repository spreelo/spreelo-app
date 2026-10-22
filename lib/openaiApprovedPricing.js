/** Spreelo approved-tariff lookup: exact model id and dated, approved rate only.
 * Never identifies a calculated tariff amount as a provider invoice charge.
 * Inference uses the model actually returned by OpenAI, not an alias or prefix.
 */
const SOURCE = 'https://developers.openai.com/api/docs/pricing';
const cache = new Map();
const TTL_MS = 60_000;

export async function findApprovedOpenAIPrice(supabase, model, at, serviceTier = 'standard') {
  if (!supabase || !model || !/^[-\w.]{1,120}$/.test(model) || !Number.isFinite(Date.parse(at))) return null;
  if (serviceTier !== 'standard') return null;
  const key = `${model}|${serviceTier}|${at.slice(0, 10)}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const { data, error } = await supabase.from('openai_price_versions')
    .select('model,service_tier,pricing_kind,version,input_usd_per_m,cached_input_usd_per_m,output_usd_per_m,image_input_usd_per_m,cached_image_input_usd_per_m,valid_from,valid_until,source_url,source_fingerprint,approved,approved_at')
    .eq('model', model).eq('service_tier', serviceTier).eq('approved', true)
    .lte('valid_from', at).order('valid_from', { ascending: false }).limit(20);
  if (error) throw new Error('Approved OpenAI price lookup failed: ' + String(error.message || error));
  const valid = (data || []).filter(row => !row.valid_until || Date.parse(row.valid_until) > Date.parse(at));
  // Multiple valid tariffs for one model/tier must not be silently guessed.
  if (valid.length > 1) throw new Error('Overlapping approved OpenAI price versions');
  const row = valid[0] || null;
  const rate = row && {
    model: row.model, service_tier: row.service_tier, pricing_kind: row.pricing_kind || 'text', version: row.version,
    input_usd_per_m: Number(row.input_usd_per_m),
    cached_input_usd_per_m: Number(row.cached_input_usd_per_m),
    output_usd_per_m: Number(row.output_usd_per_m),
    image_input_usd_per_m: row.image_input_usd_per_m == null ? null : Number(row.image_input_usd_per_m),
    cached_image_input_usd_per_m: row.cached_image_input_usd_per_m == null ? null : Number(row.cached_image_input_usd_per_m),
    source_url: row.source_url || SOURCE, source_fingerprint: row.source_fingerprint,
    valid_from: row.valid_from, valid_until: row.valid_until,
    approved: row.approved === true,
  };
  if (cache.size >= 100) cache.clear();
  cache.set(key, { expiresAt: Date.now() + TTL_MS, value: rate });
  return rate;
}

export function calculateApprovedTextCost({ model, usage, rate, operation, response, at }) {
  const incomplete = reason => ({ provider:'openai', service:'model', model, operation,
    currency:'USD', amount:null, exact:false, pricingVersion:rate?.version || 'unknown',
    quantity:null, unit:'tokens', usage:usage || {}, note:reason,
    requestId: response?._request_id || response?.id || null });
  if (!rate || !rate.approved || rate.model !== model || rate.service_tier !== 'standard' || rate.pricing_kind === 'image') return incomplete('Approved exact-model standard tariff unavailable');
  if (!at || Date.parse(at) < Date.parse(rate.valid_from) || (rate.valid_until && Date.parse(at) >= Date.parse(rate.valid_until))) return incomplete('Approved tariff not effective at this time');
  if (rate.source_url !== SOURCE && !/^https:\/\/(developers\.openai\.com|platform\.openai\.com)\//.test(rate.source_url || '')) return incomplete('Untrusted tariff source');
  if (!usage || usage.input_tokens == null && usage.prompt_tokens == null || usage.output_tokens == null && usage.completion_tokens == null) return incomplete('Missing provider token usage');
  const input = Number(usage.input_tokens ?? usage.prompt_tokens);
  const output = Number(usage.output_tokens ?? usage.completion_tokens);
  const cached = Number(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0);
  const rates = [rate.input_usd_per_m,rate.cached_input_usd_per_m,rate.output_usd_per_m].map(Number);
  if (![input,output,cached,...rates].every(x => Number.isFinite(x) && x >= 0) || cached > input) return incomplete('Invalid usage or tariff components');
  if (input > 272000) return incomplete('Possible long-context tariff: verify model-dependent threshold and uplift');
  const toolEvents = (response?.output || []).filter(x => /(?:web_search_call|file_search_call|code_interpreter_call|computer_call|image_generation_call)/.test(String(x?.type || '')));
  if (toolEvents.length) return incomplete('Additional billable tool calls require separately approved prices');
  const amount = ((input - cached) * rates[0] + cached * rates[1] + output * rates[2]) / 1e6;
  return { provider:'openai',service:'model',model,operation,currency:'USD',amount:Math.round(amount*1e9)/1e9,
    exact:false, requestId: response?._request_id || response?.id || null,
    pricingVersion:rate.version, quantity:input + output, unit:'tokens',
    usage: {input_tokens:input, cached_input_tokens:cached, output_tokens:output, tariff_source:rate.source_url,
      pricing_status:'approved_tariff_estimate', source_fingerprint:rate.source_fingerprint || null},
    note:'Estimated from manually approved OpenAI published tariff; NOT invoice-reconciled per request.' };
}

export function calculateApprovedImageCost({model,usage,rate,operation,response,at}) {
  const missing=reason=>({provider:'openai',service:'image_generation',model,operation,requestId:response?._request_id||response?.id||null,
    currency:'USD',amount:null,exact:false,pricingVersion:rate?.version||'unknown',unit:'tokens',usage:usage||{},note:reason});
  if (!rate || rate.approved !== true || rate.model !== model || rate.service_tier !== 'standard' || rate.pricing_kind !== 'image')
    return missing('No approved exact-model image token tariff');
  if (Date.parse(at)<Date.parse(rate.valid_from) || rate.valid_until&&Date.parse(at)>=Date.parse(rate.valid_until)) return missing('Image tariff not effective');
  const details=usage?.input_tokens_details;
  if (!details || !Number.isFinite(Number(details.text_tokens)) || !Number.isFinite(Number(details.image_tokens)) ||
    !Number.isFinite(Number(usage?.output_tokens))) return missing('Image usage missing text/image breakdown');
  const text=Number(details.text_tokens), image=Number(details.image_tokens), output=Number(usage.output_tokens);
  const cachedDetails=details.cached_tokens_details||{};
  const cachedText = Number(cachedDetails.text_tokens ?? details.cached_text_tokens ?? 0);
  const cachedImage = Number(cachedDetails.image_tokens ?? details.cached_image_tokens ?? 0);
  if (details.cached_tokens != null && cachedDetails.text_tokens == null && cachedDetails.image_tokens == null &&
     details.cached_text_tokens == null && details.cached_image_tokens == null && Number(details.cached_tokens)>0)
    return missing('Missing provider split for cached image/text tokens');
  const rates=[rate.input_usd_per_m,rate.cached_input_usd_per_m,rate.image_input_usd_per_m,rate.cached_image_input_usd_per_m,rate.output_usd_per_m].map(Number);
  if (![text,image,output,cachedText,cachedImage,...rates].every(x=>Number.isFinite(x)&&x>=0) || cachedText>text || cachedImage>image)
    return missing('Invalid image usage or approved tariff');
  if (usage.input_tokens != null && Number(usage.input_tokens)!==text+image) return missing('Unattributed image input tokens');
  const sum=((text-cachedText)*rates[0]+cachedText*rates[1]+(image-cachedImage)*rates[2]+cachedImage*rates[3]+output*rates[4])/1e6;
  return {provider:'openai',service:'image_generation',model,operation,currency:'USD',amount:Math.round(sum*1e9)/1e9,
    exact:false,requestId:response?._request_id||response?.id||null,pricingVersion:rate.version,
    quantity:text+image+output,unit:'tokens',usage:{text_input_tokens:text,image_input_tokens:image,cached_text_input_tokens:cachedText,cached_image_input_tokens:cachedImage,output_tokens:output,pricing_status:'approved_tariff_estimate'},
    note:'Estimated using approved image token tariff; NOT per-call invoice verified.'};
}
