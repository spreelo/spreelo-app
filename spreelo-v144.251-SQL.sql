-- Spreelo v144.251: Shopify full product-catalog indexing.
-- Run once in Supabase SQL Editor BEFORE deploying v144.251.
-- These server-only fields track Shopify Bulk Operations that index the full
-- active + Online Store published catalog. They do not change non-Shopify logic.

begin;

alter table public.shopify_connections
  add column if not exists shopify_catalog_bulk_operation_id text,
  add column if not exists shopify_catalog_bulk_status text,
  add column if not exists shopify_catalog_bulk_started_at timestamptz,
  add column if not exists shopify_catalog_last_full_sync_at timestamptz,
  add column if not exists shopify_catalog_product_count integer not null default 0,
  add column if not exists shopify_catalog_last_error text;

create index if not exists shopify_connections_catalog_bulk_status_idx
  on public.shopify_connections(shopify_catalog_bulk_status, shopify_catalog_bulk_started_at)
  where shopify_catalog_bulk_operation_id is not null;

comment on column public.shopify_connections.shopify_catalog_bulk_operation_id is
  'Current Shopify GraphQL Bulk Operation ID used to index the merchant full active/published product catalog.';
comment on column public.shopify_connections.shopify_catalog_bulk_status is
  'Server-only state for the Shopify full catalog sync (created/running/downloaded/completed/failed).';
comment on column public.shopify_connections.shopify_catalog_bulk_started_at is
  'When the current Shopify full catalog bulk snapshot started.';
comment on column public.shopify_connections.shopify_catalog_last_full_sync_at is
  'When the last complete Shopify catalog snapshot was successfully ingested into Spreelo.';
comment on column public.shopify_connections.shopify_catalog_product_count is
  'Number of eligible Shopify products indexed by the last complete full-catalog sync.';
comment on column public.shopify_connections.shopify_catalog_last_error is
  'Last full-catalog Shopify bulk sync error, if any.';

commit;
