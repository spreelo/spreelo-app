# Deploy v144.259

This package supersedes v144.258 before the first international-pricing deployment.

## 1. Deploy v144.259 application code
Deploy the complete v144.259 package to the normal Vercel project.

No SQL is required.

## 2. Stripe sandbox first
With `STRIPE_SECRET_KEY` set locally to the Spreelo sandbox/test account:

```bash
npm run stripe:prices:preview
npm run stripe:prices:sync
```

Do not paste secret keys into source code or chat.

## 3. Verify Stripe sandbox
Check the existing Price objects. Minimum checks:
- Starter: 299 SEK base, $29 USD, €27 EUR, £23 GBP.
- Growth: $59 USD, €53 EUR.
- Pro: $99 USD, €89 EUR.
- +100 credits: 199 SEK, $20, €18, £15, 189 NOK.
- +250 credits: 399 SEK, $40, €35, £30, 379 NOK.
- +500 credits: 699 SEK, $70, €62, £53, 669 NOK.

## 4. Verify Spreelo UI
Direct customer:
- local subscription prices use the resolved direct currency;
- Extra Credits use the same resolved direct currency;
- no hardcoded `kr` remains outside a SEK context.

Shopify customer:
- plan cards remain $29 / $59 / $99 monthly;
- billing remains managed by Shopify;
- Extra Credits are not offered through Stripe.

## 5. Review the full price table
Use `STRIPE_LOCAL_PRICING_V144_259.csv` to review exact FX reference vs chosen rounded price for plans and all three credit packs before touching the live Stripe account.

## 6. Live later
Only after the Stripe live account is verified and sandbox checks pass:

```bash
node scripts/sync-stripe-local-prices.mjs --apply --allow-live
```

Then verify at least one direct subscription Checkout and one direct Extra Credits Checkout in a non-SEK currency.
