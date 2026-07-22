# Deploy V115 — Firefox review backdrop-root fix

## What changed
- Moved the **Granska och godkänn** decorative canvas from the outer `.content`
  element onto `.post-review-page` itself.
- The review page now uses the same stacking structure as AI Innehållsstudio:
  - isolated page root
  - background artwork in `::before` at `z-index: -1`
  - glass cards as normal descendants in the same backdrop root
- Removed the extra V114 content-layer pseudo-element and child `z-index` layer.
- Kept the original AI Innehållsstudio background file, aspect ratio, scaling and
  fade mask unchanged.
- Kept the existing responsive gutters and V111 glass-card values unchanged.

## Why
Firefox could render the outer background and the review cards in separate GPU
compositing layers during normal viewing. Firefox's built-in screenshot action
triggered a flattened repaint, which is why the transparency appeared correctly
only in that screenshot. Matching AI Innehållsstudio's actual backdrop-root
structure avoids that discrepancy.

## Deployment
- CSS-only update.
- No SQL changes.
