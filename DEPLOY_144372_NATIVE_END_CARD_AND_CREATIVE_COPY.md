# Spreelo 144.372 – kreativ reklamplanering och slutbild utan beskärning

Granskningsunderlag före publicering. Bas: 144.371, commit 906604b2f1f67536f0e3fd90abba4e098c228250.

## Varför denna ändring behövs

Den bifogade Fubbick-filmen hade generiska formuleringar om basplagg och kvalitet, en slutbakgrund vars relevans främst var färgen och en slutrubrik som låg för nära högerkanten. Inspelningen visar resultatet, men inte den sparade planen från just den körningen. Vi kan därför inte säkert säga exakt vilket underlag modellen prioriterade då.

Två konkreta kodproblem är däremot verifierade:

1. Kling-filmens reklamplanering använde identitetskontrollens hårdkodade `gpt-4.1-mini`; animationen använde den snabba researchmodellen. Den befintliga inställningen för kvalificerade rubriker användes inte av något av dessa två kreativa planeringssteg.
2. 144.371 beskärde kompletta 2:3-bilder till 9:16 när de var märkta med det nya formatkontraktet. Det antog att bildmodellen alltid respekterade instruktionens textmarginaler. Testet använde en marginalföljande bild och verifierade därför inte det verkliga problemet när modellen avviker.

## Vad 144.372 ändrar

| Del | Nytt beteende | Verifiering |
| --- | --- | --- |
| Reklammodell | Båda flödena använder `editorial_headline`, alltså appens befintliga inställning **Rubriker**. Standardvärdet är GPT-5.6 Sol. Administratörens godkända val följs. | Båda verkliga planeringsfunktionerna körs med simulerade API-svar; arbetarnas faktiska modellkoppling kontrolleras. |
| Modellernas roller | Produkt- och identitetskontroller behåller sin modell och befintliga policy. Den kreativa modellen skriver scenrubrik, slutrubrik, uppmaning och gemensamt koncept i det befintliga anropet. GPT Image formger den kompletta slutbilden med dessa exakta ord. | Testet kontrollerar att identitetsmodellen är oförändrad och att reklamplanen använder sin egen modell och sparar dess namn. |
| Resonemang och budget | GPT-5/6-modeller får `medium` reasoning och 4800 tokens för resonemang plus komplett strukturerat svar. Tidsgränsen är 40 sekunder. Valda modeller utan motsvarande stöd får inte reasoning-parametern. | Begäran kontrolleras för GPT-5.6 Sol, GPT-5.5 och GPT-4.1-mini. Befintlig fallback kvarstår; inga SDK-omförsök läggs till. |
| Budskapsstyrning | Tydligt läsbara motiv får tolkas i sitt vanliga språkliga och kulturella sammanhang. Produktfakta får inte automatiskt tränga undan ett särskiljande budskap. Korta, naturliga rubriker eftersträvas; ingen ny hård längdgräns eller ordlista införs. | Båda planeringsanropen får samma generella instruktion. Testexempel hålls i testerna; produktspecifika slagord byggs inte in i produktionen. |
| Bakgrund och kontrast | Konceptet ska ha en relation till budskapet utöver färg, material eller tillfällig filmmiljö. Accentens ljushet måste ge kontrast mot slutbakgrunden. | Instruktionerna når den befintliga bildbeställningen; tidigare tester för separata scen-/slutinstruktioner och färgbevarande behålls. |
| Äkta 9:16 | GPT Image 2.5 Flare behålls. Nya kompletta slutbilder beställs som **864×1536**, vilket har exakt samma proportioner som 1080×1920 och uppfyller dokumentationens krav på dimensioner delbara med 16. | Den riktiga installerade OpenAI-klienten används mot en lokal `fetch`-simulering; den faktiska HTTP-JSON-begäran innehåller rätt modell och storlek. Både generering och referensbaserad bildredigering täcks. |
| Ingen beskärning av text | Sidobeskärningen från 144.371 är borttagen. Hela färdiga bilden passas in. En korrekt 9:16-bild fyller då hela höjden utan suddiga utfyllnadsband. | Pixeljämförelse från leverantörsbild genom cache, skalning och verklig slutkomposition. Testbilden har medvetet innehåll i samtliga ytterkanter. |
| Äldre och oväntade bildformat | Även en gammal `planned_9_16_v371`-märkning eller en oväntad 2:3-respons bevarar nu hela bilden. Modeller utan dokumenterat stöd för den nya storleken använder sin tidigare storlek och bevarandevägen. | Regressionen återskapar den gamla destruktiva beskärningen och visar att samma kantpixlar nu finns kvar för alla formatmärkningar. |
| Återanvändning | Råbilden och dess metadata behålls i den befintliga återanvändningen under designförsök. Ett cacheträffat resultat gör inget nytt bildanrop. Förlorade svar har fortsatt `maxRetries: 0`. | Faktiska anropsantal kontrolleras för normal körning, cache, äldre modeller och simulerat anslutningsfel. |

