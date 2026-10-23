-- Spreelo 144.394 cumulative installation from 144.392.
-- Apply ONCE BEFORE deploying 144.394. No existing posts or models are changed.

-- Spreelo 144.393 - provider-free, idempotent Sunday-night variation planning.
-- Run once in Supabase SQL editor before deploying the 144.393 cron.
-- Nothing in this migration changes existing customer plans or publications.

create table if not exists public.weekly_variation_plan_runs (
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  week_start date not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  claim_token uuid not null default gen_random_uuid(),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  changed_rules integer not null default 0,
  skipped_rules integer not null default 0,
  last_error text,
  primary key (brand_profile_id, week_start)
);

create index if not exists weekly_variation_plan_runs_status_idx
  on public.weekly_variation_plan_runs(status, claimed_at);

create index if not exists automation_rules_weekly_variation_scan_idx
  on public.automation_rules(brand_profile_id, id)
  where schedule_type = 'weekly' and is_active = true
    and strategy_notes like '%SPREELO_ADAPTIVE_V1:%';

alter table public.weekly_variation_plan_runs enable row level security;
revoke all on public.weekly_variation_plan_runs from public, anon, authenticated;
grant select, insert, update, delete on public.weekly_variation_plan_runs to service_role;

-- Claim a bounded batch atomically; a brand-week cannot be planned twice.
-- Only rules that opted into varied content are eligible. Time zone is read
-- from the customer rule; Sunday 19:00 - Monday 06:00 local is the work window.
create or replace function public.claim_weekly_variation_plans(
  p_limit integer default 18,
  p_now timestamptz default now()
)
returns table(brand_profile_id uuid, week_start date, claim_token uuid)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;
  return query
  with eligible as (
    select distinct on (r.brand_profile_id)
      r.brand_profile_id as bid,
      case
        when extract(isodow from timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)) = 7
          then timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)::date + 1
        else timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)::date
      end as monday
    from public.automation_rules r
    where r.is_active = true
      and r.schedule_type = 'weekly'
      and r.brand_profile_id is not null
      and r.strategy_notes like '%SPREELO_ADAPTIVE_V1:%'
      and (
        (extract(isodow from timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)) = 7
          and extract(hour from timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)) >= 19)
        or
        (extract(isodow from timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)) = 1
          and extract(hour from timezone(coalesce(nullif(r.timezone,''),'UTC'), p_now)) < 6)
      )
    order by r.brand_profile_id, r.id
  ), candidates as (
    select e.bid, e.monday
    from eligible e
    left join public.weekly_variation_plan_runs prev
      on prev.brand_profile_id = e.bid and prev.week_start = e.monday
    where prev.brand_profile_id is null
      or (prev.status = 'failed' and prev.attempts < 3)
      or (prev.status = 'running' and prev.claimed_at < p_now - interval '15 minutes' and prev.attempts < 3)
    order by e.bid
    limit greatest(1, least(50, coalesce(p_limit,18)))
  ), claims as (
    insert into public.weekly_variation_plan_runs as current_run
      (brand_profile_id, week_start, claim_token, status, claimed_at, attempts, last_error)
    select c.bid, c.monday, gen_random_uuid(), 'running', p_now, 1, null
    from candidates c
    on conflict (brand_profile_id, week_start)
    do update set
      claim_token = excluded.claim_token,
      claimed_at = excluded.claimed_at,
      status = 'running',
      attempts = current_run.attempts + 1,
      last_error = null
    where (current_run.status = 'failed' or
      (current_run.status = 'running' and current_run.claimed_at < p_now - interval '15 minutes'))
      and current_run.attempts < 3
    returning current_run.brand_profile_id, current_run.week_start, current_run.claim_token
  )
  select c.brand_profile_id, c.week_start, c.claim_token from claims c;
end;
$$;

revoke all on function public.claim_weekly_variation_plans(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_weekly_variation_plans(integer, timestamptz) to service_role;


-- Spreelo 144.394 - confirmed OpenAI model shutdown notices, service-role only.
-- Additive and idempotent. Does not change any active model or customer data.
create table if not exists public.ai_model_shutdown_notices (
  provider text not null,
  model text not null,
  shutdown_date date not null,
  replacement_model text,
  source_url text not null,
  evidence text,
  last_verified_at timestamptz not null default now(),
  last_alert_stage text,
  primary key(provider,model)
);
create index if not exists ai_model_shutdown_notices_date_idx
  on public.ai_model_shutdown_notices(shutdown_date);
alter table public.ai_model_shutdown_notices enable row level security;
revoke all on public.ai_model_shutdown_notices from public, anon, authenticated;
grant select, insert, update, delete on public.ai_model_shutdown_notices to service_role;
