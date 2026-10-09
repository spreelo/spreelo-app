-- v329: additive intelligence tables only. No writes to model settings or generation engines.
create table if not exists public.ai_model_availability_signals (
  provider text not null,
  model text not null,
  last_checked_day date not null,
  consecutive_missing integer not null default 0 check(consecutive_missing>=0),
  first_missing_at timestamptz null,
  last_present_at timestamptz null,
  alert_status text not null default 'observing' check(alert_status in ('observing','warning')),
  primary key (provider,model)
);
alter table public.ai_model_availability_signals enable row level security;
revoke all on public.ai_model_availability_signals from anon,authenticated;
grant all on public.ai_model_availability_signals to service_role;

create table if not exists public.ai_provider_source_snapshots (
  key text primary key,
  provider text not null,
  url text not null,
  content_hash text not null,
  last_checked_at timestamptz not null default now()
);
alter table public.ai_provider_source_snapshots enable row level security;
revoke all on public.ai_provider_source_snapshots from anon,authenticated;
grant all on public.ai_provider_source_snapshots to service_role;

create table if not exists public.ai_model_intelligence_runs (
  day date primary key,
  checked_at timestamptz not null default now(),
  results jsonb not null default '{}'::jsonb,
  alert_count integer not null default 0,
  mail_status text not null default 'not_needed'
);
alter table public.ai_model_intelligence_runs enable row level security;
revoke all on public.ai_model_intelligence_runs from anon,authenticated;
grant all on public.ai_model_intelligence_runs to service_role;
