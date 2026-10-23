-- Spreelo 144.394 - confirmed OpenAI model shutdown notices, service-role only.
-- Additive and idempotent. Does not change any active model or customer data.
create table if not exists public.ai_model_shutdown_notices (
  provider text not null,
  model text not null,
  shutdown_date date not null,
  replacement_model text,
  source_url text not null,
  evidence text,
  last_verified_at timestamptz not null default now(),
  last_alert_stage text,
  primary key(provider,model)
);
create index if not exists ai_model_shutdown_notices_date_idx
  on public.ai_model_shutdown_notices(shutdown_date);
alter table public.ai_model_shutdown_notices enable row level security;
revoke all on public.ai_model_shutdown_notices from public, anon, authenticated;
grant select, insert, update, delete on public.ai_model_shutdown_notices to service_role;
