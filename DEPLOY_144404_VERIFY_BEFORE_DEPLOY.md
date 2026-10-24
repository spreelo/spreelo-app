# Spreelo 144.404 — verifieringskandidat, FÅR INTE DRIFTSÄTTAS ÄNNU

Utgångspunkt: oförändrad Spreelo 144.398. Den här kandidaten bygger vidare på 144.403.

## Korrigeringar från 144.403
1. `test-kling-story-before-frame.mjs`: VM-fixturen får den nya modell-gettern. Ingen videomotor ändrad.
2. `test-render-review-classification.mjs`: VM-fixturen får mockad `activeAiModel`. Ingen rendering/granskningsmotor ändrad.
3. `supabase/v144_403_model_selection_only.sql`: onboarding ärver AKTUELLT sparat modellval från `content_plan` som både `model` och `default_model`. SQL avbryter om posten saknas, i stället för att tyst välja GPT-5.5.
4. `supabase/v144_404_preflight_READ_ONLY.sql`: läsande kontroll av befintliga inställningar. Kör INTE installations-SQL förrän övriga tester och miljövariabler har verifierats.

## Genomförda tester (lokalt, Sharp 0.34.1 för de testfall som använder Sharp)
- `test-kling-story-before-frame.mjs`: PASS
- `test-render-review-classification.mjs`: PASS
- `test-v144-403-ai-model-selection.mjs`: PASS
- `test-product-engine-v2.mjs`: PASS
- `test-merged-429-video-stability.mjs`: PASS
- `test-store-map-product-agent.mjs`: PASS
- Syntaxkontroll: 18 berörda JS-filer godkända.
- Simulering med exporterade 12 existerande AI-inställningar + 10 föreslagna nya poster: PASS (endast simulering, ingen Supabase-ändring).

## EJ GODKÄNDA / VERIFIERADE KONTROLLER
- **Next.js build:** BLOCKERAD. Projektet kräver Sharp 0.34.5; testmiljön har 0.34.1. Next.js 16.2.10/övriga pnpm-beroenden saknas och DNS till npm-registret misslyckas. Versionstvånget kringgicks INTE.
- **Riktiga API-anrop:** EJ KÖRDA. Här finns inte Spreelos hemliga OpenAI-/Kling-/Supabase-nycklar eller isolerad testmiljö. API-kompatibilitet kan därför inte intygas.
- **Vercel-miljövariabler:** EJ KONTROLLERADE. Nya specialval kan tidigare ha fått modell genom env-variabler. Jämför utan att visa värden: `BRAND_ANALYSIS_WEB_RESEARCH_MODEL`, `PRODUCT_RESEARCH_MODEL`, `PRODUCT_RESEARCH_FAST_MODEL`, `CAMPAIGN_RESCUE_VALIDATION_MODEL`, `CAROUSEL_CREATIVE_MODEL`, `EDITORIAL_HEADLINE_MODEL`, `OPENAI_UI_TRANSLATION_MODEL`, `CALENDAR_CLASSIFICATION_MODEL`.
- **`blocked_web_research`:** Initialt GPT-5.5 i SQL för att bevara gamla standardbeteendet, inte en automatisk ersättning för produktresearchens GPT-6.1. Bekräfta att det motsvarar befintligt env-val eller välj avsiktligt ny modell i admin först efter kompatibilitetstest. Denna funktion använder OpenAI Responses `background:true`, `store:true`, `web_search` och `tool_choice:required`.
- **`campaign_rescue_validation`:** Initialt GPT-5.6 Sol, som i befintlig kod när inga env-överskrivningar finns. Funktionen använder Chat Completions och JSON response format; ny modell ska ha verifierat stöd för det API:t.
- Flera äldre regressionstester fallerar redan på 144.398. De är inte lösta av detta modellstyrningsarbete.

**144.398 förblir live. Ingen SQL har körts. Ingen GitHub-branch, Vercel-deployment eller Supabase-tabell har ändrats.**
