# Spreelo 144.389 – OpenAI cost accuracy (safe rollout)

**Base:** GitHub Spreelo 144.388 commit `f2a0d29f2baa7396a8e64e5396b9495a2f60cffd`.
**State:** prepared and locally tested; not live, Supabase SQL not executed, no OpenAI live billing verified.

## Safe rollout without staging expense

1. Deploy the included code **using the usual GitHub -> Vercel workflow**. The new pricing engine and new Vercel price-audit cron are BOTH disabled unless `SPREELO_OPENAI_PRICING_ENABLED` is the literal string `true`. Keep this variable absent for the first deployment. Production OpenAI metering behaves as 144.388 until the feature is enabled; no new tables are queried by the metering code while off. The new admin screen explains the inactive state.
2. Wait for Vercel Production **Ready** and check that ordinary post approval and existing rendering paths work before activation. If Vercel build fails, retain the current Ready production build.
3. Back up/checkpoint the current Supabase project and apply the **additive** `supabase/v144_389_openai_pricing_integrity.sql` in its SQL Editor. It adds three tables, an approval RPC, an index and a trigger. It does not alter `posts`, queues, scheduled workers, credits or historical costs.
4. Visit `/admin/openai-pricing` using the primary Spreelo admin to confirm that the new tables load. The daily watch baseline runs only after activation; prices require explicit approval (never imported automatically from webpage HTML).
5. When ready, add `SPREELO_OPENAI_PRICING_ENABLED=true` in Vercel **Production only**, redeploy, and validate one controlled known-cost OpenAI text request and one image request, including cost events and summaries. New registered costs are estimates from approved tariffs, not per-request invoices. Unknown models / ambiguous usage are partial.
6. Existing Vercel `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are used for passive daily price-page change checks at **05:40 UTC**. There is no need to configure GitHub Actions secrets for the price watch. This cron never changes approved prices.
7. **Optional separate stage**: the project-level OpenAI billing reconciliation script exists at `scripts/reconcile-openai-costs.mjs`, but it is NOT automatically scheduled and requires an **organization-admin OpenAI key** plus a dedicated OpenAI project ID. Never put admin credentials in client code or chat; do not describe costs as invoice verified until reconciliation is configured and proven against real reports.

## Tests performed

- 14/14 new targeted tests passed (pricing, incomplete prices, DB failure handling, billing-reconcile mock and feature OFF).
- `scripts/test-v144-12-exact-generation-cost-tracking.mjs` passed.
- Original 144.388 `scripts/test-v144-155-complete-generation-cost-metering.mjs` passed unchanged.
- Syntax checks for changed JS modules and JSX page passed using Node and the TypeScript parser.

**Not yet verified:** full Vercel Next.js build; live SQL migration; real OpenAI Admin Costs API response; end-to-end video test in production. These checks cannot honestly be claimed before deployment/account access.

## Revert/rollback

To reverse the code, revert to commit `f2a0d29...` / Spreelo 144.388 in Vercel/GitHub. Leave newly added SQL tables in place (they are independent) unless a separately reviewed cleanup is necessary. Set `SPREELO_OPENAI_PRICING_ENABLED=false` to disable the new lookup and watcher without a code rollback.
