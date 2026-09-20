# Deploy Spreelo v144.225 — Grow Brain step 3A

## 1. Run SQL first
Run the full contents of:

`spreelo-v144.225-SQL.sql`

in the Supabase SQL Editor before deploying the app.

It creates:
- `brand_performance_insights`
- `brand_performance_learning_state`

Customers have authenticated SELECT access only. Writes remain server/service-role controlled.

## 2. Deploy the zip normally
No new environment variables are required.

Vercel gets a new cron:

`/api/cron/analyze-brand-performance` — every 15 minutes.

The cron discovers brands with collected performance data and rebuilds due learning profiles. New performance captures make the corresponding brand due again.

## 3. Verify after the cron has run
Use these read-only checks in Supabase:

```sql
select
  brand_profile_id,
  learning_state,
  source_post_count,
  eligible_post_count,
  insight_count,
  status,
  last_analyzed_at,
  next_analysis_at,
  last_error
from brand_performance_learning_state
order by updated_at desc;
```

```sql
select
  brand_profile_id,
  dimension_type,
  platform,
  dimension_key,
  observation_count,
  performance_score,
  confidence,
  signal,
  relative_engagement,
  relative_exposure,
  relative_click,
  relative_share,
  updated_at
from brand_performance_insights
order by brand_profile_id, abs(performance_score) desc;
```

## Important
No content plan is changed by this release. That remains intentionally disabled until Grow Brain step 4.
