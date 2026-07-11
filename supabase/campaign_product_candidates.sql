-- Campaign product candidate cache
-- Run once in Supabase SQL Editor before deploying the matching code.
-- Purpose: save clean, scored products per stable campaign theme so future carousel runs can reuse
-- good campaign matches without repeating expensive product research.

create table if not exists public.campaign_product_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid not null,
  rule_id uuid not null,
  theme_key text null,
  source_url text not null,
  product_url text not null,
  title text not null,
  description text null,
  image_url text not null,
  price text null,
  campaign_fit_score integer not null default 0,
  campaign_fit_source text null,
  selection_priority integer not null default 0,
  times_used integer not null default 0,
  last_used_at timestamptz null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaign_product_candidates
  add column if not exists theme_key text,
  add column if not exists heuristic_fit_score integer not null default 0,
  add column if not exists ai_fit_score integer null,
  add column if not exists fit_tier integer not null default 3,
  add column if not exists score_version text not null default 'v7',
  add column if not exists product_verified boolean not null default false,
  add column if not exists verified_at timestamptz null;

alter table public.campaign_product_candidates
  drop constraint if exists campaign_product_candidates_rule_id_product_url_key;

drop index if exists public.campaign_product_candidates_theme_product_uidx;
create unique index campaign_product_candidates_theme_product_uidx
  on public.campaign_product_candidates (brand_profile_id, theme_key, product_url);

create index if not exists campaign_product_candidates_rule_score_idx
  on public.campaign_product_candidates (rule_id, is_active, campaign_fit_score desc, times_used asc, last_used_at asc);

create index if not exists campaign_product_candidates_theme_rotation_idx
  on public.campaign_product_candidates
  (brand_profile_id, theme_key, is_active, product_verified, times_used asc, fit_tier asc, campaign_fit_score desc, last_used_at asc);

create or replace function public.increment_campaign_product_candidate_usage(
  p_brand_profile_id uuid,
  p_theme_key text,
  p_product_url text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.campaign_product_candidates
  set times_used = times_used + 1,
      last_used_at = now(),
      updated_at = now()
  where brand_profile_id = p_brand_profile_id
    and theme_key = p_theme_key
    and product_url = p_product_url;
$$;

revoke all on function public.increment_campaign_product_candidate_usage(uuid, text, text) from public;
grant execute on function public.increment_campaign_product_candidate_usage(uuid, text, text) to service_role;

create or replace function public.increment_website_product_catalog_usage(
  p_brand_profile_id uuid,
  p_product_url text,
  p_used_source text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.website_product_catalog
  set times_used = times_used + 1,
      last_used_at = now(),
      discovery_source = coalesce(p_used_source, discovery_source),
      updated_at = now()
  where brand_profile_id = p_brand_profile_id
    and product_url = p_product_url;
$$;

revoke all on function public.increment_website_product_catalog_usage(uuid, text, text) from public;
grant execute on function public.increment_website_product_catalog_usage(uuid, text, text) to service_role;

create table if not exists public.campaign_product_discovery_state (
  brand_profile_id uuid not null,
  theme_key text not null,
  last_attempt_at timestamptz null,
  exhausted boolean not null default false,
  consecutive_no_new integer not null default 0,
  last_new_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_profile_id, theme_key)
);

alter table public.campaign_product_discovery_state enable row level security;

drop policy if exists "Users can view their own campaign product discovery state" on public.campaign_product_discovery_state;
create policy "Users can view their own campaign product discovery state"
  on public.campaign_product_discovery_state
  for select
  to authenticated
  using (
    exists (
      select 1 from public.brand_profiles bp
      where bp.id = brand_profile_id and bp.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own campaign product discovery state" on public.campaign_product_discovery_state;
create policy "Users can delete their own campaign product discovery state"
  on public.campaign_product_discovery_state
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.brand_profiles bp
      where bp.id = brand_profile_id and bp.user_id = auth.uid()
    )
  );

create index if not exists campaign_product_candidates_brand_source_idx
  on public.campaign_product_candidates (brand_profile_id, source_url, is_active);

alter table public.campaign_product_candidates enable row level security;

drop policy if exists "Users can view their own campaign product candidates" on public.campaign_product_candidates;
create policy "Users can view their own campaign product candidates"
  on public.campaign_product_candidates
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own campaign product candidates" on public.campaign_product_candidates;
create policy "Users can delete their own campaign product candidates"
  on public.campaign_product_candidates
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Inserts/updates are done by cron with the Supabase service role key.
