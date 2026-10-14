# Spreelo 144.343 — sessionskontroll och kodinloggning

Bygger på den kompletta zippen 144.342. Alla ändringar för animation, friläggning, text, slutkort och Kling från 144.342 är kvar. Ingen SQL eller ändring av miljövariabler behövs. Publicera som en vanlig koduppdatering; detta paket är inte publicerat automatiskt.

## Vad underlaget visar

Inspelningen visar en accepterad kod, startsidan och därefter en omedelbar omdirigering till login. Loggexporten innehåller tre liknande övergångar den 14 oktober, svensk tid: 23:57:19, 23:57:48 och 00:01:20 den 15 oktober. Vid samtliga finns ett 200-svar från `/api/account/welcome-email`, vars serverkod verifierar token innan den svarar 200, följt av startsida och login inom ungefär en sekund. Detta styrker att token accepterades av servern vid dessa anrop; det bevisar inte att samma session fortfarande var tillgänglig i webbläsaren efteråt.

Webbläsarens direkta anrop till Supabase finns inte i Vercel-exporten. Den exakta felkoden som utlöste kundens omdirigering är därför inte fastställd. De berörda inloggningsfilerna var oförändrade i 144.342 jämfört med den äldre tillgängliga koden. Tidsmässigt samband med uppdateringen bevisar inte att videoändringarna orsakade problemet.

En bekräftad felväg finns i tidigare kod: startsidan och flera andra kundsidor hämtade användaren med `getUser()` och skickade till login om användaren saknades, även när svaret samtidigt innehöll ett anslutnings- eller serverfel. Detta kunde inträffa efter att appens separata layoutkontroll redan accepterat den lokala sessionen.

429 från `/api/auth/send-code` är ett separat hinder vid upprepade kodförfrågningar. Det förklarar utebliven ny kod, inte den tidigare omdirigeringen efter godkänd kod.

## Ändringar

- Layout och berörda kundsidor använder en gemensam, begränsad sessionskontroll. En användare måste verifieras av Supabase. Lokalt lagrad användarinformation används aldrig som reservautentisering.
- Tillfälligt nätverksfel, 429, 5xx, timeout eller tomt verifieringssvar leder till befintlig återförsöksvy. Appen anropar inte signOut och skickar inte till login för dessa fel.
- Saknad session efter korta återförsök eller bekräftad avslutad session leder fortfarande till login. En sen kontroll av en gammal token får inte kasta ut en nyare session eller återställa ett utloggat konto.
- Samtidiga kontroller delar på samma pågående verifiering. Verifierat resultat återanvänds högst tio sekunder för samma token, efter ny kontroll av den aktuella lokala sessionen. Auth-händelser ogiltigförklarar cachen. Serverns API-behörigheter och databasens RLS är oförändrade.
- Efter accepterad engångskod bekräftas den aktiva sessionen och kontot innan navigering. Navigeringen använder Next-router så att klientens aktiva session behålls. Om efterkontrollen tillfälligt misslyckas kan användaren fortsätta utan att skicka samma redan förbrukade kod på nytt.
- Ett uttryckligt lyckat återförsök i återförsöksvyn laddar om sidan så att sidans dataladdning startar igen. Vid ett formulär kan detta innebära att osparade lokala inmatningar försvinner efter att användaren väljer återförsök.
- Separat kodspärr: avvisade försök förlänger inte längre den redan pågående väntetiden. Svaret anger återstående tid; klienten känner igen HTTP 429 och RATE_LIMIT och behåller väntetiden i flikens sessionStorage. Ett avvisat utskick raderar inte redan inskriven kod. Spärren finns kvar; befintlig begränsning per serverinstans har inte gjorts om till en distribuerad limiter.
- Diagnostik skriver kontrollsteg, felkod och status, aldrig token, e-post eller råa providersvar.

## Verifiering

- `npm run test:v144.343`: 22 grupper med simulerade auth-, nätverks- och spärrsvar, inklusive körning av faktiska sidfunktioner. Bekräftar även adminbehörighetskontroll, verifierat konto, avslutad session, byte av konto, cache och en enda OTP-verifiering vid återförsök.
- `npm run build`: godkänt med platshållare för externa nycklar.
- `npm run test:v144.343:browser` efter produktionsbygge: Chromium kör den verkliga kodinloggningsvyn med lokala API-fixturer. Två auth-503 följs av lyckad inloggning, ett längre avbrott visar återförsöksvyn utan omdirigering eller raderad session, återförsök återställer startsidan utan nytt OTP-anrop, och uttrycklig utloggning tar bort sessionen. Alla externa anrop fångas av testfixturer; en installerad Chromium eller paketets medföljande binär krävs (kan väljas med LOGIN_TEST_CHROMIUM_PATH).
- Befintliga tester 143.12 samt 144.337, 144.338, 144.341 och 144.342: godkända utan betalda provideranrop.
- Det äldre textbaserade testet 144.159 har en inaktuell assertion om exakt text i automationens select-lista. Samma assertion misslyckas även mot den oförändrade 144.342-koden. Det har inte ändrats för att dölja felet.
- Arkivkontroll bekräftar att video-, cron-, finaliserings-, SQL- och popupfiler från 144.342 är oförändrade. Endast den separata auth/send-code-routen bland API-routes ändras.

Inga riktiga koder har skickats, inga kundkonton har använts och inga betalda AI-/videokörningar har startats under verifieringen. Verklig kontoinloggning i produktion är inte verifierad. Paketet rättar de verifierade felvägarna; det är inte ett påstående att den ännu okända produktionsutlösaren har identifierats.
