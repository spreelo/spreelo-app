# Deploy V114 — exact AI Innehållsstudio canvas on review page

## What changed
- Removed the incorrect review background implementation from V112.
- Verified the actual AI Innehållsstudio source of truth in the active CSS:
  - `spreelo-background-v97.png`
  - original `1672 / 941` aspect ratio
  - `100% 100%` image sizing
  - the same bottom fade mask
- Applied that exact canvas to the full review content area.
- Disabled the older review-only SVG/viewport/full-height background layers.
- Kept the existing shared glass-card values and ensured no solid fallback fill covers them.

## Important
- The AI Innehållsstudio page itself is not changed.
- Product retrieval changes from V113 are preserved.
- CSS-only update. No SQL changes are required.
