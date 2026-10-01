-- Spreelo v144.275 — Growth Agent V6 commerce learning
-- Run once after v144.271, v144.272, v144.273 and v144.274.
-- This migration only creates the normalized commerce-learning storage layer.
-- It does NOT request Shopify order scopes and it does NOT infer purchases from clicks.

begin;

create table if not exists public.growth_agent_commerce_events (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('purchase','revenue','conversion','lead','add_to_cart','product_view')),
  occurred_at timestamptz not null,
  content_type_id text,
  post_id uuid,
  product_title text,
  product_url text,
  amount numeric not null default 0 check (amount >= 0),
  currency text,
  attribution_confidence numeric not null default 0 check (attribution_confidence >= 0 and attribution_confidence <= 1),
  source_provider text not null default 'unknown',
  source_event_id text,
  attribution_details jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id, source_provider, source_event_id)
);

create index if not exists growth_agent_commerce_events_brand_time_idx
  on public.growth_agent_commerce_events(brand_profile_id, occurred_at desc);
create index if not exists growth_agent_commerce_events_user_time_idx
  on public.growth_agent_commerce_events(user_id, occurred_at desc);
create index if not exists growth_agent_commerce_events_format_idx
  on public.growth_agent_commerce_events(brand_profile_id, content_type_id, occurred_at desc);

alter table public.growth_agent_commerce_events enable row level security;
revoke all on table public.growth_agent_commerce_events from public, anon, authenticated;
grant all on table public.growth_agent_commerce_events to service_role;

create table if not exists public.growth_agent_commerce_profiles (
  brand_profile_id uuid primary key references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  commerce_version integer not null default 6,
  learning_state text not null default 'collecting' check (learning_state in ('collecting','early','established')),
  data_quality text not null default 'limited' check (data_quality in ('limited','developing','strong')),
  provider text not null default 'none',
  commerce_event_count integer not null default 0,
  attributed_event_count integer not null default 0,
  purchase_like_event_count integer not null default 0,
  total_revenue numeric not null default 0,
  average_attribution_confidence numeric not null default 0 check (average_attribution_confidence >= 0 and average_attribution_confidence <= 1),
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_agent_commerce_profiles_user_idx
  on public.growth_agent_commerce_profiles(user_id, updated_at desc);

alter table public.growth_agent_commerce_profiles enable row level security;
revoke all on table public.growth_agent_commerce_profiles from public, anon, authenticated;
grant all on table public.growth_agent_commerce_profiles to service_role;

comment on table public.growth_agent_commerce_events is
  'Growth Agent V6: normalized, consented commerce/conversion evidence. Service-role only. Clicks are not inserted as purchases or revenue.';
comment on table public.growth_agent_commerce_profiles is
  'Growth Agent V6: bounded commerce-learning summary used only when attributed evidence is sufficient. No active calendar rewrites.';

commit;
