-- Spreelo v144.180
-- Cardless Free trial, one-trial-per-social-account abuse protection,
-- per-plan brand-analysis quotas, and durable usage-alert deduplication.
--
-- Run this migration before deploying v144.180.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Free-trial state. Locked credits are deliberately NOT placed in the spendable
-- credits_remaining balance. They are granted atomically only after a verified,
-- eligible social account is connected.
-- ---------------------------------------------------------------------------
alter table public.user_credit_balances
  add column if not exists free_trial_status text not null default 'locked',
  add column if not exists free_trial_started_at timestamptz,
  add column if not exists free_trial_ends_at timestamptz,
  add column if not exists free_trial_credit_amount integer not null default 100,
  add column if not exists analysis_quota_timezone text;

alter table public.user_credit_balances
  drop constraint if exists user_credit_balances_free_trial_status_check;
alter table public.user_credit_balances
  add constraint user_credit_balances_free_trial_status_check
  check (free_trial_status in ('locked','active','used','expired'));

-- Existing paid/admin accounts are never converted into a new Free trial.
update public.user_credit_balances
set free_trial_status = 'used',
    free_trial_credit_amount = 100
where public.spreelo_is_plan_limit_admin(user_id)
   or lower(coalesce(subscription_plan, plan_name, 'free')) <> 'free'
   or provider_subscription_id is not null;

-- Clean launch: there are no production customers yet, so every ordinary Free
-- workspace starts from the same locked, non-spendable 100-credit offer. This
-- also removes any stale legacy Free balance that could bypass social verification.
update public.user_credit_balances
set free_trial_status = 'locked',
    free_trial_started_at = null,
    free_trial_ends_at = null,
    free_trial_credit_amount = 100,
    credits_remaining = 0,
    monthly_credit_limit = 0,
    purchased_credits_remaining = 0,
    subscription_status = 'free',
    trial_start = null,
    trial_end = null
where lower(coalesce(subscription_plan, plan_name, 'free')) = 'free'
  and provider_subscription_id is null
  and not public.spreelo_is_plan_limit_admin(user_id);

-- Legacy Stripe trial reservations that never activated must not become
-- permanent domain blocks in the new cardless system.
delete from public.trial_business_claims
where status = 'pending';

-- Replace the old Stripe-trial-era initializer with the cardless-trial
-- initializer. A new Free account starts with zero spendable credits while the
-- UI can safely present the 100-credit offer from free_trial_credit_amount.
create or replace function public.initialize_new_credit_balance_free_v144180()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.provider_subscription_id,'')),'') is null then
    new.credits_remaining := 0;
    new.monthly_credit_limit := 0;
    new.plan_name := 'Free';
    new.subscription_plan := 'free';
    new.subscription_status := 'free';
    new.purchased_credits_remaining := 0;
    new.cancel_at_period_end := false;
    new.free_trial_status := case when public.spreelo_is_plan_limit_admin(new.user_id) then 'used' else 'locked' end;
    new.free_trial_started_at := null;
    new.free_trial_ends_at := null;
    new.free_trial_credit_amount := 100;
  end if;
  return new;
end;
$$;

drop trigger if exists user_credit_balances_free_default_v14378 on public.user_credit_balances;
drop trigger if exists user_credit_balances_free_default_v144180 on public.user_credit_balances;
create trigger user_credit_balances_free_default_v144180
before insert on public.user_credit_balances
for each row execute function public.initialize_new_credit_balance_free_v144180();
drop function if exists public.initialize_new_credit_balance_free_v14378();

-- Stable platform-account identity. Pinterest keeps its account id here even
-- after page_id changes to a selected board id.
alter table public.social_connections
  add column if not exists external_account_id text;

update public.social_connections
set external_account_id = page_id
where external_account_id is null
  and platform in ('facebook','instagram','threads','tiktok','youtube');

