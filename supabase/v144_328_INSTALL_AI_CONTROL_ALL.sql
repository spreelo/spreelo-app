-- v328 CONSOLIDATED AI CONTROL SQL: run once, even if v323-v326 were already applied.
-- Additive/idempotent; ON CONFLICT DO NOTHING preserves existing selected models.
-- Assumes pre-existing v144_102_admin_mass_tests.sql and v144_186 admin team tables.

-- v144_323_ai_control_center.sql
-- Spreelo v144.323 - AI Control Center
create table if not exists public.ai_model_settings (
  purpose text primary key,
  provider text not null,
  model text not null,
  default_model text not null,
  capability text not null,
  changed_by uuid null,
  changed_at timestamptz not null default now(),
  auto_replaced boolean not null default false,
  replacement_reason text null
);

alter table public.ai_model_settings enable row level security;
revoke all on table public.ai_model_settings from anon, authenticated;
grant all on table public.ai_model_settings to service_role;

insert into public.ai_model_settings (purpose, provider, model, default_model, capability)
values
 ('post_text','openai','gpt-4.1-mini','gpt-4.1-mini','text'),
 ('brand_analysis','openai','gpt-4.1-mini','gpt-4.1-mini','text_vision'),
 ('content_plan','openai','gpt-5.5','gpt-5.5','text_reasoning'),
 ('product_research','openai','gpt-5.5','gpt-5.5','text_reasoning'),
 ('editorial_headline','openai','gpt-5.6-sol','gpt-5.6-sol','text_reasoning'),
 ('carousel_creative','openai','gpt-5.6-sol','gpt-5.6-sol','text_reasoning'),
 ('standard_image','openai','gpt-image-2','gpt-image-2','image'),
 ('transparent_typography','openai','gpt-image-2.5-flare','gpt-image-2.5-flare','image_alpha'),
 ('calendar_image','openai','gpt-image-2','gpt-image-2','image'),
 ('kling_video','kling','kling-3.0','kling-3.0','image_to_video')
on conflict (purpose) do nothing;


-- v144_324_ai_market_watch.sql
-- v324: additive news storage. Does not alter model settings.
create table if not exists public.ai_market_news (
 id text primary key, provider text not null, title text not null,
 url text not null, published_at timestamptz, discovered_at timestamptz not null default now(),
 severity text not null default 'info', category text not null default 'update',
 summary text not null default '', notified_at timestamptz null
);
create index if not exists ai_market_news_discovered_idx on public.ai_market_news(discovered_at desc);
alter table public.ai_market_news enable row level security;
revoke all on public.ai_market_news from anon, authenticated;
grant all on public.ai_market_news to service_role;
create table if not exists public.ai_market_watch_runs (
 day date primary key, checked_at timestamptz not null default now(), sources_ok integer not null default 0, sources_failed integer not null default 0, discovered integer not null default 0
);
alter table public.ai_market_watch_runs enable row level security;
revoke all on public.ai_market_watch_runs from anon, authenticated;
grant all on public.ai_market_watch_runs to service_role;


-- v144_325_ai_control_audit.sql
-- v325: add separate purposes, preserving every v322 default and existing selections.
insert into public.ai_model_settings (purpose,provider,model,default_model,capability) values
('manual_post','openai','gpt-5.5','gpt-5.5','text_reasoning'),
('campaign_plan','openai','gpt-5.5','gpt-5.5','text_reasoning')
on conflict (purpose) do nothing;


-- v144_326_ai_model_discovery.sql
-- v326: Discovery catalog. Does NOT update ai_model_settings or active models.
create table if not exists public.ai_model_catalog (
 provider text not null,
 model text not null,
 status text not null default 'pending_review' check(status in ('pending_review','approved','rejected')),
 verified_capabilities text[] not null default '{}',
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 verified_at timestamptz,
 verification_notes text,
 primary key(provider,model)
);
alter table public.ai_model_catalog enable row level security;
revoke all on public.ai_model_catalog from anon,authenticated;
grant all on public.ai_model_catalog to service_role;


-- v144_327_ai_model_test_approval.sql
-- Spreelo v144.327: additive test-and-approval tracking.
-- Prerequisites: existing v144_102, v144_323, v144_325, v144_326 migrations.
-- Never alters existing prompts, engines, credits or model selections.
begin;
create extension if not exists pgcrypto;
create table if not exists public.ai_model_test_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  brand_owner_id uuid not null,
  brand_profile_id uuid not null,
  batch_id uuid not null unique references public.admin_test_batches(id),
  purpose text not null,
  model text not null,
  original_model text not null,
  content_type_id text not null,
  status text not null default 'queued' check(status in ('queued','running','ready','failed','approved','rejected')),
  email_state text not null default 'pending' check(email_state in ('pending','sending','sent','failed')),
  email_attempts integer not null default 0,
  email_error text,
  email_provider_id text,
  email_sent_at timestamptz,
  notified_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index if not exists ai_model_test_requests_pending_idx
  on public.ai_model_test_requests (email_state, created_at)
  where status in ('queued','running','ready','failed');
create index if not exists ai_model_test_requests_creator_idx
  on public.ai_model_test_requests (created_by, created_at desc);
alter table public.ai_model_test_requests enable row level security;
revoke all on public.ai_model_test_requests from anon, authenticated;
grant all on public.ai_model_test_requests to service_role;
commit;


-- v144_328_ai_model_verification.sql
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

create table if not exists public.ai_model_pricing (
 provider text not null, model text not null,
 unit text not null, amount_usd numeric(16,8) not null check(amount_usd>=0),
 source_url text not null, verified_at timestamptz not null,
 primary key (provider,model,unit)
);
alter table public.ai_model_pricing enable row level security;
revoke all on public.ai_model_pricing from anon,authenticated;
grant all on public.ai_model_pricing to service_role;
