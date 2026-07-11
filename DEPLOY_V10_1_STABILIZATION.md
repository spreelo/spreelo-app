# Spreelo product resolver v10.1 stabilization

This version stabilizes the v10 carousel product resolver after runs could find valid products during brand analysis and then discard all of them during carousel creation.

## Fixed

- Products already verified during brand analysis are trusted and used directly instead of being forcibly fetched and verified again.
- Trusted brand-analysis products are saved into `website_product_catalog` and `campaign_product_candidates` for later runs.
- Previously selected/used rows in `website_product_catalog` keep their verified status when loaded from cache.
- The complete verified catalog is available as a fallback, not only rows whose text matches campaign terms exactly.
- Product JSON-LD no longer requires name, image and offers to exist in one single object.
- A temporary fetch failure can fall back to a previously verified product instead of erasing it.
- Campaign relevance scores from discovery are preserved instead of being reset to zero.
- An exhausted state is trusted only when there are at least five strong campaign products.
- Resolver state version is bumped to `v10.1-stable`, so broken v10 exhausted states cannot suppress new discovery.
- Failure logs now include counts for campaign cache, catalog fallback and brand capability seeds.

## Database

No new SQL migration is required beyond the v10 migrations already included in the project.

## Validation performed

- `npm run test:resolver-v10`: 17/17 tests passed.
- `node --check app/api/cron/run-automations/route.js`: passed.
- `next build`: compiled and completed successfully using placeholder build-time environment variables.

## After deployment

A failed one-time automation may already have been disabled by cost protection. Create/run the carousel again, or re-enable that specific rule after deploying this version.
