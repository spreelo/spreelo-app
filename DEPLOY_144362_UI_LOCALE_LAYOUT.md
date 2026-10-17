# Spreelo 144.362 — språkstart, datumval och kalenderetiketter

Status: lokal rättning för granskning. Bas: driftsatta 144.361 (`11c800e`). Ingen GitHub-publicering eller driftsättning ingår utan nytt godkännande.

## Bekräftade orsaker

- `useUiText` började med engelska och engelska källtexter vid varje montering. Först efter hydrering lästes språkvalet och den cachade översättningen. Sidomenyn använder vanliga länkar, vilket återupprepade starten vid sidbyten. Den begränsade cacherensningen bevarar språkval och autentisering; det är ett separat skydd mot full lokal lagring.
- Datumväljarens dialog låser bakgrundens rullning med `body.style.overflow = "hidden"`. Utan reserverad rullistsbredd ändrades layoutens tillgängliga bredd när dialogen öppnades och stängdes.
- Översättningsvalideringen betraktade alla korta versalord som språkligt neutrala. Därmed hoppades vanliga rubriker som `SCHEDULE`, `STRATEGY`, `DATE` och `TIME` över. Kalendern saknade också mappning för `awareness_theme` och `theme_day`; råa interna värden formaterades som engelsk gränssnittstext.

## Rättning

- Språkval återställs synkront före första klientmålningen i en gemensam kontext. Det steget läser bara webbläsarens inställning; det väntar inte på en serverförfrågan. Server och första klientrendering förblir lika. Därefter läses redan sparade översättningar direkt under renderingen, även när en sida monteras om eller språk byts.
- Ingen global laddningsmask, `inert`-spärr eller nätverksberoende väntan finns för översättningar. Sidans befintliga autentiseringskontroll är separat. Saknade texter får en lokal, icke-tom platshållare under första bakgrundshämtningen; sparade texter, resten av sidan och dess kontroller fortsätter fungera. Handlingskrävande fel/återförsök har läsbar reservtext direkt.
- Uppdateringar, fingerprintvalidering och kompletteringar sker i bakgrunden med befintlig single-flight och cachebudget. En 12-sekunders timeout begränsar enbart bakgrundsanropet. Vid ett verkligt översättningsavbrott finns den tidigare engelska reservtexten för saknade nycklar kvar och återförsök sker utan att täcka sidan. Detta är inte en garanti om färdiga översättningar när tjänsten är otillgänglig.
- Även asynkrona callbacks som skapades under uppstart läser det aktuella språkpaketet. Ett språkbyte i en annan flik kan inte skrivas över av flikens äldre `lang`-parameter.
- `scrollbar-gutter: stable` på dokumentroten behåller bredden vid scrollås. Datumlogik, datumgränser, fokusåterställning och mobil dialog behålls.
- Den generella versalregeln tas bort. Den uttryckliga listan för plattformar, varumärken och koder behålls. Serverns befintliga logik kan därmed reparera redan sparade engelska rubriker utan att kasta fungerande översättningar eller återställa språkpaket.
- De två observerade kalenderkoderna får översättningsnycklar. Okända interna typer visas med den generella översatta kampanjetiketten.

Språkrättningen kräver inga databasändringar, nya miljövariabler eller manuella cache-/inloggningsåterställningar. Authlagring och cachebudget är oförändrade. En separat, senare lokal ändring av startbildsgranskningen dokumenteras i `KLING_OPENING_REVIEW_CHANGE.md` och ingår också i den väntande uppdateringen.

## Verifiering

- Nytt valideringstest: vanliga versalord, bevarade varumärken/koder, reparation av tidigare engelsk rubrik, kalenderkoder och okända enumvärden.
- Nytt webbläsartest mot verkligt produktionsbygge med simulerade svar: kall svensk start, hårda sidbyten, kalenderetikett, geometri före/under/efter datumdialog, Escape/fokus, datumval, mobilvy, ett andra språk, återvalt språk, HTTP-fel och faktisk hängande HTTP-förfrågan. Även uttrycklig engelsk URL, inloggningssidans språkval och språkbyte från en annan flik kontrolleras. Vid både kall och varm cache måste sidan vara användbar före bakgrundstimeouten: testet kräver under 2,5 sekunder i den lokala fixturemiljön medan en riktig HTTP-förfrågan fortfarande hänger. Det är ett regressionstest, inte ett löfte om nätverkshastighet i produktion. Inga livekonton, modellköp eller kundmeddelanden används.
- Befintligt webbläsartest för full lokal lagring: inloggning, osparad handoff, sidbyte, leverantörsavbrott, återhämtning och uttrycklig utloggning.
- Befintliga offlinekontroller: 22 auth-/sessionsgrupper, 10 lagringsgrupper, synlig reservtext och 144.361:s layout-/videostatus-/larmtester.
- Next-produktionsbygge med testvärden samt `git diff --check`.
- Det äldre 144.163-testet faller på ett hårdkodat historiskt filfingeravtryck för Social Channels. Samma fel och samma filfingeravtryck är verifierade i en separat, ren 144.361-kopia. Den filen är inte ändrad av denna rättning; testet har inte skrivits om för att dölja felet.

Webbläsarkontrollerna använder Chromium. Användarens inspelning visar Firefox; en slutlig visuell Firefox-kontroll efter godkänd driftsättning återstår.
