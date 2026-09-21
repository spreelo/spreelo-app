# Deploy v144.244

1. Run `spreelo-v144.244-SQL.sql` in Supabase.
2. Deploy this zip.
3. On the existing Shopify test account, retry connecting one Facebook Page.
4. Expected: the first eligible social account is allowed; the normal Free-trial claim flow can unlock the reserved 100 credits. A second connected social account on Free should return a clear plan-limit message.
