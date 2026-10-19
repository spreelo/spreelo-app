# Spreelo 144.380 – tydligare orientering i öppningsbilden

Bas: driftsatt 144.379, commit 354bcf4340a75a619aba0ffa9e6302fd8c0e3861.

Endast produktionsändring: ett texttillägg i klingProductGeometryInstruction, som redan används i öppningsbildens befintliga bildanrop. Tidigare instruktioner behålls ordagrant.

Tillägget kräver att originalets förhållande mellan fram-/ovan-/undersida, reglage, skärm, öppningar och infästningar bevaras. Produkten får inte spegelvändas, vändas upp och ned, monteras bakvänt eller få omvänd funktionell orientering. Person, kroppsdel, underlag och kamera ska anpassas efter produkten. Om en avsedd användning kräver obekräftad vy/passform väljs en annan presentation med originalets synliga ytor. Naturlig gång, bärande av kläder och tygrörelse tillåts uttryckligen fortsatt.

Inga nya kontroller, stoppregler, AI-anrop, retries eller databasändringar. Kling-promptens befintliga längdbudget påverkas inte: tillägget hör till bildanropet. Ingen ändring av rörelseval, manusrättning, produkturval, rubriker, slutbild, logga eller musik. Ingen SQL krävs.

## Verifiering

11 regressionstester godkända: 144.379 instruktioners återhämtning, 144.378 produktbaserad rörelse, story-before-frame, planning-review-regression, 144.366 direct-execution, 144.370 story-length, 144.350 contract-and-motion, video-failure-reliability, merged-429-video-stability, 144.377 logo-position och 144.376 suno-music-integration.

Separat direkt jämförelse med 144.379 för samtliga tre materialprofiler: kodgenererade rörelseinstruktioner och automatiska manusrättningar är identiska; tidigare geometriprompt är bevarad som prefix. Next.js produktionsbygge godkänt med offline-testvärden. Syntaxkontroll och git diff --check godkända.

Ingen betald testgenerering, live-cron, push eller driftsättning har gjorts. En prompt kan minska risken men garanterar inte modellens visuella följsamhet. Nästa riktiga provfilm behövs för bedömning av produktens orientering och videons kvalitet.
