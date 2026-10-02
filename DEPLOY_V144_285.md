# Deploy Spreelo v144.285

## Purpose
Make connected Shopify product/video automation deterministic: Shopify Admin API products are authoritative and are not discarded by the generic website text-fit threshold.

## Deploy
Deploy the full zip normally.

## SQL
No SQL required.

## Expected behavior
- Connected Shopify store with an active verified product: use Shopify Admin API product/image and continue to generation.
- Recent-history exhaustion: rotate/reuse the least-recent suitable verified Shopify product.
- Explicit campaign rejection: product may still be rejected.
- Storefront/web research: only a fallback when Shopify API genuinely cannot provide a valid product.
