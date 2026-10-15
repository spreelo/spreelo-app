# Spreelo 144.348 — Independent AI Advertising Assets (STAGING CANDIDATE)

**Bas:** Komplett 144.347. Ingen ändring av Klings verifierade produktidentitet, rörelseprompt eller videomodell; befintliga finaliseringsspärrar och Shotstack-checkpoints bevaras. Ingen ny SQL eller miljövariabel.

## Varför uppdateringen behövs

Två verkliga produktionsfel 2026-10-15 visade att en gemensam GPT-image-atlas (bakgrund + transparent rubrik + transparent CTA) ofta gav stora opaka paneler i den del som skulle innehålla endast text. En geometrisk avvisning stoppade då även en redan färdig, identitetsgodkänd Kling-film. Separat upptäcktes att ett regelbundet inlägg begränsat till `.../collections/t-shirts` kunde välja en poster från en annan kategori för variations skull.

## Tekniska ändringar

1. **Oberoende bildtillgångar** (`lib/videoAdvertisingAssetPipeline.js`): generera först fullskärmsbakgrund; generera därefter rubrikgrafik och CTA som två oberoende transparenta tillgångar. Ingen atlas behöver skäras upp. Samma AI-plan används för alla tre, för en sammanhängande individuell design. Två textbilder kan köras parallellt och båda slutförs/rapporteras innan steget går vidare.
2. **Säkert matningsfel**: en transparent texttillgång kontrolleras för alpha, kanter och stora sammanhängande opaka block. Om ett **mottaget** GPT-image-resultat har felaktig alpha skapas i stället en exakt-stavad, transparent vektortypografi från samma AI-beslutade designriktning. Detta är en nödreparation av typografi, inte en ny filmgenerering eller ett förutbestämt produktkategoritypsnitt. Vektorgrafiken måste fortfarande klara både textavläsning och kompositionsgranskning.
3. **Stavningsavvikelser**: om visuell textavläsning bekräftar att en bildmodell förvrängt orden återskapas endast rubrik/CTA i exakt typografi, följt av ny granskning. Kan en granskningsmodell inte nås, utlöses inte någon blind AI-omgenerering.
4. **Begränsade återförsök**: animationen får endast en ytterligare riktad generering efter ett **känt** fel i den visuella sammansättningen. Timeout, okända betal-/providerresultat och auditavbrott leder inte till nya billbara bildanrop. Klings tidigare beständiga försöksspärr och bevarande av originalfilm ligger kvar.
5. **Kategoriavgränsning** (`lib/storeMapCollectionScope.js`): en uttryckligen inställd `/collections/{handle}` tillåter endast just den kategorin vid Store Map Discovery. Cross-category variation får inte kringgå kundens val.
6. **Versionsdiagnostik**: `video_design_version` uppdateras till 348 och Kling sparar `advertising_typography_mode` (GPT-image-typografi eller AI-baserad vektoråterställning) och en tydligare provider-etikett.

## Lokalt utförda tester

- `npm run test:v144.348`: verkliga Sharp-bildoperationer, simulering av ogenomskinlig textruta, separata tillgångar, precis textåterställning, granskarfel utan blind omgenerering, fel/timeout utan SDK-återförsök, hård Shopify-kategoriavgränsning.
- `npm run test:v144.347`, `npm run test:v144.346`, `npm run test:v144.341`: passerar; äldre regler för produktidentitet, rörelse och finaliseringsbudget finns kvar.
- `node --check` på alla ändrade JavaScript-filer och ZIP-integritetsprov görs inför leverans.
- **Legacytesterna** från 144.342/144.345 innehåller fortfarande antagandet att videoavslutningen ska komma från **en enda atlas-image request**; det antagandet är avsiktligt föråldrat i 144.348 och ersätts av ett separat test för nya bildvägen. Det är inte samma sak som ett genomfört helt integrationstest.

## Ej verifierat – obligatoriskt innan produktion

Det finns **inga skarpa GPT-image-, Kling-, Shotstack- eller Supabase-anrop i denna miljö**. Fullständig Next/Vercel-byggning och skarpa end-to-end-provfilmer har inte genomförts. Versionen är därför **inte godkänd för kunddrift ännu**. Kör i staging med samma providerinställningar, rättningar på kundkopior och utan verkliga kundkrediter.

**Testmatris:**
- Animation: felande Pressit-typografi i minst 3 produkter och 3 olika färg-/ljusscener, samt faktisk renderad MP4.
- Kling: återanvänd tidigare sparade T-shirt-film för enbart slutgrafik; ändra inte produktreferenserna. Testa annan klar Kling-film med kontrasterande ljus.
- Kontrollera faktisk läsbarhet på mobil, språk/accents, centrerad CTA, logga, frånvaro av opaka textpaneler, oförändrad produktidentitet och rätt produktkategori.
- Provocera timeout och manuell avbrytning efter leverantörsanrop; verifiera att inga okända, nya debiterbara anrop görs och inga cron-loopar uppstår.
- Testa fullständig `npm run build` med installerade paket och deployment-miljö, och godkänn minst 10 olika färdiga filmer per format med manuell visuell kvalitetsbedömning.

## Begränsningar och kostnader

**Högre styckkostnad:** nu upp till tre GPT-image-assetanrop i stället för en gemensam atlas (ytterligare textkorrigeringar vid faktiskt visuellt underkännande kan tillkomma). Produktvideo från Kling beställs inte om för att rätta textgrafik. Ingen produktionskonfiguration har ändrats. Ett externt fel eller alltför svagt kreativt resultat kan fortfarande kräva administrativ granskning, eftersom lägre kvalitetskrav eller en billig generisk film inte är en säker lösning. Ingen absolut leverans- eller kvalitetsgaranti kan ges utan godkända skarpa prov.

**Tidigare misslyckade uppgifter:** status `failed` / `needs_repair` behöver hanteras kontrollerat i admin, inte startas om blint; sparade Kling-källfiler kan användas vid separat återbearbetning när verktyget stöder det.
