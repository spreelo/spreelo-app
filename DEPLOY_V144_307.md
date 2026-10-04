# Spreelo v144.307 — uniform product zoom

All animated product shapes now use a 6.5% zoom over five seconds, including
wide and tall products. Product placement and initial size are unchanged from v144.306. Only zoom
strength changes; the source image, layout boxes and text/logo placement remain
identical.

The v144.306 seven-second timeline remains: five seconds of motion, followed by
a two-second closing hold with product, lettering and logo visible and music
fading out. Existing render jobs are resumed without a new submission and retain
their original motion.

Deploy the full app. No new SQL is required; the v144.304/305 migrations must
already be installed. No extra AI requests or extra render duration relative to
v144.306. Shared renderer callers, including calendar, Shopify-sourced products
and admin regeneration, receive the same motion for new renders.

Validation: wide, tall, balanced and extreme aspect-ratio layout bounds; product
and text separation at full zoom; generated GSAP and seven-second timing;
continuation and delivery regressions; production build. No paid live render
was created during verification.
