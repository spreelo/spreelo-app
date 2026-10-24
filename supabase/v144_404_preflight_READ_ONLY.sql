-- Spreelo 144.404 PRE-FLIGHT ONLY. Reads current database; makes NO changes.
-- Output the saved model selection, reasoning effort and differences from the expected model.
-- Run before any migration / deployment and compare with local 144.398 CSV.
SELECT purpose, provider, model, default_model, capability, reasoning_effort
FROM public.ai_model_settings
ORDER BY purpose;

-- All new purpose keys should be ABSENT before migration, and the base 12 present.
SELECT count(*) FILTER (WHERE purpose IN (
  'brand_analysis','calendar_image','campaign_plan','carousel_creative',
  'content_plan','editorial_headline','kling_video','manual_post',
  'post_text','product_research','standard_image','transparent_typography'
)) AS original_purposes,
count(*) FILTER (WHERE purpose IN (
  'onboarding_plan','product_research_fast','kling_identity_audit','video_ad_review',
  'kling_typography','calendar_classification','ui_translation',
  'content_source_classification','campaign_rescue_validation','blocked_web_research'
)) AS new_purposes, count(*) AS total
FROM public.ai_model_settings;
