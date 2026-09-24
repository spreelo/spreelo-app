# Deploy v144.256

1. Run `spreelo-v144.256-SQL.sql` in Supabase SQL Editor.
2. Deploy the application to Vercel normally.
3. Verify that `https://app.spreelo.com/api/shopify/webhooks` is live. It accepts POST only; a browser GET is not a valid webhook test.
4. Link Shopify CLI to the existing Spreelo Shopify app (do not create another app).
5. Add the contents of `SHOPIFY_WEBHOOK_CONFIG_V144_256.toml.example` to the linked app's `shopify.app.toml` while preserving the existing app configuration.
6. Run `shopify app deploy` to publish the app-specific webhook subscriptions.
7. Trigger/test the webhook endpoint with Shopify CLI before uninstalling the dev store app.
8. Finally uninstall Spreelo from a development store and verify that the matching `shopify_connections` row becomes `disconnected` with blank tokens.

`shop/redact` does not normally arrive until at least 48 hours after uninstall, and it will not fire if the app is reinstalled before then.
