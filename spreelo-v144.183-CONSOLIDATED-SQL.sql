-- Spreelo v144.183 CONSOLIDATED migration
-- Target: environments where the v144.181 / v144.182 consolidated migration
-- has NOT yet been applied.
--
-- This file contains:
--   1) the complete idempotent v144.181 editorial / service / credit-control migration
--      (v144.182 smart planning is code-only), and
--   2) the v144.183 recurring-plan credit pause / automatic-resume migration.
--
-- Run THIS file once. Do not run the older v144.181 or v144.182 SQL files first.

-- Spreelo v144.182 CONSOLIDATED migration
-- Target: environments where v144.181 has NOT yet been applied.
-- This file contains the complete idempotent v144.181 editorial/credit/service migration.
-- v144.182 smart planning itself is code-only and adds no new database schema.
-- Run THIS file once instead of running the v144.181 SQL separately.

-- Spreelo v144.181
-- Editorial content-quality engine, simplified customer-facing post types,
-- and Admin-controlled per-format credit pricing.
--
-- Safe migration rules:
-- - Existing product formats are not changed.
-- - Retired editorial ids are kept for historical rules, but disabled for new plans.
-- - Existing Admin pricing is preserved where possible.

begin;

alter table public.content_format_library
  add column if not exists credit_variant_prices jsonb not null default '{}'::jsonb;

alter table public.content_format_library
  drop constraint if exists content_format_library_credit_variant_prices_object_check;
alter table public.content_format_library
  add constraint content_format_library_credit_variant_prices_object_check
  check (jsonb_typeof(credit_variant_prices) = 'object');

comment on column public.content_format_library.credit_variant_prices is
  'Optional customer-facing credit prices for selectable variants within one post type. Runtime snapshots the selected cost into new plans/rules.';

-- Verified services are tracked independently from product/catalog mode so a
-- mixed business can safely expose Service in focus without keyword guessing.
alter table public.brand_profiles
  add column if not exists website_service_mode_available boolean not null default false,
  add column if not exists website_service_mode_checked_at timestamptz,
  add column if not exists website_service_mode_reason text,
  add column if not exists website_service_source_url text;

comment on column public.brand_profiles.website_service_mode_available is
  'True only when official website analysis or approved Rescue evidence verified a concrete service offering.';


-- Retire the old overlapping editorial cards. Keep their rows so historical
-- automation rules remain readable and can be mapped to their replacement type.
update public.content_format_library
set active = false,
    is_featured = false,
    updated_at = now()
where content_type_id in (
  'mistakes',
  'checklist',
  'myth_fact',
  'seasonal',
  'mini_guide',
  'behind_scenes',
  'case_example',
  'local',
  'comparison'
);

-- Refresh the retained editorial labels/descriptions. Do not overwrite an
-- Admin-edited customer credit price on existing rows.
update public.content_format_library
set display_label = 'Problem & solution',
    description = 'Show a customer problem and connect it to a relevant product or service.',
    category = 'popular',
    icon_name = 'Puzzle',
    is_featured = true,
    active = true,
    sort_order = 50,
    updated_at = now()
where content_type_id = 'problem_solution';

update public.content_format_library
set display_label = 'Tips & knowledge',
    description = 'Share useful advice, facts and smart tips for your audience.',
    category = 'educational',
    icon_name = 'Lightbulb',
    is_featured = true,
    active = true,
    sort_order = 60,
    updated_at = now()
where content_type_id = 'tips';

update public.content_format_library
set display_label = 'Question & answer',
    description = 'Answer a relevant question customers may have.',
    category = 'educational',
    icon_name = 'CircleHelp',
    is_featured = true,
    active = true,
    sort_order = 100,
    updated_at = now()
where content_type_id = 'faq';

update public.content_format_library
set display_label = 'Service in focus',
    description = 'Highlight a real service you offer.',
    category = 'sales',
    icon_name = 'Wrench',
    is_featured = true,
    active = true,
    sort_order = 130,
    updated_at = now()
where content_type_id = 'service_focus';

-- Add the two new editorial types. The initial credit values are only safe
-- defaults; Admin can change them without a deployment.
insert into public.content_format_library (
  content_type_id,
  display_label,
  description,
  icon_name,
  category,
  is_featured,
  active,
  sort_order,
  customer_credit_cost,
  credit_variant_prices,
  available_starter,
  available_growth,
  available_pro,
  is_custom,
  updated_at
)
values
  (
    'guide_choice',
    'Guide & decision help',
    'Help customers choose the right option or understand how something works.',
    'BookOpen',
    'educational',
    true,
    true,
    195,
    10,
    '{}'::jsonb,
    true,
    true,
    true,
    false,
    now()
  ),
  (
    'engagement_humor',
    'Engagement & humour',
    'Create content that encourages reactions, comments and shares.',
    'MessageCircleHeart',
    'popular',
    true,
    true,
    197,
    80,
    '{"ai_video":80,"ai_image":10,"product_image":10}'::jsonb,
    true,
    true,
    true,
    false,
    now()
  )
on conflict (content_type_id) do update set
  display_label = excluded.display_label,
  description = excluded.description,
  icon_name = excluded.icon_name,
  category = excluded.category,
  is_featured = excluded.is_featured,
  active = excluded.active,
  sort_order = excluded.sort_order,
  credit_variant_prices = case
    when public.content_format_library.credit_variant_prices is null
      or public.content_format_library.credit_variant_prices = '{}'::jsonb
    then excluded.credit_variant_prices
    else public.content_format_library.credit_variant_prices
  end,
  available_starter = public.content_format_library.available_starter,
  available_growth = public.content_format_library.available_growth,
  available_pro = public.content_format_library.available_pro,
  updated_at = now();

