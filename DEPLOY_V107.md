# Deploy V107 — unified plan activation and review design

## Included

- Redesigned the lower AI Content Studio area so **Löpande plan** and **Redo att aktivera din plan?** sit side by side on desktop and use the same light card system as the rest of the page.
- Kept the primary activation button in Spreelo's dark navy colour with a restrained orange hover accent.
- Updated the review/approval page to match AI Content Studio:
  - compact and consistent action buttons
  - outline-style save action and dark navy approval action
  - lighter cards, borders, shadows and spacing
  - desktop post preview with media and full caption side by side
  - correct social platform icon in the preview
  - AI Content Studio remains highlighted in the sidebar
- The review summary now localizes tone, language and post type instead of showing raw English values.
- Automated posts use the selected brand profile's content language as the display source, fixing cases where a Swedish brand showed `Friendly · English`.
- Added localized handling for the source label `Generated from website`.

## Database

No SQL migration is required.

## Deploy

Upload the project to GitHub/Vercel as usual. Existing environment variables remain unchanged.
