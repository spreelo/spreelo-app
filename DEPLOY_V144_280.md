# v144.280 — Embedded social OAuth + brand reanalysis UI

## Changes
- Social OAuth POST starts for Facebook, Instagram, Threads, TikTok, YouTube and Pinterest now return a same-origin first-party bootstrap URL.
- The popup visits `app.spreelo.com` first, stores the existing signed OAuth `state` cookie as a first-party cookie, validates the provider redirect host, then redirects to the social provider.
- Callback signature/state verification remains unchanged.
- Restored manual brand reanalysis action in the read-only Brand Profile hero. It reuses the existing `analyzeBrand()` flow and therefore the existing cooldown/daily/monthly backend limits.
- Aligned the “placement example” preview card with the other Brand Profile cards.

## Database
No SQL changes required.

## Regression notes
Current social/Shopify checks passed for Threads OAuth, TikTok integration, social reconnect, social-channel regression, OAuth diagnostics, trial non-blocking, connection preservation, v144.279 Shopify hardening, and v144.280 checks.
