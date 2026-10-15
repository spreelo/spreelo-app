# Spreelo 144.351 – tydlig reklamtypografi och mer genomarbetade slutkort

**Bas:** komplett Spreelo 144.350. Denna är en begränsad ändring av genereringsprompter och slutkortslayout, inte en omskrivning av produkt- eller betalflöden.

## Genomförda ändringar

1. **Kort copy planeras före bildgenerering.** Animation och Kling föreslår helst 2–5 ord i huvudbudskap och 2–4 ord i CTA, med maximal två-radig huvudrubrik som kreativ riktning. Tidigare godkännandekontroller och faktagränser behålls. **Inga nya maxlängdsspärrar som orsakar terminalt fel** har införts.
2. **Samma konstnärliga typografi återanvänds i slutkortet.** Den befintliga GPT-image-skapade, exakt verifierade huvudrubriken och CTA:n används som två olika hierarkiska nivåer. Befintlig individuellt formgiven bakgrund behålls. Inget extra betalt GPT-image/Kling-anrop tillkommer.
3. **Slutkortets struktur:** kort verifierat produkt-/modellnamn överst när det faktiskt är kort nog; stor scenanpassad huvudrubrik; en tydlig, kompletterande CTA; äkta avsändare eller användarens logotyp nedanför. Färger, typsnitt och uttryck kommer fortfarande från det enskilda reklaminläggets visuella design – gamingbilden är **inte en hårdkodad mall**.
4. **Långa produktnamn:** den frivilliga lilla modellraden utelämnas när namnet är längre än 34 tecken. Inget namn trunkeras och ingen hel video stoppas.
5. **Lokal synlighetsreparation:** mycket liten rubrik eller CTA kan byggas om på den befintliga slutkortsbakgrunden utan ett nytt betalt bildanrop. Den befintliga grafiken behålls när den är läsbar.
6. **Robust bakåtkompatibilitet:** gamla arbetsuppgifter som saknar rubrikgrafik fortsätter använda den befintliga enkla slutkortsbyggaren. Om en nykomponerad hierarki får ett lokalt grafikfel används också den gamla byggaren, utan ett nytt felärende.
7. **Ingen ändring av kvalitetsgranskning, produktidentitetslåset, betalning, adminmejl eller publiceringsregler.** Befintlig 144.350-funktionalitet behålls.

## Riktade tester som körts i lokal miljö

- `node scripts/test-v144-351-end-card-hierarchy.mjs`: korrekt 1080 × 1920; distinct hierarchy vs tidigare layout; kort respektive långt produktnamn; regression till tidigare slutkort; korrupt rubrikbild; minimal rubrik och CTA som kan ombyggas lokalt.
- `node scripts/test-v144-350-image-and-review.mjs`: uppmätt bokstavshöjd, förgranskning, CTA-reparation, säkerhetsbedömning.
- `node scripts/test-v144-350-contract-and-motion.mjs`: verifierad plaggmotion och produktlås.
- `node scripts/test-v144-349-production-recovery.mjs` och `node scripts/test-v144-349-alerts.mjs`: kollektionsval, sparade filmer och felnotiser.
- Syntaxcheck för de två cron-rutterna och ändrade bibliotek.

**Begränsning:** En komplett `next build` med alla projektets beroenden och en riktig end-to-end-produktion med GPT-image, Kling, Shotstack och Supabase har inte körts här. Denna ZIP är därför en releasekandidat. 99 % leverans har inte bevisats. Alla befintliga kvalitetsstopp från 144.350 är kvar och kan fortfarande stoppa videor vid verkliga produktfel eller tekniska fel.

## Driftsättning

1. Säkerhetskopiera nuvarande liveversion. Kör `npm ci` och `npm run build` i testmiljö.
2. Kör `npm run test:v144.351` samt `npm run test:v144.350` om den andra script-nyckeln finns i er installation; annars kör de enskilda `.mjs`-filerna ovan.
3. Testa en animation och en Kling AI-video med riktiga färdiga MP4-slutkort, inklusive en lång produktrubrik, och granska i telefonstorlek.
4. Kontrollera att inga extra provider-anrop sker på grund av den nya hierarkin. Kontrollera adminmejl och misslyckade ärenden separat – de är inte ändrade i denna patch.
5. Inga nya SQL-migrationer eller miljövariabler krävs för denna patch.
