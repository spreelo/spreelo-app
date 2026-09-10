-- Spreelo v144.157 — persistent UI translation cache integrity
-- Additive migration. Existing translation labels are preserved.

create extension if not exists pgcrypto;

create table if not exists public.ui_translation_packs (
  id uuid default gen_random_uuid(),
  locale text not null,
  language text,
  namespace text not null,
  labels jsonb not null default '{}'::jsonb,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ui_translation_packs add column if not exists id uuid default gen_random_uuid();
alter table public.ui_translation_packs add column if not exists locale text;
alter table public.ui_translation_packs add column if not exists language text;
alter table public.ui_translation_packs add column if not exists namespace text;
alter table public.ui_translation_packs add column if not exists labels jsonb default '{}'::jsonb;
alter table public.ui_translation_packs add column if not exists status text default 'ready';
alter table public.ui_translation_packs add column if not exists created_at timestamptz default now();
alter table public.ui_translation_packs add column if not exists updated_at timestamptz default now();

update public.ui_translation_packs set id = gen_random_uuid() where id is null;
update public.ui_translation_packs set labels = '{}'::jsonb where labels is null;
update public.ui_translation_packs set status = 'ready' where status is null;
update public.ui_translation_packs set created_at = now() where created_at is null;
update public.ui_translation_packs set updated_at = now() where updated_at is null;

-- A duplicate locale+namespace would allow two first visitors to trigger the same
-- AI translation. Fail visibly instead of silently deleting an existing pack.
do $$
begin
  if exists (
    select 1
    from public.ui_translation_packs
    where locale is not null and namespace is not null
    group by locale, namespace
    having count(*) > 1
  ) then
    raise exception 'Duplicate ui_translation_packs rows exist for locale+namespace. Merge those rows before applying v144.157.';
  end if;
end $$;

create unique index if not exists ui_translation_packs_id_uidx
  on public.ui_translation_packs(id);

create unique index if not exists ui_translation_packs_locale_namespace_uidx
  on public.ui_translation_packs(locale, namespace);

create index if not exists ui_translation_packs_status_updated_idx
  on public.ui_translation_packs(status, updated_at);

alter table public.ui_translation_packs enable row level security;
revoke all on table public.ui_translation_packs from anon, authenticated;
grant all on table public.ui_translation_packs to service_role;
