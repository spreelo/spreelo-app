-- Spreelo v144.182 CONSOLIDATED migration
-- Target: environments where v144.181 has NOT yet been applied.
-- This file contains the complete idempotent v144.181 editorial/credit/service migration.
-- v144.182 smart planning itself is code-only and adds no new database schema.
-- Run THIS file once instead of running the v144.181 SQL separately.

-- Spreelo v144.181
-- Editorial content-quality engine, simplified customer-facing post types,
-- and Admin-controlled per-format credit pricing.
--
-- Safe migration rules:
-- - Existing product formats are not changed.
-- - Retired editorial ids are kept for historical rules, but disabled for new plans.
-- - Existing Admin pricing is preserved where possible.

begin;

alter table public.content_format_library
  add column if not exists credit_variant_prices jsonb not null default '{}'::jsonb;

alter table public.content_format_library
  drop constraint if exists content_format_library_credit_variant_prices_object_check;
alter table public.content_format_library
  add constraint content_format_library_credit_variant_prices_object_check
  check (jsonb_typeof(credit_variant_prices) = 'object');

comment on column public.content_format_library.credit_variant_prices is
  'Optional customer-facing credit prices for selectable variants within one post type. Runtime snapshots the selected cost into new plans/rules.';

-- Verified services are tracked independently from product/catalog mode so a
-- mixed business can safely expose Service in focus without keyword guessing.
alter table public.brand_profiles
  add column if not exists website_service_mode_available boolean not null default false,
  add column if not exists website_service_mode_checked_at timestamptz,
  add column if not exists website_service_mode_reason text,
  add column if not exists website_service_source_url text;

comment on column public.brand_profiles.website_service_mode_available is
  'True only when official website analysis or approved Rescue evidence verified a concrete service offering.';


-- Retire the old overlapping editorial cards. Keep their rows so historical
-- automation rules remain readable and can be mapped to their replacement type.
update public.content_format_library
set active = false,
    is_featured = false,
    updated_at = now()
where content_type_id in (
  'mistakes',
  'checklist',
  'myth_fact',
  'seasonal',
  'mini_guide',
  'behind_scenes',
  'case_example',
  'local',
  'comparison'
);

-- Refresh the retained editorial labels/descriptions. Do not overwrite an
-- Admin-edited customer credit price on existing rows.
update public.content_format_library
set display_label = 'Problem & solution',
    description = 'Show a customer problem and connect it to a relevant product or service.',
    category = 'popular',
    icon_name = 'Puzzle',
    is_featured = true,
    active = true,
    sort_order = 50,
    updated_at = now()
where content_type_id = 'problem_solution';

update public.content_format_library
set display_label = 'Tips & knowledge',
    description = 'Share useful advice, facts and smart tips for your audience.',
    category = 'educational',
    icon_name = 'Lightbulb',
    is_featured = true,
    active = true,
    sort_order = 60,
    updated_at = now()
where content_type_id = 'tips';

update public.content_format_library
set display_label = 'Question & answer',
    description = 'Answer a relevant question customers may have.',
    category = 'educational',
    icon_name = 'CircleHelp',
    is_featured = true,
    active = true,
    sort_order = 100,
    updated_at = now()
where content_type_id = 'faq';

update public.content_format_library
set display_label = 'Service in focus',
    description = 'Highlight a real service you offer.',
    category = 'sales',
    icon_name = 'Wrench',
    is_featured = true,
    active = true,
    sort_order = 130,
    updated_at = now()
where content_type_id = 'service_focus';

-- Add the two new editorial types. The initial credit values are only safe
-- defaults; Admin can change them without a deployment.
insert into public.content_format_library (
  content_type_id,
  display_label,
  description,
  icon_name,
  category,
  is_featured,
  active,
  sort_order,
  customer_credit_cost,
  credit_variant_prices,
  available_starter,
  available_growth,
  available_pro,
  is_custom,
  updated_at
)
values
  (
    'guide_choice',
    'Guide & decision help',
    'Help customers choose the right option or understand how something works.',
    'BookOpen',
    'educational',
    true,
    true,
    195,
    10,
    '{}'::jsonb,
    true,
    true,
    true,
    false,
    now()
  ),
  (
    'engagement_humor',
    'Engagement & humour',
    'Create content that encourages reactions, comments and shares.',
    'MessageCircleHeart',
    'popular',
    true,
    true,
    197,
    80,
    '{"ai_video":80,"ai_image":10,"product_image":10}'::jsonb,
    true,
    true,
    true,
    false,
    now()
  )
on conflict (content_type_id) do update set
  display_label = excluded.display_label,
  description = excluded.description,
  icon_name = excluded.icon_name,
  category = excluded.category,
  is_featured = excluded.is_featured,
  active = excluded.active,
  sort_order = excluded.sort_order,
  credit_variant_prices = case
    when public.content_format_library.credit_variant_prices is null
      or public.content_format_library.credit_variant_prices = '{}'::jsonb
    then excluded.credit_variant_prices
    else public.content_format_library.credit_variant_prices
  end,
  available_starter = public.content_format_library.available_starter,
  available_growth = public.content_format_library.available_growth,
  available_pro = public.content_format_library.available_pro,
  updated_at = now();

-- Keep the default Engagement & humour price aligned with its default AI-video
-- variant only when this is the initial untouched value. Admin changes remain authoritative.
update public.content_format_library
set customer_credit_cost = coalesce((credit_variant_prices->>'ai_video')::integer, customer_credit_cost),
    updated_at = now()
where content_type_id = 'engagement_humor'
  and coalesce((credit_variant_prices->>'ai_video')::integer, 0) > 0
  and customer_credit_cost in (10, 80);

-- Make the special-tool names clearer in Admin/catalog. Functionality is unchanged.
update public.content_format_library
set display_label = 'Custom post', updated_at = now()
where content_type_id = 'manual_prompt';

update public.content_format_library
set display_label = 'Post from web page', updated_at = now()
where content_type_id = 'focus_source';

update public.content_format_library
set display_label = 'Giveaway / Competition', updated_at = now()
where content_type_id = 'giveaway';

commit;
