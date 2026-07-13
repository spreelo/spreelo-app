-- Shotstack animated product video support.
-- Run this once in the Supabase SQL Editor before deploying the matching app code.

alter table public.automation_rules
  add column if not exists animation_style text;

-- Existing databases may still restrict content_format to the older formats.
-- Recreate the checks so animated_video can be saved by the planner and cron.
alter table public.automation_rules
  drop constraint if exists automation_rules_content_format_check;

alter table public.automation_rules
  add constraint automation_rules_content_format_check
  check (content_format in ('single_image', 'carousel', 'slideshow_video', 'animated_video'));

alter table public.posts
  drop constraint if exists posts_content_format_check;

alter table public.posts
  add constraint posts_content_format_check
  check (content_format in ('single_image', 'carousel', 'slideshow_video', 'animated_video'));

alter table public.posts
  add column if not exists video_url text,
  add column if not exists video_storage_path text,
  add column if not exists video_status text not null default 'none',
  add column if not exists video_render_id text,
  add column if not exists video_provider text,
  add column if not exists video_duration_seconds integer,
  add column if not exists video_error text;

insert into storage.buckets (id, name, public)
values ('post-videos', 'post-videos', true)
on conflict (id) do update
set public = excluded.public;

-- Public playback is required because Shotstack, Facebook and Instagram need
-- a directly reachable video URL while rendering/publishing.
drop policy if exists "Public can view post videos" on storage.objects;
create policy "Public can view post videos"
on storage.objects
for select
to public
using (bucket_id = 'post-videos');
