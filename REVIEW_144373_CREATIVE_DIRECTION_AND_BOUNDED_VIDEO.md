# Spreelo 144.373 – lokal granskning inför eventuell driftsättning

Utgångspunkt: `origin/main` på `171398be4ae69a5c039b6166ac04eba63a5519f0` (144.372). Separat arbetsgren `fix/144373-creative-direction`. Ingen push, ändring av main eller driftsättning har utförts.

## Varför ändringen behövs

Körningen för post `d83fd2a0-1843-4f24-964a-650507beb63f` fick timeout i reklamplaneringen och använde reservrubriken i både film och slutbild. Den tidigare slutbildsinstruktionen prioriterade miljö utan produkt. Produktletningen gick vidare till bred research trots 250 kollektionskandidater, och ett normalt pågående Shotstack-jobb fick fem minuters paus före nästa kontroll. Loggen bekräftar slutlig leverans 2026-10-18 15:19:42 UTC.

## Valda ändringar

- Gemensam kreativ arbetsgång för video och animation: verifierad produkt/företag/målgrupp → filmobservation → en reklamidé → exakta rubriker och köpuppmaning → typsnitt, radbrytning, färger och komposition. Inga inbyggda slogans eller produktkategorimallar. Rörlig rubrik och avslut får olika roller inom samma idé.
- När originalproduktbilden finns används den ensam som identitetsreferens i ett bildredigeringsanrop. Slutbildens produkt, bakgrund och typografi skapas tillsammans. Filmrutorna används av planeraren men skickas inte som alternativa produktidentiteter till slutbildsgeneratorn. Ingen separat produkt-overlay på slutbilden. Original-loggan ligger kvar en gång i hörnet.
- Native 864×1536 och helbildspassning från .372 behålls; färdig textbild beskärs inte. Slutbilden visas i fyra sekunder i både video och animation; båda renderarnas tidigare tidsbegränsningar har uppdaterats.
- Dubblerade långa designmanualer har tagits bort ur Kling-planeringsprompten och den gemensamma instruktionen har koncentrerats. Samma konfigurerbara `editorial_headline`-modell och medium-resonemang behålls. Inga ytterligare kreativa granskningsanrop eller adminspärrar har lagts till.
- Kling-planering har 60 sekunders tidsgräns per textanrop och sammanlagt högst två anrop, inklusive den redan befintliga korrigeringen av produktnamnsrubriker. Ett första övergående avbrott sparas och återupptas tidigast efter 30 sekunder, i nästa ordinarie cronpass. Kling-källan återanvänds. En lyckad .373-plan återanvänds. Efter förbrukad budget används levererbar reservplan med verifierat produktunderlag och sparad verklig felorsak. Detta är återhämtning, inte en kvalitetsgrind.
- För animation finns en textåterhämtning inom högst 60 sekunders total anropsbudget: ordinarie 40 sekunder och högst 20 sekunder för ett övergående återförsök. Autentiseringsfel och identifierad förbrukad kvot skickas inte om automatiskt. Bildanrop får fortfarande inga SDK-återförsök.
- Textplanering har status `planning`; status `generating` för bild sätts först vid bildbeställningen. En avbruten textplanering ska inte förväxlas med en redan beställd bild med okänt utfall.
- Aktuella lämpliga katalogprodukter bedöms före första urvalet. Kollektionsposter utan lagerfält behålls som **kandidater**, inte som lagergodkända produkter. Exakt produktlåsning följs av samma befintliga lager- och kampanjkrav. Alternativ prövas inom högst sex produktlåsningsförsök och en 30-sekunders budget för att starta ytterligare försök. Ett redan pågående låsningsanrop avbryts inte av den mjuka budgeten. Ej produktstyrda flöden behåller sin tidigare tolvmöjlighetsgräns. Verklig HTTP 429 lämnar direkt denna slinga till befintlig cooldown-policy.
- Normalt pågående Shotstack-render kontrolleras tidigast efter 30 sekunder, i praktiken nästa minutpass. Den tidigare allmänna femminutersbackoffen gäller fortfarande verkliga efterbearbetningsfel. Samma betalda render-ID används.
- En fristående webbadress används inte längre som underrubrik över filmen.

## Bevarat och avstått

