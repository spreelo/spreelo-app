# Spreelo 144.352 – End-card CTA visibility hotfix

Target: regression reported 2026-10-15, `LOCAL_TYPOGRAPHY_REPAIR_REJECTED` from end-card closing line `Upptäck nu` judged `too_small` in a preserved Kling film.

## Root cause

In 144.351, CTA lettering was measured against the much lower supporting-text 38px minimum, and the centered closing-line helper left a padded 930px-wide canvas. The subsequent resize did not meaningfully enlarge short visible lettering; both directed-repair variants could still render a weak end-card CTA. `repairReviewedAdvertising` then raised a terminal exception after two failed design checks, even though the Kling source was preserved.

## Focused correction

`lib/klingEndCard.js`: new `fitProminentEndCardCTA` trims transparent padding, measures actual visible glyph height, and upscales the existing AI artwork toward ~115px, bounded to 930px width / 290px height in the 1080x1920 end card. If impossible, it tries a local exact-letter SVG rendering and retains the better option. No extra GPT Image / Kling call, no additional rejection check, and no loosening of product-identity safeguards. Applied to both hierarchical 144.351 end card and legacy fallback, shared by animations and Kling.

## Local verification

- `node scripts/test-v144-352-cta-prominence.mjs` passed with `Upptäck nu` visible ink 117px on synthetic input; other short and long CTA cases tested.
- `node scripts/test-v144-351-end-card-hierarchy.mjs` passed.
- `node scripts/test-v144-350-image-and-review.mjs` passed.
- `node scripts/test-v144-350-contract-and-motion.mjs` passed.
- Node syntax checks passed for the changed module and both automation/finalizer routes.

## Release precautions

A full Next.js build, external Kling/GPT Image/Shotstack calls, full-quality video playback, actual customer-job recovery, and live mail/DB flows were NOT run in this sandbox. Treat as a candidate until one isolated AI-video and animation finalization actually produce acceptable MP4s. Existing failed task should be resumed with its saved Kling file; do not order a new paid video solely for CTA layout. No SQL or new environment variables needed.
