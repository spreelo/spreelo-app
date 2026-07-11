# CSS refactor report

This update keeps the existing cascade order but splits the former `app/globals.css` into smaller ordered files under `app/styles/`.

## What changed

- `app/globals.css` is now only the ordered CSS entrypoint with `@import` statements.
- The old global CSS was split into six files:
  - `app/styles/01-foundation.css`
  - `app/styles/02-campaign-calendar.css`
  - `app/styles/03-planner-builder.css`
  - `app/styles/04-theme-shell-brand.css`
  - `app/styles/05-carousel-campaign-danger.css`
  - `app/styles/06-premium-workspace.css`
- Removed safe non-functional CSS comments.
- Removed exact duplicate top-level CSS blocks where a later identical copy already existed.
- Preserved cascade order so later override layers still win.

## What was intentionally not removed

Potentially unused selectors were not deleted when they could be dynamic, state-based, or only visible in certain UI states. Examples: status classes, modal states, mobile-only controls, generated variants, and historical planner/dashboard states.

## Validation performed

- Verified all imported CSS files exist.
- Verified CSS brace balance for all CSS files.
- Parsed all CSS files with `tinycss2`; no parse errors found.

A full `next build` could not be run in the sandbox because dependencies/node_modules are not included in the uploaded zip.
