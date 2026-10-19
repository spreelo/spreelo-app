# Spreelo 144.379 – rätta instruktioner och fortsätt

Bas: driftsatt 144.378, GitHub da4bb4def7598b4b3483cdd70c1d2d93cf18970f.

## Beteende

Hanterbara fel i manus/instruktioner korrigeras lokalt före bildskapandet, i stället för en ny AI-korrigeringsrunda och terminalt manusfel. Det inför ingen ny granskare eller extra bild-/videoanrop.

- Klädläge med separat miljörörelse får environment_motion=none. Klädmanus, kameraval och befintliga klädrörelseinstruktioner bevaras när övriga val är giltiga.
- Irrelevant action_id i kläd-/kameraläge töms lokalt.
- Felaktiga kontraktsval, saknade manusfält och upptäckta instruktioner om nya vinklar/produkter ersätts med ett komplett manus som bevarar originalvyn. Fysiskt verifierade kläder får fortsatt naturlig gång. Andra föremål får presentation med oförändrad form och vy.
- Den befintliga textkontrollen bedömer separata bejakande satser. Förbud som Never reveal hidden surfaces och Do not show the back side flaggas inte som instruktioner att göra det förbjudna. Bejakande uppmaningar fortsätter identifieras.
- Om den färdiga körinstruktionen ändå motsäger produktlåsen eller inte ryms inom 2450 tecken återanvänds samma öppningsbild med en kort, kodgenererad kamerarörelse som bevarar källvyn. Det märks som source_preserving_instruction_repair, aldrig som en godkänd AI-granskning. Det får fortsätta utan manusrelaterat terminalfel.
- Originalinstruktion och utförda korrigeringar sparas i planeringsdiagnostiken/loggas för felsökning. Inget felmejl skapas av en lyckad lokal rättning.

Originalbilden är fortfarande auktoritativ för form, delar, tryck och synliga ytor. HARD PRODUCT, COMPONENT ROLE, SURFACE PRINT, LIGHT/EFFECT, FUNCTION och SCENE CONTINUITY-låsen är kvar. Rotation/nya ytor godkänns inte för att få en körning att fortsätta.

Verkliga API-/bild-/databasfel är fortsatt synliga fel. Befintliga spärrar mot dubbel beställning och okänt betalutfall är kvar. Inga gamla körningar startas om automatiskt. Ingen SQL krävs.

## Direkt reproduktion

De två klädplanerna från Inklistrad text(20261019-015209).txt finns exakt i scripts/fixtures/v144379-logged-garment-plans.json.

Båda går genom riktiga funktioner för öppningsbild, kostnadsanspråk, Kling-beställning och sparat task-id med simulerade leverantörer. Per plan: en manusförfrågan, en öppningsbild, ett kostnadsanspråk, en Kling-beställning. environment_motion rättas; strategy bevaras ordagrant. Fullständiga leverantörsprompter ryms inom 2450 tecken och behåller produktlåsen. Inga betalda provfilmer har skapats.

Power-loggen saknar den exakta körinstruktionen. Vi kan därför inte påstå att dess falsklarm är exakt reproducerat. Det reproducerbara felet i textkontrollen testas separat med negerade produktlås, ett syntetiskt klockmanus, samt motsatta bejakande uppmaningar. Slutlig körväg testas också när ett positivt fel eller en alltför lång instruktion når sista steget: rätta och fortsätt med samma bild, utan extra AI-anrop.

65 kombinationer av produktegenskaper och felaktiga manusval verifieras. Förpackningar/avbildningar får inte bli klädbärare. Giltiga instruktioner och förbud passerar oförändrade.

## Verifiering

Next.js produktionsbygge godkänt med offline-testvärden. Syntaxkontroller och git diff --check godkända.

18 testskript passerar:
- test-v144-379-instruction-recovery.mjs
- test-v144-378-product-motion.mjs
- test-kling-story-before-frame.mjs
- test-kling-planning-review-regression.mjs
- test-v144-366-kling-direct-execution.mjs
- test-v144-370-story-length.mjs
- test-v144-350-contract-and-motion.mjs
- test-v144-353-design-first-delivery.mjs
- test-v144-354-creative-delivery.mjs
- test-v144-373-creative-production.mjs
- test-v144-374-scene-headline.mjs
- test-v144-375-semantic-scene-design.mjs
- test-v144-376-suno-music-integration.mjs
- test-v144-377-logo-position.mjs
- test-video-failure-reliability.mjs
- test-merged-429-video-stability.mjs
- test-v144-334-kling-creative-protection.mjs
- test-v144-337-video-intelligence.mjs

Två ytterligare äldre testskript har samma befintliga fel även på oförändrad 144.378; inte räknade som godkända:
- test-v144-329-kling-prompt-integrity.mjs förväntar den gamla strängen frame 0 is authoritative. Nuvarande produktlås har en annan formulering. Felet uppstår före testets äldre förväntningar på promptlängdsstopp.
- test-v144-341-bounded-kling-motion.mjs förväntar att den fristående renderaren tar bort en rå strategitext med orbits/Cut to. Den tidigare implementationen behåller hela strategin. Den riktiga öppnings-/beställningsvägens lokala rättning verifieras i 144.379-testet; de gamla assertionerna har inte försvagats för att få gröna resultat.

Äldre tester som avsiktligt förväntade två AI-manusförsök/terminalfel för hanterbara instruktioner har uppdaterats till den nya beslutade policyn. Testerna av riktiga tjänstefel och kostnads-/beställningsskydd finns kvar. Data-URL-testimporter har bytts till vanlig modulimport eftersom produktplaneraren nu återanvänder textkontrollen genom en relativ import.

## Avgränsning

Detta verifierar kodflöde och de konkreta fallen, inte felfritt beteende hos varje bild-/videomodell för alla produkter. Ingen push, driftsättning, live-cron eller betald testgenerering utförd för 144.379. Faktisk visuell kvalitet kontrolleras i nästa godkända provkörning efter driftsättning.
