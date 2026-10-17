# Spreelo 144.366 — Kling får utföra det förberedda manuset

Bas: 144.365, `914dd7d8bca5bc193aff2c6e91458f13733088ce`.
Användaren har godkänt att den aktuella manusspärren tas bort och att uppdateringen driftsätts. Ingen ny granskning införs.

## Felkedja

Körning `84526670-de2f-4b18-b99b-eaf469424120` hittade 250 produktkandidater och valde Heja Eslöv-tröjan. `assessKlingReferenceSafety` beräknade en friläggningsflagga från kant-/ytandelar. När flaggan var falsk förbjöd `planKlingCommercialStory` bärar-/hanteringsscener genom `first_frame_handling_not_supported`. Båda manusförslagen avvisades och `assertKlingMotionPlanningReady` kastade `KLING_MOTION_PLAN_REVIEW_REQUIRED`, innan öppningsbild och Kling-beställning. Loggen saknar de faktiska friläggningsmåtten, så vilket delmått som utlöste flaggan är inte fastställt.

Även om den spärren avlägsnades fanns två följdhinder: öppningsbildsprompten förbjöd fortfarande hantering för samma flagga, och en separat AI-granskare kunde sedan stoppa den planerade rörelsen före Kling.

## Ändringar

- Friläggningsflaggan får inte längre avvisa ett bärar-/hanteringsmanus. Planerings- och öppningsbildsinstruktionerna tillåter vanlig produktanpassad användning med korrekt stöd och bevarad synlig produkt. Bildmåtten och flaggan sparas fortsatt som kompositionsmetadata.
- Ett färdigt strukturerat manus går från öppningsbild till Kling-prompt utan det extra anropet `kling_cinematic_preflight_346`. Produktens exakta färg, form, tryck, delar, ursprungliga vy och scenens kontinuitet beskrivs fortfarande i bild-/videoinstruktionerna.
- Ingen fabricerad granskningsapproval sparas. Metadata anger `execution_policy: direct_kling_execution_v366`, `preflight: null` och rörelseversion 366. Loggen anger vald policy.
- Befintliga struktur-/produktkontraktsregler och högst en korrigering av ett felaktigt strukturerat förslag behålls. Exempelvis hanteras fortfarande ogiltigt action-ID, obefintligt kameraval och för lång strategitext som tidigare. Detta är inte en generell avstängning av alla felvägar.
- Äldre scenförst-anrop utan ett förberett manus behåller sitt tidigare beteende. Kontrollen av färdig films produktidentitet, kundens leveransinställningar, sparade render-ID:n och slutbildsuppdateringen 144.365 är oförändrade.
- Ingen automatisk nybeställning av Kling, ny SQL, miljövariabel eller ny blockerande kontroll. Redan avslutade körningar startas inte om av driftsättningen.

## Verifiering

- `test-v144-366-kling-direct-execution.mjs` kör den verkliga gemensamma öppnings-/promptkedjan och den verkliga rescue-funktionen med simulerade leverantörer. Båda rapporterade förslagen reproduceras; det andra accepteras trots falsk friläggningsflagga och når en enda Kling-beställning med intakta produktinstruktioner och sparat task-ID. Även en naturlig gångscen passerar direkt utan extra granskare.
- Samma test verifierar att förbrukat generationstillstånd stoppar dubbelbeställning, leverantörens 429 behåller sin verkliga orsak, bildfel inte blir en videobeställning och ett checkpointfel efter beställning inte köper en ersättningsvideo.
- Befintliga story-/planning-regressioner uppdateras för den uttryckligen ändrade granskningspolicyn. Övriga assertions för felorsaker, leverans, tidigare betald källa och skydd mot dubbelkostnad behålls.
- 20 regressionstestskript samt produktionsbygget körs före driftsättning. De omfattar slutbilder 363–365, animationer, typografi, UI/språk, 429-policy, slutleverans och felhantering.

Verifieringen använder simulerade modellsvar och beställer ingen betald video. Den bekräftar flödet fram till beställning och sparat leverantörs-ID; nästa riktiga körning visar den visuella kvaliteten. Den borttagna granskningen innebär att modellen kan skapa en mindre lyckad scen som tidigare hade stoppats i förväg.
