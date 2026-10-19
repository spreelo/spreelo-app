# 144.381 – lokal rättning av produktupptäckt och kategoritillhörighet

Status: lokalt förberedd, inte pushad eller driftsatt. Bas: 144.380, f8511873f60bb47e673369795c2ef5cb455fab93.

## Verifierad felkedja

- Körning 851bbf23-3d40-4376-ac4b-7e546f696af8 den 19 oktober 2026, 11:36–11:38 svensk tid, använde https://horze.se/collections/ryttare.
- Horzes offentliga endpoint /collections/ryttare/products.json?limit=250 svarade vid kontroll med HTTP 200 och {"products":[]}.
- Den gamla koden satte complete=true när antalet poster var under 250, även vid noll poster. hasValidFeed gav omedelbar retur och HTML-reservvägen användes aldrig.
- Därför uteslöts först 105 och sedan 68 kandidater innan teknisk produktverifiering. Grupperna kan överlappa.
- SQL-exporten innehåller 100 unika sparade länkar: 90 från sitemap och 10 från Horzes sökförslag. Alla hade pending och saknade last_error. Det är inte säkert att exporten är hela kön (SQL-editorns resultatgräns kan vara 100).
- Den faktiska kategorisidan innehåller underkategorier och en Algolia-listning som fylls med JavaScript. Även flera underkategoriers vanliga Shopify-flöden gav tomma products-listor. Tomt standardflöde bevisar därför inte att det saknas relevanta produkter.
- AURORA Black 55–57:s produktsida anger i strukturerad BreadcrumbList: Hem → Ryttare → Ridhjälmar & säkerhetsvästar → Ridhjälmar. ProductGroup.url matchar den exakta varianten. Sidans canonical däremot pekar på produktfamiljens adress utan storlek; endast canonical-jämförelse skulle felaktigt underkänna den.
- Vid separat aktuell kontroll av butikens offentliga produkt-JSON angavs Mareno ridhandskar White 9 och Devon Sport Black 38 Regular Slim som available=true, AURORA Black 55–57 som available=false. Detta är dagens observerade svar, inte bevis på lagerstatus vid den misslyckade körningen.
- Den betalda reservsökningen gav också SVG-fragment, tema-assets och /policies/legal-notice. Den sistnämnda räknades felaktigt som verifierad produkt. Dessa URL-typer filtreras nu innan de kan fylla researchkvoten.

## Behållna krav

- En uttryckligt vald kategori förblir bindande. Fullständiga, icke-tomma kategoriflöden fungerar som tidigare (Pressit).
- Okänd kategoritillhörighet är inte ett produktgodkännande. Kandidaten får undersökas, men måste styrka tillhörigheten innan den accepteras.
- Oförändrad kontroll av aktuell köpbarhet/lager, produktidentitet, korrekt originalbild, marknad och kampanjrelevans.
- Oförändrad videoplanering, kläd-/produktgeometri, typografi, slutbild, musik, logga, Kling-/Shotstack-ID och leveranshantering.
- Inga nya AI-anrop, betalda genereringar, kreativa granskningar, nya adminstopp eller automatiska videobeställningar.

## Lokala ändringar

1. Hela webbplatsen: när regeln uttryckligen anger content_source_scope=whole_website och ingen egen fokus-URL används, utgår produktmotorn från företagets website_url. website_product_source_url från företagsanalysen är inte automatiskt en kundvald kategori. Fokus-URL:er, tjänstflöde och äldre anrop utan uttrycklig scope behåller sin tidigare prioritet.
2. Tomt Shopify-flöde räknas som otillräckligt underlag och utlöser HTML-reservvägen. HTML-kategoribevis hämtas från produktlistningen eller kategorianknutna produktlänkar; menyer, banners, templates och rekommendationsfält räknas inte.
3. Förfilter skiljer bekräftat bortval från okänd tillhörighet. Okända kandidater går vidare utan att felaktigt märkas som verifierade.
4. Vid den befintliga läsningen av produktsidan återanvänds samma HTML för kategoribevis i BreadcrumbList. Exakt canonical eller exakt Product/ProductGroup/Offer-URL måste också stämma. Enbart namnlikhet eller menylänk räcker inte.
5. Även feed- och cachevägar måste styrka okänd kategoritillhörighet. Matchning görs via URL, så kopierade objekt från rankningen inte kan kringgå kravet. För en tidigare låst kandidat utan tillgänglig HTML kan en separat sidläsning behövas; den begränsas av befintlig kandidatbudget och kort cache.
6. Kategorihämtningarna går genom befintlig offentlig URL-validering, anropspacing och historikbaserad 429-policy. Äkta 429 propageras utan att försöka HTML som alternativ. Kort servercache är begränsad till 200 kategoriindex och 500 produktbevis, TTL två minuter. Ingen ny lokal webbläsarlagring.
7. Loggar anger källans ursprung och skiljer väntande kategoribevis från bekräftade kandidater.
8. Reservsökningen släpper inte igenom policyadresser, kodade HTML/SVG-fragment eller tema-assets som produktkandidater. Ingen ny separat sökagent har lagts till.

