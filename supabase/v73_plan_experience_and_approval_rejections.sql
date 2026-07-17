-- Spreelo v73: custom content-format icons and rejection feedback workflow.

alter table public.content_format_library
  add column if not exists icon_url text,
  add column if not exists icon_storage_path text;

create table if not exists public.post_rejection_feedback (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid,
  brand_profile_id uuid,
  reason_category text not null,
  reason_text text not null,
  contact_email text,
  review_status text not null default 'new',
  refund_status text not null default 'pending_review',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists post_rejection_feedback_post_id_unique_idx
  on public.post_rejection_feedback(post_id);

create index if not exists post_rejection_feedback_post_id_idx
  on public.post_rejection_feedback(post_id);

create index if not exists post_rejection_feedback_review_status_idx
  on public.post_rejection_feedback(review_status, created_at desc);

alter table public.post_rejection_feedback enable row level security;

revoke all on public.post_rejection_feedback from anon, authenticated;

-- The public rejection form and admin tools use server-side service-role access.
-- No client-side RLS policy is intentionally created for this table.
