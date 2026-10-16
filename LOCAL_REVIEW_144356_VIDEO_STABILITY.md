# Lokal granskning: 144.356 och stabilisering av video/animation

Datum: 2026-10-16. Bas: spreelo/spreelo-app, main, commit f2dfd8a98499902ef88e364be51d6e3d7c11f087 (144.355).
Status: lokala, ej committade ändringar. Inget pushat, ingen merge och ingen driftsättning.
ZIP SHA-256: fd836c9c3e3f0adbcf9f37bedac6d13794697e5c8f2400559e10968e0f12c1a4

## Jämförelse och val

ZIP-filen jämfördes fil för fil med den oförändrade Git-basen. Alla basens filer finns i ZIP-filen.
Endast sex filer avvek: automationsrutten, ny 429-policy, nytt 429-test, driftsättningsanteckning och två CSV-filer.
Befintliga lokala ändringar säkerhetskopierades innan ZIP-versionens ändringspatch applicerades. Projektträdet ersattes inte.

| Beslut | Ändring | Skäl |
| --- | --- | --- |
| Behåll | Tidigare lokala rättningar av felstatus, providerklassning, workerisolering, felorsaker och bevarad färdig video | De tillför något utöver 144.356 och täcks av de nya regressionstesterna. |
| Ta in | 429-policy och berörda delar av run-automations | Skiljer webbplatsens verkliga HTTP 429 från intern pacing och använder tidigare färdiga inlägg som bevis. |
| Ta in | 15/30/60/120 minuters cooldown, längre Retry-After och återupptagning av samma occurrence | Tidigare fungerande webbplatser får återhämta sig utan den gamla tvåförsöksgränsen. |
| Ta in | Förkontroll av cooldown före nya betalda generationssteg | Undviker nytt arbete när källan redan är känd som otillgänglig. |
| Ta in | Villkorad automatisk frigivning av äldre Rescue för bevisat fungerande källor | Kräver verklig lyckad historik och en aktiv regel som kan göra en ny körning. Gamla terminala körningar startas inte automatiskt om. |
| Skärp | Historiksökning med begränsat resultat | 501 träffar utan hittad framgång betyder okänd historik, inte bevisad avsaknad. Databas- och transportfel behandlas också som okända. |
| Skärp | Krav på färdig video | En färdig posterbild i ett videoutkast räknas inte som lyckad videoleverans. Källdomänen kontrolleras exakt efter sökningen. |
| Skärp | Providerfel och okänd HTTP 429 | Kling, Shotstack, AI-kvotfel och HTTP 429 utan verifierad webbplatskälla får inte aktivera webbplatsens Rescue. |
| Avstå | STRIPE_LOCAL_PRICING_V144_258.csv och STRIPE_LOCAL_PRICING_V144_259.csv | Skillnaderna gäller enbart radslut. Inga priser har ändrats. |
| Avstå | ZIP-versionens anvisning om att deploya hela ZIP-filen | Passar inte denna kombinerade arbetskopia och skulle riskera att skriva över tidigare arbete. |

## Ytterligare felvägar som rättats

- En underkänd Shotstack-granskning kunde kapslas om till SHOTSTACK_RENDER_PENDING. Terminala granskningsfel och render-ID bevaras nu; resurser från betalda jobb raderas inte av felstädningen.
- Admin-finalizern för Shotstack saknade callback för granskning av den färdiga videon. Den använder nu samma granskningsflöde som automationsvägen. En helt utebliven callback kan inte ge automatisk godkännandestatus.
- Ett fel i granskningstjänsten behandlas separat från ett faktiskt observerat bildfel. Befintliga regler för estetisk återkoppling och serviceavbrott har inte gjorts striktare eller svagare.
- Pågående Shotstack-rendering i Kling-finaliseringen räknas som väntan och använder samma render-ID, utan att förbruka de tre tekniska felförsöken. Väntan begränsas till sex timmar.
- Långa pollningsloopar kortas till små fönster. Kling-finalizern börjar inte nya jobb efter sin batchbudget. En hård serverless-kill mitt i ett långsamt delsteg kan fortfarande inte fångas av JavaScript.
- Leveransfel efter att Kling/Shotstack redan sparat en färdig video får inte göra videon till en misslyckad generering.
- Ett återförsök kan inte radera ett pågående eller osäkert Kling-/Shotstack-jobb som om det vore ett tomt utkast. Ett sådant oklart jobb hålls för avstämning med bevarat material.
- Ett accepterat engagement-video-task-ID bevaras i felkedjan om den första databaslagringen misslyckas.
- Om felhanteringen själv fallerar bevaras både det ursprungliga jobbfelet och det sekundära felet i workerincidenten.
- Incidenter sparas även när e-post inte är konfigurerad. E-postanrop har timeout; incidentdubbletter grupperas fortfarande.
- Ett tillfälligt Chromium-initieringsfel låser inte en återanvänd worker till ett permanent avvisat initieringslöfte. Orsaken får en särskild felkod.
- Nedladdning av Kling-video har en tidsgräns.

