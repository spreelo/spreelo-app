# Spreelo 144.339 – sammanfogad videofix och workerfelhantering

Denna kompletta release förenar `spreelo-144.338-kling-reference-admin-preview.zip` med kodändringarna i `spreelo-144.338-worker-recovery-patch(1).zip`. Båda tidigare leveranserna använde versionsnumret 144.338 men innehöll olika ändringar. Använd denna gemensamma version vid uppdatering; lägg inte den äldre workerpatchens hela automation-route ovanpå den.

## Behållna videofixar

- Finalizern hämtar startbildsfälten som saknades i den tidigare databasfrågan. Referenssnapshot och strikt originalbildsvy behålls.
- Alla fyra Kling-inskickningsvägar verifierar sparade referenser före en betald beställning. Tre ligger i automation-routen och den fjärde i manuell adminomkörning.
- Färdig Kling-källvideo sparas innan AI-granskningen och visas med spelare och öppna-länk i admin. En källvideo blir inte automatiskt färdig för kundleverans.
- Utgångna nedladdningslänkar kan uppdateras genom att läsa samma befintliga Kling-task. Ingen ny generering beställs av denna återhämtning.
- Äldre återställbara referensfel kan återupptas med sparat resultat. Verkligt saknade referenser blir ett tydligt adminärende. Kvalitetsunderkända jobb öppnas inte automatiskt igen.
- Produkt-, händelse- och fysikgranskningen samt den befintliga säkra originalbildsanimationen från 144.337 behålls.

Detaljer och den valfria läsfrågan för de två befintliga videoklippen finns kvar i `DEPLOY_V144_338.md` och `spreelo-v144.338-video-links-readonly.sql`. Läsfrågan ändrar inga data.

## Införd workerfelhantering

- Ett Supabase-svar med `Project not specified.` identifieras som ett tillfälligt beroendefel. Vid den berörda läsningen av publiceringskön eller kontrollen av gamla körningar avbryts cron utan att räkna läsfelet som en misslyckad publicering. Nästa ordinarie schemalagda körning kan försöka igen.
- Topploggar, API-svar, incidentmetadata och larmmejl visar vilket arbetssteg som misslyckades. Den misstänkta beroendekomponenten anges när detta särskilda Supabase-svar upptäcks.
- Incidenter grupperas efter worker, arbetssteg, feltyp/felkod och felmeddelandets signatur. Olika generiska fel blandas inte längre i samma räknare.
- Detta upptäckta beroendefel ger HTTP 503 med `Retry-After: 60`; övriga toppnivåfel behåller HTTP 500.
- Övriga fel vid läsning av publiceringskön räknas som otillgänglig kö, inte som en redan försökt och misslyckad publicering.

Ändringen förbättrar hantering och diagnostik. Den fastställer eller reparerar inte grundorsaken till den tidigare Supabase-incidenten och inför ingen ny generell garanti för återhämtning efter flera timmars driftstörning.

## Verifiering

- `node --check app/api/cron/run-automations/route.js`
- `npm run test:v144.339` kör både referens-/adminvideotestet från 144.338 och det införda workerberoende-/incidenttestet.
- `node scripts/test-v144-101-worker-lane-guard-admin-incidents.mjs`
- `npm run test:v144.337`
- `npm run test:v144.31`
- Full `npm run build`: Sharp, Next.js-kompilering, TypeScript och alla 66 statiska sidor godkända med tillfälliga byggplatshållare.
- ZIP-filen verifieras mot hela föregående videorelease: alla tidigare filer finns kvar, och endast automation-routen och package.json ersätts. Den nya workertestfilen och denna releasebeskrivning tillkommer.

## Installation och avgränsning

Installera den kompletta `spreelo-144.339-kling-worker-merged.zip` som tidigare och behåll befintliga miljöinställningar. Ingen ny SQL-migrering eller miljövariabel behövs för denna sammanfogning.

Ingen driftsättning, skarp databasändring, betald Kling-beställning eller AI-granskning har gjorts under sammanfogningen. Installerade beroenden, byggmappar och tillfälliga byggplatshållare ingår inte i ZIP-filen. Efter driftsättning behöver de två befintliga videoklippen kontrolleras i admin och workerloggarna kontrolleras för den nya fasdiagnostiken.
