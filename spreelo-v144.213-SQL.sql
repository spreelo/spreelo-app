-- Spreelo v144.213: Grow Brain step 2 — normalized post performance collection.
-- Run once in Supabase SQL Editor before deploying v144.213.

begin;

create table if not exists public.post_performance_latest (
  post_id uuid not null,
  platform text not null,
  user_id uuid not null,
  brand_profile_id uuid not null,
  external_post_id text,
  content_type_id text,
  content_format text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  age_hours numeric,
  views bigint,
  reach bigint,
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  engagements bigint,
  watch_time_seconds numeric,
  average_watch_time_seconds numeric,
  metric_schema_version integer not null default 1,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, platform)
);

create index if not exists post_performance_latest_brand_idx
  on public.post_performance_latest(brand_profile_id, captured_at desc);
create index if not exists post_performance_latest_user_idx
  on public.post_performance_latest(user_id, captured_at desc);
create index if not exists post_performance_latest_platform_idx
  on public.post_performance_latest(platform, captured_at desc);

alter table public.post_performance_latest enable row level security;
revoke all on public.post_performance_latest from anon, authenticated;
grant select on public.post_performance_latest to authenticated;

drop policy if exists post_performance_latest_owner_select on public.post_performance_latest;
create policy post_performance_latest_owner_select
  on public.post_performance_latest
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.post_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  platform text not null,
  user_id uuid not null,
  brand_profile_id uuid not null,
  external_post_id text,
  content_type_id text,
  content_format text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  age_hours numeric,
  views bigint,
  reach bigint,
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  engagements bigint,
  watch_time_seconds numeric,
  average_watch_time_seconds numeric,
  metric_schema_version integer not null default 1,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists post_performance_snapshots_post_idx
  on public.post_performance_snapshots(post_id, platform, captured_at desc);
create index if not exists post_performance_snapshots_brand_idx
  on public.post_performance_snapshots(brand_profile_id, captured_at desc);

alter table public.post_performance_snapshots enable row level security;
revoke all on public.post_performance_snapshots from anon, authenticated;
grant select on public.post_performance_snapshots to authenticated;

drop policy if exists post_performance_snapshots_owner_select on public.post_performance_snapshots;
create policy post_performance_snapshots_owner_select
  on public.post_performance_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.post_performance_collection_state (
  post_id uuid not null,
  platform text not null,
  user_id uuid not null,
  brand_profile_id uuid not null,
  external_post_id text,
  status text not null default 'pending' check (status in ('pending','healthy','scope_missing','unsupported','transient_error','auth_error','not_found')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_collect_at timestamptz not null default now(),
  consecutive_failures integer not null default 0,
  last_error text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, platform)
);

create index if not exists post_performance_collection_due_idx
  on public.post_performance_collection_state(next_collect_at, status);
create index if not exists post_performance_collection_brand_idx
  on public.post_performance_collection_state(brand_profile_id, updated_at desc);

alter table public.post_performance_collection_state enable row level security;
revoke all on public.post_performance_collection_state from anon, authenticated;
grant select on public.post_performance_collection_state to authenticated;

drop policy if exists post_performance_collection_state_owner_select on public.post_performance_collection_state;
create policy post_performance_collection_state_owner_select
  on public.post_performance_collection_state
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.post_performance_latest is
  'Grow Brain step 2: latest normalized lifetime/current metrics for each Spreelo post + platform.';
comment on table public.post_performance_snapshots is
  'Grow Brain step 2: append-only performance snapshots used later to learn velocity and age-normalized performance.';
comment on table public.post_performance_collection_state is
  'Grow Brain step 2: provider collection state, retry scheduling and missing-scope diagnostics per post/platform.';

commit;
