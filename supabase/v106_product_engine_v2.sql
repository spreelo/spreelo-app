-- Spreelo v106 — Product Engine V2 Foundation
-- Run once in Supabase SQL Editor before enabling PRODUCT_ENGINE_V2 globally.

begin;

alter table public.website_product_catalog
  add column if not exists commerce_platform text not null default 'generic',
  add column if not exists page_type text not null default 'unknown',
  add column if not exists page_type_confidence integer not null default 0,
  add column if not exists category text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists sale_price text,
  add column if not exists original_price text,
  add column if not exists availability text,
  add column if not exists verification_score integer not null default 0,
  add column if not exists product_schema_verified boolean not null default false,
  add column if not exists ecommerce_proof_found boolean not null default false,
  add column if not exists price_source text,
  add column if not exists price_confidence text,
  add column if not exists price_rejected_reason text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists verification_metadata jsonb not null default '{}'::jsonb;

-- Existing rows were collected by the previous looser extractor. They remain
-- available for re-verification, but are not trusted as products until V2 sees
-- the real page again and writes page_type = 'product'.
update public.website_product_catalog
set page_type = 'unknown',
    page_type_confidence = 0,
    verification_score = 0,
    last_verified_at = null
where last_verified_at is null;

update public.website_product_catalog
set page_type = 'internal_api',
    page_type_confidence = 100,
    is_active = false
where product_url ~* '/(apps?|api|ajax|graphql)(/|$)'
   or product_url ~* '/fetch($|[/?])';

update public.website_product_catalog
set page_type = 'search',
    page_type_confidence = 95,
    is_active = false
where product_url ~* '/(search|sok|sök|catalogsearch)(/|$|[?])';

create index if not exists website_product_catalog_v2_lookup_idx
  on public.website_product_catalog
  (user_id, brand_profile_id, is_active, page_type, times_used, last_used_at);

create index if not exists website_product_catalog_v2_platform_idx
  on public.website_product_catalog
  (brand_profile_id, commerce_platform, page_type, last_verified_at desc);

create index if not exists website_product_catalog_v2_tags_idx
  on public.website_product_catalog using gin (tags);

create index if not exists website_product_catalog_v2_search_idx
  on public.website_product_catalog using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '')
    )
  );

create table if not exists public.website_product_catalog_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid not null,
  automation_rule_id uuid,
  source_url text,
  commerce_platform text not null default 'generic',
  status text not null default 'completed',
  candidate_count integer not null default 0,
  inspected_count integer not null default 0,
  verified_count integer not null default 0,
  selected_count integer not null default 0,
  reserve_count integer not null default 0,
  rejected_count integer not null default 0,
  reused_count integer not null default 0,
  discovery_methods jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists website_product_catalog_runs_brand_created_idx
  on public.website_product_catalog_runs (brand_profile_id, created_at desc);

create index if not exists website_product_catalog_runs_rule_created_idx
  on public.website_product_catalog_runs (automation_rule_id, created_at desc);

alter table public.website_product_catalog_runs enable row level security;

-- Server-side service-role workers bypass RLS. The owner can read its own
-- diagnostics if an admin/user view is added later.
drop policy if exists "Users can read own product catalog runs" on public.website_product_catalog_runs;
create policy "Users can read own product catalog runs"
  on public.website_product_catalog_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own product catalog runs" on public.website_product_catalog_runs;
create policy "Users can delete own product catalog runs"
  on public.website_product_catalog_runs
  for delete
  using (auth.uid() = user_id);

commit;
