# v144.282 — Social unlock live refresh

No SQL required.

## Change
- Social Channels dispatches the current connected-channel count after each connection refresh.
- AppLayout consumes that event for the current brand and updates the AI Content Studio / AI Calendar gate immediately.
- Works for both normal Spreelo and Shopify embedded because both use the same AppLayout and Social Channels page.
- Disconnect also re-locks the gated modules immediately when the final connected channel is removed.

No publishing, OAuth, planning, calendar, billing, Shopify product, or Growth Agent logic was changed.
