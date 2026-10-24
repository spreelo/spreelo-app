# Spreelo 144.398 – Admin AI cost overview

Base: full Spreelo 144.397. No existing files or fonts deleted. No changes to existing generation logic, AI model choices, costs or ledger writes.

## Deploy

1. Keep your current complete 144.397 backup.
2. Run `supabase/v144_398_admin_ai_cost_overview.sql` ONCE in Supabase SQL Editor using an admin SQL connection (before Vercel deploy). The migration adds one timestamp index and one read-only service-role-only RPC; it does not modify existing cost rows.
3. Deploy the full 144.398 source ZIP through your normal workflow.
4. In Spreelo, open **Admin → Economy & credits → Actual AI costs**. You can also open `/admin/ai-costs` directly after signing in as a Spreelo administrator.
5. Compare last 3 hours with the latest test. Check the numbers under **Other AI costs** and the operation/model breakdown.

## What it means

- **Linked to posts**: events that currently contain a post ID. Some events may be associated with a post only later when generation finishes.
- **Other AI costs**: ledger entries without a post ID. This includes UI translations or background analysis; not necessarily part of the post you just generated.
- **Unpriced**: an event with no known USD price. Not free. The displayed USD total excludes it.
- **Usage-based/estimate**: values are priced against Spreelo's reference rate and are not per-request amounts verified by OpenAI billing.
- **Per-day billing reconciliation**: remains in `/admin/openai-pricing`; the OpenAI wallet balance can update asynchronously and must not be compared naively with the sum for a single post.
- The new overview does not retroactively recover API calls that were never logged. An unexplained gap is not relabeled as a fictitious background cost.

## Validation

- `node --test tests/admin-ai-costs-144398.test.mjs`
- Existing tests for generation cost tracking, translations, pricing and weekly calendar behavior.
- Supabase queries for `post_generation_cost_events` are *read-only* in the new API. Access always checks admin login and uses the service-role client server-side.
