# Produktinhämtning – lokalt ändringsförslag efter 144.359

Status inför driftsättning: lokalt implementerat och verifierat; användaren godkände gemensam driftsättning 2026-10-16 kl. 12:57 svensk tid. Se även designkompletteringen i `REVIEW_144360_VIDEO_DESIGN.md`.
Utgångspunkt: `8da6c171550f95263d4ea9050cb631a88030c2b2` (144.359).

## Observerad felkedja

Loggexporten `spreelo-app-log-export-2026-10-16T10-03-31.csv` visar regel
`e65da0ed-c5c2-4f45-a335-1164863c8039`, med produktkälla
`https://pressit.se/collections/t-shirts`.

- Sökningen hittade 63 möjliga länkar; det var inte 63 verifierade produkter.
- En genererad Shopify-katalogadress med `products.json` skickades till HTML-läsaren.
  Ett JSON-svar avvisades därför som oläsbar HTML/XML.
- Direkt verifiering stoppades av domänens cooldown. Exporten innehåller inte
  tillräckligt med underlag för att fastställa den ursprungliga fjärrrespons som utlöste spärren.
- Reservsökningen återfann en produkt, som först därefter föll bort mot användningshistoriken.
- Workern avslutade med `generated: 0`, `skipped: 1`, `errors: 0`.
  Ingen Kling-generering är synlig för detta jobb i exporten.

JSON-felet är bekräftat, men är inte bevisat som ensam orsak till det lilla reservresultatet.
Exporten slutar före den uppskattade återstartstiden. Jobbets faktiska senare utfall är inte verifierat.

## Valda ändringar

1. **JSON läses som JSON.** Genererade `products.json`-adresser använder den befintliga
   JSON-läsaren, inklusive timeout, domänpacing, registrering av HTTP-status och verklig 429.
   Shopify-flödena delar samma normalisering av produktidentitet, bild och lagerbevis.
   Uttryckligt `available: false` kan inte upphävas av en positiv lagersiffra.

2. **Kategorins feed läses först.** En uttryckligt vald Shopify-kategori använder sin egen
   feed före HTML och bredare upptäckt. Räcker färska, låsta feedprodukter till uppgiften
   startas ingen bred sökning. HTML-fallback finns kvar när feeden saknas eller inte räcker.
   Genererade upptäcktsadresser håller sig till vald kategori, och hela butikens produktfeed
   öppnas inte för en uttrycklig kategori. Den slutliga kategorikontrollen behålls.

3. **Använda produkter filtreras före begränsning och dyr verifiering.** Feedläsningen kan
   gå vidare till nästa sida när första sidan bara innehåller använda produkter.
   Användning kontrolleras också efter att AI ersatt en kandidat med en annan produkt.
   Store Maps återstående kandidater får samma historikfilter.
   Ett begränsat katalogurval betraktas inte som bevis för att kategorins sortiment är uttömt;
   den grenen återanvänder därför inte automatiskt en gammal produkt.

4. **Befintlig sparad pool används tidigare.** Poolen laddas före fokuserad/Store Map-upptäckt.
   Den tidiga vägen kräver färsk verifiering, godkänd produktidentitet, produktbild,
   rätt webbplats/marknad, källans tillgänglighetskrav, oanvänd produkt och kategoritillhörighet.
   Högst åtta kandidater provas utan betald AI-reparation. Äldre/ofullständiga poster får
   fortsätta via befintlig upptäckt och verifiering. Ingen ny databas eller migrering införs.

5. **Begränsad reservsökning fortsätter förbi oanvändbara resultat.** För enproduktspåret
   filtreras gamla kandidater före hämtning och reparation. En återfunnen använd produkt
   kan inte avsluta sökningen som lyckad. Högst tre forskningsomgångar och högst två
   exakta reparationsbatcher tillåts för detta spår, med en gemensam deadline på 120 sekunder
   som befintliga steg använder för att begränsa arbetet. En användbar produkt räcker;
   två är önskad kortlista, inte ett nytt leveranskrav. Normala återhämtningar stannar direkt.
   Carousel-spårets separata återanvändningspolicy ändras inte.

