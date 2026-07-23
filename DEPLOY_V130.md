# Deploy V130 — unified theme foundation and core pages

## Scope
This version starts the staged migration of Spreelo's customer-facing pages to the design system used by AI Innehållsstudio.

### Shared design foundation
- Added reusable CSS variables for the active AI Innehållsstudio canvas, glass fills, borders, shadows, blur, radii, colours and responsive gutters.
- Kept AI Innehållsstudio itself unchanged; it remains the visual source of truth.

### Home
- Added the same decorative Spreelo canvas.
- Rebuilt stat cards, main cards, sidebar cards, inner rows and actions around the same glass hierarchy.
- Added the dark navy primary CTA treatment used by the activation flow.
- Improved tablet and mobile layouts without changing dashboard behaviour.

### AI Calendar
- Added the same decorative canvas and responsive page gutters.
- Updated statistic tiles, campaign list, selected campaign panel, filters and action buttons to the shared glass system.
- Removed the older edge-to-edge detail-rail appearance in favour of a cohesive card layout.
- Added stable tablet and mobile stacking.

### Review and approve
- Retained the V114 canvas implementation.
- Consolidated the review card surfaces against the same shared glass tokens used by the core pages and AI Innehållsstudio.
- No changes to approval, editing, scheduling or publishing logic.

## Safety
- CSS-only update.
- No SQL changes.
- No changes to campaign policy, product retrieval, automation logic or API routes.
