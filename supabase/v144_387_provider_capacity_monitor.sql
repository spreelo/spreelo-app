-- Spreelo 144.387: read-only provider capacity monitoring baseline.
-- Installed separately in Supabase before the dashboard/cron becomes active.
-- Only service-role code can read/write. No generation or publication behavior changes.
create table if not exists public.provider_capacity_limits (
  provider text not null,
  metric text not null,
  label text not null,
  window_kind text not null check (window_kind in ('minute', 'pacific_day', 'utc_day', 'utc_month', 'concurrent')),
  unit text not null default 'anrop',
  limit_value bigint check (limit_value > 0),
  verification text not null default 'unknown' check (verification in ('unknown', 'provisional', 'documented', 'confirmed')),
  monitoring_mode text not null default 'not_connected' check (monitoring_mode in ('not_connected', 'instrumented')),
  instructions text not null default '',
  documentation_url text not null default '',
  coverage_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, metric)
);
create table if not exists public.provider_capacity_usage_buckets (
  provider text not null,
  metric text not null,
  bucket_start timestamptz not null,
  request_count bigint not null default 0 check (request_count >= 0),
  primary key (provider, metric, bucket_start),
  foreign key (provider, metric) references public.provider_capacity_limits(provider, metric)
);
create index if not exists provider_capacity_usage_time_idx
  on public.provider_capacity_usage_buckets(bucket_start desc);

create table if not exists public.provider_capacity_alerts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  metric text not null,
  period_key text not null,
  threshold integer not null check (threshold in (70,85,95,100)),
  current_value bigint not null,
  limit_value bigint not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  unique(provider, metric, period_key, threshold)
);

alter table public.provider_capacity_limits enable row level security;
alter table public.provider_capacity_usage_buckets enable row level security;
alter table public.provider_capacity_alerts enable row level security;
revoke all on public.provider_capacity_limits from anon, authenticated;
revoke all on public.provider_capacity_usage_buckets from anon, authenticated;
revoke all on public.provider_capacity_alerts from anon, authenticated;
grant select, insert, update on public.provider_capacity_limits to service_role;
grant select, insert, update on public.provider_capacity_usage_buckets to service_role;
grant select, insert, update on public.provider_capacity_alerts to service_role;

insert into public.provider_capacity_limits
  (provider,metric,label,window_kind,unit,limit_value,verification,monitoring_mode,instructions,documentation_url)
values
  ('shotstack','edit_requests','Edit API-anrop','minute','anrop',300,'documented','instrumented','Om gränsen närmar sig: kontrollera renderingspollning och kontakta Shotstack om högre kapacitet. För sandbox gäller 150/60 s, byt gräns manuellt om sandbox används.','https://shotstack.io/docs/guide/architecting-an-application/limitations/'),
  ('youtube','video_upload_inits','Videouppladdningar (videos.insert)','pacific_day','anrop',100,'provisional','instrumented','Kontrollera kvoten i Google Cloud Console och ansök om YouTube API quota extension vid behov. Standardgränsen är inte verifierad för Spreelos projekt.','https://developers.google.com/youtube/v3/getting-started#quota'),
  ('kling','video_submissions','Startade API-beställningar','utc_day','anrop',null,'unknown','instrumented','Kontrollera samtidighetsgränser per modell/resurspaket i Kling API Console. Antalet beställningar per dag är INTE samma sak som samtidiga jobb.','https://kling.ai/document-api/api/get-started/concurrency-rules'),
  ('kling','video_concurrency','Samtidiga videor','concurrent','jobb',null,'unknown','not_connected','Verifiera kontots concurrency och bygg separat task-livscykelmätning. Denna ruta visar inte en påhittad siffra.','https://kling.ai/document-api/api/get-started/concurrency-rules'),
  ('shotstack','credits','Renderingskrediter','utc_month','krediter',null,'unknown','not_connected','Kontrollera återstående krediter och period i Shotstack. API-anropskvoten är inte samma sak som antalet färdiga renderingar.','https://shotstack.io/'),
  ('openai','model_requests','Modellernas anropskvoter','minute','anrop',null,'unknown','not_connected','Verifiera gränser per modell och projekt under Limits i OpenAI.','https://platform.openai.com/settings/organization/limits'),
  ('vercel','function_concurrency','Samtidiga funktioner','concurrent','funktioner',null,'unknown','not_connected','Kontrollera Vercel-plan, Function Observability och concurrency.','https://vercel.com/docs/functions/limitations'),
  ('supabase','disk_io','Disk-I/O','utc_month','enheter',null,'unknown','not_connected','Kontrollera Disk IO Budget, CPU och IOPS i Supabase Dashboard; detta är ingen månadskvot som kan räknas ur anrop.','https://supabase.com/docs/guides/platform/compute-and-disk'),
  ('instagram','publishing','Publicering/API-kvot','utc_day','anrop',null,'unknown','not_connected','Verifiera app- och kontospecifika publiceringsbegränsningar i Meta.','https://developers.facebook.com/docs/instagram-platform/'),
  ('facebook','publishing','Publicering/API-kvot','utc_day','anrop',null,'unknown','not_connected','Verifiera Meta App Dashboard och aktuella sidbegränsningar.','https://developers.facebook.com/'),
  ('tiktok','direct_post','Direct Post','minute','anrop',null,'unknown','not_connected','Verifiera appens Direct Post-godkännande, per-token-tak och aktiva användarbegränsningar.','https://developers.tiktok.com/'),
  ('pinterest','api_requests','API-anrop','utc_day','anrop',null,'unknown','not_connected','Kontrollera trial/standard-åtkomst och kvoter i Pinterest Developers.','https://developers.pinterest.com/'),
  ('threads','publishing','Publicering/API-kvot','utc_day','anrop',null,'unknown','not_connected','Kontrollera publicerings- och rate limit-värden hos Meta Threads.','https://developers.facebook.com/'),
  ('linkedin','publishing','Publicering/API-kvot','utc_day','anrop',null,'unknown','not_connected','Kontrollera appens tillgång och gränser i LinkedIn Developer Portal.','https://developer.linkedin.com/')
