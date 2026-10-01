-- Spreelo v144.273 — Growth Agent V4 controlled experiment registry
-- Run once after v144.271 and v144.272.

begin;

create table if not exists public.growth_agent_experiments (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_version integer not null default 4,
  experiment_key text not null,
  kind text not null check (kind in ('content_type_exploration','strength_validation')),
  content_type_id text not null,
  goal_id text,
  hypothesis text not null,
  max_plan_share numeric not null default 0.2 check (max_plan_share >= 0 and max_plan_share <= 0.2),
  status text not null default 'proposed' check (status in ('proposed','active','completed','paused')),
  baseline_observations integer not null default 0,
  baseline_score numeric not null default 0,
  baseline_confidence numeric not null default 0,
  latest_observations integer not null default 0,
  latest_score numeric not null default 0,
  latest_confidence numeric not null default 0,
  outcome text check (outcome is null or outcome in ('supported','not_supported','inconclusive')),
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id, experiment_key)
);

create index if not exists growth_agent_experiments_user_updated_idx
  on public.growth_agent_experiments(user_id, updated_at desc);
create index if not exists growth_agent_experiments_brand_status_idx
  on public.growth_agent_experiments(brand_profile_id, status, updated_at desc);

alter table public.growth_agent_experiments enable row level security;
revoke all on table public.growth_agent_experiments from public, anon, authenticated;
grant all on table public.growth_agent_experiments to service_role;

comment on table public.growth_agent_experiments is
  'Growth Agent V4: controlled format experiments. Experiments only nudge new planning; they never rewrite active calendars.';

commit;
