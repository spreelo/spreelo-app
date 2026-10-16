# Kling-rendering: stopp i designgranskningen 2026-10-16

Bas: driftsatt 144.357, commit `a76944794c8b2e8ba15b20aa95841c398140eb43`.
Vid granskningen var rättningen endast lokal, utan push, driftsättning eller ändring av produktionsdata. Användaren godkände senare driftsättning 2026-10-16; se `DEPLOY_144358_VIDEO_STORY_REVIEW.md` för omfattningen.

## Belagd felkedja

- Post: `909f5888-d8b8-4de0-9096-eaaae6b761dc`.
- Kling-task: `939891107906453525`.
- Shotstack-render: `a4b21bcb-8d81-4905-bbce-a9cc5d015f6d`.
- Shotstack svarade `done` 02:09:21 UTC. Finaliseraren stoppade jobbet 02:09:30 UTC.
- Mejlet anger att slutbildens CTA ”Upptäck nu” är stor och läsbar men brister i centrering, balans och mellanrum. Granskaren valde ändå `unfinished_end_card`.
- `reviewAdvertisingComposition` behandlar `wrong_alignment` som feedback men `unfinished_end_card` som ett stoppande fel.
- `getKlingFinalVideoSource` omsluter avslaget med `KLING_RENDER_DESIGN_REJECTED`. Produktionskontrollern klassar den som permanent och stoppar efter första försöket. `markKlingPostFailed` markerar inlägget för reparation och skickar ett deduplicerat administratörslarm.
- Nästa cron tar inte automatiskt upp detta misslyckade inlägg. Även vid återinträde blockerar `finalizationJobGate` respektive kontrollen av den tidigare underkända renderingen.

Detta är alltså ett stopp efter rendering, inte belägg för ett nytt Kling-genereringsfel eller HTTP 429. Loggen med produktinsamling från 01:56–02:00 UTC visar inte orsaken till detta senare stopp.

## Vald rättning

1. Granskaren måste lämna ett separat strukturerat fynd om slutbilden. Centrering/mellanrum får kategorin `alignment_or_spacing_only`; saknat, avklippt, överlappande eller synligt skadat innehåll får egna kategorier.
2. Om en ny granskning uttryckligen säger att enda felet är centrering/mellanrum normaliseras ett motsägande `unfinished_end_card` till `wrong_alignment`. Ursprunglig kategori och förklaring sparas i feedbacken. Ren textsökning i engelska felmeddelanden används inte för att släppa igenom innehåll.
3. Konkreta innehållsdefekter blockerar även om granskaren samtidigt väljer en mild kategori eller `approved=true`. Produktöverlapp och oavsiktlig grafik förblir blockerande.
4. Den strukturerade orsaken, render-ID och render-URL sparas vid Kling-avslag. Ett misslyckat databassteg rapporteras tillsammans med det ursprungliga avslaget.
5. Diagnostik, administratörsvy och mejl ger en riktad instruktion: granska sparad slutbild; återgranska samma render-ID vid klassificeringsfel; reparera verklig layout med befintlig Kling-källa. Starta inte Regenerate för detta fel.

Ingen ändring av modeller, Kling-källa, typografins utformning, 429-policy, renderbeställning eller automatisk publicering. Ingen extra AI-granskning per normal körning. Inga nya miljövariabler eller SQL-migrationer krävs.

## Begränsning och återställning av det befintliga inlägget

Vi har mejlets granskningsorsak men inte själva MP4-filen eller slutbilden. Därför är det ännu inte verifierat om layoutanmärkningen är befogad eller en felaktig visuell bedömning. Den lokala ändringen förhindrar att en uttrycklig anmärkning om enbart centrering klassas som innehållsskada; den bevisar inte att den faktiska bilden är korrekt.

Tidigare stoppade poster låses inte upp utifrån gamla fritextmeddelanden. För just detta inlägg behöver den sparade Shotstack-renderingen hämtas och kontrolleras innan en kontrollerad återgång till finalisering kan genomföras. Behåll befintligt task-ID, render-ID, godkända bildlager och Kling-källa. En ny Kling-generering behövs inte för att granska eller rätta en slutbild. Någon produktionsåterställning har inte körts.

## Verifiering

`node scripts/test-render-review-classification.mjs` använder riktiga bildbuffertar, simulerade granskningssvar och den faktiska renderfinaliseringsfunktionen med externa tjänster ersatta. Den verifierar den rapporterade typen av avslag, konkreta skador, motsägande godkännanden, fortsatt spärr för gamla tvetydiga avslag, samma render-ID, bevarad källa, databasfel samt diagnostik och mejlinnehåll. Inga betaljobb, mejl eller produktionsanrop görs av testerna.

14 testskript har passerat: det nya regressionstestet; video-failure-reliability; merged-429-video-stability; 144.354; 144.353; 144.350 image-and-review; 144.351; 144.349 alerts; 144.347; 144.352; båda 144.304-skripten; 144.349 production-recovery; 144.356.

Det äldre 144.348-testet fallerar på ett antagande om tre bildanrop (`1 !== 3`). Samma fel är reproducerat i orörd 144.355. Testet speglar inte den senare pipelinen med en bakgrund och exakt vektortext. Ingen ändring av det gamla testet görs i denna rättning.

Produktionsbygget med ofarliga konfigurationsplatshållare har passerat. Det kontrollerar byggbarhet, inte anslutning till riktiga leverantörer. Verklig AI-vision och det aktuella produktionsmaterialet är inte testade här.
