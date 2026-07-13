-- Spreelo: customer-uploaded image support for Custom post.
-- Run this once in Supabase SQL Editor before deploying the matching app update.

alter table public.automation_rules
  add column if not exists image_source text,
  add column if not exists uploaded_image_url text,
  add column if not exists uploaded_image_storage_path text,
  add column if not exists uploaded_image_name text;

comment on column public.automation_rules.image_source is
  'Planned visual source: ai, website, website_carousel, uploaded or none.';
comment on column public.automation_rules.uploaded_image_url is
  'Public URL for a customer-uploaded image used by a Custom post.';
comment on column public.automation_rules.uploaded_image_storage_path is
  'Storage path in post-images for a customer-uploaded Custom post image.';
comment on column public.automation_rules.uploaded_image_name is
  'Original customer file name for display in the planner.';

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update
set public = true;

-- Files are stored as:
-- post-images/manual-posts/<auth.uid()>/<brand_id>/<file>

drop policy if exists "Manual post images are publicly readable" on storage.objects;
create policy "Manual post images are publicly readable"
on storage.objects for select
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = 'manual-posts'
);

drop policy if exists "Users can upload own manual post images" on storage.objects;
create policy "Users can upload own manual post images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = 'manual-posts'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can update own manual post images" on storage.objects;
create policy "Users can update own manual post images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = 'manual-posts'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = 'manual-posts'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can delete own manual post images" on storage.objects;
create policy "Users can delete own manual post images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = 'manual-posts'
  and (storage.foldername(name))[2] = auth.uid()::text
);
