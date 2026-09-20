-- Spreelo v144.233: Shopify App Store seamless onboarding.
-- Run once in Supabase SQL Editor BEFORE deploying v144.233.
-- Pending Shopify credentials are server-only and are wiped after the store is claimed.

begin;

create table if not exists public.shopify_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_domain text not null,
  shop_name text,
  primary_domain text,
  installer_email text,
  installer_email_verified boolean not null default false,
  installer_shopify_user_id text,
  installer_locale text,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  status text not null default 'identity_verified'
    check (status in ('identity_verified','ready_to_claim','claimed','error')),
  auth_bootstrap_issued_at timestamptz,
  claimed_user_id uuid references auth.users(id) on delete set null,
  claimed_brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  claimed_at timestamptz,
  last_error text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopify_onboarding_sessions_shop_idx
  on public.shopify_onboarding_sessions(shop_domain, created_at desc);

create index if not exists shopify_onboarding_sessions_expiry_idx
  on public.shopify_onboarding_sessions(expires_at)
  where status <> 'claimed';

alter table public.shopify_onboarding_sessions enable row level security;
revoke all on public.shopify_onboarding_sessions from anon, authenticated;

comment on table public.shopify_onboarding_sessions is
  'Short-lived server-only handoff for Shopify App Store OAuth before a verified Shopify identity is attached to a Spreelo account/brand.';

alter table public.shopify_connections
  add column if not exists install_source text not null default 'spreelo',
  add column if not exists app_store_installed_at timestamptz;

comment on column public.shopify_connections.install_source is
  'Where the Shopify link was initiated. shopify_app_store is retained for later Shopify Billing/acquisition decisions.';

alter table public.shopify_connections
  add column if not exists ai_store_data_consent_at timestamptz,
  add column if not exists ai_store_data_consent_version text;

comment on column public.shopify_connections.ai_store_data_consent_at is
  'Explicit merchant consent timestamp for using this store data to personalize Grow Brain/content for this store.';
comment on column public.shopify_connections.ai_store_data_consent_version is
  'Version of the Shopify store-data AI consent text accepted by the merchant.';

commit;
