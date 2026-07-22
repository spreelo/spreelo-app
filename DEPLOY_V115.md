# Spreelo v115 – Store Map Early Exit & Deadline Guard

Built directly on v114 (`review-exact-ai-studio-canvas`). No database migration is required beyond the existing v113 polite-retrieval migration.

## What changed

- When Store Map has at least five fresh, valid, campaign-safe products, those products are locked immediately.
- The old store-search, sitemap, generic discovery and AI product-research fallbacks are skipped after a successful Store Map result.
- Up to five additional Store Map products are saved as reserves, but missing reserves never block delivery of the five carousel products.
- Previously used products are still excluded (`STRICT_PRODUCT_NO_REUSE` remains enabled by default).
- Product-like URLs are prioritized before category/listing URLs during verification. Weak links remain available only as a later fallback.
- `www.example.com` and `example.com` product variants are canonicalized as the same product for the source domain.
- Product preparation has a 215-second soft deadline. Expensive fallbacks are not started when there is too little time left, preventing a hard 300-second Vercel timeout.

## Expected successful log

```text
Store Map Product Agent finished
Store Map early exit locked carousel products
```

When the second line appears, legacy product fallbacks were skipped and the carousel continues directly to generation.

## Installation

1. Deploy the complete v115 project.
2. Do not run any new SQL for v115.
3. The SQL from v113 must already be installed: `supabase/v113_polite_retrieval_candidate_queue.sql`.
4. Test a new website carousel.

## Verification commands

```bash
npm run test:product-engine-v2
npm run test:store-map-agent
npm run test:polite-retrieval
npm run test:store-map-early-exit
```