## Verifiering

Elva testskript passerar på slutlig lokal kod:

- test-v144-381-collection-discovery.mjs
- test-v144-355-collection-recovery.mjs
- test-product-discovery-recovery.mjs
- test-product-engine-v2.mjs
- test-store-map-product-agent.mjs
- test-merged-429-video-stability.mjs
- test-v144-373-creative-production.mjs
- test-v144-379-instruction-recovery.mjs
- test-v144-378-product-motion.mjs
- test-video-failure-reliability.mjs
- test-candidate-decision-diagnostics.mjs

Det nya testet återspelar exportens 100 länkar och Horzes observerade tomma JSON och sidbevis. Förfiltret gör två gemensamma läsningar, inte hundra produktanrop. Alla kandidater blir väntande, inte godkända. AURORA:s kategoritillhörighet bekräftas från produktsidan. Befintlig worker-verifiering körs med kontrollerade svar och visar att en kandidat utan kategoribevis hoppas över och nästa korrekta kandidat undersöks. Vanlig produktläsning återanvänder HTML. Stocktest med riktiga befintliga funktioner visar att out_of_stock, unknown, preorder, backorder och discontinued inte accepteras för vanlig butik.

Produktionsbygge (npm run build) lyckas med offline-nyckelplatshållare. Syntax- och diffkontroller passerar. Efter sista ändringen av en loggräknare kontrolleras dessa igen.

Två äldre testskript faller även på oförändrad 144.380 och har inte ändrats för att dölja det:

- test-polite-product-retrieval.mjs förbjuder allowReuseWhenExhausted:true över hela den stora routen. Dessa befintliga förekomster fanns redan före ändringen.
- test-v144-19-in-stock-first-product-selection.mjs kräver en äldre exakt kodrad för in_stock. Nuvarande kod har sedan tidigare även stöd för aktuell, exakt verifierad köpbarhet för plattformar utan bokstavlig lagertext. Det nya testet kontrollerar beteendet i de verkliga funktionerna i stället.

Inga riktiga AI-/bild-/videoanrop, inga live-cron, inga mejl och inga databasskrivningar har körts. Detta verifierar felhanteringen och urvalsvägarna; det är inte en verifiering av en ny färdig film eller av hela Horzes aktuella sortiment.

## Varifrån kom Ryttare i just denna regel?

SQL-resultatet från användaren bekräftar nu den exakta orsaken:

- content_source_scope = whole_website
- content_source_url = null
- website_url = https://horze.se/
- website_product_source_url = https://horze.se/collections/ryttare

Körningen var alltså inställd på hela webbplatsen utan vald fokus-URL. Den gamla getWebsiteProductSourceUrl prioriterade ändå företagsprofilens produktkälla framför webbplatsen, och kategorifiltret behandlade den adressen som en bindande begränsning. Det var inget uttryckligt kategorival i regeln. Den implementerade rättningen väljer i just detta fall https://horze.se/; regressionstestet använder samma fältkombination. Historiken över vem/vilken analys som ursprungligen skrev profilfältet finns inte i denna SELECT, men det råder ingen osäkerhet om vilket fält som gav körningens kategori.

Följande frivilliga SELECT fastställer den sparade inställningen, utan ändringar:

```sql
select
  r.id,
  r.content_source_scope,
  r.content_source_url,
  b.website_url,
  b.website_product_source_url
from public.automation_rules r
join public.brand_profiles b on b.id = r.brand_profile_id
where r.id = '851bbf23-3d40-4376-ac4b-7e546f696af8';
```

Ingen SQL-migrering behövs för rättningen. Utredningsfrågan ovan är enbart läsning. Den tidigare misslyckade förekomsten återstartas inte av denna lokala ändring; det kräver en separat uttrycklig åtgärd efter godkännande.
