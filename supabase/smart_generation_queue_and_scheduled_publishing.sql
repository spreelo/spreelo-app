-- Spreelo smart generation queue and scheduled publishing
-- Run once in Supabase SQL Editor before deploying the matching app version.

alter table public.automation_rules
  add column if not exists queue_priority smallint not null default 50,
  add column if not exists queue_source text not null default 'scheduled',
  add column if not exists queue_locked_until timestamptz null,
  add column if not exists queue_attempts integer not null default 0,
  add column if not exists last_queue_started_at timestamptz null;

alter table public.automation_rules
  drop constraint if exists automation_rules_queue_priority_check;

alter table public.automation_rules
  add constraint automation_rules_queue_priority_check
  check (queue_priority between 0 and 100);

alter table public.posts
  add column if not exists publish_locked_until timestamptz null,
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists next_publish_attempt_at timestamptz null,
  add column if not exists last_publish_error text null,
  add column if not exists approval_email_sent_at timestamptz null;

create index if not exists automation_rules_smart_queue_idx
  on public.automation_rules (is_active, next_run_at, queue_priority desc)
  where is_active = true;

create index if not exists automation_rules_queue_lock_idx
  on public.automation_rules (queue_locked_until)
  where is_active = true;

create index if not exists posts_scheduled_publish_queue_idx
  on public.posts (status, scheduled_for, next_publish_attempt_at)
  where status = 'approved' and published_at is null;

comment on column public.automation_rules.queue_priority is
  'Base priority for the smart generation queue. Dynamic deadline priority is added at runtime.';
comment on column public.automation_rules.queue_source is
  'Origin of the queued item, for example campaign or content_studio.';
comment on column public.automation_rules.queue_locked_until is
  'Short lease preventing multiple workers from generating the same automation occurrence.';
comment on column public.posts.scheduled_for is
  'The intended social publishing time. Generation and approval may happen earlier.';
comment on column public.posts.next_publish_attempt_at is
  'Backoff time for a retry after a temporary social publishing error.';
