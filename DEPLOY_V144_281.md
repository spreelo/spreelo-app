# Spreelo v144.281 — Meta selection handoff

Fixes Facebook Page selection when Spreelo runs embedded in Shopify and another Spreelo browser session belongs to a different account/brand.

- Adds a short-lived HMAC-signed selection handoff bound to selection session, user and brand.
- Facebook picker uses the handoff instead of the ambient browser Supabase session when present.
- Existing bearer-token flow remains as fallback for normal Spreelo usage.
- No SQL required.
