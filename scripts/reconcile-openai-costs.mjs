/** Compare Spreelo OpenAI event estimates to OpenAI's project-scoped daily billing.
 * Never changes customer credits, tariffs or historical cost events.
 */
const sb = (process.env.SPREELO_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const sbKey = process.env.SPREELO_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminKey = process.env.OPENAI_ADMIN_KEY;
const projectId = process.env.OPENAI_SPREELO_PROJECT_ID; // replaced with valid environment access below
if (!sb || !sbKey || !adminKey || !projectId) {
  console.error('Missing Supabase service credentials, OPENAI_ADMIN_KEY or OPENAI_SPREELO_PROJECT_ID');
  process.exit(2);
}
const headers = { apikey:sbKey, Authorization:`Bearer ${sbKey}` };
const jsonHeaders = {...headers, 'content-type':'application/json'};
const isoDay = (d) => new Date(d).toISOString().slice(0,10);
// Audit two full UTC days ago so billing data has time to settle.
const day = process.env.OPENAI_RECONCILE_DAY || isoDay(Date.now()-2*86400_000);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isoDay(`${day}T00:00:00Z`) !== day) throw new Error('Invalid day');
const beginMs = Date.parse(`${day}T00:00:00Z`);
if (beginMs >= Date.now()-86400_000) throw new Error('Only fully closed billing days are eligible');
const endMs = beginMs + 86400_000;
async function requestJson(url, options={}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Provider API HTTP ${response.status}: ${(await response.text()).slice(0,250)}`);
  return response.json();
}
async function actualCost() {
  let page = null, pages = 0, amount = 0, seenResult = false;
  do {
    const qs = new URLSearchParams({start_time:String(beginMs/1000),end_time:String(endMs/1000),bucket_width:'1d',limit:'7'});
    qs.append('project_ids[]',projectId);
    if (page) qs.set('page', page);
    const data = await requestJson('https://api.openai.com/v1/organization/costs?'+qs,
      {headers:{Authorization:`Bearer ${adminKey}`}});
    if (!Array.isArray(data.data)) throw new Error('Unexpected OpenAI Costs API schema');
    for (const bucket of data.data) {
      for (const result of bucket.results || []) {
        const v = Number(result.amount?.value);
        if (result.amount?.currency?.toLowerCase() !== 'usd' || !Number.isFinite(v) || v < 0)
          throw new Error('Unexpected currency or invalid provider charge');
        amount += v;
        seenResult = true;
      }
    }
    page = data.has_more ? data.next_page : null;
    if (++pages > 50) throw new Error('Unexpected OpenAI pagination (>50 pages)');
    if (data.has_more && !page) throw new Error('Missing OpenAI pagination cursor');
  } while (page);
  return {amount,hasRows:seenResult};
}
async function recordedCosts() {
  // 500-row pages; do not silently truncate high-volume production data.
  let offset=0,total=0,unknown=0,count=0;
  while (true) {
    const qs = new URLSearchParams({ select:'amount,currency',provider:'eq.openai',
      created_at:`gte.${new Date(beginMs).toISOString()}`, order:'created_at.asc', limit:'500', offset:String(offset)});
    qs.append('created_at',`lt.${new Date(endMs).toISOString()}`);
    const rows=await requestJson(`${sb}/rest/v1/post_generation_cost_events?${qs}`,{headers});
    if (!Array.isArray(rows)) throw new Error('Unexpected Supabase event response');
    for (const row of rows) {
      count++;
      if (row.currency !== 'USD' || row.amount === null || !Number.isFinite(Number(row.amount))) unknown++;
      else total += Number(row.amount);
    }
    offset += rows.length;
    if (rows.length < 500) break;
    if (offset > 100_000) throw new Error('Too many ledger events for reconciliation');
  }
  return {total,unknown,count};
}
const actual=await actualCost();
const recorded=await recordedCosts();
const delta=actual.amount-recorded.total;
const tolerance=Math.max(0.10,actual.amount*0.02);
const status=(!actual.hasRows && recorded.count>0) || recorded.unknown>0 ? 'partial_unpriced' :
  Math.abs(delta)>tolerance ? 'mismatch' : 'comparable';
const payload={day_utc:day,project_id:projectId,checked_at:new Date().toISOString(),
  actual_usd:Number(actual.amount.toFixed(9)),recorded_estimate_usd:Number(recorded.total.toFixed(9)),
  estimated_events:recorded.count-recorded.unknown,unpriced_events:recorded.unknown,
  delta_usd:Number(delta.toFixed(9)),status,
  note:'Daily project-level comparison only; event timestamps, late billing, tools, and other project spend may differ. Not per-video invoice verification.'};
await requestJson(`${sb}/rest/v1/openai_billing_reconciliations?on_conflict=day_utc,project_id`,
 {method:'POST',headers:{...jsonHeaders,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});
console.log(JSON.stringify({day,projectId, status, actual_usd:payload.actual_usd,estimated_usd:payload.recorded_estimate_usd,unpriced:recorded.unknown,delta_usd:payload.delta_usd}));
if (status !== 'comparable') process.exitCode = 3;
