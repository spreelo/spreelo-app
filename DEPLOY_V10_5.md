# Spreelo v10.5 - verified product evidence recovery

This release includes the v10.4 structured campaign-format policy and fixes a
runtime resolver regression found in v10.3 automation logs.

## Confirmed root cause

`normalizeCampaignSearchPoolItem()` normalized a verified product before the
final carousel validation. The normalized object did not contain the commerce
proof fields from brand analysis or the catalog, including:

- `product_page_verified`
- `product_schema_verified`
- `ecommerce_proof_found`
- `add_to_cart_detected`

The next validation therefore rejected products that had already been
verified. A confirmed store with many products could incorrectly reach a
zero-item candidate pool and throw `No verified product detail page...`.

## Fixes

- Verified commerce evidence survives URL/title/image normalization.
- When capability analysis stores the same generic page/theme title for many
  different products, the product URL slug supplies the product identity.
- The resolver version is now `v10.5-evidence-preserving`, invalidating stale
  exhausted-state hints from the broken resolver.
- One to four verified products are still expanded to five carousel slots.
- A product-preparation failure no longer deactivates the complete automation
  rule after its first failed run.
- Failed run logs now include resolver diagnostics for cache counts, capability
  seed counts, derived search queries, discovery sources and source errors.
- Successful run logs persist the derived `product_search_queries` actually
  used by the resolver.

## Safety

The fix does not accept raw search results, category pages or unverified URLs as
products. At least one product must still carry real product-page commerce
evidence before it can be repeated to fill a five-card carousel.

## Database

No new SQL migration is required.

## Verification

Run:

```bash
npm run test:resolver-v10-5
```

The evidence tests reproduce the Pressit failure shape: repeated generic theme
titles plus verified product URLs and product-schema/cart evidence.

The complete v10.5 test command contains 34 regression tests across six suites.
