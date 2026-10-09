# v144.332 – AI Control Center tydlighet och relevanta nyheter

Bygger på komplett v144.331. Inga ändringar i genereringsmotor, Kling-körningar, Shotstack, prompts, kreditlogik eller sparade modellval.

## Ändringar
- Nyhetsflödet hämtar nu OpenAI:s officiella nyhets-RSS i stället för generiska SDK-releaseflöden. En strikt rubrikbaserad filtrering begränsar nyheterna till modell-, API- och prishändelser. Kortfattad svenska och aldrig rå HTML.
- Gammalt SDK-brus ligger kvar i databasen för historik men visas inte i admin. Detta kräver ingen databasradering.
- 10 nyheter per sida, serverbaserad paginering i admin-API:t.
- Kling: `kling-v3` visas inte längre som ett separat nytt standardalternativ; redan sparat val visas fortfarande så att det inte ändras vid installation. Befintlig Kling-motor ändras inte.
- Tydligare märkning av aktiva, grundinställda, tekniskt verifierade respektive testkrävande modeller.
- Förklarar när prisjämförelser kan visas och varför bild/video ännu saknar jämförbara prisuppgifter.

## Installation
1. Ta databasbackup och behåll tidigare ZIP för återställning.
2. Deploya hela v144.332.
3. Om v331:s samlade SQL redan är installerad behövs **ingen ytterligare SQL**. För en ny installation använd `supabase/v144_332_INSTALL_AI_CONTROL_ALL.sql` som innehåller den befintliga kompletta v331-SQL:n oförändrad.
4. Huvudbrytaren för automatiska AI-jobb förblir av om du inte tidigare slagit på den. Slå inte på den av misstag.
5. Nyhetskällan byts vid nästa schemalagda nyhetskörning efter aktivering. `Synka` laddar endast om adminvyn; det startar inte bakgrundsjobben manuellt.

## Begränsningar
Detta är en lokal kodgranskning. Verkliga API-anrop, RSS-bevakning och mejl behöver verifieras i er driftmiljö. Nya upptäckta modellnamn valideras fortsatt av v328:s kapacitetstest innan de kan väljas. `kling-3.0` och `kling-v3` är inte bekräftat utbytbara identifierare för alla API-familjer; v332 döljer det osäkra dubbla valet, men ändrar inte produktionsintegrationen.
