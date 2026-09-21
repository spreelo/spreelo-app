-- Spreelo v144.244
-- Restore the Free-plan entitlement required by the cardless trial flow.
-- v144.180 intentionally allowed one social account on Free so a verified
-- social identity can unlock the reserved 100 credits. v144.186 later
-- replaced spreelo_entitlement_limit() and accidentally reset Free to 0.

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
      else 1
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
