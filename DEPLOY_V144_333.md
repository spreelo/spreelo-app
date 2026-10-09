# Spreelo v144.333 – Kling prompts + AI Control Clarity

**Bas:** kompletta `spreelo-144.332-ai-control-clarity` (den senast uppladdade varianten av 332), inte den äldre 332 Kling-grenen.

## Ändringar
- Rättar automatisk Kling-produktprompt, deterministisk reservprompt, konceptvideo och manuell Kling-omkörning: alla byggs med `assembleKlingPrompt` och behåller fullständiga meningar inom 2450 tecken.
- Förbjuder uttryckligen påhittade LED-indikatorer, upplysta logotyper, sken, skärmar och andra nya produktfunktioner; videon ska prioritera rörelse i miljön/kameran.
- Den kreativa AI-direktören ombeds hålla sin beskrivning kort och ge produkten företräde framför spektakulära interaktioner.
- Kling-transport stoppar för långa promptar före betalt API-anrop i stället för att tyst skära av dem.
- Wan/Runway har inte lagts till som videoval eller fallback.

## Oförändrat
- Allt från 332 AI Control Clarity: nyhetsfiltrering, paginering, tydligare modellval och befintlig bakgrundsbrytare.
- Shotstack, produktmotor, databasschema, kreditlogik och AI-modellval.

## Installation
- Ta backup och driftsätt denna kompletta ZIP, inte någon av de två tidigare 332-filerna.
- **Ingen ny SQL för Kling-fixen.** Om du redan installerat 331/332:s SQL behövs ingen SQL-körning. Vid ny installation följ `README_V144_332.md` (den inkluderade `supabase/v144_332_INSTALL_AI_CONTROL_ALL.sql`).
- Denna lokala fix kan inte garantera att en generativ videomodell aldrig hittar på detaljer. Verifiera med en riktig testkörning och kontrollera sparad `kling_prompt`.
