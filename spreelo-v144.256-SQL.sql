-- Spreelo v144.256: Shopify uninstall + mandatory privacy/compliance webhook receipts.
-- Run once in Supabase SQL Editor BEFORE registering/deploying Shopify webhooks.
-- Raw webhook payloads are intentionally NOT persisted; compliance payloads can contain PII.

begin;

create table if not exists public.shopify_webhook_events (
  webhook_id text primary key,
  topic text not null,
  shop_domain text not null,
  event_id text,
  api_version text,
  triggered_at timestamptz,
  payload_sha256 text not null,
  status text not null default 'processing'
    check (status in ('processing','completed','failed')),
  attempts integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create index if not exists shopify_webhook_events_shop_received_idx
  on public.shopify_webhook_events(shop_domain, last_received_at desc);

create index if not exists shopify_webhook_events_topic_received_idx
  on public.shopify_webhook_events(topic, last_received_at desc);

alter table public.shopify_webhook_events enable row level security;
revoke all on public.shopify_webhook_events from public, anon, authenticated;

comment on table public.shopify_webhook_events is
  'Server-only Shopify webhook delivery receipts for HMAC-verified idempotency. Raw webhook payloads are never stored.';

create or replace function public.claim_shopify_webhook_event(
  p_webhook_id text,
  p_topic text,
  p_shop_domain text,
  p_event_id text default null,
  p_api_version text default null,
  p_triggered_at timestamptz default null,
  p_payload_sha256 text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shopify_webhook_events%rowtype;
  v_inserted boolean := false;
begin
  if coalesce(trim(p_webhook_id), '') = '' then
    raise exception 'Webhook ID is required';
  end if;

  insert into public.shopify_webhook_events (
    webhook_id, topic, shop_domain, event_id, api_version, triggered_at, payload_sha256,
    status, attempts, first_received_at, last_received_at
  ) values (
    p_webhook_id, p_topic, p_shop_domain, p_event_id, p_api_version, p_triggered_at,
    coalesce(p_payload_sha256, ''), 'processing', 1, now(), now()
  )
  on conflict (webhook_id) do nothing;
  v_inserted := found;

  select * into v_row
  from public.shopify_webhook_events
  where webhook_id = p_webhook_id
  for update;

  if not v_inserted and (
    v_row.topic <> p_topic
    or v_row.shop_domain <> p_shop_domain
    or (coalesce(p_payload_sha256, '') <> '' and v_row.payload_sha256 <> p_payload_sha256)
  ) then
    raise exception 'Webhook delivery ID was replayed with different signed content';
  end if;

  if v_inserted then
    return jsonb_build_object('already_processed', false, 'busy', false, 'attempts', v_row.attempts);
  end if;

  if v_row.status = 'completed' then
    return jsonb_build_object('already_processed', true, 'busy', false, 'attempts', v_row.attempts);
  end if;

  if v_row.status = 'processing'
     and v_row.last_received_at > now() - interval '5 minutes' then
    return jsonb_build_object('already_processed', false, 'busy', true, 'attempts', v_row.attempts);
  end if;

  update public.shopify_webhook_events
  set status = 'processing',
      attempts = attempts + 1,
      last_received_at = now(),
      last_error = null,
      topic = p_topic,
      shop_domain = p_shop_domain,
      event_id = coalesce(p_event_id, event_id),
      api_version = coalesce(p_api_version, api_version),
      triggered_at = coalesce(p_triggered_at, triggered_at),
      payload_sha256 = coalesce(nullif(p_payload_sha256, ''), payload_sha256)
  where webhook_id = p_webhook_id
  returning * into v_row;

  return jsonb_build_object('already_processed', false, 'busy', false, 'attempts', v_row.attempts);
end;
$$;

create or replace function public.complete_shopify_webhook_event(p_webhook_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shopify_webhook_events
  set status = 'completed',
      processed_at = now(),
      last_received_at = now(),
      last_error = null
  where webhook_id = p_webhook_id;
end;
$$;

create or replace function public.fail_shopify_webhook_event(p_webhook_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shopify_webhook_events
  set status = 'failed',
      last_received_at = now(),
      last_error = left(coalesce(p_error, 'Unknown Shopify webhook error'), 1000)
  where webhook_id = p_webhook_id;
end;
$$;

revoke all on function public.claim_shopify_webhook_event(text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.complete_shopify_webhook_event(text) from public, anon, authenticated;
revoke all on function public.fail_shopify_webhook_event(text,text) from public, anon, authenticated;

grant execute on function public.claim_shopify_webhook_event(text,text,text,text,text,timestamptz,text) to service_role;
grant execute on function public.complete_shopify_webhook_event(text) to service_role;
grant execute on function public.fail_shopify_webhook_event(text,text) to service_role;

commit;
