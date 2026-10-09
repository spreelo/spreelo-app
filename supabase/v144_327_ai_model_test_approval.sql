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
