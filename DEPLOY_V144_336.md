# Spreelo v144.336 – Kling motion, admin format labels & mobile review

Starting point: user-provided `spreelo-144.335-admin-redesign(1).zip` (complete app).

## Changes
1. **Kling motion**: allow natural, verified-view product use (e.g. wearing a T-shirt, rolling a stroller forwards, holding a phone), but prohibit revealing a product surface absent from the authoritative original product photo. Product identity, visible print, components, light state and the number of product instances remain locked. Creativity and first-frame real-world scenes remain enabled. Added pre-submission guard that refuses explicit creative directives to orbit/turn/reveal an opposite or unverified surface or to introduce an extra product; uses a complete, safe, non-billed deterministic creative fallback instead. Existing finished-video identity audit remains in place.
2. **Kling retries**: a rejected clip's old unsafe creative direction is NOT blindly reused when the administrator retries; it is substituted before the next paid request.
3. **Admin review labels**: product AI videos with `video_provider=kling`, `content_type_id=ai_product_video`, or a Kling task identifier display as **AI-video**; Shotstack `animated_video` displays as **Animerad video**. Filtering/search and post details use the same display-only label. No database format or delivery semantics changed.
4. **Mobile review**: responsive single-column modal at widths <= 760px; inner review and metadata panels stack in reading order, action footer stays accessible, product URL controls/quality cards/text wrap without horizontal overflow, including 320px screens.

## Validation
- `node scripts/test-v144-329-kling-prompt-integrity.mjs`
- `node scripts/test-v144-334-kling-creative-protection.mjs` (updated to reflect restored natural motion)
- `node scripts/test-v144-336-kling-motion-admin-mobile.mjs`
- Headless Chromium DOM checks on mock review markup at viewport widths 320, 360, 390, 430, 760 and 1024 px: zero page overflow, responsive stacking.

No SQL migration needed. No change to saved `content_format` values. All old files/assets retained.

*Test in staging before production: show a verified T-shirt/stroller used naturally, check that a phone orbit attempt is vetoed, and verify post approval/review on an actual phone.*
