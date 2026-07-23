# Spreelo v123 – campaign search and timeout optimization

## Deployment

1. Replace the current project files with this package.
2. Deploy normally to Vercel.
3. No new Supabase SQL or storage setup is required.
4. Fluid Compute must remain enabled. The cron route and all five worker lanes now use `maxDuration = 600`.
5. Create a new test carousel after deployment. A previously timed-out run is not rebuilt automatically.

## What changed

- Campaign product discovery now tries the store's own search first.
- When store search cannot supply five fresh campaign-safe products, domain-limited OpenAI Web Search runs next.
- Store Map remains the structural fallback.
- Direct campaign/theme terms are placed before broader buying-intent queries.
- Product verification is cached within one automation run.
- Media URLs and unresolved theme-template URLs are rejected before network verification.
- Fast campaign scoring is limited to the strongest deterministic candidates; the senior model is reserved for uncertain candidates.
- Product preparation has a 300-second soft budget inside the 600-second function limit.
- Each product still receives an individual background-library match based on that product and campaign.
- Product slides render with concurrency 3. Background files and the background-library query are cached during the carousel.
- The final outro remains AI-generated through the existing image-generation flow.
- Logs now show search queries, per-query search results, verified products, selected products, cache hits and remaining preparation time.

## Expected test logs

Look for these messages in Vercel:

- `Campaign product search queries prepared`
- `Product Engine V2 store search finished`
- `Campaign store-search verified product details`
- `Campaign carousel products collected from store search before catalog selection`
- `Campaign carousel selected five products with relevance-first delivery ladder`
- `Carousel image background selected`

When store search already provides five fresh campaign-safe products, there should be no Store Map product-agent run for that carousel.
