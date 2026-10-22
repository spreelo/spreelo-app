# Spreelo 144.390 — automatisk OpenAI-modellupptäckt med granskningsbara prisförslag

**Byggd ovanpå exakt Spreelo 144.389 (GitHub-commit `899ab0663288bc61ba5ff17dbf47fcf6c016acea`).**
**Ej driftsatt av ChatGPT.** Ingen extra Supabase-organisation eller miljövariabel krävs. Ska driftsättas i det vanliga GitHub → Vercel-flödet först efter den vanliga genomgången.

## Vad som tillkommit

- Befintlig daglig Vercel-cron `05:40 UTC` kontrollerar OpenAI:s publika prisinformation och anropar **GET https://api.openai.com/v1/models** med befintlig `OPENAI_API_KEY` på servern.
- Identifierar konto-tillgängliga exakta OpenAI-modell-ID:n och sparar första/senaste observation i `openai_model_catalog`. Den första kontrollen etablerar en baslinje; alla modeller kan se nyupptäckta ut på dag 1, inte nödvändigtvis nyutgivna av OpenAI.
- Parsern söker kompletta USD-per-miljon-token-rader i OpenAI:s officiella prissida (HTML, med Markdown som fallback när tillgängligt). Endast **entydiga** kompletta rader blir **icke-godkända** prisförslag. Om exempelvis Standard och Fast/Batch eller långkontextpriser ger olika värden skapas inget godtyckligt pris.
- Prisförslag sparas i **befintliga** `openai_price_versions`, med `approved=false`; det förändrar **aldrig** godkända eller aktiva priser. Du kan granska och godkänna i befintlig `/admin/openai-pricing`. Övriga modell-/genereringsinställningar ändras inte.
- Nya modeller från prissidan kan visas även om ditt API-konto ännu inte har åtkomst till dem. Det verifierade `/models`-API:t har **inga prisfält**. En modell som ännu inte finns i API-svaret eller prissidan kan inte garanteras upptäckt direkt vid officiell lansering.
- Admin visar upptäckta modeller, prisstatus, granskningsförslag och manuell **Kontrollera OpenAI-modeller nu**. Den manuella kontrollen är primäradmin-skyddad och undviker upprepning inom 10 minuter.
- Körningar med misslyckad OpenAI/API-förfrågan sparas som delvis lyckade eller misslyckade. Inga priser gissas. Befintliga Kling-/Shotstack-flöden och kundkrediter berörs inte.

## Installation (inga andra projekt, inga nya Vercel-nycklar)

1. Ta vanlig säkerhetskopia av Supabase. Behåll befintlig `SPREELO_OPENAI_PRICING_ENABLED=true` **endast i Production** samt de befintliga servernycklarna.
2. Lägg projektets fullständiga ZIP **ovanpå en ren aktuell 144.389-projektmapp**; radera inte `.git` och radera inte hela projektmappen. Förväntat: endast de avsedda 144.390-filerna ändras. Alternativt använd ändringspaketet som följer med leveransen. Commit och Push via GitHub Desktop, kontrollera Vercel `Production / Ready`.
3. Kör **endast** `supabase/v144_390_openai_model_discovery.sql` i befintligt Supabase-projekt. 144.389:s tidigare SQL ska **inte köras igen**.
4. Besök `/admin/openai-pricing`, välj **Kontrollera OpenAI-modeller nu**, kontrollera resultatet. Vid problem: kontrollera Vercel-loggar för `openai-pricing-audit`/admin-anrop. Ingen manuell modellinmatning behövs för upptäckt; prisförslag kräver däremot kontroll av OpenAI:s prissida och manuellt godkännande.
5. Vid godkända tester ska admin visa OpenAI-model-ID:n och nya förslag när källinformationen räcker. Finns det ingen entydig prisrad måste den betraktas som **Ej verifierat**, inte 0 USD.

## Begränsningar

- Ingen officiell maskinläsbar OpenAI API-prislista har verifierats. Den officiella **GET /models** listar modeller, **inte priser**. HTML/Markdown-inläsning kan sluta fungera när OpenAI gör om sajten eller när flera prisnivåer syns. Sådana tillfällen hanteras med synlig osäkerhet, aldrig ett påhittat pris.
- Tarifförslag är en **kandidat från publicerad sida**, inte en fakturaverifierad summa.
- Projektomfattande debiteringsavstämning via OpenAI Costs API från 144.389 är fortfarande en separat, ännu inte konfigurerad funktion. Inga extra hemliga API-nycklar ingår i ZIP:en.
- Ingen ändring sker automatiskt i vilken modell Spreelo använder, vilka krediter som debiteras eller hur videor genereras.

## Verifiering lokalt

- `node --test tests/openai-model-discovery-144390.test.mjs tests/openai-approved-pricing.test.mjs tests/reconcile-smoke.test.mjs`
- `node scripts/test-v144-12-exact-generation-cost-tracking.mjs`
- `node scripts/test-v144-155-complete-generation-cost-metering.mjs`

Fullständig Next.js/Vercel-byggning och verkliga externa OpenAI/Supabase-körningar måste verifieras efter driftsättning. Länken till OpenAI:s publicerade prislista: https://developers.openai.com/api/docs/pricing. Modell-listnings-API: https://developers.openai.com/api/reference/resources/models/methods/list.
