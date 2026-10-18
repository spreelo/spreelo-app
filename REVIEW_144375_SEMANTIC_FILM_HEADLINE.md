# Spreelo 144.375 – filmrubrikens individuella design

Bas: driftsatta 144.374, `4bcdf061c75807ddfda33d40dbb343db0233bfd3`. Arbetsgren: `fix/144375-semantic-headline`. Lokala ändringar; ingen publicering eller driftsättning utförd.

## Avsikt

Endast utseendet på texten under den rörliga filmen förbättras. Slutbild, produkt, bakgrund, logga, formuleringar, textplacering, rörelseplanering och normal leverans ska behålla sina befintliga flöden.

## Förändring

Agenten väljer nu uttryckligen vilket ord eller vilken fras som är reklamidéns huvudbudskap innan storlek eller färg bestäms. Den beskriver filmrubrikens design som kompakt JSON i det redan befintliga strängfältet `scene_typography`: exakta textrader, dominerande fras, färgbetonad fras, huvud- och stödfont, huvud- och accentfärg, vikt och stödtextens relativa storlek. Ingen ny modell, inget nytt anrop och inget nytt schemafält eller databasfält behövs.

Renderaren läser besluten var för sig. Den dominerande frasen blir stor oavsett om den står först eller sist. Stödtexten kan få ett mindre, lättare och separat valt typsnitt. Färgbetoning behöver inte blandas ihop med storleksbetoning. Sans/serif använder medföljande typsnitt; andra skriftspråk behåller sina fontprofiler. Enradig och jämnstor design stöds fortfarande när det är ett avsiktligt val.

Den tidigare gissningen från kort första rad eller radordning har tagits bort. Saknas en giltig huvudfras används jämnstor text. Äldre fritextplaner fungerar fortfarande. Trasig JSON, ogiltig radindelning eller saknade färger leder till lokal formateringsfallback, inte underkänd video eller nya betalda försök. Godkända ord får inte tappas, bytas eller flyttas om genom radindelningen.

Det nya exemplet i regressionen är ”Landkrabba” som stor, varm accentfärgad serif med ”för en stund” mindre i vit sans. Detta är en testfixture, inte en produkt- eller språkspecifik regel i produktionsinstruktionen.

## Avgränsning och verifiering

Endast `lib/videoSceneHeadline.js` och filmrubrikens opt-in i den gemensamma typografirenderaren ändras i produktion. Slutbildens bildprompt och sammansättning, delade produktfakta, köer, saldohantering, bildgenerering och renderbeställning har inte ändrats. Inga nya kreativa domare eller adminspärrar.

Nytt .375-test kontrollerar verkliga renderade pixlar: huvudfrasen blir faktiskt större även på första raden, har vald accent och har luft till stödtexten. Det kontrollerar motsvarande huvudfras på sista raden, exakta ord, säkra formateringsfall och oförändrade CTA-/slutbildsrubriksrenderingar med filmflaggan. Den renderade serif/sans-kompositionen har granskats visuellt. Befintliga regressioner körs också.

**16 av 16 regressionstester godkända. Produktionsbygget och `git diff --check` godkända.**

- `test-v144-375-semantic-scene-design.mjs`
- `test-v144-374-scene-headline.mjs`
- `test-v144-373-creative-production.mjs`
- `test-v144-372-native-master-and-copy-model.mjs`
- `test-v144-371-advertising-handoff.mjs`
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
- `test-merged-429-video-stability.mjs`

Offline-tester verifierar tolkning och rendering, inte att modellen alltid gör ett lika bra kreativt val som det handplanerade exemplet. Faktiskt modellval och färger behöver bedömas i nästa normala provkörning. Inga betalda AI-prov, livecron-anrop eller mejl har utförts.
