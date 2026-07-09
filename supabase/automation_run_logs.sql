-- Automation run logs
-- Run this in Supabase SQL Editor before/when deploying the matching code.
-- It stores one row per claimed automation attempt so we can see retries, failures and product-selection results.

create extension if not exists pgcrypto;

create table if not exists public.automation_run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid null,
  rule_id uuid not null,
  post_id uuid null,
  status text not null default 'running' check (status in ('running', 'success', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  duration_ms integer null,
  error_message text null,
  content_type_id text null,
  content_format text null,
  products_selected integer not null default 0,
  product_match_terms jsonb null,
  product_search_queries jsonb null,
  search_methods jsonb not null default '[]'::jsonb,
  product_titles jsonb not null default '[]'::jsonb,
  product_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_run_logs_rule_started_idx
  on public.automation_run_logs (rule_id, started_at desc);

create index if not exists automation_run_logs_brand_started_idx
  on public.automation_run_logs (brand_profile_id, started_at desc);

create index if not exists automation_run_logs_user_started_idx
  on public.automation_run_logs (user_id, started_at desc);

create index if not exists automation_run_logs_status_started_idx
  on public.automation_run_logs (status, started_at desc);

alter table public.automation_run_logs enable row level security;

-- Authenticated users can only read their own run logs.
drop policy if exists "Users can view their own automation run logs" on public.automation_run_logs;
create policy "Users can view their own automation run logs"
  on public.automation_run_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Do not add public insert/update/delete policies.
-- Cron uses the Supabase service role key, which bypasses RLS.
