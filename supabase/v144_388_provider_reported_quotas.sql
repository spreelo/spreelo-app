-- Spreelo v144.388: supplier-reported quotas. Run after v144.387.
-- Separate supplier snapshots from request-attempt estimates; never mark unknown limits as confirmed.
create table if not exists public.provider_capacity_reported_snapshots (
  provider text not null,
  metric text not null,
  scope text not null default 'account',
  label text not null,
  window_kind text not null check (window_kind in ('minute','utc_day','utc_month','lifetime')),
  unit text not null,
  observed_count bigint check (observed_count >= 0),
  limit_value bigint check (limit_value > 0),
  checked_at timestamptz not null default now(),
  reset_at timestamptz,
  source text not null check (source in ('resend_usage_api','openai_response_headers')),
  instructions text not null default '',
  documentation_url text not null default '',
  primary key(provider,metric,scope)
);
create index if not exists provider_capacity_reported_checked_idx
  on public.provider_capacity_reported_snapshots(checked_at desc);
create table if not exists public.provider_capacity_source_status (
  provider text primary key,
  state text not null check(state in ('connected','not_configured','permission_required','unavailable','waiting_for_requests')),
  checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  message text not null default ''
);
alter table public.provider_capacity_reported_snapshots enable row level security;
alter table public.provider_capacity_source_status enable row level security;
revoke all on public.provider_capacity_reported_snapshots from anon,authenticated;
revoke all on public.provider_capacity_source_status from anon,authenticated;
grant select,insert,update on public.provider_capacity_reported_snapshots to service_role;
grant select,insert,update on public.provider_capacity_source_status to service_role;
comment on table public.provider_capacity_reported_snapshots is
  'Actual provider-reported usage/caps. OpenAI response headers are a point-in-time rate-window signal, not monthly account spend.';
comment on table public.provider_capacity_source_status is
  'Admin-only, sanitized connector health. Never stores credentials or raw supplier response bodies.';
