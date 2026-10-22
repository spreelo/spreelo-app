/** Daily passive pricing source check. No model generation, no tariff updates. */
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const SOURCE = 'https://developers.openai.com/api/docs/pricing';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== 'production' || process.env.SPREELO_OPENAI_PRICING_ENABLED !== 'true') {
    return Response.json({ ok: true, skipped: 'openai_pricing_not_enabled_in_production' });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ok:false,error:'Supabase configuration missing'}, {status:503});
  const db = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
  let httpStatus = null;
  try {
    const sourceResponse = await fetch(SOURCE, {
      headers:{'user-agent':'Spreelo-OpenAI-pricing-audit/1.0'},
      signal:AbortSignal.timeout(15000),cache:'no-store',
    });
    httpStatus = sourceResponse.status;
    if (!sourceResponse.ok) throw new Error(`Source HTTP ${httpStatus}`);
    const html = await sourceResponse.text();
    if (html.length < 1000 || !/pricing|price/i.test(html)) throw new Error('Unexpected pricing page response');
    const hash = createHash('sha256').update(html).digest('hex');
    const { data: previous, error: readError } = await db.from('openai_pricing_audit')
      .select('source_fingerprint,status').eq('source_url',SOURCE).not('source_fingerprint','is',null)
      .order('checked_at',{ascending:false}).limit(1);
    if (readError) throw readError;
    const old = previous?.[0]?.source_fingerprint || null;
    const changed = Boolean(old && old !== hash);
    const {error: writeError} = await db.from('openai_pricing_audit').insert({
      source_url:SOURCE,http_status:httpStatus,source_fingerprint:hash,
      status:changed?'changed_review_required':'unchanged',
      detail:old===null?'Baseline recorded; no tariffs changed':changed
        ?'Public page HTML changed; this is a review signal, not a confirmed price change':'No change in watched page fingerprint',
    });
    if (writeError) throw writeError;
    return Response.json({ok:true,reviewRequired:changed,baseline:old===null});
  } catch (error) {
    console.error('OpenAI pricing audit failed',{message:String(error?.message||error)});
    try {await db.from('openai_pricing_audit').insert({source_url:SOURCE,http_status:httpStatus,status:'fetch_failed',detail:String(error?.message||error).slice(0,500)});}catch{}
    return Response.json({ok:false,error:'OpenAI pricing audit failed'}, {status:503});
  }
}
