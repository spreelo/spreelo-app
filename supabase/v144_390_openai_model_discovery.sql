-- Spreelo 144.390: additive OpenAI model discovery.
-- Does not change existing customer, credit, post or approved-price records.
create table if not exists public.openai_model_catalog (
  model text primary key check(length(model) between 2 and 120),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  provider_created_at timestamptz,
  owned_by text,
  listed_in_api boolean not null default false,
  listed_on_pricing_page boolean not null default false,
  pricing_status text not null default 'unknown' check(pricing_status in ('candidate','ambiguous','missing','unknown')),
  pricing_note text,
  latest_source_fingerprint text,
  updated_at timestamptz not null default now()
);
create index if not exists openai_model_catalog_recent_idx on public.openai_model_catalog(first_seen_at desc);

create table if not exists public.openai_model_discovery_runs (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  status text not null check(status in ('success','partial','failed')),
  models_seen integer not null default 0,
  newly_seen integer not null default 0,
  proposed_prices integer not null default 0,
  ambiguous_prices integer not null default 0,
  price_page_sha256 text,
  detail text
);
create index if not exists openai_model_discovery_runs_recent_idx on public.openai_model_discovery_runs(checked_at desc);

alter table public.openai_model_catalog enable row level security;
alter table public.openai_model_discovery_runs enable row level security;
revoke all on public.openai_model_catalog,public.openai_model_discovery_runs from public,anon,authenticated;
grant select,insert,update,delete on public.openai_model_catalog,public.openai_model_discovery_runs to service_role;
grant usage,select on sequence public.openai_model_discovery_runs_id_seq to service_role;
comment on table public.openai_model_catalog is 'Discovery inventory only. Model list API does not supply tariffs, and discovery does not change active generation models.';
comment on table public.openai_model_discovery_runs is 'Daily discovery health and candidate prices, never provider invoice confirmation.';