## Drift, kostnad och avgränsning

Inga nya AI-steg, OCR-kontroller, kreativa granskningsspärrar eller adminvillkor införs. De befintliga gränserna för antal planeringsförsök och bildanrop behålls. Den starkare textmodellen och dess resonemang kan öka kostnad och väntetid; ett oförändrat antal anrop betyder inte oförändrat pris.

Kling-slutföraren läser de befintliga modellinställningarna i samma begärandelokala modellkontext som automationsarbetaren använder. Autentisering sker först. Tester visar också att modellval inte läcker mellan samtidiga jobb. Faktiskt begärd reklammodell sparas i Kling-planen, även när dess befintliga fallback används, så att en framtida körning går att spåra bättre.

Ingen SQL eller migrering behövs. Befintliga Kling-källor, render-ID:n, köanspråk, leveransvägar och kundens inställning för direktleverans bevaras. Ingen riktig video, bild, cron eller kundkommunikation har beställts/körts som del av verifieringen.

En redan färdig publicerad video ändras inte automatiskt. Om bildmodellen själv ritar avklippta bokstäver i originalbilden kan skalning inte återställa saknade pixlar; denna ändring säkerställer att **Spreelos formatanpassning inte skär bort mer av den färdiga bilden**. En gammal eller oväntad bildproportion kan fortfarande kräva den tidigare utfyllnaden för att hela bilden ska bevaras. Nya korrekta 9:16-resultat behöver ingen utfyllnad.

Detta är en ändring av modellkopplingen och formatkedjan, utöver justerade kreativa instruktioner. Den framtida kreativa kvaliteten kan ändå bara bedömas i faktiska nya genereringar. De simulerade textförslagen i testerna räknas inte som bevis för att modellen alltid skriver bra reklam.

## Verifiering

25 relevanta testskript är godkända:

- `test-v144-372-native-master-and-copy-model.mjs`
- `test-v144-371-advertising-handoff.mjs`
- `test-v144-370-language-cache.mjs`
- `test-v144-370-story-length.mjs`
- `test-v144-369-product-relevant-closing.mjs`
- `test-v144-368-independent-closing.mjs`
- `test-v144-365-end-card-master.mjs`
- `test-v144-364-commercial-concept.mjs`
- `test-v144-363-designed-end-card.mjs`
- `test-v144-353-design-first-delivery.mjs`
- `test-commercial-design-hierarchy.mjs`
- `test-v144-361-adaptive-layout.mjs`
- `test-v144-350-image-and-review.mjs`
- `test-v144-354-creative-delivery.mjs`
- `test-v144-350-contract-and-motion.mjs`
- `test-v144-312-animation-copy.mjs`
- `test-kling-planning-review-regression.mjs`
- `test-v144-366-kling-direct-execution.mjs`
- `test-kling-story-before-frame.mjs`
- `test-kling-opening-policy.mjs`
- `test-video-failure-reliability.mjs`
- `test-merged-429-video-stability.mjs`
- `test-v144-155-complete-generation-cost-metering.mjs`
- `test-v144-327-ai-model-test.mjs`
- `test-v144-330-ai-control-stabilization.mjs`

Tre äldre testfixturer fick de nya modellkontext-/modellväljardependenserna uttryckligen inlagda i sin befintliga VM-miljö. Deras assertions om worker-isolering, produktkomposition och leverans är kvar. Det tidigare 144.371-testets förväntning om beskärning är ersatt med en starkare förväntning om att även en marginalavvikande leverantörsbild måste bevaras i sin helhet.

Två äldre modellkontrolltester behöver TypeScript för sina VM-hjälpare. De kördes med TypeScript 5.9.3 i en tillfällig testmiljö; inga paket, låsfiler eller produktionsberoenden i projektet ändrades.

`npm run build` är godkänt med offline-platshållare för tjänstenycklar. `git diff --check` är godkänt. Tekniska rasterprov har också granskats visuellt: färgade kantmarkörer finns kvar, hela den nya 9:16-bilden fyller slutformatet och äldre bilder skyddas från sidobeskärning. Rasterproven är tekniska testbilder, inte nya AI-genererade designexempel.

## Primärkällor för API-valen, kontrollerade 2026-10-18

- [OpenAI Create image](https://developers.openai.com/api/reference/resources/images/methods/generate?site_locale=en): GPT Image 2.5 Flare stöder egna dimensioner, delbara med 16, inom det dokumenterade proportionintervallet.
- [OpenAI Create image edit](https://developers.openai.com/api/reference/resources/images/methods/edit): samma formatstöd finns för referensbaserad redigering.
- [OpenAI GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol): stöd för bildindata, strukturerade svar, Responses API och medium reasoning.