on conflict (provider, metric) do nothing;

-- Count attempted API operations (not guaranteed billable provider units).
-- Minute buckets bound write growth; raw API keys and customer tokens are never stored.
create or replace function public.record_provider_capacity_attempt(
  p_provider text, p_metric text, p_quantity integer default 1
)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if p_quantity not between 1 and 100 then raise exception 'Invalid quantity'; end if;
  if not exists (
    select 1 from public.provider_capacity_limits
    where provider=p_provider and metric=p_metric and monitoring_mode='instrumented'
  ) then return; end if;
  insert into public.provider_capacity_usage_buckets (provider,metric,bucket_start,request_count)
  values (p_provider,p_metric,date_trunc('minute',now()),p_quantity)
  on conflict (provider,metric,bucket_start) do update
    set request_count=public.provider_capacity_usage_buckets.request_count+excluded.request_count;
end;
$$;
revoke all on function public.record_provider_capacity_attempt(text,text,integer) from public,anon,authenticated;
grant execute on function public.record_provider_capacity_attempt(text,text,integer) to service_role;

-- Accurate provider-specific periods, including YouTube's Pacific Time midnight reset.
create or replace function public.get_provider_capacity_snapshot()
returns table (
  provider text, metric text, label text, window_kind text, unit text,
  limit_value bigint, verification text, monitoring_mode text, instructions text,
  documentation_url text, coverage_started_at timestamptz,
  window_start timestamptz, window_end timestamptz,
  observed_count bigint, full_window_observed boolean
)
language sql stable security invoker set search_path=public as $$
with windows as (
  select l.*,
    case l.window_kind
      when 'minute' then date_trunc('minute',now())
      when 'pacific_day' then date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'
      when 'utc_day' then date_trunc('day',now())
      when 'utc_month' then date_trunc('month',now())
      else now()
    end as start_at
  from public.provider_capacity_limits l
), ends as (
 select w.*,
   case w.window_kind
     when 'minute' then w.start_at + interval '1 minute'
     when 'pacific_day' then ((w.start_at at time zone 'America/Los_Angeles')+interval '1 day') at time zone 'America/Los_Angeles'
     when 'utc_day' then w.start_at + interval '1 day'
     when 'utc_month' then w.start_at + interval '1 month'
     else now()
   end as end_at
 from windows w
)
select e.provider,e.metric,e.label,e.window_kind,e.unit,
  e.limit_value,e.verification,e.monitoring_mode,e.instructions,
  e.documentation_url,e.coverage_started_at,
  e.start_at,e.end_at,
  case when e.monitoring_mode='instrumented' and e.window_kind<>'concurrent'
    then coalesce((
      select sum(b.request_count)
      from public.provider_capacity_usage_buckets b
      where b.provider=e.provider and b.metric=e.metric
        and b.bucket_start >= e.start_at and b.bucket_start < e.end_at
    ),0)::bigint
    else null end,
  (e.monitoring_mode='instrumented' and e.window_kind<>'concurrent'
     and e.coverage_started_at <= e.start_at)
from ends e
order by e.provider,e.metric;
$$;
revoke all on function public.get_provider_capacity_snapshot() from public,anon,authenticated;
grant execute on function public.get_provider_capacity_snapshot() to service_role;

-- Atomic, rate-limited claim; cron never sends duplicate emails for an identical level/period.
create or replace function public.claim_provider_capacity_alert(
 p_provider text,p_metric text,p_period_key text,p_threshold integer,p_value bigint,p_limit bigint
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_threshold not in (70,85,95,100) then raise exception 'Invalid threshold'; end if;
 insert into public.provider_capacity_alerts
   (provider,metric,period_key,threshold,current_value,limit_value)
 values (p_provider,p_metric,p_period_key,p_threshold,p_value,p_limit)
 on conflict (provider,metric,period_key,threshold) do update
  set status='pending',attempts=public.provider_capacity_alerts.attempts+1,
      current_value=excluded.current_value,limit_value=excluded.limit_value,
      last_error=null
  where public.provider_capacity_alerts.status='failed'
    and public.provider_capacity_alerts.attempts < 3
 returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.claim_provider_capacity_alert(text,text,text,integer,bigint,bigint) from public,anon,authenticated;
grant execute on function public.claim_provider_capacity_alert(text,text,text,integer,bigint,bigint) to service_role;

-- Optional manual retention: execute periodically after >40 days if needed.
-- delete from public.provider_capacity_usage_buckets where bucket_start < now()-interval '40 days';
