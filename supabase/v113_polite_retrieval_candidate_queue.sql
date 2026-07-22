-- Spreelo v113 — Polite Product Retrieval + Persistent Candidate Queue
-- Run once in Supabase SQL Editor before deploying v113.

begin;

create table if not exists public.website_domain_fetch_profiles (
  domain text primary key,
  min_interval_ms integer not null default 950,
  next_allowed_at timestamptz,
  cooldown_until timestamptz,
  consecutive_429_count integer not null default 0,
  total_request_count bigint not null default 0,
  total_429_count bigint not null default 0,
  last_status integer,
  last_request_at timestamptz,
  last_success_at timestamptz,
  last_rate_limited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_domain_fetch_profiles enable row level security;

create table if not exists public.website_product_candidate_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid not null,
  automation_rule_id uuid,
  source_url text not null,
  category_url text,
  product_url text not null,
  canonical_product_url text not null,
  title text,
  image_url text,
  visible_price text,
  discovery_score numeric not null default 0,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  verified_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_product_candidate_queue_unique
    unique (brand_profile_id, canonical_product_url),
  constraint website_product_candidate_queue_status_check
    check (status in ('pending', 'verifying', 'verified', 'rejected', 'rate_limited'))
);

create index if not exists website_product_candidate_queue_ready_idx
  on public.website_product_candidate_queue
  (brand_profile_id, status, next_attempt_at, discovery_score desc);

create index if not exists website_product_candidate_queue_category_idx
  on public.website_product_candidate_queue
  (brand_profile_id, category_url, status);

alter table public.website_product_candidate_queue enable row level security;

drop policy if exists "Users can read own product candidate queue" on public.website_product_candidate_queue;
create policy "Users can read own product candidate queue"
  on public.website_product_candidate_queue
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own product candidate queue" on public.website_product_candidate_queue;
create policy "Users can delete own product candidate queue"
  on public.website_product_candidate_queue
  for delete
  using (auth.uid() = user_id);

create or replace function public.acquire_website_fetch_slot(
  p_domain text,
  p_requested_interval_ms integer default 950
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(trim(coalesce(p_domain, '')));
  v_now timestamptz := clock_timestamp();
  v_profile public.website_domain_fetch_profiles%rowtype;
  v_interval_ms integer := greatest(500, least(5000, coalesce(p_requested_interval_ms, 950)));
  v_wait_ms bigint := 0;
begin
  if v_domain = '' then
    return jsonb_build_object('allowed', true, 'wait_ms', 0);
  end if;

  perform pg_advisory_xact_lock(hashtext(v_domain));

  insert into public.website_domain_fetch_profiles (domain, min_interval_ms)
  values (v_domain, v_interval_ms)
  on conflict (domain) do nothing;

  select * into v_profile
  from public.website_domain_fetch_profiles
  where domain = v_domain
  for update;

  v_interval_ms := greatest(v_interval_ms, coalesce(v_profile.min_interval_ms, 950));

  if v_profile.cooldown_until is not null and v_profile.cooldown_until > v_now then
    v_wait_ms := greatest(0, ceil(extract(epoch from (v_profile.cooldown_until - v_now)) * 1000));
    return jsonb_build_object(
      'allowed', false,
      'wait_ms', v_wait_ms,
      'cooldown_until', v_profile.cooldown_until
    );
  end if;

  if v_profile.next_allowed_at is not null and v_profile.next_allowed_at > v_now then
    v_wait_ms := greatest(0, ceil(extract(epoch from (v_profile.next_allowed_at - v_now)) * 1000));
    return jsonb_build_object('allowed', false, 'wait_ms', v_wait_ms);
  end if;

  update public.website_domain_fetch_profiles
  set min_interval_ms = v_interval_ms,
      next_allowed_at = v_now + make_interval(secs => v_interval_ms::double precision / 1000.0),
      last_request_at = v_now,
      total_request_count = total_request_count + 1,
      updated_at = v_now
  where domain = v_domain;

  return jsonb_build_object('allowed', true, 'wait_ms', 0);
end;
$$;

create or replace function public.record_website_fetch_result(
  p_domain text,
  p_status integer,
  p_retry_after_ms integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(trim(coalesce(p_domain, '')));
  v_now timestamptz := clock_timestamp();
  v_existing_429 integer := 0;
  v_next_count integer := 0;
  v_backoff_ms bigint := 0;
begin
  if v_domain = '' then return; end if;

  insert into public.website_domain_fetch_profiles (domain)
  values (v_domain)
  on conflict (domain) do nothing;

  select consecutive_429_count into v_existing_429
  from public.website_domain_fetch_profiles
  where domain = v_domain
  for update;

  if p_status = 429 then
    v_next_count := coalesce(v_existing_429, 0) + 1;
    v_backoff_ms := greatest(
      coalesce(p_retry_after_ms, 0),
      case
        when v_next_count = 1 then 60000
        when v_next_count = 2 then 300000
        when v_next_count = 3 then 1800000
        else 7200000
      end
    );

    update public.website_domain_fetch_profiles
    set consecutive_429_count = v_next_count,
        total_429_count = total_429_count + 1,
        cooldown_until = v_now + make_interval(secs => v_backoff_ms::double precision / 1000.0),
        next_allowed_at = v_now + make_interval(secs => v_backoff_ms::double precision / 1000.0),
        min_interval_ms = least(5000, greatest(min_interval_ms, 950) + 250),
        last_status = p_status,
        last_rate_limited_at = v_now,
        updated_at = v_now
    where domain = v_domain;
  elsif p_status between 200 and 399 then
    update public.website_domain_fetch_profiles
    set consecutive_429_count = 0,
        cooldown_until = null,
        min_interval_ms = greatest(700, min_interval_ms - 25),
        last_status = p_status,
        last_success_at = v_now,
        updated_at = v_now
    where domain = v_domain;
  else
    update public.website_domain_fetch_profiles
    set last_status = p_status,
        updated_at = v_now
    where domain = v_domain;
  end if;
end;
$$;

grant execute on function public.acquire_website_fetch_slot(text, integer) to service_role;
grant execute on function public.record_website_fetch_result(text, integer, integer) to service_role;

commit;
