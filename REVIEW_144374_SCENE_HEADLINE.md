# Spreelo 144.374 – endast filmrubrikens formgivning

Lokal arbetsgren: `fix/144374-scene-headline`. Bas: driftsatta 144.373 (`4f3065ce8629bb5630bc8e7662118c309ad0edbb`). Ingen push eller driftsättning utförd.

## Avgränsning

Användaren vill behålla slutbilden, loggan, produktplaceringen, bakgrunden, formuleringarna och filmtextens placering. Ändringen gäller enbart utseendet på den separata rubriken under den rörliga filmen, exempelvis ”Bär hemmaplan”. Ingen justering av loggans överlappning, slutproduktens marginaler, miljöval eller säsongsformuleringar har gjorts.

## Orsak och ändring

Den tidigare renderaren satte korta rubriker på en jämnstor rad oberoende av en föreslagen displayhierarki. Den kunde också ange systemtypsnitt som inte finns i produktionsmiljön och därmed få en annan reservfont.

- En lokal filmrubriksbehandling tolkar agentens befintliga `scene_typography` och `scene_emphasis`. Agenten får en kort, särskilt avgränsad instruktion för filmrubrikens typografi i det redan befintliga planeringsanropet.
- `stacked`, `inline` och `balanced` stöds. En kort tvåordsrubrik kan få två rader med mindre inledning och större huvudord. En angiven betoning hålls samman när den står först eller sist. En uttrycklig enradig behandling respekteras.
- Ord byts inte ut och extra text tillkommer inte. Färgaccenten följer en verklig vald fras, inte automatiskt den rad som råkar hamna sist.
- Lokala latinska filmrubriker använder medvetet de redan medföljande Noto Sans/Noto Serif-familjerna, med vald vikt, form och färgsättning. Övriga skriftspråk behåller sina befintliga fontprofiler och skrivriktningar.
- Den nya behandlingen aktiveras bara för filmrubriken i den gemensamma bildpipelinen. Slutbildens helbild och separat CTA-rendering använder samma kodväg som tidigare. Inga ändringar av huvudtextrutans koordinater, produkt-/ansiktsskydd eller slutbildens bildprompt.
- Inga nya leverantörsanrop, kvalitetsdomare, granskningsspärrar, modeller, SQL-migreringar eller efterbearbetningsförsök har lagts till. Renderaren mäter fortfarande verklig textyta före passning och behåller fullständiga ord och accenter.

## Verifiering

Nytt .374-test renderar verkliga pixlar och kontrollerar hierarki för en kort rubrik, korrekt färgbetoning, olika serif/sans-utfall, enradigt alternativ, sammanhållen betoning, flerspråkiga rubriker och opt-in endast i filmrubrikens produktionsanrop. Slutbildens CTA- och rubrikrendering jämförs byte för byte med och utan filmrubriksflaggan. Bildpipelinen gör fortfarande bara sitt befintliga slutbildsanrop. En renderad före/efter-jämförelse har granskats visuellt.

**18 av 18 relevanta regressionstester godkända. Produktionsbygget godkänt. `git diff --check` godkänt.**

- `test-v144-374-scene-headline.mjs`
- `test-v144-373-creative-production.mjs`
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
- `test-v144-354-creative-delivery.mjs`
- `test-v144-361-adaptive-layout.mjs`
- `test-commercial-design-hierarchy.mjs`
- `test-video-failure-reliability.mjs`
- `test-kling-planning-review-regression.mjs`
- `test-merged-429-video-stability.mjs`

VM-harnesser i äldre tester har fått den nya instruktionskonstanten i sin testkontext. Deras kontroller av produkt, slutbild, färger, köer och felhantering har inte tagits bort.

## Praktisk begränsning

Offline-tester verifierar renderingen och avgränsningen, inte vilket uttryck planeringsmodellen väljer för nästa produkt. Den färdiga rubrikens verkliga utseende bedöms i nästa normala provkörning. Inga betalda provgenereringar, cronanrop eller mejl har utförts.
