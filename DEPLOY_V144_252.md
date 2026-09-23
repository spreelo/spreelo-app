# Deploy Spreelo v144.252

1. Deploy the v144.252 ZIP normally.
2. No SQL migration is required.
3. Open AI Content Studio for a verified product store and select an automatic plan goal.
4. The old pre-verification local plan cache will no longer match. Spreelo will immediately build the capability-aware fallback mix and request/cache a fresh server recommendation using the existing adaptive planner.

## Scope

This release changes only the local AI Content Studio recommendation-cache identity. It does not alter Grow Brain, content weights, publishing times, Shopify sync, Product Engine or automation execution.