6. **Väntan visas och loggas tydligare.** Översikten visar varför produktinhämtningen
   väntar, tidigaste nästa automatiska försök och att användaren inte behöver skapa ett nytt jobb.
   Tiden kommer från `retry_not_before`, inte publiceringsschemat. Grupperade planer visar
   tidigaste väntande jobb; pausade/avslutade planer får ingen falsk återstartsuppmaning.
   Texten använder det befintliga översättningssystemet. Workern loggar även RPC:ns sparade
   jobb-id, status, orsak, domän, retrytid och antal försök.

## Behållet

- Samma occurrence återupptas med befintlig SQL och 429-policy; ingen ny SQL krävs.
- Verklig 429 för aldrig lyckad webbplats följer befintlig Rescue-policy.
  Tidigare fungerande webbplatser behåller eskalerande cooldown.
  Det fokuserade kategorispårets wrapper lämnar nu vidare `domain_cooldown`, så att
  delad domänstatus kan avgöra om ursprunget var verklig 429 eller intern pacing.
- Produkt-/bildidentitet, marknadsgräns och kategoribevis försvagas inte.
- Kling/Shotstack, sparade betalda jobb, textgranskning och kundens ordinarie
  granskningsinställning från 144.357–144.359 behålls.
- Ingen rensning av produktanvändningshistorik, inga nya leverantörer och ingen automatisk
  omstart av redan slutligt misslyckade videor.

## Verifiering

Nytt beteendetest: `node scripts/test-product-discovery-recovery.mjs`.
Det kör de faktiska funktionerna från workern med simulerade externa svar:

- hel första sida med 250 använda produkter, ny produkt på sida två;
- JSON-dispatch och kategori-feed före HTML/bred upptäckt;
- okänd lagerstatus och uttryckligt otillgänglig variant kan inte bli verifierat lager;
- verklig 429 behåller sitt felobjekt;
- gammal sökträff följd av en AI-ersättning som också är använd, följd av ny produkt;
- alla resultat använda: ingen falsk framgång och strikt begränsat antal modellomgångar;
- färsk sparad produkt undviker ny upptäckt, medan gammal/osäker/felbutiks-/felkategoriprodukt
  inte får använda snabbvägen;
- sparad retrytid, grupperade planer, ogiltig tid samt pausade/slutliga/andra felstatusar.

Dessutom passerar 18 befintliga testskript:

`test-v144-355-collection-recovery`, `test-kling-planning-review-regression`,
`test-kling-story-before-frame`, `test-render-review-classification`,
`test-video-failure-reliability`, `test-merged-429-video-stability`,
`test-v144-350-contract-and-motion`, `test-v144-337-video-intelligence`,
`test-v144-354-creative-delivery`, `test-v144-353-design-first-delivery`,
`test-v144-347-creative-production`, `test-v144-305-delivery`,
`test-v144-304-typography-continuation`, `test-v144-304-shotstack-submission`,
`test-v144-349-production-recovery`, `test-v144-356-429-history-policy`,
`test-v144-35-product-discovery-purchasability`, `test-v144-251-shopify-full-catalog`.

PGlite-testet `test-website-429-deferral-sql.mjs` passerar också: samma jobb,
fortsatt aktiv regel, sparad metadata, begränsad väntetid och ingen återstart av terminalt jobb.
Produktionsbygget passerar med testvärden för miljövariabler. `git diff --check` passerar.

Det äldre `test-v144-162-product-research-cost-guard.mjs` fallerar på kontrollen
“Deterministic product-intent queries must use the shared sanitizer” både här och i en separat,
oförändrad checkout av 144.359. Testet och den orelaterade kodvägen har inte skrivits om.

Testerna gör inga betalda AI-anrop, skickar inga kundmejl och använder inte produktionsdatabasen.
De bekräftar kodens beteende med fixtures, inte att Pressit.se just nu är åtkomligt eller att
det rapporterade jobbet har återupptagits i drift. Efter godkänd driftsättning bör nästa
kontroll följa ett befintligt jobb genom produktval → Kling → Shotstack → normal leveransväg.
