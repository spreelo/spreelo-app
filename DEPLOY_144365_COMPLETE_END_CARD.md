# Spreelo 144.365 — GPT Image formger hela slutbilden

Bas: driftsatta 144.364, `0b0db79ea46ddda716be4466244904adfde7a61d`.
Fortsättning på användarens godkända slutbildsuppdatering utan extra stoppande kontroller. Användaren har preciserat målet med den godkända fiskekampanjen: ett gemensamt formgivet avslut med produkt-/företagsanpassad miljö, bokstavskaraktär, textstorlek och semantisk färgbetoning.

## Konkreta orsaken till skillnaden

144.364 instruerade uttryckligen bildmodellen att inte rita text. Därefter sattes slutrubrik och uppmaning av en lokal SVG-/fontmotor. Därför kunde bildmodellen inte formge bakgrund och bokstäver som en helhet, såsom i den godkända exempelbilden. Den lokala motorn begränsade den typografiska friheten även när planeringen önskade ett mer individuellt uttryck.

## Ändring

- Både Kling och animation aktiverar ett nytt läge för en **komplett färdig slutbild**. Samma befintliga bildanrop får verkliga bildreferenser, företags-/produktkontext, gemensam reklamidé och exakt slutrubrik, uppmaning och domän. GPT Image formger miljö, bokstäver, färgrelation, hierarki och komposition tillsammans. Föregående bakgrunds-/lagerläge finns kvar för äldre anrop och den befintliga driftreserven.
- Instruktionen låter typsnittskaraktär och uttryck följa den individuella produkten, publiken och företaget. Den tillåter verklig miljöbild, illustration eller grafiskt hantverk utifrån sammanhanget. Inga fiskeslogans, kategori-/fonttabeller eller fasta färgkombinationer läggs i produktionskoden.
- Textplaneringen uppmanas att använda naturlig, säljande formulering i kundens språk. Samma befintliga planeringsanrop används. Exakta godkända ord skickas till bildmodellen; ingen ny separat copy- eller OCR-granskare läggs till.
- Slutbilden passerar kompositorn utan att dess typsnitt, färger eller bokstäver ersätts. Den geometriska omplaceringen av lösa textlager tillämpas inte på en redan sammanhållen bild, eftersom bakgrundsbyte eller omfärgning skulle förstöra texten. Befintlig granskning av den färdiga sammansättningen och filmen behålls.
- Bild-API:ts befintliga 1024×1536-format behålls. Prompten anger en central säker textyta som klarar den kända beskärningen till 1080×1920; bilden fyller hela videoytan. Inga nya pixel-/OCR-avvisningar införs. Att en bildmodell alltid följer denna instruktion verifieras inte av en ny kontroll.
- Båda Shotstack-byggarna visar den färdiga slutbilden som ett enda stillastående 1080×1920-lager i två sekunder, utan en ytterligare textversion eller separat bakgrundszoom. Den autentiska kundloggan ligger kvar en gång på sin befintliga hörnkanal. Bildmodellen instrueras att inte rita loggor eller extra avsändare.
- Cacheflödet håller reda på om bilden är en komplett slutbild eller den äldre textfria bakgrunden. En cachad driftreserv får inte misstolkas som komplett textad bild. Inga extra bild-/videobeställningar görs efter tidsgräns eller oklart leverantörsutfall.
- Metadata sparar `end_card_is_master`, bildläge och den faktiska skickade slutbildsprompten, så att framtida körningar kan spåras. Äldre tillgångar och sparade render-ID:n återanvänds som tidigare.

Inga SQL-migrationer, nya miljövariabler, nya granskningsanrop, nya adminvillkor eller nya stoppande felkoder tillkommer. Befintliga leverans-/produktidentitetsregler är oförändrade. Antalet normala bildbeställningar och kvalitetsinställningen medium behålls. Ändringen gäller nya tillgångar; färdiga filmer skrivs inte om.

## Verifiering

- Nytt `test-v144-365-end-card-master.mjs`: kör det faktiska bildanrops-/kompositörflödet med simulerad leverantör. Verifierar ett bildanrop, faktiska referenser och exakt copy i prompten, bevarande av hela bildens pixlar/färger, inget dubblerat lokalt textlager, ingen ny OCR, båda riktiga Shotstack-byggarnas stillastående slutbild och en hörnlogga genom hela sjusekundersfilmen. Komplett cache, äldre omärkt cache, leverantörstidsgräns och cachad textfri driftreserv ingår. Ingen betald modelltjänst anropas i testet.
- 18 befintliga regressionstester från 144.364: design-first, commercial-design-hierarchy, adaptive-layout, image-and-review, creative-delivery, video-intelligence, reference-preview, failure-reliability, merged-429-video-stability, story-before-frame, opening-policy, UI, contract-and-motion, planning-review, cost-metering, animation-copy, designed-end-card och commercial-concept. Creative-director-versionstestet uppdateras för 365; övriga leveranskrav bevaras.
- Next-produktionsbygge med testvärden, fontspårning och `git diff --check`.

Tester med simulerade bildsvar verifierar överföring och rendering. Den verkliga bildmodellens formgivning, stavning och följsamhet bedöms i nästa nya provkörning; uppdateringen lovar inte identiska bildresultat varje gång. Inga extra kontroller läggs till för denna bedömning.
