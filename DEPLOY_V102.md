# Spreelo v102 — English-source i18n and channel alignment

## What changed

- The new Create plan, discount-campaign, format-detail and channel-required copy now uses English source labels in `DEFAULT_UI_LABELS`.
- All 370 direct `automation` translation keys used by the planning page now have an English source label; the audit found no missing defaults.
- Swedish and every other selected UI language continue through Spreelo's existing automatic translation flow.
- The visible no-channel helper below Goal was removed. Clicking Goal without a connected channel still opens the setup dialog.
- The platform checkbox and social-channel icon are optically aligned.
- The discount campaign uses clearer source labels for whole website, category and single product.
- `Text + ad` is now `Product ad` and the carousel label explains that it contains five products plus an AI closing image.

## Discount campaign sequence

Campaign length controls the number of posts:

- 1–7 days: 3 posts
- 8–21 days: 5 posts
- 22 days or longer: 7 posts

For a verified product website, the ordered format pool is:

1. Problem solved
2. Product ad
3. Image carousel (or Website product for one exact product URL)
4. Comparison
5. Website product
6. FAQ
7. Animated product

For businesses without verified website-product mode, the ordered fallback pool is:

1. Problem solved
2. Service focus
3. Tips
4. FAQ
5. Case example
6. Comparison
7. Checklist

The first 3, 5 or 7 entries are used according to the campaign length.

## Deployment

No SQL migration is required. Deploy the application normally.
