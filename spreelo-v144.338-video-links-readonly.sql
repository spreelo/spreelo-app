-- Read only. No update, generation, credit debit or new render.
-- The two actual post/task IDs identified in the supplied log export.
select
  id,
  kling_task_id,
  video_background_selection->>'verified_product_title' as produkt,
  coalesce(
    video_background_selection->>'kling_source_storage_url',
    video_background_selection->>'kling_source_url',
    video_url
  ) as videolank,
  kling_reference_image_url as startbild,
  video_background_selection->>'verified_product_image_url' as originalbild,
  video_background_selection->'reference_safety'->'verifiedViewLock' as kameravy,
  video_status,
  video_error
from public.posts
where id in (
  '7ceab768-460d-455c-bdd1-11f863b8ed9d',
  '95276a8c-8d2f-44b8-b702-92cec919f340'
);
