-- Spreelo focused content source
-- Lets one automation rule focus on an exact page, product or product category.

alter table if exists public.automation_rules
  add column if not exists content_source_scope text not null default 'whole_website',
  add column if not exists content_source_url text,
  add column if not exists content_source_title text,
  add column if not exists content_source_summary text,
  add column if not exists content_source_verified_at timestamptz;

alter table if exists public.automation_rules
  drop constraint if exists automation_rules_content_source_scope_check;

alter table if exists public.automation_rules
  add constraint automation_rules_content_source_scope_check
  check (
    content_source_scope in (
      'whole_website',
      'focus_page',
      'exact_product',
      'product_category'
    )
  );

create index if not exists automation_rules_content_source_url_idx
  on public.automation_rules (brand_profile_id, content_source_url)
  where content_source_url is not null;

comment on column public.automation_rules.content_source_scope is
  'Controls whether the rule uses the whole website, one focused page, one exact product or one product category.';

comment on column public.automation_rules.content_source_url is
  'Verified URL selected by the customer for this specific planned post.';
