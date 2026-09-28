# Deploy v144.260

Deploy v144.260 instead of v144.258/v144.259 if those have not yet been deployed.

1. Deploy the full v144.260 application to Vercel.
2. No Supabase SQL is required for v144.260.
3. Run the existing v144.259 Stripe local-price sync against the Stripe sandbox (not live first). v144.260 keeps the same 29 fixed Stripe currency options.
4. Verify at minimum:
   - Sweden → SEK price cards.
   - Denmark → DKK price cards.
   - Italy → EUR price cards.
   - A long-tail market such as Aruba → SEK base cards plus the local-checkout notice; Checkout should use Adaptive Pricing when available.
   - Shopify embedded app → $29/$59/$99 and Shopify billing flow, with Stripe credit packs hidden.
5. Only after sandbox verification, repeat the fixed-price sync in live Stripe when the live Stripe account is ready.

Recommended checks before deployment:
- `node scripts/test-v144-258-international-pricing.mjs`
- `node scripts/test-v144-259-polished-credit-pricing.mjs`
- `node scripts/test-v144-260-country-first-currency-fallback.mjs`
- `node scripts/test-v144-257-shopify-app-pricing.mjs`
