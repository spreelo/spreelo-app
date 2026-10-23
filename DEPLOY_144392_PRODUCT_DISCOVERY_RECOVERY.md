# Spreelo 144.392 – mer träffsäker produktupptäckt och kontrollerad produktrotation

## Varför denna uppdatering?

Köttfabrikens automatiska produktinlägg den 22–23 oktober 2026 slutade med `no_suitable_product`. Store Map hade besökt flera /c/-kategorier men verifierat noll individuella produkter; 32 URL:er i tidigare användningshistorik exkluderades från delar av nyproduktsökningen. Enskilda produktsidor finns på /p/...

## Ändringar

1. **Utnyttja redan hämtad HTML bättre:** koda upp produktlänkar från normala länkar och vanliga JSON-escapeformat (`\\/p\\/`, `\\u002Fp\\u002F`), även när butikens script gömmer länkarna. Inga nya AI-anrop, webbförfrågningar eller större produktpooler behövs för själva extraktionen. Endast direkta produkt-URL:er på butikens domän får komma från den nya extraktionen; den ger *kandidater*, inte godkända produkter.
2. **Slösa inte verifiering på navigation:** kända `/c/`-kategorier och `/b/`-varumärkessidor, utan uttryckligt produktbevis, utesluts innan produktverifieringen. Kategorisidor kan fortsatt användas för navigation och för att upptäcka individuella produktlänkar.
3. **Återanvänd vid verklig utmattning:** när sparad frisk katalog, Store Map, lokal katalog och butikssökning inte lyckats, kan ett vanligt produktbaserat *whole_website*-inlägg välja ur **faktiskt tidigare använda** produktlänkar – före den redan existerande betalda webbsökningen. Kandidater med endast `discovery` men utan användningssignal betraktas inte som tidigare använda.
4. **Högst tre äldre URL:er per körning** undersöks via befintlig sid-/bildverifiering, inom en mjuk 25-sekunders startbudget. Äldsta registrerade användning prioriteras. Tidigare verifierad bild eller lagerstatus är aldrig tillräckligt bevis; aktuell produktsida, säljbarhet, originalbild, marknad och kampanjrelevans måste fortfarande kontrolleras.
5. **Befintliga säkerhetsgränser:** skyddade sajter, HTTP 429, kundvald exakt produkt/kategori, `STRICT_PRODUCT_NO_REUSE=true` och befintliga liveproduktregler behåller sina restriktioner. AI-webbsökningen har samma antal försök och budget som innan och förblir sista utvägen.
6. **Betald research-prompt förtydligad:** använd kategori för navigation och sök efter *nya direkta produkt-URL:er*, t.ex. `/p/`, på rätt officiella domän. Detta är text i den befintliga sökbegäran, inte ett nytt anrop.

## Ändrade filer – exakt fyra

- `app/api/cron/run-automations/route.js` – förbättrade extraktions-, filter-, rotations- och promptsteg
- `lib/productDiscoveryRecovery144392.js` – ren, generisk URL-/historikhantering; gör inga HTTP- eller AI-anrop
- `tests/product-discovery-recovery-144392.test.mjs` – regressionstest
- `DEPLOY_144392_PRODUCT_DISCOVERY_RECOVERY.md` – denna dokumentation

Inget schema, SQL, ny Vercel-variabel eller konfigurationsändring krävs.

## Begränsningar och verifiering i produktion

- Ingen live-automation på Köttfabriken har startats. Isolerad arbetsmiljö kan inte nå butikens webbserver, varför effektiviteten för dess aktuella HTML inte kan bekräftas förrän en kontrollerad produktionskörning är gjord. Testerna återskapar blandad kategorinavigation och riktiga URL-former i syntetisk HTML.
- Ett webbplatsbyte som helt döljer produktdata på klientsidan kan fortfarande kräva befintlig rendered-browsing/AI-reservväg. Vi får inte lova noll fel vid blockerat eller otillgängligt innehåll.
- De tre omkontrollerna gör ett litet antal extra webbsideförfrågningar *endast när de billiga källorna annars har misslyckats*; ofta kan de ersätta den betydligt dyrare AI-webbsökningen. Antalet **AI-webbsökningar** ökas inte; total HTTP-tid kan i värsta fall öka vid fortsatt fel.
- Rotationen startar ny cykel först efter att en äldre produkt har omverifierats och klarat samtliga regler. I administratörsloggarna kan man söka på `Verified older website product reused before paid web research` och `Bounded old-product reuse before paid web search completed`.
- En tidigare misslyckad automatiseringsförekomst blir inte magiskt återstartad av driftsättningen. Kontrollera eventuellt genom ny separat testkörning efter deploy.

## Installation via GitHub Desktop

1. Se till att lokal `main` är synkroniserad med nuvarande 144.391 och att GitHub Desktop visar **0 Changes**.
2. Packa upp patch-ZIP-filen **inuti repositoryts rot** och tillåt överskrivning av exakt `app/api/cron/run-automations/route.js`; de övriga tre filerna är nya. Kopiera **inte** den fullständiga ZIP-filen in i repositoryt.
3. GitHub Desktop ska visa **4 Changes** (en ändrad + tre nya) och inga borttagna filer.
4. Commit Summary: `Spreelo 144.392 - Fix efficient product discovery and safe reuse`; välj `Commit to main` och `Push origin`.
5. När Vercel visar Production Ready: kontrollera först diagnostik/loggar och kör därefter ett enstaka kontrollerat produktinlägg med Köttfabriken. Kontrollera faktisk sparad produktlänk och användning av webbfallback.

## Testkommandon

```bash
node --check app/api/cron/run-automations/route.js
node --check lib/productDiscoveryRecovery144392.js
node tests/product-discovery-recovery-144392.test.mjs
node scripts/test-product-engine-v2.mjs
node scripts/test-store-map-product-agent.mjs
node scripts/test-v144-381-collection-discovery.mjs
node scripts/test-product-discovery-recovery.mjs
node scripts/test-v144-355-collection-recovery.mjs
node scripts/test-candidate-decision-diagnostics.mjs
```

Full `next build` kräver projektets node_modules, verkliga credentials eller fungerande placeholders. Den har inte hävdats körd i detta arbete.
