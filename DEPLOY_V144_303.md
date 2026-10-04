# v144.303 — AI-only animated typography

Animated product videos now require a validated GPT Image 2.5 Flare typography asset. The emergency SVG/plain text substitute and its validation bypass have been removed.

One corrective retry is allowed after an unusable image or provider failure. Both requests use the configured Flare model, medium quality, transparent PNG and the same visual references. The correction describes the rejected image and explicitly prohibits opaque cards, copied scenery and products. Authentication, invalid request, rate-limit and exhausted-credit errors stop without another request.

After at most two text-generation requests, failure propagates to the existing occurrence/admin failure path. It cannot trigger a reserve-product loop or the transient automation retry path. The post's image/video status is failed and it does not proceed to successful delivery without validated AI typography. No extra call occurs on first-attempt success; a corrective call may add provider cost. This policy cannot guarantee provider success.

Includes the complete v144.302 app and all earlier updates. No new SQL or environment variables required. This version does not change Shotstack timeout/resumption, product motion or frame-level contrast analysis.

Validation: v144.299 model/logo tests updated for AI-only failure policy; v144.300 layout and text placement tests, v144.302 background selection tests, v144.303 corrective retry and terminal failure tests; production build passed.