-- Keep the default Engagement & humour price aligned with its default AI-video
-- variant only when this is the initial untouched value. Admin changes remain authoritative.
update public.content_format_library
set customer_credit_cost = coalesce((credit_variant_prices->>'ai_video')::integer, customer_credit_cost),
    updated_at = now()
where content_type_id = 'engagement_humor'
  and coalesce((credit_variant_prices->>'ai_video')::integer, 0) > 0
  and customer_credit_cost in (10, 80);

-- Make the special-tool names clearer in Admin/catalog. Functionality is unchanged.
update public.content_format_library
set display_label = 'Custom post', updated_at = now()
where content_type_id = 'manual_prompt';

update public.content_format_library
set display_label = 'Post from web page', updated_at = now()
where content_type_id = 'focus_source';

update public.content_format_library
set display_label = 'Giveaway / Competition', updated_at = now()
where content_type_id = 'giveaway';

commit;

-- ============================================================================
-- v144.183 — recurring-plan credit pause / automatic resume
-- ============================================================================

-- Spreelo v144.183 — recurring-plan credit pause/resume lifecycle
--
-- Goals:
-- * Weekly plans fund a complete upcoming cycle atomically instead of slowly
--   losing individual weekday rules when credits run out.
-- * Credit exhaustion pauses the whole recurring plan with an explicit reason.
-- * Missed posts are never backfilled after credits return; resumption starts at
--   the next future weekday/time for every slot.
-- * A credit-paused plan can resume automatically after subscription renewal,
--   purchased credits, or another legitimate balance increase.
-- * Manually paused plans are never auto-resumed.
-- * Stable recurring_plan_group_id replaces minute/name heuristics for new plans
--   while old weekly plans are backfilled safely.

begin;

create extension if not exists pgcrypto;

alter table public.automation_rules
  add column if not exists recurring_plan_group_id uuid,
  add column if not exists plan_pause_reason text,
  add column if not exists plan_paused_at timestamptz,
  add column if not exists credit_pause_required_amount integer,
  add column if not exists credit_pause_balance_at_pause integer;

alter table public.automation_rules
  drop constraint if exists automation_rules_plan_pause_reason_check;
alter table public.automation_rules
  add constraint automation_rules_plan_pause_reason_check
  check (plan_pause_reason is null or plan_pause_reason in ('manual','insufficient_credits','subscription_ended','system'));

alter table public.automation_rules
  drop constraint if exists automation_rules_credit_pause_required_nonnegative;
alter table public.automation_rules
  add constraint automation_rules_credit_pause_required_nonnegative
  check (credit_pause_required_amount is null or credit_pause_required_amount >= 0);

alter table public.automation_rules
  drop constraint if exists automation_rules_credit_pause_balance_nonnegative;
alter table public.automation_rules
  add constraint automation_rules_credit_pause_balance_nonnegative
  check (credit_pause_balance_at_pause is null or credit_pause_balance_at_pause >= 0);

comment on column public.automation_rules.recurring_plan_group_id is
  'Stable id shared by every weekday rule belonging to one recurring weekly plan.';
comment on column public.automation_rules.plan_pause_reason is
  'Why a recurring plan is paused. insufficient_credits may auto-resume; manual never auto-resumes.';
comment on column public.automation_rules.credit_pause_required_amount is
  'Estimated credits needed to reserve the next complete recurring cycle when a credit pause occurred.';

create index if not exists automation_rules_recurring_plan_group_idx
  on public.automation_rules (user_id, recurring_plan_group_id)
  where recurring_plan_group_id is not null;
create index if not exists automation_rules_credit_pause_idx
  on public.automation_rules (user_id, plan_pause_reason, plan_state)
  where schedule_type = 'weekly';

-- Backfill one stable group id for every existing weekly-plan group using the
-- same grouping contract that Spreelo historically used in the UI/backend.
with grouped as (
  select
    user_id,
    brand_profile_id,
    coalesce(nullif(trim(name), ''), nullif(trim(content_type_label), ''), nullif(trim(post_type), ''), '') as group_name,
    lower(coalesce(schedule_type, 'weekly')) as group_schedule,
    lower(coalesce(nullif(trim(queue_source), ''), 'content_studio')) as group_source,
    date_trunc('minute', created_at) as group_created_minute,
    gen_random_uuid() as group_id
  from public.automation_rules
  where lower(coalesce(schedule_type, '')) = 'weekly'
    and recurring_plan_group_id is null
  group by
    user_id,
    brand_profile_id,
    coalesce(nullif(trim(name), ''), nullif(trim(content_type_label), ''), nullif(trim(post_type), ''), ''),
    lower(coalesce(schedule_type, 'weekly')),
    lower(coalesce(nullif(trim(queue_source), ''), 'content_studio')),
    date_trunc('minute', created_at)
)
update public.automation_rules r
set recurring_plan_group_id = g.group_id,
    updated_at = now()
from grouped g
where r.recurring_plan_group_id is null
  and r.user_id = g.user_id
  and r.brand_profile_id is not distinct from g.brand_profile_id
  and coalesce(nullif(trim(r.name), ''), nullif(trim(r.content_type_label), ''), nullif(trim(r.post_type), ''), '') = g.group_name
  and lower(coalesce(r.schedule_type, 'weekly')) = g.group_schedule
  and lower(coalesce(nullif(trim(r.queue_source), ''), 'content_studio')) = g.group_source
  and date_trunc('minute', r.created_at) = g.group_created_minute;

-- Calculate the next future local weekday/time. This deliberately skips missed
-- occurrences instead of backfilling them after a credit pause.
create or replace function public.spreelo_next_weekly_run_at_v144183(
  p_weekday text,
  p_publish_time time,
  p_timezone text default 'UTC'
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_timezone text := coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'UTC');
  v_local_now timestamp without time zone;
  v_target_dow integer;
  v_current_dow integer;
  v_days integer;
  v_candidate timestamp without time zone;
