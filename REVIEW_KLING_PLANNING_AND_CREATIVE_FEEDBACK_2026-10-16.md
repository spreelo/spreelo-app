# Manusavslag → kamerarörelse → kreativ återkoppling, 2026-10-16

Status vid granskningen: lokal rättning ovanpå driftsatt 144.358 (`2fdf29ea1ba9523e62406fc0976cc8be2a13a5c5`). Ingen push, driftsättning, produktionsändring, kundkommunikation eller ny generering hade då genomförts. Användarens precisering 05:20 svensk tid gäller: enbart kreativ kritik ska följa kundens vanliga leveransinställning, utan extra administratörsspärr. Driftsättning godkändes 05:27; se `DEPLOY_144359_CREATIVE_FEEDBACK_ROUTING.md` för omfattningen.

## Belagd felkedja

Post `7e887e31-1d0b-4f29-b289-727a70083264`, Kling-task `939905191372009555`, produkt ”Flabben - Herr - T-shirt”. Tider nedan är UTC.

1. 02:56:16 godkändes öppningsbildens produktidentitet med 0,99.
2. 02:56:18 loggades `storyStatus: unavailable`, `mode: camera_environment`, `camera: digital_push`, `source: safe_cinematic_fallback`. Reservorsaken var `Commercial story proposed unsupported motion`.
3. Kling beställdes trots att det avsedda produktmanuset inte hade godkänts.
4. 02:58:23 sparades källfilmen i Spreelos lagring.
5. 02:58:48 underkändes enbart `commercial_motion_inadequate`, med 0,95 och 17 granskade bildrutor. Mejlets granskning säger uttryckligen att produkt, tryck, anatomi och kontinuitet är korrekta och att den långsamma kamerainzoomningen uppfyller rörelseplanen. Invändningen är otillräckligt engagerande handling.
6. Finaliseraren behandlade denna kreativa invändning som misslyckad finalisering, skickade ett kritiskt felmejl och stoppade före text och slutbild.

Den sparade källfilmen har hämtats från användarens URL och granskats som en bildsekvens. Den är cirka 6,04 sekunder och visar en cafémiljö med samtal och små rörelser. Detta stödjer skillnaden mellan kamerarörelse/små reaktioner och en tydlig produkthandling. Det är inte belägg för ett tekniskt Kling-fel eller för ett nytt text-/slutbildsfel.

Det är **inte belagt vilket enskilt manusfält som underkändes**. I 144.358 använde samma feltext både ett underkänt rörelsekontrakt och saknad/för lång strategy. Det avvisade förslaget och de enskilda villkoren sparades inte. En specifik förklaring som fel action-ID, låg beviskonfidens eller för lång text skulle därför vara en gissning för detta gamla jobb.

## Valda ändringar

### Före en ny betalvideo

- Samma generella rörelsebegränsningar har fått specifika valideringskoder. Avvisat rörelseförslag, evidensens typ/konfidens, tillåtna action-ID:n och klartextförklaringar bevaras i diagnostiken.
- Prompten förtydligar redan befintliga kontraktskrav, bland annat tomt action-ID för scen-/kamerarörelse och låg risk.
- Ett konkret ogiltigt förslag får exakt ett korrigeringsförsök med fel och tidigare förslag. Nätverks-/tjänstfel ger ingen sådan retry. Produkt-, funktions- och vygränser sänks inte.
- Ett fortsatt ogiltigt manus stoppas före öppningsbild och Kling-beställning. En underkänd faktisk bild-/rörelsepreflight får inte heller övergå till en betald reservfilm. Detta ger ett tydligt planeringsärende i stället för att köpa ett resultat som inte följer det önskade manuset.
- `KLING_MOTION_PLAN_REVIEW_REQUIRED` har särskild instruktion: ingen Kling-video är beställd; korrigera de angivna planeringsfelen först. Diagnostik sparas både på posten och i förekomstmetadata.
- Normalflödet behåller två planerings-/kontrollanrop och en öppningsbild. Korrigeringen kan tillföra ett text-/visionanrop vid ett konkret manusfel, men inga extra bild- eller Kling-generationer.

