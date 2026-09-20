-- Spreelo v144.232: Shopify V1 connector.
-- Run once in Supabase SQL Editor BEFORE deploying v144.232.
-- Secrets are intentionally kept in a server-only table with no anon/authenticated grants.

begin;

create table if not exists public.shopify_connections (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'connected'
    check (status in ('connected','reconnect_required','disconnected','error')),
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id),
  unique (user_id, shop_domain)
);

create index if not exists shopify_connections_user_idx
  on public.shopify_connections(user_id, updated_at desc);

alter table public.shopify_connections enable row level security;
revoke all on public.shopify_connections from anon, authenticated;

comment on table public.shopify_connections is
  'Server-only Shopify OAuth credentials per Spreelo brand. Access is via service role only; never query from the browser.';

commit;
