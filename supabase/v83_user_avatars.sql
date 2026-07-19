-- Spreelo v83: optional user profile avatars
-- Run once in Supabase SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Users may upload only inside their own first-level folder: <auth.uid()>/...
drop policy if exists "user avatars insert own" on storage.objects;
create policy "user avatars insert own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user avatars update own" on storage.objects;
create policy "user avatars update own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user avatars delete own" on storage.objects;
create policy "user avatars delete own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user avatars read public" on storage.objects;
create policy "user avatars read public"
on storage.objects for select
to public
using (bucket_id = 'user-avatars');
