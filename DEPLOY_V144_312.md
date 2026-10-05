# v144.312 – Independent advertising copy for product animations

Deploy the complete project. No new SQL, environment variables or cron jobs are required. This release is based on the complete v144.311 package and retains its Creator welcome guide, initial draft fix and Kling video typography changes.

## Behavior

- Animation copy is planned before the transparent typography image. The planner sees the verified product, product title/description and social caption, and selects one complete, short advertising headline in the selected content language.
- Physical slogans stay on the original product. Complete or shortened quotations, rearrangements and near-identical wording are rejected locally where detected. The planner must select an independent advertising idea without unsupported product claims. The same flow supports products without physical text.
- The typography model renders only the locked headline. It is instructed not to copy the product print's lettering, font treatment or stacked layout. Independent typography remains tailored to the product's context, campaign, background and palette.
- A separate vision readback transcribes the generated lettering without receiving the expected headline. The result is compared with the locked text. Missing, added or altered words and accents, and unclear/clipped text, are rejected before Shotstack rendering.
- The existing maximum of two typography image attempts remains. Copy planning failure stops before the typography image request. No product-title substitute or copied-slogan fallback is used when validation fails.
- The selected headline and successful readback are included in the existing animation background-selection metadata. No database schema change is needed.

## Scope and cost

This changes product animations only. Music selection, sound endings, Kling videos, product retrieval/cutouts, publication schedules and credit prices remain unchanged. There is one additional small text/vision planning request and one small vision readback per image attempt, using the existing fast research model setting. Actual provider cost and latency depend on the configured model. No paid provider requests were made during local validation.

Existing rendered animations are not automatically rebuilt. Test one new animation with printed apparel and one with a product without printed wording after deployment. AI vision/transcription is probabilistic; local mocked tests validate the rejection and retry behavior, not a guarantee that every live OCR/copy error is detected.

## Validation

Production build and regression tests passed. Tests cover the reported omitted-middle-line slogan, product-title repetition, a new place-themed headline, text-free products, exact readback, preserved accents, missing/extra words, locked image prompt, bounded retry, copy rejection before image generation, transparent logo and existing Shotstack continuation without another submission.
