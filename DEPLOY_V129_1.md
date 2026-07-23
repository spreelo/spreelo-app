# Deploy V129.1 – Direct calendar campaign policy fix

## What was wrong

Calendar opportunities created by the faster brand analysis normally do not contain a saved detailed `post_plan`. When the customer opened one of those opportunities, AI Content Studio built the visible slots directly in `buildDirectCalendarCampaignSlots`.

V129 enforced the product-driven campaign policy in `/api/plan-campaign`, but this direct browser-side path did not call that route. A new analysis could therefore still show two website carousels and too few product formats.

## Fix

- Added `lib/calendarCampaignPolicy.js`, a small pure policy layer for the direct calendar path.
- `buildDirectCalendarCampaignSlots` now creates its candidate post plan first, applies the V129 policy, and only then creates visible slots, labels, prompts and formats.
- Store/ecommerce campaigns now enforce before display:
  - normally 65–80% product formats
  - at least one AI product ad
  - at most one website carousel
  - animated Reel only when campaign/product signals support it
  - relevant supporting formats remain in the plan
- A duplicate carousel is converted to a normal website product post rather than being shown as a second carousel.
- No new company analysis is required after deployment. Reopen/reload the campaign from the calendar so the visible plan is rebuilt.

## Safety

- No database migration is required.
- Carousel search, selection, SVG rendering, product slide rendering and AI closing image rendering were not changed.
- `app/api/cron/run-automations/route.js` is byte-for-byte identical to V129.
- The existing protection that prevents `Egen idé` from being selected automatically remains unchanged.

## Verification

Run:

```bash
npm run test:v127
npm run test:v128
npm run test:v129
npm run test:v129-1
npm run test:product-engine-v2
npm run test:store-map-agent
npm run test:polite-retrieval
npm run test:store-map-early-exit
npm run test:candidate-diagnostics
npm run test:store-map-progressive-pool
npm run test:campaign-search-optimization
```

The V129.1 regression test includes the exact failing seven-post mix:

- Seasonal
- Tips
- Website carousel
- Website carousel
- FAQ
- AI product ad
- Animated product Reel

Expected corrected result: five product formats, one carousel, at least one AI product ad, and retained supporting content.
