# Spreelo v144.191 — Variant 5 onboarding

## Deploy
1. Deploy this complete package as the next app version.
2. No SQL is required for v144.191.
3. Open AI Content Studio with an account/brand that still qualifies for first-run onboarding.

## What changed
- Rebuilt the first-run popup to follow the approved Variant 5 design.
- Added a prominent “ready-made starter plan” confirmation.
- Added a real preview of the first planned posts using the current plan slots/dates/content types.
- Added social-channel icons plus a `+` control that opens `/social-channels` so more channels can be connected.
- Removed the meaningless mobile chevrons.
- Widened the mobile modal and moved it to a React portal so app headers cannot cover it.
- Made the primary CTA white text/icon on coral.
- Added explicit one-time onboarding copy.
- Kept all new UI copy on the normal canonical-English i18n system.

## Changing the five example images later
Replace the files in:

`public/onboarding-preview/`

with the same filenames (`post-1.png` … `post-5.png`). See the README in that folder.

## Database
No migration / SQL file is added in v144.191.