create table if not exists public.trial_social_account_claims (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  account_fingerprint text not null,
  user_id uuid,
  brand_profile_id uuid,
  status text not null default 'consumed' check (status in ('active','consumed')),
  trial_started_at timestamptz not null default now(),
  trial_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, account_fingerprint)
);
create index if not exists trial_social_account_claims_user_idx
  on public.trial_social_account_claims(user_id, created_at desc);
alter table public.trial_social_account_claims enable row level security;
revoke all on public.trial_social_account_claims from public, anon, authenticated;

-- Free users may connect exactly one social account so the cardless trial can
-- be activated. Paid plan capacities remain unchanged.
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
      when 'growth' then 2
      when 'pro' then 5
      else 1
    end;
  elsif p_resource = 'social_accounts' then
    return case v_plan
      when 'starter' then 1
      when 'growth' then 5
      when 'pro' then 2147483647
      else 1
    end;
  elsif p_resource = 'recurring_plans' then
    return case v_plan
      when 'starter' then 1
      when 'growth' then 3
      when 'pro' then 8
      else 0
    end;
  end if;
  raise exception 'Unknown Spreelo entitlement resource: %', p_resource;
end;
$$;

-- Server-only claim. The application computes a deterministic HMAC fingerprint
-- from platform + verified external account id; raw social ids are not stored in
-- this anti-abuse table.
create or replace function public.claim_spreelo_social_trial(
  p_user_id uuid,
  p_brand_profile_id uuid,
  p_platform text,
  p_account_fingerprint text,
  p_external_account_id text,
  p_domain_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_fingerprint text := trim(coalesce(p_account_fingerprint,''));
  v_external_account_id text := trim(coalesce(p_external_account_id,''));
  v_domain text := lower(trim(coalesce(p_domain_key,'')));
  v_plan text;
  v_balance public.user_credit_balances%rowtype;
  v_social_claim public.trial_social_account_claims%rowtype;
  v_domain_claim public.trial_business_claims%rowtype;
  v_now timestamptz := now();
  v_trial_end timestamptz := now() + interval '14 days';
  v_grant integer := 100;
  v_before integer := 0;
  v_after integer := 0;
begin
  if p_user_id is null or p_brand_profile_id is null then
    raise exception 'Trial user and brand are required.';
  end if;
  if v_platform = '' or v_fingerprint = '' or v_external_account_id = '' then
    raise exception 'Verified social account identity is required.';
  end if;

  if not exists(
    select 1 from public.brand_profiles
    where id = p_brand_profile_id and user_id = p_user_id
  ) then
    raise exception 'Brand profile does not belong to the user.';
  end if;

  -- The verified OAuth connection must already be durably saved before a free
  -- trial can be activated. This prevents credits being granted if the social
  -- connection write later fails. The raw id is used only for this verification;
  -- the anti-abuse registry stores the HMAC fingerprint instead.
  if not exists(
    select 1 from public.social_connections
    where user_id = p_user_id
      and brand_profile_id = p_brand_profile_id
      and lower(coalesce(platform,'')) = v_platform
      and coalesce(external_account_id, page_id, '') = v_external_account_id
      and lower(coalesce(status,'')) = 'connected'
  ) then
    raise exception 'Verified social connection must be saved before trial activation.';
  end if;

  if public.spreelo_is_plan_limit_admin(p_user_id) then
    return jsonb_build_object('allowed', true, 'reason', 'admin', 'trialActivated', false);
  end if;

  v_plan := coalesce(public.spreelo_entitlement_plan(p_user_id), 'free');
  if v_plan in ('starter','growth','pro') then
    return jsonb_build_object('allowed', true, 'reason', 'paid_plan', 'trialActivated', false);
  end if;

  -- Serialize trial claims per Spreelo account so two simultaneous OAuth
  -- callbacks cannot activate multiple trials.
  perform pg_advisory_xact_lock(hashtext('spreelo-free-trial:' || p_user_id::text));
  if v_domain <> '' then
    perform pg_advisory_xact_lock(hashtext('spreelo-free-trial-domain:' || v_domain));
  end if;

  select * into v_balance
  from public.user_credit_balances
  where user_id = p_user_id
  for update;
  if not found then
    raise exception 'No credit balance exists for this Spreelo account.';
  end if;

  select * into v_social_claim
  from public.trial_social_account_claims
  where platform = v_platform and account_fingerprint = v_fingerprint
  for update;

  if found then
    if v_social_claim.user_id = p_user_id and v_balance.free_trial_status = 'active' then
      -- Reconnecting the same account during its still-active trial is safe and
      -- never grants a second batch of credits. Once the trial is expired/used,
      -- Free must upgrade before reconnecting a trial-consumed social account.
      return jsonb_build_object(
        'allowed', true,
        'reason', 'same_account_reconnect',
        'trialActivated', false,
        'trialStatus', v_balance.free_trial_status,
        'trialEndsAt', v_balance.free_trial_ends_at
      );
    end if;
    update public.social_connections
    set status='disconnected',
        page_access_token=null, refresh_token=null, token_expires_at=null, refresh_token_expires_at=null,
        updated_at=v_now
    where user_id=p_user_id and brand_profile_id=p_brand_profile_id
      and lower(coalesce(platform,''))=v_platform
      and coalesce(external_account_id,page_id,'')=v_external_account_id;
    return jsonb_build_object(
      'allowed', false,
      'reason', case when v_social_claim.user_id = p_user_id then 'trial_account_already_used' else 'trial_social_account_used' end
    );
  end if;

  if v_balance.free_trial_status <> 'locked' then
    update public.social_connections
    set status='disconnected',
        page_access_token=null, refresh_token=null, token_expires_at=null, refresh_token_expires_at=null,
        updated_at=v_now
    where user_id=p_user_id and brand_profile_id=p_brand_profile_id
      and lower(coalesce(platform,''))=v_platform
      and coalesce(external_account_id,page_id,'')=v_external_account_id;
    return jsonb_build_object('allowed', false, 'reason', 'trial_account_already_used');
  end if;

  -- Keep the existing business-domain history as a secondary abuse signal. A
  -- missing website/domain does not block the new social-account-based trial.
  if v_domain <> '' then
    select * into v_domain_claim
    from public.trial_business_claims
    where domain_key = v_domain
    for update;

    if found and v_domain_claim.user_id is distinct from p_user_id then
      update public.social_connections
      set status='disconnected',
          page_access_token=null, refresh_token=null, token_expires_at=null, refresh_token_expires_at=null,
          updated_at=v_now
      where user_id=p_user_id and brand_profile_id=p_brand_profile_id
        and lower(coalesce(platform,''))=v_platform
        and coalesce(external_account_id,page_id,'')=v_external_account_id;
      return jsonb_build_object('allowed', false, 'reason', 'trial_business_already_used');
    end if;
  end if;

  insert into public.trial_social_account_claims(
    platform, account_fingerprint, user_id, brand_profile_id,
    status, trial_started_at, created_at, updated_at
  ) values (
    v_platform, v_fingerprint, p_user_id, p_brand_profile_id,
    'active', v_now, v_now, v_now
  );

  if v_domain <> '' then
    insert into public.trial_business_claims(
      domain_key, user_id, brand_profile_id, status,
      pending_expires_at, trial_started_at, created_at, updated_at
    ) values (
      v_domain, p_user_id, p_brand_profile_id, 'active',
      null, v_now, v_now, v_now
    )
    on conflict(domain_key) do update
      set user_id = coalesce(public.trial_business_claims.user_id, excluded.user_id),
          brand_profile_id = coalesce(public.trial_business_claims.brand_profile_id, excluded.brand_profile_id),
          status = case when public.trial_business_claims.user_id = excluded.user_id then 'active' else public.trial_business_claims.status end,
          pending_expires_at = null,
          trial_started_at = coalesce(public.trial_business_claims.trial_started_at, excluded.trial_started_at),
          updated_at = v_now;
  end if;

  v_grant := greatest(coalesce(v_balance.free_trial_credit_amount, 100), 0);
  v_before := greatest(coalesce(v_balance.credits_remaining, 0), 0);
  v_after := v_before + v_grant;

  update public.user_credit_balances
  set credits_remaining = v_after,
      monthly_credit_limit = greatest(coalesce(monthly_credit_limit, 0), v_grant),
      plan_name = 'Free',
      subscription_plan = 'free',
      subscription_status = 'free',
      free_trial_status = 'active',
      free_trial_started_at = v_now,
      free_trial_ends_at = v_trial_end,
      trial_start = v_now,
      trial_end = v_trial_end,
      credits_renewed_at = v_now,
      updated_at = v_now
  where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'trial_activated',
    'trialActivated', true,
    'creditsGranted', v_grant,
    'creditsRemaining', v_after,
    'trialStatus', 'active',
    'trialEndsAt', v_trial_end
  );