begin
  v_target_dow := case lower(trim(coalesce(p_weekday, '')))
    when 'monday' then 1
    when 'tuesday' then 2
    when 'wednesday' then 3
    when 'thursday' then 4
    when 'friday' then 5
    when 'saturday' then 6
    when 'sunday' then 7
    else null
  end;

  if v_target_dow is null or p_publish_time is null then
    return null;
  end if;

  begin
    v_local_now := now() at time zone v_timezone;
  exception when others then
    v_timezone := 'UTC';
    v_local_now := now() at time zone 'UTC';
  end;

  v_current_dow := extract(isodow from v_local_now)::integer;
  v_days := (v_target_dow - v_current_dow + 7) % 7;
  v_candidate := date_trunc('day', v_local_now)
    + (v_days * interval '1 day')
    + p_publish_time;

  if v_candidate <= v_local_now then
    v_candidate := v_candidate + interval '7 days';
  end if;

  return v_candidate at time zone v_timezone;
end;
$$;

-- Pause the entire recurring plan after credit exhaustion. Any reservations for
-- not-yet-generated sibling slots are returned. The occurrence that already
-- generated is marked consumed before this helper is called, so its used credit
-- is never refunded here.
create or replace function public.spreelo_pause_recurring_plan_for_credits_system(
  p_rule_id uuid,
  p_reason text default 'insufficient_credits'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_group_id uuid;
  v_release_total integer := 0;
  v_required integer := 0;
  v_balance integer := 0;
  v_item record;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found or lower(coalesce(v_rule.schedule_type, '')) <> 'weekly' then
    return jsonb_build_object('handled', false, 'reason', 'not_weekly');
  end if;

  v_group_id := v_rule.recurring_plan_group_id;
  if v_group_id is null then
    v_group_id := gen_random_uuid();
    update public.automation_rules r
    set recurring_plan_group_id = v_group_id,
        updated_at = now()
    where r.user_id = v_rule.user_id
      and r.brand_profile_id is not distinct from v_rule.brand_profile_id
      and lower(coalesce(r.schedule_type, '')) = 'weekly'
      and coalesce(nullif(trim(r.name), ''), nullif(trim(r.content_type_label), ''), nullif(trim(r.post_type), ''), '') =
          coalesce(nullif(trim(v_rule.name), ''), nullif(trim(v_rule.content_type_label), ''), nullif(trim(v_rule.post_type), ''), '')
      and lower(coalesce(nullif(trim(r.queue_source), ''), 'content_studio')) = lower(coalesce(nullif(trim(v_rule.queue_source), ''), 'content_studio'))
      and date_trunc('minute', r.created_at) = date_trunc('minute', v_rule.created_at);
  end if;

  perform 1
  from public.automation_rules
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended'
  order by id
  for update;

  select coalesce(sum(greatest(coalesce(credit_cost, 1), 1)), 0)
  into v_required
  from public.automation_rules
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended';

  select coalesce(sum(
    case when credit_reservation_status = 'reserved'
      then greatest(coalesce(credit_reserved_amount, credit_cost, 1), 1)
      else 0 end
  ), 0)
  into v_release_total
  from public.automation_rules
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended';

  select credits_remaining into v_balance
  from public.user_credit_balances
  where user_id = v_rule.user_id
  for update;

  if not found then
    v_balance := 0;
  elsif v_release_total > 0 then
    update public.user_credit_balances
    set credits_remaining = credits_remaining + v_release_total,
        updated_at = now()
    where user_id = v_rule.user_id;
    v_balance := v_balance + v_release_total;
  end if;

  for v_item in
    select id, brand_profile_id, name, content_type_id,
           greatest(coalesce(credit_reserved_amount, credit_cost, 1), 1) as amount
    from public.automation_rules
    where user_id = v_rule.user_id
      and recurring_plan_group_id = v_group_id
      and credit_reservation_status = 'reserved'
  loop
    insert into public.credit_reservation_events (
      user_id, automation_rule_id, brand_profile_id, rule_name,
      content_type_id, event_type, amount, reason, metadata
    ) values (
      v_rule.user_id, v_item.id, v_item.brand_profile_id, v_item.name,
      v_item.content_type_id, 'recurring_plan_credit_pause_release', v_item.amount,
      'Reserved credits returned because the complete recurring plan paused for insufficient credits',
      jsonb_build_object('recurring_plan_group_id', v_group_id, 'required_cycle_credits', v_required)
    );
  end loop;

  update public.automation_rules
  set is_active = false,
      plan_state = case when lower(coalesce(plan_state, 'active')) = 'ended' then plan_state else 'paused' end,
      plan_pause_reason = 'insufficient_credits',
      plan_paused_at = coalesce(plan_paused_at, now()),
      credit_pause_required_amount = v_required,
      credit_pause_balance_at_pause = greatest(v_balance, 0),
      credit_reservation_status = case when lower(coalesce(plan_state, 'active')) = 'ended' then credit_reservation_status else 'unfunded' end,
      credit_reserved_amount = case when lower(coalesce(plan_state, 'active')) = 'ended' then credit_reserved_amount else 0 end,
      credit_released_at = case when credit_reservation_status = 'reserved' then now() else credit_released_at end,
      next_run_at = case when lower(coalesce(plan_state, 'active')) = 'ended' then next_run_at else null end,
      queue_locked_until = null,
      retry_not_before = null,
      last_error = case when lower(coalesce(plan_state, 'active')) = 'ended' then last_error else 'Recurring plan paused because the next complete weekly cycle could not be funded.' end,
      updated_at = now()
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended';

  return jsonb_build_object(
    'handled', true,
    'paused', true,
    'recurring_plan_group_id', v_group_id,
    'released_credits', v_release_total,
    'required_credits', v_required,
    'credits_remaining', greatest(v_balance, 0),
    'pause_reason', 'insufficient_credits'
  );
end;
$$;


-- Credit shortage discovered before paid generation begins. Finalize the
-- claimed occurrence without creating an admin-rescue case, then pause the
-- complete recurring plan and return every still-held reservation.
create or replace function public.spreelo_pause_recurring_occurrence_for_credit_shortage(
  p_occurrence_id uuid,
  p_rule_id uuid,
  p_failure_stage text default 'credit_cycle_gate',
  p_message text default 'Not enough credits'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence public.automation_occurrences%rowtype;
  v_rule public.automation_rules%rowtype;
  v_pause jsonb := '{}'::jsonb;
  v_customer_message text :=
    'Your weekly plan is paused because there are not enough credits for the next complete cycle.';
begin
  select * into v_occurrence
  from public.automation_occurrences
  where id = p_occurrence_id
  for update;

  if not found then
    raise exception 'Automation occurrence not found.';
  end if;

  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
    and user_id = v_occurrence.user_id
  for update;

  if not found or v_occurrence.automation_rule_id <> p_rule_id then
    raise exception 'Automation rule does not match occurrence.';
  end if;

  if lower(coalesce(v_rule.schedule_type, '')) <> 'weekly' then
    raise exception 'Credit-cycle pause is only valid for weekly rules.';
  end if;

  v_pause := public.spreelo_pause_recurring_plan_for_credits_system(
    p_rule_id,
    'insufficient_credits'
  );

  if v_occurrence.status <> 'completed' then
    update public.automation_occurrences
    set status = 'failed_terminal',
        finished_at = coalesce(finished_at, now()),
        failure_code = 'insufficient_credits',
        failure_stage = nullif(trim(coalesce(p_failure_stage, 'credit_cycle_gate')), ''),
        failure_message_internal = left(coalesce(p_message, 'Not enough credits'), 4000),
        failure_message_customer = left(v_customer_message, 1200),
        refunded_credits = 0,
        notification_status = 'suppressed',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'admin_rescue_required', false,
          'credit_pause', true,
          'recurring_plan_group_id', v_rule.recurring_plan_group_id,
          'required_cycle_credits', coalesce((v_pause->>'required_credits')::integer, 0)
        ),
        updated_at = now()
    where id = p_occurrence_id;
  end if;

  update public.automation_rules
  set generation_occurrence_status = 'failed_terminal',
      generation_occurrence_scheduled_for = v_occurrence.scheduled_for,
      generation_finished_at = now(),
      generation_failure_code = 'insufficient_credits',
      generation_failure_message = left(coalesce(p_message, 'Not enough credits'), 4000),
      generation_customer_message = left(v_customer_message, 1200),
      generation_failure_stage = nullif(trim(coalesce(p_failure_stage, 'credit_cycle_gate')), ''),
      generation_refunded_credits = 0,
      generation_notification_status = 'suppressed',
      updated_at = now()
  where id = p_rule_id;

  update public.automation_run_logs
  set occurrence_id = p_occurrence_id,
      failure_code = 'insufficient_credits',
      failure_customer_message = left(v_customer_message, 1200),
      refunded_credits = 0,
      notification_status = 'suppressed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'admin_rescue_required', false,
        'credit_pause', true,
        'recurring_plan_group_id', v_rule.recurring_plan_group_id
      ),
      updated_at = now()
  where id = v_occurrence.run_log_id
     or occurrence_id = p_occurrence_id;

  return coalesce(v_pause, '{}'::jsonb) || jsonb_build_object(
    'handled', true,
    'occurrence_finalized', true,
    'occurrence_id', p_occurrence_id,
    'automation_rule_id', p_rule_id,
    'customer_message', v_customer_message
  );
