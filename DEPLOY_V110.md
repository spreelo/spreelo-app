# Deploy V110 — responsive gutters, full-width canvas and unified review cards

## Included updates
- Preserves all V109 Store Map/Product Agent work.
- Adds fluid horizontal spacing around cards on mobile, tablet and desktop instead of only below the mobile breakpoint.
- Makes the decorative AI Content Studio and Review backgrounds truly viewport-wide, including ultrawide screens.
- Gives the relevant content area the same light base colour as the artwork so the old beige/yellow shell can never show through at the sides.
- Rebuilds the Review/Approval outer card surfaces with the **exact same CSS values** used by AI Content Studio:
  - translucent gradient background
  - white translucent border
  - matching multi-layer shadow
  - identical blur and saturation
  - identical inset highlight
- Gives the three review metadata tiles the exact same surface recipe as the smaller AI Content Studio settings tiles.

## Technical notes
- CSS-only visual update.
- No SQL changes.
- No product-agent or Store Map logic changed.
