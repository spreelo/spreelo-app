# Spreelo v109 — Store Map + Product Agent

## Purpose

This release changes product discovery from “search a few pages and hope” to a shelf-first workflow:

1. Build a persistent map of the store navigation, categories, campaign pages and brand sections.
2. Let AI rank the most relevant shelves for the campaign.
3. Inspect those shelves deeply, including child categories and pagination.
4. Save verified products back to the persistent catalog with their shelf source.
5. Use the existing catalog and older products as controlled fallbacks only after the map-first pass.

## Required deployment order

1. Run `supabase/v109_store_map_product_agent.sql` in Supabase SQL Editor.
2. Deploy the complete v109 project.
3. Keep the existing Vercel/pnpm/Sharp configuration unchanged.
4. Trigger one carousel test.

The SQL must be installed first because v109 writes the retry gate and Store Map columns during normal worker execution.

## What to look for in Vercel logs

A successful map-first search should include:

- `Store Map refresh finished`
- `Store Map Product Agent finished`
- `Campaign carousel locked to Store Map Product Agent pool` when at least five strong fresh products were found

The Product Engine diagnostic record now includes `store_map`, selected shelves and partial products even if a carousel remains incomplete.

## Retry correction

Product retries no longer overwrite `next_run_at`. They use `retry_not_before`, so a 15-minute retry cannot be picked up four seconds later merely because carousel generation normally starts 60 hours before publishing.

## Optional environment variables

- `STORE_MAP_PRODUCT_AGENT=false` disables the new agent and keeps the existing fallbacks.
- `STORE_MAP_REFRESH_HOURS=72` controls map freshness.
- `STORE_MAP_CRAWL_PAGE_LIMIT=8` controls how many shelf/navigation pages are fetched during one refresh. Values above 12 are capped in the worker to protect the Vercel time budget.
