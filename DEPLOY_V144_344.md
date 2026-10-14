# Spreelo 144.344 — fullt lokalt lagringsutrymme och förlorad inloggning

Bygger på hela 144.343 och behåller 144.342:s videoändringar. Använd 144.344 för denna rättning. Ingen SQL eller nya miljövariabler krävs. Ingen automatisk publicering har gjorts.

## Nytt underlag och grundorsak

Kundens konsolkontroll den 15 oktober visar `kanSpara: false, fel: QuotaExceededError`: originens localStorage kan inte ens spara en liten testpost. Nätverksloggen visar lyckad `/auth/v1/verify` (200), därefter tillbaka till login utan `/auth/v1/user`.

Den installerade Supabase-klientens `supportsLocalStorage()` gör ett skrivtest. Om testet misslyckas väljer klienten som standard lagring enbart i minnet. En OTP kan då godkännas och fungera under den aktuella sidans livstid, men den sparas inte beständigt. Den tidigare hårda navigeringen efter inloggning startar en ny klient utan session. `getUser()` returnerar då AuthSessionMissingError utan något nätverksanrop till `/user`.

Detta förlopp har reproducerats med den riktiga installerade Supabase-SDK:n i Chromium, full localStorage och simulerat lyckat OTP-svar: accepted=true, localSession=true, persisted=false; efter hårt sidbyte user=false, AuthSessionMissingError och noll user-anrop. Med den rättade klienten och samma fulla lagring sparas sessionen och återställs efter hårt sidbyte.

Det ersätter den tidigare osäkerheten om sessionsförlustens mekanism i 144.343:s diagnos. 429 på send-code var ett separat hinder för att begära nya koder.

Källkoden hade obegränsade lokala språk-/versionscacher och planrekommendationer i samma utrymme som auth. Kundens skärmbild fastställer att lagringen är full, men anger inte exakt vilka lagringsposter som tog mest plats. Vi har inte läst eller raderat kundens faktiska lagring på distans.

## Rättning av lagringshanteringen

- Innan auth-klienten skapas begränsas återskapningsbara språk-, preload- och planrekommendationscacher. Äldre cacheposter som överskrider budgeten tas bort automatiskt.
- Samlad cachebudget: högst 512 Ki tecken inklusive nycklar och högst 24 poster; en post högst 384 Ki tecken. Gränserna avser JavaScript-stränglängd, inte ett antagande om webbläsarens exakta bytekvot. Den kompletta nuvarande UI-ordlistan ryms inom postbudgeten.
- Ett tillfälligt skrivtest kontrollerar att 64 Ki tecken finns tillgängliga för inloggning och tokenförnyelse. Om det behövs tas fler av de uttryckligen tillåtna cacherna bort. Testposten tas genast bort.
- Supabase använder en uttrycklig adapter för beständig localStorage. En auth-skrivning som möter kvotfel kan frigöra återskapningsbar cache och försöka igen. Den rapporterar inte en beständigt lyckad inloggning genom en tyst övergång till enbart minne.
- Fortsatta cache-skrivningar går genom samma begränsningar och bevarar utrymme för auth. Plan-cache innehåller bara de fält som den befintliga rekommendationsläsaren använder. Fullständiga översättningar finns fortsatt i sidans minne och i befintlig servercache; inget språk tas bort och översättningarnas serverlogik ändras inte.
- Rensningen matchar endast `spreelo_ui_labels_v…`, `spreelo_ui_preloaded_v…` och `spreelo_plan_recommendation_v…`. Den använder aldrig localStorage.clear och rör inte auth-poster, språkval, varumärkesval, popupval, e-postpreferenser, osparad kampanjöverlämning eller okända nycklar.
- Om lagringen i stället blockeras av webbläsaren, eller fylls helt av okända/icke återskapningsbara data, lämnas dessa data orörda och beständig lagring kan fortfarande ge ett tydligt fel. Rättningen kringgår inte webbläsarens säkerhetsinställningar och låtsas inte att en osparad session är beständig.

## Verifiering

- Produktionsbygge med platshållarnycklar: godkänt.
- `npm run test:v144.344`: 10 testgrupper, inklusive kvotåterställning, cachegränser, verklig översättningsskrivare, komplett UI-ordlista, bibehållen användardata, förnyad auth-skrivning och blockerad/okänd lagring.
- `npm run test:v144.344:sdk`: både tidigare fel och rättning körs med faktisk SDK i Chromium och lokala fixtures. Vanligt hårt sidbyte krävs uttryckligen för godkänt resultat.
- `npm run test:v144.344:browser` efter bygget: den verkliga inloggningsvyn startar med fylld cache. OTP-inloggning, beständig session efter hårt sidbyte, bevarad kampanjöverlämning, tillfälliga auth-fel, uttryckligt återförsök och verklig utloggningsknapp verifieras med simulerade providersvar.
- Befintliga 144.343:s 22 inloggnings-/sessionstestgrupper och videotesterna 144.337, 144.338, 144.341 och 144.342: godkända.
- Gamla textbaserade test 144.157 kräver fortfarande cacheversion v29 trots att oförändrade 144.342/343 redan använder v30. Det misslyckas på detta föråldrade versionspåstående. 144.343-dokumentet beskriver även ett redan befintligt textpåstående i 144.159. Inga sådana gamla tester har ändrats för att dölja deras fel.
- Arkivjämförelse bekräftar att video-, renderings-, cron-, API-behörighets-, SQL- och popupfiler är oförändrade mot 144.343.

Webbläsartesterna kräver installerad Chromium eller paketets binär; vid behov kan LOGIN_TEST_CHROMIUM_PATH ange dess sökväg. Provideranrop fångas av testfixtures. Ingen riktig kod har skickats, inget kundkonto har använts och ingen betald AI- eller videokörning har startats. Rättningen måste publiceras innan kundens lagring kan återställas automatiskt. Inloggning på kundens dator efter publicering är ännu inte verifierad.
