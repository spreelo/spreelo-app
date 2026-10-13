# Spreelo v144.340 – Klartext om misslyckade inlägg

Utgår från hela ZIP-filen `spreelo-144.339-kling-worker-merged(1).zip`.

## Ändringar

- Varje inlägg i admin > Misslyckade visar kategoriserad felorsak och kort föreslagen åtgärd direkt i listan.
- Inläggets detaljvy visar felorsak i klartext, steg för steg för återställning, sparad felkod, körningsfas och möjlighet att visa ursprungligt felmeddelande.
- Feltyper: Supabase/databas, social publicering/kanalanslutning, krediter/kvot, Kling-granskning, video/rendering, webbkälla/produkt, timeout/avbrott, AI-generering och okänd orsak.
- Tidigare sparad information används. En okänd orsak markeras som okänd; appen påstår inte att ett Supabase-avbrott är verifierat bara för att en liknande feltext upptäcks.
- För fel där återställning först måste göras med befintligt material, t.ex. databas- eller publiceringsfel, döljs den generiska Regenerate-knappen på misslyckade inlägg. Inga server-side retry-API:er, kostnader, kundkrediter, publiceringsvägar eller databasstrukturer ändras.
- Då Regenerate faktiskt är lämpligt på ett misslyckat inlägg krävs en tydlig bekräftelse om kontroll av tidigare providerjobb och möjlig ny kostnad. Befintlig särskild Kling-retry ber om motsvarande bekräftelse.
- Befintliga Rescue-flöden och produktredigerare återanvänds; ingen ny extern tjänst krävs.

## Viktiga begränsningar

- Administrationsguiden är ett diagnostiskt stöd baserat på den feldata som faktiskt sparats. Den kan inte skapa orsakskunskap som saknas i historiska poster.
- Fel som sker **innan något arbetsobjekt kan identifieras** är fortfarande systemincidenter och kan inte med säkerhet sättas på ett specifikt kundinlägg.
- Guiden skapar inte någon ny generell retry-knapp för publicering eller ett automatiskt återupptagande av providerjobb. Dessa måste hanteras i befintliga flöden.
- Befintliga server-API:er har inte spärrats för direktanrop; skyddet av Regenerate-knappar avser adminvyn.
- Kontrollera aktuella jobb hos videoleverantören innan du väljer att skapa en ny video.

## Utrullning

- Ingen SQL eller ny miljövariabel krävs.
- Distribuera appen som vanlig uppdatering och testa befintliga misslyckade inlägg i admin.
- Tester: `node --experimental-default-type=module scripts/test-v144-340-failed-post-recovery.mjs`