end;
$$;

-- At the end of one weekly cycle, reserve the complete next cycle in one
-- transaction. Until every current-cycle reservation has been consumed, the
-- earlier weekday rules simply wait with status=consumed for their next week.
create or replace function public.spreelo_finalize_recurring_plan_credit_cycle(
  p_rule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_group_id uuid;
  v_reserved_count integer := 0;
  v_required integer := 0;
  v_balance integer := 0;
  v_item record;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found or lower(coalesce(v_rule.schedule_type, '')) <> 'weekly' then
    return jsonb_build_object('handled', false, 'reason', 'not_weekly');
  end if;

  v_group_id := v_rule.recurring_plan_group_id;
  if v_group_id is null then
    return jsonb_build_object('handled', false, 'reason', 'missing_group');
  end if;

  perform 1
  from public.automation_rules
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended'
  order by id
  for update;

  if exists (
    select 1
    from public.automation_rules
    where user_id = v_rule.user_id
      and recurring_plan_group_id = v_group_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
      and lower(coalesce(plan_state, 'active')) <> 'ended'
      and coalesce(plan_pause_reason, '') <> ''
  ) then
    return jsonb_build_object('handled', true, 'waiting', false, 'paused', true, 'reason', 'plan_paused');
  end if;

  select count(*) into v_reserved_count
  from public.automation_rules
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended'
    and is_active = true
    and credit_reservation_status = 'reserved';

  if v_reserved_count > 0 then
    return jsonb_build_object(
      'handled', true,
      'waiting', true,
      'remaining_reserved_slots', v_reserved_count,
      'next_reserved', false,
      'paused', false
    );
  end if;

  select coalesce(sum(greatest(coalesce(credit_cost, 1), 1)), 0)
  into v_required
  from public.automation_rules
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended'
    and is_active = true;

  if v_required <= 0 then
    return jsonb_build_object('handled', true, 'waiting', false, 'next_reserved', false, 'paused', false, 'reason', 'no_active_slots');
  end if;

  select credits_remaining into v_balance
  from public.user_credit_balances
  where user_id = v_rule.user_id
  for update;

  if not found or v_balance < v_required then
    return public.spreelo_pause_recurring_plan_for_credits_system(
      p_rule_id,
      'insufficient_credits'
    );
  end if;

  update public.user_credit_balances
  set credits_remaining = credits_remaining - v_required,
      updated_at = now()
  where user_id = v_rule.user_id;

  for v_item in
    select id, brand_profile_id, name, content_type_id,
           greatest(coalesce(credit_cost, 1), 1) as amount
    from public.automation_rules
    where user_id = v_rule.user_id
      and recurring_plan_group_id = v_group_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
      and lower(coalesce(plan_state, 'active')) <> 'ended'
      and is_active = true
  loop
    insert into public.credit_reservation_events (
      user_id, automation_rule_id, brand_profile_id, rule_name,
      content_type_id, event_type, amount, reason, metadata
    ) values (
      v_rule.user_id, v_item.id, v_item.brand_profile_id, v_item.name,
      v_item.content_type_id, 'recurring_cycle_reserved', -v_item.amount,
      'Credits reserved atomically for the next complete recurring weekly cycle',
      jsonb_build_object('recurring_plan_group_id', v_group_id)
    );
  end loop;

  update public.automation_rules
  set credit_reservation_status = 'reserved',
      credit_reserved_amount = greatest(coalesce(credit_cost, 1), 1),
      credit_reserved_at = now(),
      credit_released_at = null,
      plan_pause_reason = null,
      plan_paused_at = null,
      credit_pause_required_amount = null,
      credit_pause_balance_at_pause = null,
      last_error = null,
      updated_at = now()
  where user_id = v_rule.user_id
    and recurring_plan_group_id = v_group_id
    and lower(coalesce(schedule_type, '')) = 'weekly'
    and lower(coalesce(plan_state, 'active')) <> 'ended'
    and is_active = true;

  return jsonb_build_object(
    'handled', true,
    'waiting', false,
    'next_reserved', true,
    'cycle_reserved', true,
    'paused', false,
    'reserved_credits', v_required,
    'credits_remaining', v_balance - v_required,
    'recurring_plan_group_id', v_group_id
  );
end;
$$;

-- The adaptive weekly planner may resolve a different content type/cost at run
-- time. Reconcile the already-held reservation before any paid generation so a
-- more expensive variant can never double-charge or bypass the credit gate.
create or replace function public.spreelo_reconcile_weekly_reservation_for_execution(
  p_rule_id uuid,
  p_required_cost integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_required integer := greatest(coalesce(p_required_cost, 1), 1);
  v_current integer := 0;
  v_delta integer := 0;
  v_balance integer := 0;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found then
    raise exception 'Automation rule not found.';
  end if;

  if lower(coalesce(v_rule.schedule_type, '')) <> 'weekly'
     or v_rule.credit_reservation_status <> 'reserved' then
    return jsonb_build_object(
      'handled', false,
      'funded', false,
      'status', coalesce(v_rule.credit_reservation_status, 'legacy'),
      'required_cost', v_required
    );
  end if;

  v_current := greatest(coalesce(v_rule.credit_reserved_amount, v_rule.credit_cost, 1), 1);
  v_delta := v_required - v_current;

  if v_delta = 0 then
    update public.automation_rules
    set credit_cost = v_required,
        updated_at = now()
    where id = p_rule_id;
    return jsonb_build_object('handled', true, 'funded', true, 'reserved_amount', v_current, 'credit_delta', 0);
  end if;

  select credits_remaining into v_balance
  from public.user_credit_balances
  where user_id = v_rule.user_id
  for update;

  if not found then
    return jsonb_build_object('handled', true, 'funded', false, 'reason', 'missing_credit_balance', 'required_cost', v_required);
  end if;

  if v_delta > 0 and v_balance < v_delta then
    return jsonb_build_object(
      'handled', true,
      'funded', false,
      'reason', 'insufficient_credits',
      'additional_required', v_delta,
      'credits_remaining', v_balance,
      'reserved_amount', v_current,
      'required_cost', v_required
    );
  end if;

  update public.user_credit_balances
  set credits_remaining = credits_remaining - v_delta,
      updated_at = now()
  where user_id = v_rule.user_id;

  update public.automation_rules
  set credit_cost = v_required,
      credit_reserved_amount = v_required,
      credit_reserved_at = case when v_delta > 0 then now() else credit_reserved_at end,
      updated_at = now()
  where id = p_rule_id;

  insert into public.credit_reservation_events (
    user_id, automation_rule_id, brand_profile_id, rule_name,
    content_type_id, event_type, amount, reason, metadata
  ) values (
    v_rule.user_id, v_rule.id, v_rule.brand_profile_id, v_rule.name,
    v_rule.content_type_id,
    case when v_delta > 0 then 'execution_reservation_adjusted_up' else 'execution_reservation_adjusted_down' end,
    -v_delta,
    'Weekly reservation reconciled to the adaptive content cost before generation',
    jsonb_build_object('previous_reserved_amount', v_current, 'required_cost', v_required)
  );

  return jsonb_build_object(
    'handled', true,
    'funded', true,
    'reserved_amount', v_required,
    'credit_delta', v_delta,
    'credits_remaining', v_balance - v_delta
  );
end;
$$;

-- v144.183 replaces the old "consume and immediately reserve this one weekday"
-- behavior. A weekday becomes consumed; only the last funded weekday in the
-- cycle reserves the complete next cycle atomically.
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
  v_cycle jsonb;
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
    user_id, automation_rule_id, brand_profile_id, rule_name,
    content_type_id, event_type, amount, reason, metadata
  ) values (
    v_rule.user_id, p_rule_id, v_rule.brand_profile_id, v_rule.name,
    v_rule.content_type_id, 'consumed', 0,
    'Reserved credits were used when the planned post was created',
    jsonb_build_object('post_id', p_post_id, 'credit_cost', v_cost)
  );

  update public.automation_rules
  set credit_reservation_status = 'consumed',
      credit_reserved_amount = 0,
      credit_consumed_at = now(),
      updated_at = now()
  where id = p_rule_id;

  if lower(coalesce(v_rule.schedule_type, '')) = 'weekly'
     and v_rule.is_active = true
     and lower(coalesce(v_rule.plan_state, 'active')) <> 'ended' then
    v_cycle := public.spreelo_finalize_recurring_plan_credit_cycle(p_rule_id);
    return coalesce(v_cycle, '{}'::jsonb) || jsonb_build_object(
      'handled', true,
      'consumed_credit', v_cost
    );
  end if;

  return jsonb_build_object(
    'handled', true,
    'next_reserved', false,
    'paused', false,
    'status', 'consumed',
    'consumed_credit', v_cost
  );
end;
$$;

-- v144.111 may already have reserved one future occurrence after an admin-rescue
-- failure. Release only that *next* reservation and put the rule back into the
-- shared cycle barrier so the next cycle remains all-or-nothing.
create or replace function public.spreelo_defer_recurring_rule_reservation_to_cycle_system(
  p_rule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_amount integer := 0;
  v_released integer := 0;
  v_cycle jsonb;
  v_next_run_at timestamptz;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found or lower(coalesce(v_rule.schedule_type, '')) <> 'weekly' then
    return jsonb_build_object('handled', false, 'status', 'missing_or_not_weekly');
  end if;

  -- v144.111 may already have reserved this rule's next individual occurrence.
  -- Return only that future reservation. The failed occurrence's already-held
  -- rescue credit remains consumed and is not refunded here.
  if v_rule.credit_reservation_status = 'reserved' then
    v_amount := greatest(coalesce(v_rule.credit_reserved_amount, v_rule.credit_cost, 1), 1);

    update public.user_credit_balances
    set credits_remaining = credits_remaining + v_amount,
        updated_at = now()
    where user_id = v_rule.user_id;

    if found then
      v_released := v_amount;
      insert into public.credit_reservation_events (
        user_id, automation_rule_id, brand_profile_id, rule_name,
        content_type_id, event_type, amount, reason, metadata
      ) values (
        v_rule.user_id, v_rule.id, v_rule.brand_profile_id, v_rule.name,
        v_rule.content_type_id, 'recurring_individual_reservation_deferred', v_amount,
        'Individual next-week reservation returned so the complete next recurring cycle can be reserved atomically',
        jsonb_build_object('recurring_plan_group_id', v_rule.recurring_plan_group_id)
      );
    end if;
  end if;

  -- If the older failure RPC could not fund this weekday's next occurrence it
  -- may have set is_active=false and next_run_at=null. Restore the weekday to
  -- the shared cycle barrier instead of silently losing it from the plan.
  v_next_run_at := coalesce(
    v_rule.next_run_at,
    public.spreelo_next_weekly_run_at_v144183(
      v_rule.weekday,
      v_rule.publish_time::time,
      v_rule.timezone
    )
  );

  update public.automation_rules
  set is_active = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then is_active
        else true
      end,
      plan_state = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then plan_state
        else 'active'
      end,
      plan_pause_reason = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then plan_pause_reason
        else null
      end,
      plan_paused_at = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then plan_paused_at
        else null
      end,
      credit_pause_required_amount = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then credit_pause_required_amount
        else null
      end,
      credit_pause_balance_at_pause = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then credit_pause_balance_at_pause
        else null
      end,
      credit_reservation_status = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then credit_reservation_status
        else 'consumed'
      end,
      credit_reserved_amount = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then credit_reserved_amount
        else 0
      end,
      credit_released_at = case
        when v_released > 0 then now()
        else credit_released_at
      end,
      next_run_at = case
        when lower(coalesce(plan_state, 'active')) = 'ended' then next_run_at
        else v_next_run_at
      end,
      queue_locked_until = null,
      retry_not_before = null,
      updated_at = now()
  where id = p_rule_id;

  v_cycle := public.spreelo_finalize_recurring_plan_credit_cycle(p_rule_id);
  return coalesce(v_cycle, '{}'::jsonb) || jsonb_build_object(
    'handled', true,
    'released_individual_next_credit', v_released,
    'restored_to_cycle_barrier', true,
    'next_run_at', v_next_run_at
  );
end;
$$;

-- Resume one or more plans that Spreelo itself paused for insufficient credits.
-- The full next cycle is reserved before any rule becomes active again.
create or replace function public.spreelo_resume_credit_paused_recurring_plans_system(
  p_user_id uuid,
  p_rule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filter_group uuid := null;
  v_group record;
  v_required integer := 0;
  v_balance integer := 0;
  v_resumed_plans integer := 0;
  v_resumed_rules integer := 0;
  v_group_resumed_rules integer := 0;
  v_item record;
  v_last_required integer := 0;
  v_last_available integer := 0;
begin
  if p_user_id is null then
    return jsonb_build_object('resumed_plans', 0, 'resumed_rules', 0);
  end if;

  if p_rule_id is not null then
    select recurring_plan_group_id into v_filter_group
    from public.automation_rules
    where id = p_rule_id
      and user_id = p_user_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
    limit 1;

    if v_filter_group is null then
      return jsonb_build_object('resumed', false, 'reason', 'plan_not_found');
    end if;
  end if;

  for v_group in
    select recurring_plan_group_id as group_id,
           min(plan_paused_at) as paused_at
    from public.automation_rules
    where user_id = p_user_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
      and lower(coalesce(plan_state, 'active')) = 'paused'
      and plan_pause_reason = 'insufficient_credits'
      and recurring_plan_group_id is not null
      and (v_filter_group is null or recurring_plan_group_id = v_filter_group)
    group by recurring_plan_group_id
    order by min(plan_paused_at) nulls last, recurring_plan_group_id
  loop
    perform 1
    from public.automation_rules
    where user_id = p_user_id
      and recurring_plan_group_id = v_group.group_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
      and lower(coalesce(plan_state, 'active')) <> 'ended'
    order by id
    for update;

    select coalesce(sum(greatest(coalesce(credit_cost, 1), 1)), 0)
    into v_required
    from public.automation_rules
    where user_id = p_user_id
      and recurring_plan_group_id = v_group.group_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
      and lower(coalesce(plan_state, 'active')) <> 'ended';

    select credits_remaining into v_balance
    from public.user_credit_balances
    where user_id = p_user_id
    for update;

    if not found then
      v_balance := 0;
    end if;

    v_last_required := v_required;
    v_last_available := v_balance;

    update public.automation_rules
    set credit_pause_required_amount = v_required,
        credit_pause_balance_at_pause = greatest(v_balance, 0),
        updated_at = now()
    where user_id = p_user_id
      and recurring_plan_group_id = v_group.group_id
      and plan_pause_reason = 'insufficient_credits';

    if v_required <= 0 or v_balance < v_required then
      continue;
    end if;

    update public.user_credit_balances
    set credits_remaining = credits_remaining - v_required,
        updated_at = now()
    where user_id = p_user_id;

    for v_item in
      select id, brand_profile_id, name, content_type_id,
             greatest(coalesce(credit_cost, 1), 1) as amount
      from public.automation_rules
      where user_id = p_user_id
        and recurring_plan_group_id = v_group.group_id
        and lower(coalesce(schedule_type, '')) = 'weekly'
        and lower(coalesce(plan_state, 'active')) <> 'ended'
    loop
      insert into public.credit_reservation_events (
        user_id, automation_rule_id, brand_profile_id, rule_name,
        content_type_id, event_type, amount, reason, metadata
      ) values (
        p_user_id, v_item.id, v_item.brand_profile_id, v_item.name,
        v_item.content_type_id, 'recurring_plan_auto_resumed_reserved', -v_item.amount,
        'Credits reserved for the complete next cycle when a credit-paused recurring plan resumed',
        jsonb_build_object('recurring_plan_group_id', v_group.group_id)
      );
    end loop;

    update public.automation_rules
    set is_active = true,
        plan_state = 'active',
        plan_pause_reason = null,
        plan_paused_at = null,
        credit_pause_required_amount = null,
        credit_pause_balance_at_pause = null,
        credit_reservation_status = 'reserved',
        credit_reserved_amount = greatest(coalesce(credit_cost, 1), 1),
        credit_reserved_at = now(),
        credit_released_at = null,
        next_run_at = public.spreelo_next_weekly_run_at_v144183(weekday, publish_time::time, timezone),
        queue_locked_until = null,
        retry_not_before = null,
        last_error = null,
        updated_at = now()
    where user_id = p_user_id
      and recurring_plan_group_id = v_group.group_id
      and lower(coalesce(schedule_type, '')) = 'weekly'
      and lower(coalesce(plan_state, 'active')) <> 'ended';

    get diagnostics v_group_resumed_rules = row_count;
    v_resumed_rules := v_resumed_rules + v_group_resumed_rules;
    v_resumed_plans := v_resumed_plans + 1;
    v_last_available := v_balance - v_required;

    if v_filter_group is not null then
      return jsonb_build_object(
        'resumed', true,
        'resumed_plans', 1,
        'resumed_rules', v_group_resumed_rules,
        'required_credits', v_required,
        'credits_remaining', v_last_available,
        'recurring_plan_group_id', v_group.group_id
      );
    end if;
  end loop;

  if v_filter_group is not null then
    return jsonb_build_object(
      'resumed', false,
      'resumed_plans', 0,
      'resumed_rules', 0,
      'required_credits', v_last_required,
      'credits_remaining', v_last_available,
      'recurring_plan_group_id', v_filter_group
    );
  end if;

  return jsonb_build_object(
    'resumed_plans', v_resumed_plans,
    'resumed_rules', v_resumed_rules,
    'credits_remaining', v_last_available
  );
end;
$$;

-- Authenticated customer action: retry only the selected credit-paused plan.
create or replace function public.resume_credit_paused_recurring_plan(p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  if not exists (
    select 1 from public.automation_rules
    where id = p_rule_id and user_id = v_user_id
  ) then
    raise exception 'Recurring plan not found.';
  end if;

  return public.spreelo_resume_credit_paused_recurring_plans_system(v_user_id, p_rule_id);
end;
$$;

-- Balance increases are the single reliable event shared by monthly renewal,
-- annual monthly refreshes, purchased credit packs, and audited admin top-ups.
-- Auto-resume is best-effort and must never make a legitimate credit grant fail.
create or replace function public.spreelo_auto_resume_credit_paused_plans_on_balance_increase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if greatest(coalesce(new.credits_remaining, 0), 0) > greatest(coalesce(old.credits_remaining, 0), 0) then
    begin
      perform public.spreelo_resume_credit_paused_recurring_plans_system(new.user_id, null);
    exception when others then
      -- Never roll back a Stripe renewal/top-up merely because a plan cannot be
      -- resumed (for example because another entitlement now occupies the slot).
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists spreelo_auto_resume_credit_paused_plans
  on public.user_credit_balances;
create trigger spreelo_auto_resume_credit_paused_plans
after update of credits_remaining on public.user_credit_balances
for each row
when (new.credits_remaining > old.credits_remaining)
execute function public.spreelo_auto_resume_credit_paused_plans_on_balance_increase();

-- Keep the plan entitlement grouping aligned with the new stable group id while
-- preserving the historical fallback for any legacy/null record.
create or replace function public.spreelo_enforce_recurring_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := coalesce(public.spreelo_entitlement_plan(new.user_id), 'free');
  v_limit integer := public.spreelo_entitlement_limit(new.user_id, 'recurring_plans');
  v_same_group_active boolean := false;
  v_count integer := 0;
  v_fallback_key text;
begin
  if public.spreelo_is_plan_limit_admin(new.user_id) then
    return new;
  end if;

  if lower(coalesce(new.schedule_type, '')) <> 'weekly'
     or coalesce(new.is_active, false) is not true
     or lower(coalesce(new.queue_source, 'content_studio')) = 'campaign'
     or lower(coalesce(new.plan_state, 'active')) = 'ended' then
    return new;
  end if;

  if new.recurring_plan_group_id is not null then
    select exists (
      select 1
      from public.automation_rules r
      where r.user_id = new.user_id
        and r.brand_profile_id is not distinct from new.brand_profile_id
        and (new.id is null or r.id <> new.id)
        and r.recurring_plan_group_id = new.recurring_plan_group_id
        and lower(coalesce(r.schedule_type, '')) = 'weekly'
        and coalesce(r.is_active, false) is true
        and lower(coalesce(r.queue_source, 'content_studio')) <> 'campaign'
        and lower(coalesce(r.plan_state, 'active')) <> 'ended'
    ) into v_same_group_active;
  else
    v_fallback_key := concat_ws('|',
      coalesce(nullif(trim(new.name), ''), nullif(trim(new.content_type_label), ''), nullif(trim(new.post_type), ''), ''),
      lower(coalesce(new.schedule_type, '')),
      lower(coalesce(nullif(trim(new.queue_source), ''), 'content_studio')),
      to_char(date_trunc('minute', coalesce(new.created_at, now())), 'YYYY-MM-DD"T"HH24:MI')
    );
    select exists (
      select 1 from public.automation_rules r
      where r.user_id = new.user_id
        and r.brand_profile_id is not distinct from new.brand_profile_id
        and (new.id is null or r.id <> new.id)
        and lower(coalesce(r.schedule_type, '')) = 'weekly'
        and coalesce(r.is_active, false) is true
        and lower(coalesce(r.queue_source, 'content_studio')) <> 'campaign'
        and lower(coalesce(r.plan_state, 'active')) <> 'ended'
        and concat_ws('|',
          coalesce(nullif(trim(r.name), ''), nullif(trim(r.content_type_label), ''), nullif(trim(r.post_type), ''), ''),
          lower(coalesce(r.schedule_type, '')),
          lower(coalesce(nullif(trim(r.queue_source), ''), 'content_studio')),
          to_char(date_trunc('minute', r.created_at), 'YYYY-MM-DD"T"HH24:MI')
        ) = v_fallback_key
    ) into v_same_group_active;
  end if;

  if v_same_group_active then
    return new;
  end if;

  select count(*) into v_count
  from (
    select distinct coalesce(
      r.recurring_plan_group_id::text,
      concat_ws('|',
        coalesce(nullif(trim(r.name), ''), nullif(trim(r.content_type_label), ''), nullif(trim(r.post_type), ''), ''),
        lower(coalesce(r.schedule_type, '')),
        lower(coalesce(nullif(trim(r.queue_source), ''), 'content_studio')),
        to_char(date_trunc('minute', r.created_at), 'YYYY-MM-DD"T"HH24:MI')
      )
    ) as group_key
    from public.automation_rules r
    where r.user_id = new.user_id
      and r.brand_profile_id is not distinct from new.brand_profile_id
      and (new.id is null or r.id <> new.id)
      and lower(coalesce(r.schedule_type, '')) = 'weekly'
      and coalesce(r.is_active, false) is true
      and lower(coalesce(r.queue_source, 'content_studio')) <> 'campaign'
      and lower(coalesce(r.plan_state, 'active')) <> 'ended'
  ) active_groups;

  if v_count >= v_limit then
    raise exception 'SPREELO_PLAN_LIMIT|recurring_plans|%|%', v_limit, v_plan;
  end if;
  return new;
end;
$$;

-- The trigger may already exist from prior versions; recreate it so changes to
-- the stable group id are also covered.
drop trigger if exists spreelo_plan_recurring_plan_limit on public.automation_rules;
create trigger spreelo_plan_recurring_plan_limit
before insert or update of is_active, plan_state, brand_profile_id, schedule_type, queue_source, recurring_plan_group_id
on public.automation_rules
for each row execute function public.spreelo_enforce_recurring_plan_limit();

revoke all on function public.spreelo_pause_recurring_plan_for_credits_system(uuid, text) from public, anon, authenticated;
revoke all on function public.spreelo_pause_recurring_occurrence_for_credit_shortage(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.spreelo_finalize_recurring_plan_credit_cycle(uuid) from public, anon, authenticated;
revoke all on function public.spreelo_reconcile_weekly_reservation_for_execution(uuid, integer) from public, anon, authenticated;
revoke all on function public.spreelo_defer_recurring_rule_reservation_to_cycle_system(uuid) from public, anon, authenticated;
revoke all on function public.spreelo_resume_credit_paused_recurring_plans_system(uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_reserved_automation_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resume_credit_paused_recurring_plan(uuid) from public, anon;

grant execute on function public.spreelo_pause_recurring_plan_for_credits_system(uuid, text) to service_role;
grant execute on function public.spreelo_pause_recurring_occurrence_for_credit_shortage(uuid, uuid, text, text) to service_role;
grant execute on function public.spreelo_finalize_recurring_plan_credit_cycle(uuid) to service_role;
grant execute on function public.spreelo_reconcile_weekly_reservation_for_execution(uuid, integer) to service_role;
grant execute on function public.spreelo_defer_recurring_rule_reservation_to_cycle_system(uuid) to service_role;
grant execute on function public.spreelo_resume_credit_paused_recurring_plans_system(uuid, uuid) to service_role;
grant execute on function public.consume_reserved_automation_credit(uuid, uuid) to service_role;
grant execute on function public.resume_credit_paused_recurring_plan(uuid) to authenticated;

commit;