exception
  when unique_violation then
    update public.social_connections
    set status='disconnected',
        page_access_token=null, refresh_token=null, token_expires_at=null, refresh_token_expires_at=null,
        updated_at=now()
    where user_id=p_user_id and brand_profile_id=p_brand_profile_id
      and lower(coalesce(platform,''))=v_platform
      and coalesce(external_account_id,page_id,'')=v_external_account_id;
    return jsonb_build_object('allowed', false, 'reason', 'trial_social_account_used');
end;
$$;

revoke all on function public.claim_spreelo_social_trial(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_spreelo_social_trial(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.mark_spreelo_free_trial_used(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  update public.user_credit_balances
  set free_trial_status = 'used',
      free_trial_started_at = coalesce(free_trial_started_at, now()),
      free_trial_ends_at = coalesce(free_trial_ends_at, now()),
      updated_at = now()
  where user_id = p_user_id
    and free_trial_status <> 'used';

  update public.trial_social_account_claims
  set status = 'consumed',
      trial_ended_at = coalesce(trial_ended_at, now()),
      updated_at = now()
  where user_id = p_user_id and status = 'active';

  update public.trial_business_claims
  set status = 'consumed',
      trial_ended_at = coalesce(trial_ended_at, now()),
      updated_at = now()
  where user_id = p_user_id and status in ('pending','active');
end;
$$;
revoke all on function public.mark_spreelo_free_trial_used(uuid) from public,anon,authenticated;
grant execute on function public.mark_spreelo_free_trial_used(uuid) to service_role;

-- Lazy expiration used when billing/credit state is loaded. It preserves the
-- portion of the total balance known to come from separately purchased credits.
create or replace function public.refresh_spreelo_free_trial_state()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance public.user_credit_balances%rowtype;
  v_purchased integer;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  select * into v_balance from public.user_credit_balances where user_id=v_user_id for update;
  if not found then return jsonb_build_object('updated', false); end if;

  if v_balance.free_trial_status='active'
     and v_balance.free_trial_ends_at is not null
     and v_balance.free_trial_ends_at <= now()
     and lower(coalesce(v_balance.subscription_plan, v_balance.plan_name, 'free'))='free' then
    v_purchased := least(
      greatest(coalesce(v_balance.purchased_credits_remaining,0),0),
      greatest(coalesce(v_balance.credits_remaining,0),0)
    );
    update public.user_credit_balances
    set credits_remaining=v_purchased,
        monthly_credit_limit=0,
        free_trial_status='expired',
        subscription_status='free',
        updated_at=now()
    where user_id=v_user_id;

    update public.trial_social_account_claims
    set status='consumed', trial_ended_at=coalesce(trial_ended_at,now()), updated_at=now()
    where user_id=v_user_id and status='active';
    update public.trial_business_claims
    set status='consumed', trial_ended_at=coalesce(trial_ended_at,now()), updated_at=now()
    where user_id=v_user_id and status in ('pending','active');

    -- Trial credits must not be parked in future one-time reservations and used
    -- after the 14-day window. Free does not support recurring schedules, but
    -- this deliberately clears every still-reserved rule as a fail-closed guard.
    update public.automation_rules
    set is_active=false,
        plan_state=case when coalesce(plan_state,'active')='ended' then plan_state else 'ended' end,
        credit_reservation_status=case when credit_reservation_status='reserved' then 'released' else credit_reservation_status end,
        credit_reserved_amount=case when credit_reservation_status='reserved' then 0 else credit_reserved_amount end,
        credit_released_at=case when credit_reservation_status='reserved' then now() else credit_released_at end,
        queue_locked_until=null,
        retry_not_before=null,
        updated_at=now()
    where user_id=v_user_id and credit_reservation_status='reserved';

    return jsonb_build_object('updated', true, 'status', 'expired', 'creditsRemaining', v_purchased);
  end if;

  return jsonb_build_object('updated', false, 'status', v_balance.free_trial_status, 'creditsRemaining', v_balance.credits_remaining);
end;
$$;
grant execute on function public.refresh_spreelo_free_trial_state() to authenticated;

-- Final defense: an expired Free trial cannot spend stale promotional credits
-- through an API path that forgot to refresh the state first.
create or replace function public.spreelo_guard_expired_free_trial_spend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.free_trial_status='active'
     and old.free_trial_ends_at is not null
     and old.free_trial_ends_at <= now()
     and lower(coalesce(old.subscription_plan,old.plan_name,'free'))='free'
     and coalesce(new.free_trial_status, old.free_trial_status)='active'
     and coalesce(new.credits_remaining,0) < coalesce(old.credits_remaining,0) then
    raise exception 'SPREELO_FREE_TRIAL_EXPIRED';
  end if;
  return new;
end;
$$;
drop trigger if exists spreelo_guard_expired_free_trial_spend on public.user_credit_balances;
create trigger spreelo_guard_expired_free_trial_spend
before update of credits_remaining on public.user_credit_balances
for each row execute function public.spreelo_guard_expired_free_trial_spend();

-- ---------------------------------------------------------------------------
-- Customer-triggered analysis quotas.
-- The quota is claimed before a durable brand-analysis job is inserted. Internal
-- worker/rescue/annual-calendar jobs do not use this RPC and therefore do not
-- consume customer quota.
-- ---------------------------------------------------------------------------
create table if not exists public.brand_analysis_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_profile_id uuid,
  request_key text not null,
  plan_key text not null,
  timezone text not null,
  local_day date not null,
  local_month date not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, request_key)
);
create index if not exists brand_analysis_usage_user_day_idx
  on public.brand_analysis_usage_events(user_id, local_day, occurred_at desc);
create index if not exists brand_analysis_usage_user_month_idx
  on public.brand_analysis_usage_events(user_id, local_month, occurred_at desc);
alter table public.brand_analysis_usage_events enable row level security;
revoke all on public.brand_analysis_usage_events from public, anon, authenticated;

create table if not exists public.brand_analysis_usage_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  alert_key text not null,
  period_key text not null,
  plan_key text,
  usage_count integer,
  usage_limit integer,
  brand_profile_id uuid,
  created_at timestamptz not null default now(),
  unique(user_id, alert_key, period_key)
);
alter table public.brand_analysis_usage_alerts enable row level security;
revoke all on public.brand_analysis_usage_alerts from public, anon, authenticated;

