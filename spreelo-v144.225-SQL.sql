-- Spreelo v144.225: Grow Brain step 3A — performance learning engine.
-- Run once in Supabase SQL Editor BEFORE deploying v144.225.
-- This step analyzes observed performance only. It does NOT alter planning or generation.

begin;

create table if not exists public.brand_performance_insights (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null,
  user_id uuid not null,
  insight_version integer not null default 1,
  dimension_type text not null check (dimension_type in ('content_type','content_format','platform_content_type','platform_content_format')),
  platform text not null default 'all',
  dimension_key text not null,
  observation_count integer not null default 0,
  avg_exposure numeric,
  avg_interactions numeric,
  engagement_rate numeric,
  click_rate numeric,
  share_rate numeric,
  save_rate numeric,
  relative_exposure numeric,
  relative_engagement numeric,
  relative_click numeric,
  relative_share numeric,
  relative_save numeric,
  performance_score numeric not null default 0,
  confidence numeric not null default 0,
  signal text not null default 'neutral' check (signal in ('strong_positive','positive','neutral','negative','strong_negative')),
  evidence_json jsonb not null default '{}'::jsonb,
  last_post_at timestamptz,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id, dimension_type, platform, dimension_key)
);

create index if not exists brand_performance_insights_brand_score_idx
  on public.brand_performance_insights(brand_profile_id, performance_score desc);
create index if not exists brand_performance_insights_user_idx
  on public.brand_performance_insights(user_id, updated_at desc);
create index if not exists brand_performance_insights_dimension_idx
  on public.brand_performance_insights(dimension_type, platform, dimension_key);

alter table public.brand_performance_insights enable row level security;
revoke all on public.brand_performance_insights from anon, authenticated;
grant select on public.brand_performance_insights to authenticated;

drop policy if exists brand_performance_insights_owner_select on public.brand_performance_insights;
create policy brand_performance_insights_owner_select
  on public.brand_performance_insights
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.brand_performance_learning_state (
  brand_profile_id uuid primary key,
  user_id uuid not null,
  analysis_version integer not null default 1,
  learning_state text not null default 'collecting' check (learning_state in ('collecting','early','established')),
  source_post_count integer not null default 0,
  eligible_post_count integer not null default 0,
  insight_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending','healthy','error')),
  last_source_at timestamptz,
  last_analyzed_at timestamptz,
  next_analysis_at timestamptz not null default now(),
  consecutive_failures integer not null default 0,
  last_error text,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_performance_learning_state_due_idx
  on public.brand_performance_learning_state(next_analysis_at, status);
create index if not exists brand_performance_learning_state_user_idx
  on public.brand_performance_learning_state(user_id, updated_at desc);

alter table public.brand_performance_learning_state enable row level security;
revoke all on public.brand_performance_learning_state from anon, authenticated;
grant select on public.brand_performance_learning_state to authenticated;

drop policy if exists brand_performance_learning_state_owner_select on public.brand_performance_learning_state;
create policy brand_performance_learning_state_owner_select
  on public.brand_performance_learning_state
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.brand_performance_insights is
  'Grow Brain step 3A: brand-specific performance signals normalized against each platform baseline. Read-only to customers; service-role writes only.';
comment on table public.brand_performance_learning_state is
  'Grow Brain step 3A: durable analysis schedule/state. Insights remain observational and do not affect content planning in this step.';

commit;
