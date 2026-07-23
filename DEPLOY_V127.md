# Deploy V127 – Clean product images and simplified content goals

## What changes

- Carousel slides 1–5 render as clean product images with no product name, price, label, text box, or slide copy beneath the image.
- The existing sixth AI-generated carousel closing image is preserved.
- Product post (`website_item`) uses the same safe image treatment: a matching uploaded background is used only for a verified transparent cutout; otherwise the original website image and background are preserved.
- Product ad with text and animated product Reel are unchanged.
- The visible planning goals are now: **Sell more**, **Get more followers**, and **Build trust**.
- Customer case/example, Local angle, Comparison, and Behind the scenes are retired from new selection and automatic planning.
- Existing saved content remains readable; the SQL marks the retired library rows inactive for current databases.

## Deliberately not changed

- Carousel product discovery, campaign search terms, Store Map/Web Search fallbacks, AI candidate ranking, five-product requirement, reuse protection, AI outro generation, and the 600-second automation limit.
- The fully dynamic weekly/calendar planning engine. That remains the next separate update after V127 is tested.

## Deploy

1. Replace the repository contents with this folder and deploy normally.
2. Run `supabase/content_format_library.sql` in Supabase SQL Editor to mark the four retired formats inactive in an existing database. The script remains idempotent.
3. Run the focused verification locally if desired:

```bash
pnpm test:v127
```

## Recommended test

Create one carousel and one Product post for a product site:

- carousel slides 1–5 must have no product label/text;
- carousel slide 6 must still be the existing AI closing image;
- a transparent product should receive a suitable library background;
- a non-transparent source should retain its original background;
- Product ad with text and product Reel should work as before;
- the studio should show only the three agreed goals and should not show the four retired formats.
