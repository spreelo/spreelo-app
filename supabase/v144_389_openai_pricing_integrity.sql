-- Spreelo 144.389: additive, service-role-only OpenAI financial integrity ledger.
-- Does not modify posts, video generation, credit debits or historical events.
create table if not exists public.openai_price_versions (
 id bigint generated always as identity primary key,
 model text not null check(length(model) between 1 and 120),
 service_tier text not null default 'standard',
 pricing_kind text not null default 'text' check(pricing_kind in ('text','image')),
 version text not null,
 input_usd_per_m numeric(18,9) not null check(input_usd_per_m>=0),
 cached_input_usd_per_m numeric(18,9) not null check(cached_input_usd_per_m>=0),
 output_usd_per_m numeric(18,9) not null check(output_usd_per_m>=0),
 image_input_usd_per_m numeric(18,9) check(image_input_usd_per_m>=0),
 cached_image_input_usd_per_m numeric(18,9) check(cached_image_input_usd_per_m>=0),
 valid_from timestamptz not null, valid_until timestamptz,
 source_url text not null, source_fingerprint text not null,
 approved boolean not null default false,
 approved_by text, approved_at timestamptz,
 created_at timestamptz not null default now(),
 unique(model,service_tier,version),
 check(pricing_kind <> 'image' or (image_input_usd_per_m is not null and cached_image_input_usd_per_m is not null)),
 check(valid_until is null or valid_until>valid_from),
 check(not approved or (approved_by is not null and approved_at is not null))
);
create index if not exists openai_price_versions_effective_idx
 on public.openai_price_versions(model,service_tier,approved,valid_from desc);
-- Fail closed for overlapping approved rates. Concurrent approvals serialize per model/tier.
create or replace function public.guard_approved_openai_prices() returns trigger language plpgsql
set search_path = '' as $$
begin
 if new.approved then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('spreelo:openai:'||new.model||':'||new.service_tier));
  if exists (
   select 1 from public.openai_price_versions p
   where p.model=new.model and p.service_tier=new.service_tier and p.approved
    and p.id is distinct from new.id
    and p.valid_from < coalesce(new.valid_until,'infinity'::timestamptz)
    and new.valid_from < coalesce(p.valid_until,'infinity'::timestamptz)
  ) then raise exception 'Overlapping approved OpenAI tariffs for %/%',new.model,new.service_tier; end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_approved_openai_prices on public.openai_price_versions;
create trigger guard_approved_openai_prices before insert or update on public.openai_price_versions
for each row execute function public.guard_approved_openai_prices();

create table if not exists public.openai_pricing_audit (
 id bigint generated always as identity primary key,
 checked_at timestamptz not null default now(), source_url text not null,
 http_status integer, source_fingerprint text,
 status text not null check(status in ('unchanged','changed_review_required','fetch_failed')),
 detail text
);
create index if not exists openai_pricing_audit_recent_idx on public.openai_pricing_audit(checked_at desc);

create table if not exists public.openai_billing_reconciliations (
 day_utc date not null,
 project_id text not null,
 checked_at timestamptz not null default now(),
 actual_usd numeric(18,9) not null check(actual_usd >= 0),
 recorded_estimate_usd numeric(18,9) not null check(recorded_estimate_usd >= 0),
 estimated_events integer not null check(estimated_events >= 0),
 unpriced_events integer not null check(unpriced_events >= 0),
 delta_usd numeric(18,9) not null,
 status text not null check(status in ('comparable','partial_unpriced','mismatch')),
 note text,
 primary key(day_utc,project_id)
);

alter table public.openai_price_versions enable row level security;
alter table public.openai_pricing_audit enable row level security;
alter table public.openai_billing_reconciliations enable row level security;
revoke all on public.openai_price_versions,public.openai_pricing_audit,public.openai_billing_reconciliations from public,anon,authenticated;
grant select,insert,update,delete on public.openai_price_versions,public.openai_pricing_audit,public.openai_billing_reconciliations to service_role;
grant usage,select on sequence public.openai_price_versions_id_seq, public.openai_pricing_audit_id_seq to service_role;
comment on table public.openai_billing_reconciliations is 'OpenAI project-level daily aggregate only: does not verify individual per-post costs. Scope requires a project dedicated to Spreelo.';

-- Atomic replacement: close earlier approved tariff at the incoming tariff's
-- start time, then approve incoming revision. Executable only by service_role.
create or replace function public.approve_openai_price_version(p_id bigint,p_approved_by text)
returns void language plpgsql security definer set search_path='' as $$
declare candidate public.openai_price_versions%rowtype;
begin
 if p_approved_by is null or length(trim(p_approved_by))<3 then raise exception 'Approver required'; end if;
 select * into candidate from public.openai_price_versions where id=p_id for update;
 if not found or candidate.approved then raise exception 'Missing or already approved tariff'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('spreelo:openai:'||candidate.model||':'||candidate.service_tier));
 if exists (select 1 from public.openai_price_versions p where p.model=candidate.model and p.service_tier=candidate.service_tier
    and p.approved and p.valid_from>=candidate.valid_from and p.valid_from<coalesce(candidate.valid_until,'infinity'::timestamptz))
 then raise exception 'New approval cannot predate an existing approved tariff'; end if;
 update public.openai_price_versions p set valid_until=candidate.valid_from
  where p.model=candidate.model and p.service_tier=candidate.service_tier and p.approved
    and p.valid_from<candidate.valid_from and coalesce(p.valid_until,'infinity'::timestamptz)>candidate.valid_from;
 update public.openai_price_versions set approved=true,approved_by=p_approved_by,approved_at=now() where id=p_id;
end $$;
revoke all on function public.approve_openai_price_version(bigint,text) from public,anon,authenticated;
grant execute on function public.approve_openai_price_version(bigint,text) to service_role;
