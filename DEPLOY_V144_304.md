# Spreelo v144.304 — AI typography and resumable Shotstack rendering

This is the complete application. It includes versions 302 and 303; deploying 303 separately is unnecessary.

## Deployment order

1. Run `supabase/v144_304_shotstack_continuation.sql` in Supabase SQL Editor, using the project's existing administrator account. The earlier application migrations must already be installed. This migration replaces the existing atomic occurrence claim and adds a service-role-only Shotstack continuation RPC. It does not create new generations or alter existing occurrence rows during installation.
2. Deploy this complete application, including `vercel.json`. Keep the existing production environment settings (`CRON_SECRET`, Supabase, OpenAI, Shotstack etc.). The new `/api/cron/finalize-shotstack-videos` cron handles admin repair renders; ordinary automation renders continue through the existing automation lanes.
3. Test one new animated product post. Check that any `queued`, `fetching`, `rendering` or `saving` wait retains the same post and render ID. On completion the existing draft becomes ready for approval.

## Changes

- Keeps the selected `gpt-image-2.5-flare` model and AI-generated letterforms. No plain/SVG typography fallback is introduced.
- Validates transparent glyph shapes instead of rejecting text solely because bold letters occupy a large part of the image. Blank images and solid opaque panels still fail validation. Trims wasted transparent margins before fitting the text box.
- Checks the actual generated text color against the selected background and, when available, three sampled video frames. Poor contrast selects white or dark navy and adds an opposite-color glyph contour locally. This is not another AI call or another typeset text layer.
- Maximum two typography generation calls: one initial call and at most one corrective call to the same model. The corrective call can incur a normal image-generation charge. Quota/authentication errors are not retried. Invalid results fail visibly instead of silently inserting fallback typography.
- Saves the caption, poster and a submission checkpoint before sending the Shotstack request. Saves the returned render ID before polling.
- A short polling window ending schedules a check of the same provider job. It does not cancel it, choose another product, rerun AI or submit another Shotstack render, and does not consume the generic whole-generation retry budget.
- Download/storage interruptions resume the completed provider job. Workers interrupted after saving a checkpoint can recover through the atomic occurrence claim after the existing 15-minute lease. Ready drafts left by a terminated worker can also finish their occurrence.
- An ambiguous submission (POST outcome unknown / returned ID could not be persisted) is held for reconciliation. Automatic resubmission is prohibited because it could charge twice. Previously deleted drafts and unknown provider IDs cannot be reconstructed by this update.
- Admin repair renders continue through a bounded cron finalizer. Repeated repair requests cannot duplicate an active saved render.
- Includes v302 background contrast/season ranking and rotation. Newly added eligible, tagged backgrounds participate automatically.

## Verification

Passed scripts: v144.299, v144.300, v144.302, v144.303, and both new v144.304 scripts. These exercise shape validation, brown-on-brown correction, multiple background samples, bounded same-model retry, checkpoint-before-POST, old ID removal, queue continuation, storage interruption and uncertain submission handling. PostgreSQL SQL and PL/pgSQL parsing succeeded. Production Next.js build succeeded.

No paid live GPT Image/Shotstack generation or production SQL execution was performed during packaging. Validate a real animated post after installation. AI and provider success cannot be guaranteed, but failure no longer authorizes an automatic whole-generation restart.

Animation motion parameters are unchanged in this release.
