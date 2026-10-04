-- Run after v144_304_shotstack_continuation.sql, before deploying v144.305.
begin;
create table if not exists public.shotstack_post_deliveries (
  post_id uuid primary key references public.posts(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','completed','needs_review')),
  lease_token uuid, lease_until timestamptz, retry_at timestamptz not null default now(),
  history_done boolean not null default false, credits_done boolean not null default false,
  background_counted boolean not null default false,
  email_payload jsonb, email_first_attempt_at timestamptz, mail_sent_at timestamptz, provider_email_id text,
  completed_at timestamptz, last_error text, created_at timestamptz not null default now()
);
alter table public.shotstack_post_deliveries enable row level security;
revoke all on public.shotstack_post_deliveries from anon,authenticated;
grant all on public.shotstack_post_deliveries to service_role;

create or replace function public.shotstack_delivery_preflight() returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if to_regprocedure('public.defer_automation_occurrence_for_shotstack(uuid,uuid,text,text)') is null then
  raise exception 'Install v144.304 Shotstack continuation migration first';
 end if;
 return true;
end; $$;

create or replace function public.claim_shotstack_delivery(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_delivery public.shotstack_post_deliveries%rowtype;
begin
 if not exists(select 1 from public.posts where id=p_post_id and video_provider='shotstack'
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
 where p.video_provider='shotstack' and p.video_status='ready' and p.status='pending_approval'
 and p.admin_archived_at is null and p.video_background_selection ? 'shotstack_checkpoint'
 and (p.video_background_selection->'shotstack_checkpoint'->>'origin'='admin' or exists(
   select 1 from public.automation_occurrences o where o.id::text=p.video_background_selection->'shotstack_checkpoint'->>'occurrence_id' and o.status='completed'))
 and coalesce(d.status,'pending') not in ('completed','needs_review')
 and coalesce(d.retry_at,now())<=now() and (d.lease_until is null or d.lease_until<=now())
 order by p.updated_at limit 4;
$$;

-- Per-post settlement is atomic; never charge a reserved/current future cycle twice.
create or replace function public.settle_shotstack_delivery_credit(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_post public.posts%rowtype; v_rule public.automation_rules%rowtype;
 v_delivery public.shotstack_post_deliveries%rowtype; v_context jsonb; v_cost integer; v_reserved boolean;
begin
 select * into v_post from public.posts where id=p_post_id;
 select * into v_rule from public.automation_rules where id=v_post.automation_rule_id for update;
 select * into v_delivery from public.shotstack_post_deliveries where post_id=p_post_id for update;
 if not found then raise exception 'Delivery must be claimed before credit settlement'; end if;
 if v_delivery.credits_done then return jsonb_build_object('handled',true,'already_settled',true); end if;
 v_context=coalesce(v_post.video_background_selection->'shotstack_checkpoint'->'delivery_context','{}'::jsonb);
 v_cost=greatest(coalesce((v_context->>'credit_cost')::integer,v_rule.credit_cost,1),1);
 v_reserved=coalesce((v_context->>'has_reserved_credits')::boolean,v_rule.credit_reservation_status='reserved',false);
 if not coalesce(v_post.is_admin_test,false) and not coalesce((v_context->>'is_admin_test')::boolean,false)
 and coalesce(v_post.video_background_selection->'shotstack_checkpoint'->>'origin','automation')<>'admin'
 and not exists(select 1 from public.credit_transactions where reference_type='post' and reference_id::text=p_post_id::text and amount<0)
 and not exists(select 1 from public.credit_reservation_events where event_type='consumed' and metadata->>'post_id'=p_post_id::text) then
   if v_rule.id is null then raise exception 'Original automation rule needs reconciliation'; end if;
   if v_reserved then
     if v_rule.credit_reservation_status is distinct from 'reserved' then raise exception 'Original credit reservation needs reconciliation'; end if;
     perform public.consume_reserved_automation_credit(v_rule.id,p_post_id);
   else
     update public.user_credit_balances set credits_remaining=credits_remaining-v_cost,updated_at=now()
       where user_id=v_post.user_id and credits_remaining>=v_cost;
     if not found then raise exception 'Insufficient customer credits for saved Shotstack post'; end if;
     insert into public.credit_transactions(user_id,amount,reason,reference_type,reference_id)
       values(v_post.user_id,-v_cost,'Automation website post generated','post',p_post_id);
   end if;
 end if;
 if not v_delivery.background_counted and v_context->>'version'='305' and v_post.video_background_asset_id is not null then
   update public.video_background_assets set times_used=coalesce(times_used,0)+1,last_used_at=now(),updated_at=now()
     where id=v_post.video_background_asset_id;
 end if;
 update public.shotstack_post_deliveries set credits_done=true,background_counted=true where post_id=p_post_id;
 return jsonb_build_object('handled',true);
end; $$;

-- History and catalog usage commit together and are repeatable per saved post.
create or replace function public.save_shotstack_delivery_history(p_post_id uuid,p_item jsonb,p_source_url text,p_cycle integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_post public.posts%rowtype; v_delivery public.shotstack_post_deliveries%rowtype; v_existing boolean;
begin
 select * into v_post from public.posts where id=p_post_id;
 select * into v_delivery from public.shotstack_post_deliveries where post_id=p_post_id for update;
 if not found then raise exception 'Delivery must be claimed before history settlement'; end if;
 if v_delivery.history_done then return true; end if;
 if p_item is not null and nullif(p_item->>'url','') is not null then
   v_existing=exists(select 1 from public.website_content_history where post_id=p_post_id);
   if not v_existing then
     insert into public.website_content_history(user_id,brand_profile_id,automation_rule_id,post_id,
       source_url,source_type,content_type,item_key,item_url,item_title,item_description,item_image_url,cycle_number)
     values(v_post.user_id,v_post.brand_profile_id,v_post.automation_rule_id,p_post_id,
       p_source_url,'website',coalesce(p_item->>'history_content_type',v_post.content_type_id,'website_item'),p_item->>'item_key',
       p_item->>'url',p_item->>'title',p_item->>'description',p_item->>'image_url',coalesce(p_cycle,1))
     on conflict do nothing;
     update public.website_product_catalog set times_used=coalesce(times_used,0)+1,last_used_at=now(),updated_at=now()
       where user_id=v_post.user_id and brand_profile_id=v_post.brand_profile_id and product_url=p_item->>'url';
   end if;
 end if;
 update public.shotstack_post_deliveries set history_done=true where post_id=p_post_id;
 return true;
end; $$;

revoke all on function public.shotstack_delivery_preflight() from public,anon,authenticated;
revoke all on function public.claim_shotstack_delivery(uuid) from public,anon,authenticated;
revoke all on function public.list_pending_shotstack_deliveries() from public,anon,authenticated;
revoke all on function public.settle_shotstack_delivery_credit(uuid) from public,anon,authenticated;
grant execute on function public.shotstack_delivery_preflight(),public.claim_shotstack_delivery(uuid),
 public.list_pending_shotstack_deliveries(),public.settle_shotstack_delivery_credit(uuid) to service_role;
revoke all on function public.save_shotstack_delivery_history(uuid,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.save_shotstack_delivery_history(uuid,jsonb,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
