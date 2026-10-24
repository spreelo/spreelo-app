-- Spreelo 144.403: optional AI-purpose selections, no existing selections altered.
-- Run only after reviewing the preflight SELECT and before deploying the new code.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.ai_model_settings WHERE purpose='content_plan' AND provider='openai' AND model <> '') THEN
   RAISE EXCEPTION 'Missing saved content_plan model; onboarding default cannot be safely derived';
 END IF;
END $$;
INSERT INTO public.ai_model_settings (purpose,provider,model,default_model,capability)
VALUES
 ('onboarding_plan','openai',(SELECT model FROM public.ai_model_settings WHERE purpose='content_plan'),(SELECT model FROM public.ai_model_settings WHERE purpose='content_plan'),'text_reasoning'),
 ('product_research_fast','openai','gpt-4.1-mini','gpt-4.1-mini','text_vision'),
 ('kling_identity_audit','openai','gpt-4.1-mini','gpt-4.1-mini','text_vision'),
 ('video_ad_review','openai','gpt-4.1-mini','gpt-4.1-mini','text_vision'),
 ('kling_typography','openai','gpt-image-2.5-flare','gpt-image-2.5-flare','image_alpha'),
 ('calendar_classification','openai','gpt-4.1-mini','gpt-4.1-mini','text_vision'),
 ('ui_translation','openai','gpt-4.1-mini','gpt-4.1-mini','text_temperature'),
 ('content_source_classification','openai','gpt-4.1-mini','gpt-4.1-mini','text_temperature'),
 ('campaign_rescue_validation','openai','gpt-5.6-sol','gpt-5.6-sol','text_reasoning'),
 ('blocked_web_research','openai','gpt-5.5','gpt-5.5','text_reasoning')
ON CONFLICT (purpose) DO NOTHING;
COMMIT;
