-- Spreelo 144.388: opt-in, database-atomic Kling admission control.
-- MUST be installed before SPREELO_KLING_CAPACITY_QUEUE_ENABLED=true.
-- No changes to existing posts, automation rules, credits or generation flows.
create table if not exists public.kling_capacity_slots (
  job_key text primary key check (length(job_key) between 5 and 200),
  rule_id uuid,
  scheduled_for timestamptz,
  post_id uuid unique,
  task_id text,
  state text not null check (state in ('reserved','attempted','submitted','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kling_capacity_slots_active_idx
  on public.kling_capacity_slots(state,updated_at)
  where state in ('reserved','attempted','submitted');
create index if not exists kling_capacity_slots_rule_idx
  on public.kling_capacity_slots(rule_id,state,created_at desc);
create table if not exists public.kling_capacity_waits (
  job_key text primary key,
  rule_id uuid,
  scheduled_for timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.kling_capacity_slots enable row level security;
alter table public.kling_capacity_waits enable row level security;
revoke all on public.kling_capacity_slots from anon,authenticated;
revoke all on public.kling_capacity_waits from anon,authenticated;
grant select,insert,update,delete on public.kling_capacity_slots to service_role;
grant select,insert,update,delete on public.kling_capacity_waits to service_role;

-- Reservations NEVER expire automatically: after a crash, it may be impossible
-- to tell whether Kling accepted a billed job. Manual reconciliation is safer
-- than silently freeing a slot or submitting a second paid generation.
create or replace function public.try_admit_kling_capacity(
 p_job_key text,p_rule_id uuid default null,p_scheduled_for timestamptz default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_limit bigint; v_existing text; v_active bigint; v_legacy bigint;
begin
 if p_job_key is null or length(p_job_key) not between 5 and 200 then
   raise exception 'invalid Kling job key';
 end if;
 perform pg_advisory_xact_lock(hashtext('spreelo:kling:global-capacity'));
 select state into v_existing from public.kling_capacity_slots where job_key=p_job_key;
 if found then
   return v_existing in ('reserved','attempted','submitted');
 end if;
 select limit_value into v_limit from public.provider_capacity_limits
 where provider='kling' and metric='video_concurrency' and verification='confirmed';
 if v_limit is null or v_limit < 1 then
   raise exception 'Kling concurrency must be verified in Spreelo admin before enabling the queue';
 end if;
 select count(*) into v_active from public.kling_capacity_slots where state in ('reserved','attempted','submitted');
 -- Count running tasks created before the feature was enabled or through a
 -- legacy route. Never double-count a post already attached to a slot.
 select count(*) into v_legacy from public.posts p
 where p.video_provider='kling'
 and p.kling_task_id is not null
 and p.video_status in ('submitting','submitted','processing','pending','running','finalizing','finalization_retry')
 and not exists (
   select 1 from public.kling_capacity_slots s
   where s.post_id=p.id and s.state in ('reserved','attempted','submitted')
 );
 if v_active+v_legacy >= v_limit then
   insert into public.kling_capacity_waits(job_key,rule_id,scheduled_for)
   values(p_job_key,p_rule_id,p_scheduled_for)
   on conflict(job_key) do update set last_seen_at=now();
   return false;
 end if;
 insert into public.kling_capacity_slots(job_key,rule_id,scheduled_for,state)
 values(p_job_key,p_rule_id,p_scheduled_for,'reserved');
 delete from public.kling_capacity_waits where job_key=p_job_key;
 return true;
end;
$$;

-- The provider POST is only allowed after marking an admitted slot as
-- attempted. Unknown POST outcomes continue occupying capacity until reviewed.
create or replace function public.mark_kling_capacity_attempt(p_post_id uuid)
 returns boolean language plpgsql security definer set search_path=public as $$
declare v_rule uuid; v_origin text; v_key text;
begin
 perform pg_advisory_xact_lock(hashtext('spreelo:kling:global-capacity'));
 select p.automation_rule_id,
        p.video_background_selection->>'admin_retry_of_post_id'
 into v_rule,v_origin from public.posts p where p.id=p_post_id;
 if not found then raise exception 'Kling post does not exist'; end if;
 if v_origin is not null and v_origin <> '' then
   v_key:='admin:'||v_origin;
 else
   select s.job_key into v_key from public.kling_capacity_slots s
   where s.rule_id=v_rule and s.state='reserved'
   order by s.created_at desc limit 1;
 end if;
 if v_key is null then raise exception 'Kling capacity slot is not reserved for post %',p_post_id; end if;
 update public.kling_capacity_slots set state='attempted',post_id=p_post_id,updated_at=now()
 where job_key=v_key and state='reserved' and post_id is null;
 if not found then raise exception 'Kling slot was already consumed or cannot be bound'; end if;
 return true;
end;
$$;

create or replace function public.mark_kling_capacity_submitted(p_post_id uuid,p_task_id text)
 returns boolean language plpgsql security definer set search_path=public as $$
begin
 if nullif(trim(p_task_id),'') is null then raise exception 'task ID missing'; end if;
 update public.kling_capacity_slots
 set state='submitted',task_id=p_task_id,updated_at=now()
 where post_id=p_post_id and state='attempted';
 return found;
end;
$$;

create or replace function public.release_unattempted_kling_capacity(p_job_key text)
 returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.kling_capacity_slots set state='cancelled',updated_at=now()
 where job_key=p_job_key and state='reserved';
 return found;
end;
$$;

create or replace function public.complete_kling_capacity_slot(p_post_id uuid,p_terminal_status text)
 returns boolean language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(p_terminal_status,'')) not in
  ('succeed','succeeded','success','completed','failed','error','cancelled','canceled') then
   raise exception 'Not a recognized terminal Kling task state';
 end if;
 update public.kling_capacity_slots set state='completed',updated_at=now()
 where post_id=p_post_id and state in ('attempted','submitted');
 return found;
end;
$$;

create or replace function public.kling_capacity_queue_snapshot()
 returns table(active_jobs bigint,waiting_jobs bigint,verified_limit bigint,
               oldest_wait timestamptz,uncertain_jobs bigint)
 language sql security definer set search_path=public as $$
 select
 (select count(*) from public.kling_capacity_slots where state in ('reserved','attempted','submitted')),
 (select count(*) from public.kling_capacity_waits),
 (select limit_value from public.provider_capacity_limits where provider='kling' and metric='video_concurrency' and verification='confirmed'),
 (select min(first_seen_at) from public.kling_capacity_waits),
 (select count(*) from public.kling_capacity_slots where state='attempted');
$$;
revoke all on function public.try_admit_kling_capacity(text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.mark_kling_capacity_attempt(uuid) from public,anon,authenticated;
revoke all on function public.mark_kling_capacity_submitted(uuid,text) from public,anon,authenticated;
revoke all on function public.release_unattempted_kling_capacity(text) from public,anon,authenticated;
revoke all on function public.complete_kling_capacity_slot(uuid,text) from public,anon,authenticated;
revoke all on function public.kling_capacity_queue_snapshot() from public,anon,authenticated;
grant execute on function public.try_admit_kling_capacity(text,uuid,timestamptz) to service_role;
grant execute on function public.mark_kling_capacity_attempt(uuid) to service_role;
grant execute on function public.mark_kling_capacity_submitted(uuid,text) to service_role;
grant execute on function public.release_unattempted_kling_capacity(text) to service_role;
grant execute on function public.complete_kling_capacity_slot(uuid,text) to service_role;
grant execute on function public.kling_capacity_queue_snapshot() to service_role;
