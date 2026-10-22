/** Daily, strictly non-destructive OpenAI model and published-price discovery.
 * Reads /v1/models for account-visible model IDs; reads OpenAI public pricing page
 * for *candidate* tariffs. NEVER changes approved records or generation settings.
 */
import { createHash } from 'node:crypto';
import { OPENAI_PRICING_SOURCE, parseOpenAIPublishedPrices, validOpenAIModelId, samePrices } from './openaiPricingDiscovery.js';
import { fetchSpreeloModelPriceEvidence } from './openaiModelPriceEvidence.js';

const modelsEndpoint = 'https://api.openai.com/v1/models';
const sha = value => createHash('sha256').update(value).digest('hex');
const chunk = (items,size) => Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
const safeDate = seconds => Number.isFinite(seconds) && seconds > 0 && seconds < 3500000000 ? new Date(seconds*1000).toISOString() : null;

async function checkedQuery(query, context) {
  const r = await query;
  if (r.error) throw new Error(`${context}: ${String(r.error.message || r.error)}`);
  return r.data || [];
}

export async function syncOpenAIModelCatalog({db,apiKey,fetcher=fetch,now=new Date(),force=false}) {
  if (!db) throw new Error('Supabase service client missing');
  const at = now.toISOString(), errors = [];
  let models = [], html = '', fingerprint = null, priceSourceStatus = 'failed';
  let priceParse = {candidates:[],ambiguousModels:[],observedModels:[],status:'unreadable'};
  let detailCandidates = [];
  // For a test from admin, prevent accidental rapid repeated provider calls.
  if (!force) {
    const last = await checkedQuery(db.from('openai_model_discovery_runs')
      .select('checked_at,status,detail').order('checked_at',{ascending:false}).limit(1),'Discovery status read');
    if (last[0] && last[0].detail?.includes('\"engineVersion\":\"144.391\"') && now.getTime()-Date.parse(last[0].checked_at) < 10*60_000) {
      return {ok:true,skipped:'already_checked_recently',status:last[0].status};
    }
  }

  try {
    const response = await fetcher(OPENAI_PRICING_SOURCE,{
      headers:{'user-agent':'Spreelo-OpenAI-Discovery/144.391'},
      signal:AbortSignal.timeout(12000),cache:'no-store'
    });
    if (!response.ok) throw new Error('Pricing page HTTP '+response.status);
    html = await response.text();
    if (html.length < 1000 || html.length > 5_000_000 || !/pricing|price/i.test(html)) throw new Error('Unexpected pricing page length or content');
    fingerprint = sha(html);
    priceSourceStatus = 'success';
    priceParse = parseOpenAIPublishedPrices(html);
    if (priceParse.status === 'unreadable' || !priceParse.candidates.length) {
      try {
        const md = await fetcher(OPENAI_PRICING_SOURCE+'.md',{
          headers:{'user-agent':'Spreelo-OpenAI-Discovery/144.391'},
          signal:AbortSignal.timeout(7000),cache:'no-store'
        });
        if (md.ok) {
          const markdown = await md.text();
          const parsed = parseOpenAIPublishedPrices(markdown);
          if(parsed.candidates.length) priceParse=parsed;
        }
      } catch(e) { /* Markdown isn't guaranteed; HTML audit remains primary. */ }
    }
    // The global page may present Fast / Batch / long-context in mixed client-side
    // tables. Exact model pages have a separately labeled default pricing block.
    detailCandidates = await fetchSpreeloModelPriceEvidence({fetcher});
    if (!priceParse.candidates.length && !detailCandidates.length) errors.push('price_parse: No complete official standard token-price evidence was extracted; no rate will be guessed.');
    const previous = await checkedQuery(db.from('openai_pricing_audit')
      .select('source_fingerprint').eq('source_url',OPENAI_PRICING_SOURCE)
      .not('source_fingerprint','is',null).order('checked_at',{ascending:false}).limit(1),'Pricing audit read');
    const changed = !!(previous[0]?.source_fingerprint && previous[0].source_fingerprint !== fingerprint);
    await checkedQuery(db.from('openai_pricing_audit').insert({
      source_url:OPENAI_PRICING_SOURCE,http_status:response.status,source_fingerprint:fingerprint,
      status:changed?'changed_review_required':'unchanged',
      detail:previous.length===0?'144.390 baseline: discovery continues; no price auto-approved':
        changed?'Public HTML changed: pricing review is required': 'Public HTML fingerprint unchanged'
    }), 'Pricing audit write');
  } catch(e) {
    errors.push('pricing_source: '+String(e.message||e));
    try {await checkedQuery(db.from('openai_pricing_audit').insert({
      source_url:OPENAI_PRICING_SOURCE,status:'fetch_failed',detail:String(e.message||e).slice(0,400)
    }),'Pricing fetch failure audit');} catch(e2) {errors.push('audit: '+String(e2.message||e2));}
  }

  try {
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured; discovery cannot list account-visible models');
    const response = await fetcher(modelsEndpoint,{
      headers:{authorization:`Bearer ${apiKey}`,accept:'application/json'},
      signal:AbortSignal.timeout(12000),cache:'no-store'
    });
    if(!response.ok) throw new Error('Models API HTTP '+response.status);
    const body = await response.json();
    if (!Array.isArray(body?.data) || body.data.length > 4000) throw new Error('Unexpected Models API payload');
    models = body.data.filter(x=>validOpenAIModelId(x?.id)).map(x=>({
      model:x.id, owned_by:String(x.owned_by||'').slice(0,100)||null,
      provider_created_at:safeDate(Number(x.created)),listed_in_api:true
    }));
    if (!models.length) errors.push('models_api: No usable model IDs returned');
  } catch(e) { errors.push('models_api: '+String(e.message||e)); }

  const unique = new Map();
  for(const m of models) unique.set(m.model,m);
  for(const id of [...priceParse.observedModels,...detailCandidates.map(x=>x.model)]) {
    if(!unique.has(id)) unique.set(id,{model:id,listed_in_api:false});
  }
  const existing = await checkedQuery(db.from('openai_model_catalog')
    .select('model,first_seen_at,listed_in_api,listed_on_pricing_page').limit(4000), 'Model catalog read');
  const known = new Map(existing.map(x=>[x.model,x]));
  const candidateMap = new Map(priceParse.candidates.map(x=>[x.model,x]));
  // The per-model default token section is a more specific source than a
  // globally duplicated table containing multiple processing modes.
  for (const detail of detailCandidates) candidateMap.set(detail.model,detail);
  const ambiguous = new Set(priceParse.ambiguousModels.filter(id=>!candidateMap.has(id)));
  let newlySeen = 0, proposedPrices = 0;
  const catalogRows=[];
  for(const m of unique.values()) {
    const prior=known.get(m.model);
    if(!prior) newlySeen++;
    const pricing_status=ambiguous.has(m.model)?'ambiguous': candidateMap.has(m.model)?'candidate':'missing';
    catalogRows.push({model:m.model,first_seen_at:prior?.first_seen_at||at,last_seen_at:at,
      provider_created_at:m.provider_created_at||null,owned_by:m.owned_by||null,
      listed_in_api:!!(m.listed_in_api||prior?.listed_in_api),
      listed_on_pricing_page:priceParse.observedModels.includes(m.model)||detailCandidates.some(x=>x.model===m.model)||!!prior?.listed_on_pricing_page,
      pricing_status:priceSourceStatus!=='success'?'unknown':pricing_status,
      pricing_note:priceSourceStatus!=='success'?'Pricing page unavailable':ambiguous.has(m.model)
        ?'Conflicting prices (e.g. Standard, Batch, Fast or long context); requires manual review'
        :candidateMap.has(m.model)?`Review Standard short-context rates. Source: ${candidateMap.get(m.model).source_url||OPENAI_PRICING_SOURCE}. Other processing and long-context tiers are NOT covered.`:'No unambiguous USD/1M Standard tariff extracted',
      latest_source_fingerprint:fingerprint,updated_at:at});
  }
  for(const rows of chunk(catalogRows,100)) {
    await checkedQuery(db.from('openai_model_catalog').upsert(rows,{onConflict:'model'}),'Model catalog update');
  }

  if (fingerprint && candidateMap.size) {
    const oldVersions = await checkedQuery(db.from('openai_price_versions')
      .select('model,pricing_kind,version,source_url,source_fingerprint,input_usd_per_m,cached_input_usd_per_m,output_usd_per_m,image_input_usd_per_m,cached_image_input_usd_per_m,approved,valid_until')
      .order('created_at',{ascending:false}).limit(2000),'Existing tariffs read');
    const proposals = [];
    for (const candidate of candidateMap.values()) {
      // If price can only be parsed in one table it is still NOT an active price.
      // Never auto-generate an approval or change an already approved rate.
      const prior = oldVersions.filter(v=>v.model===candidate.model);
      if (prior.some(v=>v.approved && v.valid_until == null && samePrices(v,candidate))) continue;
      const pendingSame=prior.find(v=>!v.approved && samePrices(v,candidate));
      if(pendingSame) {
        // The approval endpoint checks the latest page fingerprint. Refresh an
        // unchanged pending rate's evidence instead of creating duplicates.
        if(pendingSame.version.startsWith('auto-') && (pendingSame.source_fingerprint!==fingerprint || pendingSame.source_url !== (candidate.source_url||OPENAI_PRICING_SOURCE))) {
          await checkedQuery(db.from('openai_price_versions').update({source_fingerprint:fingerprint,source_url:candidate.source_url||OPENAI_PRICING_SOURCE})
            .eq('model',candidate.model).eq('version',pendingSame.version).eq('approved',false),
            'Refresh identical automatic candidate proof');
        }
        continue;
      }
      const id = sha(JSON.stringify(candidate)+'|'+fingerprint).slice(0,20);
      const version = 'auto-144391-'+id;
      if (prior.some(v=>v.version===version)) continue;
      proposals.push({...candidate,service_tier:'standard',version,
        valid_from:at,source_url:candidate.source_url||OPENAI_PRICING_SOURCE,
        source_fingerprint:fingerprint,approved:false});
    }
    // Bound per-run writes; remaining candidates are proposed on later runs.
    for(const rows of chunk(proposals.slice(0,100),50)) {
      await checkedQuery(db.from('openai_price_versions').upsert(rows,{onConflict:'model,service_tier,version',ignoreDuplicates:true}), 'Price candidate proposal');
      proposedPrices+=rows.length;
    }
  }
  const status = errors.length ? (models.length || priceSourceStatus==='success'?'partial':'failed') : 'success';
  const summary = {engineVersion:'144.391',ok:status==='success',status,modelsSeen:unique.size,newModels:newlySeen,
    proposedPrices,ambiguousPrices:ambiguous.size,
    priceTables:priceParse.tableCount||0,parsedCandidates:candidateMap.size,
    exactModelDetailPrices:detailCandidates.length,
    priceSourceStatus,errors};
  await checkedQuery(db.from('openai_model_discovery_runs').insert({
    status,models_seen:unique.size,newly_seen:newlySeen,proposed_prices:proposedPrices,
    ambiguous_prices:ambiguous.size,price_page_sha256:fingerprint,
    detail:JSON.stringify(summary).slice(0,2000)
  }),'Discovery run write');
  return summary;
}
