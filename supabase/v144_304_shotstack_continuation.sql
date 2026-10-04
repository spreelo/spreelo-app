-- v144.304: provider waiting is continuation, not a new generation attempt.
-- Run before deploying this version. No existing occurrences are modified by this migration.
begin;
create or replace function public.defer_automation_occurrence_for_shotstack(
  p_occurrence_id uuid,
  p_post_id uuid,
  p_render_id text,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence public.automation_occurrences%rowtype;
  v_rule_id uuid;
  v_retry_at timestamptz := clock_timestamp() + interval '90 seconds';
begin
  select automation_rule_id into v_rule_id from public.automation_occurrences where id=p_occurrence_id;
  perform 1 from public.automation_rules where id=v_rule_id for update;
  select * into v_occurrence
  from public.automation_occurrences
  where id = p_occurrence_id
  for update;

  if not found then
    raise exception 'Automation occurrence not found.';
  end if;

  if v_occurrence.status in ('completed', 'failed_terminal') then
    return jsonb_build_object(
      'handled', false,
      'exhausted', true,
      'status', v_occurrence.status,
      'retry_count', coalesce(v_occurrence.retry_count, 0)
    );
  end if;

  if not exists(select 1 from public.posts p where p.id=p_post_id
    and p.automation_rule_id=v_occurrence.automation_rule_id
    and p.video_render_id=p_render_id and p.video_status <> 'ready') then
    raise exception 'Saved Shotstack post/render does not match the occurrence.';
  end if;

  update public.automation_occurrences
  set status = 'retry_pending',
      retry_not_before = v_retry_at,
      failure_code = 'shotstack_waiting',
      failure_stage = 'shotstack_waiting',
      failure_message_internal = 'Waiting for existing Shotstack job; no new generation.',
      failure_message_customer = 'The existing video job is still processing. Spreelo will continue checking it.',
      notification_status = 'suppressed',
      metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object(
          'shotstack_post_id', p_post_id,
          'shotstack_render_id', p_render_id,
          'shotstack_last_status', p_status,
          'shotstack_continuation', true,
          'retry_at', v_retry_at,
          'new_generation', false
        ),
      updated_at = clock_timestamp()
  where id = p_occurrence_id;

  update public.automation_rules
  set queue_locked_until = null,
      retry_not_before = v_retry_at,
      product_retry_reason = 'Waiting for existing Shotstack job; no new generation.',
      last_error = null,
      generation_occurrence_status = 'retry_pending',
      generation_finished_at = null,
      generation_failure_code = 'shotstack_waiting',
      generation_failure_message = 'Waiting for existing Shotstack job; no new generation.',
      generation_customer_message = 'The existing video job is still processing. Spreelo will continue checking it.',
      generation_failure_stage = 'shotstack_waiting',
      generation_refunded_credits = 0,
      generation_notification_status = 'suppressed',
      updated_at = clock_timestamp()
  where id = v_occurrence.automation_rule_id;

  return jsonb_build_object(
    'handled', true,
    'exhausted', false,
    'status', 'retry_pending',
    'retry_at', v_retry_at,
    'retry_after_ms', 90000
  );
end;
$$;

revoke all on function public.defer_automation_occurrence_for_shotstack(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.defer_automation_occurrence_for_shotstack(
  uuid, uuid, text, text
) to service_role;


-- Recover a saved render after a worker/process interruption using the same atomic claim.
create or replace function public.claim_automation_occurrence_once(
  p_rule_id uuid,
  p_scheduled_for timestamptz,
  p_run_log_id uuid default null,
  p_worker_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_occurrence public.automation_occurrences%rowtype;
begin
  select * into v_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if not found then
    raise exception 'Automation rule not found.';
  end if;

  select * into v_occurrence
  from public.automation_occurrences
  where automation_rule_id = p_rule_id
    and scheduled_for = p_scheduled_for
    and attempt_kind = 'automatic'
  limit 1
  for update;

  if found then
    if (v_occurrence.status = 'retry_pending'
       and (v_occurrence.retry_not_before is null or v_occurrence.retry_not_before <= now()))
       or (v_occurrence.status = 'running' and exists (
         select 1 from public.posts p where p.automation_rule_id=p_rule_id
           and p.status in ('generating','pending_approval') and p.video_provider='shotstack'
           and p.scheduled_for=p_scheduled_for
           and (p.video_render_id is not null or p.video_background_selection ? 'shotstack_checkpoint')
           and p.updated_at < now() - interval '15 minutes'
       )) then
      -- A terminated worker may leave a saved provider job. Lease its existing
      -- post atomically before releasing the occurrence lock; never resubmit.
      update public.posts set updated_at=now() where automation_rule_id=p_rule_id
        and status in ('generating','pending_approval') and video_provider='shotstack'
        and scheduled_for=p_scheduled_for
        and (video_render_id is not null or video_background_selection ? 'shotstack_checkpoint');
      update public.automation_occurrences
      set status = 'running',
          run_log_id = p_run_log_id,
          worker_name = nullif(trim(coalesce(p_worker_name, '')), ''),
          retry_not_before = null,
          finished_at = null,
          failure_code = null,
          failure_stage = null,
          failure_message_internal = null,
          failure_message_customer = null,
          refunded_credits = 0,
          notification_status = 'not_applicable',
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'resumed_after_website_rate_limit', true,
            'resumed_at', now()
          )
      where id = v_occurrence.id
      returning * into v_occurrence;

      update public.automation_rules
      set generation_occurrence_status = 'running',
          generation_started_at = coalesce(generation_started_at, now()),
          generation_finished_at = null,
          generation_failure_code = null,
          generation_failure_message = null,
          generation_customer_message = null,
          generation_failure_stage = null,
          generation_refunded_credits = 0,
          generation_notification_status = null,
          generation_notification_sent_at = null,
          retry_not_before = null,
          queue_locked_until = greatest(
            coalesce(queue_locked_until, now()),
            now() + interval '15 minutes'
          ),
          updated_at = now()
      where id = p_rule_id;

      update public.automation_run_logs
      set scheduled_for = p_scheduled_for,
          occurrence_id = v_occurrence.id,
          attempt_kind = 'automatic',
          updated_at = now()
      where id = p_run_log_id;

      return jsonb_build_object(
        'claimed', true,
        'resumed', true,
        'occurrence_id', v_occurrence.id,
        'status', v_occurrence.status,
        'started_at', v_occurrence.started_at,
        'retry_count', v_occurrence.retry_count
      );
    end if;

    update public.automation_occurrences
    set blocked_claim_count = blocked_claim_count + 1,
        updated_at = now()
    where id = v_occurrence.id;

    update public.automation_rules
    set queue_locked_until = null,
        updated_at = now()
    where id = p_rule_id;

    return jsonb_build_object(
      'claimed', false,
      'occurrence_id', v_occurrence.id,
      'status', v_occurrence.status,
      'started_at', v_occurrence.started_at,
      'retry_not_before', v_occurrence.retry_not_before
    );
  end if;

  insert into public.automation_occurrences (
    automation_rule_id,
    user_id,
    brand_profile_id,
    scheduled_for,
    attempt_kind,
    status,
    automatic_run_count,
    run_log_id,
    worker_name,
    rule_name,
    content_type_id,
    content_type_label,
    content_format,
    campaign_title,
    notification_status
  ) values (
    v_rule.id,
    v_rule.user_id,
    v_rule.brand_profile_id,
    p_scheduled_for,
    'automatic',
    'running',
    1,
    p_run_log_id,
    nullif(trim(coalesce(p_worker_name, '')), ''),
    v_rule.name,
    v_rule.content_type_id,
    v_rule.content_type_label,
    v_rule.content_format,
    v_rule.name,
    'not_applicable'
  ) returning * into v_occurrence;

  update public.automation_rules
  set generation_occurrence_status = 'running',
      generation_occurrence_scheduled_for = p_scheduled_for,
      generation_started_at = v_occurrence.started_at,
      generation_finished_at = null,
      generation_failure_code = null,
      generation_failure_message = null,
      generation_customer_message = null,
      generation_failure_stage = null,
      generation_refunded_credits = 0,
      generation_notification_status = null,
      generation_notification_sent_at = null,
      updated_at = now()
  where id = p_rule_id;

  update public.automation_run_logs
  set scheduled_for = p_scheduled_for,
      occurrence_id = v_occurrence.id,
      attempt_kind = 'automatic',
      updated_at = now()
  where id = p_run_log_id;

  return jsonb_build_object(
    'claimed', true,
    'resumed', false,
    'occurrence_id', v_occurrence.id,
    'status', v_occurrence.status,
    'started_at', v_occurrence.started_at
  );
end;
$$;
commit;
