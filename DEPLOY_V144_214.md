# Deploy Spreelo v144.214

## Database
No new Supabase SQL migration is required for v144.214. It reuses the Grow Brain performance tables created by `spreelo-v144.213-SQL.sql`.

## Deploy
1. Deploy the v144.214 zip to Vercel.
2. Reconnect the test Threads account once after deployment so the token is issued with `threads_manage_insights`.
3. Existing Facebook, Instagram, TikTok, YouTube and Pinterest performance collection continues unchanged.
4. Existing Threads publishing remains unchanged.

## Test Threads collection
Publish a new post to Threads after reconnect, or use an existing Spreelo Threads post whose `publish_receipts.threads.thread_id` exists. Let `/api/cron/collect-post-performance` run, or invoke the cron with the normal CRON_SECRET authorization.

Then verify:

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
where platform = 'threads'
order by updated_at desc
limit 20;
```

```sql
select
  platform,
  post_id,
  views,
  likes,
  comments,
  shares,
  engagements,
  provider_payload,
  captured_at
from post_performance_latest
where platform = 'threads'
order by captured_at desc
limit 20;
```

Expected result: `status = healthy` after a successful collection. If the old Threads token was not reconnected, `scope_missing` is expected and does not affect publishing.
