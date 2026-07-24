# Spreelo V134 — Calendar hero and localized today card

Built from V133.

## Visual changes
- New responsive campaign-calendar hero using the supplied desktop and mobile background artwork.
- Brand name is still loaded dynamically from the current brand profile.
- The first campaign in the visible default sort is expanded when the page opens on desktop, tablet and mobile.
- The month grid has been replaced with a localized today card.
- The today card uses the browser's local date/time zone and the selected Spreelo UI language through `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`.
- The selected campaign no longer receives a blue outline.
- The campaign workspace/list no longer has the gray background/separator treatment behind all rows.
- Expanded details use the same soft glass-card language as AI Content Studio.
- Tablet and mobile layouts have a clearer top-to-bottom flow; filters remain collapsed behind the existing toggle.

## Image assets
The supplied images are already included and optimized as WebP:
- `public/backgrounds/spreelo-calendar-hero-desktop.webp`
- `public/backgrounds/spreelo-calendar-hero-mobile.webp`

The example image for the date card is not used as a baked-in image because its weekday, date, month and year must remain dynamic and localized. The same look is recreated with CSS.

## Functional safety
- No AI calls were added.
- No campaign-planning API was added to campaign expansion.
- No credit logic changed.
- No campaign policy or product-format logic changed.
- No database migration or SQL is required.

## Checks run
- TypeScript JSX parse check passed for `app/calendar/page.jsx`.
- CSS parser check passed for the V134 stylesheet.
- V128 strategy-planner tests passed.
- V129 product-driven campaign tests passed.
- V129.1 direct campaign-policy tests passed.
