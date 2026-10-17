# Spreelo 144.367 — rätt kalenderkampanj från Hem och läsbar laddning

Bas: 144.366, `8de19d73a82aefcfb0d538a6bc79080bcfc36e43`.
Användaren har godkänt rättning av båda problemen som visas i skärminspelningen 2026-10-17 23:56.

## Kampanjöverföring

Hem använde `/automation?campaign=...`. Mottagaren läser `campaignOpportunityId`/`campaignId` och kampanjläge, så länken kunde öppna en vanlig veckoplan utan den förberedda kalenderkampanjens identitet och upplägg.

`calendarCampaignHref` används nu av det aktiva Hem-kortet, kvarvarande alternativa Hem-vyer och temakalenderns befintliga knapp. Den överför samma URL-kodade kampanj-ID, `mode=campaign` och valt varumärkes-ID. Kalenderns befintliga lagringshandoff behålls; URL:en räcker även när den valfria lagringen inte går att skriva. Mottagarens befintliga databasladdning hämtar den riktiga kampanjraden med dess förberedda `post_plan` och datum. Ingen plan sparas eller aktiveras av länken.

## Laddning och språk

Laddningsrutan använde samma `…`-reserv som vanliga ännu ej hämtade etiketter. Två korta lokala reservtexter för arbetsytans laddning finns nu på samtliga 30 appspråk, så rutan är läsbar även vid tom eller blockerad lagring och långsamt översättningsanrop. Giltig text i serverns översättningspaket har fortsatt företräde. Resten av UI:t använder samma befintliga översättningssystem; inga stora statiska sidordlistor eller sidomasker införs.

Sidomenyn och det aktiva kampanjkortet använder Next-klientnavigering med förhämtning avstängd. Därmed behålls aktuell språk- och översättningsdata i JavaScript-minnet mellan sidor, i stället för att varje klick laddar om hela dokumentet. Befintlig kanallåsning och mobilmenystängning behålls.

En liten separat shellcache med redan hämtad gemensam/navigationstext skrivs med samma begränsade, rensningsbara cachemekanism. Den kan återställas synkront efter en hård omladdning även om ett stort sidpaket har kastats. Trasig JSON i huvudpaketet kastar inte bort en frisk shellcache. Totalgränsen 512 KiB, postgränsen 384 KiB, autentiseringens reservutrymme och rensningens tillåtelselista är oförändrade. Ingen ursprungsomfattande lagringsrensning, ny SQL eller miljövariabel tillkommer.

## Verifiering

- Nytt `test-v144-367-campaign-loading.mjs`: faktisk kalenderknapp, URL-kodning, kampanjläge, varumärke, explicit ID före gammal lagringshandoff, otillgänglig lagring, den verkliga textfunktionen på 30 språk och servertextens företräde. De verkliga cachefunktionerna testas med för stor sidcache, upprepade cacheutkast och korrupt JSON; autentisering, språkval och osparad kampanjdata bevaras inom samma lagringsgräns.
- Produktionsbygge och uppdaterad Chromium-svit mot den byggda appen med simulerad autentisering/databas/översättning. Svitens nya fall kontrollerar laddningsrutans första synliga svenska text, riktiga klick från sidomenyn och Hem, bevarat JavaScript-minne, rätt kampanj-/varumärkes-ID och de faktiska förberedda inläggens antal och datum i användargränssnittet. Befintliga tester av datumväljarens geometri, språkbyte, långsam/otillgänglig översättning, inloggningspreferens och hydration ingår.
- Tio riktade regressionstestskript passerar: nytt 367, UI 362, lagring 344, session 343, gemensam kampanjstudio 97 samt Kling 366, story-before-frame, planning-review, video-failure-reliability och merged-429-video-stability. Videokoden och slutbildskoden är oförändrade.
- Två ytterligare äldre tester fallerar identiskt även i den oförändrade basen 144.366: `test-v144-164-explicit-calendar-campaign-scope.mjs` låser en historisk hash för Social Channels; `test-v144-196-home-plans-onboarding-preview.mjs` kräver den borttagna CSS-/markupmarkören `spreelo196-planned`. Dessa basfel ändras eller maskeras inte i denna rättning.

Webbläsartesterna använder endast lokala testdata. Ingen kundkampanj aktiveras, ingen betald modell/video beställs och inget kundmeddelande skickas av verifieringen.
