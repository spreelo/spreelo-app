-- Spreelo v72: configurable content-format cards for AI Content Studio.

create table if not exists public.content_format_library (
  content_type_id text primary key,
  icon_name text not null default 'Sparkles',
  image_url text,
  image_storage_path text,
  category text not null default 'popular',
  is_featured boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.content_format_library enable row level security;

revoke all on public.content_format_library from anon;
grant select on public.content_format_library to authenticated;

drop policy if exists "Authenticated users can read content format library" on public.content_format_library;

create policy "Authenticated users can read content format library"
on public.content_format_library
for select
to authenticated
using (true);

insert into public.content_format_library
  (content_type_id, icon_name, category, is_featured, active, sort_order)
values
  ('website_item', 'ShoppingBag', 'sales', true, true, 10),
  ('website_item_text_ad', 'Megaphone', 'image_ads', true, true, 20),
  ('animated_website_item', 'PlayCircle', 'video', true, true, 30),
  ('carousel_website_item', 'GalleryHorizontalEnd', 'image_ads', true, true, 40),
  ('problem_solution', 'Puzzle', 'popular', true, true, 50),
  ('tips', 'Lightbulb', 'educational', true, true, 60),
  ('offer_campaign', 'Tag', 'sales', true, true, 70),
  ('focus_source', 'Link2', 'sales', false, true, 80),
  ('mistakes', 'AlertTriangle', 'educational', false, true, 90),
  ('faq', 'CircleHelp', 'educational', false, true, 100),
  ('behind_scenes', 'Clapperboard', 'popular', false, true, 110),
  ('checklist', 'ListChecks', 'educational', false, true, 120),
  ('service_focus', 'Wrench', 'sales', false, true, 130),
  ('case_example', 'Trophy', 'popular', false, true, 140),
  ('myth_fact', 'Sparkles', 'educational', false, true, 150),
  ('local', 'MapPin', 'popular', false, true, 160),
  ('seasonal', 'CalendarDays', 'popular', false, true, 170),
  ('comparison', 'Scale', 'educational', false, true, 180),
  ('mini_guide', 'BookOpen', 'educational', false, true, 190),
  ('manual_prompt', 'PenLine', 'text', false, true, 200)
on conflict (content_type_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-format-assets',
  'content-format-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view content format assets" on storage.objects;

create policy "Public can view content format assets"
on storage.objects
for select
using (bucket_id = 'content-format-assets');
