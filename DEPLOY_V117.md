# Spreelo v117 – Progressive Store Map Campaign Pool

## Purpose

This release fixes the verified cause of the Girlfriends Day carousel failure:
Store Map found real products on the exact campaign shelf, but stopped after a
small technical sample before it knew how many products would survive campaign
fit and no-reuse filters.

## Changes

- The first Store Map campaign shelf now builds an initial pool of up to 20
  deeply verified products instead of stopping at 8.
- Category discovery keeps up to 180 ranked product candidates, so large
  category pages are not truncated at 40.
- If fewer than 8 fresh campaign-safe products remain, Store Map continues in
  batches of 12.
- Expansion checks the same best shelf again before moving to the next ranked
  shelf.
- Previously verified URLs are excluded from later batches.
- Each expansion batch is technically verified and campaign-scored before the
  delivery pool is recalculated.
- Existing v116 candidate decision diagnostics remain enabled.
- Product preparation failures are one-shot: the rule is stopped, reserved
  credit is released, the run is marked `failed`, and no automatic product
  retry is scheduled.

## Expected production logs

A successful campaign should normally show:

- `Store Map Product Agent reached initial technical pool target`
- `Store Map campaign delivery pool finalized`
- `Store Map campaign candidate decisions saved`
- `Store Map early exit locked carousel products`

If additional products are needed, one or more of these will appear first:

- `Store Map campaign pool expansion round finished`

## Database

No SQL migration is required.
