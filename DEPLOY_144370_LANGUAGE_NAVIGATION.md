# Spreelo 144.370 — språk vid sidbyte och onödigt manusstopp

Bas: driftsatt 144.369, `ab50f0ef80a8afd3e55c6a23b610c97c929071c2`. Den opublicerade språkändringen från tidigare i samtalet har återskapats efter återställd arbetsmiljö och testats om tillsammans med manusfixen. Ingen publicering till GitHub/main, live eller återstart av kundjobb görs utan användarens godkännande.

## Körningen 18 oktober 2026, 00:06–00:07 UTC

Regel `1b4e0d2d-2e28-4405-9821-788cd1875515`, förekomst `3cf655c5-a940-4cc4-b08d-f532b627b701`, incident `54abada9-adbb-41a8-a300-90fd15ac6d89`.

Loggen visar att produkten Always Be Nice To A Diver valdes, originalbilden identifierades med 0,95 säkerhet och produkttexten godkändes. De härledda marknadssidorna `/sv-se` och `/en-se` gav 404, men systemet fortsatte med den inställda kollektionen. En direkt produktpool på 250 kandidater togs fram. Detta är inte orsaken till misslyckandet.

`planKlingCommercialStory` fick en konkret handlingsmening på 169 tecken och avvisade den med `strategy_exceeds_160_characters`. Det enda omskrivningsförsöket gav 164 tecken och avvisades igen. Funktionen returnerade `status: unavailable`. `assertKlingMotionPlanningReady` kastade sedan `KLING_MOTION_PLAN_REVIEW_REQUIRED` före öppningsbild och Kling-beställning. Workern bokförde förekomsten som terminalt misslyckad och skickade adminlarm. HTTP 200/`ok: true` beskriver att köhanteraren besvarade anropet; samma slutrapport visar `generated: 0, errors: 1`. Bildmejlet bekräftar samma incident, saknat post-ID och OpenAI som registrerad leverantör. Ingen Kling-video beställdes för denna förekomst.

## Manusfix

- 160 tecken var en intern skrivregel, inte en begränsning av hela den utgående begäran. Den hårda valideringen tas bort. Planeringen får fortfarande ett korthetsmål på ungefär 120–240 tecken, utan en ny avvisningsgräns. Tomt/saknat manus och tidigare faktiska kontraktsfel behandlas som tidigare.
- `renderKlingStructuredMotion` kapade också strategin vid 180 tecken. Den kapningen tas bort; en godkänd handlingsbeskrivning normaliseras endast för blanksteg och förs vidare i sin helhet.
- Den färdiga worker-prompten hade ytterligare ett internt tak på 1200 tecken för rörelseinstruktionen. För redan planerade berättelser används nu det utrymme som återstår inom samma befintliga gräns för **hela** begäran, 2450 tecken i Spreelos promptbyggare. Produkt-, tryck-, komponent-, funktions- och sceninstruktionerna behålls. Den separata sändningsfunktionens befintliga 2500-gräns ändras inte.
- Om hela den kompletta begäran verkligen inte ryms exponeras detta som `KLING_PROMPT_TOO_LONG`, med faktisk längd och befintlig budget. En sådan faktisk storleksöverskridning ska inte felmärkas som kreativ manusgranskning eller tyst ersättas av en annan handling. Samma slutkontroll fanns redan; ingen extra modellgranskning eller ny begränsning läggs ovanpå den.
- Tidigare direktkörning av planerade manus till Kling, bevarande av redan betalda källor/render-ID:n och begränsning av nya beställningar förblir kvar. Ingen ny OCR, känslig kreativ granskare, betald automatisk ombeställning eller adminspärr införs.

## Språkfixen följer med

Översättningar hämtades sida för sida, medan förberedelsen bara omfattade navigationen. Den gemensamma minnescachen saknade också prenumerationer som uppdaterade andra synliga läsare direkt. Den sparade språkfilen kunde bli för stor och tas bort som helhet när allt fler namnrymder slogs ihop. Användarens faktiska lagring har inte lästs; detta är verifierade kodvägar, inte ett påstående om vilken storlek användarens fil hade.

