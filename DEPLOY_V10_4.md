# Spreelo v10.4 - structured campaign product intent

This release replaces the overly broad v10.3 campaign rule.

## What is fixed

Website product formats now require two independent gates:

1. The brand profile must explicitly allow the requested website format.
2. The campaign or individual post must contain structured product intent.

Structured intent comes from fields such as product/support strategy, a
commercial campaign category, paired product match/search metadata, concrete
product guidance, or an explicit website product source selected for a post.
No Swedish or English title-keyword list is used.

Stale `website_content_fit=weak` or `website_content_strategy=none` no longer
blocks a campaign that has stronger structured product evidence. At the same
time, store capability alone no longer turns a pure awareness/information
campaign into a product carousel.

The fallback campaign planner also checks the same two gates. If OpenAI does
not return a usable plan, a non-commercial awareness campaign receives generic
formats instead of the old unconditional website carousel/product template.

## Expected four-post product campaign

- Generic campaign / AI image
- Website product carousel
- Website product
- Website product

Explicit carousel and single-product capability flags are still respected. A
service strategy cannot be overridden by an accidental product source mode.

## Files changed since v10.2

- `app/automation/page.jsx`
- `app/api/plan-campaign/route.js`
- `lib/campaignContentPolicy.js`
- `lib/campaignContentPolicy.test.js`
- `DEPLOY_V10_3.md` (historical notes)
- `DEPLOY_V10_4.md`

## Database

No new SQL or Supabase migration is required.

## Verification

The policy test matrix covers:

- stale weak/none metadata with clear product intent,
- a non-commercial awareness campaign for a verified store,
- a commercial category in a non-English language,
- single-product-only capability,
- disabled product capability,
- service campaigns,
- carousel placement and late product slots,
- runnable automation content-type mappings.

After deployment, create or regenerate the campaign plan so its saved
`post_plan` is resolved with the v10.4 policy.
