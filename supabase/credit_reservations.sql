-- Spreelo: reserve credits when a content plan is saved.
-- Run once in Supabase SQL Editor before deploying the matching app update.

alter table public.automation_rules
  add column if not exists credit_reservation_status text not null default 'legacy',
  add column if not exists credit_reserved_amount integer not null default 0,
  add column if not exists credit_reserved_at timestamptz null,
  add column if not exists credit_consumed_at timestamptz null,
  add column if not exists credit_released_at timestamptz null;

comment on column public.automation_rules.credit_reservation_status is
  'Credit lifecycle for the next planned post: pending, reserved, consumed, released, unfunded or legacy.';
comment on column public.automation_rules.credit_reserved_amount is
  'Credits currently reserved for this automation rule next run.';


create extension if not exists pgcrypto;

create table if not exists public.credit_reservation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  automation_rule_id uuid null,
  brand_profile_id uuid null,
  rule_name text null,
  content_type_id text null,
  event_type text not null,
  amount integer not null default 0,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.credit_reservation_events
  add column if not exists brand_profile_id uuid null,
  add column if not exists rule_name text null,
  add column if not exists content_type_id text null;

create index if not exists credit_reservation_events_user_created_idx
  on public.credit_reservation_events (user_id, created_at desc);
create index if not exists credit_reservation_events_rule_created_idx
  on public.credit_reservation_events (automation_rule_id, created_at desc);

alter table public.credit_reservation_events enable row level security;

drop policy if exists "Users can view their own credit reservation events"
  on public.credit_reservation_events;
