# Spreelo v10.3 – authoritative campaign product mix

V10.3 is based on the complete user-provided v10.2 zip.

## Root cause fixed

V10.2 correctly loaded the brand-level product capability flags and contained a
shared campaign mix policy. The planner then applied a second, contradictory
gate: `website_content_fit = weak` or `website_content_strategy = none` could
turn an already resolved `website_carousel` or `website_product` slot back into
generic `Text + AI image` behavior.

This especially affected newly analyzed product stores when a campaign row had
blank, stale or overly conservative website-fit metadata, even though the brand
profile was confirmed for both product posts and carousels.

## V10.3 behavior

- Brand-level product capability is authoritative for format availability.
- A campaign row's blank, weak or `none` metadata cannot make an approved
  product store's entire campaign generic.
- The slot mode selected by the shared policy cannot be vetoed later by the UI.
- Product/carousel prompts are emitted before any generic weak-fit fallback.
- Explicit `website_carousel_mode_available = false` is respected even when a
  legacy general product-mode flag is true.
- Brands approved only for single products receive later website-product posts
  but no carousel.
- Explicit service campaigns still use the service planner branch.
- Brands with no product capability receive no forced website-product formats.

## Expected four-post mix for an approved store

1. Generic campaign introduction (`Text + image`)
2. Website product carousel (`Carousel + website image`)
3. Website product post (`Text + website image`)
4. Website product post (`Text + website image`)

The post roles and wording may vary, but a confirmed product store can no longer
show four generic `Text + image` rows.

## Database

No SQL migration is required. Deploy V10.3 and reopen/recreate the campaign
plan. Existing campaign rows do not need to be deleted because the policy is
reapplied when the plan is opened.

## Regression coverage

- Existing six-post balanced product mix preserved.
- Four-post approved-store campaign with stale `weak/none` metadata produces
  generic + carousel + product + product.
- Explicit carousel false produces generic + generic + product + product.
- Product-disabled brand produces no website product modes.
- Website modes map to runnable automation types and retain website-content use.

Run:

```bash
npm run test:campaign-content-policy
```
