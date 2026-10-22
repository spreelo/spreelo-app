SPREELO 144.390 - INSTALLATION

Grundversion: 144.389, GitHub commit 899ab0663288bc61ba5ff17dbf47fcf6c016acea.

NYHETER: Automatisk OpenAI-modellupptäckt och ej godkända prisförslag i /admin/openai-pricing.
INGEN OpenAI-modell eller kundkredit ändras automatiskt.

1. Se till att lokal GitHub Desktop main är synkroniserad med 144.389 och visar 0 ändringar.
2. Kopiera innehållet från den fullständiga ZIP:en ovanpå den befintliga projektmappen. RADERA INTE projektmappen eller .git först. (Alternativ: använd den lilla PATCH-ZIP:en.)
3. Bekräfta att bara avsedda 144.390-filer visas som ändrade eller nya, commit/push, kontrollera Vercel Production Ready.
4. Ta backup och kör ENDAST supabase/v144_390_openai_model_discovery.sql i din befintliga Supabase SQL Editor. Kör inte om 144.389-migreringen.
5. Öppna https://app.spreelo.com/admin/openai-pricing och klicka Kontrollera OpenAI-modeller nu. Kontrollera att upptäckta modellnamn listas.
6. Granska eventuella prisförslag mot officiell prislista innan godkännande.

Ingen ny miljövariabel krävs. Befintlig SPREELO_OPENAI_PRICING_ENABLED=true (enbart Production), OPENAI_API_KEY och befintlig CRON_SECRET används.

OBS! OpenAI:s /v1/models innehåller modell-ID:n men inga priser. Nya modeller utan entydigt publicerat pris visas utan verifierad tariff. OpenAI:s faktiska debitering per projekt avstäms fortfarande inte automatiskt i denna uppdatering.

TEKNISK BESKRIVNING: DEPLOY_144390_OPENAI_AUTO_MODEL_DISCOVERY.md
