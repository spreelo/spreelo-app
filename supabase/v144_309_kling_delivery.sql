-- Run after the existing v144.305 migration, before deploying v144.309.
-- Extends durable delivery to finished Kling videos; no new credit charge.
begin;
create or replace function public.claim_shotstack_delivery(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_delivery public.shotstack_post_deliveries%rowtype;
begin
 if not exists(select 1 from public.posts where id=p_post_id and video_provider in ('shotstack','kling')
   and video_status='ready' and video_storage_path is not null and status='pending_approval'
   and admin_archived_at is null) then return jsonb_build_object('claimed',false,'status','not_ready'); end if;
 insert into public.shotstack_post_deliveries(post_id) values(p_post_id) on conflict do nothing;
 select * into v_delivery from public.shotstack_post_deliveries where post_id=p_post_id for update;
 if v_delivery.status in ('completed','needs_review') or v_delivery.retry_at>now()
   or v_delivery.lease_until>now() then return jsonb_build_object('claimed',false,'status',v_delivery.status); end if;
 update public.shotstack_post_deliveries set status='processing',lease_token=gen_random_uuid(),
   lease_until=now()+interval '5 minutes' where post_id=p_post_id returning * into v_delivery;
 return jsonb_build_object('claimed',true,'delivery',to_jsonb(v_delivery));
end; $$;

create or replace function public.list_pending_shotstack_deliveries() returns setof uuid
language sql security definer set search_path=public as $$
 select p.id from public.posts p left join public.shotstack_post_deliveries d on d.post_id=p.id
 where p.video_provider in ('shotstack','kling') and p.video_status='ready' and p.status='pending_approval'
 and p.admin_archived_at is null
 and ((p.video_provider='kling' and (p.automation_rule_id is not null or exists(select 1 from public.admin_review_cases c where c.post_id=p.id)))
 or (p.video_provider='shotstack' and p.video_background_selection ? 'shotstack_checkpoint'
 and (p.video_background_selection->'shotstack_checkpoint'->>'origin'='admin' or exists(
   select 1 from public.automation_occurrences o where o.id::text=p.video_background_selection->'shotstack_checkpoint'->>'occurrence_id' and o.status='completed'))))
 and coalesce(d.status,'pending') not in ('completed','needs_review')
 and coalesce(d.retry_at,now())<=now() and (d.lease_until is null or d.lease_until<=now())
 order by p.updated_at limit 4;
$$;


notify pgrst,'reload schema';
commit;
