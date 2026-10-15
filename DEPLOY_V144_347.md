# Spreelo v144.347 — Creative Director + Production Controller (staging candidate)

**Bas:** Hela `spreelo-144.346-cinematic-verified-motion.zip`. Kod för Kling-rörelse och låsning av produktidentitet är inte ändrad.

## Förändringar

1. **Creative Director före designskapandet.** En gemensam, generell (ej kategoriindelad) AI-brief används av både animationens och den färdiga Kling-filmens existerande scenbaserade AI-planering. Modellen analyserar verifierad produkt, material, rörelse, textyta, budskap, grafiskt uttryck och CTA före GPT-image-begäran. Ingen separat extra betald planeringsmodell införs; GPT-image skapar fortfarande originalgrafiken.
2. **Rätta falska textfel.** `preserveDesign:true` underkänner inte längre GPT-image-typografi baserat på 86 % / 4,5:1-pixelregeln. Den gamla siffran sparas som diagnostik; det verkliga beslutet tas av befintlig visuell modellkontroll av sammansatta scener och slutkort samt exakt textavläsning. Inget lokalt enhetligt svart/vitt standardtextlager får ersätta GPT-image-grafik.
3. **Begränsad designförbättring.** Animation har högst två bildanrop med konkret felåterkoppling. Kling får också högst två GPT-image-anrop, men bara när det första anropet har ett *känt* resultat som underkänts för ett åtgärdbart visuellt eller textmässigt fel. Inga nya betalda Kling-videor skickas. Okänt anropsresultat, misslyckad API-verifiering eller osäker debiteringsstatus leder till granskning, inte automatisk ombeställning.
4. **Beständig finaliseringskontroll.** `video_background_selection.finalization_control` (befintlig JSON-kolumn) sparar fel, försök, nästa återförsökstid och slutstatus. Vid tillfälligt fel högst tre totala finaliseringsförsök (första + två tekniska återförsök) med minst 5 respektive 10 minuters väntetid. Designfel och oklara leverantörsresultat går direkt till `needs_repair` / `failed`. Tidigare fastnade `text_overlay_status=failed` trots 5-minutersspärren; den genvägen är nu borttagen. En gammal fastnad post med avslutat textfel ska bli ett granskningsärende efter driftsättning.
5. **Render-idempotens.** Ett 'submitting'-checkpoint sparas före varje betald Shotstack-order. En avbruten/okänd submission återbeställs inte. Finns ett sparat render-ID fortsätter systemet med samma render.
6. **Bevara material och tydlig felklassning.** Den ursprungliga Kling-filmen sparas för återupptagning, en färdig video uppges inte felaktigt som misslyckad hos Kling när bara efterbearbetning fallerar. Underkänd animationsatlas sparas i Storage som granskningsunderlag när den finns och Storage fungerar. Ett textdesignfel i animation rapporteras som `animated_advertising_design_needs_review` i stället för generellt `unexpected_creation_error`.
7. **Oändliga omgenereringar stoppas.** Modellen får inte starta fler provider-videor för att reparera text. Autogenerering och tekniska återförsök har olika, begränsade budgetar. Den ursprungliga verifierade produktbilden, produktidentitetsaudit, kameravy- och rörelselåsning från 144.346 är orörda.

## Testad lokalt

- `npm run test:v144.347`: klassificering av fel, beständiga försök, tidsbegränsning, permanent designfel, skydd mot dubbla beställningar och bevarande av GPT-image-grafik vid en konstgjord 0 %-kontrastscen.
- `node scripts/test-v144-342-video-design.mjs`: faktiska funktioner i isolerad mockning inklusive animationens begränsade korrigering och Kling-typografins kända fel följt av en enda riktad designkorrigering.
- `npm run test:v144.345`, `npm run test:v144.346` och Kling-tester 144.329/144.341 godkända under utvecklingen.
- `node --check` av ändrad JavaScript och integritetskontroll av ZIP.

**Ej testat:** Next/Vercel-produktionsbygge med alla npm-beroenden, verkliga GPT-image-/Kling-/Shotstack-/Supabase-anrop, komplett end-to-end-körning samt faktisk visuell kvalitetsbedömning av nya videor. Stagingtest är obligatoriskt före produktion. Inga kvalitetsgarantier för varje enskilt resultat.

## Driftsättning

1. Installera hela ZIP-projektet i **staging**, med er befintliga Supabase- och leverantörskonfiguration. **Ingen SQL och inga nya miljövariabler krävs.** Produktionskontrollen lagras i befintlig JSON-kolumn.
2. Testa minst en animation och en AI-produktvideo med verklig grafik och granskat slutkort. Verifiera produktens exakta utseende och endast originalbildens visade vyer, stavning, logga, färger, textstorlek och professionell rörelse.
3. Injicera följande fel i staging: (a) underkänd textkontrast/visuell komposition, (b) GPT-image- eller Shotstack-anrop med oklart utfall, (c) transienta Supabase-/renderfel och (d) fler än två tekniska återförsök. Kontrollera att antalet betalda anrop är begränsat och att inga jobb hamnar i cron-loopar.
4. Granska `finalization_control`, `text_overlay_generation_attempts`, sparade Kling-källor och `shotstack_submission_status` i posten. Befintliga låsta jobb från 144.346 kan markeras för manuell reparation; de startar INTE automatiskt ny GPT-image- eller Kling-generering.
5. Först efter godkänt stagingtest: publicera skarpt och följ upp fel, varningar, kostnad, leveranstid och visuell kvalitet med flera typer av produkter.

## Begränsningar och kostnad

- En korrektion av Kling-text kan innebära **ett extra betalt GPT-image-anrop**. Visuella granskningsanrop medför också kostnad; exakt belopp beror på användning.
- Ett teoretiskt komplett fel-fritt flöde kan inte lovas. Osäkra/okända leverantörsanrop blockeras hellre för granskning än upprepas. Detta minskar kostnadsloopar men vissa fel behöver fortfarande manuell insats.
- Kodgranskning och mocktester ger inte bevis för att varje rendering får perfekt design. Kvalitetskravet måste verifieras på verkliga färdigrenderade MP4:or.
- Ändringar i admin-inloggning/säkerhet är avsiktligt utanför versionen.
