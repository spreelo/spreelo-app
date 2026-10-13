# Spreelo 144.338 – referenser och spelbar Kling-källvideo i admin

Bas: den kompletta versionen 144.337. Ingen ny SQL-migrering eller nya API-nycklar behövs.

## Bekräftat kodfel

Version 144.337 använder `kling_reference_image_url` eller `image_url` som startbild för videogranskningen. Databasfrågan i finalizern hämtade inget av dessa fält. En riktig startbild kunde därför finnas sparad samtidigt som granskningen rapporterade `Kling quality audit reference prerequisites are missing`.

Den nya gemensamma fältlistan hämtar båda startbildsfälten och referensmetadata. Regressionstestet återskapar felet med den gamla fältprojektionen och verifierar den nya.

## Ändringar

- Alla fyra inskickningsvägar – vanlig automation, engagement-koncept, admin Rescue och manuell Kling-omkörning – läser tillbaka de sparade referenserna före provideranropet. Saknas startbild, originalproduktbild eller verifierad vy där dessa krävs, görs ingen betald Kling-beställning. En separat referenssnapshot sparas i befintligt JSON-fält.
- Finalizern använder snapshoten och rätt startbildsfält. Den kan återställa ett strikt same-view-villkor för äldre jobb som har en riktig sparad originalbild men saknar vybeskrivning. Den gör aldrig en genererad scen till originalproduktreferens.
- Färdig Kling-källvideo kopieras till den befintliga videolagringen innan AI-granskningen startar. Den sparas som källvideo i metadata, inte i kundens `video_url`. Detta ger en varaktig adminförhandsvisning även om granskning eller efterbearbetning misslyckas.
- Om providerlänken svarar 403/404/410 hämtas aktuell nedladdningslänk för samma redan betalda task. Ingen ny generation beställs. Ett raderat eller otillgängligt providerresultat kan fortfarande kräva manuell åtgärd; kodfixen kan inte återskapa en förlorad film utan nytt material.
- Admins riktiga JSX-spelare använder slutlig video när den finns, annars den sparade Kling-källvideon. Videon prioriteras framför posterbild och eventuella gamla karusellbilder. Admin får länkar för att öppna klippet och, när slutfilmen finns, se det ursprungliga Kling-resultatet.
- En ofärdig källfilm märks som adminförhandsvisning. Den blir inte klar för kundleverans bara genom att vara spelbar. Admins serverfunktion för kundutskick kräver färdig video för Kling-inlägg.
- Den befintliga lyckade providerstatusen prioriteras framför ett senare lokalt fel. Ett färdigt, cachat providerresultat avbryts inte på grund av generationens sex timmars ålder.
- Äldre misslyckade jobb med sparad källvideo och just det tidigare referensfelet eller felaktig generationstimeout kan återupptas. En bekräftad kvalitetsunderkänning eller faktisk providerunderkänning öppnas inte automatiskt igen.
- Om referenser verkligen saknas trots detta blir inlägget ett tydligt adminärende med namngivna saknade fält. Det går inte in i en oändlig serie slutförandeförsök. Källfilmen behålls för granskning.

## De två befintliga körningarna

Den tillhandahållna loggexporten gäller 12 oktober 2026 kl. 13:15–14:14 UTC, dvs. 15:15–16:14 svensk tid. Den innehåller 60 cron-anrop till finalizern och 14 varningar om referensfelet:

| Inlägg | Kling-task | Varningar i exporten |
|---|---|---:|
| `7ceab768-460d-455c-bdd1-11f863b8ed9d` | `938615951170351131` | 6 |
| `95276a8c-8d2f-44b8-b702-92cec919f340` | `938612211022037002` | 8 |

Det är samma två providerjobb. Just dessa fel uppstår före bildrutornas AI-granskning. Upprepningarna gör databas- och Vercel-anrop; de är inte nya Kling-beställningar eller nya AI-granskningar. Loggexporten är inte en faktura och anger inte fullständig leverantörs- eller driftkostnad.

`spreelo-v144.338-video-links-readonly.sql` är en valfri läsfråga för de två videolänkarna och referensfälten. Den är inte en migration och ändrar inga data. Inga MP4-URL:er fanns i loggexporten. Produktionsåtkomsten nekades, så de faktiska länkarna och databasraderna har inte hämtats eller ändrats från denna miljö.

## Verifiering och installation

- `npm run test:v144.338` verifierar den verkliga fältprojektionen, referenssnapshotens skrivning/läsning, stopp före beställning vid saknade fält/databasfel, återställning av äldre vyvillkor, source-/final-video-val, kopiering av källfilm, uppdatering av utgången providerlänk för samma task och kundleveransspärr.
- Testet kompilerar och renderar den faktiska admin-JSX-komponenten. Källvideospelare och öppna-länk visas även med befintlig posterbild och gamla karusellbilder.
- Version 144.337:s funktionella test, promptintegritet, kreativ säkerhet, mobila adminregressioner och finalizerns lease/cache-test går igenom. Lease/cache-testet har uppdaterats för den extra läsningen vid en utgången nedladdningslänk.
- Full produktionsbyggnad av Next.js, TypeScript och alla 66 statiska sidor går igenom med tillfälliga byggplatshållare. Inga byggplatshållare, installerade beroenden eller byggmappar ingår i ZIP-filen.
- Ingen ny betald Kling-körning eller skarp databasändring har gjorts. Ingen driftsättning har utförts här.

Installera ZIP-filen som tidigare. Efter lyckad driftsättning ska cron återanvända de befintliga källfilmerna och admin visa spelare/länkar. Kontrollera de två aktuella inläggen. Om ett originalunderlag faktiskt saknas visas detta för admin och måste återställas från verifierat originalmaterial; kontrollen kringgås inte.
