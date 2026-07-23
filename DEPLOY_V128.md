# Spreelo V128 – Dynamic strategy planner

## What changed

### 1. Dynamic standard content plans

AI Content Studio now requests a strategy for the selected brand, goal and number of weekly posts instead of only taking the next formats from a fixed sequence.

The planner considers:

- the three approved goals: Sell more, Get more followers and Build trust
- business profile, industry, audience, language and market
- whether verified products or services are available
- recent successful content and recently used products
- active automation formats
- upcoming calendar opportunities
- format variety and safe generation requirements

The planner returns both the next weekly mix and a safe rotation pool. If the planning request fails, the existing deterministic fallback plan is kept, so the customer can still continue.

### 2. Rolling weekly selection

Weekly plans saved with variation enabled use `history_balanced` selection.

Before a recurring rule chooses its next format, the worker reviews approximately 12 weeks of successful format history for that brand. It strongly penalizes the most recently used formats, repeated formats in the same worker run and excessive product-format concentration for non-sales goals.

The selected format for the next run is locked together with its cycle before the next credit reservation is made. This prevents the dynamically selected format and the reserved credit cost from drifting apart.

### 3. Calendar campaigns use real formats

Campaign posts now resolve to actual Spreelo formats such as:

- Product post
- AI product ad
- Animated product Reel
- Product carousel
- Service in focus
- Problem → Solution
- Tips & advice
- FAQ
- Checklist
- Common mistakes
- Myth vs fact
- Mini-guide
- Seasonal post

`Egen idé` / `manual_prompt` is no longer used as an automatic campaign fallback. It remains available only when the customer deliberately creates a custom post.

Old cached campaign plans containing legacy modes such as `generic_campaign`, `mixed_campaign_and_website` or AI-image placeholder modes are replanned or safely mapped to an actual format.

### 4. Protected V127 product work

The working V127 product rendering and carousel product-search flow were not refactored. The V127 regression checks still pass, including:

- five text-free product slides
- individually matched backgrounds
- original-image fallback without reliable transparency
- unchanged sixth AI closing slide
- existing carousel product search, ranking and safeguards

## Database

No new SQL migration is required for V128.

## Validation performed

- Syntax checks for all changed API routes
- JSX parsing of `app/automation/page.jsx`
- Existing product-engine and campaign-search regression tests
- V127 clean-product-image regression test
- New V128 dynamic-planner regression test

Run the new check with:

```bash
npm run test:v128
```

A full Next.js production build was not run in the packaging environment because the project dependencies were not installed there.
