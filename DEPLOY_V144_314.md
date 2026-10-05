# Spreelo v144.314 – advertising endings and persistent music deletion

Complete package based on v144.313. No SQL migrations, new environment variables or additional image-generation requests are required.

## AI-video finish

The existing Kling generation, product verification, motion, prompts, submission and scene trimming remain unchanged. Only final advertising artwork and composition change.

A single existing GPT-Image 2.5 Flare request produces a fixed 1536 × 1024 atlas: a 576 × 1024 vertical end card on the left and transparent headline artwork on the right. These are cropped independently. The end-card direction uses the business profile, original video frames, product and campaign; backgrounds and closing wording vary with that context. No website address or clickable-looking button is included.

The end card dissolves over the moving video for 0.3 seconds and remains for 1.3 seconds after motion ends. A frozen product frame is no longer used. An available original company logo appears in the fixed animation-style position throughout the motion, even when an older post has include_logo:false, and is composited centrally into the end card. Without a logo, the end card uses the company name. The logo is never AI-generated. Existing cached artwork or a failed single image attempt uses a deterministic end card without another paid request.

Music uses the last segment of its source, aligned to the final delivered duration including the end card. Tracks shorter than that duration remain ineligible. Existing completed videos and already-submitted composition jobs are not rebuilt; generate a new AI-video post to review the result after deployment.

## Music deletion

DELETE now saves an independent persistent marker at catalog/deleted/{trackId}.json in the existing video-music bucket before updating the shared catalog. Both the admin list and video music selection exclude these IDs. Concurrent removals and stale catalog writes cannot restore them. Repeating a successful deletion returns success. Corrupt catalogs and temporary read failures no longer reset the catalog to bundled defaults. The admin delete control is disabled while its request is pending.

Uploaded audio is also removed from storage where possible, as before; if storage cleanup fails, the marker still permanently removes the track from the library and new video selection. Previously deleted tracks that have already returned must be deleted again after deployment because historical removal intent was not persisted.

## Email

The plan activation email uses the existing light Spreelo logo asset on its dark background.

## Validation

Production build passed. Regression tests passed for single image submission/cache and fallback backoff; initial AI Creator planning; animation copy; headline layout and authentic logo placement. New tests exercise atlas crops/transparency, logo composition, no-logo branding, end-card timing and track layering, audio end alignment, concurrent real DELETE handlers, stale catalog writes, idempotent deletion, failed catalog compaction, and corrupt/unavailable catalog handling. Provider image output and actual Shotstack rendering require a fresh end-to-end generation in the deployed environment; no paid provider requests were submitted during verification.
