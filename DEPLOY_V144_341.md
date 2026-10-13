# Spreelo 144.341 – kontrollerad Kling-rörelse före beställning

Bas: hela den bifogade `spreelo-144.340-failed-post-recovery(1).zip`. Admins klartext och återställningsinstruktioner, workerfelhanteringen, referensskyddet och videoförhandsvisningen behålls.

## Bekräftade fel i de två sparade körningarna

Nintendo-planen beskrev konsolen/dockan tryckta på förpackningen som verkliga fysiska komponenter. En lanseringsfras blev ett verifierat handlings-id. Planen begärde panorering över framsida och sidor samt klipp till ansikten och tillbaka. Den accepterades trots vybegränsningen och en sammanhängande tagning.

Dreame-planen härledde automatisk dockning från en stillbild och beskrev en separat robot som fastsatt vid stationen. Planens rörelsesekvens och dess fria slutprompt motsade varandra. Båda planerna godkändes av de tidigare kodkontrollerna och AI-förhandsgranskningen.

## Förändrad styrning

- Produktkontraktet anger vilket verkligt fysiskt föremål som syns. Förpackningar och tryckta/screen-visade produktbilder skiljs åt. Komponenter märks som fysiska eller avbildade och relationer som integrerade, mekaniskt fastsatta, separata, avbildade eller okända.
- Handlingsunderlaget har ett uttryckligt slag och en fysisk målkomponent. Marknadsfraser och observationen att ett föremål är placerat vid en station ger inte tillstånd till operationer. Återförsäljarcitat måste återfinnas i den sparade produktbeskrivningen. Avbildade mål och felaktiga relationer stoppas.
- AI väljer mellan begränsade fält för en kontinuerlig tagning, fixerad produktvy, fixerad kamera eller centrerad digital inzoomning på högst 6 %, en underbyggd fysisk handling och redan etablerad miljörörelse. Kamerapanorering, rotation, nya vinklar och klipp ingår inte bland dessa val.
- Kod bygger den enda slutdirektionen. Fritt formulerad strategi, initialvillkor och objektlistor kan inte lägga till instruktioner i den. En separat fri rörelsesekvens tillåts inte. Gamla planformat får ingen verkställbar behörighet.
- Den exakta kodbyggda direktionen granskas i den befintliga förhandsgranskningen. Om den underkänns, underlaget saknas eller ett AI-anrop fallerar används en fixerad, passiv plan före beställningen.
- Kling förankras i den accepterade startbild som faktiskt skickas. Prompten hänvisar inte längre till en oskickad originalbild. Originalbilden förblir Spreelos underlag för identitetsgranskning.
- Startbildens instruktioner använder det sanerade produktkontraktet och skiljer också förpackningar från tryckta föremål. Generella kategori-exempel ger inte längre fristående tillstånd till mekaniska operationer.
- Slutprompt, exakt direktion, strukturerad plan och versionsnummer sparas tillsammans. Om promptbudgeten inte rymmer den kompletta granskade direktionen ersätts hela planen med den passiva planen; ingen halv instruktion skickas.

## Tillåten användning och avgränsning

Vanlig presentation, kort rak förflyttning i en etablerad hand, gång med samma vända plaggyta, rak rullning och underbyggd rak förflyttning av en separat enhet kan väljas när källa och startscen stöder handlingen och vyn bevaras. En förpackning kan förbli stilla medan människor i scenen reagerar. Ett beskuret produktunderlag kompletteras inte.

Denna begränsade planmodell beställer inte aktivering, öppning, automatisk dockning/undockning, dold insertion eller mekaniska transformationer. Ett produktnamn eller en stillbild av ett slutläge räcker inte för att beskriva sådana operationssekvenser korrekt. Rörelsemodellen har medvetet färre frihetsgrader för att minska riskfyllda beställningar.

Eftergranskningen och befintlig säker originalbildsanimation behålls. Kodkontroller kan stoppa en felaktig beställningsplan men kan inte tekniskt låsa varje pixel eller garantera Kling-resultatets riktighet. Den faktiska träffsäkerheten behöver mätas på riktiga resultat; denna release innehåller ingen påstådd procentförbättring.

## Kostnad och befintliga jobb

Antalet planerings-/förhandsgranskningsanrop ökas inte. Tokens och svar kan variera eftersom kontraktet ändras; oförändrat antal anrop är inte ett löfte om identisk AI-faktura. Ingen automatisk ombeställning av en Kling-video införs.

Ändringen gäller nya förberedelser. Befintliga videor genereras inte om automatiskt. Kvalitetsgranskningens cacheversion ligger kvar på 337 medan rörelsekontraktets version är 341, så en ändrad rörelseplanering inte i sig ogiltigförklarar granskning av redan betalda jobb.

## Verifiering

- `npm run test:v144.341`: de faktiska felplanerna från CSV-exporten, indirekta vinkelbyten och klipp, avbildade mål, lanseringsfraser, stillbildsbaserad dockning, falska relationer, förankrade citat, tillåten naturlig användning, exakta granskade instruktioner och passiv plan vid fel.
- `npm run test:v144.337`, `npm run test:v144.338`, `npm run test:v144.339`, `npm run test:v144.31`.
- `node scripts/test-v144-340-failed-post-recovery.mjs` i den lokala Node 24-miljön.
- Testerna för kreativ säkerhet (334), mobil admin (336) och promptintegritet (329). Deras fixtures har anpassats där det gamla fria planformatet ersatts; identitets-, budget- och kontinuitetskontrollerna behålls.
- Syntaxkontroll och full Next.js-produktionsbyggnad: Sharp, kompilering, TypeScript och alla 66 statiska sidor godkända med tillfälliga byggplatshållare.
- Komplett ZIP verifieras byte för byte mot 144.340 utanför de avsiktligt ändrade filerna. Adminåterställningen, finalizern, manuellt retry-API, leverantörsanrop, kostnadsskydd och övriga filer är bevarade.

Ingen betald AI-/Kling-körning, driftsättning eller skarp databasändring gjordes under arbetet. Regressionstesterna använder sparade planer och lokala stubbar; de mäter inte framtida Kling-resultats kvalitet.

## Installation

Installera den kompletta `spreelo-144.341-bounded-kling-motion.zip` istället för föregående ZIP. Ingen ny SQL-migrering eller miljövariabel krävs. Behåll befintliga inställningar. Beroenden, byggmappar och byggplatshållare ingår inte i leveransen.
