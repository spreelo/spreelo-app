# Deploy v144.258

## 1. Deploy application code
Deploy the v144.258 package to the normal Vercel project.

No SQL is required.

## 2. Sandbox first — sync Stripe local prices
Do not paste Stripe secret keys into source code or chat.

Use a terminal/environment where `STRIPE_SECRET_KEY` points to the Spreelo Stripe sandbox/test account, then run:

```bash
npm run stripe:prices:preview
npm run stripe:prices:sync
```

The sync refuses a live secret key unless `--allow-live` is explicitly supplied.

## 3. Verify in Stripe sandbox
Open the existing Spreelo Starter price and confirm that local currency options now exist. Check at minimum:
- SEK 299/month (base)
- USD 29/month
- EUR 27/month
- GBP 23/month

Also check Growth, Pro and the three Extra Credits prices.

## 4. Test the Spreelo UI
Direct account:
- Swedish visitor/account should see SEK pricing.
- US location should see USD $29 / $59 / $99.
- Euro-area location should see EUR €27 / €53 / €89.
- Extra credits should use the same local currency.

Shopify embedded account:
- Plan cards should show $29 / $59 / $99, not 299 / 599 / 999 kr.
- “Billing is managed by Shopify” behavior and Shopify plan selector must remain unchanged.

## 5. Test Stripe Checkout localization
Stripe documents the `+location_XX` test-email convention for simulating customer locations in Checkout. Useful checks:
- `+location_US` → USD fixed option
- `+location_FR` → EUR fixed option
- `+location_GB` → GBP fixed option

The Checkout Session intentionally does not force a currency. Stripe can therefore select a matching manual `currency_option`; Adaptive Pricing remains fallback for other supported locations.

## 6. Live later
Only after Stripe live-account/company verification and successful sandbox tests, run the same sync against the live account with the deliberate live safety flag:

```bash
node scripts/sync-stripe-local-prices.mjs --apply --allow-live
```

Then verify at least Starter USD/EUR and one real Checkout before broad launch.
