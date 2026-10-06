# v144.318 — search-origin product URL classification hardening

Complete package based on v144.317, including all previous fixes.

## Change

Product Engine V2 no longer lets a retailer search query parameter by itself override a deterministic product-detail path. Real product links returned from store search, for example `/p-4098465/?q=gaming`, continue through the existing product proof and identity checks instead of being rejected immediately as `search_path`.

The change is deliberately narrow and fail-closed:

- Genuine `/search?...`, `/sok?...`, `/catalogsearch?...` and query-only search URLs remain classified as search pages.
- A product-looking path is not automatically accepted as a product. It still has to pass the existing product schema, commerce proof, canonical/main-product metadata or purchase-surface checks.
- Product identity gates, image verification, previous-use safeguards, web-research fallback, market resolution, Kling/animation generation and catalog discovery are unchanged.
- No retailer/domain-specific exception was added, so the fix also covers other storefronts that append search terms or tracking context to real product URLs.

## POWER regression covered

A URL shaped like:

`https://power.se/gaming/pc/asus-v16/p-4098465/?q=gaming`

with normal product-page commerce proof is classified as `product`, while:

`https://example.se/search?q=gaming`

remains `search` even if the HTML contains many product cards.

## Deployment

Deploy the complete project using the existing deployment process. No SQL, environment-variable change or new dependency is needed.

## Validation

Passed:

- Product Engine V2 helper tests, including the new search-origin product URL regression.
- v142.2 generic product verification.
- v144.34 Quickbutik/no-product-price regression.
- v144.38 verified-product lock fallback regression.
- v144.39 universal reliable product-lock regression.
- v144.40 product-image gate isolation regression.
- v144.43 market/locale product-lock regression.
- v144.92 product-research URL normalization regression.

An older v140 source-string regression test is already incompatible with v144.317 because it asserts an obsolete exact implementation string unrelated to this change; it was not used as a release gate for v144.318.