## Verifiering

Slutresultat: 21 testskript passerar, inklusive två PostgreSQL-tester. Produktionsbygget passerar. Sju äldre testfel reproduceras på oförändrad 144.355; ett riktigt MP4/Chromium-test är miljöblockerat. Inga nya regressioner har hittats i de genomförda kontrollerna.

Produktionsbygget körs med låsta pnpm-beroenden och tydliga byggplatshållare för API-nycklar/URL:er. Det provar kompilering, Sharp 0.34.5, Next-bygg och statiska sidor; det provar inte live-behörigheter.

Nya beteendetester:
- scripts/test-website-429-deferral-sql.mjs (PostgreSQL)
- scripts/test-video-failure-reliability.mjs
- scripts/test-merged-429-video-stability.mjs
- scripts/test-v144-356-429-history-policy.mjs (från ZIP)

De kontrollerar bland annat verklig worker-routing för 429, okänd historik, exakta värdnamn, bevarade task-ID:n, saknad granskning, terminala kvalitetsfel, DB-fel, fördröjd pollning, batchisolering, leveransfel och Chromium-återhämtning. Provideranrop är mockade; inga kundkrediter eller betalda AI-jobb används.

Två äldre continuation-tester har kompletterats med en explicit godkänd granskningsmock. En gammal källkodskontroll har uppdaterats från Shotstack-skydd till det utökade skyddet för både Kling och Shotstack; beteendet testas separat genom att försöka radera ett skyddat jobb.

PostgreSQL-testerna för v144.305 och webbplatsens v141-deferral körs med en isolerad PGlite-testinstallation utanför appens beroenden och provar lås, atomisk debitering, reservationssäkerhet, testundantag och historik utan dubbletter. Testet av v141-RPC:n verifierar dessutom åtta uppskjutningar av samma occurrence, att tvåförsöksgränsen inte finns i SQL, tvåtimmarstaket för en väckning och att terminala körningar inte återstartas. Appens pnpm-låsfil har inte ändrats.

Följande sju äldre tester fallerar även på oförändrad 144.355. Dessa fel har inte döljts genom sänkta förväntningar:
- test-v144-348-reliable-advertising.mjs
- test-v144-346-cinematic-motion.mjs
- test-v144-345-design-guards.mjs
- test-v144-342-video-design.mjs
- test-v144-341-bounded-kling-motion.mjs
- test-v144-314-video-ending-music.mjs
- test-v141-domain-cooldown.mjs

Felbilderna är äldre källkodsmönster/förväntningar respektive saknade beroenden i testernas VM-mockar. Dessa sju befintliga fel är inte bevis för nya regressioner.

Det riktiga MP4/Chromium-testet kan inte slutföras i denna miljö: Chromium misslyckas med chown av /tmp/fonts (EINVAL). Efter extraktionsförsöket stoppar både aktuell kod och oförändrad 144.355 med "Failed to launch the browser process". Det riktiga avkodningstestet är därför blockerat i båda arbetskopiorna. En sexsekunders H.264-fixture skapades lokalt för testet. Detta är inte en verifierad driftorsak hos Spreelo.

## Återstående gränser före live

- En riktig körning med kundens faktiska Supabase-konfiguration och providerbehörigheter är inte genomförd. Inga kunduppgifter eller skarpa nycklar har begärts eller använts.
- Orsaken till de tidigare rapporterade incidenterna är ännu inte knuten till en specifik körningslogg. Rättningarna gäller bevisade kodfel, inte ett påstående om att alla historiska failure har samma orsak.
- 429 Rescue sparas på varumärkesprofilen; cooldown koordineras per domän, som i 144.356. Ingen ny global spärrtabell eller SQL-migration har lagts till.
- Historik över sökgränsen kan behöva en indexerad domänfråga i framtiden. Okänd historik ger cooldown i stället för permanent spärr.
- Sparade providerjobb återanvänds, men alla tidigare AI-delsteg är inte universellt cachade. En återupptagen källresearch kan fortfarande medföra AI-kostnad när cooldown har löpt ut.
- Automatisk frigivning av äldre 429 Rescue kräver att en aktiv regel kan hämtas. Pausade regler och äldre terminala körningar återstartas inte av sig själva.
- Behåll nuvarande liveversion tills ett kontrollerat admintest och uttryckligt godkännande finns. Ingen kundtestkörning eller ny betald videobeställning har startats.
