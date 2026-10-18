# Spreelo 144.371 – reklamdesign som överlever hela skapandeflödet

Status: färdig lokalt för granskning, inte publicerad eller driftsatt.
Bas: main 7652d0f2f2f6d0e8004bcc26d48bbbc21b4ef555 (144.370).

## Problem och ändringar

Den granskade HELIKOPTER-filmen slutfördes och hade bättre rörelse. Rubriken var däremot svag och lågt placerad, avslutet generiskt, och slutbilden hade en suddig överkant. Inspelningen visar resultatet; den visar inte den sparade AI-planen från just den körningen. Följande kodfel och glapp har kunnat verifieras separat:

| Del | Konkret glapp | Lokal ändring |
| --- | --- | --- |
| Slutrubrikens färgmarkering | Planerarna returnerar `end_card_emphasis`, men bildskapandet fick inte värdet. Den efterföljande lokala kompositorn använder inte detta på en redan färdig GPT Image-master. | Båda arbetarna skickar den valda frasen till den befintliga bildbeställningen. Bildinstruktionen anger frasen och slutbildens egen accentfärg. |
| Text över filmen | Det sista anropet till `adaptVideoTextContrast` hade standardvärdet `preservePalette=false` och ersatte även läsbara färgaccenter med en enda färg. | Båda arbetarna behåller läsbara färger. Befintlig lokal kontrastkorrigering finns kvar när texten faktiskt har dålig kontrast. Ingen extra AI-granskning. |
| Motstridig typografi | Samma fria text styrde både text över dagsljusfilm och text på en annan slutbakgrund. Planeringen instruerades samtidigt att undvika extra fet text. | Separat `scene_typography` och `closing_typography`, plus en semantisk fras för texten över filmen. Vikten väljs efter konceptet. Äldre planer fungerar med sitt gamla typografifält. |
| Färgmarkering i lokal text | Lokalrenderaren kunde bara markera en fras när den motsvarade en hel rad. | Exakta fraser kan markeras även inne i en rad eller över en radbrytning. Orden och läsordningen bevaras; ogiltig äldre markering ignoreras. |
| Textens läge | Planeraren fick nedre gränsen 1536, men placeraren accepterade 1700 på en 1920-pixelsbild. | Placeraren håller hela textrutan ovanför 1536. Kling-planens befintliga storleksintervall accepteras också. Om inget säkert utrymme finns används det befintliga flödet som utelämnar filmrubriken och behåller slutbilden; filmen stoppas inte av en ny kontroll. |
| Format | En komplett 2:3-bild passades in i 9:16 med suddig speglad utfyllnad ovanför och nedanför. | Nya beställningar komponeras uttryckligen för det centrala 9:16-utsnittet i leverantörens befintliga 1024×1536-format. Bakgrundsutfall på 80 pixlar per sida tas bort; inga topp- eller bottenband skapas. Texten planeras inom x=136..888. |
| Underlag | Animationsplaneringen fick inte företagets beskrivning och målgrupp. Videoplaneringen fick inte produktbeskrivningen, och den AI-skapade filmidén låg bland verifierade produktuppgifter. | Företag/målgrupp skickas till animationsplaneringen och målgrupp även till videoplaneringen. Produktbeskrivningen sparas i befintlig JSON-data i båda videoingångarna och följer med till slutplaneringen. Den kreativa filmidén används inte längre som verifierad fakta. |
| Reklamidé | Produktnamn, generiska stilord och filmens tillfälliga miljö kunde fortfarande ersätta ett tydligt avslut. | Samma befintliga planeringsanrop får tydligare uppdrag att skriva en fullständig säljande tanke och välja en motiverad bakgrund. Otydliga motiv får inte automatiskt bli påståenden om stolthet eller tillhörighet. Ingen ny bedömningsmodell eller spärr läggs till. |

## Kompatibilitet och avgränsningar

