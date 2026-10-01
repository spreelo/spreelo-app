-- Spreelo v144.271
create extension if not exists pgcrypto;
create table if not exists public.growth_agent_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off','shadow','active')),
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.growth_agent_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete cascade,
  goal_id text,
  selected_platforms jsonb not null default '[]'::jsonb,
  baseline_plan jsonb not null default '{}'::jsonb,
  growth_plan jsonb not null default '{}'::jsonb,
  growth_context jsonb not null default '{}'::jsonb,
  baseline_source text,
  growth_source text not null default 'deterministic_candidate_v1',
  model text,
  created_at timestamptz not null default now()
);
create index if not exists growth_agent_shadow_runs_user_created_idx on public.growth_agent_shadow_runs(user_id, created_at desc);
create index if not exists growth_agent_shadow_runs_brand_created_idx on public.growth_agent_shadow_runs(brand_profile_id, created_at desc);
alter table public.growth_agent_settings enable row level security;
alter table public.growth_agent_shadow_runs enable row level security;
revoke all on table public.growth_agent_settings from public, anon, authenticated;
revoke all on table public.growth_agent_shadow_runs from public, anon, authenticated;
grant all on table public.growth_agent_settings to service_role;
grant all on table public.growth_agent_shadow_runs to service_role;
