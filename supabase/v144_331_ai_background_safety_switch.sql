-- Spreelo v144.331: fail-closed activation for the four new AI Control Center cron routes.
-- Safe after v330, additive and repeatable. OFF by default; never overwrites a previously selected value.
create table if not exists public.ai_control_job_settings (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);
alter table public.ai_control_job_settings enable row level security;
revoke all on table public.ai_control_job_settings from anon, authenticated;
grant all on table public.ai_control_job_settings to service_role;
insert into public.ai_control_job_settings (key,enabled)
values ('ai_control_background_jobs', false)
on conflict (key) do nothing;
