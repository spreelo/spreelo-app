# Spreelo 144.403 — Modellval från AI-kontrollcentret (TESTKANDIDAT)

**Utgångspunkt:** 144.398 / GitHub commit `38e000bcb9fbd0d4939ff879cb25cae91f21e72c`.
**Ändringarnas syfte:** endast modell-ID:n, administration av respektive modellval och kontroll av modellvalets giltighet.
**Inte för produktion ännu.** Full Next.js-build och verkliga OpenAI/Supabase/Kling-integrationstester återstår.

## Förändringar

- Produktresearch och dess fallback-/eskaleringsvägar hämtar sparat `product_research` från AI-kontrollcentret i stället för den gamla konstanten som kunde välja `gpt-5.5`.
- Snabba produkt-/visionsteg får eget `product_research_fast`-val. Modellen är från början `gpt-4.1-mini` och är **inte** utbytt mot GPT-6.1.
- Onboarding-planeringen får eget `onboarding_plan`-val, utan ändringar i prompt, uppgiftslogik eller API-parametrar. Den initiala databaskonfigurationen kopierar valt `content_plan`.
- Separata val för Kling-identitetskontroll, videogranskning, transparent Kling-grafik, temakalenderns AI-klassificering, UI-översättning, klassificering av källsidor, kampanjrescue och blockerad webbresearch.
- Modellerna för Chat Completions-anrop med `temperature` är spärrade till verifierad `text_temperature`-kapacitet, så en inkompatibel resonemangsmodell inte av misstag erbjuds.
- När en *använd* modellinställning saknas eller är ogiltig blir det ett tydligt fel i det berörda AI-steget; andra ändamål berörs inte. Detta ändrar hur modellvalsfel hanteras, inte kreativ logik.
- Ändrade metadatafälts modellnamn följer samma val som faktiskt skickas till API:et.
- Befintliga promter, policyer, produkturval, Kling-rörelseinstruktioner, videoscheman, kreditlogik och publiceringskod är inte avsiktligt ändrade.

## Testutfall

**Godkända lokalt:** `node --check` för ändrade JS-filer; `scripts/test-v144-403-ai-model-selection.mjs`; `scripts/test-product-engine-v2.mjs`; `scripts/test-v144-381-collection-discovery.mjs`; `scripts/test-v144-329-ai-model-intelligence.mjs`.

**Äldre tester med befintliga brister:** `test-campaign-search-timeout-optimization.mjs` och `test-v144-329-kling-prompt-integrity.mjs` misslyckas med samma innehållsliga assertions på oförändrade 144.398. Kling-testets isolerade VM-fixture har anpassats så att den känner igen modellgetter-funktionen, men själva äldre assertionen misslyckas även i basversionen. Det är inte ett tecken på godkänd full regression.

**Ej genomförda:** komplett Next.js-build (beroendena `next` saknas i den lokala granskningsmiljön), databas-migration i Supabase, verkliga OpenAI-/Kling-anrop, Vercel Preview/produktionstest.

## Viktiga kontroller innan någon driftsättning

1. Läs befintliga Vercel-miljövariabler, i synnerhet `PRODUCT_RESEARCH_FAST_MODEL`, `OPENAI_UI_TRANSLATION_MODEL`, `CALENDAR_CLASSIFICATION_MODEL`, `CAMPAIGN_RESCUE_VALIDATION_MODEL`, `BRAND_ANALYSIS_WEB_RESEARCH_MODEL` och `PRODUCT_RESEARCH_MODEL`. De nya inställningarna måste först spegla verkliga tidigare specialmodellval; det har **inte** kunnat verifieras genom enbart ZIP-filen.
2. Kör SQL-filen `supabase/v144_403_model_selection_only.sql` **endast efter kontroll**. Den lägger till 10 saknade poster med `ON CONFLICT DO NOTHING` och uppdaterar inte de befintliga 12 valen.
3. Verifiera att admin visar 22 modellval, och att de 6 tidigare GPT-6.1-valen bevaras exakt.
4. Kör full build och automatiserade tester i GitHub/Vercel-preview före produktionsdeploy. Om Preview delar Supabase med produktion: inga automatiska jobb/publiceringar i preview.
5. Vid produktionsprov, kontrollera ett (1) isolerat test för research/onboarding/video och jämför modell-ID i faktiska OpenAI-loggar; lämna automationspublicering avstängd under provet.
6. Rollback: återställ Vercel till deployment `144.398` / commit `38e000b`. Tilläggsposterna i Supabase kan ligga kvar eftersom 144.398 inte läser de nya ändamålen.

**OBS:** Att välja en annan modell kan ge andra AI-resultat trots exakt samma prompt och övriga API-parametrar.
