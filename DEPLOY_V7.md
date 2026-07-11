# Spreelo product resolver v7

Run these SQL files once in Supabase SQL Editor before deploying the code:

1. `supabase/campaign_product_candidates.sql`
2. `supabase/website_product_capabilities_v7.sql`

Then deploy the application normally.

## What changed

- Product discovery score, product-page evidence and campaign relevance are separate values.
- Search/category URLs never count as direct theme evidence for a product.
- Only fetched and technically verified product detail pages enter carousel selection.
- Campaign product cache and usage are shared by a stable theme fingerprint, not an individual automation rule.
- Usage is committed after the post and carousel slides have been created.
- Native search and domain Web Search are bounded; a warm cache uses no Web Search.
- Website product mode requires five distinct verified same-domain product detail pages for carousel access.
- Detection state is `confirmed`, `not_found` or `inconclusive`; a temporary inconclusive recheck does not erase an earlier confirmed result for the same website.

## Recommended verification after deployment

1. Reanalyze the brand so the v7 capability detector replaces the legacy boolean.
2. Create one campaign carousel.
3. Check `automation_run_logs` for `V7 campaign product resolver completed` data.
4. Check `campaign_product_candidates` for the current `theme_key`, `score_version = 'v7'`, `product_verified = true`, and distinct product URLs.
5. Run the same campaign again and confirm that products with lower `times_used` are selected first.

The pure rotation regression suite can be run with:

```bash
npm run test:product-resolver
```
