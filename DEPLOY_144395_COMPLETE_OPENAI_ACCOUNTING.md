# Spreelo 144.395 – OpenAI cost coverage beyond posts

## Based on
Complete **144.394** archive supplied by the project owner. This is a cumulative **COMPLETE** ZIP; no code from 144.394 was removed or reverted.

## Installation
1. Save/commit any local edits before applying. **144.394 must already be deployed.** Review diff if another tool/branch has changed the working tree since 144.394.
2. **No Supabase migration is required.** Version 144.395 writes to the existing service-role-only `public.post_generation_cost_events` ledger installed by `v144_12_exact_generation_cost_tracking.sql`.
3. Copy the **contents inside** `Spreelo-144.395/` to the repository root, not the top-level version folder. Deploy via GitHub/Vercel as normal.
4. Keep existing `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. No new environment variables or model changes are required. If service-role credentials are unavailable, model calls continue; supplemental costs will not persist.
5. After production is Ready, run one **controlled** onboarding/brand-analysis or test-image job and use `KONTROLL_144395_OPENAI_KOSTNADER.sql` (read-only) to verify `post_id IS NULL` entries have `operation` describing the feature. Also confirm normal posts still have linked entries.
6. Prefer reconciling a **fully settled UTC day** using `scripts/reconcile-openai-costs.mjs`; this still requires `OPENAI_ADMIN_KEY` and `OPENAI_SPREELO_PROJECT_ID` and never changes customer credits. The mismatch tolerance is now max($0.01, 2% of daily charge), down from max($0.10, 2%).

## What changed
- Added `lib/supplementalOpenAICosts.js` to reuse the existing cost calculation/ledger for **non-post** OpenAI calls, always using the service-role client (or an existing authenticated admin client). No new customer-exposed database fields.
- Instrumented onboarding plans, durable brand-analysis jobs, legacy synchronous analysis, blocked-website background research, source inspection, calendar image generation and classification, campaign-theme classification, UI and server-side translations, bounded model verification probes, and admin Rescue validation.
- Added feature-specific `operation` names for non-post flows. Background responses use the same `responses.background` operation and stable OpenAI `resp_...` ID on both submission and retrieval; HTTP request IDs change during polling and must **not** be treated as distinct billable jobs.
- Pending background jobs with no provider usage are registered as **unpriced (`amount IS NULL`)**, never asserted to cost $0. A late usage-free poll checks for a previously priced event before writing.
- Cost recording is best-effort and separate from customer generation. An error in the ledger is logged, not thrown to the content generator.
- Preserved the existing GPT-image-2 token pricing and text/image/output split; verified the previously tested 2,792 input / 1,510 output case still produces $0.031166.
- No model switches, prompt edits, product-selection changes, calendar-variation changes, customer-credit billing changes, or scheduler changes.

## Scope and important limitations
- **No historical backfill:** past OpenAI charges cannot be reconstructed from an aggregate dashboard alone.
- `post_generation_cost_events` records **model-based estimates** from API usage and active approved rates, not a per-request provider invoice. Providers can bill later, and tools/non-standard tiers can be marked unpriced.
- A missing provider `usage` cannot safely be turned into a zero-dollar event, and failed requests may be billed without returning usage. Such discrepancies remain for daily API-level reconciliation.
- Daily project-level reconciliation remains the right test for *overall* ledger coverage, once the billing day has settled. It cannot prove which exact post incurred every cent.
- Some incidental/free OpenAI calls (e.g. listing models and price-documentation requests) have no generation tokens and are not logged as paid generations.
- Operation `responses.background` intentionally remains unprefixed so that submission and retrieval deduplicate. The `generation_session_id` identifies a related research job when supplied.

## Tests (offline)
```
node --test tests/openai-cost-coverage-144395.test.mjs
node --test tests/openai-approved-pricing.test.mjs
node --test tests/reconcile-smoke.test.mjs
node tests/weekly-variation-144393.test.mjs
node tests/product-discovery-recovery-144392.test.mjs
node --test tests/openai-price-evidence-144391.test.mjs
```

Static syntax checks performed on all changed JS files. API-cost and db integration require an authenticated test deployment; **no live paid OpenAI calls were executed during packaging**.

## Rollback
Restore source at deployed 144.394 (or revert the version-144.395 commit) and redeploy. No new SQL tables/columns require rollback. Existing recorded supplemental cost rows are preserved for audit and should not be deleted.

## Archive note
The **project ZIP** intentionally does not redistribute original bundled font binaries. Keep the already-installed font files from your 144.394 repository when updating. All 144.395 code and changes are supplied; applying the patch over your unchanged 144.394 repository retains fonts and every other existing asset. The small patch is therefore the safest installation choice.
