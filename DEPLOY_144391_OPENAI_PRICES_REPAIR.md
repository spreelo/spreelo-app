# Spreelo 144.391 — bättre automatisk inläsning av OpenAI:s Standardpriser

**Utgångspunkt:** Version 144.390 som redan körs i Vercel och har sin Supabase-migrering installerad. **Ingen driftsättning har gjorts av ChatGPT.**

## Vad som ändras

1. Prioriterar Spreelos fem modeller: `gpt-4.1-mini`, `gpt-5.5`, `gpt-5.6-sol`, `gpt-image-2` och `gpt-image-2.5-flare` i en tydlig tabell i admin.
2. För de tre textmodellerna samt `gpt-image-2.5-flare` läser systemet den exakta modellens officiella OpenAI-dokumentation (Markdown i första hand, HTML som reserv). Parsern kräver uttryckliga text-/bildtokenpriser och kan inte ta belopp från marknadsföringsrubriker eller en annan modells prissida.
3. Rättar fel med fortsättningsrader (`Text`) i HTML/Markdown-tabeller för bildmodeller. För `gpt-image-2` kan detta göra en tydlig komplett bildpriskandidat tillgänglig från den officiella prissidan, men ett otydligt pris stannar som overifierat.
4. När globala prissidan innehåller flera priser för t.ex. Standard och Batch kan den exakta modellens publicerade Standardpriser ligga till grund för förslag. Om exakta belopp saknas skapas inget förslag.
5. Manuellt godkännande är fortfarande obligatoriskt. Godkända priser, postgenerering, modellval, kundkrediter, Kling och Shotstack ändras INTE.
6. Nya prisförslag använder dokumentlänk till den faktiska officiella modellsidan. Godkännanderutten tillåter endast OpenAI:s kanoniska prissida eller den exakta modellens officiella dokumentation, och kräver färsk audit/fingeravtryck och uttryckligt godkännande.
7. En kontroll från 144.390 kan köras om direkt efter uppgradering utan att blockeras av den gamla 10-minuterspärren.

## Installation

1. GitHub Desktop måste visa aktuell `main` (144.390) och **0 changes**. Ta gärna en säkerhetskopia.
2. **Rekommenderat:** använd `Spreelo-144.391-ENDAST-8-ANDRINGAR.zip` och kopiera filerna direkt *ovanpå* din befintliga projektmapp. **Radera inte projektmappen, och använd inte `Discard All Changes` för att installera nya filer.**
3. Kontrollera att GitHub Desktop visar **8** nya/ändrade filer och **0** borttagna filer. Commit och Push som vanligt.
4. Kontrollera att Vercel visar **Production Ready**.
5. Öppna `/admin/openai-pricing` och klicka **Kontrollera OpenAI-modeller nu**. Granska avsnittet *Prioriterade modeller i Spreelo* och eventuella nya prisförslag.
6. **Ingen SQL-migrering behövs** för 144.391. Inga nya miljövariabler, hemligheter eller nycklar behövs.

## Förväntningar och begränsningar

- De verifierade offentliga modellerna hade 2026-10-22 Standardpris per miljon tokens:
  - `gpt-4.1-mini`: textinput 0.40 USD, cache 0.10, output 1.60.
  - `gpt-5.5`: textinput 5 USD, cache 0.50, output 30.
  - `gpt-5.6-sol`: textinput 4 USD, cache 0.40, output 20.
  - `gpt-image-2.5-flare`: textinput 5 USD, cache 1.25, bildinput 8, bildcache 2, bildoutput 30.
  - `gpt-image-2`: uppgifter finns på den officiella prissidan men måste fortfarande granskas med avseende på aktuell process-/debiteringsform.
- Priserna ovan är **inte hårdkodade som aktiva tariffer**. Koden hämtar publicerade priser igen varje gång prisbevakningen körs.
- Endast **Standard med kort kontext** kan föreslås av den här förbättringen. Batch/Fast/Flex, lång kontext (>272k på vissa modeller), cachens skrivningar, webbsökning, regionspåslag, API-specifika bildcache-undantag och faktiska OpenAI-fakturor hanteras INTE automatiskt som godkända separata tariffer. Om ett sådant fall inte kan prissättas säkert ska kostnadsmotorn hellre visa *uppskattning/osäker* än räkna fel.
- Modeller som OpenAI:s API returnerar utan pris syns fortsatt som *Pris ej verifierat*. Det betyder inte att priset är noll.
- Det finns **inget officiellt verifierat maskinläsbart API för priser**. Den här lösningen tolkar OpenAI:s offentliga dokument och måste driftverifieras efter Vercel-deploy.
- Projektövergripande avstämning mot OpenAI Costs API kräver fortfarande separat Admin API-nyckel och dedikerat projekt (från 144.389). Denna version konfigurerar den inte.

## Lokal verifiering

```sh
node --test tests/openai-model-discovery-144390.test.mjs tests/openai-price-evidence-144391.test.mjs tests/openai-approved-pricing.test.mjs tests/reconcile-smoke.test.mjs
node scripts/test-v144-12-exact-generation-cost-tracking.mjs
node scripts/test-v144-155-complete-generation-cost-metering.mjs
```

32 av 32 riktade tester passerar lokalt. Fullständig Next.js/Vercel-kompilering och nätverksanrop mot OpenAI/Supabase har inte kunnat köras i den isolerade byggmiljön; Vercel Production Ready och första riktiga knapptryckningen krävs för slutverifiering.

Källor: https://developers.openai.com/api/docs/pricing och respektive officiell modellsida på https://developers.openai.com/api/docs/models/.
