# Spreelo v97 – exakt bakgrund och korrigerad Skapa din plan-layout

Denna version är byggd direkt från:

- `spreelo-app-main-94-svg-reference-master.zip`
- SHA-256: `38DE9D995C8F4DAB883F0B0105E2490F9EEAEC8B74B0F3E70624FC4E35CA550B`

## Ändringar

- Använder den riktiga bakgrundsbilden `spreelo-background.png` oförändrad.
- Bakgrundens SHA-256 är `73F8CF82BF172F57D5F8AC1B5EEB4392FA0055DF1B60AF1269277A17C1673E98`.
- Justerar glasytor, skuggor, kolumnbredder, ikoner och typografi mot referensbilden.
- Vid referensbredden 1099 px verifierades:
  - guideruta: `x 29`, `y 102`, `bredd 1041`, `höjd 161`
  - första inställningsraden: `x 29/363/711`, `bredd 321/335/359`, `y 329`
- Guidens befintliga utfällda/ihopfällda beteende är orört. Sparat användarläge fortsätter att styra.
- Responsiv layout för mindre skärmar är bevarad.

## Driftsättning

Ingen SQL behöver köras. Versionen ändrar endast frontendkod, CSS och bildresurser. Den ändrar inte OpenAI-modeller, API-logik, Supabase-tabeller eller produkt-/karusellogik.
