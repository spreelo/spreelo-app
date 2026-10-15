# Spreelo 144.354 — Creative Director 2.0 & delivery-first finalization

**Build/test candidate based on complete 144.353 project.** No new SQL and no new environment variables required by this change. A real provider-to-provider MP4 delivery has **not** been tested here.

## Concrete changes

1. **Finished-render review, both paths:** minor visual judgments (`too_small`, `low_contrast`, `wrong_alignment`, `poor_hierarchy`, generic `other`) become stored creative feedback, not a terminal error, after checked typography preflight and a completed Shotstack render. A temporarily unavailable frame sampler or review service records a review follow-up instead of falsely labeling the rendered film defective.
2. **Real safety exceptions stay blocking:** confirmed visual review issues `subject_overlap`, `stray_graphics`, `unfinished_end_card` still block. Product integrity is independently reviewed by the original strict source/product/frame pipeline. Render transport errors or missing videos are not silently considered successful.
3. **Kling finalization:** `shotstack_design_review` now records outcome and feedback. Previously sticky `rejected` statuses for explicitly identifiable minor/aesthetic issues can be reconsidered using the **same Shotstack render ID** when an existing post is intentionally resumed. A severe prior rejection remains blocked, and deploying the code alone does **not** automatically restart failed posts.
4. **Animated-video continuation:** old `design_review_failed` checkpoints with explicitly identifiable minor review reasons may resume **the stored Shotstack ID**. Severe reasons remain stopped. Delivery records advisory/follow-up metadata.
5. **Creative Director 2.0:** prompts ask for a distinct, product-specific verified use case, one visible five-second action and purposeful camera language, not interchangeable category scripts. The first-scene prompt establishes the environment and actor/action plausibly from frame zero.
6. **Kling motion strategy bug fixed:** previously AI-generated `motionPlan.strategy` was unused in the submitted direction. It now reaches the actual motion prompt and the **independent preflight of that exact prompt**. Long incomplete strategy text is omitted rather than chopped mid-sentence. Provider prompt maximum and original strict visible product/scene locks remain.
7. No new billable image, Kling or Shotstack calls added. Existing provider assets are reused where possible. Better actual motion **still requires real sample videos** to verify and is not guaranteed by a prompt change.

## Local tests

All eight directed suites passed:

- `node scripts/test-v144-354-creative-delivery.mjs` (new)
- `node scripts/test-v144-353-design-first-delivery.mjs`
- `node scripts/test-v144-352-cta-prominence.mjs`
- `node scripts/test-v144-351-end-card-hierarchy.mjs`
- `node scripts/test-v144-350-contract-and-motion.mjs`
- `node scripts/test-v144-350-image-and-review.mjs`
- `node scripts/test-v144-349-production-recovery.mjs`
- `node scripts/test-v144-349-alerts.mjs`

JavaScript syntax checked for changed modules. No complete Next.js production build performed (full application dependencies not present locally); no live Supabase, GPT-image, Kling, email, or Shotstack end-to-end tests. The 99% delivery-quality target **is not demonstrated**.

## Installation

### Normal full project
Deploy `spreelo-144.354-creative-director-delivery.zip` the same way you deploy previous full ZIP releases. This contains the complete project rooted at `spreelo265_work/`.

### Small overlay patch, only if your existing deploy process supports file overlays
The optional patch ZIP holds just 8 added/updated source/release-note files, **not** a standalone project. Extract at the same root that contains `spreelo265_work/` and overwrite matching files **on top of exactly 144.353**, then build/deploy normally. Do NOT upload the patch alone as a complete deployment.

## Required pre-release checks

- On admin-only runs, finish one real animation and one real Kling film as playable MP4, inspect endcard/CTA and real motion.
- Verify that a mild design opinion does not create `needs_repair`, while a real product change or genuine missing/broken content still does.
- Verify admin failure cases + emails and credit reconciliation. Existing earlier fixes are present but weren't end-to-end proven here.
- Keep a rollback to 144.353 and avoid retesting failed Kling via a *new* generation when source + render IDs already exist.
