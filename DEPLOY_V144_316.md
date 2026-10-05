# Spreelo v144.316 – product intent separated from creation instructions

Complete package based on v144.315. No SQL migrations, environment changes, new dependencies or extra image/video generation requests.

## Change

Default website-post prompts are now shared between the creator, admin tests and product-intent resolver. They are removed as creation instructions before intent interpretation. Rendering instructions (`image_prompt`) are excluded from free-text product-intent inference.

Raw prompt n-gram inference has been removed. Only explicit structured product metadata is used as deterministic search vocabulary. Actual customer requests are interpreted semantically by the existing intent AI step. An empty interpretation adds no product filter or generic intent sentence. If interpretation of a custom request fails, explicit product metadata remains available as fallback; without it, the run stops with a retryable custom-intent error rather than selecting an unrelated product.

Calendar theme contracts, curated carousel vocabulary and explicit product search fields retain their existing flow. Current standard templates require no product-intent AI call. Single-image posts, text ads, animation and AI video use the shared resolver; carousel creation instructions likewise have shared defaults and retain their existing campaign selection path.

Product identity, purchase availability, previous-use safeguards, image verification, Kling creation, animation typography, end-card design, music deletion and popup behavior are unchanged. All v144.315 changes are included.

## Validation

- Exact failed animation prompt: no inferred product search terms and no artificial product-intent restriction.
- All five creator and all five admin default website formats: no inferred intent and no intent AI request.
- Customer request appended to standard text: semantic product terms retained; rendering prose excluded.
- New creation-only prose, empty AI output, failed interpretation, explicit metadata and calendar scope covered.
- Animation copy, v315 art direction and campaign marketing curation regression tests passed.
- Production build passed with placeholder credentials; no paid generation or live database changes.

## Failed run

The reproduced `that that exact` search-word bug is removed. The supplied catalog export contains unused available products, but a complete historical rerun has not been performed. This verifies removal of this selection failure cause; it does not guarantee that downstream image generation would have succeeded.
