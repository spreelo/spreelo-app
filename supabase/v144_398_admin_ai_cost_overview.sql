-- Spreelo 144.398: read-only admin overview of the existing immutable cost ledger.
-- No edits to historical cost events. No OpenAI API calls, no new billable activity.
-- Run in Supabase SQL Editor before deploying 144.398.

create index if not exists post_generation_cost_events_created_at_idx
  on public.post_generation_cost_events (created_at desc);

create or replace function public.spreelo_admin_ai_cost_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_provider text default null,
  p_model text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with filtered as materialized (
  select provider, service, model, operation, post_id, amount, currency, exact
  from public.post_generation_cost_events
  where created_at >= p_start
    and created_at < p_end
    and (p_provider is null or provider = p_provider)
    and (p_model is null or model = p_model)
), totals as (
  select
    count(*)::bigint as events,
    count(*) filter (where amount is null or currency is distinct from 'USD')::bigint as unpriced_events,
    count(*) filter (where amount is not null and currency = 'USD' and exact = false)::bigint as estimated_events,
    count(*) filter (where amount is not null and currency = 'USD' and exact = true)::bigint as usage_based_events,
    coalesce(sum(amount) filter (where currency = 'USD'), 0)::numeric(24,9) as total_usd,
    coalesce(sum(amount) filter (where currency = 'USD' and post_id is not null), 0)::numeric(24,9) as posts_usd,
    coalesce(sum(amount) filter (where currency = 'USD' and post_id is null), 0)::numeric(24,9) as other_usd,
    count(*) filter (where post_id is not null)::bigint as post_events,
    count(*) filter (where post_id is null)::bigint as other_events
  from filtered
), by_model as (
  select provider, coalesce(model,'(okänd)') as model,
    count(*)::bigint as events,
    count(*) filter (where amount is null or currency is distinct from 'USD')::bigint as unpriced_events,
    coalesce(sum(amount) filter (where currency = 'USD'),0)::numeric(24,9) as total_usd
  from filtered
  group by provider, coalesce(model,'(okänd)')
  order by total_usd desc, events desc
  limit 50
), by_operation as (
  select operation, coalesce(service,'(okänd)') as service,
    count(*)::bigint as events,
    count(*) filter (where amount is null or currency is distinct from 'USD')::bigint as unpriced_events,
    coalesce(sum(amount) filter (where currency = 'USD' and post_id is not null),0)::numeric(24,9) as posts_usd,
    coalesce(sum(amount) filter (where currency = 'USD' and post_id is null),0)::numeric(24,9) as other_usd,
    coalesce(sum(amount) filter (where currency = 'USD'),0)::numeric(24,9) as total_usd
  from filtered
  group by operation, coalesce(service,'(okänd)')
  order by total_usd desc, events desc
  limit 100
)
select jsonb_build_object(
  'totals', (select to_jsonb(totals) from totals),
  'models', coalesce((select jsonb_agg(to_jsonb(by_model)) from by_model), '[]'::jsonb),
  'operations', coalesce((select jsonb_agg(to_jsonb(by_operation)) from by_operation), '[]'::jsonb)
);
$$;

revoke all on function public.spreelo_admin_ai_cost_overview(timestamptz,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.spreelo_admin_ai_cost_overview(timestamptz,timestamptz,text,text)
  to service_role;
comment on function public.spreelo_admin_ai_cost_overview(timestamptz,timestamptz,text,text) is
  'Admin/service-role only: aggregates the existing cost ledger. These are estimates, not OpenAI invoice line items.';
