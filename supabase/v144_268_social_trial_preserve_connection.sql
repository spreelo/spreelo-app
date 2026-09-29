-- Spreelo v144.268
-- Free-trial anti-abuse rules must never disconnect an already verified social connection.
--
-- Social OAuth and the one-time free-trial entitlement are separate concerns:
-- a reused social account/business/account may be denied another 100-credit trial,
-- while the verified channel remains connected and usable under the account's plan.

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
    return jsonb_build_object(
      'allowed', false,
      'reason', case when v_social_claim.user_id = p_user_id then 'trial_account_already_used' else 'trial_social_account_used' end
    );
  end if;

  if v_balance.free_trial_status <> 'locked' then
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
    return jsonb_build_object('allowed', false, 'reason', 'trial_social_account_used');
end;
$$;

revoke all on function public.claim_spreelo_social_trial(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_spreelo_social_trial(uuid,uuid,text,text,text,text) to service_role;

