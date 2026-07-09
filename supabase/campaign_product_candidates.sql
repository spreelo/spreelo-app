-- Campaign product candidate cache
-- Run once in Supabase SQL Editor before deploying the matching code.
-- Purpose: save clean, scored products per campaign/rule so future carousel runs can reuse
-- good campaign matches without repeating expensive product research.

create table if not exists public.campaign_product_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid not null,
  rule_id uuid not null,
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
  updated_at timestamptz not null default now(),
  unique (rule_id, product_url)
);

create index if not exists campaign_product_candidates_rule_score_idx
  on public.campaign_product_candidates (rule_id, is_active, campaign_fit_score desc, times_used asc, last_used_at asc);

create index if not exists campaign_product_candidates_brand_source_idx
  on public.campaign_product_candidates (brand_profile_id, source_url, is_active);

alter table public.campaign_product_candidates enable row level security;

drop policy if exists "Users can view their own campaign product candidates" on public.campaign_product_candidates;
create policy "Users can view their own campaign product candidates"
  on public.campaign_product_candidates
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts/updates are done by cron with the Supabase service role key.
