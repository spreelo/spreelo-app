-- Spreelo step83: Brand logo upload support
-- Run this once in Supabase SQL Editor before testing logo uploads.

alter table public.brand_profiles
add column if not exists logo_url text,
add column if not exists logo_storage_path text,
add column if not exists logo_enabled_by_default boolean not null default true;

-- Public bucket for brand assets that need to be visible in generated images,
-- approval previews and future carousel/video rendering.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  5242880,
  array['image/png', 'image/webp', 'image/jpeg', 'image/jpg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Let signed-in users read brand assets.
drop policy if exists "Brand assets are readable" on storage.objects;
create policy "Brand assets are readable"
on storage.objects
for select
to public
using (bucket_id = 'brand-assets');

-- Let signed-in users upload only under their own user folder:
-- brand-assets/logos/<auth.uid()>/<brand_id>/<file>
drop policy if exists "Users can upload own brand assets" on storage.objects;
create policy "Users can upload own brand assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = 'logos'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Let signed-in users update only their own uploaded brand assets.
drop policy if exists "Users can update own brand assets" on storage.objects;
create policy "Users can update own brand assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = 'logos'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = 'logos'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Let signed-in users delete only their own uploaded brand assets.
drop policy if exists "Users can delete own brand assets" on storage.objects;
create policy "Users can delete own brand assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = 'logos'
  and (storage.foldername(name))[2] = auth.uid()::text
);
