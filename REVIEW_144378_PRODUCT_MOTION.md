# Spreelo 144.378 – produktgrundat rörelseval

Bas: driftsatt 144.377 (GitHub 3178496e9107e4d0284294eb62783b0100f7dfe1, träd ac11afded9da38e1bc51ca5a46d126f6368e53eb).

## Problem och ändring

scene_verified_wear kunde väljas för alla fysiska produkter, trots att den kodgenererade rörelsen beskriver kläders gång och tyg. Den befintliga produktanalysen anger nu motion_material: deformable_garment, rigid_object eller unknown. Detta är en egenskap, ingen lista över varumärken/produkttyper och inget extra modell-/granskningsanrop.

Kläders befintliga manus och rörelse lämnas oförändrade. Om klädläget ändå föreslås för ett fast eller okänt fysiskt föremål anpassas manusets öppning, händelser och rörelse lokalt FÖRE öppningsbilden: behåll individuell miljö, exakt produkt på stabilt underlag, naturlig aktivitet hos en redan etablerad person och försiktig kameraåkning. Rotation, insättning och påhittad passform följer inte med från det felvalda manuset. Det ger ingen ny administrativ spärr, AI-korrigeringsrunda eller betald retry.

Verifierade handlingar som rak transport och rullning behålls. Ett verifierat walk_same_view för en fast produkt får instruktioner om bevarad geometri och kontakt, inte tygrörelse.

Öppningsbilden får tydliga instruktioner att originalprodukten bestämmer geometri, proportioner, delar och vy. Kroppskontakt/passform för andra föremål än kläder får inte uppfinnas från avsedd användning eller en genererad person. De befintliga Kling-låsen mot rotation och nya ytor behålls.

Detta ändrar instruktioner och deterministiskt rörelseval. Det är ingen garanti för felfria bild-/videomodeller; riktiga nya produktkörningar behövs för visuell verifiering. Befintliga filmer/renderjobb beställs inte om.

## Verifiering

15 testskript godkända:
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

Det nya testet kör hela öppningsbild–Kling-promptvägen med simulerade leverantörer och verifierar en planering, en bildgenerering, ingen extra granskning samt fullständig prompt inom 2450 tecken. Fast/okänd produkt och saknad äldre egenskap hanteras utan en ny stoppregel. Samma produktnamn med olika fysiska egenskaper testar att valet inte beror på namnets kategoriord.

Separat jämförelse med 144.377: kodgenererade klädrörelseinstruktioner är byte-identiska för locked och follow_same_view.

Äldre klädtesters underlag har fått den explicita nya garment-egenskapen; deras beteendeassertioner bevaras. Musiktestet hade samma redan befintliga fel i 144.377 (55 fysiska WAV-filer, 36 i katalogen). Testets filräkning anpassades till beslutet att bevara gamla publika filadresser utan att återaktivera gamla låtar; katalog, migration, admininställningar och raderingsmarkörer testas fortsatt. Ingen musikproduktionskod ändrades.

Next.js produktionsbygge godkänt med offline-testvärden. Syntaxkontroller och git diff --check godkända. Inga betalda testgenereringar, live-cron eller meddelanden startade. Ingen SQL krävs. Ingen push eller driftsättning gjord för 144.378.
