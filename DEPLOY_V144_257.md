# Deploy v144.257 — Shopify App Pricing Bridge

## Required

1. Deploy the full v144.257 project to Vercel.
2. Run `spreelo-v144.257-SQL.sql` in Supabase.
3. In Partner Dashboard create a Partner API client with **Manage apps** permission.
4. Add Vercel env vars:
   - `SHOPIFY_PARTNER_ORG_ID`
   - `SHOPIFY_PARTNER_API_ACCESS_TOKEN`
5. Configure Shopify App Pricing in Partner Dashboard with handles `starter`, `growth`, `pro` and welcome link `/shopify/app`.

## No Shopify CLI change in this release

v144.257 does not change the webhook subscriptions or scopes in `shopify.app.toml`. The v144.256 webhook config remains valid.

## Safe separation

- Direct customers: Stripe billing remains unchanged.
- Shopify App Store customers: Shopify App Pricing is used.
- Manual Shopify connections from a normal Spreelo account do not switch that account to Shopify billing.
