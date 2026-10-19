144.384 är förberedd lokalt på grenen `fix/144384-product-construction`, utifrån 144.383 (`573737011ccbab78749ac6b342f8c22459f2af49`). Ingen push, sammanslagning, driftsättning eller betald AI-generering har gjorts.

Ändringar och skäl:

| Del | Beslut och avsikt |
| --- | --- |
| Produktanalys | Befintligt analysanrop beskriver synlig silhuett, proportioner, delarnas inbördes placering och orientering samt synliga stödpunkter. Observationerna begränsas i storlek och okända detaljer lämnas okända. Inga produktspecifika kategorimallar införs. |
| Manus och startbild | Samma konkreta konstruktionsbeskrivning når befintlig manusplanerare och det faktiska bildredigeringsanropet tillsammans med originalbilden. En display, ett hölje eller ett fäste får inte vridas separat för att passa scenen. |
| Placering kontra konstruktion | Hela produkten får placeras naturligt i startscenen, inklusive lutning i bildplanet, medan delarnas inbördes geometri och enbart originalbildens belagda ytor bevaras. Katalogbildens exakta placering behöver inte kopieras. Under filmen hålls den etablerade produktvinkeln. |
| Naturlig användning | En person behöver inte redan finnas på katalogfotot när synlig konstruktion belägger vanlig passform eller kontakt. Okänd passform eller dolda fästen får fortfarande inte uppfinnas. Befintlig evidensstyrd handlingshantering behålls. |
| Kläder | Befintlig rörelse, drapering och instruktioner behålls. Faktiska manus- och startbildsprompter jämförs mot en sparad referens från 144.383 och är identiska för oförändrat produktunderlag. |
| Kundens godkännandesida | Hårdkodad mörk bakgrund på video/karusell och första kanalmarkeringen ersätts med ljusa bakgrunder. Mediefiler och `object-fit: contain` behålls. |
| Admin: kreditjusteringar | Beloppet får uttrycklig vit text med en avgränsad CSS-regel som överstyr grundstilens globala `strong`-regel. |
| Övrigt | Slutbilder, rubrikdesign, logga, produktupptäckt, köhantering, debitering och återupptagning har inte ändrats. Inga nya granskare, spärrar, AI-anrop, bildlager eller automatiska försök tillkommer. Ingen SQL behövs. |

Verifiering:

- Elva relevanta regressionssviter passerar: 144.384 produktkonstruktion, 144.383, 144.382, 144.379, 144.378, story-before-frame, planning-review-regression, 144.370, 144.366, video-failure-reliability och 144.373.
- Ny integrationstest använder simulerade modellsvar för tre skilda konstruktioner och följer verkliga kodfunktioner från analys via manus och bildanrop till färdig Kling-prompt. Befintligt antal anrop, komplett rörelse inom 2 450 tecken, äldre underlag utan konstruktionsfält och oförändrade klädprompter kontrolleras.
- Webbläsartest passerar vid 390 och 1 458 px: verklig godkännande-HTML, fyra kanalkombinationer, ljusa medieytor, fungerande karusellnavigation och läsbart kreditbelopp genom hela CSS-kaskaden. Skärmbilder har även granskats. Testdata används; inga kundbeslut eller externa API-anrop utförs.
- Produktionsbygget passerar med testvärden för miljövariablerna.
- `git diff --check` passerar.
- Två befintliga testfixturer anpassas: 144.378 kontrollerar nu stöd från synlig konstruktion i stället för krav på fotograferad kroppskontakt; 144.370 använder klädernas faktiska säkerhetsprefix för sin klädtestning.
- Det historiska testet `test-v143-66-approval-page-spreelo-design.mjs` förväntar en gammal färgpalett och fallerar på samma kontroll även på oförändrad 144.383. Det har inte ändrats eller räknats som godkänt.

Kvar att verifiera efter godkänd driftsättning: en ny fullständig körning genom bildskapande och Kling, där originalprodukt, genererad startbild och färdig film jämförs. Kodtesterna visar att rätt underlag och instruktioner når anropen; de bevisar inte att bild- eller videomodellen alltid återger produkten korrekt. Det finns ingen ny visuell kontroll som stoppar körningen.

Reproducerbara kommandon:

```sh
node scripts/test-v144-384-product-construction.mjs
node scripts/test-v144-384-ui-browser.mjs
npm run build
```

Webbläsartestet kan använda `CHROME_EXECUTABLE_PATH` för en lokalt installerad Chromium. I denna miljö extraherades den redan medföljande Chromium lokalt med miljöanpassad fontkonfiguration; produktionsberoenden ändrades inte.