create policy "Users can view their own credit reservation events"
  on public.credit_reservation_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.reserve_automation_rule_credits(p_rule_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested_count integer := coalesce(array_length(p_rule_ids, 1), 0);
  v_rule_count integer := 0;
  v_total integer := 0;
  v_balance integer := 0;
  v_rule record;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  if v_requested_count = 0 then
    raise exception 'No automation rules were supplied.';
  end if;

  select
    count(*),
    coalesce(sum(greatest(coalesce(credit_cost, 1), 1)), 0)
  into v_rule_count, v_total
  from public.automation_rules
  where user_id = v_user_id
    and id = any(p_rule_ids)
    and credit_reservation_status = 'pending';

  if v_rule_count <> v_requested_count then
    raise exception 'Some automation rules could not be reserved.';
  end if;

  select credits_remaining
  into v_balance
  from public.user_credit_balances
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'No credit balance found.';
  end if;

  if v_balance < v_total then
    raise exception 'Not enough credits. Required: %, available: %.', v_total, v_balance;
  end if;

  update public.user_credit_balances
  set credits_remaining = credits_remaining - v_total,
      updated_at = now()
  where user_id = v_user_id;

  update public.automation_rules
  set credit_reservation_status = 'reserved',
      credit_reserved_amount = greatest(coalesce(credit_cost, 1), 1),
      credit_reserved_at = now(),
      credit_consumed_at = null,
      credit_released_at = null,
      is_active = true,
      updated_at = now()
  where user_id = v_user_id
    and id = any(p_rule_ids)
    and credit_reservation_status = 'pending';

  for v_rule in
    select
      id,
      brand_profile_id,
      name,
      content_type_id,
      greatest(coalesce(credit_cost, 1), 1) as amount
    from public.automation_rules
    where user_id = v_user_id
      and id = any(p_rule_ids)
  loop
    insert into public.credit_reservation_events (
      user_id,
      automation_rule_id,
      brand_profile_id,
      rule_name,
      content_type_id,
      event_type,
      amount,
      reason
    ) values (
      v_user_id,
      v_rule.id,
      v_rule.brand_profile_id,
      v_rule.name,
      v_rule.content_type_id,
      'reserved',
      -v_rule.amount,
      'Credits reserved for planned post'
    );
  end loop;

  return jsonb_build_object(
    'reserved_credits', v_total,
    'credits_remaining', v_balance - v_total,
    'rule_count', v_rule_count
  );
end;
$$;

create or replace function public.reconcile_automation_rule_credit_reservation(p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rule public.automation_rules%rowtype;
  v_new_amount integer := 0;
  v_delta integer := 0;
  v_balance integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Automation rule not found.';
  end if;

  v_new_amount := greatest(coalesce(v_rule.credit_cost, 1), 1);

  if v_rule.credit_reservation_status <> 'reserved' then
    if v_rule.is_active = true and v_rule.credit_reservation_status in ('legacy', 'pending', 'released', 'unfunded') then
      select credits_remaining into v_balance
      from public.user_credit_balances
      where user_id = v_user_id
      for update;

      if not found then
        raise exception 'No credit balance found.';
      end if;

      if v_balance < v_new_amount then
        raise exception 'Not enough credits. Required: %, available: %.', v_new_amount, v_balance;
      end if;

      update public.user_credit_balances
      set credits_remaining = credits_remaining - v_new_amount,
          updated_at = now()
      where user_id = v_user_id;

      update public.automation_rules
      set credit_reservation_status = 'reserved',
          credit_reserved_amount = v_new_amount,
          credit_reserved_at = now(),
          credit_consumed_at = null,
          credit_released_at = null,
          updated_at = now()
      where id = p_rule_id;

      insert into public.credit_reservation_events (
        user_id,
        automation_rule_id,
        brand_profile_id,
        rule_name,
        content_type_id,
        event_type,
        amount,
        reason
      ) values (
        v_user_id,
        p_rule_id,
        v_rule.brand_profile_id,
        v_rule.name,
        v_rule.content_type_id,
        'reserved_after_edit',
        -v_new_amount,
        'Credits reserved when an existing planned post was saved again'
      );

      return jsonb_build_object(
        'credit_delta', v_new_amount,
        'credits_remaining', v_balance - v_new_amount,
        'status', 'reserved'
      );
    end if;

    return jsonb_build_object('credit_delta', 0, 'status', v_rule.credit_reservation_status);
  end if;

  v_delta := v_new_amount - greatest(coalesce(v_rule.credit_reserved_amount, 0), 0);

  if v_delta = 0 then
    return jsonb_build_object('credit_delta', 0, 'status', 'reserved');
  end if;

  select credits_remaining into v_balance
  from public.user_credit_balances
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'No credit balance found.';
  end if;

  if v_delta > 0 and v_balance < v_delta then
    raise exception 'Not enough credits. Additional required: %, available: %.', v_delta, v_balance;
  end if;

  update public.user_credit_balances
  set credits_remaining = credits_remaining - v_delta,
      updated_at = now()
  where user_id = v_user_id;

  update public.automation_rules
  set credit_reserved_amount = v_new_amount,
      credit_reserved_at = case when v_delta > 0 then now() else credit_reserved_at end,
      updated_at = now()
  where id = p_rule_id;

  insert into public.credit_reservation_events (
    user_id,
    automation_rule_id,
    brand_profile_id,
    rule_name,
    content_type_id,
    event_type,
    amount,
    reason
  ) values (
    v_user_id,
    p_rule_id,
    v_rule.brand_profile_id,
    v_rule.name,
    v_rule.content_type_id,
    case when v_delta > 0 then 'adjusted_up' else 'adjusted_down' end,
    -v_delta,
    case when v_delta > 0
      then 'Additional credits reserved after plan change'
      else 'Reserved credits returned after plan change'
    end
  );

  return jsonb_build_object(
    'credit_delta', v_delta,
    'credits_remaining', v_balance - v_delta,
    'status', 'reserved'
  );
end;
$$;

create or replace function public.release_and_delete_automation_rules(p_rule_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_release_total integer := 0;
  v_paths jsonb := '[]'::jsonb;
  v_rule record;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  select
    coalesce(sum(case
      when credit_reservation_status = 'reserved'
      then greatest(coalesce(credit_reserved_amount, credit_cost, 1), 1)
      else 0
    end), 0),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'uploaded_image_storage_path', uploaded_image_storage_path
      )
    ), '[]'::jsonb)
  into v_release_total, v_paths
  from public.automation_rules
  where user_id = v_user_id
    and id = any(p_rule_ids);

  if v_release_total > 0 then
    perform 1
    from public.user_credit_balances
    where user_id = v_user_id
    for update;

    update public.user_credit_balances
    set credits_remaining = credits_remaining + v_release_total,
        updated_at = now()
    where user_id = v_user_id;
  end if;

  for v_rule in
    select
      id,
      brand_profile_id,
      name,
      content_type_id,
      greatest(coalesce(credit_reserved_amount, credit_cost, 1), 1) as amount
    from public.automation_rules
    where user_id = v_user_id
      and id = any(p_rule_ids)
      and credit_reservation_status = 'reserved'
  loop
    insert into public.credit_reservation_events (
      user_id,
      automation_rule_id,
      brand_profile_id,
      rule_name,
      content_type_id,
      event_type,
      amount,
      reason
    ) values (
      v_user_id,
      v_rule.id,
      v_rule.brand_profile_id,
      v_rule.name,
      v_rule.content_type_id,
      'released',
      v_rule.amount,
      'Reserved credits returned after planned post was deleted'
    );
  end loop;

  delete from public.automation_rules
  where user_id = v_user_id
    and id = any(p_rule_ids);

  return jsonb_build_object(
    'released_credits', v_release_total,
    'rules', v_paths
  );
end;
$$;

grant execute on function public.reserve_automation_rule_credits(uuid[]) to authenticated;
grant execute on function public.reconcile_automation_rule_credit_reservation(uuid) to authenticated;
grant execute on function public.release_and_delete_automation_rules(uuid[]) to authenticated;