- Besökta sidors texter sparas i separata språk-/namnrymdspaket. Ett för stort paket tar inte bort övriga sidors sparade text. Äldre filer och den lilla navigationscachen läses fortfarande.
- Reacts `useSyncExternalStore` ger gemensamma stabila snapshots och uppdaterar alla synliga läsare direkt när en annan hämtning levererar rätt text.
- En ny skrivskyddad route, `/api/ui-translations/stored`, gör en databasläsning av redan sparade globala UI-översättningar. Den skapar inga översättningar, skriver inga rader och väntar inte på AI-lås. Servertexter för e-post och godkännandedokument ingår inte. Kända UI-nycklar och befintlig käll-/textvalidering används för att välja korrekt cachedata.
- Valda språkets färdiga texter för andra sidor förbereds i arbetsminnet. Navigationen väntar inte på läsningen. Endast faktiskt använda sidpaket och navigation sparas på disk. Ett sent förberedelsesvar får inte ersätta ett nyare vanligt sidsvar. Samtidiga anrop slås ihop och timeout/återförsök begränsas.

De befintliga lagringsgränserna ändras inte: totalt 512×1024 tecken, högst 384×1024 tecken per post, högst 24 rensningsbara poster och samma autentiseringsreserv. Gränserna anges i tecken, inte exakt byteförbrukning. Autentisering, språkval och osparade kampanjer rensas inte av cachestädningen. Den stora förberedelsen lagras endast i arbetsminnet.

Vid helt tom/blockerad cache, ännu ej skapade översättningar eller nätavbrott kan en första hämtning fortfarande märkas. Uppdateringen tar bort onödig återkommande väntan där färdig text redan finns; den gömmer inte sidan och lovar inte översättning utan underlag och nät.

## Verifiering

**17 regressionstestskript passerar**, inklusive nya 370-tester för språkcache och manuslängd, verklig öppnings-/claim-/beställningsväg i 366, planning-review, story-before-frame, opening-policy, 337/338 produktunderlag, video-failure-reliability, merged-429-video-stability, 155 kostnadsmätning, 343 inloggningssession, 344 lagring, 362 språk/UI, 367 kalender/laddning, 32 översättningar och 369 slutbild.

- Exakta meningar på 169 och 164 tecken från loggen går genom den riktiga planerings- och worker-koden och når var sin **simulerad** Kling-beställning oförändrade. Ett befintligt planeringsanrop, en öppningsbild och ett beställningsanspråk per test; inga riktiga leverantörsbeställningar görs.
- Längre meningar än det gamla 180-taket och kompletta rörelseinstruktioner längre än 1200 tecken testas när hela begäran fortfarande ryms. Verkligt totalöverskridande ger uttrycklig teknisk storleksorsak. Produktinstruktioner är kvar. Tidigare tester av ogiltiga strukturella kontrakt, provider-/databasfel och inga extra beställningar bevaras.
- Språktestet använder faktisk cachemodul och ny API-route med lokal HTTP-fixtur. Det övar överfull samlad ordlista, för stor enskild post, stabila prenumererade snapshots, språkbyte, försenade/samtidiga svar, korrupt/blockerad lagring samt oförändrade gränser, session och utkast. Den riktiga Supabase-adaptern får bara göra en GET-läsning i fixturen.
- **Full produktionswebbläsarsvit passerar** utan sid-/hydrationfel. Första klicket till kalendern och tillbaka visar ingen prickblinkning trots hängande vanliga valideringssvar. En försenad minnesförberedelse uppdaterar en redan synlig sida medan dess eget anrop hänger. Datumväljarens geometri, mobilvy, språkbyte, kalenderkampanj, inloggning och avbrottsbeteende fungerar fortsatt.
- **Produktionsbygget godkänt**, inklusive Next-kompilering, TypeScript och sidgenerering. `git diff --check` är utan anmärkning.

I föregående språkgenomgång identifierades dessutom två historiska extratester som fallerade redan i oförändrad 144.369: test 157 kräver den gamla cacheversionen v29 trots basens v30, och test 30 kräver en historisk två-rutors videoprovtagning. De ändras inte och räknas inte som godkända.

Ingen SQL eller ny miljövariabel behövs. Ingen kundkampanj, e-post eller betald bild-/videobeställning har startats i verifieringen. Den misslyckade liveförekomsten har inte återställts eller körts om. En ny verklig provkörning efter godkänd driftsättning behövs för att bedöma det kreativa resultatet.
