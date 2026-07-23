# Spreelo V132 — Calendar design only

Base: `spreelo-app-main-130-unified-theme-core-pages`

## What changed

- Rebuilt the campaign calendar presentation to match the supplied campaign-calendar reference:
  - compact header and primary action
  - left rail with month calendar, filters and sorting
  - campaign rows with date, post count, credits and status
  - inline expanded campaign details
  - campaign information, angles and the existing locally calculated post-plan preview
  - responsive tablet and mobile layouts
- Reused the same glass surfaces, navy actions, radii, shadows and background system as AI Innehållsstudio.
- Added a local date filter to the mini calendar. Selecting a date only filters already loaded campaigns.

## Intentionally unchanged

- No OpenAI call was added.
- No call to `/api/plan-campaign` was added.
- No database schema or SQL change.
- No change to campaign analysis, campaign policy, product rules, credit rules or handoff to AI Innehållsstudio.
- No change to `post_plan` creation or persistence.
- The abandoned V131 automatic plan-on-open behaviour is not included.

## Verification

- JSX syntax parsed successfully with TypeScript (`allowJs`, JSX preserve).
- V128 dynamic strategy planner checks passed.
- V129 product-driven campaign checks passed.
- V129.1 direct campaign policy checks passed.