-- Bounded counters for repeated attempts after a customer has already hit a
-- daily/monthly analysis limit. One row per user/reason/local day avoids a
-- write-amplification table while still allowing Admin to detect repeated hits.
create table if not exists public.brand_analysis_limit_hit_counters (
  user_id uuid not null,
  reason text not null check (reason in ('daily_limit','monthly_limit')),
  local_day date not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  first_hit_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now(),
  primary key(user_id, reason, local_day)
);
alter table public.brand_analysis_limit_hit_counters enable row level security;
revoke all on public.brand_analysis_limit_hit_counters from public, anon, authenticated;

create or replace function public.spreelo_safe_timezone(p_timezone text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_timezone text := trim(coalesce(p_timezone,''));
begin
  if v_timezone <> '' and exists(select 1 from pg_timezone_names where name=v_timezone) then
    return v_timezone;
  end if;
  return 'UTC';
end;
$$;

create or replace function public.spreelo_analysis_plan_limits(p_plan text)
returns jsonb
language sql
immutable
as $$
  select case lower(coalesce(p_plan,'free'))
    when 'starter' then jsonb_build_object('daily',3,'monthly',10)
    when 'growth' then jsonb_build_object('daily',6,'monthly',25)
    when 'pro' then jsonb_build_object('daily',10,'monthly',50)
    else jsonb_build_object('daily',2,'monthly',4)
  end;
$$;

create or replace function public.claim_spreelo_brand_analysis_quota(
  p_brand_profile_id uuid,
  p_timezone text,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested_timezone text := public.spreelo_safe_timezone(p_timezone);
  v_timezone text;
  v_plan text;
  v_limits jsonb;
  v_daily_limit integer;
  v_monthly_limit integer;
  v_now timestamptz := now();
  v_local_now timestamp;
  v_day date;
  v_month date;
  v_daily_count integer := 0;
  v_monthly_count integer := 0;
  v_last timestamptz;
  v_daily_reset timestamptz;
  v_monthly_reset timestamptz;
  v_admin boolean := false;
  v_blocked_count integer := 0;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  if nullif(trim(coalesce(p_request_key,'')),'') is null then raise exception 'Request key is required'; end if;
  if p_brand_profile_id is null or not exists(
    select 1 from public.brand_profiles where id=p_brand_profile_id and user_id=v_user_id
  ) then raise exception 'Brand profile not found'; end if;

  perform pg_advisory_xact_lock(hashtext('spreelo-analysis-quota:' || v_user_id::text));

  select nullif(trim(coalesce(analysis_quota_timezone,'')),'') into v_timezone
  from public.user_credit_balances where user_id=v_user_id for update;
  if v_timezone is null then
    v_timezone := v_requested_timezone;
    update public.user_credit_balances
    set analysis_quota_timezone=v_timezone, updated_at=now()
    where user_id=v_user_id;
  else
    v_timezone := public.spreelo_safe_timezone(v_timezone);
  end if;

  v_admin := public.spreelo_is_plan_limit_admin(v_user_id);
  v_plan := coalesce(public.spreelo_entitlement_plan(v_user_id),'free');
  v_limits := public.spreelo_analysis_plan_limits(v_plan);
  v_daily_limit := (v_limits->>'daily')::integer;
  v_monthly_limit := (v_limits->>'monthly')::integer;
  v_local_now := timezone(v_timezone, v_now);
  v_day := v_local_now::date;
  v_month := date_trunc('month', v_local_now)::date;
  v_daily_reset := ((v_day + 1)::timestamp at time zone v_timezone);
  v_monthly_reset := ((v_month + interval '1 month')::timestamp at time zone v_timezone);

  if exists(select 1 from public.brand_analysis_usage_events where user_id=v_user_id and request_key=p_request_key) then
    select count(*) into v_daily_count from public.brand_analysis_usage_events where user_id=v_user_id and local_day=v_day;
    select count(*) into v_monthly_count from public.brand_analysis_usage_events where user_id=v_user_id and local_month=v_month;
    return jsonb_build_object('allowed',true,'duplicate',true,'plan',v_plan,'admin',v_admin,
      'dailyCount',v_daily_count,'dailyLimit',case when v_admin then null else v_daily_limit end,
      'monthlyCount',v_monthly_count,'monthlyLimit',case when v_admin then null else v_monthly_limit end,
      'dailyResetAt',v_daily_reset,'monthlyResetAt',v_monthly_reset,'timezone',v_timezone);
  end if;

  select max(occurred_at) into v_last from public.brand_analysis_usage_events where user_id=v_user_id;
  if not v_admin and v_last is not null and v_last > v_now - interval '1 minute' then
    return jsonb_build_object('allowed',false,'reason','cooldown','plan',v_plan,
      'retryAt',v_last + interval '1 minute','dailyResetAt',v_daily_reset,'monthlyResetAt',v_monthly_reset,'timezone',v_timezone);
  end if;

  select count(*) into v_daily_count from public.brand_analysis_usage_events where user_id=v_user_id and local_day=v_day;
  select count(*) into v_monthly_count from public.brand_analysis_usage_events where user_id=v_user_id and local_month=v_month;

  if not v_admin and v_monthly_count >= v_monthly_limit then
    insert into public.brand_analysis_limit_hit_counters(user_id,reason,local_day,hit_count,first_hit_at,last_hit_at)
    values(v_user_id,'monthly_limit',v_day,1,v_now,v_now)
    on conflict(user_id,reason,local_day) do update
      set hit_count=public.brand_analysis_limit_hit_counters.hit_count + 1,
          last_hit_at=excluded.last_hit_at
    returning hit_count into v_blocked_count;
    return jsonb_build_object('allowed',false,'reason','monthly_limit','plan',v_plan,
      'dailyCount',v_daily_count,'dailyLimit',v_daily_limit,
      'monthlyCount',v_monthly_count,'monthlyLimit',v_monthly_limit,
      'blockedCount',v_blocked_count,
      'dailyResetAt',v_daily_reset,'monthlyResetAt',v_monthly_reset,'timezone',v_timezone);
  end if;
  if not v_admin and v_daily_count >= v_daily_limit then
    insert into public.brand_analysis_limit_hit_counters(user_id,reason,local_day,hit_count,first_hit_at,last_hit_at)
    values(v_user_id,'daily_limit',v_day,1,v_now,v_now)
    on conflict(user_id,reason,local_day) do update
      set hit_count=public.brand_analysis_limit_hit_counters.hit_count + 1,
          last_hit_at=excluded.last_hit_at
    returning hit_count into v_blocked_count;
    return jsonb_build_object('allowed',false,'reason','daily_limit','plan',v_plan,
      'dailyCount',v_daily_count,'dailyLimit',v_daily_limit,
      'monthlyCount',v_monthly_count,'monthlyLimit',v_monthly_limit,
      'blockedCount',v_blocked_count,
      'dailyResetAt',v_daily_reset,'monthlyResetAt',v_monthly_reset,'timezone',v_timezone);
  end if;

  insert into public.brand_analysis_usage_events(
    user_id,brand_profile_id,request_key,plan_key,timezone,local_day,local_month,occurred_at
  ) values (
    v_user_id,p_brand_profile_id,p_request_key,v_plan,v_timezone,v_day,v_month,v_now
  );

  v_daily_count := v_daily_count + 1;
  v_monthly_count := v_monthly_count + 1;
  return jsonb_build_object('allowed',true,'reason','claimed','plan',v_plan,'admin',v_admin,
    'dailyCount',v_daily_count,'dailyLimit',case when v_admin then null else v_daily_limit end,
    'monthlyCount',v_monthly_count,'monthlyLimit',case when v_admin then null else v_monthly_limit end,
    'dailyResetAt',v_daily_reset,'monthlyResetAt',v_monthly_reset,'timezone',v_timezone);
end;
$$;
revoke all on function public.claim_spreelo_brand_analysis_quota(uuid,text,text) from public, anon;
grant execute on function public.claim_spreelo_brand_analysis_quota(uuid,text,text) to authenticated;

-- Only trusted server code may roll back a quota claim when durable job creation
-- fails before any analysis work begins. The old authenticated one-argument RPC
-- is explicitly removed so a customer cannot release their own quota entries.
drop function if exists public.release_spreelo_brand_analysis_quota(text);
create or replace function public.release_spreelo_brand_analysis_quota(
  p_user_id uuid,
  p_request_key text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.brand_analysis_usage_events
  where user_id=p_user_id and request_key=p_request_key;
$$;
revoke all on function public.release_spreelo_brand_analysis_quota(uuid,text) from public, anon, authenticated;
grant execute on function public.release_spreelo_brand_analysis_quota(uuid,text) to service_role;

create or replace function public.get_spreelo_brand_analysis_usage(p_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested_timezone text := public.spreelo_safe_timezone(p_timezone);
  v_timezone text;
  v_plan text;
  v_limits jsonb;
  v_admin boolean;
  v_local_now timestamp;
  v_day date;
  v_month date;
  v_daily_count integer;
  v_monthly_count integer;
  v_last timestamptz;
  v_daily_reset timestamptz;
  v_monthly_reset timestamptz;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  select nullif(trim(coalesce(analysis_quota_timezone,'')),'') into v_timezone
  from public.user_credit_balances where user_id=v_user_id;
  v_timezone := public.spreelo_safe_timezone(coalesce(v_timezone, v_requested_timezone));
  v_plan := coalesce(public.spreelo_entitlement_plan(v_user_id),'free');
  v_limits := public.spreelo_analysis_plan_limits(v_plan);
  v_admin := public.spreelo_is_plan_limit_admin(v_user_id);
  v_local_now := timezone(v_timezone, now());
  v_day := v_local_now::date;
  v_month := date_trunc('month',v_local_now)::date;
  select count(*) into v_daily_count from public.brand_analysis_usage_events where user_id=v_user_id and local_day=v_day;
  select count(*) into v_monthly_count from public.brand_analysis_usage_events where user_id=v_user_id and local_month=v_month;
  select max(occurred_at) into v_last from public.brand_analysis_usage_events where user_id=v_user_id;
  v_daily_reset := ((v_day + 1)::timestamp at time zone v_timezone);
  v_monthly_reset := ((v_month + interval '1 month')::timestamp at time zone v_timezone);
  return jsonb_build_object('plan',v_plan,'admin',v_admin,'timezone',v_timezone,
    'dailyCount',v_daily_count,'dailyLimit',case when v_admin then null else (v_limits->>'daily')::integer end,
    'monthlyCount',v_monthly_count,'monthlyLimit',case when v_admin then null else (v_limits->>'monthly')::integer end,
    'lastAnalysisAt',v_last,'cooldownEndsAt',case when v_last is null then null else v_last + interval '1 minute' end,
    'dailyResetAt',v_daily_reset,'monthlyResetAt',v_monthly_reset);
end;
$$;
revoke all on function public.get_spreelo_brand_analysis_usage(text) from public, anon;
grant execute on function public.get_spreelo_brand_analysis_usage(text) to authenticated;


-- Remove stale brand identifiers from durable anti-abuse / quota history when
-- a customer deletes a brand. The trial fingerprint/domain and the user's usage
-- counts remain so deleting/recreating a brand cannot reset abuse protection.
create or replace function public.spreelo_anonymize_deleted_brand_history_v144180()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trial_social_account_claims
  set brand_profile_id=null, updated_at=now()
  where brand_profile_id=old.id;

  update public.trial_business_claims
  set brand_profile_id=null, updated_at=now()
  where brand_profile_id=old.id;

  update public.brand_analysis_usage_events
  set brand_profile_id=null
  where brand_profile_id=old.id;

  update public.brand_analysis_usage_alerts
  set brand_profile_id=null
  where brand_profile_id=old.id;
  return old;
end;
$$;

drop trigger if exists spreelo_anonymize_deleted_brand_history_v144180 on public.brand_profiles;
create trigger spreelo_anonymize_deleted_brand_history_v144180
after delete on public.brand_profiles
for each row execute function public.spreelo_anonymize_deleted_brand_history_v144180();

-- v144.180 replaces the old Stripe-gated trial reservation RPCs completely.
-- Keep trial_business_claims as durable domain-abuse history, but remove the
-- legacy entry points so old code cannot accidentally create a second trial path.
drop function if exists public.claim_spreelo_trial_business(uuid,text,text,uuid);
drop function if exists public.mark_spreelo_trial_business(uuid,text,text,text,text,timestamptz,timestamptz);

comment on table public.trial_social_account_claims is
  'Durable, privacy-minimized one-free-trial-per-verified-social-account registry. Raw external account ids are not stored here.';
comment on table public.brand_analysis_usage_events is
  'Customer-triggered brand-analysis quota events. Internal system/Rescue jobs bypass this table.';
