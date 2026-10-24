-- Spreelo 144.397: run once in Supabase SQL Editor BEFORE deploy.
-- Only adds optional columns. No translations, existing models or cost history altered.
BEGIN;
ALTER TABLE public.ai_model_settings ADD COLUMN IF NOT EXISTS reasoning_effort text;
ALTER TABLE public.ai_model_test_requests ADD COLUMN IF NOT EXISTS reasoning_effort text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_settings_reasoning_effort_144397_check') THEN
    ALTER TABLE public.ai_model_settings ADD CONSTRAINT ai_model_settings_reasoning_effort_144397_check CHECK
    (reasoning_effort IS NULL OR reasoning_effort IN ('none','low','medium','high','xhigh','max'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_test_reasoning_effort_144397_check') THEN
    ALTER TABLE public.ai_model_test_requests ADD CONSTRAINT ai_model_test_reasoning_effort_144397_check CHECK
    (reasoning_effort IS NULL OR reasoning_effort IN ('none','low','medium','high','xhigh','max'));
  END IF;
END $$;
COMMIT;

-- Publicly documented GPT-6.1 Sol Standard, short-context rate (per 1M tokens).
-- This approval applies ONLY to this fixed tariff, not Fast, Ultrafast,
-- Batch/Flex, regional surcharges, long context, or separate tool calls.
-- Skip if any approved tariff already exists for this model/tier; never override it.
INSERT INTO public.openai_price_versions
 (model,service_tier,pricing_kind,version,input_usd_per_m,cached_input_usd_per_m,
  output_usd_per_m,valid_from,source_url,source_fingerprint,approved,approved_by,approved_at)
SELECT 'gpt-6.1-sol','standard','text','official-2026-10-24-gpt61-sol',2.0,0.1,10.0,
 TIMESTAMPTZ '2026-10-24 00:00:00+00',
 'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
 'official-model-page-2026-10-24-gpt61-sol-standard-shortcontext',true,'spreelo-144.397-reviewed-official',now()
WHERE NOT EXISTS (
 SELECT 1 FROM public.openai_price_versions
 WHERE model='gpt-6.1-sol' AND service_tier='standard' AND approved=true
);
