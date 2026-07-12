# Spreelo v10.6 - stable carousel delivery restored

This release is based on the exact v10.5 desktop zip and a file-by-file
comparison with the last known working archive:

`spreelo-app-main-62-query-discovery-fresh-first-delivery-v2.zip`

## Confirmed regression

The working version routed every carousel through
`prepareCarouselProductsForRule()`. Later versions routed campaign carousels
through a separate `prepareCampaignCarouselProductsV10()` implementation.
That experimental resolver did not preserve the working resolver's complete
delivery ladder and repeatedly reached a zero-product terminal error.

Several bounded discovery limits had also been reduced:

- product verification: 120 -> 24
- product-page fetches: 18 -> 10
- store-search fetches: 14 -> 8
- store-search verification: 18 -> 12
- campaign queries: 12 -> 6
- discovery verification: 25 -> 16
- web-search candidates: 24 -> 16

## Production behavior in v10.6

- All carousel rules use the proven stable delivery ladder again.
- The working discovery limits are restored.
- Exact campaign matches remain first priority.
- When fewer than five exact matches exist, the ladder progressively uses the
  next-best verified products.
- Used products rotate behind fresh products and can be reused only after the
  available pool has been cycled.
- The v10.5 evidence-preservation fix remains active.
- Robust website fetching and the v10.4 structured campaign-format policy
  remain active.

## OpenAI model split

- Bounded rescue product research: `gpt-5.5` (the proven working default).
- Fast/bulk product scoring: `gpt-5.6-luna`.
- Other v10.5 OpenAI 5.6 model choices remain unchanged.

This keeps Luna on high-volume scoring while reserving the stronger model for
the limited rescue path that runs only when local/store/catalog discovery is
insufficient.

## Database

No schema migration is required.

Rules disabled by earlier `No verified product...` failures are not reactivated
automatically. Reactivate only the rules you intentionally want to run.
