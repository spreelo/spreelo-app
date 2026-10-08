-- Spreelo v144.323 - AI Control Center
create table if not exists public.ai_model_settings (
  purpose text primary key,
  provider text not null,
  model text not null,
  default_model text not null,
  capability text not null,
  changed_by uuid null,
  changed_at timestamptz not null default now(),
  auto_replaced boolean not null default false,
  replacement_reason text null
);

alter table public.ai_model_settings enable row level security;
revoke all on table public.ai_model_settings from anon, authenticated;
grant all on table public.ai_model_settings to service_role;

insert into public.ai_model_settings (purpose, provider, model, default_model, capability)
values
 ('post_text','openai','gpt-4.1-mini','gpt-4.1-mini','text'),
 ('brand_analysis','openai','gpt-4.1-mini','gpt-4.1-mini','text_vision'),
 ('content_plan','openai','gpt-5.5','gpt-5.5','text_reasoning'),
 ('product_research','openai','gpt-5.5','gpt-5.5','text_reasoning'),
 ('editorial_headline','openai','gpt-5.6-sol','gpt-5.6-sol','text_reasoning'),
 ('carousel_creative','openai','gpt-5.6-sol','gpt-5.6-sol','text_reasoning'),
 ('standard_image','openai','gpt-image-2','gpt-image-2','image'),
 ('transparent_typography','openai','gpt-image-2.5-flare','gpt-image-2.5-flare','image_alpha'),
 ('calendar_image','openai','gpt-image-2','gpt-image-2','image'),
 ('kling_video','kling','kling-3.0','kling-3.0','image_to_video')
on conflict (purpose) do nothing;
