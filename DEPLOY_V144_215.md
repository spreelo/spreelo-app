# Deploy Spreelo v144.215

## Database
No new Supabase SQL is required.

This release expects the migrations already deployed for:
- v144.212 Grow Brain brand learning
- v144.213 Grow Brain performance collection

## Deploy
1. Deploy the v144.215 zip to Vercel.
2. Open the new **Grow Brain** item in the Spreelo sidebar.
3. Verify that the currently selected brand is shown.
4. Existing Facebook, Instagram, YouTube, Pinterest and Threads performance data will appear automatically as the normal performance cron collects it.

## TikTok while video.list is under review
Leave `TIKTOK_ENABLE_PERFORMANCE_INSIGHTS` unset or set to `false` for now.

With that setting, TikTok OAuth requests only the currently approved publishing scopes, so TikTok can be connected for publishing without `video.list`.

When TikTok approves the `video.list` scope:
1. Add this Vercel environment variable:

   `TIKTOK_ENABLE_PERFORMANCE_INSIGHTS=true`

2. Redeploy/restart.
3. Reconnect the TikTok account once in **Social channels**.
4. Grow Brain will then collect TikTok post performance through the existing step-2 collector.

## Customer dashboard checks
Open `/grow-brain` and verify:
- 7 / 30 / 90 day buttons work.
- Channel filter changes the KPI/chart/top-content data.
- Channel cards distinguish connected/publishing status from analytics measurement status.
- TikTok can show analytics pending without being treated as a publishing failure.
- The approval/rejection learning box shows the current brand-learning state and signals.
- Top content opens the corresponding Spreelo post.
- Mobile layout remains readable.

## Optional database verification
```sql
select platform, count(*) as measured_posts, max(captured_at) as last_measurement
from post_performance_latest
group by platform
order by platform;
```

```sql
select platform, status, count(*) as rows
from post_performance_collection_state
group by platform, status
order by platform, status;
```
