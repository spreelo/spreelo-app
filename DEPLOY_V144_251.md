# Spreelo v144.251 — Shopify Full Catalog Index

## What changes

- Shopify only: starts a Shopify GraphQL Bulk Operation to index the full active + Online Store published product catalog.
- The existing synchronous 120-product fetch remains only as a fast/current bootstrap for the post being generated; it is no longer the catalog coverage ceiling.
- Completed full snapshots are written to the existing `website_product_catalog` in batches.
- Shopify rows missing from a completed snapshot are retired after successful ingestion.
- The full snapshot refreshes approximately every 6 hours when Shopify product flows are used.
- Non-Shopify websites, Store Map, Rescue, scraping, prompts and product verification rules are unchanged.

## Deploy

1. Run `spreelo-v144.251-SQL.sql` in Supabase SQL Editor.
2. Deploy the v144.251 ZIP.
3. Open a Shopify brand in AI Content Studio. The quick product-mode probe starts the asynchronous full-catalog index.
4. Product generation continues immediately via the fast Shopify path; once the bulk operation completes, a subsequent Shopify product run ingests the full catalog.

## Notes

Shopify recommends Bulk Operations for large datasets rather than manually paginating very large catalogs. v144.251 follows that model while preserving the current fast path for immediate content generation.
