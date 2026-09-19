# Deploy Spreelo v144.213

1. Run `spreelo-v144.213-SQL.sql` in Supabase SQL Editor.
2. Deploy the v144.213 zip to Vercel.
3. Confirm Vercel has the existing `CRON_SECRET`, Supabase service-role env, and social provider env values.
4. For full new analytics permissions, reconnect the test Instagram and TikTok accounts after deploy. Publishing remains independent of Grow Brain collection.
5. Publish at least one new Facebook/Instagram post after v144.213 so its native id is stored in `publish_receipts`. Existing YouTube/Pinterest/TikTok receipts can be discovered automatically when they contain native ids.

## Verification SQL

```sql
select
  platform,
  status,
  external_post_id,
  last_attempt_at,
  last_success_at,
  next_collect_at,
  consecutive_failures,
  last_error
from post_performance_collection_state
order by updated_at desc
limit 50;
```

```sql
select
  platform,
  post_id,
  content_type_id,
  content_format,
  age_hours,
  views,
  reach,
  impressions,
  likes,
  comments,
  shares,
  saves,
  clicks,
  engagements,
  captured_at
from post_performance_latest
order by captured_at desc
limit 50;
```

```sql
select
  platform,
  post_id,
  count(*) as snapshots,
  min(captured_at) as first_snapshot,
  max(captured_at) as latest_snapshot
from post_performance_snapshots
group by platform, post_id
order by latest_snapshot desc
limit 50;
```

Expected behavior: unavailable provider metrics remain NULL, not 0. A `scope_missing` state is diagnostic and must not affect normal publishing.
