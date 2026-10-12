# Spreelo 144.337 – generell produkt- och videokvalitet

Utgångspunkt: den kompletta versionen `spreelo-144.336-kling-natural-motion-admin-mobile.zip`.

## Vad som ändras

- Produktanalysen läser originalproduktbilden och befintlig produkttext. Den bygger ett kontrakt med synliga identitetsdetaljer, komponentantal, roller, infästningar, verifierade handlingar och okända egenskaper. Bilden bestämmer utseendet; produkttext får inte verifiera osynliga ytor. Inga nya regler per produktkategori behövs.
- Analysen av verifierad kameravy och produktinformationen körs samtidigt. En misslyckad informationsanalys tillåter inga produktoperationer.
- Startbildens instruktion får produktkontraktet och ska etablera material, tillbehör och startförhållanden korrekt. Den befintliga jämförelsen mot originalprodukten behålls.
- Rörelseplaneraren ser den faktiska startbilden. Den väljer produktanvändning med verifierade handlings-ID:n, presentation eller kamera/miljörörelse. En separat bildbaserad förhandsgranskning kontrollerar föreslagen funktion, fysisk orsak och verkan, produktvy och scen före ett betalt Kling-anrop. En beskuren eller osäker produktbild tillåter bara kamera/miljörörelse.
- Den kompletta granskade rörelseriktningen måste rymmas i Kling-prompten. Om den inte ryms används en komplett, passiv riktning i stället för att en granskad handling skickas i förkortad form.
- Granskningen efter Kling använder normalt 17 tidsmärkta bildrutor, med tätare provtagning i början och en bild nära det faktiska slutet. Den jämför originalbilden för produkten och startbilden för miljön. Nya kontrollfält omfattar komponentroller/antal, verifierade funktioner, startförhållanden, orsak och verkan, kontakt/rörelse, anatomi och avslutad slutsekvens. Även produktfria engagement-videor granskas för händelse- och scenfel.
- Ett bekräftat granskningsresultat sparas för exakt Kling-task, källvideo och granskningsversion. Äldre identitetskontroller räcker inte för att hoppa över den nya granskningen. Fel vid hämtning, avkodning eller granskningsanrop återupptar befintligt jobb; de startar inte en ny Kling-generering.
- En underkänd produktfilm kan ersättas med en deterministisk animation av hela originalfotot. Produkten ritas inte om, får inga nya funktioner och zoomar 6 % runt ett fast centrum med en sekunds stilla slut. Därefter används befintligt flöde för reklamtext, logotyp, musik och slutkort. Den underkända AI-filmen levereras inte som video.
- De två Shotstack-jobben för detta alternativ har sparade jobb-ID:n och spärrar för okända inskickningsresultat. Tillfälliga pollfel återupptar samma jobb. Ett okänt inskickningsresultat eller ett definitivt renderfel går till admin i stället för att starta nya betalda jobb.
- Kredithanteringen känner igen att ursprungliga Kling-inlägget redan har avräknats. Animationen använder inga extra kundkrediter. Administratören ser anledningen och tidsmärkta fel; formatet visas som Animerad video. Manuell Kling-omkörning återanvänder inte den underkända produktaktionen.

## Installation och kostnad

Ingen ny SQL-migrering eller nya miljövariabler krävs. Befintliga OpenAI-, Kling-, Shotstack- och lagringsinställningar används. Kling är fortfarande videomodellen. Befintliga admin-, kalender- och leveransfunktioner ingår.

Kontrollerna medför fler analysanrop och fler bildrutor i granskningen. Ett säkrare animationsalternativ medför Shotstack-rendering utöver den ursprungliga Kling-kostnaden. Inget andra Kling-anrop görs automatiskt. Ingen extra debitering av kundkrediter införs. Exakta leverantörskostnader har inte mätts i en skarp körning.

## Verifiering

- `npm run test:v144.337`: produktbevis, rörelseplanering, separat förhandskontroll, samtliga kvalitetsfält, cachning av godkännande/underkännande, produktfria videor, återupptagning av båda renderstegen och kreditavräkning.
- Regressioner: `test-v144-329-kling-prompt-integrity.mjs`, `test-v144-334-kling-creative-protection.mjs`, `test-v144-336-kling-motion-admin-mobile.mjs` och `test-v144-31-kling-finalizer-single-flight.mjs` går igenom. De äldre direktörstesterna har uppdaterats för det nya flödet.
- Chromium avkodade 17 olika JPEG-bildrutor ur en lokal, sex sekunder lång H.264-testfilm. Testskript: `node scripts/test-v144-337-frame-sampler.mjs /absolut/sokvag/fixture.mp4`. Testmiljön använde en explicit lokal Chromium-sökväg; produktionen använder sitt befintliga Chromium-paket.
- Full Next.js-produktionsbyggnad går igenom, inklusive TypeScript, sidinsamling och 66 statiska sidor. Endast tillfälliga byggplatshållare användes för API- och databasinställningar. De ingår inte i ZIP-filen.
- Ingen betald Kling-generering, skarp Shotstack-rendering eller skrivning till produktionsdatabasen har utförts. Ingen driftsättning har gjorts.

Testa efter installation med flera produkter: verifierad rörelse, en produkt med okänd mekanik och en film med ett tydligt orsak/verkan-fel. Kontrollera att endast godkänd Kling-film eller originalbildsanimation når godkännandeflödet, att avbruten rendering återupptar samma ID och att kreditavräkningen bara sker en gång.

## Begränsning

Granskningen är en AI-bedömning av tidsordnade bildprover, inte analys av varje enskild videobild eller en garanti för felfri generativ video. Snabba fel mellan prover kan missas och osäkerhet kan ge ett säkrare alternativ. Den faktiska kreativa kvaliteten och träffsäkerheten behöver fortfarande provas med verkliga produkter i Kling.
