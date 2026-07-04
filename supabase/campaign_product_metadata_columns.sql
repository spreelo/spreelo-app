-- Adds structured campaign product-selection metadata to automation rules.
-- Run once in Supabase SQL Editor before deploying the patch.

alter table public.automation_rules
  add column if not exists product_match_terms text[],
  add column if not exists product_search_queries text[],
  add column if not exists product_avoid_terms text[],
  add column if not exists avoid_terms text[],
  add column if not exists product_search_intent text;

comment on column public.automation_rules.product_match_terms is
  'Campaign/product terms that products should match for website product and carousel selection.';
comment on column public.automation_rules.product_search_queries is
  'Search queries used to discover campaign-specific products from the website.';
comment on column public.automation_rules.product_avoid_terms is
  'Product terms that should be avoided for this campaign/post when better matches exist.';
comment on column public.automation_rules.avoid_terms is
  'Backward-compatible avoid term list used by older campaign/product logic.';
comment on column public.automation_rules.product_search_intent is
  'Short natural-language intent for campaign-specific product discovery.';

create index if not exists automation_rules_product_match_terms_gin
  on public.automation_rules using gin (product_match_terms);

create index if not exists automation_rules_product_search_queries_gin
  on public.automation_rules using gin (product_search_queries);

create index if not exists automation_rules_product_avoid_terms_gin
  on public.automation_rules using gin (product_avoid_terms);
