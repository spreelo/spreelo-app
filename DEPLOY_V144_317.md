# v144.317 — Grow Brain layout

Complete package based on v144.316, including all previous fixes.

Grow Brain now follows the approved third design with the app's existing page margins, a full-width performance chart, two learning panels below it, six aligned channel rows, and the existing content and data coverage panels. White surfaces, orange heading icons and restrained lavender accents match the rest of the app. Responsive layouts adapt to desktop, tablet, mobile and embedded content widths.

All existing queries, calculations, learning logic, button handlers, translation keys, dialogs and admin demo controls are retained. The existing company/app logo and brain artwork remain in use. No database migration, environment variable or new production dependency is required.

## Deployment

Deploy the complete project using the existing deployment process. No SQL is needed.

## Validation

- Production build completed successfully.
- Existing Grow Brain dashboard, audience learning and website connection checks passed.
- v144.316 product intent regression checks passed.
- Actual page JSX and full CSS were rendered with isolated fixture data at 1920, 1440, 1280, 1024, 834, 768, 390 and 320 pixel widths. Checks cover margins, overflow, six metrics and channels, chart placement and learning card arrangement.
- Early and established learning states, top content links and website connection dialog states were checked. This fixture test does not access live customer accounts.
- Source comparison confirms unchanged business logic, translation references and interactive handlers relative to v144.316.

The layout check is scripts/test-v144-317-grow-brain-layout.cjs. It uses the project's existing browser dependencies; GROW_BRAIN_QA_CHROMIUM can supply a local Chromium executable and GROW_BRAIN_QA_OUTPUT an optional screenshot directory.