Kling-generering, produktidentitetskrav, verklig lagerkontroll, vald kollektion, kampanjkrav, nyligen använda produkter, betalda källor/render-ID, hörnlogga, normal kund/admin-routing och språkcache behålls. HTTP 429-policy är oförändrad: fungerande webbplatser får cooldown; ingen historik innebär befintlig permanent spärr.

Ingen ny bildgenerering avsiktligt lagd ovanpå den tidigare slutbildsbeställningen. Inga nya kvalitetsdomare, inga betalda liveprov, inga cronanrop, inga skickade mejl och inga SQL-migreringar. Ingen modelländring eller sänkning av reasoning för att pressa hastigheten.

## Verifiering

Regressionerna körs utan leverantörskrediter med fixtures och mockade nätverksanrop. Det nya .373-testet kör verklig bildpipeline, verklig textplanerare, köfortsättningshjälpare och den faktiska kataloggrenen med kontrollerat underlag. Det verifierar produktreferens utan film-person, ett bildanrop, två försök som övre textbudget, sparad timeoutorsak, fortsättning på samma render-ID, nästa kontrolltid, 250 bevarade kollektionskandidater inklusive okänd lagerstatus, avslag efter produktlåsning, nästa kandidat vid trasig sida, max sex försök och omedelbar 429-utgång. Äldre bildkant-, färg-, språk-, rörelse-, produkt- och kötester behålls.

Äldre tests VM-harnesser har fått den nya hjälparimporten. Exakta promptsträngar och tidsassertioner har uppdaterats för den avsiktliga nya riktningen och fyra sekunders slutbild. Den tidigare produktnamnsrubrik-korrigeringen finns kvar; timeoutåterhämtningen testas i .373.

**Slutstatus: 27 av 27 relevanta regressionsskript godkända. Produktionsbygget (`npm run build` med offline-platshållare) godkänt. `git diff --check` godkänt.**

Godkända skript:

- `test-v144-372-native-master-and-copy-model.mjs`
- `test-v144-371-advertising-handoff.mjs`
- `test-v144-370-language-cache.mjs`
- `test-v144-370-story-length.mjs`
- `test-v144-369-product-relevant-closing.mjs`
- `test-v144-368-independent-closing.mjs`
- `test-v144-365-end-card-master.mjs`
- `test-v144-364-commercial-concept.mjs`
- `test-v144-363-designed-end-card.mjs`
- `test-v144-353-design-first-delivery.mjs`
- `test-v144-350-image-and-review.mjs`
- `test-v144-354-creative-delivery.mjs`
- `test-v144-350-contract-and-motion.mjs`
- `test-v144-312-animation-copy.mjs`
- `test-v144-366-kling-direct-execution.mjs`
- `test-v144-361-adaptive-layout.mjs`
- `test-v144-373-creative-production.mjs`
- `test-v144-355-collection-recovery.mjs`
- `test-v144-356-429-history-policy.mjs`
- `test-v144-155-complete-generation-cost-metering.mjs`
- `test-commercial-design-hierarchy.mjs`
- `test-kling-planning-review-regression.mjs`
- `test-kling-story-before-frame.mjs`
- `test-kling-opening-policy.mjs`
- `test-video-failure-reliability.mjs`
- `test-merged-429-video-stability.mjs`
- `test-product-engine-v2.mjs`

## Begränsningar

Offline-tester och produktionsbygge verifierar kodkontrakt och återhämtning, inte kreativ kvalitet hos nästa leverantörsresultat eller verkliga svarstider. Att bilden genererar produkten som del av helheten kan ge visuella avvikelser trots originalreferens; detta är användarens valda arbetssätt och ingen ny granskningsspärr har införts. Faktiska leverantörsavbrott, kvotbrist och 429-cooldown kan fortfarande ge väntan eller fel. Textåterförsök är begränsade men kan kosta ett extra textanrop när första svaret uteblir. Vid varaktigt bildfel finns befintlig designfallback kvar.

En gammal statisk kontroll, `test-v144-19-in-stock-first-product-selection.mjs`, misslyckas även på oförändrad 144.372: den kräver en gammal exakt kodsträng i stället för den befintliga `isProductConfirmedPurchasable`-hjälparen. Ingen lagerregel har försvagats för att få den att passera. Aktuella produkt- och kollektionstester används för denna ändring.
