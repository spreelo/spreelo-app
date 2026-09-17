-- Spreelo v144.186
-- Smart onboarding + secure admin team invitations + current paid plan limits.
-- Run this migration once on a database that already has the v144.183 schema.

create extension if not exists pgcrypto;

create table if not exists public.spreelo_admin_team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  locale text not null default 'en',
  invited_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  accepted_user_id uuid
);

create index if not exists spreelo_admin_team_invites_email_idx
  on public.spreelo_admin_team_invites (lower(email), created_at desc);
create index if not exists spreelo_admin_team_invites_pending_idx
  on public.spreelo_admin_team_invites (expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.spreelo_admin_team_invites enable row level security;
revoke all on table public.spreelo_admin_team_invites from public, anon, authenticated;
grant all on table public.spreelo_admin_team_invites to service_role;

create table if not exists public.spreelo_admin_team_members (
  email text primary key,
  user_id uuid,
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by_user_id uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists spreelo_admin_team_members_user_id_idx
  on public.spreelo_admin_team_members (user_id)
  where user_id is not null;

alter table public.spreelo_admin_team_members enable row level security;
revoke all on table public.spreelo_admin_team_members from public, anon, authenticated;
grant all on table public.spreelo_admin_team_members to service_role;

create or replace function public.spreelo_accept_admin_invite(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite public.spreelo_admin_team_invites%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_auth_email text;
begin
  if p_user_id is null or v_email = '' or coalesce(trim(p_token_hash), '') = '' then
    raise exception 'Invalid admin invitation request.';
  end if;

  select lower(trim(coalesce(email, ''))) into v_auth_email
  from auth.users
  where id = p_user_id
  limit 1;

  if v_auth_email is null or v_auth_email <> v_email then
    raise exception 'The signed-in account does not match this invitation.';
  end if;

  select * into v_invite
  from public.spreelo_admin_team_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'The admin invitation is invalid.';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'The admin invitation has been revoked.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'The admin invitation has already been used.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'The admin invitation has expired.';
  end if;
  if lower(trim(v_invite.email)) <> v_email then
    raise exception 'Sign in with the exact email address that received this invitation.';
  end if;

  update public.spreelo_admin_team_invites
  set accepted_at = now(), accepted_user_id = p_user_id
  where id = v_invite.id
    and accepted_at is null
    and revoked_at is null;

  if not found then
    raise exception 'The admin invitation is no longer available.';
  end if;

  insert into public.spreelo_admin_team_members (
    email, user_id, status, invited_by_user_id, accepted_at, revoked_at, created_at, updated_at
  ) values (
    v_email, p_user_id, 'active', v_invite.invited_by_user_id, now(), null, now(), now()
  )
  on conflict (email) do update set
    user_id = excluded.user_id,
    status = 'active',
    invited_by_user_id = excluded.invited_by_user_id,
    accepted_at = excluded.accepted_at,
    revoked_at = null,
    updated_at = now();

  return jsonb_build_object('email', v_email, 'user_id', p_user_id, 'status', 'active');
end;
$$;

revoke all on function public.spreelo_accept_admin_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.spreelo_accept_admin_invite(text, uuid, text) to service_role;

-- Current paid plan model: one brand per paid account; 1/5/unlimited social
-- accounts and 1/3/5 active rolling plans for Starter/Growth/Pro.
create or replace function public.spreelo_entitlement_limit(p_user_id uuid, p_resource text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text := coalesce(public.spreelo_entitlement_plan(p_user_id), 'free');
begin
  if p_resource = 'brands' then
    return case v_plan
      when 'starter' then 1
      when 'growth' then 1
      when 'pro' then 1
      else 1
    end;
  elsif p_resource = 'social_accounts' then
    return case v_plan
      when 'starter' then 1
      when 'growth' then 5
      when 'pro' then 2147483647
      else 0
    end;
  elsif p_resource = 'recurring_plans' then
    return case v_plan
      when 'starter' then 1
      when 'growth' then 3
      when 'pro' then 5
      else 0
    end;
  end if;
  raise exception 'Unknown Spreelo entitlement resource: %', p_resource;
end;
$$;
