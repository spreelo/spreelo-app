# Spreelo v144.334 – säkrare kreativ Kling-regi utan svagare produktlås

**Bas:** `spreelo-144.333-kling-prompt-on-ai-control-clarity.zip` (komplett ZIP). Denna version ersätter INTE tidigare 332/333-funktioner.

## Förbättringar

1. Bevarar `getKlingProviderSafetyPrefix` oförändrad: samtliga detaljerade HARD PRODUCT, SURFACE PRINT, LIGHT AND EFFECT, FUNCTION och SCENE CONTINUITY-lås finns kvar, inklusive förbud mot påhittade LED-lampor, blått sken, lysande logotyper, material-/formändringar och okända vinklar.
2. Tar bort den kreativa AI-regissörens tidigare uppmaning att visa "naturlig fysisk användning" av produkten när bilden ansågs tillräckligt komplett. Ett synligt föremål innebär inte att en funktion är verifierad.
3. Prioriterar produktens statiska referensbild genom hela videon. Energi och rörelse ska komma från kameran och verklighetstrogen aktivitet i scenen. För kläder tillåts redan verifierat bärande utan ändring av synlig design eller orientering.
4. Förtydligar att en kreativ idé som krockar med produktreglerna ska ersättas med en kamerarörelse eller bakgrundshändelse, inte lösas genom att manipulera produkten.
5. Förbättrar manuella Kling-omkörningar med samma prioritering även när en äldre kreativ prompt återanvänds.
6. Begränsar enbart dynamiska produktnamn och varumärkestexter i engagement-videor för att minska risken att mycket långa metadata tränger ut den kreativa prompten.

## Fortfarande samma

- Den befintliga promptbyggaren från 333: säker maxlängd 2 450 tecken, kompletta meningar, reservregi vid för lång kreativ text.
- Produktskydd, Kling-API, Shotstack, bildmotor, publicering, krediter och AI Control Center är i övrigt oförändrade.
- Kling är fortsatt ensam registrerad videoleverantör; Wan, Runway och Grok är inte tillagda.
- Inga nya externa AI-kontroller eller extra betalda genereringar introduceras.

## Installation

- Ta backup, driftsätt denna **kompletta** ZIP i stället för 333.
- **Ingen ny SQL krävs för 334.** Vid fristående installation gäller fortfarande eventuella tidigare 331/332-databasuppdateringar.
- Lokala regressionstester:
  - `node scripts/test-v144-329-kling-prompt-integrity.mjs`
  - `node scripts/test-v144-334-kling-creative-protection.mjs`
  - `node scripts/test-v144-329-ai-model-intelligence.mjs`
  - `node scripts/test-v144-330-ai-control-stabilization.mjs`
  - `node scripts/test-v144-331-ai-background-switch.mjs`
  - `node scripts/test-v144-332-ai-control-clarity.mjs`

## Avgränsning

Dessa ändringar gör instruktionerna mer konsekventa, men garanterar inte att Kling alltid bevarar alla produktpixlar i en generativ video. En faktisk Sony-/barnvagnskörning återstår att testa med riktiga modellresultat.
