/** Read-only upstream pricing monitor with a durable Supabase audit history.
 * Requires SPREELO_SUPABASE_URL and SPREELO_SUPABASE_SERVICE_ROLE_KEY in CI.
 * Never changes an approved tariff. A changed page requires human review.
 */
import { createHash } from 'node:crypto';
const source = 'https://developers.openai.com/api/docs/pricing';
const sb = process.env.SPREELO_SUPABASE_URL;
const key = process.env.SPREELO_SUPABASE_SERVICE_ROLE_KEY;
if (!sb || !key) { console.error('Price monitor not configured: Supabase URL/service key required'); process.exit(2); }
const base = sb.replace(/\/$/, '') + '/rest/v1/openai_pricing_audit';
const headers = {apikey:key,Authorization:`Bearer ${key}`};
async function audit(record) {
  const r = await fetch(base, {method:'POST', headers:{...headers,'content-type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(record),signal:AbortSignal.timeout(15000)});
  if (!r.ok) throw new Error(`Supabase audit write failed: HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
}
try {
  const r = await fetch(source,{redirect:'follow',headers:{'user-agent':'Spreelo-price-audit/1.1'},signal:AbortSignal.timeout(15000)});
  if (!r.ok) throw new Error(`Pricing source returned HTTP ${r.status}`);
  const html = await r.text();
  if (html.length < 1000 || !/pricing|price/i.test(html)) throw new Error('Unexpected OpenAI pricing page content');
  const fingerprint = createHash('sha256').update(html).digest('hex');
  const previous = await fetch(`${base}?select=source_fingerprint,status&source_url=eq.${encodeURIComponent(source)}&source_fingerprint=not.is.null&order=checked_at.desc&limit=1`,{headers,signal:AbortSignal.timeout(15000)});
  if (!previous.ok) throw new Error(`Supabase audit read failed: HTTP ${previous.status}`);
  const records = await previous.json();
  const before = records[0]?.source_fingerprint || null;
  const changed = before !== null && before !== fingerprint;
  await audit({source_url:source,http_status:r.status,source_fingerprint:fingerprint,status:changed?'changed_review_required':'unchanged',detail:before===null?'Baseline created; no tariff updated':changed?'Public page fingerprint changed. Review actual prices before approving any rate.':'Public page fingerprint unchanged.'});
  console.log(JSON.stringify({source,checked_at:new Date().toISOString(),status:changed?'changed_review_required':'unchanged',baseline_created:before===null,fingerprint}));
  if(changed) process.exitCode=3; // CI alert; no automatic tariff changes.
} catch(e) {
  try {await audit({source_url:source,status:'fetch_failed',detail:String(e).slice(0,1000)});} catch(auditError){console.error('Could not record failure:',String(auditError));}
  console.error('Price audit failed:',String(e));
  process.exitCode=1;
}
