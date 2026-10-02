# Deploy v144.278 — Shopify brand analysis API context

## What this changes
For brands with a connected Shopify store, brand analysis now uses verified Shopify Admin API product/store context as a stable input and still enriches it with public storefront data when available.

## What this does NOT change
- No SQL migration.
- No Shopify scope changes; existing `read_products` is sufficient.
- No changes to campaign-calendar generation logic.
- No changes to campaign opportunity persistence.
- No changes to Automation/content generation logic.
- No changes to Growth Agent.
- No changes to non-Shopify website analysis behavior.

## Expected result
Password-protected Shopify development stores can still produce a meaningful brand profile, target audience, product mode, and campaign calendar from verified product metadata instead of returning an unknown industry solely because the storefront cannot be crawled.

## Verification after deploy
1. Keep the Shopify connection active.
2. Reset only the test brand analysis state (do not delete the account).
3. Re-run analysis for the password-protected North Peak development store.
4. Confirm industry/audience/product mode reflect the snowboard assortment.
5. Confirm campaign calendar is generated through the normal existing flow.
