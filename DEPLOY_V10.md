# Spreelo universal product capability and themed carousel resolver v10

V10 separates two questions that were previously mixed together:

1. Is this a real website with purchasable products?
2. Have at least five products already been collected for one carousel?

A strongly verified same-domain product detail page now proves product
capability. Five verified products remain the discovery target for carousel
variety, but no longer make a large real store `false` merely because several
network probes timed out.

## Product capability

- One same-domain detail page must pass the strict technical verifier: product
  identity, product image, canonical identity and Product/Offer, price, SKU or
  purchase/cart evidence.
- Category pages, search pages, services, articles, external marketplaces and
  general product mentions still do not qualify.
- Initial candidate fetches remain cheap and bounded.
- When fewer than five products are verified, failed candidate fetches are
  retried in batches of four with browser, hostname and crawler fallbacks.
- Domain Web Search is still limited to one fallback call during brand analysis.
- One to four strongly verified products enable product/carousel capability;
  runtime discovery continues toward five or more matching products.
- Zero verified products with incomplete network coverage becomes
  `inconclusive`, not a definitive non-store result.
- A site becomes `not_found` only after sufficient direct probing and completed
  domain Web Search return no strongly verified product page.

## Campaign product discovery

- Resolver/cache version is `v10`; older exhausted states cannot suppress a
  fresh V10 discovery run.
- Product URLs verified during brand analysis are now loaded from
  `website_product_mode_evidence` and used as high-priority seed candidates by
  the carousel resolver.
- Native store search, localized campaign terms, bounded domain Web Search and
  sitemap/catalog discovery continue to find more products.
- Exact theme matches rank first. If fewer than five exist, the resolver expands
  through the next-best verified relevance tiers instead of inserting random
  products or stopping.
- Rotation remains scoped by stable theme fingerprint so relevant products are
  used before reuse.

The implementation contains no store-specific domain, platform or product rule.
Campaign terms remain Unicode/language-aware and are generated from each
business's market, website language and campaign context.

## Deployment

No new SQL is required if the v7 migrations have already been run:

1. `supabase/campaign_product_candidates.sql`
2. `supabase/website_product_capabilities_v7.sql`

Deploy V10, reanalyze brands that currently have an incorrect `false`, and then
rerun their campaign carousel. Existing brands that are already correctly
confirmed do not need reanalysis.

Run the regression suite with:

```bash
npm run test:resolver-v10
```