-- Cron-only helpers. The service role already bypasses RLS; these functions keep
-- balance changes and rule status changes in one database transaction.
create or replace function public.consume_reserved_automation_credit(
  p_rule_id uuid,
  p_post_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_cost integer := 0;
  v_balance integer := 0;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found then
    raise exception 'Automation rule not found.';
  end if;

  if v_rule.credit_reservation_status <> 'reserved' then
    return jsonb_build_object(
      'handled', false,
      'status', coalesce(v_rule.credit_reservation_status, 'legacy')
    );
  end if;

  v_cost := greatest(coalesce(v_rule.credit_reserved_amount, v_rule.credit_cost, 1), 1);

  insert into public.credit_reservation_events (
    user_id,
    automation_rule_id,
    brand_profile_id,
    rule_name,
    content_type_id,
    event_type,
    amount,
    reason,
    metadata
  ) values (
    v_rule.user_id,
    p_rule_id,
    v_rule.brand_profile_id,
    v_rule.name,
    v_rule.content_type_id,
    'consumed',
    0,
    'Reserved credits were used when the planned post was created',
    jsonb_build_object('post_id', p_post_id, 'credit_cost', v_cost)
  );

  if v_rule.schedule_type = 'weekly' and v_rule.is_active = true then
    select credits_remaining into v_balance
    from public.user_credit_balances
    where user_id = v_rule.user_id
    for update;

    if not found then
      update public.automation_rules
      set credit_reservation_status = 'unfunded',
          credit_reserved_amount = 0,
          credit_consumed_at = now(),
          is_active = false,
          next_run_at = null,
          last_error = 'The generated post used its reservation, but no credit balance was available for the next recurring post.',
          updated_at = now()
      where id = p_rule_id;

      return jsonb_build_object('handled', true, 'next_reserved', false, 'paused', true);
    end if;

    if v_balance >= greatest(coalesce(v_rule.credit_cost, 1), 1) then
      update public.user_credit_balances
      set credits_remaining = credits_remaining - greatest(coalesce(v_rule.credit_cost, 1), 1),
          updated_at = now()
      where user_id = v_rule.user_id;

      insert into public.credit_reservation_events (
        user_id,
        automation_rule_id,
        brand_profile_id,
        rule_name,
        content_type_id,
        event_type,
        amount,
        reason,
        metadata
      ) values (
        v_rule.user_id,
        p_rule_id,
        v_rule.brand_profile_id,
        v_rule.name,
        v_rule.content_type_id,
        'recurring_reserved',
        -greatest(coalesce(v_rule.credit_cost, 1), 1),
        'Credits reserved for next recurring post',
        jsonb_build_object('post_id', p_post_id)
      );

      update public.automation_rules
      set credit_reservation_status = 'reserved',
          credit_reserved_amount = greatest(coalesce(credit_cost, 1), 1),
          credit_consumed_at = now(),
          credit_reserved_at = now(),
          credit_released_at = null,
          updated_at = now()
      where id = p_rule_id;

      return jsonb_build_object(
        'handled', true,
        'next_reserved', true,
        'paused', false,
        'credits_remaining', v_balance - greatest(coalesce(v_rule.credit_cost, 1), 1)
      );
    end if;

    update public.automation_rules
    set credit_reservation_status = 'unfunded',
        credit_reserved_amount = 0,
        credit_consumed_at = now(),
        is_active = false,
        next_run_at = null,
        last_error = 'The current post was created, but the recurring plan was paused because there were not enough credits to reserve the next post.',
        updated_at = now()
    where id = p_rule_id;

    return jsonb_build_object(
      'handled', true,
      'next_reserved', false,
      'paused', true,
      'credits_remaining', v_balance
    );
  end if;

  update public.automation_rules
  set credit_reservation_status = 'consumed',
      credit_reserved_amount = 0,
      credit_consumed_at = now(),
      updated_at = now()
  where id = p_rule_id;

  return jsonb_build_object(
    'handled', true,
    'next_reserved', false,
    'paused', false,
    'status', 'consumed'
  );
end;
$$;

create or replace function public.release_reserved_automation_credit_system(
  p_rule_id uuid,
  p_reason text default 'Reserved credits returned after automation failure'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_amount integer := 0;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found or v_rule.credit_reservation_status <> 'reserved' then
    return jsonb_build_object('released_credits', 0);
  end if;

  v_amount := greatest(coalesce(v_rule.credit_reserved_amount, v_rule.credit_cost, 1), 1);

  update public.user_credit_balances
  set credits_remaining = credits_remaining + v_amount,
      updated_at = now()
  where user_id = v_rule.user_id;

  insert into public.credit_reservation_events (
    user_id,
    automation_rule_id,
    brand_profile_id,
    rule_name,
    content_type_id,
    event_type,
    amount,
    reason
  ) values (
    v_rule.user_id,
    p_rule_id,
    v_rule.brand_profile_id,
    v_rule.name,
    v_rule.content_type_id,
    'released_after_failure',
    v_amount,
    coalesce(nullif(trim(p_reason), ''), 'Reserved credits returned after automation failure')
  );

  update public.automation_rules
  set credit_reservation_status = 'released',
      credit_reserved_amount = 0,
      credit_released_at = now(),
      updated_at = now()
  where id = p_rule_id;

  return jsonb_build_object('released_credits', v_amount);
end;
$$;

revoke all on function public.consume_reserved_automation_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_reserved_automation_credit_system(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_reserved_automation_credit(uuid, uuid) to service_role;
grant execute on function public.release_reserved_automation_credit_system(uuid, text) to service_role;
