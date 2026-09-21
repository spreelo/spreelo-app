-- Spreelo v144.242: Shopify token-refresh hardening.
-- Run once in Supabase SQL Editor BEFORE deploying v144.242.
-- Adds a short-lived server-side lock so concurrent serverless requests cannot
-- rotate the same Shopify refresh token at the same time.

begin;

alter table public.shopify_connections
  add column if not exists refresh_lock_token text,
  add column if not exists refresh_lock_until timestamptz;

create index if not exists shopify_connections_refresh_lock_idx
  on public.shopify_connections(refresh_lock_until)
  where refresh_lock_until is not null;

comment on column public.shopify_connections.refresh_lock_token is
  'Short-lived server-side ownership token used to serialize Shopify offline access-token refreshes.';
comment on column public.shopify_connections.refresh_lock_until is
  'Expiry for the Shopify token-refresh lock. Stale locks can be safely reclaimed after this timestamp.';

commit;
