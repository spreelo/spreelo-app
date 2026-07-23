create table if not exists public.image_background_assets (
  id uuid primary key,
  name text not null,
  family text not null default 'abstract',
  moods text[] not null default '{}',
  industries text[] not null default '{}',
  campaigns text[] not null default '{}',
  colors text[] not null default '{}',
  brightness text not null default 'medium',
  season text not null default 'all',
  text_safe boolean not null default true,
  label_safe boolean not null default true,
  crop_safe_1x1 boolean not null default true,
  active boolean not null default true,
  is_fallback boolean not null default false,
  priority integer not null default 0,
  notes text,
  width integer,
  height integer,
  storage_path text not null,
  public_url text,
  uploaded_by uuid,
  times_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists image_background_assets_active_idx
  on public.image_background_assets (active, crop_safe_1x1, is_fallback, priority desc, created_at desc);

create index if not exists image_background_assets_family_idx
  on public.image_background_assets (family);

create or replace function public.set_image_background_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS image_background_assets_set_updated_at ON public.image_background_assets;
create trigger image_background_assets_set_updated_at
before update on public.image_background_assets
for each row execute function public.set_image_background_assets_updated_at();
