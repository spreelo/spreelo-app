-- Spreelo admin dashboard: audited manual credit adjustments.
-- Run once in Supabase SQL Editor before using Admin > Credit adjustments.

create extension if not exists pgcrypto;

create table if not exists public.admin_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid null,
  admin_email text null,
  target_user_id uuid not null,
  target_email text null,
  amount integer not null check (amount <> 0),
  previous_balance integer not null,
  new_balance integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_credit_adjustments_target_created_idx
  on public.admin_credit_adjustments (target_user_id, created_at desc);
create index if not exists admin_credit_adjustments_created_idx
  on public.admin_credit_adjustments (created_at desc);

alter table public.admin_credit_adjustments enable row level security;

-- There are deliberately no authenticated-user policies.
-- The protected server API uses the Supabase service role.
revoke all on table public.admin_credit_adjustments from public, anon, authenticated;

create or replace function public.admin_adjust_user_credits(
  p_target_user_id uuid,
  p_target_email text,
  p_amount integer,
  p_reason text,
  p_admin_user_id uuid,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_balance integer;
  v_new_balance integer;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if p_target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'Credit adjustment must be between -100000 and 100000, excluding zero.';
  end if;

  if length(v_reason) < 3 then
    raise exception 'A reason is required for every credit adjustment.';
  end if;

  select credits_remaining
  into v_previous_balance
  from public.user_credit_balances
  where user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'This account does not have a credit balance row yet.';
  end if;

  v_new_balance := v_previous_balance + p_amount;

  if v_new_balance < 0 then
    raise exception 'The adjustment would make the account balance negative.';
  end if;

  update public.user_credit_balances
  set credits_remaining = v_new_balance,
      updated_at = now()
  where user_id = p_target_user_id;

  insert into public.admin_credit_adjustments (
    admin_user_id,
    admin_email,
    target_user_id,
    target_email,
    amount,
    previous_balance,
    new_balance,
    reason
  ) values (
    p_admin_user_id,
    nullif(trim(coalesce(p_admin_email, '')), ''),
    p_target_user_id,
    nullif(trim(coalesce(p_target_email, '')), ''),
    p_amount,
    v_previous_balance,
    v_new_balance,
    v_reason
  );

  return jsonb_build_object(
    'amount', p_amount,
    'previous_balance', v_previous_balance,
    'new_balance', v_new_balance
  );
end;
$$;

revoke all on function public.admin_adjust_user_credits(uuid, text, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_user_credits(uuid, text, integer, text, uuid, text)
  to service_role;
