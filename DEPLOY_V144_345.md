# Spreelo v144.345 – unik GPT-image-design och kontroll av färdig reklamvideo

Bas: **spreelo-144.344-persistent-login-storage(1).zip**. Ingen ändring av säkerhetsreglerna för Kling 341, produktidentitetskontrollen, motion-plan, kreditregler eller webbläsar-/inloggningsfixen i 344. Befintligt GPT-image-steg för transparent grafik är kvar.

## Vad som ändrats

1. **Individuell design, ingen typografimall.** Kreativ riktning för varje produkt och verklig scen förstärks; atlasens båda textgrupper och slutkort bygger på produkten, varumärket och kameramaterialet. Inga generiska extra linjer, fiktiva loggor eller oavsiktliga accenter tillåts. Produkt- och kampanjfakta behåller tidigare sanningskrav.
2. **Mer plats åt texten i animation.** Layout anpassas efter den verifierade produktens proportioner och reserverar mer negativ yta. I stället för att förminska konstverket till 86 % bredd/78 % höjd används nu upp till 96 %/94 % av den större säkra textrutan. Kontrollerar att rubriken efter skalning inte är för liten.
3. **End-card-designen bevaras.** Atlasens visuella bakgrund återges utan generell stor suddig mittplatta; CTA får upp till 930 × 460 pixlar i den renderade 1080 × 1920-slutbilden. Synliga rader centreras fortfarande individuellt; uppladdad original-logga visas i hörnlagret i både film och slutkort. Ingen ny mittlogga.
4. **Skydd av konstverket.** Ny `preserveDesign`-väg hindrar Spreelo från att färga om GPT-image-grafiken till ett standardmässigt helsvart/vitt textblock. Vid dålig scenkontrast underkänns designen i stället. Äldre användning av kontrastmodulen påverkas inte.
5. **Bildrutegranskning före render.** En separat vision-granskning får flera färdigt sammansatta produkt-/textbildrutor och slutkortet. Den bedömer läsbarhet i mobil, textens storlek/hierarki, produktöverlapp, artefakter och CTA:ns balans. Animationen får ett redan befintligt begränsat korrigeringsförsök om den underkänns. Endast typografiken omgenereras, inte Kling-video.
6. **Kontroll av faktisk renderad MP4.** Renderade Shotstack-klipp kontrolleras mot fyra bildrutor, inklusive slutkortet, innan leverans. Om kvalitetskontrollen inte kan godkänna klippet spärras leverans och render-ID sparas; en ny betalbar videokörning beställs inte automatiskt. Ytterligare handpåläggning/granskning kan därför behövas för underkända Kling-filmer. Godkänd render återanvänds.
7. **Exakt text för Kling.** Rubrik, eventuell underrad och CTA läses tillbaka från den faktiskt genererade GPT-image-atlasen och jämförs mot orden i kreativitetsplanen. Stavfel eller saknad text underkänns. Ingen lokal generisk SVG-ersättning används vid ett nytt fel; tidigare okända/avbrutna bildanrop återstartas inte automatiskt.

## Drift och risker

- **Ingen ny SQL eller miljövariabel.** Ersätt filerna och driftsätt som vanligt. Ändringarna gäller nya genereringar; existerande godkända videoresurser ritas inte om.
- **Ökade AI-kostnader och viss väntetid** från extra multimodal läsning/granskning och eventuella omgenereringar av bildgrafik. Det är inte gratis och ingen exakt kostnad garanteras. Ingen extra Kling-video beställs av dessa kontroller.
- Inlägg kan nu **stoppas för manuell åtgärd** när färdig video inte håller kvaliteten, även om ett dyrt renderjobb slutförts. Kontroll av bilder är ett automatiserat kvalitetsfilter, ingen absolut garanti för högsta estetiska kvalitet.
- Även om bedömningen sker på kompositionerna och färdiga MP4-bildrutor är den en stickprovsgranskning och kan missa korta artefakter mellan de kontrollerade bildrutorna.
- **Live-test i riktig Spreelo-miljö rekommenderas innan bred driftsättning.** Ingen faktisk leverantörsgenerering/Shotstack-rendering kördes här.

## Teststatus

- `node --check` passerade för samtliga ändrade JavaScript-filer.
- `npm run test:v144.345` passerade (geometrier, ordnade steg, säkerhetsspärrar och bevarad Kling-kvalitetskontroll).
- Full 342–344 regressionssvit/Next-projektbygge kunde inte köras i arbetsmiljön eftersom zippen saknar installerade npm-beroenden och försök att installera dem inte lyckades. Fullständigt bygge och tester ska göras i er utvecklings-/stagingmiljö före produktion.

## Rekommenderat efterarbete

Testa minst: (a) gaming med två texthierarkier, (b) ren inredningsscen, (c) kläder/modell där texten inte får täcka personen, (d) iPhone 17 med tidigare kamerafelscenario. Kontrollera både MP4 och administratörens historik för spärrad kvalitetsgranskning. Bekräfta att renderfel aldrig drar igång ny Kling-generering.
