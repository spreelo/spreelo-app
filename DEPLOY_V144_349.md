# Spreelo 144.349 — Readability Repair & Terminal Reporting

**Status: staging candidate, NOT production-verified.** Based on full 144.348 project.

## Root causes targeted
- GPT Image often produced a valid-looking graphic that appeared too small or low contrast once placed in the real final text rectangle. The original design reviewer could reject this but had no reliable local correction, causing additional paid image attempts and terminal failures.
- The final Kling step marked AI-video posts failed without sending the admin alert that the separate automation-failure path sends. Some repair cases had null failure_code.
- Store Map restricted the *collection shelves*, but could still select a stale cross-category product from the product candidates.

## Changes
1. `lib/videoAdvertisingReadabilityRepair.js`: focused deterministic repair after an actual vision-review decision of `low_contrast`, `too_small`, `wrong_alignment`, `poor_hierarchy` or `unfinished_end_card`. It chooses a readable size, reflows exact locked words, samples the actual scene-safe text region, and renders an alpha-transparent graphic with adaptive contrast. It is NOT a universal canned overlay and uses the AI-planned creative direction. The completed composited images must pass the same independent visual review. Two bounded local variations; no new provider charge for local repairs. A reviewer rejection from a different cause is not bypassed.
2. Both animation (`run-automations`) and finished Kling video (`finalize-kling-videos`) invoke this focused repair before failing the approved source scene. The cached Kling source is not regenerated for typography-only changes.
3. `lib/videoTerminalAdminAlert.js`: terminal AI-video failures are registered in `record_admin_runtime_incident` for deduplication and sent to the configured admin emails, with the failure code preserved in admin review cases. Alerts are best-effort and do not change the durable failed status if email fails. Existing Supabase RPC and RESEND_API_KEY are required.
4. `lib/verifiedCollectionMembership.js`: users who choose an explicit collection cannot have a selected Store Map candidate accepted merely due to campaign fit or search ranking. Verify product membership in the collection's public product feed or listing both at Store Map discovery and at the common final product-lock stage (including cached, store-search and reserve products). Fail closed if membership cannot be demonstrated. This may require adjustments for stores with anti-bot protection or fully JavaScript-based catalog pages; a missing membership signal must not be interpreted as proof that the item belongs to the collection.
5. VIDEO_DESIGN_VERSION=349, two new targeted test scripts.

## Important cautions
- No SQL migration or new environment setting was introduced.
- This does **not** guarantee zero third-party failures, perfect artistic quality or that a restricted collection always has a verifiable item. Real models can still make mistakes; production must not publish an unverified product or an under-reviewed video.
- A completed Kling source should be preserved after typography errors. Before reinstalling or retrying old failed jobs, verify the recovery procedure and existing database/Storage snapshots. This update does **not** silently un-fail historical posts.
- Existing product-identity protections and Kling motion prompts are deliberately untouched.
- Existing animation and AI-video error workflows outside the updated paths should be regression-tested; the earlier difference in pre-post animation occurrence display still needs a DB-backed integration check.

## Verification performed in this environment
- JS syntax checking of touched production files: PASS.
- `node scripts/test-v144-349-production-recovery.mjs`: PASS (collection scope, retry state, integration checks).
- `node scripts/test-v144-349-alerts.mjs`: PASS (mocked RPC + mocked HTTP notification deduplication).
- Live image composition, visual preflight and vendor integration tests: NOT RUN. `sharp` and other Node dependencies are not included in the ZIP, and the npm registry was not reachable in this environment.

## REQUIRED checks before any customer deployment
1. Install dependencies and run `npm run build` and existing `test:v144.345` through `test:v144.349` scripts in a connected CI/staging environment.
2. Create 3–5 real animation tests with distinct products and backgrounds; confirm complete MP4 output, legible exact Swedish typography at actual phone size, CTA and preserved product identity.
3. Test 3–5 Kling results, including a person wearing apparel, a rigid electronic device, and a product with limited available views. Confirm identity checks pass, adequate movement, and no new unverified surfaces.
4. Inject known low-contrast and too-small typography and verify the local repair visibly improves the actual composite and does not invoke Kling or GPT Image again. Inject unfixable visual errors and verify one clean terminal review case.
5. Deliberately fail an AI-video finalization: ensure exactly one admin notification and an actionable error code. Check that failed animation occurrences without a post_id display in admin Misslyckade.
6. Test the explicit `/collections/t-shirts` source: reject posters, aprons and other unverified products even if catalog search returns them.
7. Verify customer credit accounting, cost limits, re-entrancy, and real app behavior with concurrent workers before broad rollout.
