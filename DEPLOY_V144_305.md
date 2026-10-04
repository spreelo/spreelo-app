# Spreelo v144.305 — finish saved Shotstack posts and deliver them

Complete application; includes v144.304 and all earlier packaged assets.

## Install in this order

1. v144.304 SQL must already be installed. Run `supabase/v144_305_shotstack_delivery.sql` in the same Supabase project's SQL Editor. Run the complete file and check for success. It creates a service-role-only delivery ledger and atomic functions; it does not start AI or provider jobs.
2. Deploy the complete app, including the existing `vercel.json`. No new environment variable is required. Keep `CRON_SECRET`, `RESEND_API_KEY`, Supabase and provider configuration.
3. Let `/api/cron/finalize-shotstack-videos` run. The existing completed Moppen post from v144.304 is eligible for delivery recovery if it is still pending approval and unarchived. It is not regenerated. The cron checks the current brand/admin policy: direct customer approval email when review is off, admin queue when review is on, and admin queue for admin/test posts.
4. Check admin and/or the customer's inbox, and the `Saved Shotstack delivery recovery` logs. A returned `delivery_completed: true` indicates delivery steps were completed. Media generation completion alone is reported separately.

## Audit findings and corrections

- The recovered-draft branch skipped customer approval email and set a review case to awaiting admin irrespective of the actual review gate. Both direct and resumed Shotstack paths now share a delivery routine.
- Resumed product selection history was not saved. Product history and catalog usage now commit together once per saved post, using the selected product saved with the job. Product selection/discovery logic itself is unchanged.
- Legacy nonreserved credit charges were skipped by the recovered-draft path. Settlement now locks rows and records the balance change and transaction together. An existing post charge or consumed reservation prevents another charge. Admin test and admin repair policies remain credit bypasses. A later reserved recurring cycle is not consumed for an already-paid post.
- Background use counts only updated on immediate provider completion. New 305 posts count their background once during settlement. Legacy 304 background counts cannot be reconstructed reliably, so their counters are not incremented again.
- A worker could report generated=1 while customer delivery was missing. Delivery status is now logged explicitly and has its own durable retry state.
- The same cron recovers ready 304 posts even when their automation occurrence has already completed and the rule is inactive. Approved, rejected, archived and unfinished media are excluded from delivery recovery.
- Missing SQL support is checked before product AI in normal automated generation and before copy/image generation in the admin animation path. It does not authorize a paid generation restart.
- The approval email payload is saved before sending and retried with the same provider idempotency key. Persisted sent timestamps prevent later duplicate sends. Ambiguous email outcomes older than 23 hours require reconciliation instead of a blind resend, because the provider deduplication window is finite.
- Customer-mail or review bookkeeping errors retain the ready video and expose a pending delivery in admin when possible. Retried delivery cannot call GPT Image or submit a new Shotstack render.

## Verification

Production Next.js build passed. Existing 299, 300, 302, 303 and both 304 regression tests passed. New delivery tests cover direct customer routing, admin/test gating, preserved released state, interrupted email, identical saved payload/provider key, and repeated history/credit completion.

The new SQL migration and functions were executed in local PostgreSQL via PGlite with representative schemas. Tests cover migration/preflight, delivery leases, atomic customer charges, reserved recurring-cycle safety, admin-test bypass, rollback for insufficient balance, UUID/text transaction references, history and background counters once per post, and exclusion of active occurrences from independent delivery recovery. No production SQL or paid live generation was executed here.

For the optional SQL test install `@electric-sql/pglite` in a temporary test environment, then run `scripts/test-v144-305-sql.mjs`; `PGLITE_MODULE` can specify its absolute module path. This dependency is not needed by the application.

## Limits

Check one real delivery after installing SQL and deploying. Email provider acceptance is not proof of inbox delivery. Ready 304 posts without trustworthy credit/reservation data are held for admin reconciliation. Previously deleted posts or unconfirmed provider submissions are not automatically reconstructed. This release does not change image model, animation motion, layout or background ranking.
