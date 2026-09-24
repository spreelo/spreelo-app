# Deploy v144.254 — Shopify Embedded App + App Bridge

## 1. Deploy the application
Deploy the full v144.254 build as usual. No Supabase SQL migration is required.

## 2. Shopify app configuration
In the Shopify Dev Dashboard for the Spreelo app:

- Set **App URL** to: `https://app.spreelo.com/shopify/app`
- Ensure the app is configured as **embedded in Shopify Admin**.
- Keep the existing allowed redirect URL for the standalone/Grow Brain OAuth fallback:
  `https://app.spreelo.com/api/shopify/callback`
- Keep the existing product read scopes configured for the app.

The deployment still uses the existing environment variables:
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_REDIRECT_URI`
- `SHOPIFY_SCOPES`
- `SHOPIFY_API_VERSION`

## 3. Test in the development store
1. Open Shopify Admin.
2. Click Spreelo under Apps.
3. Confirm Spreelo opens inside Shopify Admin rather than requiring a second login.
4. For an already-linked store, confirm it lands in the correct Spreelo brand.
5. For a fresh store/account, confirm the existing Shopify onboarding flow continues through brand setup, consent and analysis.
6. Close and reopen Spreelo from Shopify Admin and confirm the existing store opens directly.

## Expected security behavior
If another Shopify staff account uses a different email from the Spreelo account owner linked to that store, Spreelo intentionally refuses silent auto-login. Explicit team/staff access should be implemented later as a separate permission feature rather than granting the entire Spreelo account implicitly.

## Rollback
Revert the Shopify App URL to the previous route and redeploy v144.253. The old `/api/shopify/connect` OAuth flow remains in v144.254 as well.
