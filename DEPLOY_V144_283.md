# v144.283 — Product image semantic variant false-positive fix

## What changed
- Prevents the semantic identity gate from treating explicit negative statements such as
  `No conflicting brand or product variant is visible` as a hard variant mismatch.
- Keeps fail-closed behavior for real colour/design/size/weight/volume/pack-count conflicts.
- Adds a regression test covering the exact false-positive wording observed in Shopify automation logs.

## Scope
- Product image semantic verification only.
- No SQL required.
- No changes to Shopify catalog sync, planning, Growth Agent, calendar, campaigns, billing, or social OAuth.
