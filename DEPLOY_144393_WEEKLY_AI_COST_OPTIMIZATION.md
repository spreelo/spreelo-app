# Spreelo 144.393 – weekly variation without repeated AI planning

## Deployment order

1. **Run Supabase SQL before deploying**: `supabase/v144_393_weekly_variation_planning.sql` in the existing Spreelo project. It creates a private brand/week planning ledger and service-role-only claiming RPC. No existing posts or automation rules are modified by the migration.
2. Replace changed files in the existing 144.392 source, or deploy the complete 144.393 archive. Confirm only the files in the patch changed; preserve other local work.
3. Commit and deploy via GitHub/Vercel. The new cron uses the existing `CRON_SECRET` and Supabase service-role settings. No new environment variables.
4. Verify `/api/cron/weekly-variation-planning` is registered, and review its Sunday/Monday logs. It runs each minute only on Sundays and Mondays UTC, and checks **each brand's local time** before scheduling work. During local Sunday 19:00–Monday 06:00 it claims at most 18 brands per invocation, 3 processed concurrently.
5. Confirm `weekly_variation_plan_runs` receives one `completed` record per eligible brand and Monday week-start. Only rules with `SPREELO_ADAPTIVE_V1` variation enabled are affected.

## Customer behavior

- Goal, frequency, channel and planning-mode changes in the AI Content Studio only recalculate a deterministic draft; **no OpenAI requests** occur from `applyDynamicAutoPlan`.
- When activated, recurring varied rules still use the existing history-balanced variant pool. The overnight cron pre-locks content types for the next week using recent successes, customer-learning and performance signals, with no OpenAI requests.
- Calendar days, publish times, manually edited posts, customer overrides and previously approved/published posts are **not changed** by the cron. Only the internal `strategy_notes` variant-lock JSON changes; updates use compare-and-swap on the old value to avoid overwriting manual edits.
- New customers can configure and activate their first plan immediately; their initial draft and recurring automation do not wait until Sunday. The next week's weekly lock is prepared by the Sunday-night planner.
- Existing recurring automation workers retain their **pre-existing next-cycle variant reservation and credit logic**. If a next-week variant is already locked when the Sunday planner runs, it is preserved to avoid a credit-reservation mismatch. Thus the weekly cron may confirm an earlier preselection; it does not always choose anew on Sunday. This is intentional for compatibility and can be made fully Sunday-only in a separate, credit-safe migration.

## OpenAI cost tracking

- The legacy/manual `plan-content` and campaign-planning API routes now write OpenAI responses to the existing admin-only provider ledger, using a user/session identifier even when no post is created.
- This does not yet instrument every separate AI route (e.g., all brand analysis paths). Do not describe global provider accounting as fully reconciled until compared with OpenAI billing.

## Verification

```bash
node tests/weekly-variation-144393.test.mjs
node tests/product-discovery-recovery-144392.test.mjs
node tests/openai-price-evidence-144391.test.mjs
node scripts/test-v144-252-plan-cache-capability-identity.mjs
node scripts/test-v144-277-growth-agent-v7-idempotency.mjs
```

### Rollback

Restore original 144.392 source and deploy. The new SQL table can remain unused; it does not modify old customers by itself. Disabling the cron is enough to pause preplanning while preserving existing worker-based variation.
