-- Spreelo 144.395: READ-ONLY; no migration required.
-- After a controlled new AI operation, inspect latest 100 provider events.
SELECT
    created_at AT TIME ZONE 'Europe/Stockholm' AS svensk_tid,
    CASE WHEN post_id IS NULL THEN 'UTAN INLAGG' ELSE 'INLAGG' END AS kostnads_typ,
    operation,
    model,
    amount AS beraknad_usd,
    exact AS markerad_exakt_enligt_spreelo,
    provider_request_id,
    generation_session_id,
    generation_user_id,
    usage->>'input_tokens' AS input_tokens,
    usage->>'text_input_tokens' AS bildmodell_text_input,
    usage->>'image_input_tokens' AS bildmodell_image_input,
    usage->>'output_tokens' AS output_tokens,
    note
FROM public.post_generation_cost_events
WHERE provider = 'openai'
ORDER BY created_at DESC
LIMIT 100;

-- Per UTC-day/provider-model summary, comparable with OpenAI's daily Costs.
-- Edit the date after a new deployment. NULL amounts are UNPRICED, not free.
SELECT
    COALESCE(model, '(okand modell)') AS modell,
    CASE WHEN post_id IS NULL THEN 'UTAN INLAGG' ELSE 'INLAGG' END AS kostnads_typ,
    COUNT(*) AS handelser,
    COUNT(*) FILTER (WHERE amount IS NULL) AS utan_pris,
    ROUND(SUM(COALESCE(amount, 0)), 9) AS uppskattade_usd
FROM public.post_generation_cost_events
WHERE provider = 'openai'
  AND created_at >= TIMESTAMPTZ '2026-10-24 00:00:00+00'
  AND created_at <  TIMESTAMPTZ '2026-10-25 00:00:00+00'
GROUP BY 1,2
ORDER BY modell, kostnads_typ;
