-- Spreelo v144.257 — Shopify App Pricing bridge
-- Safe to run after v144.256.

alter table public.shopify_connections
  add column if not exists shopify_shop_id text,
  add column if not exists shopify_app_id text,
  add column if not exists shopify_app_handle text,
  add column if not exists shopify_billing_plan_handle text,
  add column if not exists shopify_billing_last_synced_at timestamptz,
  add column if not exists shopify_billing_last_error text;

create index if not exists shopify_connections_shopify_shop_id_idx
  on public.shopify_connections (shopify_shop_id)
  where shopify_shop_id is not null;

create table if not exists public.shopify_billing_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_id text not null unique,
  grant_type text not null,
  plan_handle text,
  credits integer not null check (credits >= 0),
  balance_before integer not null,
  balance_after integer not null,
  purchased_balance_after integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shopify_billing_credit_grants_user_created_idx
  on public.shopify_billing_credit_grants (user_id, created_at desc);

alter table public.shopify_billing_credit_grants enable row level security;
revoke all on public.shopify_billing_credit_grants from public, anon, authenticated;

create or replace function public.apply_shopify_subscription_state_v144257(
  p_user_id uuid,
  p_plan text,
  p_monthly_credits integer,
  p_status text,
  p_shop_id text,
  p_plan_handle text,
  p_interval text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_price_amount bigint,
  p_currency text,
  p_source_id text,
  p_next_credit_refresh_at timestamptz,
  p_trial_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.user_credit_balances%rowtype;
  v_before integer;
  v_after integer;
  v_purchased integer;
  v_grant integer := 0;
  v_source_seen boolean := false;
  v_same_cycle boolean := false;
  v_old_limit integer := 0;
begin
  if p_user_id is null then raise exception 'User id is required.'; end if;
  if lower(coalesce(p_plan,'')) not in ('starter','growth','pro') then raise exception 'Unsupported Spreelo plan.'; end if;
  if coalesce(p_monthly_credits,0) <= 0 then raise exception 'Monthly credits must be positive.'; end if;
  if p_interval not in ('month','year') then raise exception 'Unsupported subscription interval.'; end if;

  select * into v_balance
  from public.user_credit_balances
  where user_id = p_user_id
  for update;
  if not found then raise exception 'No credit balance found for this Spreelo account.'; end if;

  v_before := greatest(coalesce(v_balance.credits_remaining,0),0);
  v_purchased := least(greatest(coalesce(v_balance.purchased_credits_remaining,0),0),v_before);
  v_old_limit := greatest(coalesce(v_balance.monthly_credit_limit,0),0);

  if nullif(trim(coalesce(p_source_id,'')),'') is not null then
    select exists(
      select 1 from public.shopify_billing_credit_grants where source_id = p_source_id
    ) into v_source_seen;
  end if;

  v_same_cycle :=
    v_balance.payment_provider = 'shopify'
    and v_balance.current_period_start is not distinct from p_current_period_start
    and lower(coalesce(v_balance.subscription_plan,'free')) <> 'free';

  if not v_source_seen then
    if v_same_cycle then
      -- Shopify can apply an upgrade immediately inside the same billing cycle.
      -- Grant only the positive allowance delta instead of a second full month.
      v_grant := greatest(coalesce(p_monthly_credits,0) - v_old_limit, 0);
      v_after := v_before + v_grant;
    else
      -- New paid cycle (or first activation): reset expiring subscription credits,
      -- while preserving any non-expiring purchased credits.
      v_grant := greatest(coalesce(p_monthly_credits,0),0);
      v_after := v_grant + v_purchased;
    end if;
  else
    v_after := v_before;
  end if;

  update public.user_credit_balances
  set credits_remaining = v_after,
      purchased_credits_remaining = v_purchased,
      monthly_credit_limit = greatest(coalesce(p_monthly_credits,0),0),
      plan_name = initcap(lower(p_plan)),
      subscription_plan = lower(p_plan),
      subscription_status = lower(coalesce(nullif(trim(p_status),''),'active')),
      payment_provider = 'shopify',
      provider_customer_id = nullif(trim(coalesce(p_shop_id,'')),''),
      provider_subscription_id = case
        when nullif(trim(coalesce(p_shop_id,'')),'') is null then provider_subscription_id
        else 'shopify_app_pricing:' || trim(p_shop_id)
      end,
      provider_subscription_schedule_id = null,
      subscription_price_lookup_key = nullif(trim(coalesce(p_plan_handle,'')),''),
      subscription_interval = p_interval,
      subscription_price_amount = p_price_amount,
      subscription_currency = upper(coalesce(nullif(trim(coalesce(p_currency,'')),''),'SEK')),
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end,
      cancel_at_period_end = coalesce(p_cancel_at_period_end,false),
      credits_renewed_at = case when v_grant > 0 then now() else credits_renewed_at end,
      next_credit_refresh_at = case
        when p_interval = 'year' then coalesce(p_next_credit_refresh_at,next_credit_refresh_at)
        when p_interval = 'month' then p_current_period_end
        else next_credit_refresh_at
      end,
      trial_start = case
        when lower(coalesce(p_status,'')) = 'trialing' then coalesce(trial_start,now())
        else trial_start
      end,
      trial_end = case
        when lower(coalesce(p_status,'')) = 'trialing' then coalesce(p_trial_end,trial_end)
        else trial_end
      end,
      updated_at = now()
  where user_id = p_user_id;

  if not v_source_seen and v_grant > 0 and nullif(trim(coalesce(p_source_id,'')),'') is not null then
    insert into public.shopify_billing_credit_grants(
      user_id,source_id,grant_type,plan_handle,credits,balance_before,balance_after,purchased_balance_after
    ) values(
      p_user_id,p_source_id,
      case when v_same_cycle then 'plan_upgrade_delta' else 'subscription_refresh' end,
      p_plan_handle,v_grant,v_before,v_after,v_purchased
    ) on conflict(source_id) do nothing;
  end if;

  return jsonb_build_object(
    'granted',v_grant,
    'credits_remaining',v_after,
    'purchased_credits_remaining',v_purchased,
    'monthly_credit_limit',p_monthly_credits,
    'same_cycle',v_same_cycle
  );
end;
$$;

create or replace function public.deactivate_shopify_subscription_state_v144257(
  p_user_id uuid,
  p_shop_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.user_credit_balances%rowtype;
  v_before integer;
  v_purchased integer;
  v_release_total integer := 0;
  v_rule record;
begin
  select * into v_balance
  from public.user_credit_balances
  where user_id = p_user_id
  for update;
  if not found then raise exception 'No credit balance found for this Spreelo account.'; end if;

  if v_balance.payment_provider <> 'shopify' then
    return jsonb_build_object('changed',false,'reason','different_provider');
  end if;

  v_before := greatest(coalesce(v_balance.credits_remaining,0),0);

  select coalesce(sum(case when credit_reservation_status='reserved' then greatest(coalesce(credit_reserved_amount,credit_cost,1),1) else 0 end),0)
    into v_release_total
  from public.automation_rules
  where user_id = p_user_id
    and schedule_type='weekly'
    and coalesce(plan_state,'active') <> 'ended';

  if v_release_total > 0 then
    v_before := v_before + v_release_total;
    for v_rule in
      select id,brand_profile_id,name,content_type_id,greatest(coalesce(credit_reserved_amount,credit_cost,1),1) as amount
      from public.automation_rules
      where user_id=p_user_id
        and schedule_type='weekly'
        and coalesce(plan_state,'active') <> 'ended'
        and credit_reservation_status='reserved'
    loop
      insert into public.credit_reservation_events(
        user_id,automation_rule_id,brand_profile_id,rule_name,content_type_id,event_type,amount,reason
      ) values(
        p_user_id,v_rule.id,v_rule.brand_profile_id,v_rule.name,v_rule.content_type_id,
        'released',v_rule.amount,'Recurring schedule paused because the Shopify subscription ended'
      );
    end loop;
  end if;

  update public.automation_rules
  set is_active=false,
      plan_state=case when coalesce(plan_state,'active')='ended' then plan_state else 'paused' end,
      credit_reservation_status=case when credit_reservation_status='reserved' then 'released' else credit_reservation_status end,
      credit_reserved_amount=case when credit_reservation_status='reserved' then 0 else credit_reserved_amount end,
      credit_released_at=case when credit_reservation_status='reserved' then now() else credit_released_at end,
      queue_locked_until=null,
      retry_not_before=null,
      updated_at=now()
  where user_id=p_user_id
    and schedule_type='weekly'
    and coalesce(plan_state,'active') <> 'ended';

  v_purchased := least(greatest(coalesce(v_balance.purchased_credits_remaining,0),0),v_before);

  update public.user_credit_balances
  set credits_remaining=v_purchased,
      purchased_credits_remaining=v_purchased,
      monthly_credit_limit=0,
      plan_name='Free',
      subscription_plan='free',
      subscription_status='inactive',
      payment_provider='shopify',
      provider_customer_id=coalesce(nullif(trim(coalesce(p_shop_id,'')),''),provider_customer_id),
      provider_subscription_id=null,
      provider_subscription_schedule_id=null,
      subscription_price_lookup_key=null,
      subscription_interval=null,
      subscription_price_amount=null,
      current_period_start=null,
      current_period_end=null,
      cancel_at_period_end=false,
      next_credit_refresh_at=null,
      pending_subscription_plan=null,
      pending_subscription_lookup_key=null,
      pending_subscription_effective_at=null,
      updated_at=now()
  where user_id=p_user_id;

  return jsonb_build_object('changed',true,'credits_remaining',v_purchased,'paused_recurring_rules',true);
end;
$$;

create or replace function public.refresh_due_shopify_annual_subscription_credits(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credit_balances%rowtype;
  v_before integer;
  v_after integer;
  v_purchased integer;
  v_next timestamptz;
  v_count integer := 0;
  v_total integer := 0;
  v_source text;
begin
  for v_row in
    select *
    from public.user_credit_balances
    where payment_provider='shopify'
      and subscription_interval='year'
      and subscription_status in ('active','trialing')
      and next_credit_refresh_at is not null
      and next_credit_refresh_at <= now()
      and (current_period_end is null or current_period_end > now())
    order by next_credit_refresh_at asc
    limit greatest(1,least(coalesce(p_limit,500),2000))
    for update skip locked
  loop
    v_source := 'shopify_annual_refresh:' || v_row.user_id::text || ':' || to_char(v_row.next_credit_refresh_at at time zone 'utc','YYYYMMDDHH24MISS');
    if exists(select 1 from public.shopify_billing_credit_grants where source_id=v_source) then
      v_next := v_row.next_credit_refresh_at + interval '1 month';
      while v_next <= now() loop v_next := v_next + interval '1 month'; end loop;
      update public.user_credit_balances set next_credit_refresh_at=v_next,updated_at=now() where user_id=v_row.user_id;
      continue;
    end if;

    v_before := greatest(coalesce(v_row.credits_remaining,0),0);
    v_purchased := least(greatest(coalesce(v_row.purchased_credits_remaining,0),0),v_before);
    v_after := greatest(coalesce(v_row.monthly_credit_limit,0),0) + v_purchased;
    v_next := v_row.next_credit_refresh_at + interval '1 month';
    while v_next <= now() loop v_next := v_next + interval '1 month'; end loop;

    update public.user_credit_balances
    set credits_remaining=v_after,
        purchased_credits_remaining=v_purchased,
        credits_renewed_at=now(),
        next_credit_refresh_at=v_next,
        updated_at=now()
    where user_id=v_row.user_id;

    insert into public.shopify_billing_credit_grants(
      user_id,source_id,grant_type,plan_handle,credits,balance_before,balance_after,purchased_balance_after
    ) values(
      v_row.user_id,v_source,'annual_monthly_refresh',v_row.subscription_price_lookup_key,
      greatest(coalesce(v_row.monthly_credit_limit,0),0),v_before,v_after,v_purchased
    );

    v_count := v_count + 1;
    v_total := v_total + greatest(coalesce(v_row.monthly_credit_limit,0),0);
  end loop;

  return jsonb_build_object('refreshed_accounts',v_count,'credits_granted',v_total);
end;
$$;

revoke all on function public.apply_shopify_subscription_state_v144257(uuid,text,integer,text,text,text,text,timestamptz,timestamptz,boolean,bigint,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.deactivate_shopify_subscription_state_v144257(uuid,text) from public,anon,authenticated;
revoke all on function public.refresh_due_shopify_annual_subscription_credits(integer) from public,anon,authenticated;

grant execute on function public.apply_shopify_subscription_state_v144257(uuid,text,integer,text,text,text,text,timestamptz,timestamptz,boolean,bigint,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.deactivate_shopify_subscription_state_v144257(uuid,text) to service_role;
grant execute on function public.refresh_due_shopify_annual_subscription_credits(integer) to service_role;
