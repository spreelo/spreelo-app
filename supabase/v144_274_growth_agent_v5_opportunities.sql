-- Spreelo v144.274 — Growth Agent V5 opportunity detection registry
-- Run once after v144.271, v144.272 and v144.273.

begin;

create table if not exists public.growth_agent_opportunities (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_version integer not null default 5,
  opportunity_key text not null,
  kind text not null check (kind in ('new_product','unused_product','stale_product','campaign_window','format_gap')),
  priority numeric not null default 0 check (priority >= 0 and priority <= 100),
  title text not null default '',
  reason text not null default '',
  content_type_id text,
  product_title text,
  product_url text,
  campaign_title text,
  campaign_goal text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  details jsonb not null default '{}'::jsonb,
  last_detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id, opportunity_key)
);

create index if not exists growth_agent_opportunities_user_status_priority_idx
  on public.growth_agent_opportunities(user_id, status, priority desc, updated_at desc);
create index if not exists growth_agent_opportunities_brand_status_idx
  on public.growth_agent_opportunities(brand_profile_id, status, updated_at desc);

alter table public.growth_agent_opportunities enable row level security;
revoke all on table public.growth_agent_opportunities from public, anon, authenticated;
grant all on table public.growth_agent_opportunities to service_role;

comment on table public.growth_agent_opportunities is
  'Growth Agent V5: verified opportunities detected from existing Spreelo product, campaign and learning data. Opportunities are soft signals for future planning only and never rewrite active calendars.';

commit;
