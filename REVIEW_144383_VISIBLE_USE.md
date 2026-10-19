# 144.383 – naturlig användning med bibehållen produktvinkel

Utifrån main 308c7ac (144.382). Driftsättning godkänd av användaren 2026-10-19. Ingen SQL.

## Ändring
- Befintlig produktanalys får beskriva vanlig rak bärarrörelse utifrån ett synligt bärande handtag/stöd. Ingen ny analys eller kategoriuppdelning. Okända fästen och passform får inte antas.
- Manusplaneraren prioriterar en befintlig evidensstödd handling framför stillastående presentation. Samma kontakt, produktvinkel och rörelse ska finnas i öppningsbilden och behållas till sista sekunden.
- För fasta/okända produkter kompileras Kling-rörelsen nu från det verifierade handlingsvalet och kameravalet. Fri strategiprosa skickas fortfarande till öppningsbildens scenplanering men styr inte längre den fasta produktens rörelse direkt i Kling. Den kortare instruktionen bevarar hela handlingen inom leverantörsbudgeten i testfallen, i stället för att en lång beskrivning leder till den befintliga generella kamerafallbacken.
- Kontinuerlig relativ vinkel, oförändrat grepp, samma komponentantal och inga påhittade delar uttrycks i den faktiska exekveringsinstruktionen.
- Saknas stöd för användning behålls befintlig sanningsenlig presentation; ingen ny felspärr eller ytterligare modellgranskning.

## Bevarat
Klädernas geometriprompt och providerlås är byte-identiska med tidigare fixture. Renderad gånginstruktion jämförs byte för byte med main 144.382 för locked och follow_same_view. Text, slutbild, logga, rendering, produkturval och retryflöden ändras inte. Inget separat produktlager.

## Verifiering
10 testscripts: 383 visible-use, 382 source-view-staging, 378 product-motion, 379 instruction-recovery, kling-story-before-frame, kling-planning-review-regression, 370 story-length, 366 direct-execution, video-failure-reliability, 373 creative-production. Det nya testet använder verkliga routefunktioner med mockade planerings-/bildanrop, verifierar bevarad verified_use/carry/follow_same_view, kompletta instruktioner under 2450 tecken, långa strategier och inga tillagda anrop/granskare. Syntax, git diff --check och npm run build kontrolleras före publicering med offlineplatshållare för tjänstenycklar.

## Begränsning och provkörning
Ingen betald AI-generering har körts. Kodtesterna bevisar vad vi skickar, inte att Kling återger varje detalj korrekt. Promptändringar kan inte garantera pixelidentitet eller noll hallucinationer. Provkör en produkt med synligt handtag, en stel buren produkt och en tidigare fungerande klädprodukt. Jämför original, öppningsbild och film vid start/mitt/slut; kontrollera samma synliga sidor och delar, nyttig naturlig rörelse och ingen vridning vid slutposen. Bekräfta i loggen att rörelsevalet behålls utan instruction_length_corrected_to_provider_budget.
