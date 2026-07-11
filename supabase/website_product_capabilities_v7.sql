-- Deterministic website product capability state.
-- Run once in Supabase SQL Editor before deploying v7.

alter table public.brand_profiles
  add column if not exists website_product_mode_status text not null default 'inconclusive',
  add column if not exists website_product_verified_count integer not null default 0,
  add column if not exists website_single_product_post_available boolean not null default false,
  add column if not exists website_carousel_mode_available boolean not null default false,
  add column if not exists website_product_mode_evidence jsonb not null default '{}'::jsonb,
  add column if not exists website_product_detector_version text not null default 'v7';

alter table public.brand_profiles
  drop constraint if exists brand_profiles_website_product_mode_status_check;

alter table public.brand_profiles
  add constraint brand_profiles_website_product_mode_status_check
  check (website_product_mode_status in ('confirmed', 'not_found', 'inconclusive'));

comment on column public.brand_profiles.website_product_mode_status is
  'confirmed when at least one product detail page was technically verified, not_found after completed probes found none, inconclusive after blocked/failed probes.';
comment on column public.brand_profiles.website_carousel_mode_available is
  'True only when at least five distinct verified product detail pages are available.';
