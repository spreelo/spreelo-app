# Spreelo v144.329 – AI Model Intelligence

Bas: granskad v144.328. Inga ändringar i genereringsmotor, prompts, kreditavdrag, Shotstack eller befintliga modellval.

## Funktioner

- Ny cron `GET /api/cron/ai-model-intelligence` klockan 04:15 UTC varje dag, skyddad av `CRON_SECRET`.
- Hämtar i mån av tillgänglighet listpriser för aktiva OpenAI-textmodeller från respektive **officiell modellsida**. Parsningen är avsiktligt strikt. Otydliga prisuppgifter lämnas tomma i stället för att gissas. Priser för bild/video blandas aldrig med tokenpriser.
- Visar jämförbar exempelberäkning i USD (1 miljon input + 1 miljon output-token), inte kostnad per Spreelo-inlägg.
- Upprepad avsaknad i tre separata lyckade dagliga API-listningar leder till en *varning* och eventuellt förslag på verifierat alternativ. Det innebär **inte** att en modell bevisligen avvecklats.
- Bevakning av officiell OpenAI-deprecations/ändringslogg och Kling-dokumentation; endast detekterade sidförändringar rapporteras, och inte på första bevakningstillfället.
- Kritiska/viktiga pris-/tillgänglighetsförändringar mejlas till contact@spreelo.com (med `RESEND_API_KEY` och korrekt från-adress).
- Inga automatiska modellbyten – föreslagna alternativ går via befintlig v327-dialog.

## Installation (när ni väljer att installera)

1. Driftsätt hela v144.329-paketet (eller senare komplett paket).
2. Kör **enbart** `supabase/v144_329_INSTALL_AI_CONTROL_ALL.sql` för att installera samtliga AI-Control-tabeller från v323–v329. Den innehåller `CREATE TABLE IF NOT EXISTS` och använder `ON CONFLICT DO NOTHING` för basmodeller.
3. Bekräfta att `CRON_SECRET`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` finns. För mejllarm också `RESEND_API_KEY` samt verifierad `RESEND_FROM_EMAIL`.
4. Öppna AI Control Center och kontrollera status efter första dagliga cron-körningen. Modeller och priser som inte kan verifieras visas inte som säkra priser.

## Begränsningar och risker

- Officiella prissidors HTML-struktur kan ändras. Då misslyckas den strikta parsningen och ingen ny prisuppgift lagras.
- Prisuppgifter kan ha cache/region/tier-skillnader. Presenterad jämförelse är endast standardlistpris per 1M texttoken, utan verktygs- eller mediaavgifter.
- Kling-video kräver fortfarande manuellt admin-test vid modellbyte. Ingen tillförlitlig maskinläsbar Kling-prislista är integrerad.
- Dokumentationssidornas förändringsdetektion bevisar inte att en viss modell är på väg bort.
- Fullständigt Next.js-build samt riktiga leverantörs-/mejlkörningar har inte körts i denna miljö. Kör i staging innan live.

## Kontroller

`node scripts/test-v144-323-ai-control-center.mjs`
`node scripts/test-v144-327-ai-model-test.mjs`
`node scripts/test-v144-328-ai-model-catalog.mjs`
`node scripts/test-v144-329-ai-model-intelligence.mjs`
