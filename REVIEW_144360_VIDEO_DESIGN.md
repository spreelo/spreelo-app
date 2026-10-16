# Gemensam lokal uppdatering: produktval och professionell textdesign

Status inför driftsättning: verifierade ändringar ovanpå 144.359. Användaren godkände gemensam driftsättning 2026-10-16 kl. 12:57 svensk tid.
Produktinhämtningens grundändringar beskrivs i `REVIEW_144360_PRODUCT_DISCOVERY.md`.

## Senaste testkörningen

Exporten `spreelo-app-log-export-2026-10-16T10-26-36.csv` visar att regeln
`e65da0ed-c5c2-4f45-a335-1164863c8039` fortsatte kl. 12:12 svensk tid.
250 direkta kategorikandidater hittades. En verifieringsfas hann undersöka noll produkter
innan sin deadline, medan nästa fas godkände alla tolv undersökta kandidater tekniskt.
Två posters sorterades bort först efter dyrare kontroll eftersom de inte tillhörde T-shirt-kategorin.
Produkten Bepansrade Enhörningar valdes. Videon slutfördes och mejl skickades kl. 12:25:40,
med `reviewRequired: false`. Samma Shotstack-render behölls genom väntan.

Den nya kompletteringen filtrerar kategoritillhörighet **före** teknisk produktverifiering
och rankingens begränsning, inklusive reservsökningen. Använda produkter filtreras också
tidigare i enproduktssökningen. Bortval loggas med antal och konkreta medlemskapsorsaker.
Detta försvagar inte den slutliga kontrollen av kundens valda källa.

## Konkreta orsaker till den tidigare textdesignen

- Slutbildens CTA förstoras separat tills dess bokstäver kan konkurrera med huvudrubriken.
- Produktnamnet läggs till som liten rubrik även när samma namn redan är huvudrubriken.
- En ljusblå standardaccent och automatiskt färgad sista rad används utan koppling till produkten.
- Radbrytning utifrån ett litet teckenantal gör vissa kompletta fraser till onödigt många rader.
- Logotypen kan förbli liten på grund av förbud mot förstoring och få svag kontrast mot mörk bakgrund.
- Hörnloggan fortsätter över slutbilden även när slutbilden redan har en egen avsändare.

## Ändrad design

- Gemensam, generell brief för AI-video och animation: en kort meningsfull hook, valfri
  stödtext och en kortare, lugnare uppmaning. Bara verifierade egenskaper får bli faktapåståenden.
  Inga produktkategorimallar eller förbestämda slogans har införts.
- Kling-planeraren får göra **en** textomskrivning när resultatet bara är produktnamnet
  med någon etikett tillagd. Normalfallet är fortfarande ett planeringsanrop. Transportfel,
  timeout och tjänstfel ger inget nytt anrop. Ett andra kataloglikt resultat blir rådgivande
  återkoppling och säker befintlig copy, inte en ny adminspärr.
- Typografin bryts i balanserade hela fraser. Faktiska bokstavsmått används före slutlig
  rasterisering för att undvika klippning. Meningsfull stödtext har egen mindre storlek/vikt.
- Godkända ord återges deterministiskt med transparent bakgrund, enligt befintlig arkitektur.
  Ingen ny textbildsbeställning eller Kling-generering införs. En individuell bakgrundsbeställning
  kvarstår; exakt text behöver ingen ny OCR-beställning.
- Den oberoende slutbildens palett används tillsammans med varumärkets färger och explicita
  färgval. Standard-cyan och automatisk gradient på sist raden tas bort. Kontrastsvaga
  accentförslag ersätts med läsbar huvudfärg.
- Produktnamnet dubbleras inte som överrubrik. Samma huvudbudskap och uppmaning visas inte två gånger.
- Uppmaningens storlek begränsas i förhållande till huvudrubrikens verkliga bokstäver och bredd.
  Mellanrum och avsändarutrymme ökas utan att ändra filmens längd eller produktens skyddade ytor.
- Den autentiska logotypen behåller sina färger, får rimlig storlek och vid behov en diskret
  kontrastyta. Saknas logga används verifierat företagsnamn. Ingen logotyp hittas på.
- Nya slutbilder anger om de innehåller avsändare. Då avslutas hörnloggan när slutbilden börjar,
  både för Kling och animation. Sparade äldre tillgångar utan flaggan behåller sin befintliga tidslinje.
- Designversion 360 sparas för nya tillgångar. Sparade videor/textlager tvingas inte till omgenerering.

Kvalitetsgranskningens tidigare regler behålls: rena kreativa invändningar får inte skapa ett
nytt adminstopp. Produktidentitet, fysiska fel, produktöverlapp, konkret klippning/korruption
och osäker betald beställning behåller sina skydd.

## Verifiering och exempel

`scripts/test-commercial-design-hierarchy.mjs` kör riktiga Sharp-renderingar och de faktiska
planerings-/workerfunktionerna med simulerade externa svar. Det testar storleksrelationer,
avstånd, kantklippning, avsändare, dubblerad text, färgstandard, äldre loggtidslinjer, högst en
omskrivning, inga omsändningar vid timeout och kategorifilter före dyra produktanrop.
De tidigare produktinhämtningstesterna ingår också.

22 relevanta testskript och SQL-testet för återupptagning passerar, liksom produktionsbygget
med testvärden för miljövariabler och `git diff --check`.
Det äldre testet `test-v144-315-art-direction.mjs` förväntar automatisk bakgrundsoskärpa som
tidigare tagits bort; det fallerar identiskt i orörd 144.359. Samma gäller den tidigare
dokumenterade kontrollen i `test-v144-162-product-research-cost-guard.mjs`.
Inga äldre fel har döljts genom att skriva om deras tester.

Två lokala exempel är framställda med den riktiga kompositorn, en kodgenererad testbakgrund,
verifierat företagsnamn som text och manuellt vald exempelcopy:

- `docs/previews/144360/end-card-hook.png`
- `docs/previews/144360/end-card-product-label-fallback.png`

De illustrerar layout och reservfall; de är inte omrenderingar av kundens film, nya
produktmallar eller bevis för att nästa AI-svar får exakt dessa ord och färger.
Det slutliga uttrycket måste kontrolleras i en riktig ny provkörning efter godkänd driftsättning.

Shotstack-vattenstämpeln ändras inte här. Koden har stöd för separata renderingsmiljöer,
men de faktiska produktionsinställningarna/kontovillkoren har inte verifierats eller ändrats.
Testerna köper ingen AI-video, skickar inga kundmejl och skriver inte till produktionsdatabasen.
