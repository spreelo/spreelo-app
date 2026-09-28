-- Spreelo v144.263
-- Ensure every authenticated Spreelo workspace has a standard credit-balance row.
--
-- This fixes social OAuth completion failures where a valid Facebook/Instagram/
-- TikTok/etc. connection reached Spreelo before user_credit_balances had ever
-- been initialized for the account.

create or replace function public.ensure_spreelo_credit_balance_for_user(p_user_id uuid)
returns public.user_credit_balances
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_balance public.user_credit_balances%rowtype;
begin
  if p_user_id is null then
    raise exception 'Spreelo user id is required.';
  end if;

  select * into v_balance
  from public.user_credit_balances
  where user_id = p_user_id;

  if found then
    return v_balance;
  end if;

  insert into public.user_credit_balances (
    user_id,
    credits_remaining,
    monthly_credit_limit,
    plan_name,
    subscription_plan,
    subscription_status,
    purchased_credits_remaining,
    cancel_at_period_end,
    free_trial_status,
    free_trial_credit_amount
  ) values (
    p_user_id,
    0,
    0,
    'Free',
    'free',
    'free',
    0,
    false,
    case when public.spreelo_is_plan_limit_admin(p_user_id) then 'used' else 'locked' end,
    100
  )
  on conflict (user_id) do nothing;

  select * into v_balance
  from public.user_credit_balances
  where user_id = p_user_id;

  if not found then
    raise exception 'Could not initialize Spreelo credit balance.';
  end if;

  return v_balance;
end;
$$;

revoke all on function public.ensure_spreelo_credit_balance_for_user(uuid) from public, anon, authenticated;

-- Repair existing authenticated workspaces that are missing their balance row.
insert into public.user_credit_balances (
  user_id,
  credits_remaining,
  monthly_credit_limit,
  plan_name,
  subscription_plan,
  subscription_status,
  purchased_credits_remaining,
  cancel_at_period_end,
  free_trial_status,
  free_trial_credit_amount
)
select
  u.id,
  0,
  0,
  'Free',
  'free',
  'free',
  0,
  false,
  case when public.spreelo_is_plan_limit_admin(u.id) then 'used' else 'locked' end,
  100
from auth.users u
left join public.user_credit_balances b on b.user_id = u.id
where b.user_id is null
on conflict (user_id) do nothing;

-- Future signups should never reach the app without a balance row.
create or replace function public.spreelo_initialize_credit_balance_after_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.ensure_spreelo_credit_balance_for_user(new.id);
  return new;
end;
$$;

revoke all on function public.spreelo_initialize_credit_balance_after_signup() from public, anon, authenticated;

drop trigger if exists spreelo_initialize_credit_balance_after_signup on auth.users;
create trigger spreelo_initialize_credit_balance_after_signup
after insert on auth.users
for each row execute function public.spreelo_initialize_credit_balance_after_signup();