- Alla ändringar bygger vidare på 144.370. Språkcache, kampanjval och borttaget 160-teckensstopp behålls.
- Befintliga Kling-filmer, källor, köanspråk och Shotstack-render-ID:n ändras inte. En designändring beställer inte en ny Kling-film.
- Samma antal planerings- och bildanrop. Planeringssvarens tokenutrymme höjs något för de separata designfälten; detta är ingen garanti om oförändrad textkostnad.
- Råbilden från bildleverantören sparas oförändrad i den befintliga återanvändningen tillsammans med formatmetadata. Båda arbetarna återanvänder rätt utsnitt under sina befintliga reparationsförsök.
- **Endast nya bilder med uttryckligt formatkontrakt får det nya utsnittet.** Äldre omärkta masters behåller hela sin bild, även oväntad text vid ytterkanterna. Om leverantören returnerar en oväntad bildproportion används också den befintliga bevarandevägen, utan ny beställning eller körningsstopp.
- Den nya formatlösningen förutsätter att bildmodellen följer textmarginalerna i instruktionen. Vi har inte infört en ny OCR- eller marginalgranskning som kan stoppa körningen. Det är en avsiktlig avvägning; modellen kan fortfarande avvika från instruktionen.
- Ingen SQL eller databasändring behövs. Ingen ny kreativ adminspärr och ingen ändring av kundens befintliga leveransväg.
- Inget hårdkodat produkt-, plats-, språk- eller sloganexempel har lagts in i de generella produktionsinstruktionerna.
- Den befintliga lokala filmtexten har fortfarande de medföljande typsnittens begränsningar. GPT Image designar slutbildens kompletta typografi fritt inom sitt befintliga anrop.

## Verifiering

21 relevanta regressionstestskript godkända:

1. `test-v144-371-advertising-handoff.mjs`
2. `test-v144-368-independent-closing.mjs`
3. `test-v144-365-end-card-master.mjs`
4. `test-v144-364-commercial-concept.mjs`
5. `test-v144-363-designed-end-card.mjs`
6. `test-v144-353-design-first-delivery.mjs`
7. `test-commercial-design-hierarchy.mjs`
8. `test-v144-361-adaptive-layout.mjs`
9. `test-v144-350-image-and-review.mjs`
10. `test-v144-354-creative-delivery.mjs`
11. `test-v144-350-contract-and-motion.mjs`
12. `test-v144-312-animation-copy.mjs`
13. `test-v144-369-product-relevant-closing.mjs`
14. `test-v144-370-story-length.mjs`
15. `test-kling-planning-review-regression.mjs`
16. `test-v144-366-kling-direct-execution.mjs`
17. `test-kling-story-before-frame.mjs`
18. `test-kling-opening-policy.mjs`
19. `test-video-failure-reliability.mjs`
20. `test-merged-429-video-stability.mjs`
21. `test-v144-370-language-cache.mjs`

Det nya testet kör båda verkliga planeringsfunktionerna med simulerade API-svar och följer designunderlag, valda fraser, bildbeställning, råbildsåteranvändning, formatbehandling och slutkomposition. Det reproducerar den tidigare enfärgade ommålningen och visar att två läsbara färger nu överlever den verkliga kontrastfunktionen. Dålig kontrast kan fortfarande korrigeras lokalt. Det verifierar också att utrymme enbart i nedersta kontrollzonen inte pressar ned texten eller stoppar filmen.

De oförändrade äldre bildtesterna bekräftar att äldre masters och deras kanttext fortfarande bevaras. Båda arbetarnas nya format- och färgparametrar kontrolleras också.

Produktionsbygget `npm run build` är godkänt med offline-platshållare för API-nycklar och Supabase. Inga betalda AI-anrop, riktiga videobeställningar, live-cronjobb, mejlutskick eller databasändringar har gjorts för verifieringen.

Visuell lokal kontroll: rasteriserade typografitestbilder visar den valda färgfrasen även inne i en rad. En fotograferad bildruta från den bifogade videon användes dessutom som tekniskt formatprov: tidigare väg ger suddiga band, den nya vägen fyller hela höjden med faktisk bild. Detta formatprov är inte ett förslag på slutmotiv och bevisar inte en framtida AI-genererad bakgrunds relevans.

## Vad nästa riktiga provkörning behöver visa

Efter godkänd driftsättning: kör en AI-video och en animation och bedöm att slutbildens rubrik uttrycker en sammanhängande säljande idé, att bakgrunden passar den verifierade produkten/företaget, att den valda accentfrasen syns och att slutbilden saknar utfyllnadsband. Kontrollera att filmtexten är prominent där säkert utrymme finns, och att endast den riktiga loggan ligger i sitt hörn. Ignorera Shotstacks testkontovattenstämpel.

Testerna verifierar kodkedjan och återanvändningen. Den kreativa kvaliteten på ett nytt faktiskt AI-resultat måste bedömas i provkörningen; någon garanti om ett perfekt reklamuttryck i varje generering ges inte.
