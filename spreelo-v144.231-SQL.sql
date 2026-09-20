-- Spreelo v144.231: Grow Brain Step 5 connection UX foundation.
-- Persists per-brand web-data connection state and one-time onboarding dismissal.
-- Run once in Supabase SQL Editor BEFORE deploying v144.231.

begin;

create table if not exists public.brand_web_data_connections (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'not_connected'
    check (status in ('not_connected','discovered','setup_pending','connected','error')),
  provider text,
  website_url text,
  detected_platform text,
  detected_signals jsonb not null default '{}'::jsonb,
  intro_dismissed_at timestamptz,
  discovered_at timestamptz,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_profile_id)
);

create index if not exists brand_web_data_connections_user_idx
  on public.brand_web_data_connections(user_id, updated_at desc);

alter table public.brand_web_data_connections enable row level security;
revoke all on public.brand_web_data_connections from anon, authenticated;
grant select, insert, update, delete on public.brand_web_data_connections to authenticated;

drop policy if exists brand_web_data_connections_owner_select on public.brand_web_data_connections;
create policy brand_web_data_connections_owner_select
  on public.brand_web_data_connections
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists brand_web_data_connections_owner_insert on public.brand_web_data_connections;
create policy brand_web_data_connections_owner_insert
  on public.brand_web_data_connections
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.brand_profiles bp
      where bp.id = brand_profile_id and bp.user_id = auth.uid()
    )
  );

drop policy if exists brand_web_data_connections_owner_update on public.brand_web_data_connections;
create policy brand_web_data_connections_owner_update
  on public.brand_web_data_connections
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.brand_profiles bp
      where bp.id = brand_profile_id and bp.user_id = auth.uid()
    )
  );

drop policy if exists brand_web_data_connections_owner_delete on public.brand_web_data_connections;
create policy brand_web_data_connections_owner_delete
  on public.brand_web_data_connections
  for delete to authenticated
  using (auth.uid() = user_id);

comment on table public.brand_web_data_connections is
  'Grow Brain Step 5 foundation: optional per-brand website/commerce analytics connection state and onboarding preference.';

commit;
