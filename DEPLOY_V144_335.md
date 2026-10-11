# Spreelo v144.335 – adminöversikt enligt designreferensen

Bas: den kompletta uppladdade `spreelo-144.334-kling-creative-safety(1).zip`.

## Utseende

- Ljus adminöversikt med fristående nyckeltalskort och en separat ärenderad.
- Fyra färgmarkerade funktionsgrupper i två kolumner. Systemstatus och befintlig driftshistorik visas i panelen bredvid.
- Analys: stort stapeldiagram till vänster, innehållsformat och toppländer staplade till höger.
- AI-kostnader visas i två kolumner. Kreditjusteringar och systemverktyg avslutar sidan.
- Lila markering för den aktiva Admin-länken och en mörk sidomeny på adminöversikten.
- Anpassad layout för dator, surfplatta och mobil. Uppdateringsknappen är tillgänglig även på små skärmar.

## Befintliga funktioner

Alla befintliga 15 funktionslänkar finns kvar, inklusive Översättningar, AI Control Center och adminteamet. Adminteamet visas fortfarande endast när `canManageTeam` tillåter det. Systemstatus och driftshistorik, datum, diagram, statistik, kreditjusteringar, kostnader, språkval, översättningsbeställning och stopp av bakgrundsjobb använder samma data och anrop som i 334.

Den dekorativa välkomstbannern ersätts av nyckeltalskorten. Hälsningen finns kvar ovanför sidrubriken. Designbildens extra sökfält, aviseringar, trendprocent och påhittade tjänster har inte lagts till. Befintlig profilhantering, kreditsaldo, varumärkesval och utloggning i sidomenyn finns kvar.

## Installation

Driftsätt den kompletta zippen som vanligt. **Ingen ny SQL krävs för v144.335.** Tidigare nödvändiga databasuppdateringar gäller fortsatt.

## Kontroll

- Produktionsbygget (`npm run build`) godkänt med lokala testvärden för obligatoriska miljövariabler.
- Befintliga tester för adminöversikt och Kling-produktskydd godkända.
- Jämförelse mot 334: samtliga navigationsmål, kontrollernas händelsehanterare och sektionsankare bevarade. Funktionerna före sidans JSX, inklusive autentisering, datahämtning, skrivningar och beräkningar, är byte för byte identiska.
- Webbläsarkontroll av den byggda sidan med simulerade API-svar: 360, 390, 640, 768, 1024, 1100, 1280, 1440 och 1920 px. Ingen horisontell sidöverströmning; länkar och uppdateringsknapp tillgängliga.
- Språkval, översättningsbeställning, stopp av bakgrundsjobb och teamlänkens behörighet kontrollerade med simulerade svar. Tomma data och laddningsfel kontrollerade. Ingen kunddata eller verkliga AI-jobb används i kontrollen.
- Inga backend-, API-, betalnings-, publicerings-, modell- eller Kling-filer ändrade.

Verifieringen omfattar lokal kod och layout. Ett test efter driftsättning med verklig adminsession återstår.

## Ändrade filer

- `app/admin/page.jsx`
- `app/globals.css`
- Ny: `app/styles/165-v144-335-admin-reference.css`
- Ny: denna installationsbeskrivning.
