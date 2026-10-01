-- Spreelo v144.272 — Growth Agent V3 durable Growth Profile
-- Run once after v144.271. The profile is service-role managed and is built
-- only from existing Grow Brain performance evidence / customer learning.

begin;

create table if not exists public.growth_agent_profiles (
  brand_profile_id uuid primary key references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_version integer not null default 3,
  learning_state text not null default 'collecting' check (learning_state in ('collecting','early','established')),
  data_quality text not null default 'limited' check (data_quality in ('limited','developing','strong')),
  observation_count integer not null default 0,
  evidence_count integer not null default 0,
  average_confidence numeric not null default 0,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_agent_profiles_user_updated_idx
  on public.growth_agent_profiles(user_id, updated_at desc);
create index if not exists growth_agent_profiles_learning_idx
  on public.growth_agent_profiles(learning_state, data_quality, updated_at desc);

alter table public.growth_agent_profiles enable row level security;
revoke all on table public.growth_agent_profiles from public, anon, authenticated;
grant all on table public.growth_agent_profiles to service_role;

comment on table public.growth_agent_profiles is
  'Growth Agent V3: conservative brand-specific profile derived from existing Grow Brain performance evidence. Service-role managed; no calendar mutation.';

commit;
