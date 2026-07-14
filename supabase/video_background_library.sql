-- Shared 9:16 video background library for animated product Reels.
-- Run once in Supabase SQL Editor before deploying the matching app code.

create extension if not exists pgcrypto;

create table if not exists public.video_background_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null unique,
  public_url text not null,
  poster_storage_path text,
  poster_url text,
  family text not null default 'abstract',
  moods text[] not null default '{}',
  industries text[] not null default '{}',
  campaigns text[] not null default '{}',
  colors text[] not null default '{}',
  brightness text not null default 'medium'
    check (brightness in ('light', 'medium', 'dark')),
  energy text not null default 'low'
    check (energy in ('low', 'medium', 'high')),
  season text not null default 'all',
  text_safe boolean not null default true,
  logo_safe boolean not null default true,
  crop_safe_916 boolean not null default true,
  active boolean not null default true,
  is_fallback boolean not null default false,
  priority integer not null default 0 check (priority between -100 and 100),
  notes text,
  duration_seconds numeric(8,3),
  width integer,
  height integer,
  fps numeric(8,3),
  times_used bigint not null default 0,
  last_used_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_background_assets_active_idx
  on public.video_background_assets (active, season, priority desc);

create index if not exists video_background_assets_family_idx
  on public.video_background_assets (family);

alter table public.video_background_assets enable row level security;

-- The admin API and automation cron use the Supabase service role.
-- No direct browser table writes are allowed.
drop policy if exists "Service role manages video backgrounds" on public.video_background_assets;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-backgrounds',
  'video-backgrounds',
  true,
  62914560,
  array['video/mp4', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Shotstack and the social networks need direct read access to the selected background.
drop policy if exists "Public can view video backgrounds" on storage.objects;
create policy "Public can view video backgrounds"
on storage.objects
for select
to public
using (bucket_id = 'video-backgrounds');

alter table public.posts
  add column if not exists video_background_asset_id uuid
    references public.video_background_assets(id) on delete set null,
  add column if not exists video_background_family text,
  add column if not exists video_background_selection jsonb;

create index if not exists posts_video_background_asset_idx
  on public.posts (video_background_asset_id, created_at desc);

comment on table public.video_background_assets is
  'Reusable 9:16 MP4 backgrounds selected by Spreelo for animated product Reels.';
