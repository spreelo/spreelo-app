# Spreelo 144.350 — mätbar textkvalitet och mer naturlig verifierad rörelse

**Bas:** den kompletta 144.349-ZIP-filen. Endast kända produktionsvägar för AI-video och animation ändras; behörigheter, betalningar, sociala kanaler och historik behålls.

## Ändringar i den här versionen

1. **Mät faktisk text i slutformat.** `lib/videoTypographyPreflight.js` mäter genomskinliga textpixlar på slutlig 1080 × 1920-overlay och beräknar den minsta huvudsakliga teckenhöjden. Huvudrubriken ska nå minst 46 pixlars synlig bläckhöjd; det motsvarar ungefär en 68 px font men verifieras efter faktisk storlek, radbrytning och skalning. Separata diakritiska märken ignoreras som egna textlinjer.
2. **Korrigera före slutrendering.** Både animations- och Kling-finalisering använder samma kontroll. Godkänd unik GPT-image-typografi bevaras. Vid för liten text byggs en lokal vektorversion av det godkända budskapet med 68 px som minsta *fontstorlek*, eller större om ytan tillåter. Inga nya betalda bild- eller Kling-anrop görs för den korrigeringen. Färdiga Kling-pixlar bevaras.
3. **Även slutkortets CTA mäts på slutligt placerade bokstäver.** För små bokstäver byggs om lokalt, med samma reklamtext och den befintliga AI-formgivna bakgrunden.
4. **Kvalitetsgranskning efter faktisk förbättring.** Objektivt synliga defekter, som allvarligt oläslig text, element ovanpå produkten, lösa grafiska streck och trasiga slutkort, är fortfarande stoppande. Rena subjektiva bedömningar av typografisk hierarki eller alignment registreras som kreativa förbättringsråd och stoppar inte en redan tekniskt kontrollerad film.
5. **Granskningstjänsten är inte längre en permanent blockerare i huvudkompositionerna.** Om just den visuella designgranskningstjänsten har ett tillfälligt avbrott *efter* separat ordagrann textverifiering och objektiv upplösningskontroll, kan produktionen fortsätta med status `reviewStatus: unavailable` och `requiresFollowup`. Andra säkerhetskontroller inklusive Klings produktidentitet körs som förut. Kontroll av en faktiskt underkänd design kringgås aldrig.
6. **Mer rörelse i verifierade plaggscener.** `scene_verified_wear` låter Creative Director välja verkliga steg, arm- och kroppsrörelse samt kameraföljning när det på första bildrutan redan finns en **befintlig person som tydligt bär det exakta verifierade plagget**. Förslaget kräver en separat visionsäkerhetskontroll med minst 0,90 säkerhet och samtliga fem säkerhetsfält positiva. Det gäller aldrig tryckta personer, förpackningar eller oidentifierade produkter. Vi behåller produktens framåtvända vy, exakta tryck och alla komponenter. Underkänd rörelseplan ger gammal säker digital kamerarörelse.
7. **Ingen ny videomodell eller generisk fallback-film.** Kling och Shotstack är kvar. Inga produktvyer får hittas på, inga kundinlägg publiceras från denna testmiljö.

## Tester genomförda här

- `node scripts/test-v144-350-contract-and-motion.mjs` — godkänd med säkerhetsavslag, dubbelvisionsförkontroll och korrekt Kling-prompt utan kapning.
- `node scripts/test-v144-350-image-and-review.mjs` — godkänd med lokalt installerad Sharp 0.34.1: verkliga 1080 × 1920-textbilder för små/stora rubriker, automatisk ombyggnad utan att ändra godkänd typografi, serverfel, för liten CTA i slutkortet och hårda kvalitetsstopp.
- `node scripts/test-v144-346-cinematic-motion.mjs`, `node scripts/test-v144-349-production-recovery.mjs` och `node scripts/test-v144-349-alerts.mjs` — godkända.
- Syntaxkontroller av ändrade JavaScript-filer — godkända.

**Begränsning:** Appens `package.json` kräver Sharp 0.34.5; den lokala bildtestmiljön använder Sharp 0.34.1. En komplett `next build` och full integration med riktiga GPT-image-, Kling-, Shotstack- och Supabase-körningar har **inte** genomförts. De externa tjänsterna och stagingmiljö finns inte tillgängliga här.

## Innan utrullning

1. Kör `npm ci`, `npm run build`, `npm run test:v144.350` med produktionsversionen av Sharp i en separat miljö.
2. Testa ett normalt 5-sekunders AI-produktklipp (verifierat plagg på person), ett plagg utan person, en animation med lång rubrik och en med blandad ljus/mörk bakgrund. Kontrollera samtliga färdiga MP4:or visuellt.
3. Testa en simulerad för liten rubrik, fel kontrast, förstörd produktegenskap och avbrott i review-API. Produktavvikelser ska fortfarande blockeras, normala designkorrigeringar ska återanvända betald video.
4. Verifiera misslyckade jobb + administratörsmejl på både animation och Kling (tidigare kodväg i 144.349; inte ombyggd i denna patch).
5. Gör en begränsad release och mät `schemalagda -> publicerbara MP4` separat för varje innehållstyp, inklusive krediter, kostnad, väntetid, `needs_repair` och felkoder. Målet **99 % levererade och godkända** är ännu **inte verifierat** och får inte anges som uppnått förrän mätning visar det.

## Migration

Inga SQL-migrationer, nya miljövariabler eller nya externa betaltjänster behövs för just denna patch. Behåll och säkerhetskopiera Supabase och den fungerande liveversionen. Varje produktionsändring bör gå via separat test/staging; annars behandla ZIP:en som en releasekandidat, inte en verifierad stabil publik release.
