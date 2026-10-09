# v144.331 – säker huvudbrytare för AI Control Center

**Om du ännu inte installerat AI Control Center:** använd endast `supabase/v144_331_INSTALL_AI_CONTROL_ALL.sql` (även tidigare versioners ändringar). Kör den i Supabase SQL Editor, därefter driftsätt v331 ZIP.

**Om v330:s samlade SQL redan körts:** kör bara `supabase/v144_331_ai_background_safety_switch.sql`.

Befintliga modellval, prompts, genereringsmotor, Shotstack och Spreelos äldre cron-jobb ändras inte.

## Vad brytaren styr

Fyra NYA cron-endpoints kontrollerar tabellen `ai_control_job_settings` innan något arbete utförs:
- `/api/cron/ai-market-watch`
- `/api/cron/ai-model-discovery`
- `/api/cron/ai-model-intelligence`
- `/api/cron/ai-model-test-results`

Vercel fortsätter att anropa URL:erna enligt cron-schemat, men när `enabled = false` returnerar de `skipped: ai_background_jobs_disabled` utan AI-anrop, nyhetssökningar eller mejl. Om DB/SQL saknas vägrar jobben att starta (fail closed). **Schemat i Vercel är inte avaktiverat**, bara arbetet bakom endpointen. Övriga cron-jobb påverkas inte.

## Efter installation

1. Gå till `Admin → AI Control Center`.
2. Säkerställ att `Automatiska AI-bevakningar: Av` visas.
3. Kör sedan gradvis kontroller i admin. Slå på brytaren först när du vill att de fyra jobben ska arbeta.
4. Kom ihåg att automatisk mejlleverans för modelltester också är pausad medan brytaren är av.

## Säkerhetsgräns

Brytaren stoppar endast de fyra nya jobben. Manuella modellbyten och manuella `Testa igen`-funktioner är inte schemalagda jobb. Produktionen är inte testad med riktiga API-nycklar eller riktig Supabase här.
