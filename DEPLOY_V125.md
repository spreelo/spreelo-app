# Spreelo v125 – Sharp fontfile label fix

This update fixes the carousel product label text on Vercel without relying on system-installed fonts or Fontconfig.

## Changes

- Adds `@fontsource/inter` as a production dependency.
- Uses Sharp's `text.fontfile` rendering for PREMIUM, product title and price text.
- Keeps the translucent glass label, product placement, per-product background matching and AI closing image unchanged.
- Traces the required Inter WOFF file into the automation function bundle.
- Fails explicitly with `CAROUSEL_LABEL_FONT_UNAVAILABLE` rather than publishing unreadable missing-glyph boxes.
- Adds a production log entry: `Carousel label text rendered with packaged font`.

## Deployment

No SQL or Supabase changes are required. Deploy the ZIP as usual and run a new carousel. Previously rendered images are not rebuilt automatically.
