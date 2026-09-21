# Deploy v144.243

1. No SQL migration is required.
2. Deploy the v144.243 ZIP normally to production.
3. Existing Shopify environment variables remain unchanged.
4. Existing Shopify app configuration/scopes remain unchanged (`read_products`).

## Recommended verification
Use a connected Shopify development store with several ACTIVE, Online Store-published products that have images and at least one available-for-sale variant.

Trigger:
- one normal product post, and
- one product carousel.

Expected server logs include:
- `Shopify Product Engine catalog refreshed from Admin API`
- `Single-product Product Engine is using Shopify Admin API as the primary catalog` or
- `Carousel Product Engine is using Shopify Admin API as the primary catalog`

If Shopify cannot provide enough eligible products, Spreelo should continue through its existing website Product Engine fallback.
