# Deploy Spreelo v144.233

1. Run `spreelo-v144.233-SQL.sql` in Supabase SQL Editor.
2. Confirm it completes successfully.
3. Deploy this v144.233 project to Vercel.
4. No new Vercel environment variables are required beyond the v144.232 Shopify variables.
5. Test from Shopify, not from a manually entered store URL:
   - Open/install Spreelo from the dev store.
   - Shopify OAuth should happen before any Spreelo UI.
   - Spreelo should identify/sign in the verified Shopify installer automatically.
   - New users should receive an auto-created brand; ambiguous existing multi-brand users should receive a brand picker.
   - The merchant should see the explicit Shopify store-data AI consent before automatic Grow Brain analysis.
   - Choosing **Allow and continue** records consent, starts analysis when needed, and lands in Grow Brain with Shopify connected.
   - Choosing **Not now** keeps Shopify connected but does not start AI analysis from Shopify store data.
6. Verify `shopify_connections` contains `install_source = shopify_app_store` and, after approval, a non-null `ai_store_data_consent_at`.

Existing v144.232 Shopify product/API connectivity and token refresh logic remain intact.
