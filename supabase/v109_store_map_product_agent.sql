-- Spreelo v109 — Store Map + Product Agent
-- Run once in Supabase SQL Editor before deploying v109.

begin;

alter table if exists public.automation_rules
  add column if not exists retry_not_before timestamptz,
  add column if not exists product_retry_attempt integer not null default 0,
  add column if not exists product_retry_reason text;

create index if not exists automation_rules_retry_gate_idx
  on public.automation_rules (is_active, retry_not_before, next_run_at)
  where is_active = true;

alter table if exists public.website_product_catalog
  add column if not exists store_map_node_url text,
  add column if not exists store_map_node_title text,
  add column if not exists store_map_node_type text,
  add column if not exists category_urls text[] not null default '{}',
  add column if not exists store_map_metadata jsonb not null default '{}'::jsonb;

create index if not exists website_product_catalog_store_map_node_idx
  on public.website_product_catalog
  (brand_profile_id, store_map_node_type, store_map_node_url);

create index if not exists website_product_catalog_category_urls_idx
  on public.website_product_catalog using gin (category_urls);

create table if not exists public.website_store_map_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid not null,
  origin_url text not null,
  url text not null,
  canonical_url text not null,
  parent_url text,
  node_type text not null default 'unknown',
  node_type_confidence integer not null default 0,
  title text,
  summary text,
  keywords text[] not null default '{}',
  depth integer not null default 0,
  product_link_count integer not null default 0,
  child_link_count integer not null default 0,
  commerce_platform text not null default 'generic',
  discovery_source text not null default 'store_map_crawl',
  status text not null default 'active',
  last_crawled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_store_map_nodes_brand_url_unique
    unique (brand_profile_id, canonical_url)
);

create index if not exists website_store_map_nodes_brand_type_idx
  on public.website_store_map_nodes
  (brand_profile_id, status, node_type, node_type_confidence desc);

create index if not exists website_store_map_nodes_brand_crawled_idx
  on public.website_store_map_nodes
  (brand_profile_id, last_crawled_at desc nulls last);

create index if not exists website_store_map_nodes_keywords_idx
  on public.website_store_map_nodes using gin (keywords);

create index if not exists website_store_map_nodes_search_idx
  on public.website_store_map_nodes using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(canonical_url, '')
    )
  );

alter table public.website_store_map_nodes enable row level security;

drop policy if exists "Users can read own store map" on public.website_store_map_nodes;
create policy "Users can read own store map"
  on public.website_store_map_nodes
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own store map" on public.website_store_map_nodes;
create policy "Users can delete own store map"
  on public.website_store_map_nodes
  for delete
  using (auth.uid() = user_id);

-- Existing source-page information is useful when rebuilding the first map.
update public.website_product_catalog
set category_urls = array[
      coalesce(
        nullif(verification_metadata->>'source_page_url', ''),
        nullif(source_url, '')
      )
    ],
    store_map_node_url = coalesce(
      nullif(store_map_node_url, ''),
      nullif(verification_metadata->>'source_page_url', '')
    ),
    store_map_node_title = coalesce(
      nullif(store_map_node_title, ''),
      nullif(category, '')
    )
where coalesce(array_length(category_urls, 1), 0) = 0
  and coalesce(
        nullif(verification_metadata->>'source_page_url', ''),
        nullif(source_url, '')
      ) is not null;

commit;
