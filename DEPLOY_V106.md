# Spreelo v106 — Product Engine V2 Foundation

## Deployment order

1. Run `supabase/v106_product_engine_v2.sql` in Supabase SQL Editor.
2. Deploy the complete project, including the existing Sharp/pnpm/Vercel files.
3. Redeploy without the old Vercel build cache if Vercel reuses a pre-v106 build.
4. Leave `PRODUCT_ENGINE_V2` unset or set it to `true`.
5. Test one single-product post and one five-product carousel from a category page.

## What changed

- Platform detection before platform-specific discovery.
- Shopify endpoints are only used for confirmed Shopify stores.
- Quickbutik uses category, sitemap and generic discovery rather than Shopify routes.
- Search-query sanitation removes instruction fragments, coupon codes and malformed phrases.
- Product/category/campaign/search/internal-API pages are classified before extraction.
- Category pages can no longer be accepted as products merely because they contain prices or cart text.
- Zero prices, shipping thresholds and installment amounts are rejected as product prices.
- Focused categories are crawled through pagination and relevant child pages.
- Candidate verification runs in bounded parallel batches.
- Five-product carousels use a larger adaptive pool and keep verified reserves.
- If the normal flow still has fewer than five products, a final exhaustive expansion runs before failure.
- Controlled rotation can reuse the oldest relevant product after fresh products are exhausted.
- Temporary exhaustive-search failures receive two automatic retries before the rule is paused.
- Product copy receives a strict selected-product contract so it cannot advertise reserve products.

## Vercel worker stability

The Sharp runtime, hoisted pnpm configuration, native Linux packages and all five lane routes from v104.2 are preserved.
