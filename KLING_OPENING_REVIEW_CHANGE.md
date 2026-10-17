# Separat startbildsgranskning tas bort

Status: lokal ändring ovanpå de bevarade 144.362-rättningarna. Ingenting har pushats eller driftsatts. Ingen SQL-migrering eller ny miljövariabel behövs.

## Bekräftad felkedja

Testet för post `c552cce8-4ed4-4fb5-912c-df96a54b60e2` skapade en kommersiell startbild för `I Support Ukraine - Herr - T-shirt`. Den separata bildgranskaren rapporterade ändrade ränder och treudd. Den skapade bilden kastades innan uppladdning, så granskarens bedömning kan inte bekräftas visuellt i efterhand. Reservbilden är en annan bild och får inte presenteras som den underkända bilden.

Avvisningen skapade därefter en reservbild och satte manusstatus till `opening_unavailable`. Rörelseplaneringen stoppade denna status med `KLING_MOTION_PLAN_REVIEW_REQUIRED`. Det var därför ingen Kling-video beställdes. Felet gällde inte en redan färdigrenderad films rubriker.

## Ändring enligt användarens beslut

- Hela `reviewKlingOpeningSceneIdentity` och dess anrop tas bort. Kontrollen körs inte heller i rådgivande läge. Detta gäller både normal körning och admin Rescue.
- Startbilden märks som skapad, med `identity_review.status = disabled` och null i stället för påhittad godkännandepoäng. Promptens instruktioner att bevara produkten finns kvar.
- Originalet och den faktiska startbilden laddas upp med befintlig lagring. Deras URL:er och lagringssökvägar sparas tillsammans i postens `video_background_selection.opening_image_comparison` **före** efterföljande rörelseplanering och Kling-beställning. Skrivresultatet bekräftas; lagrings-/databasfel stoppar före videobeställning med instruktion att kontrollera berörd tjänst.
- Fullständig adminvy visar båda bilderna med länkar för jämförelse. En reservbild märks uttryckligen som reservbild. Äldre poster utan sparad jämförelse får inga konstruerade bevisbilder.
- Produktunderlag, manus-/rörelseförutsättningar, slutfilmens produkt-/funktionskontroll, kundens leveransinställning och skyddet mot dubbla beställningar behålls. En verklig bildgenereringstimeout är fortfarande ett fel; den får inte maskeras som en godkänd scen. Kreativa avvikelser fortsätter vara rådgivande enligt tidigare rättning.
- Tidigare språk-, datum-, typografi- och logotypändringar bevaras.

Denna ändring tar bort just det extra stoppet. Den innebär inte att alla andra möjliga leverantörs-, lagrings- eller renderingsfel försvinner. Ett verkligt liveprov återstår efter godkänd driftsättning; lokala tester gör inga betalda modell-/videobeställningar.

## Verifiering

`scripts/test-kling-opening-policy.mjs` kör de faktiska förberedelseblocken för normal körning och Rescue med simulerade tjänster: lyckad förberedelse, efterföljande rörelseavvisning, databasfel och bildgenereringsfel. Båda bilderna ska vara sparade innan senare fel; databasfel ger noll preflight-/videobeställningar; Rescue ger exakt en beställning vid framgång. Befintliga render-ID:n bevaras vid jämförelsesparandet. Den faktiska admin-JSX:en renderas och kontrolleras för två korrekt märkta, länkade bilder.

`test-kling-story-before-frame.mjs` kör den riktiga startbildsfunktionen med en borttagen granskare som skulle kasta fel om den anropades. Endast ett bildanrop görs; manus och faktisk-bild-preflight behålls. Ingen falsk identitetskonfidens sätts.

Övriga godkända regressioner:

- `test-v144-28-direct-scene-translation-loop.mjs` — uppdaterad för det avsiktligt borttagna steget. Ett föråldrat exakt promptcitat ersattes med motsvarande redan befintliga regel om färdig scen från första bildrutan.
- `test-kling-planning-review-regression.mjs`
- `test-v144-337-video-intelligence.mjs`
- `test-v144-338-kling-reference-preview.mjs`
- `test-v144-350-contract-and-motion.mjs`
- `test-v144-354-creative-delivery.mjs`
- `test-video-failure-reliability.mjs`
- `test-merged-429-video-stability.mjs`
- `test-v144-361-adaptive-layout.mjs`
- `test-v144-361-health-alerts.mjs`
- `test-v144-362-ui-regression.mjs`

Next-produktionsbygget med testvärden godkänt. Hela `test-v144-362-ui-browser.mjs` godkänt mot detta samlade bygge: svensk start, hårda sidbyten, sparad och kall cache, hängande översättningstjänst, datumdialogens geometri/fokus/datumval, mobilbredd, språkbyte, timeout och synkronisering mellan flikar. Inga hydrering-/sidfel. Totalt 13 godkända offline-regressionsskript samt webbläsarsviten och produktionsbygget. `git diff --check` godkänt.
