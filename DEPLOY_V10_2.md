# Spreelo v10.2 – campaign product-format fix

This update is based on the complete v10.1 stabilized version.

## What it fixes

- A confirmed product store no longer gets an all-AI-image campaign plan by mistake.
- `website_product` and `mixed_campaign_and_website` now become runnable `website_item` automations instead of `manual_prompt` automations.
- Product-driven campaigns with at least three posts receive one predictable website carousel in the discovery/consideration part of the sequence.
- Posts after the carousel use concrete website products when the store supports product posts.
- Existing saved campaign plans are normalized through the same policy when they are opened or returned by `/api/plan-campaign`.
- Brand-level product and carousel capability flags are passed into the campaign planner instead of being lost between the brand profile and campaign row.

## Expected six-post product campaign mix

1. Generic/AI campaign introduction
2. Generic/AI engagement post, unless the AI explicitly chose website support
3. Website product carousel
4. Website product post
5. Website product or campaign + website post
6. Website product post

The exact labels and marketing roles can vary, but a valid product store should no longer show six generic `Text + AI image` posts.

## Database

No new SQL migration is required beyond the v10/v10.1 tables already installed.

## Verification performed

- Campaign content policy tests: 5/5 passed
- Existing v10 resolver/fetch/capability tests: 17/17 passed
- Next.js production build: completed successfully with placeholder build-time environment variables
