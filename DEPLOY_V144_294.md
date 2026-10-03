# Spreelo v144.294 – Structured product-image decisions

Installation från v144.293: kopiera filerna från uppdateringszippen till projektroten med samma mappar och ersätt befintliga filer. Deploya sedan igen. Ingen SQL eller nya beroenden krävs.

Bildkontrollen får nu tre obligatoriska booleans i det redan befintliga strict-schema AI-svaret: brand_conflict, model_conflict och variant_conflict. Förklaringen reason påverkar aldrig konfliktbeslutet. Frånvaro, fel datatyp eller otillräcklig confidence stoppar fortfarande kontrollen. Verifierade produktobjekt, konkreta observerade varumärkesskillnader och deterministiska variantkontroller bevaras. Det etablerade undantaget för kompatibla parent/sub-brand-namn får inte överstyra modell-, variant- eller produktkategorifel.

Inga extra AI-anrop, nya modeller eller fler bilder tillkommer. Samma modell, timeout, retry-inställning och max_output_tokens används. Tre booleans och en kort instruktion tillkommer, vilket kan ge en liten tokenökning. Redan slutligt verifierade produktbilder återanvänds utan AI-anrop.

Riktade verifieringar passerar:
- Formuleringen från Pressit-fishing-incidenten och flera alternativa negationer påverkar inte ett strukturerat godkännande.
- Verkliga strukturerade brand/model/variant-konflikter, fel kategori, låg confidence, ogiltiga/missing fält och observerat fel varumärke stoppas.
- Test anropar produktionsfunktionens review-flöde med simulerat AI-svar: en kontroll gör ett befintligt AI-anrop; redan verifierade bilder gör noll; deterministiska konflikter gör noll.
- v144.283 och v143.63 riktade regressioner passerar.
- Next.js produktionsbygge passerar. Inga betalda AI-anrop eller live-postningar gjordes i testerna.

Ett äldre v143.65-test har sedan tidigare föråldrade isolerade presentation-fixtures/assertions och är inte ett godkänt fullständigt testresultat för denna leverans. Dess konflikt-fixtures har uppdaterats till det nya schema-kontraktet; motsvarande brand-family-fall täcks i det nya passerande v144.294-testet.

Kör om testinlägget efter deploy. Tidigare terminalt misslyckade körningar återställs inte automatiskt av denna uppdatering.
