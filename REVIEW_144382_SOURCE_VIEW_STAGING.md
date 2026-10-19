# 144.382 – originalets produktvinkel styr scenen

Status: lokal, inte pushad eller driftsatt. Bas: 144.381 (7c76686e81f492a666b338cd128b8fd7b2e50f58).

## Avgränsning

Användaren godkände endast punkt 1: minska risken att video visar produktens obelagda baksida eller hittar på märkningar. Punkt 2 lämnas orörd: rubriker, budskapet ”Tre sporter. En hjälm.”, slutbild, CTA och textdesign har inte ändrats. Inte heller produktupptäckt, kategori-/hyllval, kö, databas, krediter, musik, logga eller leverans har ändrats.

## Ändring

- För formfasta produkter och okänt material börjar den befintliga manusplaneringen nu med originalbildens synliga sidor och kamerahöjd. Personens placering, kroppsställning, kontakt, handling och rekvisita ska anpassas till denna vy.
- Samma instruktion följer med i den befintliga öppningsbildens bildprompt. Ett önskat användningssätt är inte bevis för en ny produktvinkel. En bakåtvänd person får inte användas om produkten bara är belagd framifrån/sidan. En obelagd yta får varken fyllas med påhittade märkningar eller göras om till en påhittad tom yta.
- Om en tänkt handling inte bevarar belagd vy och passform ska scenen i själva skapandet välja en annan pose/handling eller en stödd produktpresentation med meningsfull aktivitet bredvid. Detta är en skaparinstruktion, inte en ny validering eller automatisk granskningsrunda.
- Kling-promptens befintliga produktlås anger nu för dessa objekt att originalbilden definierar produktidentitet/vy, medan den genererade öppningsbilden definierar scenen. Produktvinkeln ska behållas även när produkten bärs. Därmed ger en genererad öppningsbild inte instruktionell auktoritet åt en påhittad produktvy.
- Naturlig aktivitet ska behållas utan att vrida den berörda produkten. Ingen generisk frysning av hela scenen har införts.
- För identifierade flexibla klädesplagg är både öppningsbildens geometriinstruktion och Klings fasta produktlås byte för byte identiska med 144.381. Klädernas befintliga rörelseplanering är kvar.

Två produktionsfiler ändras: lib/klingVideoIntelligence.js och app/api/cron/run-automations/route.js. Inga schemas, modellval, anropsantal, stoppregler, bildgranskningar eller retrygränser ändras.

## Verifiering

Tio testskript passerar:

- test-v144-382-source-view-staging.mjs
- test-v144-378-product-motion.mjs
- test-v144-379-instruction-recovery.mjs
- test-kling-story-before-frame.mjs
- test-kling-planning-review-regression.mjs
- test-v144-370-story-length.mjs
- test-v144-366-kling-direct-execution.mjs
- test-v144-381-collection-discovery.mjs
- test-video-failure-reliability.mjs
- test-v144-373-creative-production.mjs

Det nya testet kör de riktiga route-funktionerna för manus → öppningsbild → Kling-prompt med kontrollerade AI-svar för olika namn/material. Det verifierar att båda skaparanropen får instruktionen, att ingen extra granskare/retry begärs, att öppningsgranskningen förblir avstängd, att hela Kling-prompten inklusive befintliga produktlås håller sig inom 2450 tecken och att klädesinstruktionerna matchar en snapshot från 144.381.

Övriga tester kontrollerar bland annat tidigare automatiska instruktionsreparationer, plaggens naturliga gång, source-verified rörelse, rapporterade 169/164-teckensmanus, beställningsanspråk, provider-/databasfel och den nyligen rättade produktupptäckten.

Produktionsbygge lyckas med offline-nyckelplatshållare. Syntax- och diffkontroller passerar. Inga riktiga betalda AI-/bild-/videoanrop, cron-körningar, mejl eller databasskrivningar har gjorts. Ingen SQL-migrering behövs.

## Begränsning

Detta är en förbättring av skaparinstruktionerna, inte en teknisk garanti för bildmodellens eller Klings visuella följsamhet. Skärmbilderna visar inte om den felaktiga hjälmbaksidan uppstod redan i öppningsbilden eller under videon. Ingen ny verklig film har genererats för denna uppdatering; visuellt utfall behöver utvärderas i en provkörning efter separat godkänd driftsättning. Ändringen reparerar inte redan skapade filmer automatiskt.
