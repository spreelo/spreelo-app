# Spreelo product resolver and robust website analysis v8

Run these SQL files once in Supabase SQL Editor if they were not already run for v7:

1. `supabase/campaign_product_candidates.sql`
2. `supabase/website_product_capabilities_v7.sql`

Then deploy the application normally. V8 adds no new database migration beyond
the two v7 files.

## V8 website-access changes

- Homepage timeout increased from 12 to 20 seconds per attempt.
- Up to four attempts share one strict 45-second total budget.
- Browser headers are tried first, including `Accept-Language`.
- Both the entered hostname and its with/without-`www` variant are tried.
- A declared Spreelo crawler identity is retained as the final HTTP fallback.
- Redirects are followed manually and every destination is rechecked by the SSRF/public-network guard.
- Errors record which bounded attempts failed and why.
- One GPT-5.6 Luna Web Search fallback runs only when all direct homepage attempts fail.
- Product/context probes remain one attempt each. Context pages use an 8-second timeout in batches of four, preventing retry multiplication and long sequential waits.
- Carousel HTML/product fetches now use the same browser-like, redirect-safe fetcher with one bounded attempt.

The Web Search fallback lets the brand profile and campaign analysis continue on
many bot-blocked sites. It does not automatically approve product mode: product
capability still passes through the separate same-domain product-page verifier.

## Model routing

The code and documentation now agree that both advanced and fast product
research use `gpt-5.6-luna` by default. The environment variables can still
override this routing.

## Verification

1. Deploy the application.
2. Reanalyze `next.se`.
3. In Vercel logs, a successful direct retry includes fetch metadata; if all HTTP attempts fail, the job step becomes `researching_blocked_website` before analysis continues.
4. Confirm the saved website canonicalizes to the actual same-domain destination (for Next this is normally under `www.next.se`).
5. Run the regression suite:

```bash
npm run test:resolver-v8
```
