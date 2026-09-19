-- Spreelo v144.212: Grow Brain step 1 — brand-specific learning from approvals and rejections.
-- Raw events are retained so the aggregate profile can be rebuilt when the learning model evolves.

create table if not exists public.brand_learning_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  brand_profile_id uuid not null,
  event_type text not null check (event_type in ('approved', 'rejected')),
  content_type_id text,
  content_type_label text,
  content_format text,
  platforms text[] not null default '{}'::text[],
  tone text,
  post_type text,
  rejection_category text,
  rejection_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists brand_learning_events_post_event_unique_idx
  on public.brand_learning_events(post_id, event_type);
create index if not exists brand_learning_events_brand_created_idx
  on public.brand_learning_events(brand_profile_id, created_at desc);
create index if not exists brand_learning_events_user_created_idx
  on public.brand_learning_events(user_id, created_at desc);

alter table public.brand_learning_events enable row level security;
revoke all on public.brand_learning_events from anon, authenticated;

create table if not exists public.brand_learning_profiles (
  brand_profile_id uuid primary key,
  user_id uuid not null,
  profile_version integer not null default 1,
  learning_state text not null default 'collecting',
  source_event_count integer not null default 0,
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  profile_json jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_learning_profiles_user_idx
  on public.brand_learning_profiles(user_id);

alter table public.brand_learning_profiles enable row level security;
revoke all on public.brand_learning_profiles from anon, authenticated;
grant select on public.brand_learning_profiles to authenticated;

drop policy if exists brand_learning_profiles_owner_select on public.brand_learning_profiles;
create policy brand_learning_profiles_owner_select
  on public.brand_learning_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes intentionally remain service-role only. Approval/rejection links and
-- automation workers are server-side and must not trust client-supplied learning events.
