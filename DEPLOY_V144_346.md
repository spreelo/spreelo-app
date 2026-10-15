# Spreelo v144.346 – filmisk rörelse med strikt verifierad produktidentitet

**Bas:** `spreelo-144.345-unique-ai-video-design.zip` (alla designförbättringar från 144.345 behålls).

## Förändringar

1. **Generell scenbaserad rörelseplanering.** Ingen tabell med produktkategorier. Källbildens verifierade ytor och förankrade fysiska handlingar styr vad som får röra sig. En professionell reklamfilm ska ha tydlig rörelse, inte bara en person som gungar på stället.
2. **Ny begränsad kamera- och scenregissör:** säker digital in-/utzoomning, följsam kameratracking ENDAST när en redan synlig och verifierad fysisk rörelse finns, mer naturliga steg/rörelser och begränsad rörelse hos personer som redan syns i bakgrunden. Ursprunglig vinkel mot produkten hålls konstant. Inga kameravarv, klipp, nya produktvinklar eller nya motiv/rekvisita.
3. **Friläggningsflaggan blockerar inte all fysisk rörelse.** En oberoende AI-förhandskontroll av den faktiskt genererade första bildrutan måste nu bekräfta att en bärare, person, kontaktpunkt eller stöd redan finns och att motsvarande handling stöds av den verifierade återförsäljarbilden. Vid osäkerhet väljs en säker 7 %-zoom i den befintliga bilden.
4. **Oförändrad hård produktlåsning:** den verkliga återförsäljarbilden styr produktens utseende och ytor. Samma antal och placering av kameror, knappar, sömmar, material, tryck, färger och komponenter. Utsidor och baksidor som saknas i referensen får aldrig exponeras eller fyllas i. Befintliga reglage för kostnad och en enda betald Kling-generering är orörda.
5. **Ny kreativ rörelsegranskning av färdig Kling-video:** en film som är tekniskt korrekt men upplevs som nästan helt stillastående kan underkännas för **reklamkvalitet**, separat från produktidentitetsfel. Vid enbart för svag rörelse sparas den redan betalda filmen och ärendet går till granskning, inte automatisk statisk ersättningsanimation och aldrig automatiskt ny Kling-körning.
6. **Kompatibilitet:** gamla Kling-kvalitetscacheposter behålls (`KLING_QUALITY_VERSION=337`); ny rörelsekvalitetsregel aktiveras endast för framtida produktfilmer vars `motionPlan.version >= 346`. Inget befintligt godkänt klipp behandlas om. Kling-skydd, textdesign, slutkort, kreditregler, arbetskö och Firefox-lagringsfix från 144.344–345 är kvar.

## Begränsningar

- Utan en synlig person/bärare i den ursprungliga bildens styrkta produktinformation **och** en faktisk redan synlig person i första bildrutan får Spreelo inte generera en ny person som bär produkten för att skapa gångrörelse. Då väljs i stället säkrare kamerarörelse. Detta följer kravet att aldrig hitta på detaljer.
- AI kan fortfarande skapa felaktiga bilder. Kvalitetskontrollen granskar stickprov av bildrutor och ger **ingen absolut garanti** för att varje enskild ruta håller alla regler.
- Filmiska klipp med mer rörelse kommer inte alltid vara möjliga utan fler verifierade produktbilder. Sådana osäkra fall ska hanteras öppet och inte lösas genom att gissa osedda ytor.
- Planering + preflight använder befintliga AI-anrop. Fler underkända reklamklipp kan öka behovet av manuell eftergranskning. Inga nya Kling-submissioner skapas vid underkännande.

## Installation och test

- **Ingen SQL och inga nya miljövariabler.** Ersätt projektet och behåll befintlig konfiguration.
- `npm run test:v144.346` testar kategorifri scenplanering, följsam kamera, invändningsspärrar, förhandsgranskning, exakta Kling-prompter och kvalitetsskiljning.
- Kör även tidigare tester: `node scripts/test-v144-329-kling-prompt-integrity.mjs`, `node scripts/test-v144-337-video-intelligence.mjs`, `node scripts/test-v144-341-bounded-kling-motion.mjs`, `npm run test:v144.345`.
- **Testa i staging med verkliga Kling-anrop före produktionssläpp.** Rekommenderade fall: person med verifierat plagg och redan synlig bärare; teknikprodukt med endast framsida; flera separata objekt i samma bild; produktförpackning med tryckta avbildningar. Kontrollera faktisk MP4, framför allt kamerans vinkel, motivrörelse och sparade preflight-/kvalitetsbeslut.
- Lokalt körda tester ersätter inte end-to-end-build, uppkopplade leverantörstester eller visuell granskning av de färdiga klippen.