### Efter en redan betald video

- Enbart kreativ kritik går vidare till text och slutbild med samma sparade film. Svag rörelse, säker avvikelse från manus och ofullständigt kreativt avslut är återkoppling. Nya granskningar får `passed: true` och `decision: deliver` när säkerhetskontrollerna är godkända; den kreativa invändningen sparas separat i `creative_feedback`.
- Äldre cachade högkonfidenta avslag med enbart `commercial_motion_inadequate`, `unfinished_closing_action` eller `script_deviation` kan färdigställas utan ny Kling-generering.
- Den färdiga filmen får `ready` / `pending_approval` och följer kundens vanliga leveransinställning: direkt till kund när detta är valt, annars via admin. Den kreativa anteckningen skapar ingen extra administratörsspärr eller kritiskt felmejl. Direktleverans använder det vanliga kundgodkännandeflödet, inte automatisk publicering till sociala medier.
- Admin-test och innehåll som uttryckligen skapats för admin behåller sina vanliga granskningsregler.
- Blandade fel, produkt-/scenskada, låg konfidens och ofullständiga säkerhetsvalideringar får inte denna behandling. Befintlig produktkontroll och säker återställning är kvar. Ett verkligt leveransfel kan fortfarande kräva åtgärd oavsett den kreativa anteckningen.

### Manuell återställning av det tidigare stoppade inlägget

- Administratörens gamla försöksknapp blir ”Slutför sparad video” för kreativa avslag. Den använder samma inlägg och task-ID, utan ny Kling-generering, och följer därefter kundens vanliga granskningsinställning. Slutrenderingen kan medföra Shotstack-kostnad; detta anges i bekräftelsen.
- Servern kräver adminbehörighet och ett uttryckligt `resume_existing`. En gammal klient får inte beställa en ersättningsfilm via försöks-API:t för ett rent kreativt avslag.
- Återställningen kräver sparad källa, exklusivt kreativ invändning och inga separata blockerande design-/försöksstatusar. En jämförelse av uppdateringstid/task/status skyddar mot samtidiga ändringar. Material, audit, render-ID:n och typografiska tillgångar bevaras.
- Ingen sådan återställning har genomförts i produktion. Det gamla inlägget är fortfarande oförändrat tills rättningen har godkänts/driftsatts och administratören uttryckligen väljer att slutföra den sparade videon.

## Verifiering

Nytt test: `node scripts/test-kling-planning-review-regression.mjs`.

Testet täcker den verkliga opening-/Rescue-vägen före betalgränsen, finaliserarens faktiska cron-funktion, den faktiska leveransmodulen och det befintliga admin-API:t med externa tjänster simulerade. Det verifierar ett korrigerat ogiltigt manus, högst två manusförslag, ingen retry vid tjänstfel, ingen bild/bakgrund/Kling-claim vid fortsatt manusfel, bevarad preflightorsak, normal direktleverans av kreativ återkoppling, konfigurerad admin-/testväg, fortsatt stopp för säkerhetsfel, oförändrade källor/ID:n, samtidighetskonflikt, databasfel, adminbehörighet och spärr mot betald kreativ retry.

15 testskript passerade: det nya testet, kling-story-before-frame, render-review-classification, video-failure-reliability, merged-429-video-stability, 144.350 contract-and-motion, 144.337, 144.354, 144.353, 144.347, 144.305 delivery, båda 144.304-skripten, 144.349 production-recovery och 144.356 history policy. Produktionsbygget passerade med ofarliga konfigurationsplatshållare.

Detta verifierar kodflöden och skydd med simulerade leverantörer. Det bevisar inte att en verklig modell alltid skapar ett bra manus eller utför rörelsen. Kreativa invändningar ska inte klassas som ett tekniskt haveri eller framtvinga admin-granskning. Inga nya modeller, SQL-migrationer eller miljövariabler krävs.
