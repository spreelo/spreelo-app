# Spreelo 144.355 – Verified collection selection & safe fallback

Base: 144.354. No new SQL migrations or environment variables.

## Fixed

- Collection scope (e.g. `/collections/t-shirts`) is enforced before selecting a product from local/global cached catalogs. A previously rejected poster cannot re-enter through the older ranked-catalog path.
- If cached candidates are invalid, the pipeline retrieves verified candidates from the actual collection-specific Shopify `products.json` feed (with bounded pagination), instead of relying only on Store Map/search cache or immediately paying for new web research.
- Cached collection indexes are refreshed once when they exclude every candidate.
- The generic single-product catalog path can attempt up to 12 *distinct verified* candidates; failure of one product lock no longer terminates the entire occurrence.
- Selection can reuse a previously used **verified collection product** after rotation exhaustion rather than selecting an unrelated product.
- Expanded discovery and final reuse selections are also filtered to the customer-selected collection.
- The final product lock/membership check is retained unchanged as a security guard. Products outside a customer-selected collection are never an acceptable delivery fallback.
- Whole-website selection stays on its original product-deduplication behavior.

## Validation

`node scripts/test-v144-355-collection-recovery.mjs`
`node scripts/test-v144-349-production-recovery.mjs`
`node --check app/api/cron/run-automations/route.js`

The full Next.js production build and real production video generation were **not** tested in this environment. Confirm a clean deploy build and run an isolated admin test before enabling customer automations.

## Recovery

This release does not automatically restart terminally failed occurrences. Use the existing admin rescue workflow for the failed occurrence `e77f7b89-78f3-4f8a-ae53-78b08fc09d78`. Avoid creating duplicate paid jobs.
