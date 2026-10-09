-- v328: additive catalog verification audit and optional verified pricing data.
-- No updates to existing ai_model_settings / production models.
create table if not exists public.ai_model_probe_runs (
 id uuid primary key default gen_random_uuid(),
 provider text not null,
 model text not null,
 checked_at timestamptz not null default now(),
 outcome text not null check (outcome in ('passed','failed')),
 capabilities text[] not null default '{}',
 notes text not null default '',
 probe_type text not null default 'auto',
 error_text text
);
create index if not exists ai_model_probe_runs_recent_idx on public.ai_model_probe_runs(checked_at desc);
create index if not exists ai_model_probe_runs_model_idx on public.ai_model_probe_runs(provider,model,checked_at desc);
alter table public.ai_model_probe_runs enable row level security;
revoke all on public.ai_model_probe_runs from anon, authenticated;
grant all on public.ai_model_probe_runs to service_role;

-- Provider pricing must be verified from a trustworthy source before it is displayed.
create table if not exists public.ai_model_pricing (
 provider text not null, model text not null,
 unit text not null, amount_usd numeric(16,8) not null check(amount_usd>=0),
 source_url text not null, verified_at timestamptz not null,
 primary key (provider,model,unit)
);
alter table public.ai_model_pricing enable row level security;
revoke all on public.ai_model_pricing from anon,authenticated;
grant all on public.ai_model_pricing to service_role;
