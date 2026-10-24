import { getAdminContext, adminContextError } from '../../../../lib/adminAuth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PAGE_SIZE = 75;
const MAX_DAYS = 31;

function fail(error, status = 400) {
  return Response.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function validRange(params) {
  const start = params.get('start');
  const end = params.get('end');
  if (!start || !end || !/^\d{4}-\d\d-\d\dT.*Z$/.test(start) || !/^\d{4}-\d\d-\d\dT.*Z$/.test(end)) return null;
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > MAX_DAYS * 86400_000 || b > Date.now() + 86400_000) return null;
  return { start: new Date(a).toISOString(), end: new Date(b).toISOString() };
}

export async function GET(request) {
  const ctx = await getAdminContext(request);
  if (ctx.error) return adminContextError(ctx);
  const params = new URL(request.url).searchParams;
  const range = validRange(params);
  if (!range) return fail('Choose a valid period of up to 31 days (UTC timestamps).');

  const provider = params.get('provider') || 'openai';
  const model = params.get('model') || '';
  const kind = params.get('kind') || 'all';
  const page = Number(params.get('page') || 1);
  if (!/^[\w.-]{1,50}$/.test(provider) && provider !== 'all') return fail('Invalid provider');
  if (model.length > 120 || (model && !/^[\w.-]+$/.test(model))) return fail('Invalid model');
  if (!['all', 'post', 'other', 'unpriced'].includes(kind)) return fail('Invalid cost category');
  if (!Number.isInteger(page) || page < 1 || page > 10000) return fail('Invalid page');

  const providerFilter = provider === 'all' ? null : provider;
  const modelFilter = model || null;
  // Aggregations are computed in the database: never silently truncate totals to 1,000 rows.
  const aggregate = ctx.admin.rpc('spreelo_admin_ai_cost_overview', {
    p_start: range.start, p_end: range.end,
    p_provider: providerFilter, p_model: modelFilter,
  });

  let query = ctx.admin.from('post_generation_cost_events')
    .select('id,created_at,post_id,generation_user_id,provider,service,model,operation,amount,currency,exact,pricing_version,usage_quantity,usage_unit,note')
    .gte('created_at', range.start).lt('created_at', range.end)
    .order('created_at', { ascending: false });
  if (providerFilter) query = query.eq('provider', providerFilter);
  if (modelFilter) query = query.eq('model', modelFilter);
  if (kind === 'post') query = query.not('post_id', 'is', null);
  if (kind === 'other') query = query.is('post_id', null);
  if (kind === 'unpriced') query = query.or('amount.is.null,currency.neq.USD');
  const offset = (page - 1) * PAGE_SIZE;
  const [{data:overview,error:overviewError},{data:rawRows,error:rowsError}] = await Promise.all([
    aggregate,
    query.range(offset, offset + PAGE_SIZE),
  ]);
  if (overviewError) {
    const missing = /function|schema cache|does not exist|could not find/i.test(String(overviewError.message || ''));
    return fail(missing ? 'Run supabase/v144_398_admin_ai_cost_overview.sql before using this screen.' : `Could not load totals: ${overviewError.message}`, 503);
  }
  if (rowsError) return fail(`Could not load AI cost events: ${rowsError.message}`, 503);
  const rows = Array.isArray(rawRows) ? rawRows.slice(0, PAGE_SIZE) : [];
  return Response.json({ok:true,period:range,provider,model,kind,page,pageSize:PAGE_SIZE,
    hasMore:(rawRows || []).length > PAGE_SIZE, overview: overview || {}, rows },
    {headers:{'Cache-Control':'private, no-store'}});
}
