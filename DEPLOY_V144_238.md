# Spreelo v144.238 — Shopify locale priority / first paint

## What changed
- Shopify App Store onboarding no longer forces the Shopify Admin UI locale into the onboarding URL.
- Existing explicit Spreelo language choices remain respected.
- Otherwise, a supported browser language is preferred for the Shopify onboarding experience.
- Shopify's verified installer locale remains a fallback when there is no supported browser or explicit Spreelo language.
- Non-English onboarding no longer flashes English source labels while persistent translations are loading.
- v144.237 Shopify analysis progress UI remains unchanged.

## Database
No SQL migration required.

## Test note
A previously analyzed test brand will correctly skip analysis. To retest the analysis/progress flow, reset only that test brand's analysis marker before reinstalling the app.
