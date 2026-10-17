# Spreelo 144.364 — en reklamidé genom text och slutbild

Bas: driftsatta 144.363, `8be6e0ffcaafd8366b62a3da464fdb36a6cd6d50`.
Användaren har uttryckligen godkänt uppdatering och driftsättning utan fler stoppande kontroller.

## Kodkedja och ändring

- De färdiga Kling-bilderna och animationens sammansättningar förbereddes som referensfiler, men bakgrundsanropet i 144.363 använde `images.generate` utan dessa filer. Nu skickar det befintliga bildanropet faktiska referenser via `images.edit` när referenser och metoden finns. Instruktionen skapar en ny separat bakgrund och använder referenserna enbart för färg, material, ljus och uttryck. Ingen videobild återinförs som slutbild. Utan referenser används befintlig textbaserad generering. Ett misslyckat anrop skickas aldrig om via den andra metoden.
- Båda befintliga textplanerarna ger en strukturerad `creative_concept`: verifierat produktunderlag, kundmotivation, reklamidé, observerad scen, konkret bakgrundsbrief och typografibeslut. Den används av de båda rubrikerna, uppmaningen, bildprompten och textsättningen. Ingen ytterligare planerare eller granskare tillkommer.
- Kling-planeraren matas inte längre med katalogrubriken som ett kreativt förstahandsförslag. Verifierad produktidentitet och det befintliga scenmanuset ger ytterligare faktaunderlag. Befintlig reservlogik finns kvar vid tjänstefel; ingen ny avvisningsregel läggs till.
- Animationens textplanering sker efter sammansättning av verkliga bakgrundsrutor och produkt. Planeraren får upp till tre faktiska sammansättningar, inom samma befintliga anrop.
- Den tidigare kapningen av hela Kling-designriktningen vid 600 tecken är borttagen. Konceptet lagras separat och designbesluten överförs tillsammans. Svarsutrymmet ökas inom befintliga anrop så att de extra planeringsfälten ryms.
- Typografins valda färger och karaktär hålls isär från bakgrundens färg- och formbeskrivning; ordet “bold” om en bakgrundsform ska exempelvis inte byta en vald serif-stil mot fet sans-serif.
- Den verifierade domänen separeras från uppmaningen vid textsättning. Det är en lokal presentationsåtgärd, utan avvisning, AI-bedömning eller extra anrop. URL-only-fallet behåller adressen en gång. Även direkta anrop till slutbildskompositorn får samma beteende.
- Motstridiga äldre instruktioner om katalograd och extra avsändare ersätts med den beslutade hierarkin och en hörnlogga. Stor rubrik, separat bakgrund, två sekunders slutbild och exakt lokal textsättning behålls.
- Koncept, referensläge och referensantal sparas i befintlig JSON-metadata. Kling-loggen visar även den faktiskt planerade uppmaningen och slutrubriken.

## Leverans och kompatibilitet

Inga nya kvalitetskontroller, adminvillkor, felkoder, granskningsanrop eller försök till video-/bildbeställning har införts. Befintliga filer för visuell granskning, regionkontroll, Shotstack-fortsättning och produktidentitet är oförändrade. Saknade eller äldre konceptfält accepteras. Cachelagda tillgångar och sparade renderjobb fortsätter utan automatisk omgenerering. Språk-/datumfixar, öppningsbildspolicy och historikmedveten 429-hantering behålls.

Ingen SQL-migration och inga nya miljövariabler krävs.

## Verifiering

- `test-v144-364-commercial-concept.mjs` kör båda faktiska planerarna med simulerade AI-svar för kläder, maskin, växt och tjänst på svenska/tyska. Det verifierar överföringen av samma koncept, verkliga referensfiler till bildanropet, ett normalt befintligt planeringsanrop, en bildbeställning, tjänstefel utan omsändning och kompatibilitet med saknade konceptfält. Den faktiska worker-funktionen verifieras fram till planering med produktpixlar i sammansatta bildrutor.
- Faktisk rasterkomposition verifierar att domänen visas en gång och att bakgrundsbeskrivningen inte ändrar vald typografi. Modelltjänsterna är simulerade; detta mäter kodens överföring och rendering, inte en betald modells kreativa kvalitet.
- 17 befintliga regressionsskript: 144.353 design-first, commercial-design-hierarchy, 144.361 adaptive-layout, 144.350 image-and-review, 144.354 creative-delivery, 144.337 video-intelligence, 144.338 reference-preview, video-failure-reliability, merged-429-video-stability, kling-story-before-frame, kling-opening-policy, 144.362 UI, 144.350 contract-and-motion, kling-planning-review-regression, 144.155 cost-metering, 144.312 animation-copy och 144.363 designed-end-card.
- Produktionsbygge med testvärden och `git diff --check`. Inga betalda Kling-/Shotstack-/bildkörningar startas av verifieringen.

Efter driftsättning utvärderas bildmodellens verkliga uttryck med användarens nya provkörning. Befintliga färdiga filmer ändras inte.
