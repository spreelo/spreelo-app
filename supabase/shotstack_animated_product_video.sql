-- Shotstack animated product video support.
-- Run this once in the Supabase SQL Editor before deploying the matching app code.

alter table public.automation_rules
  add column if not exists animation_style text;

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
