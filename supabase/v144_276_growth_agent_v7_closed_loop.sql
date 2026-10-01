-- Spreelo v144.276 — Growth Agent V7 closed-loop learning audit
-- Run once after v144.271, v144.272, v144.273, v144.274 and v144.275.
-- The loop records decisions and later evidence. It does NOT rewrite active calendars
-- and it does NOT treat later performance as proof that a planning decision caused it.

begin;

create table if not exists public.growth_agent_closed_loop_cycles (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  closed_loop_version integer not null default 7,
  mode text not null check (mode in ('shadow','active')),
  goal_id text,
  selected_platforms jsonb not null default '[]'::jsonb,
  plan_source text,
  selected_content_type_ids jsonb not null default '[]'::jsonb,
  selected_product_focus jsonb not null default '[]'::jsonb,
  decision_snapshot jsonb not null default '{}'::jsonb,
  baseline_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'waiting' check (status in ('waiting','feedback_observed','archived')),
  feedback_observation_gain integer not null default 0 check (feedback_observation_gain >= 0),
  feedback_commerce_event_gain integer not null default 0 check (feedback_commerce_event_gain >= 0),
  feedback_snapshot jsonb not null default '{}'::jsonb,
  planned_at timestamptz not null default now(),
  feedback_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_agent_closed_loop_user_planned_idx
  on public.growth_agent_closed_loop_cycles(user_id, planned_at desc);
create index if not exists growth_agent_closed_loop_brand_status_idx
  on public.growth_agent_closed_loop_cycles(brand_profile_id, status, planned_at desc);

alter table public.growth_agent_closed_loop_cycles enable row level security;
revoke all on table public.growth_agent_closed_loop_cycles from public, anon, authenticated;
grant all on table public.growth_agent_closed_loop_cycles to service_role;

comment on table public.growth_agent_closed_loop_cycles is
  'Growth Agent V7: audit-safe closed loop. Records new planning decisions and later evidence deltas for future learning only. Later evidence is not treated as causal proof and active calendars are never rewritten by this table.';

commit;
