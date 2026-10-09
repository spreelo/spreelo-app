# Spreelo v144.330 – AI Control Center: stabilisering och kontroll

**Bas:** v144.329 AI Model Intelligence.

## Exakta kodändringar

- `app/api/cron/ai-model-intelligence/route.js`: en misslyckad delkontroll markeras inte längre som slutförd för resten av dagen. Endast misslyckade delkontroller behöver köras om. Viktiga mejlvarningar sparas före mejlförsök och ligger kvar för återförsök vid fel.
- `lib/aiModelIntelligenceServer.js`: deterministisk idempotensnyckel till Resend för samma varningsbatch.
- `scripts/test-v144-327-discovery-audit.mjs`: anpassat det gamla testet till v328:s modulimport.
- `scripts/test-v144-330-ai-control-stabilization.mjs`: nya simulerade tester för cron-auth, partiellt API-fel, upprepat körningsförsök, mejlfel, SQL och UI-syntax.

**Ingen ändring** av produktmotorn, prompts, modellval, kreditavdrag, publicering, Shotstack eller innehållsgenereringslogik. Inga automatiska modellbyten.

## En SQL-fil

Kör enbart `supabase/v144_330_INSTALL_AI_CONTROL_ALL.sql` i Supabase SQL Editor. Filen innehåller alla AI Control Center-migrationer från v323–v329. Inga nya tabeller krävs för v330:s kodförbättring. Den samlade SQL-filen bevarar existerande modellval med `ON CONFLICT DO NOTHING`.

**Förutsättningar:** Befintliga admin- och mass-testtabeller enligt v144_102 och tidigare Spreelo-setup. SQL ska köras på avsedd staging-databas före skarp driftsättning.

## Lokal verifiering (API:er mockade)

```
node scripts/test-v144-323-ai-control-center.mjs
node scripts/test-v144-327-ai-model-test.mjs
node scripts/test-v144-327-discovery-audit.mjs
node scripts/test-v144-328-ai-model-catalog.mjs
node scripts/test-v144-329-ai-model-intelligence.mjs
node scripts/test-v144-330-ai-control-stabilization.mjs
```

## Nödvändiga stagingkontroller före skarp drift

1. Verifiera environment: `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` och befintliga Kling-inställningar. Kontrollera att avsändardomänen är verifierad hos mejlleverantören.
2. Kör den samlade SQL-filen i staging, driftsätt och öppna AI Control Center. Kontrollera att befintliga modellval har exakt samma värden som före driftsättningen.
3. Kör de tre bevakningarna i staging med rätt cron-hemlighet, kontrollera databasraderna för modellkatalog, modellpriser, källdokument och dagens `ai_model_intelligence_runs`.
4. Välj ett företag **under ett aktivt adminkonto** med godkänd webbutik. Skapa ett modelltest; kontrollera att resultatet genererats med vald modell och mejlas till `contact@spreelo.com`. Kontrollera att annat innehåll och kreditsaldon inte ändrats. Publicera inte testinlägget.
5. Godkänn eller avvisa test i admin. Säkerställ att produktionsmodellen bara ändras när godkännande sker. Kontrollera direktbyte utan test separat med ett ofarligt modellval.
6. Testa en avbruten pris-/bevakningskörning samt tillfälligt borttagen Resend-nyckel i staging: anropet ska kunna återförsökas med samma varningsbatch, inte markeras som lyckad.
7. Kör full `next build` i en fullständig install-miljö. Säkerställ att staging visar inga nya runtimefel och att vanliga automatiseringar fortfarande körs korrekt.

## Ärliga begränsningar

Denna version har verifierats med statiska kontroller och lokala mockade API-testfall. Verkliga OpenAI-, Kling-, Supabase-, Resend- och produktionstestkörningar samt komplett Next.js-build har **inte** verifierats här. Inget nytt produktionsmodellbyte har utförts. Stagingkontrollerna ovan är ett krav innan en skarp produktionsinstallation kan rekommenderas.
