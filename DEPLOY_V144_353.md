# Spreelo 144.353 — Design-led video delivery candidate

**Release candidate, not a verified customer release.** Based on the full 144.352 project. No additional SQL or environment variables for these changes.

## What is actually changed

1. Advertising asset generation makes **one** GPT-image request for a scene/brand-directed, full-bleed **end-card background**. The two separate billable GPT-image typography requests have been replaced with exact-copy SVG lettering using the same AI design direction. This reduces provider text errors and cost; professional art direction still depends on the background brief and typography renderer.
2. Headline placement now considers **visible alpha bounds as a percentage of the actual 1080×1920 composition area's usable width**. It expands the real ink, not transparent image padding. It retains already-proportional imagery, and can build a local exact-word vector alternative. Diagnostic pixel height no longer creates an additional rejection gate.
3. The existing end-card compositor assembles the image-model background, product/model eyebrow when suitable, dominant headline, highlighted CTA, and authentic sender/logo into a **full master frame before the Shotstack render**. For Kling jobs this stage still occurs **after** Kling has supplied finished reference frames; moving the entire creative process before Kling is not part of this release.
4. The independent visual reviewer treats **too_small** or **low_contrast** as *creative feedback* rather than terminal failure **only if the deterministic typography preflight ran**. This applies to both preparatory and final rendered-video reviews, including resumed Shotstack jobs. `subject_overlap`, `stray_graphics`, `unfinished_end_card`, `other`, and physical-product integrity violations remain hard stops.
5. The AI image background has a locally generated brand-background fallback on API errors, with no second paid request. This is a delivery fallback, **not** a substitute for a tested advertising designer, and it may look simpler than a successful GPT-image output.
6. A source-preserving 7% compositing camera push improves activity without changing product identity. Kling's prompt now asks for two or three **clearly visible natural steps** when a real existing wearer and garment have passed identity and motion preflight. It remains restrained where only a product still is supported; no new surfaces/people/functions are authorized.
7. Existing notification, collection verification and retry mechanisms from 144.349–144.352 are retained. Previously `needs_repair`/failed jobs are **not automatically reopened** by merely deploying the ZIP. Rescue existing jobs separately, reusing their stored Kling/Shotstack files.

## Local test coverage

- `node scripts/test-v144-353-design-first-delivery.mjs` (one paid request mocked, vector copy, full end-card, proportional placement, reviewer advice versus hard stops, branded fallback, camera motion)
- `node scripts/test-v144-350-image-and-review.mjs`
- `node scripts/test-v144-351-end-card-hierarchy.mjs`
- `node scripts/test-v144-352-cta-prominence.mjs`
- `node scripts/test-v144-350-contract-and-motion.mjs`
- `node scripts/test-v144-349-production-recovery.mjs`
- `node scripts/test-v144-349-alerts.mjs`

A *complete* Next.js production build has **not** been run in the local environment because full npm dependencies are absent. External GPT-image, Kling, Supabase and Shotstack have **not** been exercised in an end-to-end test. The 99% delivery target is **not proven**.

## Deploy safely

1. Backup 144.352, install 144.353 as a staging/admin-only candidate, and run `npm ci` and `npm run build` in the actual deployment environment. On failed build, rollback; do not send customer jobs.
2. Generate one admin animation and one admin AI-video with real providers, ensure each completes with a professional final MP4, readable live-frame heading, well-balanced end card and genuine product identity. Check a finished Shotstack render is not failed for minor aesthetic feedback.
3. Verify failures with truly unsafe product changes still block, and both animation/AI video failure paths appear under Admin → Misslyckade and send correctly deduplicated admin email. The latter is improved in earlier versions but is not end-to-end proven here.
4. Check per-post cost and motion quality. If either format is worse, rollback immediately and preserve the existing provider task IDs.
