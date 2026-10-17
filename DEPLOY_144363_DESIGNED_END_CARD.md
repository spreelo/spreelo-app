# Spreelo 144.363 — separat formgiven slutbild

Bas: driftsatta 144.362, `d3e65e11176248561857b9229e7d9ce7438651cd`. Användaren godkände uppdatering av den generella slutbildsprocessen för nästa provkörning den 17 oktober 2026. Befintliga ändringar har behållits.

## Ändring

- En gemensam, produktoberoende designbrief används av båda befintliga textplanerarna och GPT Image. Palett, materialkänsla, typkaraktär och kundmotivation ska komma från produkt, faktisk scen, kampanj och företagsidentitet. Inga fasta T-shirt-/barnvagnsscenarier, blågula färger eller slogans finns i produktionsreglerna.
- De befintliga planeringsanropen ger en separat kort slutrubrik, en motiverad handlingsuppmaning och valfri exakt betoningsfras. Ingen extra AI-planeringsrunda tillkommer. Vid saknat/ogiltigt nytt fält används redan godkänd rubrik som kompatibel reserv; ingen ny kreativ avvisningsregel införs.
- GPT Image skapar en **ny bakgrund via `images.generate`**, i stället för att redigera produkt-/personfotot. Den får den sceninformerade designbriefen. Anropets bildantal, tidsgräns och `maxRetries: 0` behålls. Befintlig kostnadsspårning hanterar redan både `images.generate` och `images.edit`. Klienter utan generate-metod behåller den äldre edit-kompatibiliteten; ett misslyckat faktiskt generate-anrop skickas aldrig om som edit.
- En ny slutbildskompositor sätter exakta godkända ord från synliga bokstavsgränser: mycket stor rubrik, underordnad CTA och separat läsbar kunddomän. Den lilla katalograden och en andra avsändare/logga utelämnas. Rubrikens målbredd är 930 av 1080 pixlar; höjden begränsas till 580. Texter hålls inom y=480..1480. Storleken ändras inte på nytt av den adaptiva gruppplaceringen.
- Semantiskt vald accentfärg behålls om kontrasten mot de faktiska bakgrundspixlarna är tillräcklig. Annars används befintlig kontrastkorrigering. Exakta ord och proportioner bevaras.
- Riktiga medföljande Noto-fonter för fet sans-serif och vanlig/fet serif säkerställer att vald vikt och typkaraktär finns på servern. Ursprung och SHA-256 finns i `assets/fonts/END_CARD_FONTS.md`; befintlig OFL-licens och fontspårning används.
- En underkänd/okänd bakgrund får en separat formgiven reservbakgrund, aldrig en videobild. GPT-bakgrunder utan identifierade skyddsobjekt behålls. Samplaren använder `object-fit: contain`; dess möjliga inbakade svarta fält ska inte längre hamna i slutbilden genom återanvändning av ett provklipp.
- Slutbildens bakgrund levereras som exakt 1080×1920-lager. Bara bakgrunden får en liten rörelse; texten står still. Kundens ursprungliga logga ligger kvar en gång på sin separata hörnkanal. Nya Kling-slutbilder får två sekunders visning, samma som animationer. Äldre sparade renderingar och tillgångar behåller sin fortsättning utan omgenerering.
- Den visuella granskningen får båda rubrikerna och ska inte kräva att scenrubriken upprepas i slutbilden. Befintliga regler för rådgivande estetisk återkoppling, konkreta integritetsfel, köer, kundflöde, betalning och förhindrande av dubbla beställningar behålls.

Inga SQL-migrationer eller nya miljövariabler krävs. Den borttagna separata startbildsgranskningen, bildjämförelsen i admin samt språk-/datumfixarna från 144.362 finns kvar.

## Verifiering

- `test-v144-363-designed-end-card.mjs`: faktisk rasterkomposition för tre olika sammanhang, två språk och två typkaraktärer; uppmätt textstorlek/centrering, semantisk accent, synlig domän, oförändrade bokstavsfärger när kontrasten räcker, helt fylld bildyta, ingen katalograd, ingen reserv med videobild, ett bildanrop, ingen extra planeringsrunda, tjänsteavbrott, cachade tillgångar och gamla render-ID:n. Båda riktiga Shotstack-byggarna kontrolleras för fullstort bakgrundslager, två sekunders slutbild, stillastående text och en hörnlogga. Modelltjänsterna är simulerade.
- 15 befintliga regressionsskript godkända: 144.353 design-first, commercial-design-hierarchy, 144.361 adaptive-layout, 144.350 image-and-review, 144.354 creative-delivery, 144.337 video-intelligence, 144.338 reference-preview, video-failure-reliability, merged-429-video-stability, kling-story-before-frame, kling-opening-policy, 144.362 UI, 144.350 contract-and-motion, kling-planning-review-regression och 144.155 cost-metering.
- 144.361-testets uttryckliga förväntan om en videobild som reserv har ändrats till den nu beslutade separata bakgrunden. Commercial-design-hierarchy-testets VM får de nya importerade designfunktionerna; dess befintliga tvåförsöks-/avbrotts-/säkerhetskrav behålls.
- Det äldre `test-v143-27-global-product-typography.mjs` faller på ett källkodskrav om `product_label_font_family`. Samma fel är reproducerat i en separat, oförändrad 144.362-arbetskopia. Testet har inte skrivits om för att dölja felet.
- Visuell lokal granskning av faktiskt renderade slutbilder med provbakgrunder. Detta är inte en ny betald GPT Image-/Kling-/Shotstack-körning och inte ett löfte om exakt identiska bildmodellsresultat.
- Next-produktionsbygge med testvärden och `git diff --check` godkänt. Fontfilerna omfattas av befintlig output tracing.

Nästa verifiering är en ny faktisk provkörning efter driftsättning. Befintliga färdiga filmer ändras inte och inga nya filmer beställs av själva uppdateringen.

## Återställning inför publicering

Arbetsmiljön återgick till en äldre lokal kopia före publiceringen. En separat arbetskopia skapades från driftsatta 144.362. De redan uppladdade worker-/finaliseringsfilerna och dokumentationen återställdes med identiska Git-blob-SHA; övriga designmoduler återställdes från ändringsunderlaget och verifierades på nytt med regressionstester, faktisk bildkomposition och produktionsbygge. Ursprunglig arbetskopia har inte skrivits över. Publiceringen godkändes uttryckligen av användaren inklusive typsnitt.
