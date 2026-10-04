# Spreelo v144.306 — animated Reel closing hold

Deploy the complete app. No new SQL migration is required for this release.
The v144.304 and v144.305 migrations must already be installed.

New animated product Reels have five seconds of motion followed by a two-second
closing hold. The same product, AI lettering and logo stay visible for the full
seven seconds. Product motion finishes at five seconds. The background switches
to a frame sampled near the end of the five-second background segment; the
existing background poster is used if video sampling is unavailable. This reuses
the existing three-frame sampling pass and does not add an AI request.

Music selection now requests seven seconds and the audio fades out at the end.
Stored duration and platform duration checks use the full seven seconds.
All callers of the shared animated renderer receive the change, including
calendar automation and admin regeneration. Shopify-sourced products use the
same renderer.

Existing renders retain their original duration when resumed. This release
never submits an existing job again merely to extend it. Kling advertising
videos are unchanged.

The longer output can increase Shotstack rendering usage; AI generation calls
are unchanged. No customer-credit price was changed in this release.

Validation: timeline/GSAP timing tests for wide, tall and balanced products;
regressions for AI typography, contrast, background selection, saved-job
continuation and customer/admin delivery; production build. No paid provider
render was submitted during verification. Confirm the actual seven-second
playback and ending on the next new animated Reel after deployment.
