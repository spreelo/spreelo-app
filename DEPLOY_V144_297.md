# Spreelo v144.297 — email fallback and AI failure reporting

## Changes

- Transactional email translations now fall back to stored labels and then canonical English if translation or translation-pack access fails. Missing common labels also fall back when requested with the email namespace. English fallback is not saved as a completed translated pack. Existing interpolation and user locale selection remain in use.
- OpenAI health now combines the existing authentication check with observations from real planning, email translation and final product-image verification requests. A successful models endpoint alone does not prove that generation credits are available. Without a recent successful observed request, the admin shows “Not verified”. A recorded failure remains visible until a successful observed request confirms recovery. Successful verification expires after 24 hours.
- Quota exhaustion, rate limits and provider outages during final product-image verification are classified as AI service failures. Unverified images remain blocked; unavailable verification is not reported as a rejected product image. Previously verified images continue to reuse their check.
- Six new admin labels have English source text and translation keys. The browser translation cache version is v29.
- Corrected an obsolete test that expected email locale selection inside a Stripe webhook which no longer sends email. Locale checks remain on the actual email senders.

## Deployment

Deploy the full ZIP, or apply all files from the update ZIP to v144.296 and deploy.
No new SQL or environment variables are required. Runtime observations use the existing system_health_status table from v144.156. If that table is absent or unavailable, optional observations fail safely and generation health remains unverified.

This release does not add paid AI health probes or repeat image verification. Observations add database writes, with successful writes throttled to once per minute per running process; failures and subsequent recovery are recorded immediately.

The release cannot replenish an exhausted OpenAI API balance. Credits or quota must be restored in the provider account before content generation can work again. It also cannot guarantee email delivery if the email provider itself fails.

## Validation

Next.js production build passed with dummy build credentials. Ten local regression scripts passed: v144.111, .157, .183, .256, .263, .269, .277, .294, .296 and the new .297 runtime regression.

The new regression exercises cached/English email fallback, non-email failure propagation, telemetry failure isolation, success throttling and recovery, models-authentication versus runtime health, expired observations, no paid health probes, quota handling in product-image verification, and reuse of verified images. Tests used mocks and did not send emails or make paid AI calls.

Production deployment, database permissions, live provider credits and end-to-end social publishing were not verified by these local checks.
