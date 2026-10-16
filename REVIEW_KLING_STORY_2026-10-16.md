# Produktmanus före öppningsbild och Kling-rörelse

Status vid granskningen: lokalt förslag ovanpå 144.357 och den lokala rättningen av slutbildens felklassificering. Ingen push, driftsättning eller produktionskörning hade då gjorts. Användaren godkände driftsättning 2026-10-16; se `DEPLOY_144358_VIDEO_STORY_REVIEW.md` för omfattningen.

## Vad underlaget visar

Användarens skärminspelning visar Kling-källan till post `909f5888-d8b8-4de0-9096-eaaae6b761dc`. Inspelningen är cirka 11 sekunder med webbläsarram; den ska inte behandlas som den levererade videofilens exakta längd. Bildsekvensen visar en man i den grå Halloween-tröjan som huvudsakligen står kvar och ändrar blick/hållning. Det syns ingen tydlig promenad eller händelse med ett produktfokuserat avslut. Ben och fötter är beskurna.

Källan saknar Spreelos slutbearbetning. Därför kan inspelningen inte verifiera det senare Shotstack-avslaget om slutbilden och CTA:n. Den diagnosen behandlas separat i `REVIEW_RENDER_REJECTION_2026-10-16.md`.

## Konkreta begränsningar i tidigare kod

1. `generateKlingDirectSceneOpeningFrame` skapade öppningsbilden före manus/rörelsebeslutet. Den innehöll ett allmänt kreativt uppdrag, men inget gemensamt strukturerat manus som sedan återanvändes i rörelseplanen.
2. `planKlingVerifiedMotion` fick därefter bara välja bland rörelser som den redan skapade bilden kunde stödja. `scene_verified_wear` krävde en komplett, naturligt understödd person; en beskuren modebild kunde underkännas i detta steg.
3. Osäker/underkänd plan ersattes med `passiveKlingMotionPlan`: stilla produkt och begränsad digital kamerainzoomning. Det skyddade produktidentiteten men kunde ge ett ointressant resultat.
4. Kling-prefixet låste uttryckligen produktens ”pose”, och klädesinstruktionen sade att plaggets exakta ”outline” skulle bevaras samtidigt som kroppen skulle gå. Formuleringarna kunde tolkas som en fryst kroppsställning.
5. Rörelsegranskningen tillät lugn kamerarörelse och behövde tydligare skilja detta från att den uttryckligen planerade gången eller rullningen faktiskt utfördes.

Körningens sparade `reference_safety.motionPlan`, `rejected_plan_reason` och slutliga `submitted_full_prompt` har inte hämtats från produktionsdatabasen. Det är därför inte belagt att just denna video tog reservvägen. Kodmekanismen och den observerade stillheten är verifierade var för sig; sambandet för detta enskilda jobb återstår att bekräfta.

## Lokal ändring

- Ett produktanpassat manus skapas innan bildgenereringen: koncept, miljö, handlingsbar bildkomposition, observerbar inledning 0–1 s, handling 1–4 s och avslut 4–5 s samt en strukturerad rörelseplan.
- Samma manus lagras i `reference_safety.commercialStory`, styr öppningsbilden och återanvänds av rörelsefinaliseringen. Den centrala produktspecifika handlingen i `strategy`, tillsammans med de fullständiga kodgenererade rörelseinstruktionerna, skickas till Kling. Hela bildmanuset är inte ytterligare fri exekverbar Kling-text.
- En planerad promenad begär en naturligt understödd person med synliga ben/fötter, riktning och rörelseutrymme. Rullning begär verklig hjulkontakt och en fri väg. Detta väljs av AI:n från produktbevisen; inga hårdkodade kategori-/produktscenarier införs.
- Produktidentitet och tryck förblir låsta. Prefixet förtydligar att naturlig gång, blick, huvudrörelse och tygrespons får förekomma inom den godkända handlingen. Nya produktsidor, funktioner, delar och kamerarundåkningar förblir förbjudna.
- Den oberoende säkerhetsgranskningen sker fortfarande mot den faktiskt genererade öppningsbilden. Ett föreslaget manus är inte bevis för att bilden innehåller rätt stöd, person eller utrymme. En beskuren, olämplig öppningsbild får inte automatiskt godkänna gång.
- Granskningen av färdigt material ska jämföra utförd handling med godkänd plan: en blickförändring, svajning eller zoom räknas inte som utförd gång/rullning. Befintliga beslut och gränser är kvar; detta är en tydligare instruktion till samma granskning.
- Ny diagnostik `Kling commercial motion selected` visar valt läge, kamera, manustillstånd och konkret reservorsak.

Normalflödet behåller två planerings-/säkerhetsanrop: första anropet flyttas före bilden och det andra granskar bilden efteråt. Det görs fortfarande en öppningsbild. Textmängden kan påverka tokenkostnaden. Ett otillgängligt manus eller en underkänd direktbild leder inte till nya planeringsloopar, nya bilder eller extra Kling-beställningar. Engagemangsvideornas separata manusflöde ersätts inte.

## Verifiering

`node scripts/test-kling-story-before-frame.mjs` kör de faktiska öppnings- och promptfunktionerna med Sharp-bildbuffertar och simulerade tjänster. Verifierar:

- Ordningen manus → bild → identitetskontroll → oberoende rörelsekontroll.
- Samma produktspecifika berättelse i öppningsprompt och slutlig Kling-riktning; två planerings-/kontrollanrop och en bild.
- Separata manus för en tröja och en barnvagn med källstödd rullning, utan kategoriväxlar i produktionskoden.
- Underkänd rörelse för en faktisk bild som enligt granskningen saknar stöd för gången.
- Fortsatt avvisning av obekräftade handlingar, förpackningsdepiktioner, rotation, flera klipp och hög risk.
- Ingen extra planering efter tjänstefel eller underkänd öppningsbild; reservorsaken bevaras.
- Komplett prompt under 2 450 tecken och bibehållna produkt-/trycklås.

12 relevanta testskript passerade på den kombinerade lokala ändringen: det nya manustestet, render-review-classification, video-failure-reliability, merged-429-video-stability, 144.350 contract-and-motion, 144.337, 144.354, 144.353, 144.347, båda 144.304-skripten och 144.349 production-recovery. Produktionsbygget med ofarliga konfigurationsplatshållare passerade. En separat budgetkontroll av alla fem stödda produktaktionsslag behöll hela riktningen och säkerhetslåsen under teckengränsen.

Testerna verifierar orkestrering och skydd, inte en verklig modellgenererings visuella kvalitet. Någon ny AI-video, faktisk visionbedömning eller ändring av användarens befintliga betalda film har inte gjorts. Nästa praktiska verifiering efter uttryckligt godkänd driftsättning är en administratörstestvideo: manus och öppningsbild ska stödja handlingen, Kling ska utföra den synligt, och slutbild/leverans ska granskas separat. Att ge det gamla, stillastående klippet en ny fysisk handling kräver en ny videogenerering; en text-/slutbildsrättning kan återanvända den sparade källan.
